import assert from 'node:assert/strict';
import {PAGE_WORKFLOWS,workflowForPage,requestedWorkflow,canResetWorkflow} from '../src/guide-catalog.mjs';
import {GUIDED_WORKFLOWS} from '../src/guided-content.mjs';
assert.equal(Object.keys(PAGE_WORKFLOWS).length,13);
for(const [page,id] of Object.entries(PAGE_WORKFLOWS)){
 assert.ok(GUIDED_WORKFLOWS.some(w=>w.id===id),id);
 assert.equal(workflowForPage('#/'+page),id);assert.equal(requestedWorkflow('Walk me through a demo','#/'+page),id);
}
for(const [text,id] of [['show me demo wallets','prepare-demo-wallets'],['show me the token payment demo','demo-token-payment'],['show me the payment request demo','create-payment-request'],['show me wallet activity','inspect-wallet-activity'],['guide me through invoice verification','verify-payment-request'],['show me my assets','inspect-assets'],['try the excessive fee demo','try-excessive-fee']]){
 assert.equal(requestedWorkflow(text,'#/service'),id);assert.ok(GUIDED_WORKFLOWS.some(w=>w.id===id));
}
for(const text of ["don't start a token demo",'why did the payment request fail?','explain why guide failed','show me why it failed'])assert.equal(requestedWorkflow(text,'#/tokens'),null);
assert.ok(canResetWorkflow('demo-token-payment'));assert.ok(canResetWorkflow('create-payment-request'));assert.ok(!canResetWorkflow('inspect-wallet-activity'));
console.log('PASS wallet setup and all twelve demo page defaults, named offers, explicit failures and reset availability use the shared Guide catalogue');
