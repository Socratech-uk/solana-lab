import assert from 'node:assert/strict';
import {fixture} from './devnet-fixture.mjs';
import {Lab,readTool} from '../src/lab.mjs';
import {MarketPulse,SOL_MINT} from '../sidecars/market-pulse/core.mjs';
let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
function setup(){
 const f=fixture(),store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};let now=1800000000000,lose=false,executeCalls=0;
 const market=new MarketPulse({providerMode:'manual',remember:false},{now:()=>now});
 const price=n=>market.ingest({protocol:'capp.market-feed.v1',instruments:[{id:SOL_MINT,quote:{price:n,time:now}}]});
 const call=async(c,m,input)=>{const value=await f.api[c][m](input);if(c==='arena'&&m==='execute'){executeCalls++;if(lose){lose=false;throw Error('Response lost after Arena persisted the effect');}}return value;};
 const lab=new Lab({call,market,storage});
 return {lab,market,storage,call,price,advance:ms=>now+=ms,lose:()=>lose=true,calls:()=>executeCalls};
}
await test('observed prices set entry and realised/unrealised P&L through the real Arena lifecycle',async()=>{
 const f=setup();f.price(150);let p=await f.lab.openPosition(10);assert.equal(p.position.entryPrice,150);assert.equal(p.jobs[0].pricing.source,'manual');
 f.advance(1000);f.price(160);assert.equal(f.lab.positionMetrics(p).unrealised,100);p=await f.lab.changePosition(p.id,'reduce');assert.equal(f.lab.positionMetrics(p).realised,50);assert.equal(f.lab.positionMetrics(p).unrealised,50);
 f.advance(1000);f.price(140);p=await f.lab.changePosition(p.id,'close');assert.equal(f.lab.positionMetrics(p).realised,0);assert.equal(f.lab.positionMetrics(p).unrealised,0);assert.equal(p.rail.state,'rail_bucket_reusable');assert.ok(p.jobs.every(j=>j.receipt.simulated));
});
await test('no current mark and stale mark block new actions before any execution or persisted job',async()=>{
 const f=setup();await assert.rejects(()=>f.lab.openPosition(5),/fresh SOL price/);assert.equal(f.lab.state.positions.length,0);assert.equal(f.calls(),0);
 f.price(150);const p=await f.lab.openPosition(5);f.advance(61000);assert.equal(f.lab.positionMetrics(p).unrealised,null);await assert.rejects(()=>f.lab.changePosition(p.id,'close'),/fresh SOL price/);assert.equal(f.lab.position(p.id).jobs.length,1);assert.equal(f.calls(),1);
});
await test('a lost reply resumes its recorded price and does not execute twice after reload',async()=>{
 const f=setup();f.price(150);f.lose();await assert.rejects(()=>f.lab.openPosition(5),/Response lost/);const p=f.lab.state.positions[0],digest=p.jobs[0].steps.messageDigest;
 f.advance(1000);f.price(999);const reload=new Lab({call:f.call,market:f.market,storage:f.storage});const resumed=await reload.resumePosition(p.id);assert.equal(resumed.position.entryPrice,150);assert.equal(resumed.jobs[0].pricing.price,150);assert.equal(resumed.jobs[0].steps.messageDigest,digest);assert.equal(f.calls(),1);assert.equal(resumed.position.size,5);
});
await test('legacy positions keep their original fixed-price basis beside the new market feed',async()=>{
 const f=setup(),old=new Lab({call:f.call,storage:f.storage,key:'legacy'});const p=await old.openPosition(10);const lab=new Lab({call:f.call,market:f.market,storage:f.storage,key:'legacy'});f.price(999);assert.equal(lab.positionMetrics(p).legacy,true);assert.equal(lab.positionMetrics(p).unrealised,0);const closed=await lab.changePosition(p.id,'close');assert.equal(closed.jobs[1].pricing,undefined);assert.equal(lab.positionMetrics(closed).realised,0);
});
await test('agent market tools return timestamped bounded reads and cannot request a write',async()=>{
 const f=setup();f.price(150);const q=await readTool(f.lab,'lab.market.quote',{id:SOL_MINT});assert.equal(q.price,150);assert.equal(q.stale,false);assert.equal((await readTool(f.lab,'lab.market.candles',{})).length,1);await assert.rejects(()=>readTool(f.lab,'market.configure',{apiKey:'x'}),/not granted/);await assert.rejects(()=>readTool(f.lab,'lab.market.quote',{unknown:'x'}));
});
console.log(JSON.stringify({passed,network:'none',realArena:true}));
