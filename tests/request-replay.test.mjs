import assert from 'node:assert/strict';
import {CapabilityLab} from '../src/capability-lab.mjs';
import {capabilityFixture,recipient} from './capability-fixture.mjs';

let passed=0;
for(const queued of [false,true])for(const stage of ['approve','submit']){
 const fixture=capabilityFixture(),saved=new Map(),effects=[];
 const storage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)};
 const make=()=>new CapabilityLab({storage,call:(c,m,i)=>{if(c==='edge'&&['authorise','submit'].includes(m))effects.push(m);return fixture.api[c][m](i);}});
 const payer=make();fixture.state.sender=(await payer.connectWallet()).walletPubkey;
 const request=await payer.createRequest({recipient,amount:'0.00002'}),local=await payer.prepareRequest(request.id);
 if(stage==='submit')await payer.approvePayment(local.id);
 const operationId='external-'+stage;
 await fixture.api.edge.preparePayment({operationId,walletPubkey:fixture.state.sender,paymentRequest:request.terms});
 await fixture.api.edge.preflight({operationId});await fixture.api.edge.authorise({operationId});await fixture.api.edge.submit({operationId});
 const external=await fixture.api.edge.transactionStatus({operationId}),receiver=make();
 const before=effects.length,sends=fixture.sends,oldState=payer.payment(local.id).state;
 const action=()=>stage==='submit'?payer.submitPayment(local.id):payer.approvePayment(local.id);
 const suppliedNavigator=!globalThis.navigator;
 if(suppliedNavigator)Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});
 const descriptor=Object.getOwnPropertyDescriptor(navigator,'locks');
 try{
  if(queued){
   let tail=Promise.resolve(),enter,release;
   const entered=new Promise(r=>enter=r),hold=new Promise(r=>release=r);
   Object.defineProperty(navigator,'locks',{configurable:true,value:{request:(_key,fn)=>{const next=tail.then(fn);tail=next.catch(()=>{});return next;}}});
   const original=receiver.rawCall;receiver.rawCall=async(c,m,i)=>{if(c==='witness'&&m==='verifyPayment'){enter();await hold;}return original(c,m,i);};
   const verifying=receiver.verifyRequest(request.id,external.signature);await entered;
   const rejected=assert.rejects(action,/already has a verified payment/);release();await verifying;await rejected;
  }else{
   await receiver.verifyRequest(request.id,external.signature);
   assert.equal(payer.request(request.id).verification,undefined);
   await assert.rejects(action,/already has a verified payment/);
  }
  assert.equal(payer.request(request.id).verification.paid,true);
  assert.equal(payer.payment(local.id).state,oldState);
  assert.equal(effects.length,before);assert.equal(fixture.sends,sends);
  // A paid request must not make its old attempt impossible to inspect.
  await payer.reconcilePayment(local.id);
  assert.equal(payer.request(request.id).verification.signature,external.signature);
  assert.equal(fixture.sends,sends);
  console.log(`PASS ${queued?'queued lock':'stale window'} ${stage}: paid state reloaded, no new signing/submission; reconcile retained`);passed++;
 }finally{if(descriptor)Object.defineProperty(navigator,'locks',descriptor);else delete navigator.locks;if(suppliedNavigator)delete globalThis.navigator;}
}
console.log(JSON.stringify({passed,native:false,network:'offline-signed-fixtures'}));
