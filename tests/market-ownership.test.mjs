// Actual Lab adapter + actual generated selected runtime. Every provider fetch
// is intercepted; these tests do not contact Jupiter or any configured host.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {connectMarket,watchMarketRuntime} from '../src/market.mjs';
import {MarketPulse,SOL_MINT,normaliseConfig} from '../sidecars/market-pulse/core.mjs';
import {CapabilityLab} from '../src/capability-lab.mjs';

const ID='uk.capp.sidecar.market-pulse';
const script=await fs.readFile(new URL('../sidecars/market-pulse/runtime.js',import.meta.url),'utf8');
const windows=new Set();let passed=0,totalFixtureRequests=0;
async function test(name,run){try{await run();passed++;console.log('PASS '+name);}finally{for(const dom of windows)dom.window.close();windows.clear();}}
const plan=(config={providerMode:'manual',enabled:false},patch={})=>({projectId:'market-test',componentId:'main',appId:'market-test',library:{selected:[{id:ID,version:'0.1.0-alpha.2',config}]},...patch});
const scopeKey=p=>'capp.market-pulse.v1:'+encodeURIComponent(JSON.stringify([p.projectId,p.componentId,p.appId]));
function fixture({selected,installed=false,html='<!doctype html><main></main>'}={}){
  const dom=new JSDOM(html,{url:'https://market-ownership.test/',runScripts:'outside-only',pretendToBeVisual:true});windows.add(dom);
  const win=dom.window,calls=[],timers=new Map();let sequence=0;
  Object.assign(win,{AbortController,Response,Headers,TextEncoder,TextDecoder});
  win.setTimeout=(fn,ms)=>{const id=++sequence;timers.set(id,{fn,ms});return id;};win.clearTimeout=id=>timers.delete(id);
  win.fetch=async(_url,options)=>{totalFixtureRequests++;calls.push({signal:options?.signal});return new Response(JSON.stringify({[SOL_MINT]:{usdPrice:150,blockId:calls.length}}));};
  if(selected)win.__CAPP_EXECUTABLE_PLAN__=selected;
  if(installed)win.__CAPP_PACKAGED_RUNTIME__=true;
  return {dom,win,calls,timers,activate:()=>win.eval(script)};
}
function shellFixture(config){
  const f=fixture({selected:plan(config),html:'<!doctype html><iframe id="appFrame" src="/index.html"></iframe><iframe id="sibling" src="/other.html"></iframe>'});
  f.win.__CAPP_SHELL_NATIVE_READY__={protocol:'capp.shell-native-ready.v1'};
  const app=f.win.document.getElementById('appFrame').contentWindow;
  app.__CAPP_EXECUTABLE_PLAN__=structuredClone(f.win.__CAPP_EXECUTABLE_PLAN__);app.__CAPP_PACKAGED_RUNTIME__=true;
  return {...f,app};
}
function assertUnavailable(fn,reason,code='LAB_MARKET_UNAVAILABLE'){assert.throws(fn,error=>error.code===code&&error.reason===reason);}
const storageBytes=win=>new Map(Array.from({length:win.localStorage.length},(_,i)=>{const key=win.localStorage.key(i);return [key,win.localStorage.getItem(key)];}));
const restore=(win,rows)=>{for(const [key,value] of rows)win.localStorage.setItem(key,value);};

await test('intentional standalone shares one feed and sends only through intercepted provider',async()=>{
  const f=fixture(),api=connectMarket(f.win);
  assert.equal(api.authority.mode,'standalone');assert.equal(connectMarket(f.win),api);assert.equal(f.calls.length,0);
  await api.refresh();assert.equal(f.calls.length,1);assert.equal(api.quote().available,true);api.destroy();
});

await test('browser plan requires standalone opt-in and native markers cannot be bypassed',()=>{
  const f=fixture({selected:plan({}, {library:{selected:[]}})});
  assertUnavailable(()=>connectMarket(f.win),'not-selected');
  const api=connectMarket(f.win,{standalone:true});assert.equal(api.authority.mode,'standalone');api.destroy();
  const native=fixture({selected:plan({}, {library:{selected:[]}}),installed:true});
  assertUnavailable(()=>connectMarket(native.win,{standalone:true}),'not-selected');assert.equal(native.win.capp,undefined);assert.equal(native.calls.length,0);
  const existingRuntime=fixture();existingRuntime.win.capp={solana:{}};
  assertUnavailable(()=>connectMarket(existingRuntime.win),'not-selected');assert.equal(existingRuntime.win.capp.market,undefined);assert.equal(existingRuntime.calls.length,0);
});

await test('missing selected manual or disabled runtime is explicit and never replaced by defaults',async()=>{
  for(const config of [{providerMode:'manual',enabled:false},{providerMode:'jupiter',enabled:false},{providerMode:'manual',enabled:true}]){
    const f=fixture({selected:plan(config),installed:true});
    for(const options of [{},{standalone:true}])assertUnavailable(()=>connectMarket(f.win,options),'selected-starting','LAB_MARKET_STARTING');
    assert.equal(f.win.capp,undefined);assert.equal(f.calls.length,0);assert.equal(f.timers.size,0);
  }
});

await test('selected disabled feed is shared and repeated activation keeps one authority revision',async()=>{
  const f=fixture({selected:plan(),installed:true}),events=[];const stop=watchMarketRuntime(event=>events.push(event),f.win);
  f.activate();const api=connectMarket(f.win);assert.equal(api.authority.mode,'selected');assert.equal(api.configuration().providerMode,'manual');assert.equal(api.configuration().enabled,false);
  const release=api.acquire('regression');await api.refresh();f.activate();
  assert.equal(connectMarket(f.win),api);assert.equal(api.status().consumers,1);assert.equal(events.length,1);assert.equal(api.authority.revision,1);assert.equal(f.calls.length,0);
  assert.equal(events[0].detail.protocol,'capp.market-activation.v1');assert.equal(events[0].detail.id,ID);release();stop();api.destroy();
});

await test('late generated activation stops a conflicting standalone feed before binding selected policy',async()=>{
  const f=fixture(),old=connectMarket(f.win),release=old.acquire('old chart');
  f.win.__CAPP_EXECUTABLE_PLAN__=plan();f.win.__CAPP_PACKAGED_RUNTIME__=true;
  assertUnavailable(()=>connectMarket(f.win),'unverified-owner');assert.equal(f.calls.length,0);
  f.activate();const api=connectMarket(f.win);
  assert.notEqual(api,old);assert.equal(old.status().ready,false);assert.equal(old.status().consumers,0);assert.equal(api.configuration().enabled,false);assert.equal(api.configuration().providerMode,'manual');
  await old.refresh();await api.refresh();assert.equal(f.calls.length,0);assert.equal(f.timers.size,0);release();api.destroy();
});

await test('verified shell authority wins over a compatible child-frame instance',async()=>{
  const f=shellFixture({providerMode:'manual',enabled:false});
  const child=new MarketPulse({providerMode:'manual',remember:false},{document:f.app.document});f.app.capp={market:{pulse:child}};
  assertUnavailable(()=>connectMarket(f.app),'selected-starting','LAB_MARKET_STARTING');
  f.activate();const api=connectMarket(f.app);assert.equal(api,f.win.capp.market.pulse);assert.notEqual(api,child);
  assert.deepEqual(Array.from(api.authority.scope),['market-test','main','market-test']);await api.refresh();assert.equal(f.calls.length,0);
  const sibling=f.win.document.getElementById('sibling').contentWindow;sibling.__CAPP_EXECUTABLE_PLAN__=structuredClone(f.win.__CAPP_EXECUTABLE_PLAN__);
  assertUnavailable(()=>connectMarket(sibling),'selected-starting','LAB_MARKET_STARTING');
  child.destroy();api.destroy();
});

await test('invalid or duplicate selected configuration fails without fallback or credential disclosure',()=>{
  for(const selected of [plan({providerMode:'unregistered',apiKey:'fixture-secret'}),plan({}, {library:{selected:[{id:ID,config:{}},{id:ID,config:{}}]}})]){
    const f=fixture({selected,installed:true}),events=[];watchMarketRuntime(event=>events.push(event.detail),f.win);f.activate();
    assert.throws(()=>connectMarket(f.win),error=>error.code==='LAB_MARKET_UNAVAILABLE');assert.equal(f.win.capp?.market?.pulse,undefined);assert.equal(f.calls.length,0);
    assert.equal(events.at(-1).code,'MARKET_SELECTION_UNAVAILABLE');assert.equal(JSON.stringify(events).includes('fixture-secret'),false);
  }
});

await test('selection reconfiguration rejects stale API, aborts old request and binds new revision',async()=>{
  const f=fixture({selected:plan({providerMode:'jupiter',enabled:true,remember:false}),installed:true});f.activate();const old=connectMarket(f.win);
  let finish,requestSignal;old.fetch=async(_url,{signal})=>{totalFixtureRequests++;f.calls.push({signal});requestSignal=signal;return new Promise(resolve=>{finish=resolve;});};
  const pending=old.refresh();await Promise.resolve();assert.equal(f.calls.length,1);
  f.win.__CAPP_EXECUTABLE_PLAN__.library.selected[0].config={providerMode:'manual',enabled:false,remember:false};
  assertUnavailable(()=>connectMarket(f.win),'stale-selection');f.activate();const api=connectMarket(f.win);
  assert.notEqual(api,old);assert.equal(api.authority.revision,2);assert.equal(requestSignal.aborted,true);assert.equal(old.status().ready,false);
  finish(new Response(JSON.stringify({[SOL_MINT]:{usdPrice:999,blockId:77}})));await pending;await api.refresh();
  assert.equal(api.configuration().providerMode,'manual');assert.equal(api.configuration().enabled,false);assert.equal(api.quote().available,false);assert.equal(old.quote().available,false);assert.equal(f.calls.length,1);api.destroy();
});

await test('same selected configuration retains intentional in-app settings across runtime reload',()=>{
  const selected=plan({providerMode:'manual',enabled:false}),f=fixture({selected,installed:true});f.activate();const api=connectMarket(f.win);
  api.configure({enabled:true,chartType:'area',candleMs:60000});const bytes=storageBytes(f.win);api.destroy();
  const fresh=fixture({selected:structuredClone(selected),installed:true});restore(fresh.win,bytes);fresh.activate();const restored=connectMarket(fresh.win);
  assert.equal(restored.configuration().enabled,true);assert.equal(restored.configuration().chartType,'area');assert.equal(restored.configuration().candleMs,60000);assert.equal(restored.status().configurationNotice,null);assert.equal(fresh.calls.length,0);restored.destroy();
});

await test('legacy enabled settings cannot override selected policy and old bytes survive later edits',async()=>{
  const selected=plan({providerMode:'manual',enabled:false}),f=fixture({selected,installed:true}),key=scopeKey(selected);
  const config=normaliseConfig({providerMode:'jupiter',enabled:true,apiKey:'legacy-fixture-key'});
  const raw=JSON.stringify({protocol:'capp.market-state.v1',config,fingerprint:JSON.stringify([config.providerMode,config.adapterUrl,config.symbols.map(s=>s.id)]),books:[]});f.win.localStorage.setItem(key,raw);
  f.activate();const api=connectMarket(f.win);assert.equal(api.configuration().providerMode,'manual');assert.equal(api.configuration().enabled,false);assert.equal(api.configuration().apiKeyConfigured,false);
  assert.match(api.status().configurationNotice,/earlier selection/);assert.equal(f.win.localStorage.getItem(key),raw);await api.refresh();assert.equal(f.calls.length,0);
  api.configure({chartType:'line'});
  assert.equal([...storageBytes(f.win)].filter(([name,bytes])=>name.startsWith(key+':retained:')&&bytes===raw).length,1);
  assert.equal(JSON.parse(f.win.localStorage.getItem(key)).configurationSource.protocol,'capp.market-selection.v1');assert.equal(api.configuration().enabled,false);api.destroy();
});

await test('changed selected configuration preserves former overrides before writing current state',()=>{
  const f=fixture({selected:plan({providerMode:'manual',enabled:true}),installed:true});f.activate();const before=connectMarket(f.win);before.configure({chartType:'area',enabled:true});
  const key=scopeKey(f.win.__CAPP_EXECUTABLE_PLAN__),raw=f.win.localStorage.getItem(key);
  f.win.__CAPP_EXECUTABLE_PLAN__.library.selected[0].config={providerMode:'manual',enabled:false};f.activate();const after=connectMarket(f.win);
  assert.equal(after.configuration().enabled,false);assert.equal(after.configuration().chartType,'candles');assert.match(after.status().configurationNotice,/earlier selection/);assert.equal(f.win.localStorage.getItem(key),raw);
  after.configure({chartType:'line'});assert.ok([...storageBytes(f.win)].some(([name,bytes])=>name.startsWith(key+':retained:')&&bytes===raw));assert.equal(f.calls.length,0);after.destroy();
});

await test('compatible legacy history survives without becoming a current quote or enabling the feed',()=>{
  const selected=plan({providerMode:'manual',enabled:false}),f=fixture({selected,installed:true}),key=scopeKey(selected);
  const old=new MarketPulse({providerMode:'manual',enabled:true},{storage:f.win.localStorage,storageKey:key,document:f.win.document});
  old.ingest({protocol:'capp.market-feed.v1',instruments:[{id:SOL_MINT,quote:{price:151,time:Date.now()}}]});assert.equal(old.candles().length,1);old.destroy();
  const raw=f.win.localStorage.getItem(key);f.activate();const api=connectMarket(f.win);
  assert.equal(api.candles().length,1);assert.equal(api.quote().available,false);assert.equal(api.configuration().enabled,false);assert.equal(f.win.localStorage.getItem(key),raw);assert.equal(f.calls.length,0);api.destroy();
});

await test('failed state-retention write never overwrites prior settings',()=>{
  const source={protocol:'capp.market-selection.v1',version:'fixture',config:normaliseConfig({providerMode:'manual',enabled:false})};
  const key='market-retention-fixture',raw=JSON.stringify({protocol:'capp.market-state.v1',config:normaliseConfig({providerMode:'jupiter',enabled:true}),books:[]}),records=new Map([[key,raw]]);
  const storage={getItem:name=>records.get(name)??null,setItem:(name,value)=>{if(name.includes(':retained:'))throw Error('Fixture quota failure');records.set(name,value);},removeItem:name=>records.delete(name)};
  const api=new MarketPulse(source.config,{storage,storageKey:key,configurationSource:source});api.configure({chartType:'line'});
  assert.equal(records.get(key),raw);assert.equal(api.configuration().enabled,false);assert.match(api.status().storageError,/full or unavailable/);api.destroy();
});

await test('removing selected feed stops owned consumers without creating a standalone replacement',async()=>{
  const f=fixture({selected:plan({providerMode:'jupiter',enabled:true,remember:false}),installed:true});f.activate();const api=connectMarket(f.win),release=api.acquire('chart');
  f.win.__CAPP_EXECUTABLE_PLAN__.library.selected=[];f.activate();assert.equal(api.status().ready,false);assert.equal(f.win.capp.market.pulse,undefined);
  assertUnavailable(()=>connectMarket(f.win,{standalone:true}),'not-selected');await api.refresh();assert.equal(f.calls.length,0);assert.equal(f.timers.size,0);release();
});

await test('unknown conflicting API cannot be silently retained or doubled',()=>{
  for(const existing of [{status:()=>({ready:true})},{status:()=>({ready:true}),destroy(){}}]){
    const f=fixture({selected:plan(),installed:true});f.win.capp={market:{pulse:existing}};f.activate();
    assert.equal(f.win.capp.market.pulse,existing);assertUnavailable(()=>connectMarket(f.win),'activation-failed');assert.equal(f.calls.length,0);assert.equal(f.timers.size,0);
  }
});

await test('readiness watcher follows verified owners, filters unrelated events and detaches',()=>{
  const f=shellFixture({providerMode:'manual',enabled:false}),seen=[],stop=watchMarketRuntime(event=>seen.push(event),f.app);
  f.win.dispatchEvent(new f.win.CustomEvent('capp:market-pulse-ready',{detail:{id:'another-sidecar'}}));assert.equal(seen.length,0);
  f.activate();assert.equal(seen.length,1);assert.equal(seen[0].target,f.win);stop();
  f.win.__CAPP_EXECUTABLE_PLAN__.library.selected[0].config={providerMode:'manual',enabled:false,chartType:'area'};f.activate();assert.equal(seen.length,1);connectMarket(f.app).destroy();
});

await test('app-required market blocks new positions before a record, storage write or Sidecar effect',async()=>{
  const legacy={id:'retained-legacy-position',market:'SOL / USD',state:'open',units:5,jobs:[],position:{entryPrice:100,size:5,realisedPnl:0}};
  const raw=JSON.stringify({protocol:'capp.solana-lab.state.v1',payments:[],positions:[legacy],events:[]});let saved=raw,writes=0,effects=0;
  const lab=new CapabilityLab({marketRequired:true,market:null,storage:{getItem:()=>saved,setItem:(_key,value)=>{saved=value;writes++;}},call:async()=>{effects++;throw Error('No Sidecar call is permitted in this fixture.');}});
  await assert.rejects(()=>lab.openPosition(10),/Market Pulse is unavailable/);
  assert.equal(lab.state.positions.length,1);assert.equal(lab.state.events.length,0);assert.equal(saved,raw);assert.equal(writes,0);assert.equal(effects,0);assert.equal(lab.busy,false);
  const metrics=lab.positionMetrics(lab.position(legacy.id));assert.equal(metrics.legacy,true);assert.equal(metrics.entry,100);
});

await test('canonical and vendored package bytes agree with generated authority runtime',async()=>{
  for(const name of ['core.mjs','panel.mjs','build.mjs','runtime.js','assets.json','sidecar.json','README.md']){
    const local=await fs.readFile(new URL('../sidecars/market-pulse/'+name,import.meta.url));
    const canonical=await fs.readFile(new URL('../../capp/sidecars/market-pulse/'+name,import.meta.url));
    assert.equal(local.equals(canonical),true,name+' must be copied from the canonical source');
  }
});

console.log(JSON.stringify({passed,providerRequestsIntercepted:totalFixtureRequests,liveProviderRequests:0,nativeExecutionVerified:false,credentialValuesPrinted:false}));
