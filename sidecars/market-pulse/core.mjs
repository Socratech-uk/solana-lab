// Market Pulse: bounded market observations and provider adapters. No execution authority.
export const SOL_MINT='So11111111111111111111111111111111111111112';
export const DEFAULTS=Object.freeze({
  protocol:'capp.market-config.v1',providerMode:'jupiter',apiKey:'',adapterUrl:'',adapterToken:'',
  symbols:[{id:SOL_MINT,label:'SOL / USD'}],pollMs:15000,rateMode:'conservative',budgetPerMinute:30,
  candleMs:15000,chartType:'candles',historyLimit:2400,staleAfterMs:60000,requestTimeoutMs:10000,
  showVolume:true,showMA:false,showEMA:false,enabled:true,remember:true,extensions:{},
});
const copy=v=>JSON.parse(JSON.stringify(v));
const num=(v,min,max,name)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('Invalid '+name);return v;};
const integer=(v,min,max,name)=>{num(v,min,max,name);if(!Number.isInteger(v))throw Error('Invalid '+name);return v;};
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
const TOKENS=['apiKey','adapterToken'];
// Stable comparison is for exact configuration ownership, never a credential
// digest or an authorization primitive. Values stay inside the owning runtime.
export function configurationIdentity(value){return JSON.stringify(value,(_key,item)=>plain(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);}
export function normaliseConfig(input={}) {
  if(!plain(input))throw Error('Settings must be a JSON object.');
  const c={...copy(DEFAULTS),...input};
  for(const k of Object.keys(c))if(!Object.hasOwn(DEFAULTS,k))throw Error('Unknown setting '+k+'; use extensions for provider-specific metadata.');
  if(c.protocol!==DEFAULTS.protocol)throw Error('Unsupported market settings version.');
  if(!['jupiter','http-candles','manual'].includes(c.providerMode))throw Error('Choose a registered provider.');
  if(!['conservative','custom'].includes(c.rateMode))throw Error('Invalid rate mode.');
  if(!['candles','ohlc','line','area'].includes(c.chartType))throw Error('Unknown chart type.');
  integer(c.pollMs,1000,300000,'poll interval');integer(c.budgetPerMinute,1,6000,'request budget');
  integer(c.candleMs,1000,3600000,'candle interval');integer(c.historyLimit,100,10000,'history limit');
  integer(c.staleAfterMs,15000,600000,'stale interval');integer(c.requestTimeoutMs,1000,30000,'timeout');
  for(const key of ['showVolume','showMA','showEMA','enabled','remember'])if(typeof c[key]!=='boolean')throw Error('Invalid '+key);
  for(const key of TOKENS)if(typeof c[key]!=='string'||c[key].length>2048||/[\r\n]/.test(c[key]))throw Error('Invalid credential');
  if(typeof c.adapterUrl!=='string'||c.adapterUrl.length>2048)throw Error('Invalid adapter URL');
  if(c.adapterUrl){let u;try{u=new URL(c.adapterUrl);}catch{throw Error('Use an absolute HTTPS adapter URL.');}
    if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search)throw Error('Use HTTPS with a path, and place credentials in the adapter token field.');}
  if(c.providerMode==='http-candles'&&!c.adapterUrl)throw Error('Set the candle provider URL.');
  if(!Array.isArray(c.symbols)||!c.symbols.length||c.symbols.length>50)throw Error('Configure 1–50 instruments.');
  const ids=new Set();c.symbols=c.symbols.map(s=>{
    if(!plain(s)||typeof s.id!=='string'||!/^[A-Za-z0-9._:-]{1,96}$/.test(s.id)||ids.has(s.id)||typeof s.label!=='string'||!s.label.trim()||s.label.length>64)throw Error('Each instrument needs a unique ID and short label.');
    if(c.providerMode==='jupiter'&&!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.id))throw Error('Jupiter instruments need a Solana mint address.');
    ids.add(s.id);return {id:s.id,label:s.label.trim()};
  });
  if(!plain(c.extensions)||JSON.stringify(c.extensions).length>8192)throw Error('Extensions must be a small JSON object.');
  return copy(c);
}
export function effectivePollMs(c) {
  // Reserve headroom for other requests. Choosing Custom does not upgrade a provider plan.
  return Math.max(c.rateMode==='conservative'?15000:1000,c.pollMs,Math.ceil(60000/Math.max(1,Math.floor(c.budgetPerMinute*.8))));
}
export function retryTime(headers,now,fallback) {
  const retry=headers?.get?.('retry-after'),reset=headers?.get?.('x-ratelimit-reset');
  let until=now+fallback;
  if(retry){const n=Number(retry),t=Number.isFinite(n)?now+Math.max(0,n)*1000:Date.parse(retry);if(Number.isFinite(t))until=Math.max(until,t);}
  if(reset&&Number.isFinite(Number(reset)))until=Math.max(until,Number(reset)*1000+250);
  return until;
}

export class CandleBook {
  constructor(limit=2400){this.limit=limit;this.samples=[];this.bars=[];this.mark=null;}
  sample(raw,now,source) {
    const price=num(raw.price,Number.MIN_VALUE,1e15,'price');
    const time=integer(raw.observedAt,1,now+5000,'observation time');
    if(this.mark&&time<this.mark.observedAt)return false;
    const block=raw.blockId==null?null:integer(raw.blockId,0,Number.MAX_SAFE_INTEGER,'block ID');
    if(block!=null&&this.mark?.blockId!=null&&block<this.mark.blockId)return false;
    const sourceAt=raw.sourceAt==null?null:integer(raw.sourceAt,1,now+5000,'source time');
    if(sourceAt!=null&&this.mark?.sourceAt!=null&&sourceAt<this.mark.sourceAt)return false;
    const advance=(!this.mark||block!=null&&block!==this.mark.blockId||sourceAt!=null&&sourceAt!==this.mark.sourceAt||block==null&&sourceAt==null);
    this.mark={price,observedAt:time,sourceAt,sourceAdvancedAt:advance?time:this.mark.sourceAdvancedAt,blockId:block,source,quality:'sampled',priceChange24h:typeof raw.priceChange24h==='number'&&Number.isFinite(raw.priceChange24h)?raw.priceChange24h:null};
    const sample={time,price};
    if(this.samples.at(-1)?.time===time)this.samples[this.samples.length-1]=sample;else this.samples.push(sample);
    this.samples=this.samples.slice(-this.limit);return true;
  }
  candle(raw,now,source) {
    if(!plain(raw))throw Error('Invalid candle');
    const time=integer(raw.time,1,now+5000,'candle time'),intervalMs=integer(raw.intervalMs,1000,3600000,'source interval');
    if(time%intervalMs!==0)throw Error('Candle time must be aligned to its interval.');
    const row={time,intervalMs,open:num(raw.open,Number.MIN_VALUE,1e15,'open'),high:num(raw.high,Number.MIN_VALUE,1e15,'high'),low:num(raw.low,Number.MIN_VALUE,1e15,'low'),close:num(raw.close,Number.MIN_VALUE,1e15,'close'),volume:raw.volume==null?null:num(raw.volume,0,1e20,'volume'),quality:'provider',samples:null,source};
    if(row.high<Math.max(row.open,row.close)||row.low>Math.min(row.open,row.close)||row.low>row.high)throw Error('Invalid candle price range.');
    const i=this.bars.findIndex(x=>x.time===time&&x.intervalMs===intervalMs);
    if(i>=0)this.bars[i]=row;else this.bars.push(row);
    this.bars.sort((a,b)=>a.time-b.time);this.bars=this.bars.slice(-this.limit);
    return row;
  }
  candles(intervalMs,now,limit=600) {
    integer(intervalMs,1000,3600000,'chart interval');integer(limit,1,10000,'candle limit');
    const buckets=new Map();
    // Provider bars are snapshots: revisiting a candle replaces it, never sums it twice.
    const rows=this.bars.length?this.bars.filter(b=>b.intervalMs<=intervalMs&&intervalMs%b.intervalMs===0):this.samples.map(s=>({time:s.time,open:s.price,high:s.price,low:s.price,close:s.price,volume:null,quality:'sampled',samples:1}));
    for(const r of rows){const time=Math.floor(r.time/intervalMs)*intervalMs,p=buckets.get(time);
      if(!p)buckets.set(time,{...r,time,intervalMs,samples:r.samples??null});
      else{p.high=Math.max(p.high,r.high);p.low=Math.min(p.low,r.low);p.close=r.close;p.volume=p.volume==null||r.volume==null?null:p.volume+r.volume;p.samples=p.samples==null?null:p.samples+(r.samples||0);}}
    return [...buckets.values()].slice(-limit).map(r=>({...r,closed:r.time+intervalMs<=now}));
  }
}

export class MarketPulse {
  constructor(config={},env={}) {
    this.clock=env.now||(()=>Date.now());this.fetch=env.fetch||globalThis.fetch?.bind(globalThis);
    this.setTimer=env.setTimeout||globalThis.setTimeout.bind(globalThis);this.clearTimer=env.clearTimeout||globalThis.clearTimeout.bind(globalThis);
    this.storage=env.storage??null;this.key=env.storageKey||'capp.market-pulse.v1:default';this.listeners=new Set();this.consumers=new Set();this.books=new Map();
    this.timer=null;this.inflight=null;this.controller=null;this.epoch=0;this.nextAt=0;this.cooldownUntil=0;this.failures=0;this.hidden=false;this.dead=false;this.error=null;this.storageError=null;this.phase='idle';this.requests=0;this.authBlocked=false;
    this.configurationSource=env.configurationSource?copy(env.configurationSource):null;this.configurationNotice=null;this.pendingPriorState=null;
    this.config=normaliseConfig(config);this.load();this.paused=!this.config.enabled;
    this.document=env.document??globalThis.document??null;
    this.visibility=()=>this.setHidden(this.document.hidden);
    if(this.document){this.hidden=!!this.document.hidden;this.document.addEventListener('visibilitychange',this.visibility);}
  }
  fingerprint(c=this.config){return JSON.stringify([c.providerMode,c.adapterUrl,c.symbols.map(s=>s.id)]);}
  book(id){if(!this.config.symbols.some(s=>s.id===id))throw Error('Instrument is not configured.');if(!this.books.has(id))this.books.set(id,new CandleBook(this.config.historyLimit));return this.books.get(id);}
  load(){
    try{const raw=this.storage?.getItem(this.key);if(!raw)return;const saved=JSON.parse(raw);if(saved.protocol!=='capp.market-state.v1')throw Error();
      const sameSource=configurationIdentity(saved.configurationSource||null)===configurationIdentity(this.configurationSource);
      if(sameSource&&saved.config)this.config=normaliseConfig({...this.config,...saved.config});
      else if(!sameSource){
        // A legacy/fallback feed must not re-enable a newly selected disabled
        // provider. Keep the original bytes until they can be retained safely.
        this.pendingPriorState=raw;
        this.configurationNotice='Saved market settings belong to an earlier selection. This app’s selected settings are active; earlier settings are retained on this device. Review Market settings to make changes.';
      }
      if(saved.fingerprint!==this.fingerprint())return;
      if(!Array.isArray(saved.books)||saved.books.length>50)throw Error();
      for(const [id,data] of saved.books){if(!this.config.symbols.some(s=>s.id===id))continue;const b=this.book(id);
        if(!Array.isArray(data.samples)||!Array.isArray(data.bars)||data.samples.length>10000||data.bars.length>10000)throw Error();
        for(const s of data.samples.slice(-b.limit))b.sample({price:s.price,observedAt:s.time},this.clock(),'stored');
        for(const r of data.bars.slice(-b.limit))b.candle(r,this.clock(),r.source||'stored');
        // History survives reload, but a current mark requires a fresh provider response.
        b.mark=null;
      }
    }catch{this.books.clear();this.storageError='Saved market history could not be read. Current data will start a new history.';}
  }
  persist(){if(!this.storage)return;try{
    if(this.pendingPriorState){
      const base=this.key+':retained:'+Math.max(0,Math.floor(this.clock()));let retained=false;
      for(let i=0;i<100;i++){
        const key=base+':'+i,existing=this.storage.getItem(key);
        if(existing!=null&&existing!==this.pendingPriorState)continue;
        if(existing==null)this.storage.setItem(key,this.pendingPriorState);
        if(this.storage.getItem(key)!==this.pendingPriorState)throw Error('Previous settings were not retained.');
        retained=true;break;
      }
      if(!retained)throw Error('Previous settings could not be retained.');
      this.pendingPriorState=null;
    }
    if(!this.config.remember){this.storage.removeItem(this.key);return;}
    this.storage.setItem(this.key,JSON.stringify({protocol:'capp.market-state.v1',configurationSource:this.configurationSource,config:this.config,fingerprint:this.fingerprint(),books:[...this.books].map(([id,b])=>[id,{samples:b.samples,bars:b.bars}])}));
  }catch{this.storageError='Device storage is full or unavailable; this session still works.';}}
  configuration(){const c=copy(this.config);for(const k of TOKENS){c[k+'Configured']=!!c[k];delete c[k];}return c;}
  exportConfig(){const c=copy(this.config);for(const k of TOKENS)delete c[k];return c;}
  configure(patch){
    if(this.dead)throw Error('Market Sidecar is closed.');
    const candidate=normaliseConfig({...this.config,...patch});const changed=this.fingerprint(candidate)!==this.fingerprint();
    this.epoch++;this.controller?.abort();this.clearTimer(this.timer);this.timer=null;
    this.config=candidate;this.paused=!candidate.enabled;this.authBlocked=false;this.error=null;
    if(changed)this.books.clear();else for(const b of this.books.values()){b.limit=candidate.historyLimit;b.samples=b.samples.slice(-b.limit);b.bars=b.bars.slice(-b.limit);}
    this.persist();this.emit();this.schedule();return this.configuration();
  }
  importConfig(data){if(typeof data==='string'){if(data.length>20000)throw Error('Settings file is too large.');data=JSON.parse(data);}return this.configure(data);}
  status(){return {protocol:'capp.market-status.v1',ready:!this.dead,providerMode:this.config.providerMode,phase:this.paused?'paused':this.authBlocked?'authentication':this.hidden?'background':this.phase,
    active:this.active(),consumers:this.consumers.size,effectivePollMs:effectivePollMs(this.config),candleMs:this.config.candleMs,nextRequestAt:Math.max(this.nextAt,this.cooldownUntil),
    requests:this.requests,historySource:'local-observations',symbols:copy(this.config.symbols),error:this.error,storageError:this.storageError,configurationNotice:this.configurationNotice,quotes:this.config.symbols.map(s=>({id:s.id,...this.quote({id:s.id})}))};}
  quote({id=this.config.symbols[0].id}={}){
    const b=this.book(id),m=b.mark;if(!m)return {available:false,stale:true,asset:id};
    const ageMs=Math.max(0,this.clock()-Math.min(m.observedAt,m.sourceAt??m.sourceAdvancedAt));
    return {...copy(m),asset:id,available:true,ageMs,stale:ageMs>this.config.staleAfterMs};
  }
  candles({id=this.config.symbols[0].id,intervalMs=this.config.candleMs,limit=600}={}){return this.book(id).candles(intervalMs,this.clock(),limit);}
  snapshot(){return {status:this.status(),config:this.configuration()};}
  subscribe(fn){if(typeof fn!=='function')throw Error('Subscriber must be a function');this.listeners.add(fn);fn(this.snapshot());return ()=>this.listeners.delete(fn);}
  emit(){const s=this.snapshot();for(const f of this.listeners){try{f(s);}catch{/* One consumer cannot stop the feed. */}}}
  active(){return !this.dead&&!this.paused&&!this.hidden&&!this.authBlocked&&this.consumers.size>0&&this.config.providerMode!=='manual';}
  acquire(label='consumer'){const token=Symbol(label);this.consumers.add(token);this.schedule();this.emit();return ()=>{this.consumers.delete(token);if(!this.consumers.size){this.clearTimer(this.timer);this.timer=null;this.epoch++;this.controller?.abort();this.phase='idle';}this.emit();};}
  pause(){this.paused=true;this.config.enabled=false;this.epoch++;this.controller?.abort();this.clearTimer(this.timer);this.timer=null;this.phase='paused';this.persist();this.emit();}
  resume(){this.paused=false;this.config.enabled=true;this.authBlocked=false;this.persist();this.schedule();this.emit();}
  setHidden(hidden){this.hidden=!!hidden;if(hidden){this.epoch++;this.controller?.abort();this.clearTimer(this.timer);this.timer=null;}else this.schedule();this.emit();}
  schedule(){this.clearTimer(this.timer);this.timer=null;if(!this.active()||this.inflight)return;
    const delay=Math.max(0,this.nextAt-this.clock(),this.cooldownUntil-this.clock());
    this.timer=this.setTimer(()=>{this.timer=null;this.refresh().catch(()=>{});},Math.min(2147483647,delay));}
  async refresh(){
    if(this.dead||this.paused||this.hidden||this.authBlocked||this.config.providerMode==='manual')return this.status();
    if(this.inflight)return this.inflight;
    if(this.clock()<Math.max(this.nextAt,this.cooldownUntil)){this.schedule();return this.status();}
    // Publish the in-flight promise before notifying subscribers or calling a provider.
    const epoch=this.epoch;
    const task=Promise.resolve().then(()=>epoch===this.epoch&&!this.paused&&!this.hidden?this.request():this.status());this.inflight=task;
    try{return await task;}finally{this.inflight=null;this.schedule();}
  }
  async request(){
    const epoch=this.epoch,c=copy(this.config),start=this.clock();this.nextAt=start+effectivePollMs(c);this.requests++;this.phase='loading';this.emit();
    const controller=new AbortController();this.controller=controller;let timedOut=false;
    const timer=this.setTimer(()=>{timedOut=true;controller.abort();},c.requestTimeoutMs);
    try{
      const url=new URL(c.providerMode==='jupiter'?'https://api.jup.ag/price/v3':c.adapterUrl);url.searchParams.set('ids',c.symbols.map(s=>s.id).join(','));
      if(c.providerMode==='http-candles')url.searchParams.set('intervalMs',String(c.candleMs));
      const headers={Accept:'application/json'};if(c.providerMode==='jupiter'&&c.apiKey)headers['x-api-key']=c.apiKey;
      if(c.providerMode==='http-candles'&&c.adapterToken)headers.Authorization='Bearer '+c.adapterToken;
      const res=await this.fetch(url.href,{method:'GET',headers,signal:controller.signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',cache:'no-store'});
      if(epoch!==this.epoch)return this.status();
      if(res.status===429){this.failures++;this.cooldownUntil=retryTime(res.headers,this.clock(),Math.min(300000,15000*2**Math.min(this.failures-1,5)));this.phase='backoff';this.error='Provider rate limit reached. The feed will retry automatically.';return this.status();}
      if(res.status===401||res.status===403){this.authBlocked=true;this.phase='authentication';this.error='Provider rejected access. Check the key in Market settings, then resume.';return this.status();}
      if(!res.ok)throw Error('Provider returned HTTP '+res.status+'.');
      const length=Number(res.headers?.get?.('content-length')||0);if(length>1000000)throw Error('Provider response is too large.');
      const text=await res.text();if(text.length>1000000)throw Error('Provider response is too large.');const body=JSON.parse(text);
      if(epoch!==this.epoch)return this.status();
      const now=this.clock();let accepted=0;
      if(c.providerMode==='jupiter'){
        if(!plain(body))throw Error('Invalid Jupiter price response.');
        const staged=new Map();
        for(const s of c.symbols){const old=this.book(s.id),b=new CandleBook(old.limit);b.samples=copy(old.samples);b.mark=old.mark?copy(old.mark):null;staged.set(s.id,b);const r=body[s.id];if(!r){b.mark=null;continue;}
          if(b.sample({price:r.usdPrice,observedAt:now,blockId:r.blockId,priceChange24h:r.priceChange24h},now,'jupiter'))accepted++;}
        for(const [id,b] of staged)this.books.set(id,b);
      }else accepted=this.ingest(body,{internal:true});
      if(!accepted)throw Error('No current prices were returned for the selected instruments.');
      this.failures=0;this.error=null;this.phase='live';
      const rem=res.headers?.get?.('x-ratelimit-remaining');if(rem!==null&&rem!==undefined&&Number(rem)<=1)this.cooldownUntil=Math.max(this.cooldownUntil,retryTime(res.headers,now,effectivePollMs(c)));
      this.persist();return this.status();
    }catch(error){if(epoch!==this.epoch)return this.status();this.failures++;this.phase='error';
      const message=String(error?.message||'');this.error=timedOut?'Price request timed out. Retrying with backoff.':/^Provider returned HTTP \d+\.$/.test(message)?message:message.startsWith('No current prices')?message:'Price data could not be read. Check the connection or provider format.';
      this.cooldownUntil=Math.max(this.cooldownUntil,this.clock()+Math.min(300000,effectivePollMs(c)*2**Math.min(this.failures-1,4)));return this.status();
    }finally{this.clearTimer(timer);if(this.controller===controller)this.controller=null;this.emit();}
  }
  ingest(packet,{internal=false}={}) {
    if(!internal&&this.config.providerMode!=='manual')throw Error('Push data requires the manual provider.');
    if(!plain(packet)||packet.protocol!=='capp.market-feed.v1'||!Array.isArray(packet.instruments)||packet.instruments.length>50)throw Error('Invalid market feed packet.');
    let count=0;const now=this.clock(),staged=new Map();
    for(const item of packet.instruments){if(!plain(item)||staged.has(item.id))throw Error('Duplicate or invalid instrument.');const existing=this.book(item.id),b=new CandleBook(existing.limit);b.samples=copy(existing.samples);b.bars=copy(existing.bars);b.mark=existing.mark?copy(existing.mark):null;
      if(item.candles){if(!Array.isArray(item.candles)||item.candles.length>1000)throw Error('Too many provider candles.');
        const intervals=new Set(item.candles.map(r=>r.intervalMs));if(intervals.size>1)throw Error('Use one base interval per instrument.');
        if(item.candles.length&&b.bars.length&&b.bars[0].intervalMs!==item.candles[0].intervalMs)b.bars=[];
        for(const candle of item.candles)b.candle(candle,now,this.config.providerMode);}
      if(item.quote&&b.sample({price:item.quote.price,sourceAt:item.quote.time,observedAt:now,blockId:item.quote.blockId},now,this.config.providerMode))count++;
      staged.set(item.id,b);
    }
    for(const [id,b] of staged)this.books.set(id,b);
    if(!internal){this.phase='live';this.persist();this.emit();}return count;
  }
  destroy(){this.dead=true;this.epoch++;this.controller?.abort();this.clearTimer(this.timer);this.timer=null;this.document?.removeEventListener('visibilitychange',this.visibility);this.listeners.clear();this.consumers.clear();}
}
