import assert from 'node:assert/strict';
import {capabilityFixture,mint,recipient} from './capability-fixture.mjs';
import {CapabilityLab} from '../src/capability-lab.mjs';
import {createGuidedActions} from '../src/guided-actions.mjs';
import {ensureGuidedWallet} from '../src/guided-wallet.mjs';

let passed=0;const test=async(name,fn)=>{await fn();console.log('PASS '+name);passed++;};
function setup(){
 const f=capabilityFixture({overrides:{latch:{providerMode:'device-wallet',tokenLimits:JSON.stringify([{mint,maxAmountAtomic:'1000000'}])}}}),saved=new Map();
 const lab=new CapabilityLab({call:(c,m,i)=>f.api[c][m](i),storage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)}});
 const forms={tokens:{mint,recipient:'',amount:'1'},requests:{recipient:'',assetKind:'native',amount:'0.001',minutes:'60',label:'Fresh demo'},activity:{network:'devnet',address:''},policy:{},positions:{}};
 for(const kind of ['checkout','treasury','service','proof'])forms[kind]={amount:'0.00001',recipient:'',title:'Fresh demo',text:'[{"tasks":2}]'};
 forms.batch={title:'Fresh batch',items:[{label:'One',recipient:'',amount:'0.00001'},{label:'Two',recipient:'',amount:'0.00001'}]};
 const selected={},actions=createGuidedActions({getLab:()=>lab,forms,selected});
 const run=(id,args={},previous)=>actions.find(a=>a.definition.id==='solana-lab.'+id).handler(args,{userConfirmed:true,checkpoint:previous?.guide?.checkpoint});
 const wallet=async()=>{const w=(await f.api.latch.status()).wallet;f.state.sender=w.walletPubkey;return w;};
 return {f,lab,forms,selected,run,wallet,actions};
}
await test('fresh token Guide creates its payer and receiver in place, once, and does not sign',async()=>{
 const x=setup();await x.run('token.review');const payer=await x.wallet();assert.equal(payer.connected,true);
 await x.run('token.receiver');await x.run('token.receiver');const list=await x.f.api.latch.walletList();
 assert.equal(list.wallets.length,2);assert.notEqual(x.forms.tokens.recipient,payer.walletPubkey);assert.equal((await x.wallet()).walletPubkey,payer.walletPubkey);
 assert.equal(x.lab.state.payments.length,0);assert.equal(x.f.sends,0);assert.ok(!x.lab.state.events.some(e=>e.method==='walletCreate'));
 x.f.state.solBalances.set(payer.walletPubkey,0);x.f.state.sourceMissing=true;
 let progress=await x.run('token.setup');assert.equal(progress.guide.complete,false);assert.equal(progress.guide.handoff.copyText,payer.walletPubkey);assert.equal(progress.guide.handoff.url,'https://faucet.solana.com/');
 x.f.state.solBalances.set(payer.walletPubkey,15000000);progress=await x.run('token.setup');assert.equal(progress.guide.complete,false);assert.match(progress.guide.body,/exact mint/);
 x.f.state.sourceMissing=false;await x.run('token.setup');await x.run('token.prepare');assert.equal(x.lab.payment(x.selected.tokens).walletPubkey,payer.walletPubkey);assert.equal(x.f.sends,0);
});
await test('resuming the receiver step directly also creates a missing payer before its receiver',async()=>{
 const x=setup();await x.run('token.receiver');assert.equal((await x.f.api.latch.walletList()).wallets.length,2);assert.notEqual((await x.wallet()).walletPubkey,x.forms.tokens.recipient);assert.equal(x.f.sends,0);
});
await test('fresh request Guide creates two wallets and keeps the payer through request funding',async()=>{
 const x=setup();await x.run('request.review');const payer=await x.wallet();await x.run('request.receiver');await x.run('request.create');
 const row=x.lab.request(x.selected.requests);assert.notEqual(row.terms.recipient,payer.walletPubkey);x.f.state.solBalances.set(payer.walletPubkey,0);x.f.state.solBalances.set(row.terms.recipient,0);
 const blocked=await x.run('request.payer',{kind:'requests'});assert.equal(blocked.guide.handoff.copyText,payer.walletPubkey);
 x.f.state.solBalances.set(payer.walletPubkey,1000000000);assert.equal((await x.run('request.payer',{kind:'requests'},blocked)).ready,true);
 assert.equal(x.lab.state.paymentRequests.length,1);assert.equal((await x.f.api.latch.walletList()).wallets.length,2);assert.equal(x.f.sends,0);
});
for(const kind of ['checkout','treasury','service','batch','proof'])await test('fresh '+kind+' setup creates a payer and separate receiver and resumes the same draft after funding',async()=>{
 const x=setup();await x.run('run.review',{kind});const payer=await x.wallet();x.f.state.solBalances.set(payer.walletPubkey,0);
 const action=['checkout','treasury'].includes(kind)?'payment.prepare':'workflow.prepare';
 const pending=await x.run(action,{kind});assert.equal(pending.guide.complete,false);assert.equal(pending.guide.handoff.copyText,payer.walletPubkey);assert.equal(x.lab.state.payments.length,0);assert.equal(x.lab.state.workflows.length,0);
 x.f.state.solBalances.set(payer.walletPubkey,1000000000);await x.run(action,{kind},pending);assert.ok(x.selected[kind]);assert.equal((await x.f.api.latch.walletList()).wallets.length,2);assert.equal(x.f.sends,0);
});
await test('fresh receiver funding blocks a tiny SOL workflow before a saved payment while retaining the chosen pair',async()=>{
 const x=setup();await x.run('run.review',{kind:'service'});const payer=await x.wallet(),receiver=x.forms.service.recipient;
 assert.notEqual(payer.walletPubkey,receiver);x.f.state.solBalances.set(receiver,0);
 const pending=await x.run('workflow.prepare',{kind:'service'});assert.equal(pending.ready,false);assert.equal(pending.guide.handoff.copyText,receiver);assert.match(pending.guide.handoff.copyLabel,/Receiver/);
 assert.equal(x.lab.state.payments.length,0);assert.equal(x.lab.state.workflows.length,0);assert.equal(x.f.sends,0);
 x.f.state.solBalances.set(receiver,1000000);await x.run('workflow.prepare',{kind:'service'},pending);
 const saved=x.lab.workflow(x.selected.service);assert.equal(saved.sender,payer.walletPubkey);assert.equal(saved.items[0].recipient,receiver);assert.equal((await x.f.api.latch.walletList()).wallets.length,2);assert.equal(x.f.sends,0);
});
await test('wallet setup Guide requires its button and creates one reusable pair with no payment',async()=>{
 const x=setup(),action=x.actions.find(a=>a.definition.id==='solana-lab.wallets.setup');
 await assert.rejects(()=>action.handler({}),/Confirm this step in Guide/);assert.equal((await x.f.api.latch.walletList()).wallets.length,0);
 await x.run('wallets.setup');await x.run('wallets.setup');assert.equal((await x.f.api.latch.walletList()).wallets.length,2);
 const payer=await x.wallet();x.f.state.solBalances.set(payer.walletPubkey,0);const result=await x.run('wallets.checkFunds');assert.equal(result.guide.handoff.copyText,payer.walletPubkey);assert.equal(x.lab.state.payments.length,0);assert.equal(x.f.sends,0);
});
await test('public activity uses a missing devnet wallet without funding, but explicit addresses and simulations create none',async()=>{
 const x=setup();x.forms.activity.address=recipient;await x.run('activity.load');await x.run('policy.check',{scenario:'fee'});assert.equal((await x.f.api.latch.walletList()).wallets.length,0);
 x.forms.activity.address='';await x.run('activity.load');assert.equal(x.forms.activity.address,(await x.wallet()).walletPubkey);assert.equal((await x.f.api.latch.walletList()).wallets.length,1);assert.equal(x.lab.state.addressActivity.entries.length,0);
});
await test('existing funded wallet is reused; concurrent setup does not create duplicates or replace missing saved senders',async()=>{
 const x=setup(),old=await x.f.api.latch.walletCreate({network:'devnet',label:'Funded',select:false});
 const [a,b]=await Promise.all([ensureGuidedWallet(x.lab),ensureGuidedWallet(x.lab)]);assert.equal(a.walletPubkey,old.walletPubkey);assert.equal(b.walletPubkey,old.walletPubkey);assert.equal((await x.f.api.latch.walletList()).wallets.length,1);
 await assert.rejects(()=>ensureGuidedWallet(x.lab,{sender:recipient}),/Restore the saved sender/);assert.equal((await x.wallet()).walletPubkey,old.walletPubkey);
 const empty=setup();await Promise.all([ensureGuidedWallet(empty.lab),ensureGuidedWallet(empty.lab)]);assert.equal((await empty.f.api.latch.walletList()).wallets.length,1);
});
console.log(JSON.stringify({passed,network:'offline fixtures',nativeDevice:false}));
