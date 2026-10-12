import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {CapabilityLab} from '../../../src/capability-lab.mjs';
import {capabilityFixture,recipient} from '../../../tests/capability-fixture.mjs';

const evidence=[];
async function scenario(stage){
 const fixture=capabilityFixture(),saved=new Map();
 const storage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)};
 const make=()=>new CapabilityLab({storage,call:(component,method,input)=>fixture.api[component][method](input)});
 const payer=make();fixture.state.sender=(await payer.connectWallet()).walletPubkey;
 const row=await payer.createRequest({recipient,amount:'0.00002'});
 const local=await payer.prepareRequest(row.id);
 if(stage==='submit')await payer.approvePayment(local.id);
 const receiver=make(),operationId='external-'+stage;
 await fixture.api.edge.preparePayment({operationId,walletPubkey:fixture.state.sender,paymentRequest:row.terms});
 await fixture.api.edge.preflight({operationId});await fixture.api.edge.authorise({operationId});await fixture.api.edge.submit({operationId});
 const external=await fixture.api.edge.transactionStatus({operationId});
 await receiver.verifyRequest(row.id,external.signature);
 assert.equal(make().request(row.id).verification.paid,true);
 assert.equal(payer.request(row.id).verification,undefined);
 const before=fixture.sends;
 const outcome=await (stage==='submit'?payer.submitPayment(local.id):payer.approvePayment(local.id));
 assert.equal(payer.request(row.id).verification.paid,true);
 if(stage==='submit')assert.equal(fixture.sends,before+1);
 else assert.equal(outcome.state,'authorised');
 evidence.push({stage,storedPaidBeforeAction:true,inMemoryPaidBeforeAction:false,paidAfterReload:true,outcome:outcome.state,sendsBefore:before,sendsAfter:fixture.sends,expected:'reject already-paid request',native:false,network:'offline-signed-fixtures'});
 console.log('REPRODUCED '+stage+' uses stale paid guard; current saved paid request does not block action');
}
await scenario('approve');await scenario('submit');
await fs.writeFile(new URL('./request-replay-evidence.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
