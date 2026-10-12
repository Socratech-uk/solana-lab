import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fixture} from './devnet-fixture.mjs';
import {capabilityFixture,recipient,mint} from './capability-fixture.mjs';
import {CapabilityLab} from '../src/capability-lab.mjs';
import {createGuidedActions} from '../src/guided-actions.mjs';
import {MarketPulse,SOL_MINT} from '../sidecars/market-pulse/core.mjs';

let passed=0;
const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
async function setup(f=fixture()){
 const saved=new Map(),storage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)},selected={};
 const market=new MarketPulse({providerMode:'manual',remember:false});market.ingest({protocol:'capp.market-feed.v1',instruments:[{id:SOL_MINT,quote:{price:150,time:Date.now()}}]});
 let lab=new CapabilityLab({storage,market,call:(c,m,i)=>f.api[c][m](i)});
 const wallet=await lab.connectWallet();if(f.state.sender!==undefined)f.state.sender=wallet.walletPubkey;
 const forms={checkout:{amount:'0.00001',recipient:wallet.walletPubkey},treasury:{amount:'0.00002',recipient:wallet.walletPubkey},service:{title:'Guided service',text:'[{"tasks":7}]',amount:'0.00001',recipient:wallet.walletPubkey},proof:{title:'Guided proof',text:'Exact document',amount:'0.00001',recipient:wallet.walletPubkey},batch:{title:'Five contributors',items:Array.from({length:5},(_,i)=>({label:'Contributor '+(i+1),amount:'0.00001',recipient:wallet.walletPubkey}))},positions:{amount:'0.1',recipient:wallet.walletPubkey},tokens:{mint,amount:'1',recipient},requests:{amount:'0.00002',recipient,minutes:'60',assetKind:'native'},policy:{}};
 const actions=()=>createGuidedActions({getLab:()=>lab,forms,selected});let list=actions();
 const run=(name,args={},context={})=>list.find(a=>a.definition.id==='solana-lab.'+name).handler(args,context);
 const step=(kind,progress,extra={})=>run('transaction.step',{kind},{userConfirmed:true,checkpoint:progress?.guide?.checkpoint||'',...extra});
 const finish=async(kind,progress)=>{let next=progress||await step(kind);const phases=[];for(let n=0;n<40&&!next.guide.complete;n++){phases.push(next.phase);next=await step(kind,next);}assert.equal(next.guide.complete,true);return {next,phases};};
 return {f,forms,selected,run,step,finish,open:(id,options)=>list.openRun(id,options),reset:id=>list.resetRun(id),get lab(){return lab;},reload:()=>{lab=new CapabilityLab({storage,market,call:(c,m,i)=>f.api[c][m](i)});list=actions();},storage};
}
await test('checkout requires a click, renders separate sign/send/receipt phases and rejects checkpoint replay',async()=>{
 const x=await setup();await x.run('run.review',{kind:'checkout'});await x.run('payment.prepare',{kind:'checkout'});
 await assert.rejects(()=>x.run('transaction.step',{kind:'checkout'}),/Confirm this step in Guide/);assert.equal(x.f.sends,0);
 const sign=await x.step('checkout');assert.equal(sign.phase,'approve');assert.equal(x.lab.payment(x.selected.checkout).state,'preflighted');
 const send=await x.step('checkout',sign);assert.equal(send.phase,'submit');assert.equal(x.f.sends,0);
 const replay=await x.step('checkout',sign);assert.equal(replay.phase,'submit');assert.equal(x.f.sends,0);
 const receipt=await x.step('checkout',replay);assert.equal(receipt.phase,'receipt');assert.equal(x.f.sends,1);
 assert.equal((await x.step('checkout',receipt)).guide.complete,true);
 await x.finish('checkout');assert.equal(x.f.sends,1);
});
await test('treasury guides two distinct local reviews before wallet approval',async()=>{
 const x=await setup();await x.run('run.review',{kind:'treasury'});await x.run('payment.prepare',{kind:'treasury'});
 const {phases}=await x.finish('treasury');assert.deepEqual(phases,['member','member','approve','submit','receipt']);assert.equal(x.f.sends,1);
 assert.deepEqual(x.lab.payment(x.selected.treasury).request.approvals.map(a=>a.memberId),['ari','bo']);
});
await test('all five batch children finish separately; restart retains identities and never resends completed payouts',async()=>{
 const x=await setup();await x.run('run.review',{kind:'batch'});await x.run('workflow.prepare',{kind:'batch'});
 const id=x.selected.batch,ids=x.lab.workflow(id).items.map(i=>i.operationId);
 let next=await x.step('batch');assert.match(next.guide.title,/Payout 1 of 5/);
 for(let n=0;n<3;n++)next=await x.step('batch',next);
 assert.equal(next.phase,'prepare');assert.match(next.guide.title,/Payout 2 of 5/);assert.equal(x.f.sends,1);
 x.reload();next=await x.step('batch',next);assert.equal(next.phase,'prepare');assert.equal(x.f.sends,1);
 await x.finish('batch',next);assert.equal(x.f.sends,5);assert.deepEqual(x.lab.workflow(id).items.map(i=>i.operationId),ids);assert.equal(x.lab.progress(x.lab.workflow(id)).confirmed,5);
 await x.run('workflow.prepare',{kind:'batch'});await x.finish('batch');assert.equal(x.f.sends,5);
});
await test('service continues through report delivery and its separate linked proof payment',async()=>{
 const x=await setup();await x.run('run.review',{kind:'service'});await x.run('workflow.prepare',{kind:'service'});await x.finish('service');await x.run('workflow.deliver');
 const proof=await x.run('workflow.anchor');assert.equal(x.f.sends,1);await x.finish('service-proof');
 const result=await x.run('workflow.compare',{source:'service'});assert.equal(result.matches,true);assert.equal(result.chainObserved,true);assert.equal(x.f.sends,2);
 assert.equal((await x.run('workflow.anchor')).workflowId,proof.workflowId);await x.finish('service-proof');assert.equal(x.f.sends,2);
});
await test('document walkthrough verifies its exact text only after the guided payment',async()=>{
 const x=await setup();await x.run('run.review',{kind:'proof'});await x.run('workflow.prepare',{kind:'proof'});await assert.rejects(()=>x.run('workflow.compare'),/verified/);await x.finish('proof');assert.equal((await x.run('workflow.compare')).matches,true);
});
await test('lost submit response switches to observing the original attempt without another send',async()=>{
 const x=await setup(fixture({lostReply:true}));await x.run('run.review',{kind:'checkout'});await x.run('payment.prepare',{kind:'checkout'});
 let next=await x.step('checkout');next=await x.step('checkout',next);const attempt=x.lab.payment(x.selected.checkout).operation.attemptId;next=await x.step('checkout',next);assert.equal(next.phase,'receipt');assert.equal(x.f.sends,1);
 await x.finish('checkout',next);assert.equal(x.f.sends,1);assert.equal(x.lab.payment(x.selected.checkout).operation.attemptId,attempt);
});
await test('pending finality keeps the receipt checkpoint open and becomes complete only after observation',async()=>{
 const x=await setup(fixture({confirmationStatus:'processed'}));await x.run('run.review',{kind:'checkout'});await x.run('payment.prepare',{kind:'checkout'});
 let next=await x.step('checkout');for(let n=0;n<3;n++)next=await x.step('checkout',next);assert.equal(next.phase,'receipt');assert.equal(next.guide.complete,false);assert.equal(x.f.sends,1);
 x.f.state.confirmationStatus='confirmed';assert.equal((await x.step('checkout',next)).guide.complete,true);assert.equal(x.f.sends,1);
});
await test('wallet cancellation cannot send or falsely finish the walkthrough',async()=>{
 const x=await setup();await x.run('run.review',{kind:'checkout'});await x.run('payment.prepare',{kind:'checkout'});const next=await x.step('checkout');x.f.ctx.confirm=()=>false;
 const rejected=await x.step('checkout',next);assert.equal(rejected.guide.complete,false);assert.notEqual(rejected.phase,'submit');assert.equal(x.f.sends,0);
});
await test('token walkthrough preserves exact asset identity and completes sign/send/receipt',async()=>{
 const x=await setup(capabilityFixture());await x.run('token.review');await x.run('mint.inspect');await x.run('token.prepare');const id=x.selected.tokens;const asset=structuredClone(x.lab.payment(id).asset);await x.finish('tokens');assert.equal(x.f.sends,1);assert.deepEqual(x.lab.payment(id).asset,asset);
});
await test('blocked token permission stays blocked without signing or inventing a receipt',async()=>{
 const x=await setup(capabilityFixture({allowed:false}));await x.run('token.review');await x.run('mint.inspect');const next=await x.run('token.prepare');assert.equal(next.guide.complete,false);assert.match(next.guide.title,/setup/);assert.equal(x.lab.state.payments.length,0);assert.equal(x.lab.state.guideBindings?.tokens,undefined);assert.equal(x.f.sends,0);
});
await test('request payment is followed by independent finalized credit verification',async()=>{
 const x=await setup(capabilityFixture());await x.run('request.review');await x.run('request.create');const id=x.selected.requests;await x.finish('requests');assert.equal(x.lab.request(id).verification,undefined);
 x.f.state.noCredit=true;await assert.rejects(()=>x.run('request.verifyBound',{kind:'requests'}),/credit|balance|receive/i);assert.equal(x.lab.request(id).verification,undefined);
 x.f.state.noCredit=false;assert.equal((await x.run('request.verifyBound',{kind:'requests'})).paid,true);assert.equal(x.f.sends,1);await x.finish('requests');assert.equal(x.f.sends,1);
});
await test('saved request payer workflow keeps its selected request even if page selection changes',async()=>{
 const x=await setup(capabilityFixture());const a=await x.lab.createRequest(x.forms.requests),b=await x.lab.createRequest({...x.forms.requests,label:'Other'});x.open('pay-payment-request',{recordId:a.id});await x.run('request.payReview');x.selected.requests=b.id;await x.finish('request-payment');assert.ok(x.lab.request(a.id).paymentId);assert.equal(x.lab.request(b.id).paymentId,undefined);await x.run('request.verifyBound',{kind:'request-payment'});assert.equal(x.lab.request(a.id).verification.paid,true);
});
await test('optional Arena evidence uses a separate real devnet payment with the scaled amount',async()=>{
 const x=await setup();await x.run('position.open',{units:10});await x.run('position.change',{action:'close'});const p=await x.run('position.evidencePrepare');assert.equal(x.lab.payment(p.operationId).amountLamports,10000);await x.finish('position-evidence');assert.equal(x.f.sends,1);
});
await test('a changed operation must be redisplayed before the next Guide effect',async()=>{
 const x=await setup();await x.run('run.review',{kind:'checkout'});await x.run('payment.prepare',{kind:'checkout'});const sign=await x.step('checkout');await x.lab.approvePayment(x.selected.checkout);const send=await x.step('checkout',sign);assert.equal(send.phase,'submit');assert.equal(x.f.sends,0);
});
await test('workflow commitment mismatches cannot be treated as a completed child',async()=>{
 const x=await setup();await x.run('run.review',{kind:'proof'});await x.run('workflow.prepare',{kind:'proof'});await x.finish('proof');
 const w=x.lab.workflow(x.selected.proof),p=x.lab.itemPayment(w,w.items[0]);p.operation.commitment.sha256='f'.repeat(64);x.lab.save();
 const next=await x.step('proof');assert.equal(next.guide.complete,false);assert.equal(next.phase,'receipt');assert.equal(x.f.sends,1);
});
await test('a queued signing click rechecks its reviewed snapshot under the workspace lock',async()=>{
 const x=await setup();await x.run('run.review',{kind:'checkout'});await x.run('payment.prepare',{kind:'checkout'});const sign=await x.step('checkout');
 const descriptor=Object.getOwnPropertyDescriptor(navigator,'locks');let entered,release;
 const waiting=new Promise(r=>entered=r),hold=new Promise(r=>release=r);
 Object.defineProperty(navigator,'locks',{configurable:true,value:{request:async(_key,work)=>{entered();await hold;return work();}}});
 try{
  const nextPromise=x.step('checkout',sign);await waiting;const p=x.lab.payment(x.selected.checkout);p.error='Changed in another context';x.lab.save();release();const next=await nextPromise;
  assert.equal(next.phase,'approve');assert.equal(x.lab.payment(p.id).state,'preflighted');assert.equal(x.f.sends,0);
 }finally{if(descriptor)Object.defineProperty(navigator,'locks',descriptor);else delete navigator.locks;}
});
await test('an explicit saved-request launch follows the chosen row after an earlier guided payment',async()=>{
 const x=await setup(capabilityFixture());const a=await x.lab.createRequest(x.forms.requests);x.open('pay-payment-request',{recordId:a.id});await x.run('request.payReview');await x.finish('request-payment');
 const b=await x.lab.createRequest({...x.forms.requests,label:'Next request'});x.open('pay-payment-request',{recordId:b.id});await x.run('request.payReview');await x.finish('request-payment');assert.equal(x.f.sends,2);assert.ok(x.lab.request(a.id).paymentId);assert.ok(x.lab.request(b.id).paymentId);assert.equal(x.selected.requests,b.id);
});
await test('a fresh service retains its unresolved linked document and can resume it explicitly',async()=>{
 const x=await setup();await x.run('run.review',{kind:'service'});await x.run('workflow.prepare',{kind:'service'});await x.finish('service');await x.run('workflow.deliver');await x.run('workflow.anchor');const id=x.selected.service,before=JSON.stringify(x.lab.state.workflows);assert.equal(x.reset('demo-service').retainedRecord,id);assert.equal(JSON.stringify(x.lab.state.workflows),before);x.open('demo-service',{recordId:id});await x.finish('service-proof');assert.equal(x.reset('demo-service').reset,true);
});
await test('page launch can continue an explicitly visible manual workflow without creating another order',async()=>{
 const x=await setup();const w=await x.lab.createWorkflow({kind:'service',...x.forms.service});await x.lab.prepareWorkflowPayment(w.id,w.items[0].id);
 x.open('demo-service',{recordId:w.id});await x.run('run.review',{kind:'service'});await x.run('workflow.prepare',{kind:'service'});await x.finish('service');assert.equal(x.lab.state.workflows.length,1);assert.equal(x.f.sends,1);assert.equal(x.lab.state.guideBindings.service,w.id);
});

for(const kind of ['checkout','treasury','service','batch','proof','tokens','requests','position-evidence'])await test(kind+' recovers an expired review without losing its workflow binding',async()=>{
 const x=await setup(['tokens','requests'].includes(kind)?capabilityFixture():fixture());
 if(['service','batch','proof'].includes(kind)){await x.run('run.review',{kind});await x.run('workflow.prepare',{kind});}
 else if(kind==='tokens'){await x.run('token.review');await x.run('mint.inspect');await x.run('token.prepare');}
 else if(kind==='requests'){await x.run('request.review');await x.run('request.create');await x.lab.prepareRequest(x.selected.requests);}
 else if(kind==='position-evidence'){await x.run('position.open',{units:1});await x.run('position.evidencePrepare');}
 else{await x.run('run.review',{kind});await x.run('payment.prepare',{kind});}
 let next=await x.step(kind);
 while(next.phase==='member')next=await x.step(kind,next);
 const oldId=next.operationId,old=structuredClone(x.lab.payment(oldId));
 x.f.state.blockhashValid=false;
 next=await x.step(kind,next);assert.equal(next.phase,'refresh');assert.equal(x.f.sends,0);
 x.f.state.blockhashValid=true;x.f.state.blockhash='SysvarRent111111111111111111111111111111111';
 next=await x.step(kind,next);
 const newId=next.operationId;assert.notEqual(newId,oldId);
 assert.equal(x.lab.payment(oldId).replacementPaymentId,newId);
 assert.equal(x.lab.payment(newId).walletPubkey,old.walletPubkey);assert.equal(x.lab.payment(newId).recipient,old.recipient);
 if(kind==='treasury'){assert.equal(next.phase,'member');assert.equal(x.lab.payment(newId).request.approvals.length,0);}
 x.reload();await x.finish(kind);assert.equal(x.f.sends,kind==='batch'?5:1);
 assert.equal(x.lab.payment(oldId).state,'expired');
 if(kind==='service'){await x.run('workflow.deliver');assert.ok(x.lab.workflow(x.selected.service).delivery.complete);}
 if(kind==='requests'){assert.equal((await x.run('request.verifyBound',{kind:'requests'})).paid,true);}
});
await test('expired second payout refreshes only that item after the first receipt',async()=>{
 const x=await setup(capabilityFixture());await x.run('run.review',{kind:'batch'});await x.run('workflow.prepare',{kind:'batch'});
 let next=await x.step('batch');for(let i=0;i<3;i++)next=await x.step('batch',next);
 const w=x.lab.workflow(x.selected.batch),firstId=w.items[0].operationId;assert.equal(x.lab.paid(w,w.items[0]),true);
 next=await x.step('batch',next);x.f.state.blockhashValid=false;next=await x.step('batch',next);assert.equal(next.phase,'refresh');
 x.f.state.blockhashValid=true;next=await x.step('batch',next);await x.finish('batch',next);
 assert.equal(x.lab.workflow(w.id).items[0].operationId,firstId);assert.equal(x.f.sends,5);
});
await test('expired request terms are retained and cannot be extended by transaction refresh',async()=>{
 const x=await setup(capabilityFixture());await x.run('request.review');await x.run('request.create');const id=x.selected.requests;await x.lab.prepareRequest(id);
 const row=x.lab.request(id),payment=x.lab.payment(row.paymentId),before=Date.now;
 Date.now=()=> (row.terms.expiresAt+10)*1000;
 x.f.ctx.expiredTestTime=Date.now();vm.runInContext('Date.now=()=>expiredTestTime',x.f.ctx);
 try{
  let next=await x.step('requests');next=await x.step('requests',next);assert.equal(next.phase,'blocked');assert.match(next.guide.body,/request itself expired/);
  await assert.rejects(()=>x.lab.refreshPayment(payment.id),/request itself has expired/);assert.equal(x.f.sends,0);
 }finally{Date.now=before;}
});
await test('unknown payment cannot be refreshed even after its blockhash expires',async()=>{
 const x=await setup(fixture({lostReply:true}));await x.run('run.review',{kind:'checkout'});await x.run('payment.prepare',{kind:'checkout'});
 let next=await x.step('checkout');next=await x.step('checkout',next);next=await x.step('checkout',next);x.f.state.blockhashValid=false;
 await assert.rejects(()=>x.lab.refreshPayment(next.operationId),/never-submitted/);await x.finish('checkout',next);assert.equal(x.f.sends,1);
});
await test('Guide creates a receiver only on its named confirmed click and keeps the payer selected',async()=>{
 const x=await setup(fixture({walletMode:'device-wallet'})),payer=(await x.f.api.latch.status()).wallet.walletPubkey;
 x.forms.tokens.recipient='';await x.run('token.review');
 await assert.rejects(()=>x.run('token.receiver'),/Confirm this step in Guide/);
 await x.run('token.receiver',{}, {userConfirmed:true});
 assert.equal((await x.f.api.latch.walletList()).wallets.length,2);assert.notEqual(x.forms.tokens.recipient,payer);
 assert.equal((await x.f.api.latch.status()).wallet.walletPubkey,payer);
 await x.run('token.receiver',{}, {userConfirmed:true});assert.equal((await x.f.api.latch.walletList()).wallets.length,2);
 assert.ok(!x.lab.state.events.some(e=>e.method==='walletCreate'));assert.equal(x.f.sends,0);
});
console.log(JSON.stringify({passed,native:false,network:'offline-signed-fixtures'}));
