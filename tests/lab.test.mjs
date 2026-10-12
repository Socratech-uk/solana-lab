import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {DEMO_PROFILE as PROFILE} from '../src/catalog.mjs';
import {Lab,lamports,readTool,READ_TOOLS} from '../src/lab.mjs';
const APP=new URL('../',import.meta.url),values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v))};
let confirms=true,networkCalls=0;
function fixture(kind='main',drop=false) {
 const plan=JSON.parse(JSON.stringify(PROFILE));plan.componentId=kind;
 if(kind==='recovery'||drop)plan.library.selected.find(x=>x.id.endsWith('solana-arena')).config.failureMode='drop-response';
 const window={__CAPP_EXECUTABLE_PLAN__:plan,capp:{},confirm:()=>confirms,dispatchEvent(){}};
 const ctx=vm.createContext({window,document:{querySelectorAll:()=>[]},localStorage:storage,crypto:webcrypto,TextEncoder,TextDecoder,URL,AbortController,setTimeout,clearTimeout,console,atob:s=>Buffer.from(s,'base64').toString('binary'),CustomEvent:class{},fetch:()=>{networkCalls++;throw Error('No network allowed');},navigator:{}});
 for(const item of plan.library.selected){const n=item.id.replace('uk.capp.sidecar.solana-','');vm.runInContext(fs.readFileSync(new URL('runtime/'+n+'.js',APP),'utf8'),ctx);}
 return window.capp.solana;
}
let main=fixture(),recovery=fixture('recovery');
const calls=[];
const call=(c,m,i,s='main')=>{calls.push([c,m,s]);return(s==='recovery'?recovery:main)[c][m](i);};
let lab=new Lab({network:'demo',call,storage});let count=0;
async function test(name,fn){await fn();count++;console.log('PASS '+name);}
await test('eleven real runtimes load; Conduit is offline',async()=>{assert.equal((await lab.statuses()).length,11);assert.equal((await main.conduit.status()).ready,false);});
await test('decimal amounts are exact and bounded',async()=>{assert.equal(lamports('0.000000001'),1);assert.equal(lamports('0.0025'),2500000);for(const x of ['1e-3','-1','NaN','0','1.001','0.0000000001'])assert.throws(()=>lamports(x));});
let payment;
await test('checkout prepares and checks policy without authority',async()=>{payment=await lab.preparePayment();assert.equal(payment.state,'preflighted');assert.equal(payment.operation.approval.state,'none');await assert.rejects(()=>lab.submitPayment(payment.id),/Approve/);});
await test('declined demo approval has no effect',async()=>{confirms=false;await assert.rejects(()=>lab.approvePayment(payment.id),/declined/i);assert.equal(lab.payment(payment.id).state,'preflighted');confirms=true;});
await test('approved checkout executes the composed path and returns a simulated receipt',async()=>{await lab.approvePayment(payment.id);const r=await lab.submitPayment(payment.id);assert.equal(r.state,'finalised');assert.equal(r.operation.receipt.simulated,true);assert.ok(r.operation.receipt.componentEvidence.witness);assert.equal((await main.circuit.read({operationId:payment.id})).state,'finalised');});
await test('a refresh reloads recorded IDs; reconciliation does not submit',async()=>{main=fixture();lab=new Lab({network:'demo',call,storage});const before=calls.filter(x=>x[1]==='submit').length;const r=await lab.reconcilePayment(payment.id);assert.equal(r.state,'finalised');assert.equal(calls.filter(x=>x[1]==='submit').length,before);});
await test('treasury binds approvals and enforces quorum before Latch',async()=>{const p=await lab.preparePayment({kind:'treasury',amount:'0.075'});await assert.rejects(()=>lab.approvePayment(p.id),/two simulated/);await lab.memberApprove(p.id,'ari');await lab.memberApprove(p.id,'ari');assert.equal(lab.payment(p.id).request.approvals.length,1);await lab.memberApprove(p.id,'bo');assert.equal(lab.payment(p.id).request.quorumReached,true);assert.equal(lab.payment(p.id).request.authorises,false);await lab.approvePayment(p.id);assert.equal((await lab.submitPayment(p.id)).state,'finalised');});
await test('Arena actually drops a reply; recovery preserves the attempt across reload',async()=>{let p=await lab.preparePayment({kind:'recovery'});await lab.approvePayment(p.id);await assert.rejects(()=>lab.submitPayment(p.id),/response lost/i);assert.equal(lab.payment(p.id).state,'unknown');const attempt=lab.payment(p.id).operation.attemptId;assert.equal((await recovery.dispatch.read({attemptId:attempt})).state,'unknown');recovery=fixture('recovery');lab=new Lab({network:'demo',call,storage});p=await lab.reconcilePayment(p.id);assert.equal(p.state,'finalised');assert.equal(p.operation.attemptId,attempt);assert.equal(p.operation.receipt.simulated,true);});
let position;
await test('position open uses real allocation, policy, authority and execution',async()=>{position=await lab.openPosition(100);assert.equal(position.position.size,100);assert.equal(position.state,'open');assert.equal(position.rail.state,'position_open');});
await test('reduce then close retains evidence and releases the bucket',async()=>{position=await lab.changePosition(position.id,'reduce');assert.equal(position.position.size,50);position=await lab.changePosition(position.id,'close');assert.equal(position.position.size,0);assert.equal(position.state,'closed');assert.equal(position.rail.state,'rail_bucket_reusable');assert.equal(position.jobs.length,3);assert.ok(position.jobs.every(j=>j.receipt?.simulated));});
await test('a dropped position response can resume the same action without doubling size',async()=>{
 let api=fixture('position-recovery',true);const c=(name,method,input)=>api[name][method](input);
 let x=new Lab({network:'demo',call:c,storage,key:'position-recovery'});await assert.rejects(()=>x.openPosition(25),/response lost/i);
 const id=x.state.positions[0].id;api=fixture('position-recovery',true);x=new Lab({network:'demo',call:c,storage,key:'position-recovery'});
 const p=await x.resumePosition(id);assert.equal(p.position.size,25);assert.equal(p.state,'open');assert.equal(p.jobs.length,1);
});
await test('policy rejects excessive fees and expired intents',async()=>{assert.equal((await lab.policy({fee:150000})).result.allowed,false);assert.equal((await lab.policy({age:301})).result.allowed,false);assert.equal((await lab.policy()).result.allowed,true);});
await test('assistant tool catalog is read-only and rejects mutation requests',async()=>{assert.ok(READ_TOOLS.every(t=>t.annotations.readOnlyHint));await assert.rejects(()=>readTool(lab,'edge.submit',{operationId:payment.id}),/not granted/);assert.ok((await readTool(lab,'lab.guide.search',{query:'approval quorum'})).some(x=>x.title==='Accord'));assert.equal((await readTool(lab,'lab.operation.read',{id:payment.id})).id,payment.id);});
await test('records fail closed when corrupt, preserving recovery bytes',async()=>{storage.setItem('broken','{incomplete');assert.throws(()=>new Lab({network:'demo',call,storage,key:'broken'}),/will not overwrite/);assert.equal(storage.getItem('broken'),'{incomplete');});
await test('an incompatible installed provider cannot cause a live call',async()=>{let submitted=false;const x=new Lab({network:'demo',storage,key:'bad-provider',call:async(c,m)=>{if(m==='status')return{ready:true,providerMode:'external-adapter',network:'devnet'};submitted=true;}});await assert.rejects(()=>x.preparePayment(),/needs Edge in demo/);assert.equal(submitted,false);});
await test('all simulation workflows remain offline',async()=>{assert.equal(networkCalls,0);assert.ok(lab.receipts().length>=6);});

globalThis.HTMLElement=class{};globalThis.customElements={define(){}};
const {assistantTurn}=await import('../src/assistant.mjs');
await test('optional model loop executes only declared reads and returns an evidence-based answer',async()=>{let n=0;const tools=[];const reply=await assistantTurn({lab,prompt:'Explain quorum',connection:{complete:async()=>({output:JSON.stringify(++n===1?{tool:'lab.guide.search',arguments:{query:'quorum'}}:{answer:'Accord records a simulated quorum. It does not sign.'})})},onTool:name=>tools.push(name)});assert.match(reply,/simulated/);assert.deepEqual(tools,['lab.guide.search']);});
await test('model-requested mutation and malformed output fail without executing',async()=>{for(const output of ['{"answer":',JSON.stringify({tool:'edge.submit',arguments:{}})])await assert.rejects(()=>assistantTurn({lab,prompt:'Submit',connection:{complete:async()=>({output})}}));});

await test('plain conversational replies are displayed without requiring a tool envelope',async()=>{assert.equal(await assistantTurn({lab,prompt:'Explain this page',connection:{complete:async()=>({output:'Here is how this demo works.'})}}),'Here is how this demo works.');});
await test('malformed JSON gets one bounded repair and receives the current page context',async()=>{
 let calls=0;const reply=await assistantTurn({lab,prompt:'Why is it blocked?',context:{route:'#/policy',policy:'Expected rejection: fee above ceiling.'},connection:{complete:async request=>{assert.match(request.prompt,/Expected rejection/);assert.equal(request.responseFormat,'json');return {output:++calls===1?'{"answer":':'{"answer":"The fee exceeds the ceiling."}'};}}});assert.equal(calls,2);assert.match(reply,/ceiling/);
});
await test('model workflow suggestions are offers only, and invented workflow IDs fail closed',async()=>{
 const offers=[];await assistantTurn({lab,prompt:'Suggest something to try',connection:{complete:async()=>({output:JSON.stringify({answer:'Try recovery.',workflowId:'understand-recovery'})})},onOffer:id=>offers.push(id)});assert.deepEqual(offers,['understand-recovery']);
 await assert.rejects(()=>assistantTurn({lab,prompt:'Try a task',connection:{complete:async()=>({output:JSON.stringify({answer:'Done',workflowId:'wallet.send'})})}}),/walkthrough is not available/);
});
await test('cancellation after model output prevents a pending tool from being dispatched',async()=>{
 let stopped=false,reads=0;await assert.rejects(()=>assistantTurn({lab,prompt:'Read receipts',connection:{complete:async()=>{stopped=true;return {output:JSON.stringify({tool:'lab.receipts.list',arguments:{}})};}},cancelled:()=>stopped,onTool:()=>reads++}),/Stopped/);assert.equal(reads,0);
});
console.log(JSON.stringify({passed:count,networkCalls,paymentRecords:lab.state.payments.length,receipts:lab.receipts().length}));
