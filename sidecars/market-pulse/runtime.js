/* Market Pulse 0.1.0-alpha.2 · derived from supplied SYNTH chart code. */
(function(global){
"use strict";
if(global.CAppMarketPulse?.protocol==='capp.market-library.v1'&&global.CAppMarketPulse.version==="0.1.0-alpha.2"){global.CAppMarketPulse.activateSelected();return;}
// Market Pulse: bounded market observations and provider adapters. No execution authority.
const SOL_MINT='So11111111111111111111111111111111111111112';
const DEFAULTS=Object.freeze({
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
function configurationIdentity(value){return JSON.stringify(value,(_key,item)=>plain(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);}
function normaliseConfig(input={}) {
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
function effectivePollMs(c) {
  // Reserve headroom for other requests. Choosing Custom does not upgrade a provider plan.
  return Math.max(c.rateMode==='conservative'?15000:1000,c.pollMs,Math.ceil(60000/Math.max(1,Math.floor(c.budgetPerMinute*.8))));
}
function retryTime(headers,now,fallback) {
  const retry=headers?.get?.('retry-after'),reset=headers?.get?.('x-ratelimit-reset');
  let until=now+fallback;
  if(retry){const n=Number(retry),t=Number.isFinite(n)?now+Math.max(0,n)*1000:Date.parse(retry);if(Number.isFinite(t))until=Math.max(until,t);}
  if(reset&&Number.isFinite(Number(reset)))until=Math.max(until,Number(reset)*1000+250);
  return until;
}

class CandleBook {
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

class MarketPulse {
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

// Adapted from supplied SYNTH static/js/03-charts.js: indexed candles, zoom,
// crosshair, SMA/EMA and canvas rendering. Instance-local and feed-independent.
const priceText=v=>Number.isFinite(v)?v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4}):'—';
const timeText=t=>new Date(t).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
function smaSeries(candles,period){const out=[];let sum=0;for(let i=0;i<candles.length;i++){sum+=candles[i].close;if(i>=period)sum-=candles[i-period].close;if(i>=period-1)out.push({...candles[i],price:sum/period});}return out;}
function emaSeries(candles,period){const out=[],k=2/(period+1);let ema=null;for(let i=0;i<candles.length;i++){ema=ema==null?candles[i].close:candles[i].close*k+ema*(1-k);if(i>=period-1)out.push({...candles[i],price:ema});}return out;}
function clampView(view,base){if(!view)return null;const total=Math.max(1,base.to-base.from),span=Math.min(total+12,Math.max(8,view.to-view.from));const from=Math.max(base.from-4,Math.min(base.to+8-span,view.from));return {from,to:from+span};}
function indexedLine(ctx,points,x,y,color,width=1.5){if(points.length<2)return;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(x(p.index),y(p.price)):ctx.moveTo(x(p.index),y(p.price)));ctx.stroke();}
class PulseChart {
  constructor(container){
    this.container=container;this.doc=container.ownerDocument;this.win=this.doc.defaultView;this.canvas=this.doc.createElement('canvas');this.canvas.tabIndex=0;this.canvas.setAttribute('role','img');this.canvas.setAttribute('aria-label','Market price chart. Use plus and minus to zoom, F to fit, L to follow the latest price.');
    this.canvas.style.cssText='width:100%;height:310px;display:block;touch-action:pan-y;outline-offset:-3px';container.append(this.canvas);
    this.tip=this.doc.createElement('div');this.tip.className='chart-tip';this.tip.hidden=true;container.append(this.tip);
    this.rows=[];this.config={};this.view=null;this.hover=null;this.drag=null;this.follow=true;this.events=[];
    const on=(type,fn,opts)=>{this.canvas.addEventListener(type,fn,opts);this.events.push([type,fn,opts]);};
    const point=e=>{const r=this.canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
    on('wheel',e=>{if(!this.map)return;e.preventDefault();const p=point(e);this.zoom(e.deltaY>0?1.22:.82,(p.x-this.map.pad.l)/this.map.plotW);},{passive:false});
    on('pointerdown',e=>{if(!this.map)return;const p=point(e);this.drag={x:p.x,view:{...this.map.view}};this.canvas.setPointerCapture?.(e.pointerId);this.follow=false;});
    on('pointermove',e=>{const p=point(e);this.hover=p;if(this.drag&&this.map){const dx=(p.x-this.drag.x)/this.map.plotW*(this.drag.view.to-this.drag.view.from);this.view=clampView({from:this.drag.view.from-dx,to:this.drag.view.to-dx},this.base);}this.draw();});
    on('pointerup',()=>this.drag=null);on('pointercancel',()=>this.drag=null);on('pointerleave',()=>{this.hover=null;this.tip.hidden=true;this.draw();});
    on('dblclick',()=>this.fit());on('keydown',e=>{if(e.key==='+'||e.key==='='){e.preventDefault();this.zoom(.8);}if(e.key==='-'){e.preventDefault();this.zoom(1.25);}if(e.key.toLowerCase()==='f')this.fit();if(e.key.toLowerCase()==='l')this.latest();});
    this.resize=()=>this.draw();if(this.win.ResizeObserver){this.observer=new this.win.ResizeObserver(this.resize);this.observer.observe(container);}else this.win.addEventListener('resize',this.resize);
  }
  update(rows,config={},levels=[]){this.rows=rows;this.config=config;this.levels=levels;this.draw();}
  fit(){this.view=null;this.follow=false;this.draw();}
  latest(){this.view=null;this.follow=true;this.draw();}
  zoom(factor,ratio=.5){if(!this.map)return;ratio=Math.max(0,Math.min(1,ratio));const v=this.map.view,span=(v.to-v.from)*factor,focus=v.from+(v.to-v.from)*ratio;this.view=clampView({from:focus-span*ratio,to:focus+span*(1-ratio)},this.base);this.follow=false;this.draw();}
  draw(){
    const rect=this.canvas.getBoundingClientRect();if(rect.width<1||rect.height<1)return;
    const dpr=Math.min(3,this.win.devicePixelRatio||1),w=rect.width,h=rect.height;
    this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);
    const ctx=this.canvas.getContext('2d');if(!ctx)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#fbfdf9';ctx.fillRect(0,0,w,h);
    if(!this.rows.length){ctx.fillStyle='#75847b';ctx.font='13px system-ui';ctx.textAlign='center';ctx.fillText('Your live chart builds as prices arrive.',w/2,h/2-5);ctx.font='11px system-ui';ctx.fillText('No invented history. Gaps stay visible.',w/2,h/2+19);this.tip.hidden=true;return;}
    const interval=this.rows[0].intervalMs,first=this.rows[0].time,rows=this.rows.map(r=>({...r,index:(r.time-first)/interval}));
    this.base={from:0,to:rows.at(-1).index};
    if(this.follow)this.view={from:Math.max(-2,this.base.to-80),to:Math.max(12,this.base.to+5)};
    else this.view=clampView(this.view,this.base);
    const view=this.view||{from:-2,to:Math.max(12,this.base.to+5)},visible=rows.filter(r=>r.index>=view.from-1&&r.index<=view.to+1);
    const prices=visible.flatMap(r=>[r.low,r.high]);if(!prices.length)return;
    let lo=Math.min(...prices),hi=Math.max(...prices),margin=Math.max((hi-lo)*.14,hi*.00015);lo-=margin;hi+=margin;
    const pad={l:w<500?12:22,r:76,t:20,b:33},hasVolume=this.config.showVolume&&visible.some(r=>r.volume!=null),volumeH=hasVolume?55:0;
    const bottom=h-pad.b-volumeH,plotW=Math.max(1,w-pad.l-pad.r),plotH=bottom-pad.t;
    const x=i=>pad.l+(i-view.from)/(view.to-view.from)*plotW,y=p=>pad.t+(hi-p)/(hi-lo)*plotH;
    this.map={pad,plotW,view,bottom};ctx.font='10px system-ui';ctx.lineWidth=1;
    for(let i=0;i<5;i++){const yy=pad.t+plotH*i/4;ctx.strokeStyle='#e3eae0';ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();ctx.fillStyle='#73816f';ctx.textAlign='left';ctx.fillText(priceText(hi-(hi-lo)*i/4),w-pad.r+9,yy+3);}
    const ticks=Math.max(2,Math.floor(plotW/125));ctx.textAlign='center';
    for(let i=0;i<=ticks;i++){const index=view.from+(view.to-view.from)*i/ticks,xx=x(index);ctx.fillStyle='#73816f';ctx.fillText(timeText(first+index*interval),xx,h-10);}
    ctx.save();ctx.beginPath();ctx.rect(pad.l,pad.t,plotW,plotH);ctx.clip();
    const width=Math.max(1,Math.min(14,plotW/(view.to-view.from)*.65)),type=this.config.chartType||'candles';
    if(type==='line'||type==='area'){
      if(type==='area'){
        const groups=[];for(const r of visible){if(!groups.length||r.index-groups.at(-1).at(-1).index>1)groups.push([]);groups.at(-1).push(r);}
        const gradient=ctx.createLinearGradient(0,pad.t,0,bottom);gradient.addColorStop(0,'#7caf8866');gradient.addColorStop(1,'#7caf8800');ctx.fillStyle=gradient;
        for(const group of groups){ctx.beginPath();group.forEach((r,i)=>i?ctx.lineTo(x(r.index),y(r.close)):ctx.moveTo(x(r.index),y(r.close)));ctx.lineTo(x(group.at(-1).index),bottom);ctx.lineTo(x(group[0].index),bottom);ctx.closePath();ctx.fill();}
      }
      // Break lines across intervals with no observations.
      ctx.strokeStyle='#2d7963';ctx.lineWidth=2;ctx.beginPath();visible.forEach((r,i)=>i&&r.index-visible[i-1].index<=1?ctx.lineTo(x(r.index),y(r.close)):ctx.moveTo(x(r.index),y(r.close)));ctx.stroke();
    }else for(const r of visible){const xx=x(r.index),up=r.close>=r.open;ctx.strokeStyle=up?'#318770':'#be6258';ctx.fillStyle=up?'#63a58a':'#d98a7d';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(xx,y(r.high));ctx.lineTo(xx,y(r.low));ctx.stroke();
      if(type==='ohlc'){ctx.beginPath();ctx.moveTo(xx-width/2,y(r.open));ctx.lineTo(xx,y(r.open));ctx.moveTo(xx,y(r.close));ctx.lineTo(xx+width/2,y(r.close));ctx.stroke();}
      else ctx.fillRect(xx-width/2,Math.min(y(r.open),y(r.close))-Number(r.open===r.close),width,Math.max(2,Math.abs(y(r.close)-y(r.open))));}
    if(this.config.showMA)indexedLine(ctx,smaSeries(rows,20),x,y,'#bb9334');
    if(this.config.showEMA)indexedLine(ctx,emaSeries(rows,50),x,y,'#6d83b9');
    for(const level of this.levels||[]){if(!Number.isFinite(level.price))continue;ctx.strokeStyle='#879268';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(pad.l,y(level.price));ctx.lineTo(w-pad.r,y(level.price));ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#63704b';ctx.textAlign='left';ctx.fillText(level.label||'Entry',pad.l+4,y(level.price)-5);}
    ctx.restore();
    if(hasVolume){const max=Math.max(1,...visible.map(r=>r.volume||0));for(const r of visible){if(r.volume==null)continue;ctx.fillStyle=r.close>=r.open?'#a8cdb8':'#e7b4a9';const bh=r.volume/max*(volumeH-12);ctx.fillRect(x(r.index)-width/2,h-pad.b-bh,width,bh);}}
    const last=rows.at(-1),lastY=Math.min(bottom,Math.max(pad.t,y(last.close)));ctx.setLineDash([4,4]);ctx.strokeStyle='#4c896b99';ctx.beginPath();ctx.moveTo(pad.l,lastY);ctx.lineTo(w-pad.r,lastY);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#214e3d';ctx.fillRect(w-pad.r+3,lastY-10,72,20);ctx.fillStyle='#f2f9dc';ctx.textAlign='center';ctx.fillText(priceText(last.close),w-pad.r+39,lastY+3);
    if(this.hover&&this.hover.x>=pad.l&&this.hover.x<=w-pad.r&&this.hover.y<=bottom){const target=view.from+(this.hover.x-pad.l)/plotW*(view.to-view.from);let nearest=visible[0];for(const row of visible)if(Math.abs(row.index-target)<Math.abs(nearest.index-target))nearest=row;
      ctx.strokeStyle='#748775';ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(x(nearest.index),pad.t);ctx.lineTo(x(nearest.index),bottom);ctx.moveTo(pad.l,this.hover.y);ctx.lineTo(w-pad.r,this.hover.y);ctx.stroke();ctx.setLineDash([]);
      this.tip.textContent=`${timeText(nearest.time)} · O ${priceText(nearest.open)}   H ${priceText(nearest.high)}   L ${priceText(nearest.low)}   C ${priceText(nearest.close)} · Volume ${nearest.volume==null?'unavailable':priceText(nearest.volume)}${nearest.samples==null?'':` · ${nearest.samples} sample${nearest.samples===1?'':'s'}`}`;this.tip.hidden=false;
    }else this.tip.hidden=true;
  }
  destroy(){this.observer?.disconnect();this.win.removeEventListener('resize',this.resize);for(const [t,f,o] of this.events)this.canvas.removeEventListener(t,f,o);this.canvas.remove();this.tip.remove();}
}

const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dollars=n=>Number.isFinite(n)?'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4}):'—';
const PANEL_CSS=`:host{display:block;min-width:0;color:#213c32;font:13px/1.55 system-ui,sans-serif}*{box-sizing:border-box}[hidden]{display:none!important}details{border:1px solid #dce5d3;border-radius:10px;background:#fcfdf9;overflow:hidden}summary{cursor:pointer;list-style:none}summary::-webkit-details-marker{display:none}.head{display:flex;align-items:center;gap:13px;min-height:54px;padding:10px 18px;background:#eff4e7}.head:focus-visible,button:focus-visible,select:focus-visible{outline:2px solid #368273;outline-offset:-2px}.mark{display:grid;place-items:center;width:29px;height:29px;background:#214e3d;color:#d7efab;border-radius:7px;font-size:18px}.title{font-size:10px;letter-spacing:1.7px;font-weight:700}.label{font-size:11px;color:#758466}.price{font-size:17px;font-variant-numeric:tabular-nums;margin-left:auto;white-space:nowrap}.change{font-size:11px}.state{font-size:10px;color:#687758}.chevron{font-size:16px;margin-left:5px;transition:transform .15s}details[open]>.head .chevron{transform:rotate(180deg)}.body{padding:15px 18px 12px}.toolbar{display:flex;flex-wrap:wrap;gap:7px;align-items:center;padding-bottom:12px}.toolbar .spacer{flex:1}.group{display:flex;gap:3px}.note{font-size:10px;color:#73816a}.statusline{display:flex;flex-wrap:wrap;gap:8px;align-items:center;border-top:1px solid #e3eadd;padding:9px 0 0;margin-top:6px}.statusline span:last-child{margin-left:auto}.positive{color:#287254}.negative{color:#ac5d4d}.chart{position:relative;min-width:0}.chart-tip{font:10px/1.6 ui-monospace,monospace;white-space:normal;min-height:30px;padding:7px 10px;background:#edf3e7;border-radius:5px;color:#3d5846;position:absolute;top:2px;left:10px;right:80px;pointer-events:none;box-shadow:0 2px 8px #173f3610}button,select,input,textarea{font:inherit;color:inherit;max-width:100%}button,select{border:1px solid #d6dfcd;border-radius:5px;background:#fff;padding:6px 10px;cursor:pointer;font-size:11px;min-height:32px}button[aria-pressed=true]{background:#214e3d;color:#edf6dd;border-color:#214e3d}button:disabled{opacity:.45;cursor:default}.settings{margin-top:12px;background:#f5f8ef}.settings>summary{font-size:11px;font-weight:600;padding:11px 14px}.settings form{padding:0 14px 14px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.wide{grid-column:1/-1}label{display:flex;flex-direction:column;font-size:11px;gap:5px;min-width:0}input,textarea{width:100%;padding:8px 10px;background:white;border:1px solid #d6dfcd;border-radius:5px}input[type=checkbox]{width:auto}label.check{flex-direction:row;align-items:center}small{font-size:10px;color:#748268}h4{font-size:11px;margin:15px 0 9px}.advanced{margin:13px 0;background:#fcfdf9}.advanced summary{font-size:11px;padding:10px}.advanced .grid{padding:0 12px 12px}.form-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:13px}.primary{background:#214e3d;color:white}.alert{font-size:11px;color:#9b5742;margin:8px 0;overflow-wrap:anywhere}.ohlc{font:10px/1.6 ui-monospace,monospace;color:#74806a}.json{height:110px;font:11px/1.6 ui-monospace,monospace;resize:vertical}.attribution{font-size:9px;color:#809073} @media(max-width:650px){.head{gap:8px;padding:10px 12px}.label,.head .state{display:none}.title{letter-spacing:1px}.price{font-size:15px}.body{padding:12px}.toolbar{gap:6px}.toolbar .spacer{display:none}.grid{grid-template-columns:1fr}.wide{grid-column:auto}.statusline span:last-child{margin-left:0}.chart-tip{right:12px}button,select{min-height:38px}}@media(prefers-reduced-motion:reduce){*{transition:none!important}}`;

function mountMarketPanel(container,api,{title='MARKET',levels=()=>[]}={}){
  const doc=container.ownerDocument,win=doc.defaultView,host=doc.createElement('section');host.dataset.cappMarketPulse='';container.append(host);
  const root=host.attachShadow({mode:'open'});root.innerHTML=`<style>${PANEL_CSS}</style><details class="dock"><summary class="head" aria-label="Expand market chart"><span class="mark" aria-hidden="true">⌁</span><span><span class="title">${escapeHtml(title)}</span><br><span class="label">15-second candles</span></span><strong class="price">—</strong><span class="change"></span><span class="state">Ready to connect</span><span class="chevron" aria-hidden="true">⌄</span></summary><div class="body"><div class="toolbar"><select class="symbol" aria-label="Chart instrument"></select><div class="group">${[[15000,'15s'],[60000,'1m'],[300000,'5m']].map(([ms,t])=>`<button type="button" data-interval="${ms}">${t}</button>`).join('')}</div><select class="chart-type" aria-label="Chart type"><option value="candles">Candles</option><option value="ohlc">OHLC bars</option><option value="line">Line</option><option value="area">Area</option></select><div class="spacer"></div><button type="button" data-view="zoom-out" aria-label="Zoom out">−</button><button type="button" data-view="zoom-in" aria-label="Zoom in">+</button><button type="button" data-view="latest">Latest</button><button type="button" data-view="fit">Fit</button><button type="button" class="pause">Pause</button></div><div class="chart"></div><div class="ohlc"></div><div class="statusline"><span class="note quality">Sampled OHLC · volume unavailable</span><span class="note timing"></span></div><p class="alert feed-error" role="status" hidden></p><details class="settings"><summary>Market settings</summary><form><div class="grid"><label>Source<select name="providerMode"><option value="jupiter">Jupiter prices</option><option value="http-candles">HTTP OHLCV provider</option><option value="manual">App-supplied feed</option></select></label><label>Candle interval<select name="candleMs"><option value="15000">15 seconds</option><option value="30000">30 seconds</option><option value="60000">1 minute</option><option value="300000">5 minutes</option></select></label><label class="wide">Jupiter API key<input name="apiKey" type="password" autocomplete="off" placeholder="Optional"><small class="key-note"></small></label><label class="check"><input name="showMA" type="checkbox">MA20</label><label class="check"><input name="showEMA" type="checkbox">EMA50</label><label class="check"><input name="showVolume" type="checkbox">Volume when supplied</label><label class="check"><input name="remember" type="checkbox">Remember on this device</label></div><details class="advanced"><summary>Advanced · providers, cadence & instruments</summary><div class="grid"><label>Rate profile<select name="rateMode"><option value="conservative">Conservative · 15s minimum</option><option value="custom">Custom / paid quota</option></select></label><label>Requested polling<select name="pollMs"><option value="15000">15 seconds</option><option value="5000">5 seconds</option><option value="2000">2 seconds</option><option value="1000">1 second</option><option value="30000">30 seconds</option><option value="60000">1 minute</option></select></label><label>Available requests / minute<input name="budgetPerMinute" type="number" min="1" max="6000"><small>20% headroom is retained. This setting does not upgrade your account.</small></label><label>Stale after · seconds<input name="staleSeconds" type="number" min="15" max="600"></label><label class="wide">HTTP candle provider URL<input name="adapterUrl" type="url" placeholder="https://your-provider.example/candles"></label><label class="wide">Adapter token<input name="adapterToken" type="password" autocomplete="off" placeholder="Optional · separate from the Jupiter key"></label><label class="wide">Instruments · JSON<textarea name="symbols" class="json" spellcheck="false"></textarea><small>Jupiter uses mint addresses as IDs. Up to 50 instruments share one request.</small></label></div></details><div class="form-actions"><button class="primary" type="submit">Apply settings</button><button type="button" class="export">Export JSON</button><button type="button" class="import">Import JSON</button><label class="check"><input name="clearKeys" type="checkbox">Clear current keys</label><input class="file" type="file" accept="application/json,.json" hidden></div><p class="alert config-result" role="status" hidden></p></form></details><div class="attribution">Market Pulse · chart adapted from SYNTH</div></div></details>`;
  const q=s=>root.querySelector(s),dock=q('.dock'),form=q('form'),chart=new PulseChart(q('.chart'));
  let release=null,selected=api.configuration().symbols[0].id,signature='',lastSnapshot=null;
  const updateForm=()=>{const c=api.configuration();for(const key of ['providerMode','candleMs','rateMode','pollMs','budgetPerMinute','adapterUrl']){const el=form.elements.namedItem(key);if(el.tagName==='SELECT'&&!Array.from(el.options).some(o=>o.value===String(c[key]))){const option=doc.createElement('option');option.value=String(c[key]);option.textContent=key.endsWith('Ms')?c[key]/1000+' seconds':String(c[key]);el.append(option);}el.value=c[key];}for(const key of ['showMA','showEMA','showVolume','remember'])form.elements.namedItem(key).checked=c[key];
    form.elements.namedItem('staleSeconds').value=c.staleAfterMs/1000;form.elements.namedItem('symbols').value=JSON.stringify(c.symbols,null,2);form.elements.namedItem('apiKey').value='';form.elements.namedItem('adapterToken').value='';form.elements.namedItem('clearKeys').checked=false;
    q('.key-note').textContent=c.apiKeyConfigured?'Key configured. Leave blank to keep it.':'Keyless access is available with a lower quota.';};
  function paint(snapshot){lastSnapshot=snapshot;const c=snapshot.config,s=snapshot.status,newSig=JSON.stringify(c.symbols);
    if(signature!==newSig){signature=newSig;if(!c.symbols.some(x=>x.id===selected))selected=c.symbols[0].id;q('.symbol').innerHTML=c.symbols.map(x=>`<option value="${escapeHtml(x.id)}">${escapeHtml(x.label)}</option>`).join('');q('.symbol').value=selected;}
    const mark=api.quote({id:selected}),available=mark.available;
    q('.price').textContent=available?dollars(mark.price):'—';q('.label').textContent=`${c.symbols.find(x=>x.id===selected)?.label} · ${c.candleMs/1000}s candles`;
    const pct=mark.priceChange24h;q('.change').textContent=available&&pct!=null?`${pct>=0?'+':''}${pct.toFixed(2)}%`:'';q('.change').className='change '+(pct>=0?'positive':'negative');
    q('.state').textContent=s.phase==='paused'?'Paused':s.phase==='backoff'?'Rate limited':s.phase==='authentication'?'Check key':available?(mark.stale?'Stale price':s.active?'Live samples':'Last observation'):s.active?'Connecting…':'Ready to connect';
    q('.pause').textContent=s.phase==='paused'?'Resume':'Pause';q('.chart-type').value=c.chartType;
    for(const b of root.querySelectorAll('[data-interval]'))b.setAttribute('aria-pressed',String(Number(b.dataset.interval)===c.candleMs));
    q('.feed-error').textContent=s.error||s.storageError||s.configurationNotice||'';q('.feed-error').hidden=!q('.feed-error').textContent;
    const rows=api.candles({id:selected}),last=rows.at(-1);q('.quality').textContent=(last?.quality==='provider'?'Provider OHLCV':'Sampled OHLC')+(rows.some(r=>r.volume!=null)?' · reported volume':' · volume unavailable');
    q('.timing').textContent=`${s.effectivePollMs/1000}s polling · ${rows.length} candles${available?` · observed ${Math.floor(mark.ageMs/1000)}s ago`:''}`;
    q('.ohlc').textContent=last?`O ${dollars(last.open)}   H ${dollars(last.high)}   L ${dollars(last.low)}   C ${dollars(last.close)}${last.samples==null?'':` · ${last.samples} sample${last.samples===1?'':'s'}`} · ${last.closed?'Closed interval':'Building'}`:'History begins with the first observation.';
    if(dock.open)chart.update(rows,c,levels(selected));
  }
  const unsubscribe=api.subscribe(paint);updateForm();
  dock.addEventListener('toggle',()=>{dock.querySelector('summary').setAttribute('aria-label',dock.open?'Collapse market chart':'Expand market chart');if(dock.open){release||=api.acquire('chart');paint(api.snapshot());}else{release?.();release=null;}});
  q('.symbol').addEventListener('change',()=>{selected=q('.symbol').value;chart.latest();paint(api.snapshot());});
  q('.chart-type').addEventListener('change',()=>api.configure({chartType:q('.chart-type').value}));
  for(const b of root.querySelectorAll('[data-interval]'))b.addEventListener('click',()=>{api.configure({candleMs:Number(b.dataset.interval)});chart.latest();updateForm();});
  for(const b of root.querySelectorAll('[data-view]'))b.addEventListener('click',()=>{const action=b.dataset.view;if(action==='fit')chart.fit();else if(action==='latest')chart.latest();else chart.zoom(action==='zoom-in' ? .8 : 1.25);});
  q('.pause').addEventListener('click',()=>api.status().phase==='paused'?api.resume():api.pause());
  const report=(text,error=true)=>{q('.config-result').textContent=text;q('.config-result').hidden=false;q('.config-result').style.color=error?'#9b5742':'#287254';};
  form.addEventListener('submit',e=>{e.preventDefault();try{const get=k=>form.elements.namedItem(k),patch={};for(const k of ['providerMode','rateMode','adapterUrl'])patch[k]=get(k).value.trim();for(const k of ['pollMs','candleMs','budgetPerMinute'])patch[k]=Number(get(k).value);for(const k of ['showMA','showEMA','showVolume','remember'])patch[k]=get(k).checked;
    patch.symbols=JSON.parse(get('symbols').value);patch.staleAfterMs=Number(get('staleSeconds').value)*1000;for(const k of ['apiKey','adapterToken'])if(get(k).value||get('clearKeys').checked)patch[k]=get(k).value.trim();
    api.configure(patch);updateForm();report('Saved. Effective polling: '+api.status().effectivePollMs/1000+' seconds.',false);
  }catch(error){report(error.message);}});
  q('.export').onclick=()=>{const url=win.URL.createObjectURL(new win.Blob([JSON.stringify(api.exportConfig(),null,2)],{type:'application/json'})),a=doc.createElement('a');a.href=url;a.download='market-pulse-config.json';a.click();win.setTimeout(()=>win.URL.revokeObjectURL(url),1000);report('Exported settings. Keys are omitted.',false);};
  q('.import').onclick=()=>q('.file').click();q('.file').onchange=async()=>{try{const file=q('.file').files[0];if(!file)return;if(file.size>20000)throw Error('Use a settings file under 20 KB.');api.importConfig(await file.text());updateForm();report('Settings imported.',false);}catch(error){report(error.message);}finally{q('.file').value='';}};
  // Update age labels even when offline; never send an extra network request here.
  const heartbeat=win.setInterval(()=>{if(lastSnapshot)paint(api.snapshot());},5000);
  return {element:host,root,openSettings(){dock.open=true;q('.settings').open=true;updateForm();},refresh(){paint(api.snapshot());},destroy(){release?.();unsubscribe();win.clearInterval(heartbeat);chart.destroy();host.remove();}};
}

const ID='uk.capp.sidecar.market-pulse',VERSION="0.1.0-alpha.2";
let binding=null,revision=0,activationError=null;
function selection(){
 const plan=global.__CAPP_EXECUTABLE_PLAN__||{},items=plan.library?.selected||[];
 if(!Array.isArray(items))throw Error('Invalid selected library.');
 const matches=items.filter(item=>item?.id===ID);
 if(matches.length>1)throw Error('Duplicate selected Market Pulse.');
 if(!matches.length)return null;
 const item=matches[0],scope=[plan.projectId||'app',plan.componentId||'main',plan.appId||plan.app?.appId||plan.app?.id||plan.app?.siteId||'app'];
 const source={protocol:'capp.market-selection.v1',version:VERSION,selectedVersion:item.version||null,config:normaliseConfig(item.config||{})};
 return {scope,source,identity:configurationIdentity([scope,source])};
}
function selected(){
 try{const current=selection();return current&&binding&&binding.identity===current.identity&&global.capp?.market?.pulse===binding.api&&!binding.api.dead?binding.api:null;}catch{return null;}
}
function close(api){
 if(!api)return;
 if(typeof api.destroy!=='function')throw Error('The existing feed cannot be stopped.');
 api.destroy();
 if(typeof api.status!=='function'||api.status().ready!==false)throw Error('The existing feed did not confirm it stopped.');
 if(global.capp?.market?.pulse===api)delete global.capp.market.pulse;
}
function publish(type,detail){global.dispatchEvent(new global.CustomEvent(type,{detail:{protocol:'capp.market-activation.v1',id:ID,...detail}}));}
function activateSelected(){
 try{
  const current=selection(),valid=selected();
  if(valid){activationError=null;return valid;}
  if(!current){
   if(binding){close(binding.api);binding=null;publish('capp:market-pulse-error',{code:'MARKET_NOT_SELECTED',message:'Market Pulse is not selected for this application.'});}
   return null;
  }
  // Stop the previous owner before installing a replacement. An arbitrary API
  // that cannot be stopped is unavailable, not an invitation for a second feed.
  const existing=global.capp?.market?.pulse;
  if(binding?.api&&binding.api!==existing)close(binding.api);
  close(existing);binding=null;
  let storage=null;try{storage=global.localStorage;}catch{}
  const api=new MarketPulse(current.source.config,{storage,document:global.document,fetch:global.fetch?.bind(global),setTimeout:global.setTimeout.bind(global),clearTimeout:global.clearTimeout.bind(global),storageKey:'capp.market-pulse.v1:'+encodeURIComponent(JSON.stringify(current.scope)),configurationSource:current.source});
  const authority=Object.freeze({protocol:'capp.market-owner.v1',mode:'selected',id:ID,version:VERSION,selectedVersion:current.source.selectedVersion,scope:Object.freeze(current.scope.slice()),revision:++revision});
  Object.defineProperty(api,'authority',{value:authority});
  global.capp=global.capp||{};global.capp.market=global.capp.market||{};global.capp.market.pulse=api;
  binding={api,identity:current.identity};activationError=null;
  publish('capp:market-pulse-ready',{authority});return api;
 }catch(error){
  try{close(binding?.api);if(global.capp?.market?.pulse)close(global.capp.market.pulse);}catch{}
  binding=null;activationError={code:'MARKET_SELECTION_UNAVAILABLE',message:'The selected Market Pulse could not start. Check its configuration and update the selected Sidecar.'};
  publish('capp:market-pulse-error',activationError);return null;
 }
}
const library=Object.freeze({protocol:'capp.market-library.v1',version:VERSION,create:(config,env)=>new MarketPulse(config,env),mount:mountMarketPanel,selected,activateSelected,activationStatus:()=>activationError?{...activationError}:null});
global.CAppMarketPulse=library;
activateSelected();
})(window);
