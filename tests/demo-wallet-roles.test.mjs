// Real public role controller against isolated in-memory Latch/Conduit doubles.
// Wallet effects remain local fixtures; no live RPC, faucet, signature or send.
import assert from 'node:assert/strict';
import {wire} from './capability-fixture.mjs';
import {demoWalletRolesKey,readDemoWalletRoles,setDemoReceiver,selectDemoPayer,ensureDemoWalletPair} from '../src/demo-wallets.mjs';
import {fillDemoDefaults,refreshDemoRecipients,createDemoReceiver,prepareDemoWalletsForDraft} from '../src/demo-defaults.mjs';
import {checkDemoSolReceiver,guidedSolSetup} from '../src/guided-wallet.mjs';
import {useFundedDemoPayer} from '../src/funded-wallet.mjs';
const addresses=await Promise.all(Array.from({length:9},async()=> (await wire.createWallet()).address));
let passed=0;const test=async(name,fn)=>{await fn();console.log('PASS '+name);passed++;};
function fixture({count=0,selected=count?0:-1,storage=new Map(),key='role-test',balances=new Map(),minimum=890880}={}){
 let next=count,active=selected<0?'':'wallet-'+selected,network='devnet';
 const wallets=Array.from({length:count},(_,i)=>({walletId:'wallet-'+i,walletPubkey:addresses[i],label:'Wallet '+i,network:'devnet',privateKey:'MUST_NOT_LEAVE_LATCH'}));
 const calls=[];let hook=null;
 const lab={key,state:{payments:[{id:'saved-payment',walletPubkey:addresses[0],recipient:addresses[1],amountLamports:10000}]},storage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},onChange(){},rawCall:async(c,m,input={})=>{
  calls.push({c,m,input});if(hook)await hook(c,m,input);
  if(c==='latch'&&m==='status'){const wallet=wallets.find(w=>w.walletId===active);return {network,walletManager:true,walletCreateKeepsSelection:true,wallet:wallet?{...wallet,connected:true}:{connected:false}};}
  if(c==='latch'&&m==='walletList')return {wallets:wallets.map(w=>({...w})),active:{devnet:wallets.find(w=>w.walletId===active)}};
  if(c==='latch'&&m==='walletSelect'){assert.ok(wallets.some(w=>w.walletId===input.walletId));active=input.walletId;return {selected:true};}
  if(c==='latch'&&m==='walletCreate'){assert.equal(input.network,'devnet');assert.equal(input.select,false);const i=next++,wallet={walletId:'wallet-'+i,walletPubkey:addresses[i],label:input.label,network:'devnet',secretKey:'MUST_NOT_LEAVE_LATCH'};wallets.push(wallet);return {...wallet};}
  if(c==='conduit'&&m==='balance'){const value=balances.get(input.walletPubkey)??1000000000;if(value instanceof Error)throw value;return {network:'devnet',walletPubkey:input.walletPubkey,value};}
  if(c==='conduit'&&m==='request'){assert.equal(input.method,'getMinimumBalanceForRentExemption');assert.deepEqual(input.params,[0,{commitment:'confirmed'}]);return minimum;}
  throw Error('Unexpected fixture method '+c+'.'+m);
 }};
 return {lab,wallets,calls,storage,balances,get active(){return active;},setActive(id){active=id;},setNetwork(n){network=n;},setHook(fn){hook=fn;}};
}
await test('opening role setup reads only public metadata and creates no wallets or funds calls',async()=>{
 const f=fixture(),before=JSON.stringify(f.lab.state),roles=await readDemoWalletRoles(f.lab);
 assert.equal(roles.payer,null);assert.equal(roles.receiver,null);assert.equal(roles.canCreate,true);
 assert.deepEqual(f.calls.map(c=>c.c+'.'+c.m),['latch.status','latch.walletList']);assert.equal(f.storage.size,0);assert.equal(JSON.stringify(f.lab.state),before);
});
for(const count of [0,1,2])await test(count+' available wallets produce one reusable distinct pair without replacing the selected payer',async()=>{
 const f=fixture({count}),before=JSON.stringify(f.lab.state);
 const [a,b]=await Promise.all([ensureDemoWalletPair(f.lab),ensureDemoWalletPair(f.lab)]);
 assert.equal(a.payer.walletPubkey,b.payer.walletPubkey);assert.equal(a.receiver.walletPubkey,b.receiver.walletPubkey);assert.notEqual(a.payer.walletPubkey,a.receiver.walletPubkey);
 assert.equal(f.wallets.length,2);assert.equal(f.calls.filter(c=>c.m==='walletCreate').length,2-count);assert.equal(f.active,'wallet-0');
 assert.equal((await readDemoWalletRoles(f.lab)).receiver.source,'saved');assert.equal(JSON.stringify(f.lab.state),before);
 assert.doesNotMatch(JSON.stringify(a),/MUST_NOT_LEAVE_LATCH|privateKey|secretKey/);assert.doesNotMatch(f.storage.get(demoWalletRolesKey(f.lab)),/MUST_NOT_LEAVE_LATCH|privateKey|secretKey/);
 await ensureDemoWalletPair(f.lab);assert.equal(f.wallets.length,2);
});
await test('a lone unselected saved wallet is reused as payer before a receiver is created',async()=>{
 const f=fixture({count:1,selected:-1}),pair=await ensureDemoWalletPair(f.lab);
 assert.equal(pair.payer.walletPubkey,addresses[0]);assert.equal(pair.created.payer,false);assert.equal(pair.created.receiver,true);assert.equal(f.wallets.length,2);
});
await test('an unselected payer cannot take the funded saved receiver role',async()=>{
 const f=fixture({count:2,selected:-1});await setDemoReceiver(f.lab,{walletId:'wallet-1'});
 const saved=f.storage.get(demoWalletRolesKey(f.lab));f.balances.set(addresses[0],0);f.balances.set(addresses[1],1000000000);
 const pair=await ensureDemoWalletPair(f.lab);
 assert.equal(pair.payer.walletPubkey,addresses[0]);assert.equal(pair.receiver.walletPubkey,addresses[1]);assert.equal(pair.created.payer,false);assert.equal(pair.created.receiver,false);
 assert.equal(f.wallets.length,2);assert.equal(f.storage.get(demoWalletRolesKey(f.lab)),saved);
 assert.ok(!f.calls.some(c=>c.c==='conduit'&&c.m==='balance'&&c.input.walletPubkey===addresses[1]),'the reserved receiver cannot enter funded payer selection');
});
await test('a sole saved receiver is retained and a missing payer is created separately',async()=>{
 const f=fixture({count:1,selected:-1});await setDemoReceiver(f.lab,{walletId:'wallet-0'});
 const pair=await ensureDemoWalletPair(f.lab);assert.equal(pair.receiver.walletPubkey,addresses[0]);assert.equal(pair.payer.walletPubkey,addresses[1]);assert.equal(pair.created.payer,true);assert.equal(pair.created.receiver,false);assert.equal(f.wallets.length,2);
});
await test('entered receivers are reserved when a draft must choose a missing payer',async()=>{
 const f=fixture({count:3,selected:-1});f.balances.set(addresses[0],0);
 const form={items:[{recipient:addresses[1],amount:'0.00001'},{recipient:addresses[2],amount:'0.00001'}]};
 await prepareDemoWalletsForDraft(f.lab,'batch',form);assert.equal(f.active,'wallet-0');assert.equal(form.items[0].recipient,addresses[1]);assert.equal(form.items[1].recipient,addresses[2]);assert.equal(f.wallets.length,3);
});
await test('Create receiver means a new receiver while Prepare wallets reuses the saved role',async()=>{
 const f=fixture({count:2});await ensureDemoWalletPair(f.lab);const next=await ensureDemoWalletPair(f.lab,{forceNewReceiver:true,receiverLabel:'Video receiver'});
 assert.equal(next.created.receiver,true);assert.equal(next.receiver.label,'Video receiver');assert.equal(next.receiver.walletPubkey,addresses[2]);assert.equal(f.active,'wallet-0');
 await ensureDemoWalletPair(f.lab);assert.equal(f.wallets.length,3);assert.equal((await readDemoWalletRoles(f.lab)).receiver.walletPubkey,addresses[2]);
});
await test('explicit role changes survive reload, contain public metadata, and preserve saved payments',async()=>{
 const f=fixture({count:3}),original=JSON.stringify(f.lab.state);
 await setDemoReceiver(f.lab,{walletId:'wallet-2'});const reloaded=fixture({count:3,storage:f.storage});
 assert.equal((await readDemoWalletRoles(reloaded.lab)).receiver.walletPubkey,addresses[2]);
 const external=await setDemoReceiver(f.lab,{walletPubkey:addresses[8]});assert.equal(external.external,true);assert.equal(external.walletId,'');
 assert.equal((await readDemoWalletRoles(f.lab)).receiver.walletPubkey,addresses[8]);assert.equal(JSON.stringify(f.lab.state),original);
 const other=fixture({count:3,storage:f.storage,key:'other-workspace'});assert.equal((await readDemoWalletRoles(other.lab)).receiver.source,'available');
 await assert.rejects(()=>setDemoReceiver(f.lab,{walletId:'wallet-1',walletPubkey:addresses[2]}),/available/);
 await assert.rejects(()=>setDemoReceiver(f.lab,{walletId:'wallet-0'}),/different/);
});
await test('malformed decoded addresses, system placeholders and the selected payer cannot be saved as a receiver',async()=>{
 const f=fixture({count:2});
 for(const walletPubkey of ['2'.repeat(32),'1'.repeat(32),addresses[0]])await assert.rejects(()=>setDemoReceiver(f.lab,{walletPubkey}));
 assert.equal(f.storage.size,0);assert.equal(f.calls.filter(c=>c.m==='walletCreate'||c.m==='walletSelect').length,0);
});
await test('deleted receiver stays unavailable until an explicit setup action chooses a replacement',async()=>{
 const f=fixture({count:3});await setDemoReceiver(f.lab,{walletId:'wallet-1'});f.wallets.splice(1,1);
 let roles=await readDemoWalletRoles(f.lab);assert.equal(roles.receiver,null);assert.equal(roles.receiverIssueCode,'missing');assert.equal(roles.rememberedReceiver.walletPubkey,addresses[1]);
 const form={recipient:''};await fillDemoDefaults(f.lab,'service',form);assert.equal(form.recipient,'');assert.equal(f.wallets.length,2);
 const pair=await ensureDemoWalletPair(f.lab);assert.equal(pair.receiver.walletPubkey,addresses[2]);assert.equal(pair.created.receiver,false);
});
await test('switching payer to the receiver reports conflict and clears only automatic draft recipients',async()=>{
 const f=fixture({count:2});await ensureDemoWalletPair(f.lab);
 const forms={checkout:{recipient:'',amount:'0.00001'},service:{recipient:addresses[1],amount:'0.00001'},batch:{items:[{recipient:''},{recipient:addresses[8]}]}};
 await refreshDemoRecipients(f.lab,forms);assert.equal(forms.checkout.recipient,addresses[1]);assert.equal(forms.checkout.demoRecipient,addresses[1]);
 const roles=await selectDemoPayer(f.lab,'wallet-1');assert.equal(roles.receiver,null);assert.equal(roles.receiverIssueCode,'same-as-payer');
 await refreshDemoRecipients(f.lab,forms,{roleSnapshot:roles});assert.equal(forms.checkout.recipient,'');assert.equal(forms.batch.items[0].recipient,'');assert.equal(forms.service.recipient,addresses[1]);assert.equal(forms.batch.items[1].recipient,addresses[8]);
 await ensureDemoWalletPair(f.lab);await refreshDemoRecipients(f.lab,forms);assert.equal(forms.checkout.recipient,addresses[0]);assert.equal(forms.service.recipient,addresses[1]);assert.equal(f.wallets.length,2);
});
await test('default roles cover every payment draft and honor explicit payer plus typed recipients',async()=>{
 const f=fixture({count:3});await setDemoReceiver(f.lab,{walletId:'wallet-2'});
 for(const kind of ['checkout','treasury','service','proof','positions','requests','tokens']){
  const form={recipient:'',mint:addresses[8]};await fillDemoDefaults(f.lab,kind,form);assert.equal(form.recipient,addresses[2],kind);
  form.recipient=addresses[7];await fillDemoDefaults(f.lab,kind,form);assert.equal(form.recipient,addresses[7],kind);
 }
 const form={recipient:'',walletPubkey:addresses[2]};await fillDemoDefaults(f.lab,'checkout',form);assert.equal(form.recipient,'','receiver must not become a self-transfer against an explicit sender');
 assert.equal(f.active,'wallet-0');assert.equal(f.calls.filter(c=>c.c==='conduit').length,0,'defaults never choose another payer from balances');
});
await test('an explicitly selected empty payer is not replaced by a funded saved account',async()=>{
 const f=fixture({count:2});f.balances.set(addresses[0],0);const result=await useFundedDemoPayer(f.lab,{amountAtomic:'10000'});
 assert.equal(result,null);assert.equal(f.active,'wallet-0');const pair=await ensureDemoWalletPair(f.lab);assert.equal(pair.payer.walletPubkey,addresses[0]);
 const setup=await guidedSolSetup(f.lab,{recipient:addresses[1],amount:'0.00001'});assert.equal(setup.guide.handoff.copyText,addresses[0]);assert.equal(f.active,'wallet-0');
});
await test('a wallet selection made during receiver creation wins without leaking or deleting the new wallet',async()=>{
 const f=fixture({count:2});f.setHook(async(c,m)=>{if(c==='latch'&&m==='walletCreate')f.setActive('wallet-1');});
 await assert.rejects(()=>ensureDemoWalletPair(f.lab,{forceNewReceiver:true}),/selected payer changed/);assert.equal(f.active,'wallet-1');assert.equal(f.wallets.length,3);assert.equal(f.storage.size,0);
});
await test('a receiver selected while pair creation is pending wins over the older setup request',async()=>{
 const f=fixture({count:2});let release;const wait=new Promise(r=>release=r);let signal;const reached=new Promise(r=>signal=r);
 f.setHook(async(c,m)=>{if(m==='walletCreate'){signal();await wait;}});
 const job=ensureDemoWalletPair(f.lab,{forceNewReceiver:true});await reached;
 await setDemoReceiver(f.lab,{walletPubkey:addresses[8]});release();await assert.rejects(()=>job,/receiver changed during setup/);
 assert.equal((await readDemoWalletRoles(f.lab)).receiver.walletPubkey,addresses[8]);assert.equal(f.wallets.length,3);
});
await test('unreadable receiver preferences fail closed without creating keys or overwriting bytes',async()=>{
 const f=fixture();f.storage.set(demoWalletRolesKey(f.lab),'not-json');assert.equal((await readDemoWalletRoles(f.lab)).receiverIssueCode,'storage');
 await assert.rejects(()=>ensureDemoWalletPair(f.lab),/could not be read/);assert.equal(f.wallets.length,0);assert.equal(f.storage.get(demoWalletRolesKey(f.lab)),'not-json');
});
await test('a receiver typed while setup is pending is preserved in the editable form',async()=>{
 const f=fixture({count:1}),form={recipient:''};let release;const wait=new Promise(r=>release=r);let signal;const reached=new Promise(r=>signal=r);
 f.setHook(async(c,m)=>{if(m==='walletCreate'){signal();await wait;}});
 const job=createDemoReceiver(f.lab,form);await reached;form.recipient=addresses[8];release();await job;assert.equal(form.recipient,addresses[8]);assert.equal(form.demoRecipient,undefined);
});
await test('tiny first SOL credit waits for receiver funding using the observed minimum and correct address',async()=>{
 const f=fixture({count:2});f.balances.set(addresses[1],0);
 const result=await checkDemoSolReceiver(f.lab,{recipient:addresses[1],amount:'0.00001'});assert.equal(result.ready,false);assert.equal(result.minimumLamports,890880);
 assert.equal(result.guide.handoff.copyText,addresses[1]);assert.match(result.guide.handoff.copyLabel,/Receiver/);assert.match(result.guide.body,/0\.00089088/);
 assert.equal(f.calls.filter(c=>c.m==='walletCreate'||c.m==='walletSelect').length,0);
 f.balances.set(addresses[1],1000000);assert.equal((await checkDemoSolReceiver(f.lab,{recipient:addresses[1],amount:'0.00001'})).ready,true);
});
await test('a payer change during receiver funding checks cannot pass stale payer readiness',async()=>{
 const f=fixture({count:2});f.setHook(async(c,m,input)=>{if(c==='conduit'&&m==='balance'&&input.walletPubkey===addresses[1])f.setActive('wallet-1');});
 const result=await guidedSolSetup(f.lab,{recipient:addresses[1],amount:'0.00001'});
 assert.equal(result.ready,false);assert.match(result.guide.body,/payer changed/);assert.equal(f.active,'wallet-1');
});
await test('first transfer that supplies the observed minimum passes, while unknown receiver reads cannot pass',async()=>{
 const f=fixture({count:2});f.balances.set(addresses[1],0);
 const result=await checkDemoSolReceiver(f.lab,{recipient:addresses[1],amountAtomic:'890880'});assert.equal(result.ready,true);assert.equal(result.fundedByTransfer,true);
 f.balances.set(addresses[1],Error('Fixture offline'));const unknown=await checkDemoSolReceiver(f.lab,{recipient:addresses[1],amount:'0.001'});assert.equal(unknown.ready,false);assert.equal(unknown.guide.handoff,undefined);
 assert.match(unknown.guide.body,/needs a verified balance/);
});
console.log(JSON.stringify({passed,network:'offline fixtures',signatures:0,sends:0,native:false}));
