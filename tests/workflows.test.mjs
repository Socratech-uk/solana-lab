import assert from 'node:assert/strict';
import {fixture} from './devnet-fixture.mjs';
import {ShowcaseLab,textDigest} from '../src/workflows.mjs';
import {createSolanaClient,hasBoundDevnetReceipt} from '../src/solana-client.mjs';
const f=fixture(),saved=new Map(),storage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)};
let loseDelivery=false;
const call=async(c,m,i)=>{const result=await f.api[c][m](i);if(loseDelivery&&c==='witness'&&m==='appendEvidence'&&i.kind==='service-delivery'){loseDelivery=false;throw Error('lost delivery acknowledgement');}return result;};
let lab=new ShowcaseLab({call,storage});const wallet=await lab.connectWallet();
let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
const finish=async p=>{await lab.approvePayment(p.id);await lab.submitPayment(p.id);await lab.reconcilePayment(p.id);};
let order,proof,batch;
await test('service saves its identities before effects and cannot deliver before a receipt',async()=>{
 order=await lab.createWorkflow({kind:'service',recipient:wallet.walletPubkey,text:'[{"team":"A","tasks":2},{"team":"B","tasks":7}]'});
 assert.equal(f.sends,0);assert.equal(lab.state.payments.length,0);assert.ok(order.items[0].operationId);
 await assert.rejects(lab.deliverService(order.id),/observed devnet receipt/);
});
await test('exact receipt gates deterministic delivery and recovery deduplicates Witness evidence',async()=>{
 let p=await lab.prepareWorkflowPayment(order.id,order.items[0].id);await finish(p);
 p=lab.payment(p.id);assert.ok(hasBoundDevnetReceipt(p.operation));
 const good=p.operation;for(const mutate of [x=>x.receipt.commitmentMet=false,x=>x.chainEvidence.observedTransactionDigest='a'.repeat(64),x=>x.receipt.attemptId='other',x=>x.simulated=true]){const bad=structuredClone(good);mutate(bad);assert.equal(hasBoundDevnetReceipt(bad),false);}
 loseDelivery=true;await assert.rejects(lab.deliverService(order.id),/lost delivery/);assert.equal(lab.workflow(order.id).delivery.complete,false);
 lab=new ShowcaseLab({call,storage});await lab.reconcilePayment(p.id);const delivered=await lab.deliverService(order.id);assert.equal(delivered.artifact.numericTotals.tasks,9);assert.equal(delivered.complete,true);
 const same=await lab.deliverService(order.id);assert.deepEqual(same,delivered);assert.equal(f.sends,1);
 const trace=await f.api.witness.trace({operationId:p.id});assert.equal(trace.evidence.filter(e=>e.kind==='service-delivery').length,1);
});
await test('delivered artifact becomes one linked proof request, requiring a separate payment',async()=>{
 proof=await lab.anchorDelivery(order.id);assert.equal(proof.documentDigest,lab.workflow(order.id).delivery.digest);
 assert.equal((await lab.anchorDelivery(order.id)).id,proof.id);assert.equal(f.sends,1);
 const p=await lab.prepareWorkflowPayment(proof.id,proof.items[0].id);assert.equal(p.operation.commitment.namespace,'document');await finish(p);
 assert.ok(lab.paid(proof,proof.items[0]));assert.equal((await lab.verifyDocument(proof.id,proof.text)).matches,true);
 assert.equal((await lab.verifyDocument(proof.id,proof.text+' ')).matches,false);assert.equal(f.sends,2);
 const trace=await f.api.witness.trace({operationId:p.id});assert.ok(trace.evidence.some(e=>e.kind==='application-commitment'&&e.payload.evidenceCommitment===proof.documentDigest));
});
await test('batch reserves all children, tracks partial progress and never resends a confirmed item',async()=>{
 batch=await lab.createWorkflow({kind:'batch',recipients:[{recipient:wallet.walletPubkey,amount:'0.00001',label:'A'},{recipient:wallet.walletPubkey,amount:'0.00001',label:'B'}]});
 assert.equal(new Set(batch.items.map(i=>i.operationId)).size,2);
 const first=await lab.prepareWorkflowPayment(batch.id,batch.items[0].id);await finish(first);
 assert.deepEqual(lab.progress(batch),{total:2,confirmed:1,unresolved:0});
 lab=new ShowcaseLab({call,storage});assert.equal((await lab.prepareWorkflowPayment(batch.id,batch.items[0].id)).state,'confirmed');assert.equal(f.sends,3);
 const second=await lab.prepareWorkflowPayment(batch.id,batch.items[1].id);assert.notEqual(first.operation.messageDigest,second.operation.messageDigest);
 await lab.approvePayment(second.id);f.state.lostReply=true;await lab.submitPayment(second.id);
 assert.equal(lab.progress(batch).unresolved,1);lab=new ShowcaseLab({call,storage});await lab.reconcilePayment(second.id);f.state.lostReply=false;
 assert.deepEqual(lab.progress(batch),{total:2,confirmed:2,unresolved:0});assert.equal(f.sends,4);
 // Observe the first signature after the second was sent: fixture keeps full per-signature history.
 await lab.reconcilePayment(first.id);assert.ok(lab.paid(batch,batch.items[0]));assert.equal(f.sends,4);
});
await test('frozen parent bindings reject changed payments and changed input',async()=>{
 let w=await lab.createWorkflow({kind:'service',recipient:wallet.walletPubkey,text:'{"x":1}'}),p=await lab.prepareWorkflowPayment(w.id,w.items[0].id);await finish(p);
 lab.payment(p.id).recipient='wrong';lab.save();await assert.rejects(lab.prepareWorkflowPayment(w.id,w.items[0].id),/does not match/);await assert.rejects(lab.deliverService(w.id),/observed/);
 lab.payment(p.id).recipient=wallet.walletPubkey;lab.workflow(w.id).text='{"x":2}';lab.save();await assert.rejects(lab.deliverService(w.id),/input changed/);
});
await test('invalid input cannot add workflow records or send',async()=>{
 const count=lab.state.workflows.length,sends=f.sends;
 for(const input of [{kind:'service',recipient:wallet.walletPubkey,text:'not json'},{kind:'proof',recipient:wallet.walletPubkey,text:'x'.repeat(24001)},{kind:'batch',recipients:[{recipient:wallet.walletPubkey,amount:'0.01'}]},{kind:'proof',recipient:wallet.walletPubkey,text:'valid',amount:'NaN'}])await assert.rejects(lab.createWorkflow(input));
 assert.equal(lab.state.workflows.length,count);assert.equal(f.sends,sends);await assert.rejects(textDigest(''));
});
await test('standalone SDK requires no Edge and refuses undeclared tools',async()=>{
 const peer={marker:'bound',status(){return {marker:this.marker};}};const client=createSolanaClient(()=>({conduit:peer}));
 assert.deepEqual(client.available().conduit,['status']);assert.equal((await client.call('conduit','status')).marker,'bound');
 await assert.rejects(client.call('conduit','sendAnything'),/not declared/);await assert.rejects(client.call('edge','status'),/not available/);await assert.rejects(client.call('conduit','status',[]),/JSON argument/);await assert.rejects(client.call('conduit','status',new Date()),/JSON argument/);
});
await test('an older installed Edge cannot accept a commitment it would ignore',async()=>{
 const old=new ShowcaseLab({storage,key:'older-runtime',call:async(c,m,i)=>c==='edge'&&m==='status'?{ready:true,supports:{}}:call(c,m,i)}),before=f.sends;
 await assert.rejects(old.createWorkflow({kind:'proof',recipient:wallet.walletPubkey,text:'a document'}),/0.4.1 or later/);assert.equal(old.state.workflows.length,0);assert.equal(f.sends,before);
});
await test('corrupt workflow storage fails without overwriting records',async()=>{
 const raw=JSON.stringify({protocol:'capp.solana-lab.state.v1',payments:[],positions:[],events:[],workflows:{broken:true}});saved.set('bad',raw);assert.throws(()=>new ShowcaseLab({call,storage,key:'bad'}),/unreadable/);assert.equal(saved.get('bad'),raw);
});
console.log(JSON.stringify({passed,network:'fixture-only',sends:f.sends}));
