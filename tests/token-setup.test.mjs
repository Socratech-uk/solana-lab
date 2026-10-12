import assert from 'node:assert/strict';
import {DEVNET_DEMO_MINT} from '../src/demo-token.mjs';
import {CapabilityLab} from '../src/capability-lab.mjs';
import {createGuidedActions} from '../src/guided-actions.mjs';
import {capabilityFixture,mint as globalMint,recipient} from './capability-fixture.mjs';
let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
async function setup(options){
 const mint=options?.mintAddress||globalMint;
 const f=capabilityFixture(options),saved=new Map(),calls=[],storage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)};
 const make=()=>new CapabilityLab({storage,call:(c,m,i)=>{calls.push(c+'.'+m);return f.api[c][m](i);}});
 const lab=make();f.state.sender=(await lab.connectWallet()).walletPubkey;await lab.inspectMint(mint);
 const forms={tokens:{mint,recipient,amount:'1'}},selected={},actions=createGuidedActions({getLab:()=>lab,forms,selected});
 const run=name=>actions.find(a=>a.definition.id==='solana-lab.'+name).handler({});
 return {lab,f,make,calls,forms,selected,run};
}
const mint=globalMint,input={mint,recipient,amount:'1'};
await test('funded SOL and an absent exact token account cannot create a payment or enter Edge',async()=>{
 const x=await setup();x.f.state.sourceMissing=true;const start=x.calls.length;
 for(let n=0;n<2;n++)await assert.rejects(()=>x.lab.prepareToken(input),/no associated token account/i);
 assert.equal(x.lab.state.payments.length,0);assert.equal(x.f.sends,0);
 assert.ok(!x.calls.slice(start).some(c=>/edge\.(prepare|preflight|authorise|submit)|circuit\.reserve/.test(c)));
 assert.equal(x.lab.state.paymentSetup.balance.value,15000000000);
});
await test('an exact associated balance overrides a larger wallet-list observation',async()=>{
 const x=await setup();x.f.state.sourceBalance=9n;
 await assert.rejects(()=>x.lab.prepareToken(input),/9 atomic units.*1000000/);
 assert.equal(x.lab.state.payments.length,0);
 x.f.state.sourceFrozen=true;await assert.rejects(()=>x.lab.prepareToken(input),/frozen/);
 assert.equal(x.lab.state.payments.length,0);
});
await test('Guide waits for funding without binding an operation then prepares once after funding',async()=>{
 const x=await setup();await x.run('token.review');x.f.state.sourceMissing=true;
 for(const action of ['token.setup','token.prepare','token.prepare']){
  const result=await x.run(action);assert.equal(result.guide.complete,false);assert.ok(result.guide.checkpoint);assert.ok(result.guide.body.length<=700);assert.match(result.guide.body,/Solana Devnet/);
 }
 assert.equal(x.lab.state.payments.length,0);assert.equal(x.lab.state.guideBindings?.tokens,undefined);
 x.f.state.sourceMissing=false;assert.equal((await x.run('token.setup')).checked,true);
 await x.run('token.prepare');const id=x.selected.tokens;await x.run('token.prepare');
 assert.equal(x.lab.state.payments.length,1);assert.equal(x.selected.tokens,id);assert.equal(x.lab.payment(id).state,'preflighted');assert.equal(x.f.sends,0);
});
await test('both mint owners block before any saved payment when permission is absent',async()=>{
 const x=await setup({allowed:false});await assert.rejects(()=>x.lab.prepareToken(input),/Sentinel mint permission.*Wallet mint permission/);
 assert.equal(x.lab.state.payments.length,0);assert.equal(x.f.sends,0);
});
await test('SPL request preparation leaves its payer binding empty until setup is ready',async()=>{
 const x=await setup();const row=await x.lab.createRequest({...input,assetKind:'spl-token'});x.f.state.sourceMissing=true;
 await assert.rejects(()=>x.lab.prepareRequest(row.id),/associated token account/);
 assert.equal(x.lab.request(row.id).paymentId,undefined);assert.equal(x.lab.state.payments.length,0);
 x.f.state.sourceMissing=false;const p=await x.lab.prepareRequest(row.id);assert.equal(x.lab.request(row.id).paymentId,p.id);assert.equal(x.f.sends,0);
});
await test('an older interrupted preparation resumes the same saved sender and operation after funding',async()=>{
 const x=await setup(),id='legacy_token_setup';
 const p={id,kind:'token',scope:'main',network:'devnet',walletPubkey:x.f.state.sender,recipient,asset:x.lab.selectedAsset({assetKind:'spl-token',mint}),amountAtomic:'1000000',createdAt:Date.now(),state:'preparing',error:'Expected a non-executable original Token Program account'};
 x.lab.state.payments.push(p);x.lab.state.guideBindings={tokens:id};x.lab.save();x.f.state.sourceMissing=true;
 await assert.rejects(()=>x.f.api.edge.prepareTokenTransfer({operationId:id,network:'devnet',walletPubkey:p.walletPubkey,recipient,asset:p.asset,amountAtomic:p.amountAtomic}),/no associated token account/);
 await assert.rejects(()=>x.make().reviewPayment(id),/associated token account/);
 x.f.state.sourceMissing=false;const resumed=x.make(),ready=await resumed.reviewPayment(id);
 assert.equal(ready.id,id);assert.equal(ready.walletPubkey,p.walletPubkey);assert.equal(ready.state,'preflighted');assert.equal(ready.error,undefined);assert.equal(resumed.state.payments.length,1);assert.equal(x.f.sends,0);
});
await test('failed RPC refresh cannot reuse a previous passing setup',async()=>{
 const x=await setup();await x.lab.checkPaymentSetup({mint});const raw=x.lab.rawCall;
 x.lab.rawCall=async(c,m,i)=>{if(c==='conduit'&&m==='balance')throw Error('Connection offline');return raw(c,m,i);};
 await assert.rejects(()=>x.lab.prepareToken(input),/Connection offline/);assert.equal(x.lab.state.payments.length,0);
});
await test('switching the payer during setup cannot silently bind the draft to either wallet',async()=>{
 const x=await setup({overrides:{latch:{providerMode:'device-wallet',tokenLimits:JSON.stringify([{mint,maxAmountAtomic:'1000000'}])}}});const other=await x.f.api.latch.walletCreate({network:'devnet',label:'Other',select:false});
 const raw=x.lab.rawCall;let switched=false;
 x.lab.rawCall=async(c,m,i)=>{const value=await raw(c,m,i);if(c==='conduit'&&m==='request'&&i.method==='getAccountInfo'&&!switched){switched=true;await x.f.api.latch.walletSelect({network:'devnet',walletId:other.walletId});}return value;};
 await assert.rejects(()=>x.lab.prepareToken(input),/payer changed/);assert.equal(x.lab.state.payments.length,0);assert.equal(x.f.sends,0);
});
await test('Guide gives Circle instructions only for the default USDC mint and still waits for RPC funds',async()=>{
 const x=await setup({mintAddress:DEVNET_DEMO_MINT});await x.run('token.review');x.f.state.sourceMissing=true;
 const pending=await x.run('token.setup');assert.equal(pending.guide.complete,false);assert.match(pending.guide.body,/USDC.*Solana Devnet.*Send 20 USDC/);assert.match(pending.guide.body,/2 hours/);assert.ok(pending.guide.body.length<=700);
 assert.equal(x.lab.state.payments.length,0);assert.equal(x.f.sends,0);
 x.f.state.sourceMissing=false;x.f.state.sourceBalance=20000000n;
 assert.equal((await x.run('token.setup')).checked,true);assert.equal(x.lab.state.payments.length,0);assert.equal(x.f.sends,0);
 const custom=await setup();await custom.run('token.review');custom.f.state.sourceMissing=true;
 const other=await custom.run('token.setup');assert.match(other.guide.body,/Circle’s USDC faucet does not fund other mints/);assert.doesNotMatch(other.guide.body,/Send 20 USDC/);
});
console.log(JSON.stringify({passed,native:false,network:'offline-signed-fixtures'}));
