import assert from 'node:assert/strict';
import {fixture} from './devnet-fixture.mjs';
import {capabilityFixture,recipient,mint} from './capability-fixture.mjs';
import {CapabilityLab} from '../src/capability-lab.mjs';
import {createGuidedActions} from '../src/guided-actions.mjs';
import {DEMO_PROFILE} from '../src/catalog.mjs';
import {MarketPulse,SOL_MINT} from '../sidecars/market-pulse/core.mjs';
import {setDemoReceiver,readDemoWalletRoles} from '../src/demo-wallets.mjs';

let passed=0;
const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function setup(f=fixture()){
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},selected={};
 const market=new MarketPulse({providerMode:'manual',remember:false});market.ingest({protocol:'capp.market-feed.v1',instruments:[{id:SOL_MINT,quote:{price:150,time:Date.now()}}]});
 const overrides=Object.fromEntries(DEMO_PROFILE.library.selected.map(row=>[row.id.replace('uk.capp.sidecar.solana-',''),{...row.config,...(row.id.endsWith('solana-arena')?{failureMode:'drop-response'}:{})}]));
 const recovery=fixture({overrides});
 let lab=new CapabilityLab({storage,market,call:(c,m,i,scope)=> (scope==='recovery'?recovery.api:f.api)[c][m](i)});
 const wallet=await lab.connectWallet();if(f.state.sender!==undefined)f.state.sender=wallet.walletPubkey;
 const forms={checkout:{amount:'0.00001',recipient:wallet.walletPubkey},treasury:{amount:'0.00002',recipient:wallet.walletPubkey},service:{title:'Fresh service',text:'[{"tasks":7}]',amount:'0.00001',recipient:wallet.walletPubkey},proof:{title:'Fresh proof',text:'Exact document',amount:'0.00001',recipient:wallet.walletPubkey},batch:{title:'Two contributors',items:[{label:'A',amount:'0.00001',recipient:wallet.walletPubkey},{label:'B',amount:'0.00002',recipient:wallet.walletPubkey}]},positions:{amount:'0.1',recipient:wallet.walletPubkey},tokens:{mint,amount:'1',recipient},requests:{amount:'0.00002',recipient,minutes:'60',assetKind:'native'},policy:{}};
 const create=()=>createGuidedActions({getLab:()=>lab,forms,selected});let actions=create();
 const run=(name,args={},context={})=>actions.find(a=>a.definition.id==='solana-lab.'+name).handler(args,context);
 const step=(kind,previous)=>run('transaction.step',{kind},{userConfirmed:true,checkpoint:previous?.guide?.checkpoint||''});
 const finish=async(kind,previous)=>{let next=previous||await step(kind);for(let n=0;n<30&&!next.guide.complete;n++)next=await step(kind,next);assert.equal(next.guide.complete,true);return next;};
 const start=(workflowId,extra={})=>actions.startRun({workflowId,runId:crypto.randomUUID(),runMode:'new',...extra});
 return {f,recovery,forms,selected,values,storage,run,step,finish,start,get lab(){return lab;},get actions(){return actions;},reload:()=>{lab=new CapabilityLab({storage,market,call:(c,m,i,scope)=>(scope==='recovery'?recovery.api:f.api)[c][m](i)});actions=create();}};
}

for(const kind of ['checkout','treasury'])await test(kind+' starts a fresh reviewed operation after completion and preserves its former receipt',async()=>{
 const x=await setup(),workflow='understand-'+kind;
 await x.start(workflow);await x.run('run.review',{kind});await x.run('payment.prepare',{kind});await x.finish(kind);
 const id=x.selected[kind],before=JSON.stringify(x.lab.payment(id)),sends=x.f.sends;
 await x.start(workflow);assert.equal(x.selected[kind],'new');assert.equal(x.f.sends,sends);
 await x.run('run.review',{kind});const next=await x.run('payment.prepare',{kind});assert.notEqual(next.operationId,id);
 assert.equal(JSON.stringify(x.lab.payment(id)),before);assert.equal(x.lab.payment(next.operationId).state,'preflighted');assert.equal(x.f.sends,sends);
});

await test('new checkout detaches an unknown send and exact-record continuation reconciles it without resending',async()=>{
 const x=await setup(fixture({lostReply:true}));await x.start('understand-checkout');await x.run('run.review',{kind:'checkout'});await x.run('payment.prepare',{kind:'checkout'});
 let next=await x.step('checkout');next=await x.step('checkout',next);next=await x.step('checkout',next);
 const id=next.operationId,old=JSON.stringify(x.lab.payment(id)),attempt=x.lab.payment(id).operation.attemptId;
 assert.equal(x.lab.payment(id).state,'unknown');assert.equal(x.f.sends,1);
 await x.start('understand-checkout');assert.equal(JSON.stringify(x.lab.payment(id)),old);assert.equal(x.f.sends,1);
 await x.run('payment.prepare',{kind:'checkout'});assert.notEqual(x.selected.checkout,id);assert.equal(JSON.stringify(x.lab.payment(id)),old);
 await x.start('understand-checkout',{runMode:'resume',recordId:id});const restored=await x.step('checkout',next);
 assert.equal(restored.phase,'receipt');assert.equal(restored.guide.complete,false);assert.equal(x.lab.payment(id).state,'unknown');
 await x.finish('checkout',restored);assert.equal(x.f.sends,1);assert.equal(x.lab.payment(id).operation.attemptId,attempt);
});

await test('a fresh service gets new child and proof identities while retaining its unresolved old proof',async()=>{
 const x=await setup();await x.start('demo-service');await x.run('run.review',{kind:'service'});await x.run('workflow.prepare',{kind:'service'});await x.finish('service');await x.run('workflow.deliver');await x.run('workflow.anchor');
 const old=x.lab.workflow(x.selected.service),oldProof=x.lab.workflow(old.proofId),before=JSON.stringify([old,oldProof]),sends=x.f.sends;
 await x.start('demo-service');await x.run('run.review',{kind:'service'});await x.run('workflow.prepare',{kind:'service'});
 const next=x.lab.workflow(x.selected.service);assert.notEqual(next.id,old.id);assert.notEqual(next.items[0].operationId,old.items[0].operationId);assert.equal(x.f.sends,sends);
 await x.finish('service');await x.run('workflow.deliver');await x.run('workflow.anchor');
 assert.notEqual(x.lab.workflow(next.id).proofId,oldProof.id);assert.equal(JSON.stringify([x.lab.workflow(old.id),x.lab.workflow(oldProof.id)]),before);
});

for(const kind of ['batch','proof'])await test(kind+' starts independent children while all prior unfinished terms remain unchanged',async()=>{
 const x=await setup();await x.start('demo-'+kind);await x.run('run.review',{kind});await x.run('workflow.prepare',{kind});
 const id=x.selected[kind],before=JSON.stringify(x.lab.workflow(id)),oldIds=x.lab.workflow(id).items.map(i=>i.operationId);
 await x.start('demo-'+kind);await x.run('run.review',{kind});await x.run('workflow.prepare',{kind});
 assert.notEqual(x.selected[kind],id);assert.ok(x.lab.workflow(x.selected[kind]).items.every(i=>!oldIds.includes(i.operationId)));assert.equal(JSON.stringify(x.lab.workflow(id)),before);assert.equal(x.f.sends,0);
});

await test('every recovery launch creates a distinct isolated simulation and retries retain that run',async()=>{
 const x=await setup();let previous='';
 for(let i=0;i<2;i++){
  await x.start('understand-recovery');const first=await x.run('recovery.prepare');assert.notEqual(first.operationId,previous);
  assert.equal((await x.run('recovery.prepare')).operationId,first.operationId);
  await x.run('recovery.approve');await x.run('recovery.submit');await x.run('recovery.reconcile');
  assert.equal(x.lab.payment(first.operationId).operation.receipt.simulated,true);previous=first.operationId;
 }
 assert.equal(x.lab.state.payments.length,2);assert.equal(x.f.sends,0);assert.equal(x.recovery.sends,0);
});

await test('an unfinished position is retained when a new position lifecycle begins',async()=>{
 const x=await setup();await x.start('plan-position');const first=await x.run('position.open',{units:10}),old=JSON.stringify(x.lab.position(first.positionId));
 await x.start('plan-position');assert.equal(x.forms.positions.positionId,'');const second=await x.run('position.open',{units:5});
 assert.notEqual(second.positionId,first.positionId);assert.equal(x.forms.positions.positionId,second.positionId);assert.equal(JSON.stringify(x.lab.position(first.positionId)),old);assert.equal(x.f.sends,0);
});

await test('a new evidence run makes a separate payment for the same Arena action and keeps every earlier link',async()=>{
 const x=await setup();await x.start('plan-position');const position=await x.run('position.open',{units:10});
 await x.start('anchor-position-evidence');const first=await x.run('position.evidencePrepare');await x.finish('position-evidence');
 const old=JSON.stringify(x.lab.payment(first.operationId)),job=x.lab.position(position.positionId).jobs.at(-1);
 await x.start('anchor-position-evidence');const second=await x.run('position.evidencePrepare');assert.notEqual(second.operationId,first.operationId);
 assert.equal((await x.run('position.evidencePrepare')).operationId,second.operationId);assert.equal(x.f.sends,1);assert.equal(JSON.stringify(x.lab.payment(first.operationId)),old);
 const current=x.lab.position(position.positionId).jobs.find(j=>j.id===job.id);assert.equal(current.evidencePaymentId,first.operationId);assert.deepEqual(current.evidencePaymentIds,[first.operationId,second.operationId]);
 assert.equal((await x.lab.prepareEvidenceTransfer(position.positionId,x.forms.positions)).id,first.operationId);
 await x.start('anchor-position-evidence',{runMode:'resume',recordId:first.operationId});assert.equal(x.selected.evidence,first.operationId);assert.equal(x.f.sends,1);
});

await test('fresh token runs preserve asset choices and the old incomplete payment',async()=>{
 const x=await setup(capabilityFixture());await x.start('demo-token-payment');await x.run('token.review');await x.run('mint.inspect');await x.run('token.prepare');
 const id=x.selected.tokens,before=JSON.stringify(x.lab.payment(id));await x.start('demo-token-payment');await x.run('token.review');await x.run('token.prepare');
 assert.notEqual(x.selected.tokens,id);assert.equal(JSON.stringify(x.lab.payment(id)),before);assert.equal(x.forms.tokens.mint,mint);assert.equal(x.f.sends,0);
});

for(const workflow of ['create-payment-request','pay-payment-request'])await test(workflow+' creates fresh immutable terms and reference without reusing a paid request',async()=>{
 const x=await setup(capabilityFixture()),key=workflow==='create-payment-request'?'requests':'request-payment';
 const prepare=async()=>{if(key==='requests'){await x.run('request.review');return x.run('request.create');}return x.run('request.payReview');};
 await x.start(workflow);await prepare();const id=x.selected.requests;await x.finish(key);await x.run('request.verifyBound',{kind:key});
 const before=JSON.stringify(x.lab.request(id)),old=x.lab.request(id),sends=x.f.sends;
 await x.start(workflow);assert.equal(x.selected.requests,'new');assert.equal(x.f.sends,sends);await prepare();const next=x.lab.request(x.selected.requests);
 assert.notEqual(next.id,id);assert.notEqual(next.terms.reference,old.terms.reference);assert.notEqual(next.terms.requestDigest,old.terms.requestDigest);assert.equal(next.paymentId,undefined);assert.equal(next.verification,undefined);assert.equal(JSON.stringify(x.lab.request(id)),before);assert.equal(x.f.sends,sends);
 const count=x.lab.state.paymentRequests.length;await prepare();assert.equal(x.lab.state.paymentRequests.length,count);
});

await test('generic Pay Guide cannot silently bind a different history card',async()=>{
 const x=await setup(capabilityFixture()),row=await x.lab.createRequest(x.forms.requests);x.selected.requests=row.id;
 await assert.rejects(()=>x.run('request.payReview'),/Review the new request terms/);assert.equal(x.selected.requests,'new');assert.equal(x.lab.state.guideBindings?.['request-payment'],undefined);
 await x.run('request.payReview');assert.notEqual(x.selected.requests,row.id);assert.equal(x.lab.request(row.id).paymentId,undefined);assert.equal(x.f.sends,0);
});

await test('a fresh launch waits for an active preparation and a superseded waiting launch cannot detach it',async()=>{
 const x=await setup(),entered=deferred(),release=deferred(),original=x.lab.preparePayment.bind(x.lab);
 await x.start('understand-checkout');await x.run('run.review',{kind:'checkout'});
 x.lab.preparePayment=async input=>{entered.resolve();await release.promise;return original(input);};
 const running=x.run('payment.prepare',{kind:'checkout'});await entered.promise;const id=x.lab.state.guideBindings.checkout,aborter=new AbortController();
 const superseded=x.start('understand-checkout',{signal:aborter.signal});const rejected=assert.rejects(superseded,{name:'AbortError'});
 aborter.abort();await rejected;assert.equal(x.lab.state.guideBindings.checkout,id);
 const latest=x.start('understand-checkout');await Promise.resolve();assert.equal(x.lab.state.guideBindings.checkout,id);
 release.resolve();await running;await latest;assert.ok(x.lab.payment(id));assert.equal(x.lab.state.guideBindings.checkout,undefined);assert.equal(x.selected.checkout,'new');assert.equal(x.lab.state.payments.length,1);assert.equal(x.f.sends,0);
});

await test('a resumed payment rejects the previous run’s approval checkpoint',async()=>{
 const x=await setup();await x.start('understand-checkout');await x.run('run.review',{kind:'checkout'});await x.run('payment.prepare',{kind:'checkout'});
 const id=x.selected.checkout,old=await x.step('checkout');assert.equal(old.phase,'approve');
 await x.start('understand-checkout',{runMode:'resume',recordId:id});const next=await x.step('checkout',old);assert.equal(next.phase,'approve');assert.notEqual(next.guide.checkpoint,old.guide.checkpoint);assert.equal(x.lab.payment(id).state,'preflighted');assert.equal(x.f.sends,0);
 await assert.rejects(()=>x.start('understand-checkout',{runMode:'resume'}),/exact saved record/);
});

await test('new runs preserve the wallet pair and public role choices',async()=>{
 const x=await setup(fixture({walletMode:'device-wallet'})),receiver=await x.f.api.latch.walletCreate({network:'devnet',label:'Receiver',select:false});
 await setDemoReceiver(x.lab,{walletId:receiver.walletId});x.forms.checkout.recipient=receiver.walletPubkey;
 const wallets=JSON.stringify((await x.f.api.latch.walletList()).wallets),roles=JSON.stringify(await readDemoWalletRoles(x.lab));
 for(let i=0;i<2;i++){await x.start('understand-checkout');await x.run('run.review',{kind:'checkout'});await x.run('payment.prepare',{kind:'checkout'});}
 assert.equal(JSON.stringify((await x.f.api.latch.walletList()).wallets),wallets);assert.equal(JSON.stringify(await readDemoWalletRoles(x.lab)),roles);assert.equal(x.f.sends,0);
});

await test('a new run clears the old captured sender and uses the currently selected payer',async()=>{
 const x=await setup(fixture({walletMode:'device-wallet'})),a=(await x.f.api.latch.status()).wallet,b=await x.f.api.latch.walletCreate({network:'devnet',label:'Second wallet',select:false});
 await setDemoReceiver(x.lab,{walletId:b.walletId});Object.assign(x.forms.checkout,{recipient:b.walletPubkey,demoRecipient:b.walletPubkey});
 await x.start('understand-checkout');await x.run('run.review',{kind:'checkout'});await x.run('payment.prepare',{kind:'checkout'});const first=x.selected.checkout,before=JSON.stringify(x.lab.payment(first));
 x.forms.checkout.walletPubkey=a.walletPubkey;x.forms.checkout.sender=a.walletPubkey;
 await x.f.api.latch.walletSelect({network:'devnet',walletId:b.walletId});await setDemoReceiver(x.lab,{walletId:a.walletId});
 await x.start('understand-checkout');assert.equal(x.forms.checkout.walletPubkey,'');assert.equal(x.forms.checkout.sender,'');
 await x.run('run.review',{kind:'checkout'});await x.run('payment.prepare',{kind:'checkout'});
 assert.equal(x.lab.payment(x.selected.checkout).walletPubkey,b.walletPubkey);assert.equal(x.lab.payment(x.selected.checkout).recipient,a.walletPubkey);assert.equal(JSON.stringify(x.lab.payment(first)),before);assert.equal((await x.f.api.latch.walletList()).wallets.length,2);assert.equal(x.f.sends,0);
});

await test('a new verification walkthrough performs a fresh observation and retains accepted evidence when that read fails',async()=>{
 const x=await setup(capabilityFixture());await x.start('create-payment-request');await x.run('request.review');await x.run('request.create');const id=x.selected.requests;
 await x.finish('requests');await x.run('request.verifyBound',{kind:'requests'});const accepted=JSON.stringify(x.lab.request(id).verification),payments=x.lab.state.payments.length,requests=x.lab.state.paymentRequests.length,sends=x.f.sends;
 await x.start('verify-payment-request');const count=x.f.calls.filter(q=>q.method==='getTransaction').length;
 await x.run('request.verify');assert.ok(x.f.calls.filter(q=>q.method==='getTransaction').length>count);assert.equal(JSON.stringify(x.lab.request(id).verification),accepted);
 x.f.state.noCredit=true;await x.start('verify-payment-request');await assert.rejects(()=>x.run('request.verify'),/credit|balance|receive/i);
 assert.equal(JSON.stringify(x.lab.request(id).verification),accepted);assert.equal(x.lab.request(id).checks.at(-1).paid,false);assert.equal(x.lab.state.payments.length,payments);assert.equal(x.lab.state.paymentRequests.length,requests);assert.equal(x.f.sends,sends);
});

console.log(JSON.stringify({passed,native:false,network:'offline-signed-fixtures',liveBroadcasts:0}));
