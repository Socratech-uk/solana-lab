// Actual Lab, Assistant, Guide shell and Guide agent controls in one DOM.
// Solana replies and target geometry are fixtures: no native/layout or funded
// transfer claim. Every external request is intercepted and asserted here.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {MessageChannel} from 'node:worker_threads';
import {JSDOM,ResourceLoader,VirtualConsole} from 'jsdom';
import {fixture} from './devnet-fixture.mjs';
import {marketResponse} from './market-fixture.mjs';

const root=new URL('../',import.meta.url);
const read=rel=>fs.readFileSync(new URL(rel,root),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
const clean=value=>JSON.parse(JSON.stringify(value));
let passed=0,app;
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};

async function openApp(seed=[]){
 const origin='https://fresh-demo.test',errors=[],events=[],channels=[];
 class LocalAssets extends ResourceLoader{
  fetch(url){
   const u=new URL(url);assert.equal(u.origin,origin,'Unexpected DOM resource origin');
   // Exercise this supplied source's canonical owner runtime. The build gate
   // separately verifies that the app's vendored runtime has the same bytes.
   const rel=u.pathname.startsWith('/runtime/guide/')?'../capp/sidecars/ftue/runtime/'+u.pathname.split('/').at(-1):u.pathname.slice(1);
   let source=read(rel);
   if(rel==='runtime/host.html')source=source.replace('</head>','<script>parent.__bootRehearsal(window)</script></head>');
   const pending=Promise.resolve(Buffer.from(source));pending.abort=()=>{};return pending;
  }
 }
 const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>errors.push(error));
 const dom=new JSDOM(read('index.html'),{url:origin+'/',runScripts:'dangerously',resources:new LocalAssets(),pretendToBeVisual:true,virtualConsole});
 const w=dom.window,rpc=fixture({confirmationStatus:'finalized'}),requests=[],effects={authorisations:0};
 w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.AbortController=AbortController;w.structuredClone=structuredClone;w.scrollTo=()=>{};w.confirm=()=>true;w.isSecureContext=true;
 Object.defineProperty(w,'crypto',{value:webcrypto});
 Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async()=>{}}});
 // JSDOM omits MessageEvent.source. Model this same-window browser topology
 // explicitly so the real Guide bridge can apply its source/origin checks.
 w.postMessage=data=>queueMicrotask(()=>w.dispatchEvent(new w.MessageEvent('message',{data,source:w,origin})));
 w.MessageChannel=class extends MessageChannel{constructor(){super();channels.push(this);}};
 // JSDOM omits browser ES-module evaluation in iframes. Evaluate the shipped
 // isolated host module in its own window and preserve the actual private
 // MessagePort handshake used by createRehearsal().
 w.__bootRehearsal=child=>{
  Object.defineProperty(child,'crypto',{value:webcrypto});
  Object.assign(child,{TextEncoder,TextDecoder,AbortController,structuredClone});child.confirm=()=>true;
  child.fetch=()=>{throw Error('An isolated recovery rehearsal must never fetch');};
  const globals={};
  for(const name of ['window','parent','document','location','localStorage','crypto','TextEncoder','TextDecoder','AbortController','URL','CustomEvent','console','structuredClone'])globals[name]=child[name];
  globals.setTimeout=child.setTimeout.bind(child);globals.clearTimeout=child.clearTimeout.bind(child);
  const hostContext=vm.createContext(globals),hostModules=new Map();
  const hostModule=rel=>{if(hostModules.has(rel))return hostModules.get(rel);const m=new vm.SourceTextModule(read(rel),{context:hostContext,identifier:rel,initializeImportMeta:meta=>meta.url=origin+'/'+rel});hostModules.set(rel,m);return m;};
  const hostEntry=hostModule('runtime/host.mjs');
  const ready=hostEntry.link((specifier,parent)=>hostModule(path.posix.normalize(path.posix.join(path.posix.dirname(parent.identifier),specifier)))).then(()=>hostEntry.evaluate());
  child.postMessage=(data,targetOrigin,ports=[])=>{assert.equal(targetOrigin,origin);void ready.then(()=>child.dispatchEvent(new child.MessageEvent('message',{data,source:w,origin,ports}))).catch(error=>errors.push(error));};
 };
 // JSDOM does not lay out targets. Make readiness visible without replacing
 // any Lab controls, Guide steps, actions, persistence or transaction logic.
 w.HTMLElement.prototype.scrollIntoView=function(){};
 w.HTMLElement.prototype.getBoundingClientRect=function(){return {left:32,top:64,right:632,bottom:364,width:600,height:300};};
 w.HTMLElement.prototype.getClientRects=function(){return [this.getBoundingClientRect()];};
 for(const [key,value] of seed)w.localStorage.setItem(key,value);
 w.addEventListener('capp:ftue-workflow-started',event=>events.push(clean(event.detail.detail)));
 w.fetch=async(url,options={})=>{
  if(String(url).startsWith('https://api.jup.ag/price/v3'))return marketResponse();
  assert.ok(options.body,'Unexpected fetch without controlled RPC input: '+String(url));
  const request=JSON.parse(options.body);requests.push({method:request.method,params:request.params});
  if(request.method==='getMinimumBalanceForRentExemption')return new Response(JSON.stringify({jsonrpc:'2.0',id:request.id,result:890880}),{headers:{'content-type':'application/json'}});
  return rpc.ctx.fetch('https://fixture.invalid/',options);
 };
 const context=dom.getInternalVMContext(),modules=new Map();
 function moduleAt(rel){
  if(modules.has(rel))return modules.get(rel);
  const m=new vm.SourceTextModule(read(rel),{context,identifier:rel,initializeImportMeta:meta=>meta.url=origin+'/'+rel});modules.set(rel,m);return m;
 }
 const entry=moduleAt('src/app.mjs');
 await entry.link((specifier,parent)=>moduleAt(path.posix.normalize(path.posix.join(path.posix.dirname(parent.identifier),specifier))));await entry.evaluate();
 const q=selector=>w.document.querySelector(selector);
 const tour=()=>w.__CAPP_FTUE__?.tour;
 const evidence=()=>clean(w.solanaLab.exportEvidence());
 const snapshot=()=>Object.keys(w.localStorage).map(key=>[key,w.localStorage.getItem(key)]);
 async function until(predicate,label='UI update',timeoutMs=12000){
  const started=Date.now();
  while(Date.now()-started<timeoutMs){if(await predicate())return;await tick();}
  throw Error(label+' timed out. '+JSON.stringify({tour:tour(),guide:w.__CAPP_FTUE__?.lastError,toast:q('#toast')?.textContent,errors:errors.map(e=>e.message)}));
 }
 const click=async selector=>{await until(()=>q(selector)&&!q(selector).disabled,selector);q(selector).click();await tick();};
 const go=async route=>{w.location.hash='/'+route;await until(()=>q('.nav-item.active')?.getAttribute('href')==='#/'+route,'Route '+route);await until(()=>q('#content')?.getAttribute('aria-busy')!=='true','Idle '+route);await tick();};
 const guideReady=()=>until(()=>w.__CAPP_FTUE__?.status==='ready'&&w.capp?.guide?.listActions?.().length>=37,'Guide actions');
 const started=workflowId=>until(()=>tour()?.active&&tour()?.workflowId===workflowId&&tour()?.actionState==='idle','Started '+workflowId);
 const stopped=()=>until(()=>!tour()?.active,'Stopped workflow');
 const cancel=async()=>{if(tour()?.active){await click('[data-ftue-action=skip]');await stopped();}};
 const advance=async()=>{
  await until(()=>tour()?.active&&['idle','failed'].includes(tour()?.actionState),'Ready Guide step');
  assert.notEqual(tour().actionState,'failed','Guide failed: '+q('[data-ftue-action-status]')?.textContent);
  const before=tour(),index=before.index,step=before.steps[index],progress=JSON.stringify(step.continuation||null);
  await click('[data-ftue-action='+(step.action?.type==='app'?'perform':'next')+']');
  await until(()=>tour()!==before||!tour()?.active||tour().index!==index||tour().actionState==='failed'||JSON.stringify(step.continuation||null)!==progress,'Guide '+step.id);
  assert.notEqual(tour()?.actionState,'failed','Guide failed: '+q('[data-ftue-action-status]')?.textContent);
 };
 const finish=async()=>{for(let i=0;tour()?.active&&i<24;i++)await advance();assert.equal(tour()?.active,false,'Workflow did not finish');};
 const prepareRecovery=async()=>{await advance();await advance();return evidence().state.payments.at(-1);};
 const close=()=>{w.dispatchEvent(new w.Event('pagehide'));for(const channel of channels){channel.port1.close();channel.port2.close();}w.close();};
 await until(()=>w.solanaLab,'Lab startup');await guideReady();
 const latch=w.capp.solana.latch;
 w.capp.solana.latch={...latch,authorise:(...args)=>{effects.authorisations++;return latch.authorise(...args);}};
 return {w,q,tour,evidence,snapshot,until,click,go,started,stopped,cancel,advance,finish,prepareRecovery,close,errors,events,rpc,requests,effects};
}

try{
 app=await openApp();
 let firstReceipt,secondReceipt,stoppedRun;
 await check('Run with Guide completes an isolated run and preserves its exact receipt',async()=>{
  await app.go('recovery');await app.click('[data-guide-start=understand-recovery]');await app.started('understand-recovery');
  await app.finish();firstReceipt=app.evidence().state.payments.at(-1);
  assert.equal(firstReceipt.kind,'recovery');assert.equal(firstReceipt.state,'finalised');assert.equal(firstReceipt.operation.receipt.simulated,true);
  assert.equal(app.rpc.sends,0);assert.equal(app.effects.authorisations,0);
 });
 await check('clicking Run with Guide again creates a distinct operation and keeps the old receipt',async()=>{
  await app.click('[data-guide-start=understand-recovery]');await app.started('understand-recovery');
  assert.equal(app.tour().index,0);assert.equal(app.evidence().state.payments.length,1,'Launching alone does not prepare or approve');
  const second=await app.prepareRecovery();assert.notEqual(second.id,firstReceipt.id,'A new launch must not reuse the completed binding');
  assert.equal(app.evidence().state.payments.length,2);assert.deepEqual(app.evidence().state.payments.find(p=>p.id===firstReceipt.id),firstReceipt);
  assert.notEqual(second.state,'finalised','The new prepare step must not report the old completion');
  await app.finish();secondReceipt=app.evidence().state.payments.find(p=>p.id===second.id);
  assert.equal(secondReceipt.state,'finalised');assert.notEqual(secondReceipt.operation.attemptId,firstReceipt.operation.attemptId);assert.equal(app.rpc.sends,0);
 });
 await check('Continue with Guide resumes the chosen saved record instead of creating another',async()=>{
  await app.go('receipts');await app.click('[data-action=open-record][data-id="'+firstReceipt.id+'"]');
  await app.until(()=>app.q('[data-guide-resume=understand-recovery][data-guide-record="'+firstReceipt.id+'"]'));
  const count=app.evidence().state.payments.length;
  assert.equal(app.q('[data-guide-start=understand-recovery]').hasAttribute('data-guide-record'),false,'Primary launch stays independent from the visible saved record');
  await app.click('[data-guide-resume=understand-recovery]');await app.started('understand-recovery');
  assert.equal(app.tour().runMode,'resume');assert.equal(app.tour().recordId,firstReceipt.id);
  assert.deepEqual(app.evidence().state.payments.find(p=>p.id===firstReceipt.id),firstReceipt,'Resume launch does not mutate the record');
  await app.finish();assert.equal(app.evidence().state.payments.length,count);
  assert.equal(app.evidence().state.guideBindings.recovery,firstReceipt.id);
  assert.deepEqual(app.evidence().state.payments.find(p=>p.id===firstReceipt.id).operation.receipt,firstReceipt.operation.receipt);assert.equal(app.rpc.sends,0);
 });
 await check('a stopped prepared run stays in history while the next click starts separately',async()=>{
  await app.click('[data-guide-start=understand-recovery]');await app.started('understand-recovery');stoppedRun=await app.prepareRecovery();await app.cancel();
  await app.click('[data-guide-start=understand-recovery]');await app.started('understand-recovery');const next=await app.prepareRecovery();
  assert.notEqual(next.id,stoppedRun.id);assert.deepEqual(app.evidence().state.payments.find(p=>p.id===stoppedRun.id),stoppedRun);
  assert.notEqual(next.state,'finalised');await app.cancel();assert.equal(app.rpc.sends,0);assert.equal(app.effects.authorisations,0);
 });
 for(const [attribute,label] of [['data-guide-start','Guide me'],['data-guide-new','New run']])await check('Guided demos '+label+' starts one fresh walkthrough from a retained run',async()=>{
  const previous=app.evidence().state.payments,events=app.events.length;
  await app.go('guided');await app.click('['+attribute+'=understand-recovery]');await app.started('understand-recovery');
  assert.equal(app.tour().runMode,'new');assert.ok(app.tour().runId);assert.equal(app.events.length,events+1,'One click has one started session');
  const next=await app.prepareRecovery();assert.ok(!previous.some(p=>p.id===next.id));
  assert.deepEqual(app.evidence().state.payments.filter(p=>p.id!==next.id),previous);await app.cancel();
 });
 await check('Watch demo repeats the whole local execution with a new operation',async()=>{
  const previous=app.evidence().state.payments;
  await app.go('guided');await app.click('[data-guide-watch=understand-recovery]');await app.started('understand-recovery');await app.stopped();
  const next=app.evidence().state.payments.at(-1);assert.equal(next.state,'finalised');assert.ok(!previous.some(p=>p.id===next.id));
  assert.deepEqual(app.evidence().state.payments.filter(p=>p.id!==next.id),previous);assert.equal(app.rpc.sends,0);assert.equal(app.effects.authorisations,0);
 });
 for(const [attribute,label] of [['data-assist-task','Guide me'],['data-assist-new','New run']])await check('Lab Assistant '+label+' uses the fresh start boundary once',async()=>{
  const previous=app.evidence().state.payments,events=app.events.length;
  await app.go('recovery');await app.click('#assistant-open');await app.click('[data-assist-tab=demos]');await app.click('['+attribute+'=understand-recovery]');await app.started('understand-recovery');
  assert.equal(app.tour().runMode,'new');assert.equal(app.events.length,events+1);
  const next=await app.prepareRecovery();assert.ok(!previous.some(p=>p.id===next.id));
  assert.deepEqual(app.evidence().state.payments.filter(p=>p.id!==next.id),previous);await app.cancel();
 });
 await check('Lab Assistant Watch demo executes another whole local run',async()=>{
  const previous=app.evidence().state.payments;
  await app.click('#assistant-open');await app.click('[data-assist-tab=demos]');await app.click('[data-assist-watch=understand-recovery]');await app.started('understand-recovery');await app.stopped();
  const next=app.evidence().state.payments.at(-1);assert.equal(next.state,'finalised');assert.ok(!previous.some(p=>p.id===next.id));
  assert.deepEqual(app.evidence().state.payments.filter(p=>p.id!==next.id),previous);assert.equal(app.rpc.sends,0);
 });
 await check('Guide This page task controls start fresh without going through a Lab launch button',async()=>{
  for(let attempt=0;attempt<2;attempt++){
   const previous=app.evidence().state.payments;
   await app.go('recovery');await app.click('[data-open-ftue]');await app.click('[data-guide-view=page]');await app.click('[data-start-workflow-id=understand-recovery]');await app.started('understand-recovery');
   assert.equal(app.tour().runMode,'new');const next=await app.prepareRecovery();assert.ok(!previous.some(p=>p.id===next.id));
   assert.deepEqual(app.evidence().state.payments.filter(p=>p.id!==next.id),previous);await app.cancel();
  }
 });
 await check('reusing an offered task inside Guide creates a fresh run each time',async()=>{
  await app.click('[data-open-ftue]');await app.click('[data-guide-view=assistant]');
  await app.until(()=>app.q('[data-help-question]'),'Guide task composer');
  app.q('[data-help-question]').value='Run lost-response recovery';
  app.q('[data-help-form]').dispatchEvent(new app.w.Event('submit',{bubbles:true,cancelable:true}));
  await app.until(()=>app.q('[data-start-workflow-message]'),'Authored Guide task offer');
  const offerId=app.q('[data-start-workflow-message]').dataset.startWorkflowMessage;
  for(let attempt=0;attempt<2;attempt++){
   const previous=app.evidence().state.payments;
   await app.click('[data-start-workflow-message="'+offerId+'"]');await app.started('understand-recovery');
   const next=await app.prepareRecovery();assert.ok(!previous.some(p=>p.id===next.id));
   assert.deepEqual(app.evidence().state.payments.filter(p=>p.id!==next.id),previous);await app.cancel();
   if(attempt===0){await app.click('[data-open-ftue]');await app.click('[data-guide-view=assistant]');}
  }
 });
 await check('stopped unsigned devnet requests start separately, Continue keeps identity and synthetic confirmation cannot approve',async()=>{
  await app.go('checkout');await app.click('[data-guide-start=understand-checkout]');await app.started('understand-checkout');
  const walletsBefore=(await app.w.capp.solana.latch.walletList()).wallets.length;
  assert.equal(walletsBefore,0,'The launch itself does not create wallet keys');
  await app.advance();await app.advance();
  const first=app.evidence().state.payments.filter(p=>p.kind==='checkout').at(-1);
  assert.equal(first.state,'preflighted');assert.equal(first.operation.signature,undefined);assert.equal(app.effects.authorisations,0);assert.equal(app.rpc.sends,0);
  await app.cancel();await app.click('[data-guide-start=understand-checkout]');await app.started('understand-checkout');await app.advance();await app.advance();
  const second=app.evidence().state.payments.filter(p=>p.kind==='checkout').at(-1);
  assert.notEqual(second.id,first.id);assert.notEqual(second.operation.attemptId,first.operation.attemptId);
  assert.deepEqual(app.evidence().state.payments.find(p=>p.id===first.id),first);assert.equal(app.effects.authorisations,0);assert.equal(app.rpc.sends,0);
  assert.equal((await app.w.capp.solana.latch.walletList()).wallets.length,2,'Repeated launch reuses the payer and receiver');
  await app.cancel();await app.click('[data-action=history-open][data-id="checkout:'+first.id+'"]');await app.click('[data-guide-resume=understand-checkout]');await app.started('understand-checkout');
  assert.equal(app.tour().recordId,first.id);assert.equal(app.tour().runMode,'resume');await app.advance();await app.advance();
  // JSDOM clicks are untrusted. Exercise the real confirmation boundary and
  // prove that a synthetic/brokered continuation cannot approve the payment.
  // Physical browser gestures and layout require separate acceptance.
  assert.equal(app.tour().steps[app.tour().index].continuation,undefined);
  await app.click('[data-ftue-action=perform]');await app.until(()=>app.tour().actionState==='failed','Trusted confirmation boundary');
  assert.match(app.q('[data-ftue-action-status]').textContent,/Click the Guide action to confirm this step/);
  assert.equal(app.evidence().state.payments.filter(p=>p.kind==='checkout').length,2);
  assert.deepEqual(app.evidence().state.payments.find(p=>p.id===first.id),first);assert.deepEqual(app.evidence().state.payments.find(p=>p.id===second.id),second);
  assert.equal(app.effects.authorisations,0);assert.equal(app.rpc.sends,0);await app.cancel();
 });
 await check('a fresh app retains old receipts and starts the next demo with a new identity',async()=>{
  const previous=app.evidence().state.payments,seed=app.snapshot();assert.deepEqual(app.errors.map(error=>error.message),[]);app.close();app=await openApp(seed);
  assert.deepEqual(app.evidence().state.payments,previous);assert.equal(app.rpc.sends,0);
  await app.go('recovery');await app.click('[data-guide-start=understand-recovery]');await app.started('understand-recovery');const next=await app.prepareRecovery();
  assert.ok(!previous.some(p=>p.id===next.id));assert.deepEqual(app.evidence().state.payments.filter(p=>p.id!==next.id),previous);
  assert.deepEqual(app.evidence().state.payments.find(p=>p.id===firstReceipt.id).operation.receipt,firstReceipt.operation.receipt);await app.cancel();
  assert.equal(app.effects.authorisations,0);assert.equal(app.rpc.sends,0);assert.deepEqual(app.errors.map(error=>error.message),[]);
 });
 console.log(JSON.stringify({passed,domControls:true,layoutVerified:false,nativeExecutionVerified:false,liveNetworkCalls:0,fundedTransfer:false}));
}finally{app?.close();}
