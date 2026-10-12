// Same-origin Windows shell + separate app-frame regression. Native commands,
// layout and model output are not validated by this DOM fixture.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import {marketResponse} from './market-fixture.mjs';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import {fixture as rpcFixture} from './devnet-fixture.mjs';
import {PROFILE} from '../src/catalog.mjs';
import {devnetSettings} from '../tools/configure-capp.mjs';
import {apiFor,installedShell,localAiFor,missingMethods} from '../src/runtime.mjs';

const require=createRequire(import.meta.url);
const {JSDOM}=require(process.env.CAPP_TEST_NODE_MODULES?path.join(process.env.CAPP_TEST_NODE_MODULES,'jsdom'):'jsdom');
const root=new URL('../',import.meta.url),read=rel=>fs.readFileSync(new URL(rel,root),'utf8');
const fixture=process.env.CAPP_INSTALLED_FIXTURE;
const plan=fixture?JSON.parse(fs.readFileSync(path.join(fixture,'capp-executable-plan.json'),'utf8')):structuredClone(PROFILE);
const marketPackage=JSON.parse(read('sidecars/market-pulse/sidecar.json'));
plan.app=plan.app||{appId:'solana-lab'};
const dom=new JSDOM('<!doctype html><iframe id="appFrame" src="/index.html"></iframe><iframe id="other" src="/other.html"></iframe>',{url:'http://tauri.localhost/capp-shell.html',runScripts:'outside-only',pretendToBeVisual:true});
const shell=dom.window,frame=shell.document.getElementById('appFrame'),app=frame.contentWindow;
let networkCalls=0,modelCalls=0,browserScripts=0,shellMarketCalls=0,childMarketCalls=0;
const rpc=rpcFixture();
for(const win of [shell,app]) {
  Object.defineProperty(win,'crypto',{value:webcrypto});
  Object.assign(win,{TextEncoder,TextDecoder,AbortController,Headers,Request,Response});
  win.scrollTo=()=>{};win.confirm=()=>true;
  win.fetch=(url,options)=>{if(String(url).startsWith('https://api.jup.ag/price/v3')){if(win===shell)shellMarketCalls++;else childMarketCalls++;return marketResponse();}networkCalls++;return rpc.ctx.fetch('https://fixture.invalid/',options);};win.structuredClone=structuredClone;win.isSecureContext=true;
}
shell.__CAPP_EXECUTABLE_PLAN__=plan;
if(fixture) {
  const source=fs.readFileSync(path.join(fixture,'capp-shell-main.js'),'utf8');
  const start=source.indexOf('window.__CAPP_SHELL_NATIVE_READY__ = {');
  const end=source.indexOf('\n};',start);
  assert.ok(start>0&&end>start,'supplied factory shell must publish its native-ready descriptor');
  shell.eval(source.slice(start,end+3));
}else shell.__CAPP_SHELL_NATIVE_READY__={protocol:'capp.shell-native-ready.v1'};
assert.equal(shell.__CAPP_PACKAGED_RUNTIME__,undefined,'do not invent the missing parent flag');

function loadSidecars(win=shell){
  for(const item of plan.library.selected.filter(x=>x.id.startsWith('uk.capp.sidecar.solana-'))) {
    const name=item.id.replace('uk.capp.sidecar.solana-','');
    const entry=name==='edge'?'solana-edge-shell.js':`${name}-shell.js`;
    const source=fixture?fs.readFileSync(path.join(fixture,`capp-sidecars/solana-${name}/runtime/${entry}`),'utf8'):read(`runtime/${name}.js`);
    win.eval(source);
  }
}

// First record the source export's next blocker without executing an operation.
if(fixture){
  const before=new JSDOM('<!doctype html>',{url:shell.location.href,runScripts:'outside-only'});
  Object.defineProperty(before.window,'crypto',{value:webcrypto});
  before.window.TextEncoder=TextEncoder;before.window.__CAPP_EXECUTABLE_PLAN__=plan;
  before.window.fetch=()=>{networkCalls++;throw Error('No network permitted');};
  loadSidecars(before.window);
  assert.equal((await before.window.capp.solana.edge.status()).ready,true,'the generated devnet selection is complete');
  before.window.close();
}
const selection=Object.fromEntries(plan.library.selected.map(item=>[item.id,item]));
const merged=devnetSettings({protocol:'capp.project-state.v1',projectId:'solana-lab',browserStorage:{'capp.sidecar-library.selections.v1':JSON.stringify({protocol:'capp.sidecar-library.selections.v1',apps:{'app:solana-lab':{selected:selection}}})}});
const repaired=JSON.parse(merged.state.browserStorage['capp.sidecar-library.selections.v1']);
plan.library.selected=Object.values(repaired.apps['app:solana-lab'].selected);
// The corrected settings go into a fresh shell, as they do after rebuilding.
loadSidecars();
app.__CAPP_EXECUTABLE_PLAN__=structuredClone(plan);
app.__CAPP_PACKAGED_RUNTIME__=true;
app.__CAPP_RUNTIME__=true;
app.document.open();app.document.write(read('index.html'));app.document.close();
const append=app.document.head.append.bind(app.document.head);
app.document.head.append=el=>{if(el.tagName==='SCRIPT'){browserScripts++;throw Error('Installed app must not load browser rehearsal providers');}return append(el);};
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
try {
  await test('installed app discovers all eleven APIs in its owning shell without a parent packaged flag',async()=>{
    assert.equal(installedShell(app),shell);assert.equal(apiFor(app),shell.capp.solana);
    assert.deepEqual(missingMethods(apiFor(app)),[]);
    assert.equal((await apiFor(app).edge.status()).ready,true);
  });
  await test('sibling and mismatched-app frames cannot borrow the shell connection',async()=>{
    const other=shell.document.getElementById('other').contentWindow;
    other.__CAPP_EXECUTABLE_PLAN__=plan;assert.equal(installedShell(other),null);
    const saved=app.__CAPP_EXECUTABLE_PLAN__;app.__CAPP_EXECUTABLE_PLAN__={appId:'another-app'};
    assert.equal(installedShell(app),null);app.__CAPP_EXECUTABLE_PLAN__=saved;
    const foreign={location:{origin:'https://other.example'},parent:shell};assert.equal(installedShell(foreign),null);
    const opaque={get parent(){throw new Error('SecurityError');}};assert.equal(apiFor(opaque),null);
  });
  await test('same-window platforms still use their own API, while incomplete providers are diagnosed',async()=>{
    const own={solana:shell.capp.solana,ai:{local:{connect(){}}}};
    assert.equal(apiFor({capp:own}),own.solana);assert.equal(localAiFor({capp:own}),own.ai.local);
    assert.ok(missingMethods({edge:shell.capp.solana.edge}).includes('compass.intent'));
  });
  // The actual app module executes in the iframe, not in the shell's JS realm.
  const globals={};
  for(const name of ['window','document','location','navigator','localStorage','HTMLElement','customElements','crypto','TextEncoder','TextDecoder','AbortController','FormData','URL','Blob','CustomEvent','console','structuredClone'])globals[name]=app[name];
  globals.setTimeout=app.setTimeout.bind(app);globals.clearTimeout=app.clearTimeout.bind(app);
  const ctx=vm.createContext(globals),cache=new Map();
  function moduleAt(rel){
    if(cache.has(rel))return cache.get(rel);
    const module=new vm.SourceTextModule(read(rel),{context:ctx,identifier:rel,initializeImportMeta:meta=>meta.url='http://tauri.localhost/'+rel});
    cache.set(rel,module);
    return module;
  }
  const entry=moduleAt('src/app.mjs');await entry.link((specifier,parent)=>moduleAt(path.posix.normalize(path.posix.join(path.posix.dirname(parent.identifier),specifier))));await entry.evaluate();
  const q=s=>app.document.querySelector(s),tick=()=>new Promise(r=>setTimeout(r,5));
  async function until(fn){for(let i=0;i<300;i++){if(fn())return;await tick();}throw Error('Condition timed out: '+q('#content').textContent.slice(-600)+' '+q('#toast').textContent);}
  async function go(route){app.location.hash='/'+route;await tick();}
  await test('installed bootstrap renders the gallery without loading a duplicate runtime',async()=>{
    assert.equal(q('#runtime-mode').textContent,'Installed Sidecars');assert.equal(app.document.querySelectorAll('.demo-card').length,12);
    assert.equal(app.capp?.solana,undefined);assert.equal(browserScripts,0);
  });
  await test('a missing installed Market runtime blocks positions without a replacement feed or payment effect',async()=>{
    await go('positions');const before=JSON.stringify(app.solanaLab.exportEvidence().state),calls=networkCalls,sends=rpc.sends;
    assert.equal(q('[data-form=position] button[type=submit]').disabled,true);assert.equal(shell.capp?.market?.pulse,undefined);assert.equal(app.capp?.market?.pulse,undefined);
    q('[data-form=position]').dispatchEvent(new app.Event('submit',{bubbles:true,cancelable:true}));await until(()=>q('#content').getAttribute('aria-busy')==='false');
    assert.match(q('#toast').textContent,/Market Pulse/);assert.equal(JSON.stringify(app.solanaLab.exportEvidence().state),before);assert.equal(networkCalls,calls);assert.equal(rpc.sends,sends);
    assert.equal(shellMarketCalls,0);assert.equal(childMarketCalls,0);assert.equal(browserScripts,0);
  });
  await test('installed checkout calls shell policy, explicit authority and execution through to a receipt',async()=>{
    await go('checkout');q('[data-action=wallet-connect]').click();await until(()=>q('[data-action=self-recipient]'));q('[data-action=self-recipient]').click();await until(()=>!q('[data-form=payment] button').disabled);q('[data-form=payment] button[type=submit]').click();await until(()=>q('[data-action=approve]')&&!q('[data-action=approve]').disabled);
    q('[data-action=approve]').click();await until(()=>q('[data-action=submit]')&&!q('[data-action=submit]').disabled);
    q('[data-action=submit]').click();await until(()=>q('[data-action=reconcile]')&&!q('[data-action=reconcile]').disabled);q('[data-action=reconcile]').click();await until(()=>q('[data-action=receipt]')&&!q('[data-action=receipt]').disabled);
    const payment=app.solanaLab.exportEvidence().state.payments[0];
    assert.equal(payment.operation.receipt.simulated,false);
    assert.equal((await shell.capp.solana.circuit.read({operationId:payment.id})).state,'submitted');
  });
  await test('installed service recipe uses shell commitment support and retains the order without a send',async()=>{
    await go('service');const before=rpc.sends;
    q('[data-action=self-recipient]').click();await until(()=>!q('[data-form=workflow] button').disabled);q('[data-form=workflow] button[type=submit]').click();
    await until(()=>q('[data-action=workflow-prepare]')&&!q('[data-action=workflow-prepare]').disabled);
    q('[data-action=workflow-prepare]').click();await until(()=>q('[data-action=approve]')&&!q('[data-action=approve]').disabled);
    const record=app.solanaLab.exportEvidence().state.payments.find(p=>p.kind==='service');assert.equal(record.operation.commitment.namespace,'service-order');
    assert.equal(rpc.sends,before);assert.equal(browserScripts,0);assert.equal(q('[data-action=service-deliver]').disabled,true);assert.ok(app.CAppGuideDocset.documents.some(d=>d.routes.includes('#/service')));
    await go('checkout');
  });
  await test('the installed app opens Conduit settings in its owning shell without recreating its wallet',async()=>{
    await go('network');const before=(await shell.capp.solana.latch.status()).wallet.walletPubkey;
    q('[data-action=rpc-settings]').click();await until(()=>shell.document.querySelector('.capp-conduit-settings'));
    assert.equal(q('.capp-conduit-settings'),null);const root=shell.document.querySelector('.capp-conduit-settings').shadowRoot,form=root.querySelector('form');
    form.elements.namedItem('rpcUrl').value='https://replacement.devnet.example';form.dispatchEvent(new shell.Event('submit',{bubbles:true,cancelable:true}));
    await until(()=>!root.querySelector('[data-message]').hidden&&!form.querySelector('button').disabled);
    assert.match(root.querySelector('[data-message]').textContent,/verified and active/);assert.equal((await shell.capp.solana.conduit.status()).endpointOrigin,'https://replacement.devnet.example');assert.equal((await shell.capp.solana.latch.status()).wallet.walletPubkey,before);root.querySelector('[data-close]').click();assert.equal(browserScripts,0);
  });
  await test('the explicitly selected canonical Market activates in the owning shell and is shared by the app',async()=>{
    // PROFILE deliberately contains the eleven payment peers. Declare Market
    // as an additional test selection before evaluating its generated runtime;
    // an installed app must never manufacture the former bundled fallback.
    if(!plan.library.selected.some(item=>item.id===marketPackage.id))plan.library.selected.push({id:marketPackage.id,version:marketPackage.version,config:{providerMode:'jupiter',enabled:true,remember:false}});
    app.__CAPP_EXECUTABLE_PLAN__=structuredClone(plan);shell.eval(read('sidecars/market-pulse/runtime.js'));
    await until(()=>!!shell.capp?.market?.pulse);const market=cache.get('src/market.mjs').namespace.connectMarket(app);
    assert.equal(market,shell.capp.market.pulse);assert.equal(market.authority.mode,'selected');assert.equal(app.capp?.market?.pulse,undefined);
    await market.refresh();assert.equal(market.quote().available,true);assert.ok(shellMarketCalls>0);assert.equal(childMarketCalls,0);
    const calls=shellMarketCalls;shell.eval(read('sidecars/market-pulse/runtime.js'));assert.equal(shell.capp.market.pulse,market);assert.equal(shellMarketCalls,calls);assert.equal(browserScripts,0);
  });
  await test('installed position lifecycle uses Arena and records its simulated outcome',async()=>{
    await go('positions');await until(()=>!q('[data-form=position] button').disabled);q('[data-form=position] button').click();await until(()=>q('[data-action=position-reduce]')&&!q('[data-action=position-reduce]').disabled);
    q('[data-action=position-reduce]').click();await until(()=>q('[data-action=position-close]')&&!q('[data-action=position-close]').disabled);
    q('[data-action=position-close]').click();await until(()=>q('main').textContent.includes('BUCKET REUSABLE'));
    assert.equal(app.solanaLab.exportEvidence().state.positions[0].state,'closed');
  });
  await test('optional Local AI is discovered in the same shell and receives scoped read-tool instructions',async()=>{
    let request;
    shell.capp.ai={local:{connect:()=>({status:async()=>({nativeReady:true,currentModelId:'fixture-model'}),complete:async value=>{request=value;modelCalls++;return{output:JSON.stringify({answer:'The receipt is simulated.'})};}})}};
    assert.equal(localAiFor(app),shell.capp.ai.local);
    q('#assistant-open').click();await until(()=>!q('.assistant-compose button[type=submit]').disabled);
    q('#assistant-message').value='Explain the receipt';q('.assistant-compose button[type=submit]').click();
    await until(()=>q('.assistant-messages').textContent.includes('The receipt is simulated.'));
    assert.equal(request.isolated,true);assert.match(request.system,/declared read tools/);
  });
  await test('a missing installed component names its absent methods and never loads browser providers',async()=>{
    const witness=shell.capp.solana.witness;delete shell.capp.solana.witness;
    let now=0;globals.Date=class extends Date{static now(){return now+=5000;}};
    try{
      await assert.rejects(()=>cache.get('src/runtime.mjs').namespace.connectRuntime(),error=>
        error.code==='LAB_INSTALLED_API_UNAVAILABLE'&&error.missingMethods.includes('witness.receipt')&&/witness/.test(error.message));
      assert.equal(browserScripts,0);
    }finally{shell.capp.solana.witness=witness;delete globals.Date;}
  });
  await test('runtime and AI discovery survive an app-frame document replacement',async()=>{
    frame.src='/index.html#/receipts';const reloaded=frame.contentWindow;
    reloaded.__CAPP_EXECUTABLE_PLAN__=structuredClone(plan);reloaded.__CAPP_PACKAGED_RUNTIME__=true;
    assert.equal(apiFor(reloaded),shell.capp.solana);assert.equal(localAiFor(reloaded),shell.capp.ai.local);
  });
  assert.ok(networkCalls>0);assert.equal(browserScripts,0);
  console.log(JSON.stringify({passed,exportedWindowsAssets:!!fixture,mockRpcCalls:networkCalls,marketFixtureSource:'explicitly selected canonical Lab runtime',shellMarketCalls,childMarketCalls,realNetworkUsed:false,modelFixtureCalls:modelCalls,layoutVerified:false,nativeExecutionVerified:false}));
}finally{dom.window.close();}
