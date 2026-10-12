import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {MarketPulse,SOL_MINT} from '../sidecars/market-pulse/core.mjs';
import {mountMarketPanel} from '../sidecars/market-pulse/panel.mjs';
import {PulseChart} from '../sidecars/market-pulse/chart.mjs';
let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
const dom=new JSDOM('<aside>Navigation</aside><section class="workspace"><div id="dock"></div><main>Positions</main><div id="second"></div></section>',{url:'https://market.test',pretendToBeVisual:true,runScripts:'outside-only'}),w=dom.window;
const api=new MarketPulse({providerMode:'manual',remember:false});const panel=mountMarketPanel(w.document.getElementById('dock'),api);const root=panel.root;
const toggle=open=>{root.querySelector('.dock').open=open;root.querySelector('.dock').dispatchEvent(new w.Event('toggle'));};
try{
 await test('panel starts collapsed inside the main column and acquires only while open',()=>{
  assert.equal(root.querySelector('.dock').open,false);assert.equal(api.status().consumers,0);assert.equal(panel.element.closest('.workspace')?.className,'workspace');assert.equal(panel.element.parentElement.nextElementSibling.tagName,'MAIN');toggle(true);assert.equal(api.status().consumers,1);toggle(false);assert.equal(api.status().consumers,0);
 });
 await test('gear-equivalent settings, advanced controls and imports apply to the shared feed',()=>{
  panel.openSettings();toggle(true);assert.ok(root.querySelector('.settings').open);assert.equal(root.querySelector('.advanced').open,false);
  const f=root.querySelector('form');f.elements.namedItem('rateMode').value='custom';f.elements.namedItem('pollMs').value='1000';f.elements.namedItem('budgetPerMinute').value='120';f.elements.namedItem('apiKey').value='fixture-key';f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(api.status().effectivePollMs,1000);assert.equal(api.configuration().apiKeyConfigured,true);assert.equal(f.elements.namedItem('apiKey').value,'');
  api.importConfig(JSON.stringify({...api.exportConfig(),extensions:{futureProvider:'oracle'}}));assert.equal(api.configuration().extensions.futureProvider,'oracle');assert.equal(api.configuration().apiKeyConfigured,true);
 });
 await test('two graphs share marks, keep chart styles consistent and clean consumers',()=>{
  const second=mountMarketPanel(w.document.getElementById('second'),api);const d=second.root.querySelector('.dock');d.open=true;d.dispatchEvent(new w.Event('toggle'));assert.equal(api.status().consumers,2);
  api.ingest({protocol:'capp.market-feed.v1',instruments:[{id:SOL_MINT,quote:{price:151.25,time:Date.now()}}]});assert.match(root.querySelector('.price').textContent,/151.25/);assert.match(second.root.querySelector('.price').textContent,/151.25/);
  root.querySelector('.chart-type').value='area';root.querySelector('.chart-type').dispatchEvent(new w.Event('change'));assert.equal(api.configuration().chartType,'area');assert.equal(second.root.querySelector('.chart-type').value,'area');second.destroy();assert.equal(api.status().consumers,1);
 });
 await test('all chart renderers and pointer/keyboard controls work with constrained canvas dimensions',()=>{
  const host=w.document.createElement('div');w.document.body.append(host);const chart=new PulseChart(host);let draws=0;
  chart.canvas.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,width:320,height:310});
  const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}})},{get:(obj,k)=>k in obj?obj[k]:(...args)=>{draws++;}});chart.canvas.getContext=()=>ctx;
  const rows=Array.from({length:60},(_,i)=>({time:15000*(i+1+(i>30?3:0)),intervalMs:15000,open:150+i/10,high:151+i/10,low:149+i/10,close:150.5+i/10,volume:i%3?null:i}));
  for(const chartType of ['candles','ohlc','line','area']){chart.update(rows,{chartType,showMA:true,showEMA:true,showVolume:true});chart.zoom(.8);chart.fit();chart.latest();}
  chart.canvas.dispatchEvent(new w.KeyboardEvent('keydown',{key:'+'}));assert.ok(chart.view);assert.ok(draws>100);assert.equal(chart.canvas.width,320);chart.destroy();assert.equal(host.children.length,0);
 });
 await test('selected classic shell package exposes the same API and creates no duplicate instance',async()=>{
  w.__CAPP_EXECUTABLE_PLAN__={projectId:'p',componentId:'main',app:{id:'a'},library:{selected:[{id:'uk.capp.sidecar.market-pulse',config:{providerMode:'manual'}}]}};
  w.AbortController=AbortController;const script=await fs.readFile(new URL('../sidecars/market-pulse/runtime.js',import.meta.url),'utf8');w.eval(script);const native=w.capp.market.pulse;assert.equal(native.status().consumers,0);assert.equal(native.configuration().apiKeyConfigured,false);w.eval(script);assert.equal(native,w.capp.market.pulse);assert.equal(typeof w.CAppMarketPulse.mount,'function');native.destroy();
 });
 await test('manifest defaults and asset ledger match an independent credential-free package',async()=>{
  const manifest=JSON.parse(await fs.readFile(new URL('../sidecars/market-pulse/sidecar.json',import.meta.url),'utf8'));const own=new MarketPulse(manifest.defaults);assert.equal(own.status().effectivePollMs,15000);assert.deepEqual(manifest.dependencies,[]);assert.equal(manifest.agentTools.length,3);assert.ok(manifest.agentTools.every(t=>t.capability!=='market.configure'));own.destroy();
 });
}finally{panel.destroy();api.destroy();dom.window.close();}
console.log(JSON.stringify({passed,canvas:'mocked',nativeExecutionVerified:false,layoutVerified:false}));
