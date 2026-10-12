import assert from 'node:assert/strict';
import {fillDemoDefaults,DEVNET_DEMO_MINT} from '../src/demo-defaults.mjs';
import {setDemoReceiver} from '../src/demo-wallets.mjs';
import {CapabilityLab} from '../src/capability-lab.mjs';
import {createGuidedActions} from '../src/guided-actions.mjs';
import {capabilityFixture,mint,recipient,wire} from './capability-fixture.mjs';
const f=capabilityFixture(),saved=new Map(),storage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)};
const lab=new CapabilityLab({call:(c,m,i)=>f.api[c][m](i),storage});
const sender=(await lab.connectWallet()).walletPubkey;f.state.sender=sender;await setDemoReceiver(lab,{walletPubkey:recipient});
let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
const forms={checkout:{amount:'0.00001',recipient:''},treasury:{amount:'0.00001',recipient:''},service:{title:'Guide defaults',text:'[{"tasks":2}]',amount:'0.00001',recipient:''},batch:{title:'Guide batch',items:[{label:'Self',amount:'0.00001',recipient:''},{label:'Entered',amount:'0.00001',recipient}]},proof:{title:'Guide proof',text:'Exact bytes',amount:'0.00001',recipient:''},tokens:{mint:'',recipient,amount:'1'},requests:{recipient:'',assetKind:'native',mint:'',amount:'0.001',minutes:'60'},activity:{network:'devnet',address:''}},selected={};
const actions=createGuidedActions({getLab:()=>lab,forms,selected}),run=(id,args={})=>actions.find(a=>a.definition.id==='solana-lab.'+id).handler(args);
for(const kind of ['checkout','treasury','service','batch','proof'])await test('Guide fills and prepares '+kind+' with the separate configured receiver without signing',async()=>{
 const before=f.sends;await run('run.review',{kind});
 if(kind==='batch'){assert.equal(forms.batch.items[0].recipient,recipient);assert.equal(forms.batch.items[1].recipient,recipient);}else assert.equal(forms[kind].recipient,recipient);
 await run(['checkout','treasury'].includes(kind)?'payment.prepare':'workflow.prepare',{kind});assert.equal(f.sends,before);
 const row=['checkout','treasury'].includes(kind)?lab.payment(selected[kind]):lab.workflow(selected[kind]);const bytes=JSON.stringify(row);
 forms[kind].recipient=recipient;await run('run.review',{kind});assert.equal(JSON.stringify(row),bytes);
});
await test('Guide chooses an observed token mint, preserves explicit receiver/amount and prepares exactly those terms',async()=>{
 await run('token.review');assert.equal(forms.tokens.mint,mint);assert.equal(forms.tokens.recipient,recipient);assert.equal(forms.tokens.amount,'1');
 await run('mint.inspect');await run('token.prepare');const p=lab.payment(selected.tokens);assert.equal(p.asset.mint,mint);assert.equal(p.recipient,recipient);assert.equal(p.amountAtomic,'1000000');assert.equal(f.sends,0);
 forms.tokens.mint=DEVNET_DEMO_MINT;await run('mint.inspect');assert.equal(lab.state.mints.at(-1).asset.mint,mint,'saved transfer keeps its mint');
});
await test('Manual receiver default is preserved by Guide and self-payment cannot produce false recipient credit',async()=>{
 await fillDemoDefaults(lab,'requests',forms.requests);assert.equal(forms.requests.recipient,recipient);forms.requests.recipient=sender;delete forms.requests.demoRecipient;await run('request.review');assert.equal(forms.requests.recipient,sender);await run('request.create');const row=lab.request(selected.requests);assert.equal(row.terms.recipient,sender);
 await assert.rejects(()=>lab.prepareRequest(row.id),/selected wallet is the recipient/);assert.equal(f.sends,0);
});
await test('SPL request Guide fills and inspects a missing mint before saving',async()=>{
 const next={...forms.requests,assetKind:'spl-token',mint:'',recipient,amount:'0.01'};forms.requests=next;
 actions.resetRun('create-payment-request');await run('request.review');assert.equal(next.mint,mint);await run('request.create');assert.equal(lab.request(selected.requests).terms.amountAtomic,'10000');assert.equal(f.sends,0);
});
await test('Guide reads the current devnet wallet by default and respects an explicit address',async()=>{
 await run('activity.load');assert.equal(forms.activity.address,sender);assert.equal(lab.state.addressActivity.address,sender);
 forms.activity.address=recipient;await run('activity.load');assert.equal(lab.state.addressActivity.address,recipient);
 forms.activity={network:'mainnet-beta',address:''};await assert.rejects(()=>run('activity.load'),/public mainnet address/);assert.equal(forms.activity.network,'mainnet-beta');
});
await test('No tokens or failed reads use the published inspection mint without inventing a balance',async()=>{
 for(const inspectAssets of [async()=>({tokens:{accounts:[],truncated:false}}),async()=>{throw Error('RPC unavailable');}]){
  const fake={inspectAssets,rawCall:async()=>({network:'devnet',walletManager:false})},form={mint:'',recipient,amount:'0.25'};
  await fillDemoDefaults(fake,'tokens',form);assert.equal(form.mint,DEVNET_DEMO_MINT);assert.equal(form.amount,'0.25');assert.match(form.setupNote,/selected as an example/);
 }
});
await test('Default token recipient comes only from a different saved devnet wallet',async()=>{
 const mainnet=(await wire.createWallet()).address;
 const fake={storage:{getItem:()=>null,setItem:()=>{}},rawCall:async(c,m)=>m==='status'?{network:'devnet',walletManager:true}:{active:{devnet:{walletPubkey:sender}},wallets:[{network:'mainnet-beta',walletPubkey:mainnet},{network:'devnet',walletPubkey:sender},{network:'devnet',walletPubkey:recipient}]}};
 const form={mint,recipient:''};await fillDemoDefaults(fake,'tokens',form);assert.equal(form.recipient,recipient);
 const lonely={storage:{getItem:()=>null,setItem:()=>{}},rawCall:async(c,m)=>m==='status'?{network:'devnet',walletManager:true}:{active:{devnet:{walletPubkey:sender}},wallets:[{network:'devnet',walletPubkey:sender}]}};
 const empty={mint,recipient:''};await fillDemoDefaults(lonely,'tokens',empty);assert.equal(empty.recipient,'');assert.match(empty.setupNote,/Guide can create/);
});
await test('An input entered during an asynchronous default read wins',async()=>{
 let release;const wait=new Promise(r=>release=r),form={mint:'',recipient};
 const fake={inspectAssets:()=>wait,rawCall:async()=>({})};const action=fillDemoDefaults(fake,'tokens',form);form.mint=recipient;release({tokens:{accounts:[{supported:true,mint,amountAtomic:'12'}]}});await action;assert.equal(form.mint,recipient);
});
await test('Changing activity query clears unrelated transaction details',async()=>{
 lab.state.activityTransaction={signature:'previous',network:'devnet'};lab.save();await lab.loadActivity({address:sender,network:'devnet'});assert.equal(lab.state.activityTransaction,undefined);
});
await test('Request verification fills only this request’s recorded signature and still verifies recipient credit',async()=>{
 const row=lab.request(selected.requests),p=await lab.prepareRequest(row.id);
 await lab.approvePayment(p.id);await lab.submitPayment(p.id);await lab.reconcilePayment(p.id);
 forms.requests.signature='';await run('request.verify');assert.equal(forms.requests.signature,lab.payment(p.id).operation.signature);assert.equal(lab.request(row.id).verification.paid,true);
 forms.requests.signature='user-entered';await assert.rejects(()=>run('request.verify'),/signature/);assert.equal(forms.requests.signature,'user-entered');assert.equal(f.sends,1);
});
console.log(JSON.stringify({passed,network:'fixtures',sends:f.sends,native:false}));
