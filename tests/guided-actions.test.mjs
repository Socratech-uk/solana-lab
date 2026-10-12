import assert from 'node:assert/strict';
import {fixture} from './devnet-fixture.mjs';
import {ShowcaseLab} from '../src/workflows.mjs';
import {createGuidedActions} from '../src/guided-actions.mjs';
import {setDemoReceiver} from '../src/demo-wallets.mjs';
import {recipient as demoReceiver} from './capability-fixture.mjs';
import {MarketPulse,SOL_MINT} from '../sidecars/market-pulse/core.mjs';
const f=fixture(),saved=new Map(),storage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)};
const market=new MarketPulse({providerMode:'manual',remember:false});
let lab=new ShowcaseLab({call:(c,m,i)=>f.api[c][m](i),storage,market}),passed=0;
const forms={checkout:{amount:'0.00001',recipient:''},treasury:{amount:'0.00002',recipient:''},policy:{},positions:{},service:{title:'Guided order',text:'[{"tasks":2},{"tasks":7}]',amount:'0.00001',recipient:''},batch:{title:'Guided batch',items:[]},proof:{title:'Guided proof',text:'Exact text',amount:'0.00001',recipient:''}},selected={};
const actions=createGuidedActions({getLab:()=>lab,forms,selected}),run=(name,args={})=>actions.find(a=>a.definition.id==='solana-lab.'+name).handler(args);
const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
const finish=async p=>{await lab.approvePayment(p.id);await lab.submitPayment(p.id);await lab.reconcilePayment(p.id);};
await test('devnet prepare blocks a missing wallet and retry retains its bound identity',async()=>{await assert.rejects(()=>run('run.review',{kind:'checkout'}),/wallet/);await assert.rejects(()=>run('payment.prepare',{kind:'checkout'}),/wallet/);const id=lab.state.guideBindings.checkout;const wallet=await lab.connectWallet();await setDemoReceiver(lab,{walletPubkey:demoReceiver});for(const kind of ['checkout','treasury','service','proof'])forms[kind].recipient=wallet.walletPubkey;forms.batch.items=[{label:'A',recipient:wallet.walletPubkey,amount:'0.00001'},{label:'B',recipient:wallet.walletPubkey,amount:'0.00002'}];const result=await run('payment.prepare',{kind:'checkout'});assert.equal(result.operationId,id);assert.equal(f.sends,0);await run('payment.prepare',{kind:'checkout'});assert.equal(lab.state.payments.length,1);});
await test('Guide cannot advance a live transfer until the user path produces its exact receipt',async()=>{await assert.rejects(()=>run('payment.verify',{kind:'checkout'}),/receipt/);const p=lab.payment(selected.checkout);await finish(p);assert.equal((await run('payment.verify',{kind:'checkout'})).operationId,p.id);const current=lab.payment(p.id),amount=current.amountLamports;current.amountLamports++;await assert.rejects(()=>run('payment.verify',{kind:'checkout'}),/exact request/);current.amountLamports=amount;});
await test('treasury retains the actual quorum and wallet approval gates',async()=>{await run('run.review',{kind:'treasury'});await run('payment.prepare',{kind:'treasury'});const p=lab.payment(selected.treasury);await assert.rejects(()=>lab.approvePayment(p.id),/two/);await lab.memberApprove(p.id,'ari');await lab.memberApprove(p.id,'bo');await finish(p);assert.equal((await run('payment.verify',{kind:'treasury'})).network,'devnet');});
for(const kind of ['service','batch','proof'])await test('guided '+kind+' prepares durable children and verifies actual receipt-gated completion',async()=>{
 const before=f.sends;await run('run.review',{kind});await run('workflow.prepare',{kind});const w=lab.workflow(selected[kind]),count=lab.state.workflows.length;
 await run('workflow.prepare',{kind});assert.equal(lab.state.workflows.length,count);assert.equal(f.sends,before);
 await assert.rejects(()=>run('workflow.verify',{kind}),/receipt/);
 for(const item of w.items){const p=await lab.prepareWorkflowPayment(w.id,item.id);await finish(p);}
 assert.equal((await run('workflow.verify',{kind})).confirmed,w.items.length);
 if(kind==='service'){const first=await run('workflow.deliver'),second=await run('workflow.deliver');assert.deepEqual(first,second);assert.equal(lab.workflow(w.id).delivery.artifact.numericTotals.tasks,9);}
 if(kind==='proof'){const result=await run('workflow.compare');assert.equal(result.matches,true);assert.equal(result.chainObserved,true);}
});
await test('real simulated positions refuse stale prices and finish open, reduce, close and sweep',async()=>{
 await assert.rejects(()=>run('position.open',{units:10}),/fresh SOL price/);assert.equal(lab.state.positions.length,0);
 market.ingest({protocol:'capp.market-feed.v1',instruments:[{id:SOL_MINT,quote:{price:150,time:Date.now()}}]});
 const opened=await run('position.open',{units:10});await run('position.open',{units:10});assert.equal(lab.state.positions.length,1);
 await run('position.change',{action:'reduce'});await run('position.change',{action:'reduce'});await run('position.change',{action:'close'});
 const p=lab.position(opened.positionId);assert.equal(p.rail.state,'rail_bucket_reusable');assert.equal(p.jobs.length,3);assert.ok(p.jobs.every(j=>j.receipt.simulated));
});
await test('reload and retry keep recorded workflow identities instead of creating replacements',async()=>{const counts=[lab.state.payments.length,lab.state.workflows.length,lab.state.positions.length],sends=f.sends;lab=new ShowcaseLab({call:(c,m,i)=>f.api[c][m](i),storage,market});await run('workflow.prepare',{kind:'service'});await run('payment.prepare',{kind:'checkout'});await run('position.open',{units:10});assert.deepEqual([lab.state.payments.length,lab.state.workflows.length,lab.state.positions.length],counts);assert.equal(f.sends,sends);});
await test('explicit New run retains both completed and unfinished records while detaching the walkthrough',async()=>{const old=lab.state.guideBindings.checkout,count=lab.state.payments.length;const reset=actions.resetRun('understand-checkout');assert.equal(reset.retainedRecord,old);assert.equal(lab.state.payments.length,count);const next=await run('payment.prepare',{kind:'checkout'});assert.notEqual(next.operationId,old);const before=JSON.stringify(lab.payment(next.operationId));assert.equal(actions.resetRun('understand-checkout').retainedRecord,next.operationId);assert.equal(JSON.stringify(lab.payment(next.operationId)),before);assert.equal(selected.checkout,'new');});
await test('only the confirmed transaction handler can drive real signing/sending; private wallet actions stay unavailable',async()=>{assert.equal(actions.find(a=>a.definition.id==='solana-lab.transaction.step').definition.requiresUserConfirmation,true);assert.equal(actions.filter(a=>/approve|submit/.test(a.definition.id)).every(a=>a.definition.id.startsWith('solana-lab.recovery.')),true);await assert.rejects(()=>run('payment.prepare',{kind:'recovery'}),/not declared/);await assert.rejects(()=>run('workflow.prepare',{kind:'mainnet'}),/not declared/);});

await test('policy examples explain expected rejections and verify the exact failing check',async()=>{
 for(const scenario of ['normal','fee','stale']){const result=await run('policy.check',{scenario});assert.equal(result.expected,true);assert.match(result.explanation,scenario==='normal'?/passed/:/Expected rejection/);assert.match(result.explanation,/No wallet funds|no wallet/i);}
});
await test('a prior history record cannot supply hidden draft inputs for a new guided workflow',async()=>{
 const old=lab.state.guideBindings.service,oldBytes=JSON.stringify(lab.workflow(old)),count=lab.state.workflows.length;
 actions.resetRun('demo-service');selected.service=old;forms.service.recipient='';
 await assert.rejects(()=>run('workflow.prepare',{kind:'service'}),/new request form is now open/);
 assert.equal(selected.service,'new');assert.equal(lab.state.workflows.length,count);
 const sender=(await f.api.latch.status()).wallet.walletPubkey;
 await run('workflow.prepare',{kind:'service'});assert.equal(forms.service.recipient,demoReceiver);assert.equal(JSON.stringify(lab.workflow(old)),oldBytes);const next=lab.workflow(selected.service);assert.equal(next.sender,sender);assert.notEqual(next.id,old);
 const before=JSON.stringify(next);await run('workflow.prepare',{kind:'service'});assert.equal(JSON.stringify(lab.workflow(next.id)),before);
});
await test('a mismatched recovery binding cannot route automation to a live payment',async()=>{lab.state.guideBindings.recovery=lab.state.payments.find(p=>p.kind==='checkout').id;await assert.rejects(()=>run('recovery.approve'),/does not match/);});
await test('corrupt binding data fails without replacing saved bytes',async()=>{lab.state.guideBindings=[];lab.save();const before=saved.get(lab.key);await assert.rejects(()=>run('payment.prepare',{kind:'checkout'}),/unreadable/);assert.equal(saved.get(lab.key),before);});
console.log(JSON.stringify({passed,network:'fixture-only',native:false}));
