import assert from 'node:assert/strict';
import {CandleBook,MarketPulse,SOL_MINT,normaliseConfig,effectivePollMs,retryTime} from '../sidecars/market-pulse/core.mjs';
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
function fixture(config={}){
 let now=1800000000000,serial=0;const timers=new Map(),calls=[],responses=[];
 const env={now:()=>now,setTimeout:(fn,ms)=>{const id=++serial;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),fetch:async(url,options)=>{calls.push({url,options});const r=responses.shift();return typeof r==='function'?r():r||new Response(JSON.stringify({[SOL_MINT]:{usdPrice:150,blockId:calls.length}}));}};
 const api=new MarketPulse({...config,remember:false},env);
 return {api,env,calls,responses,timers,setTime:n=>now=n,advance:ms=>now+=ms,now:()=>now};
}
await test('15-second default; explicit fast mode retains quota headroom',()=>{
 assert.equal(effectivePollMs(normaliseConfig()),15000);
 assert.equal(effectivePollMs(normaliseConfig({pollMs:1000})),15000);
 assert.equal(effectivePollMs(normaliseConfig({pollMs:1000,rateMode:'custom',budgetPerMinute:60})),1250);
 assert.equal(effectivePollMs(normaliseConfig({pollMs:1000,rateMode:'custom',budgetPerMinute:120})),1000);
 for(const c of [{pollMs:0},{providerMode:'mystery'},{pollMs:NaN},{adapterUrl:'https://host/path?token=x'},{symbols:[{id:'x',label:'X'}]},{unexpected:true}])assert.throws(()=>normaliseConfig(c));
 assert.deepEqual(normaliseConfig({extensions:{future:'metadata'}}).extensions,{future:'metadata'});
});
await test('observed OHLC aggregates exact buckets, preserves gaps and unknown volume',()=>{
 const b=new CandleBook();for(const [time,price] of [[30001,10],[33000,12],[35000,9],[44000,11],[61000,13]])b.sample({observedAt:time,price},90000,'test');
 const rows=b.candles(15000,90000);assert.equal(rows.length,2);assert.deepEqual([rows[0].open,rows[0].high,rows[0].low,rows[0].close],[10,12,9,11]);assert.equal(rows[0].samples,4);assert.equal(rows[0].volume,null);assert.equal(rows[1].time,60000);assert.ok(rows.every(r=>r.closed));
 assert.equal(b.sample({observedAt:32000,price:999},90000,'test'),false);assert.equal(b.mark.price,13);
});
await test('provider OHLCV replaces snapshots, resamples volume and rejects malformed bars',()=>{
 const b=new CandleBook(),row={time:30000,intervalMs:15000,open:10,high:12,low:9,close:11,volume:20};b.candle(row,90000,'provider');b.candle({...row,volume:25},90000,'provider');b.candle({...row,time:45000,open:11,close:12,volume:3},90000,'provider');
 const c=b.candles(30000,90000)[0];assert.equal(c.volume,28);assert.equal(c.close,12);assert.equal(b.candles(1000,90000).length,0);
 for(const patch of [{low:13},{close:20},{time:30001},{volume:-1},{open:0}])assert.throws(()=>b.candle({...row,...patch},90000,'provider'));
});
await test('shared consumers and reentrant subscriptions never create overlapping requests',async()=>{
 const f=fixture();let finish;f.responses.push(()=>new Promise(r=>finish=r));const a=f.api.acquire('chart'),b=f.api.acquire('app');let recursed=false;
 const unsub=f.api.subscribe(s=>{if(s.status.phase==='loading'&&!recursed){recursed=true;void f.api.refresh();}});
 const p=f.api.refresh(),q=f.api.refresh();await Promise.resolve();assert.equal(f.calls.length,1);finish(new Response(JSON.stringify({[SOL_MINT]:{usdPrice:150,blockId:1}})));await Promise.all([p,q]);assert.equal(f.api.status().consumers,2);a();assert.equal(f.api.active(),true);b();assert.equal(f.api.active(),false);assert.equal(f.timers.size,0);unsub();
});
await test('rate-limit deadlines survive refresh clicks, setting changes and pause/resume',async()=>{
 const f=fixture();f.responses.push(new Response('',{status:429,headers:{'retry-after':'60'}}));const release=f.api.acquire();await f.api.refresh();assert.equal(f.api.status().phase,'backoff');
 f.advance(15000);await f.api.refresh();f.api.configure({chartType:'line'});f.api.pause();f.api.resume();await f.api.refresh();assert.equal(f.calls.length,1);
 f.advance(45000);await f.api.refresh();assert.equal(f.calls.length,2);assert.equal(f.api.status().phase,'live');release();
 const headers=new Headers({'retry-after':new Date(1800000090000).toUTCString(),'x-ratelimit-reset':'1800000120'});assert.equal(retryTime(headers,1800000000000,15000),1800000120250);
});
await test('authentication failures stop automatic calls until settings or resume',async()=>{
 const f=fixture();f.responses.push(new Response('',{status:401}));await f.api.refresh();f.advance(60000);await f.api.refresh();assert.equal(f.calls.length,1);assert.equal(f.api.status().phase,'authentication');f.api.configure({apiKey:'replacement'});await f.api.refresh();assert.equal(f.calls.length,2);assert.equal(f.api.status().phase,'live');
});
await test('low remaining quota delays the next request until the provider window resets',async()=>{
 const f=fixture();f.responses.push(new Response(JSON.stringify({[SOL_MINT]:{usdPrice:150,blockId:1}}),{headers:{'x-ratelimit-remaining':'0','x-ratelimit-reset':String((f.now()+60000)/1000)}}));await f.api.refresh();f.advance(15000);await f.api.refresh();assert.equal(f.calls.length,1);assert.ok(f.api.status().nextRequestAt>f.now()+40000);
});
await test('background and immediate pause cancel queued requests',async()=>{
 const f=fixture();let p=f.api.refresh();f.api.pause();await p;assert.equal(f.calls.length,0);f.api.resume();f.api.setHidden(true);await f.api.refresh();assert.equal(f.calls.length,0);f.api.setHidden(false);await f.api.refresh();assert.equal(f.calls.length,1);
});
await test('a late response cannot overwrite configuration from a newer epoch',async()=>{
 const f=fixture();let finish;f.responses.push(()=>new Promise(r=>finish=r));const p=f.api.refresh();await Promise.resolve();f.api.configure({providerMode:'manual'});finish(new Response(JSON.stringify({[SOL_MINT]:{usdPrice:1000}})));await p;assert.equal(f.api.quote().available,false);
});
await test('cached block IDs become stale even when HTTP responses keep arriving',async()=>{
 const f=fixture();for(let i=0;i<3;i++){f.responses.push(new Response(JSON.stringify({[SOL_MINT]:{usdPrice:150,blockId:1}})));await f.api.refresh();f.advance(31000);}assert.equal(f.api.quote().stale,true);
});
await test('missing price is unavailable; stale chain responses cannot replace a newer mark',async()=>{
 const f=fixture();await f.api.refresh();f.advance(16000);f.responses.push(new Response(JSON.stringify({[SOL_MINT]:{usdPrice:1,blockId:0}})));await f.api.refresh();assert.equal(f.api.quote().price,150);f.advance(16000);f.responses.push(new Response('{}'));await f.api.refresh();assert.equal(f.api.quote().available,false);
});
await test('generic provider never receives Jupiter credentials; config/status exports redact tokens',async()=>{
 const f=fixture({providerMode:'http-candles',adapterUrl:'https://market.example/ohlcv',apiKey:'jup-secret',adapterToken:'adapter-secret'});
 f.responses.push(new Response(JSON.stringify({protocol:'capp.market-feed.v1',instruments:[{id:SOL_MINT,quote:{price:125,time:f.now()},candles:[]}]})));await f.api.refresh();assert.equal(f.calls[0].options.headers.Authorization,'Bearer adapter-secret');assert.equal(f.calls[0].options.headers['x-api-key'],undefined);assert.equal(f.api.quote().price,125);assert.equal(f.calls[0].options.redirect,'error');
 const exported=JSON.stringify([f.api.status(),f.api.configuration(),f.api.exportConfig()]);assert.ok(!exported.includes('jup-secret')&&!exported.includes('adapter-secret'));
});
await test('invalid multi-instrument push is atomic and duplicate IDs are rejected',()=>{
 const f=fixture({providerMode:'manual',symbols:[{id:'SOL',label:'SOL'},{id:'OTHER',label:'Other'}]});const packet={protocol:'capp.market-feed.v1',instruments:[{id:'SOL',quote:{price:150,time:f.now()}},{id:'OTHER',quote:{price:-1,time:f.now()}}]};assert.throws(()=>f.api.ingest(packet));assert.equal(f.api.quote({id:'SOL'}).available,false);assert.throws(()=>f.api.ingest({...packet,instruments:[packet.instruments[0],packet.instruments[0]]}));
});
await test('history persistence is scoped and never restores a live mark without a new read',async()=>{
 const store=new Map(),storage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},f=fixture();const a=new MarketPulse({apiKey:'client-key'},{...f.env,storage,storageKey:'project:A'});await a.refresh();const b=new MarketPulse({},{...f.env,storage,storageKey:'project:A'});assert.equal(b.candles().length,1);assert.equal(b.quote().available,false);assert.equal(b.configuration().apiKeyConfigured,true);const other=new MarketPulse({},{...f.env,storage,storageKey:'project:B'});assert.equal(other.candles().length,0);b.configure({remember:false});assert.equal(store.has('project:A'),false);a.destroy();b.destroy();other.destroy();
});
await test('malformed JSON and network errors back off without leaking provider error content',async()=>{
 const f=fixture();f.responses.push(new Response('secret server error'));await f.api.refresh();assert.equal(f.api.status().phase,'error');assert.ok(!f.api.status().error.includes('secret'));await f.api.refresh();assert.equal(f.calls.length,1);
});
console.log(JSON.stringify({passed,network:'mocked'}));
