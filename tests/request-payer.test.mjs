import assert from 'node:assert/strict';
import {capabilityFixture,mint} from './capability-fixture.mjs';
import {CapabilityLab} from '../src/capability-lab.mjs';
import {createGuidedActions} from '../src/guided-actions.mjs';

let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
async function setup(){
 const f=capabilityFixture({overrides:{latch:{providerMode:'device-wallet',tokenLimits:JSON.stringify([{mint,maxAmountAtomic:'1000000'}])}}}),saved=new Map(),calls=[];
 const lab=new CapabilityLab({storage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)},call:(c,m,i)=>{calls.push(c+'.'+m);return f.api[c][m](i);}});
 const sender=await lab.connectWallet();f.state.sender=sender.walletPubkey;
 const forms={requests:{recipient:'',assetKind:'native',amount:'0.001',minutes:'60',label:'Payer regression'},tokens:{mint,recipient:'',amount:'1'}},selected={};
 const actions=createGuidedActions({getLab:()=>lab,forms,selected});
 const run=(name,args={},prior,userConfirmed=true)=>actions.find(a=>a.definition.id==='solana-lab.'+name).handler(args,{userConfirmed,checkpoint:prior?.guide?.checkpoint});
 const wallet=()=>f.api.latch.status({}).then(s=>s.wallet.walletPubkey);
 const other=label=>f.api.latch.walletCreate({network:'devnet',label,select:false});
 const request=async recipient=>{const row=await lab.createRequest({...forms.requests,recipient});actions.openRun('pay-payment-request',{recordId:row.id});return row;};
 return {f,lab,forms,selected,actions,run,wallet,other,request,sender,calls};
}
await test('same-wallet requests wait for an explicit named payer selection before continuing',async()=>{
 const x=await setup(),other=await x.other('Second payer'),row=await x.request(x.sender.walletPubkey);
 await assert.rejects(()=>x.run('request.payer',{kind:'request-payment'},null,false),/Confirm this step in Guide/);
 const choice=await x.run('request.payer',{kind:'request-payment'});assert.equal(choice.guide.complete,false);assert.match(choice.guide.label,/Use Second payer/);assert.equal(await x.wallet(),x.sender.walletPubkey);
 assert.equal(x.lab.state.payments.length,0);assert.equal(x.f.sends,0);
 const ready=await x.run('request.payer',{kind:'request-payment'},choice);assert.equal(ready.ready,true);assert.equal(await x.wallet(),other.walletPubkey);
 assert.deepEqual(x.lab.request(row.id).terms,row.terms);assert.equal(x.lab.state.payments.length,0);
});
await test('unfunded payer remains at funding; a fresh read resumes without a new request or payment',async()=>{
 const x=await setup(),other=await x.other('Unfunded payer'),row=await x.request(x.sender.walletPubkey);
 x.f.state.solBalances.set(x.sender.walletPubkey,0);
 const raw=x.lab.rawCall;let funded=false;x.lab.rawCall=async(c,m,i,...rest)=>{const result=await raw(c,m,i,...rest);return c==='conduit'&&m==='balance'&&i.walletPubkey===other.walletPubkey?{...result,value:funded?20000000:0}:result;};
 let next=await x.run('request.payer',{kind:'request-payment'});next=await x.run('request.payer',{kind:'request-payment'},next);
 assert.match(next.guide.label,/funds again/);assert.equal(x.actions.payerSetup.current.stage,'funds');assert.equal(x.lab.state.payments.length,0);
 for(let i=0;i<2;i++)assert.equal((await x.run('request.payer',{kind:'request-payment'},next)).guide.complete,false);
 funded=true;assert.equal((await x.run('request.payer',{kind:'request-payment'},next)).ready,true);
 assert.deepEqual(x.lab.request(row.id).terms,row.terms);assert.equal(x.f.sends,0);assert.equal(x.lab.state.payments.length,0);
});
await test('changing the dropdown invalidates the old named selection checkpoint',async()=>{
 const x=await setup(),a=await x.other('Payer A'),b=await x.other('Payer B');await x.request(x.sender.walletPubkey);
 const old=await x.run('request.payer',{kind:'request-payment'});assert.match(old.guide.label,/Payer A/);
 x.actions.payerSetup.choose(b.walletId);
 const current=await x.run('request.payer',{kind:'request-payment'},old);assert.match(current.guide.label,/Payer B/);assert.equal(await x.wallet(),x.sender.walletPubkey);
 await x.run('request.payer',{kind:'request-payment'},current);assert.equal(await x.wallet(),b.walletPubkey);assert.notEqual(await x.wallet(),a.walletPubkey);
});
await test('transaction checkpoint recovers the payer inline and still separates sign, send and verify',async()=>{
 const x=await setup(),other=await x.other('Payment payer'),row=await x.request(x.sender.walletPubkey);
 let next=await x.run('transaction.step',{kind:'request-payment'});assert.equal(next.phase,'payer');
 next=await x.run('transaction.step',{kind:'request-payment'},next);assert.equal(next.phase,'prepare');assert.equal(x.lab.state.payments.length,0);
 next=await x.run('transaction.step',{kind:'request-payment'},next);assert.equal(next.phase,'approve');const id=x.lab.request(row.id).paymentId;assert.equal(x.lab.payment(id).walletPubkey,other.walletPubkey);
 next=await x.run('transaction.step',{kind:'request-payment'},next);assert.equal(next.phase,'submit');assert.equal(x.f.sends,0);
 next=await x.run('transaction.step',{kind:'request-payment'},next);assert.equal(next.phase,'receipt');assert.equal(x.f.sends,1);
 assert.equal((await x.run('transaction.step',{kind:'request-payment'},next)).guide.complete,true);
 assert.equal((await x.run('request.verifyBound',{kind:'request-payment'})).paid,true);assert.equal(x.f.sends,1);assert.equal(x.lab.state.payments.length,1);
});
await test('existing payments can reselect only their saved sender and keep their identity',async()=>{
 const x=await setup(),receiver=await x.other('Receiver'),wrong=await x.other('Wrong payer'),row=await x.request(receiver.walletPubkey);
 await x.lab.prepareRequest(row.id);const original=structuredClone(x.lab.payment(x.lab.request(row.id).paymentId));
 await x.f.api.latch.walletSelect({walletId:wrong.walletId});
 let next=await x.run('transaction.step',{kind:'request-payment'});assert.equal(next.phase,'payer');assert.equal(x.actions.payerSetup.current.wallets.length,1);
 await assert.rejects(()=>x.actions.payerSetup.select(row.id,wrong.walletId),/saved payer/);
 next=await x.run('transaction.step',{kind:'request-payment'},next);assert.equal(next.phase,'approve');assert.equal(await x.wallet(),original.walletPubkey);
 assert.equal(x.lab.request(row.id).paymentId,original.id);assert.equal(x.lab.state.payments.length,1);assert.deepEqual(x.lab.request(row.id).terms,row.terms);assert.equal(x.f.sends,0);
});
await test('new guided request creates a receiver explicitly and preserves the funded payer',async()=>{
 const x=await setup();await x.run('request.review');assert.notEqual(x.forms.requests.recipient,'');assert.notEqual(x.forms.requests.recipient,x.sender.walletPubkey);
 await x.run('request.receiver');assert.notEqual(x.forms.requests.recipient,x.sender.walletPubkey);assert.equal(await x.wallet(),x.sender.walletPubkey);
 await x.run('request.receiver');assert.equal((await x.f.api.latch.walletList({})).wallets.length,2);
 await x.run('request.create');assert.equal((await x.run('request.payer',{kind:'requests'})).ready,true);assert.equal(x.lab.state.payments.length,0);
 assert.ok(!x.lab.state.events.some(e=>['walletCreate','walletSelect'].includes(e.method)));assert.equal(x.f.sends,0);
});
await test('no alternative payer offers explicit creation without replacing the recipient',async()=>{
 const x=await setup(),row=await x.request(x.sender.walletPubkey);x.f.state.solBalances.set(x.sender.walletPubkey,0);
 const create=await x.run('request.payer',{kind:'request-payment'});assert.equal(create.guide.label,'Create and select devnet payer');assert.equal((await x.f.api.latch.walletList({})).wallets.length,1);
 await x.run('request.payer',{kind:'request-payment'},create);assert.equal((await x.f.api.latch.walletList({})).wallets.length,2);assert.notEqual(await x.wallet(),row.terms.recipient);
 await x.run('request.payer',{kind:'request-payment'},create);assert.equal((await x.f.api.latch.walletList({})).wallets.length,2);assert.deepEqual(x.lab.request(row.id).terms,row.terms);
});
await test('failed balance observations and expired requests cannot be treated as ready',async()=>{
 const x=await setup(),receiver=await x.other('Receiver'),row=await x.request(receiver.walletPubkey),raw=x.lab.rawCall;
 x.lab.rawCall=async(c,m,i,...rest)=>{if(c==='conduit'&&m==='balance')throw Error('RPC unavailable');return raw(c,m,i,...rest);};
 const blocked=await x.run('request.payer',{kind:'request-payment'});assert.equal(blocked.guide.complete,false);assert.match(blocked.guide.body,/RPC unavailable/);
 const now=Date.now;Date.now=()=>row.terms.expiresAt*1000+1000;
 try{const expired=await x.run('request.payer',{kind:'request-payment'});assert.match(expired.guide.title,/expired/);assert.equal(expired.guide.complete,false);}finally{Date.now=now;}
 assert.equal(x.lab.state.payments.length,0);assert.equal(x.f.sends,0);
});
await test('SPL request payer must own the exact tokens before Guide leaves setup',async()=>{
 const x=await setup(),receiver=await x.other('Token receiver');x.f.state.solBalances.set(receiver.walletPubkey,0);
 await x.lab.inspectMint(mint);x.forms.requests.assetKind='spl-token';x.forms.requests.mint=mint;x.forms.requests.amount='1';
 const row=await x.request(receiver.walletPubkey);x.f.state.sourceMissing=true;
 const missing=await x.run('request.payer',{kind:'request-payment'});
 assert.equal(missing.guide.complete,false);assert.equal(x.actions.payerSetup.current.stage,'funds');assert.equal(x.lab.state.payments.length,0);
 x.f.state.sourceMissing=false;x.f.state.sourceBalance=1000000n;
 assert.equal((await x.run('request.payer',{kind:'request-payment'},missing)).ready,true);
 assert.deepEqual(x.lab.request(row.id).terms,row.terms);assert.equal(x.f.sends,0);
});
await test('a native request waits for a tiny-payment receiver separately without rewriting its terms',async()=>{
 const x=await setup(),receiver=await x.other('Fresh receiver');x.forms.requests.amount='0.00001';x.f.state.solBalances.set(receiver.walletPubkey,0);
 const row=await x.request(receiver.walletPubkey),before=JSON.stringify(row);
 const pending=await x.run('request.payer',{kind:'request-payment'});assert.equal(x.actions.payerSetup.current.stage,'receiver');assert.equal(pending.guide.handoff.copyText,receiver.walletPubkey);assert.match(pending.guide.handoff.copyLabel,/Receiver/);
 assert.equal(x.lab.state.payments.length,0);assert.equal(x.f.sends,0);
 x.f.state.solBalances.set(receiver.walletPubkey,1000000);assert.equal((await x.run('request.payer',{kind:'request-payment'},pending)).ready,true);assert.equal(JSON.stringify(x.lab.request(row.id)),before);
});
await test('only funded recipient becomes the sender of a new demo, never a rewrite of old terms',async()=>{
 const x=await setup(),empty=await x.other('Empty receiver'),row=await x.request(x.sender.walletPubkey);
 x.f.state.solBalances.set(empty.walletPubkey,0);await x.f.api.latch.walletSelect({walletId:empty.walletId});
 const offer=await x.run('request.payer',{kind:'request-payment'});assert.match(offer.guide.label,/Create a new demo/);assert.equal(x.lab.state.paymentRequests.length,1);
 const result=await x.run('request.payer',{kind:'request-payment'},offer);assert.equal(result.ready,true);
 const next=x.lab.request(result.requestId);assert.notEqual(next.id,row.id);assert.notEqual(next.terms.reference,row.terms.reference);assert.equal(next.terms.recipient,empty.walletPubkey);
 assert.deepEqual(x.lab.request(row.id),row);assert.equal(await x.wallet(),x.sender.walletPubkey);assert.equal(x.lab.state.guideBindings['request-payment'],next.id);assert.equal(x.lab.state.payments.length,0);
 // A replay of the old checkpoint cannot create another request or send funds.
 await x.run('request.payer',{kind:'request-payment'},offer);assert.equal(x.lab.state.paymentRequests.length,2);assert.equal(x.f.sends,0);
 let step=await x.run('transaction.step',{kind:'request-payment'});assert.equal(step.phase,'prepare');
 step=await x.run('transaction.step',{kind:'request-payment'},step);assert.equal(step.phase,'approve');assert.equal(x.lab.payment(next.paymentId||x.lab.request(next.id).paymentId).walletPubkey,x.sender.walletPubkey);assert.equal(x.f.sends,0);
});
await test('a fresh draft keeps an explicitly selected empty payer and uses a distinct receiver',async()=>{
 const x=await setup(),empty=await x.other('Empty receiver');x.f.state.solBalances.set(empty.walletPubkey,0);await x.f.api.latch.walletSelect({walletId:empty.walletId});
 await x.run('request.review');assert.equal(await x.wallet(),empty.walletPubkey);assert.equal(x.forms.requests.recipient,x.sender.walletPubkey);assert.equal(x.lab.state.paymentRequests.length,0);assert.equal(x.f.sends,0);
});
await test('imported terms never offer replacement and genuine missing SOL carries the same public payer',async()=>{
 const x=await setup(),other=await x.other('External payer'),row=await x.request(x.sender.walletPubkey);x.lab.request(row.id).origin='imported';x.lab.save();x.f.state.solBalances.set(other.walletPubkey,0);
 let step=await x.run('request.payer',{kind:'request-payment'});assert.match(step.guide.label,/Use External payer/);
 step=await x.run('request.payer',{kind:'request-payment'},step);assert.equal(step.guide.handoff.copyText,other.walletPubkey);assert.equal(step.guide.handoff.url,'https://faucet.solana.com/');
 assert.deepEqual(x.lab.request(row.id).terms,row.terms);assert.equal(x.lab.state.paymentRequests.length,1);
});
console.log(JSON.stringify({passed,native:false,network:'offline-signed-fixtures'}));
