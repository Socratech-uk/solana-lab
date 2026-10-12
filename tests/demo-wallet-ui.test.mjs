// Actual Lab DOM controls with the supplied runtimes and controlled RPC replies.
// This does not qualify Chromium layout, native execution or a funded transfer.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {JSDOM,ResourceLoader} from 'jsdom';
import {fixture} from './devnet-fixture.mjs';
import {marketResponse} from './market-fixture.mjs';

const root=new URL('../',import.meta.url);
const read=rel=>fs.readFileSync(new URL(rel,root),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
let passed=0,app;
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
const pauseReached=async(held,label)=>{let reached=false;held.entered.then(()=>reached=true);await app.until(()=>reached,label);};
async function openApp(seed=[]){
 class LocalAssets extends ResourceLoader{
  fetch(url){const u=new URL(url);assert.equal(u.origin,'https://wallet-ui.test');const result=Promise.resolve(Buffer.from(read(u.pathname.slice(1))));result.abort=()=>{};return result;}
 }
 const dom=new JSDOM(read('index.html'),{url:'https://wallet-ui.test/',runScripts:'dangerously',resources:new LocalAssets(),pretendToBeVisual:true});
 const w=dom.window,rpc=fixture({confirmationStatus:'finalized'}),balances=new Map(),reads=[],heldBalances=[];
 w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.AbortController=AbortController;w.structuredClone=structuredClone;w.scrollTo=()=>{};w.confirm=()=>true;w.isSecureContext=true;
 Object.defineProperty(w,'crypto',{value:webcrypto});
 Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async()=>{}}});
 for(const [key,value] of seed)w.localStorage.setItem(key,value);
 w.fetch=async(url,options)=>{
  if(String(url).startsWith('https://api.jup.ag/price/v3'))return marketResponse();
  const request=JSON.parse(options.body);reads.push({method:request.method,params:request.params});
  const hold=heldBalances.find(row=>request.method==='getBalance'&&request.params[0]===row.address);
  if(hold){heldBalances.splice(heldBalances.indexOf(hold),1);hold.markEntered();await hold.gate;}
  const reply=result=>Promise.resolve(new Response(JSON.stringify({jsonrpc:'2.0',id:request.id,result}),{headers:{'content-type':'application/json'}}));
  if(request.method==='getBalance'&&balances.has(request.params[0]))return reply({context:{slot:10},value:balances.get(request.params[0])});
  if(request.method==='getMinimumBalanceForRentExemption'){assert.deepEqual(request.params,[0,{commitment:'confirmed'}]);return reply(890880);}
  return rpc.ctx.fetch('https://fixture.invalid/',options);
 };
 const context=dom.getInternalVMContext(),modules=new Map();
 function moduleAt(rel){if(modules.has(rel))return modules.get(rel);const m=new vm.SourceTextModule(read(rel),{context,identifier:rel,initializeImportMeta:meta=>meta.url='https://wallet-ui.test/'+rel});modules.set(rel,m);return m;}
 const entry=moduleAt('src/app.mjs');await entry.link((specifier,parent)=>moduleAt(path.posix.normalize(path.posix.join(path.posix.dirname(parent.identifier),specifier))));await entry.evaluate();
 const q=selector=>w.document.querySelector(selector),all=selector=>[...w.document.querySelectorAll(selector)];
 async function until(predicate,label='UI update'){
  for(let i=0;i<1200;i++){if(await predicate())return;await tick();}
  throw Error(label+' timed out. '+(q('#toast')?.textContent||'')+' '+q('#content')?.textContent.slice(-700));
 }
 const idle=()=>!q('[data-wallet-action=refresh]')?.disabled&&!all('#content form button[type=submit]').some(button=>button.disabled&&button.closest('[data-wallet-form]'));
 const go=async route=>{w.location.hash='/'+route;await tick();await until(()=>q('.nav-item.active')?.getAttribute('href')==='#/'+route);await until(idle);await tick();};
 const click=async selector=>{await until(()=>q(selector)&&!q(selector).disabled,selector);q(selector).click();await tick();};
 const input=(selector,value,event='input')=>{const el=q(selector);assert.ok(el,selector);el.value=value;el.dispatchEvent(new w.Event(event,{bubbles:true}));};
 const submit=async selector=>{await click(selector+' button[type=submit]');await until(idle);await tick();};
 const wallets=async()=> (await w.capp.solana.latch.walletList()).wallets.filter(wallet=>wallet.network==='devnet');
 const selectedPayer=async()=> (await w.capp.solana.latch.status()).wallet.walletPubkey;
 const evidence=()=>JSON.parse(JSON.stringify(w.solanaLab.exportEvidence()));
 const snapshot=()=>Object.keys(w.localStorage).map(key=>[key,w.localStorage.getItem(key)]);
 const rolesKey=()=>Object.keys(w.localStorage).find(key=>key.startsWith('capp.solana-lab.wallet-roles.v1:'));
 const receiver=()=>JSON.parse(w.localStorage.getItem(rolesKey())).receiver.walletPubkey;
 const pauseBalance=address=>{
  let markEntered,release;const entered=new Promise(resolve=>markEntered=resolve),gate=new Promise(resolve=>release=resolve);
  heldBalances.push({address,markEntered,gate});return {entered,release};
 };
 const pauseLatchCall=(method,number=1)=>{
  const original=w.capp.solana.latch;let count=0,markEntered,release;
  const entered=new Promise(resolve=>markEntered=resolve),gate=new Promise(resolve=>release=resolve);
  const wrapped={...original,[method]:async(...args)=>{if(++count===number){markEntered();await gate;}return original[method](...args);}};
  w.capp.solana.latch=wrapped;
  return {entered,release,original,restore:()=>{if(w.capp.solana.latch===wrapped)w.capp.solana.latch=original;}};
 };
 const setReceiverElsewhere=(input,latch=w.capp.solana.latch)=>{
  const key=decodeURIComponent(rolesKey().slice('capp.solana-lab.wallet-roles.v1:'.length));
  const other={key,storage:w.localStorage,rawCall:(component,method,data)=>component==='latch'?latch[method](data):w.capp.solana[component][method](data)};
  return modules.get('src/demo-wallets.mjs').namespace.setDemoReceiver(other,input);
 };
 const close=()=>{w.dispatchEvent(new w.Event('pagehide'));w.close();};
 await until(()=>w.solanaLab,'Lab startup');
 const sideEffects={authorisations:0},latch=w.capp.solana.latch;
 w.capp.solana.latch={...latch,authorise:(...args)=>{sideEffects.authorisations++;return latch.authorise(...args);}};
 return {w,q,all,until,go,click,input,submit,wallets,selectedPayer,evidence,snapshot,rolesKey,receiver,close,rpc,balances,reads,pauseBalance,pauseLatchCall,setReceiverElsewhere,sideEffects};
}

try{
 app=await openApp();
 await check('opening Wallets never creates a payer or receiver automatically',async()=>{
  await app.go('wallets');assert.equal((await app.wallets()).length,0);assert.equal(app.all('.wallet-card').length,0);
  assert.ok(app.q('[data-wallet-action=prepare-pair]'));assert.equal(app.rolesKey(),undefined);
  assert.equal((await app.w.capp.solana.latch.status()).wallet.connected,false);assert.equal(app.rpc.sends,0);
 });
 await check('Prepare demo wallets creates two distinct device accounts only on its explicit click',async()=>{
  await app.click('[data-wallet-action=prepare-pair]');await app.until(()=>app.all('.wallet-card').length===2&&!app.q('[data-wallet-action=prepare-pair]').disabled);
  const wallets=await app.wallets(),payer=await app.selectedPayer(),receiver=app.receiver();assert.equal(wallets.length,2);assert.notEqual(payer,receiver);
  assert.equal(app.q('[data-wallet-role=payer] .wallet-address').textContent,payer);assert.equal(app.q('[data-wallet-role=receiver] .wallet-address').textContent,receiver);
  assert.equal(app.rpc.sends,0);assert.equal(app.evidence().state.payments.length,0);
 });
 // Reproduce the supplied user case from real device-wallet bytes generated by
 // the UI: two named wallets and a selected payer, with no saved receiver role.
 const initial=await app.wallets(),payerA=initial.find(w=>w.walletPubkey!==app.receiver()),receiverB=initial.find(w=>w.walletPubkey===app.receiver());
 for(const [wallet,label] of [[payerA,'cApp'],[receiverB,'Demo token receiver']]){
  const form=`[data-wallet-form=rename][data-wallet-id="${wallet.walletId}"]`;
  app.input(form+' [name=label]',label);await app.submit(form);
 }
 app.w.localStorage.removeItem(app.rolesKey());const existingSeed=app.snapshot();app.close();app=await openApp(existingSeed);
 await check('the existing cApp payer and Demo token receiver are reused after a reload',async()=>{
  await app.go('wallets');assert.equal((await app.wallets()).length,2);assert.equal(await app.selectedPayer(),payerA.walletPubkey);
  assert.match(app.q('[data-wallet-role=receiver]').textContent,/Demo token receiver/);assert.match(app.q('[data-wallet-role=receiver]').textContent,/SUGGESTED/);
  await app.click('[data-wallet-action=prepare-pair]');await app.until(()=>app.rolesKey()&&!app.q('[data-wallet-action=prepare-pair]').disabled);
  assert.equal((await app.wallets()).length,2);assert.equal(app.receiver(),receiverB.walletPubkey);assert.equal(await app.selectedPayer(),payerA.walletPubkey);assert.equal(app.rpc.sends,0);
 });
 await check('returning focus preserves unfinished wallet names and receiver addresses in their original controls',async()=>{
  const label=app.q('[data-wallet-form=create] [name=label]'),address=app.q('[data-wallet-form=receiver-address] [name=walletPubkey]');
  app.input('[data-wallet-form=create] [name=label]','Unfinished devnet wallet');app.input('[data-wallet-form=receiver-address] [name=walletPubkey]',receiverB.walletPubkey);
  label.focus();label.blur();const roles=app.w.localStorage.getItem(app.rolesKey());
  app.w.dispatchEvent(new app.w.Event('focus'));app.w.document.dispatchEvent(new app.w.Event('visibilitychange'));for(let i=0;i<16;i++)await tick();
  assert.equal(app.q('[data-wallet-form=create] [name=label]'),label);assert.equal(label.value,'Unfinished devnet wallet');
  assert.equal(app.q('[data-wallet-form=receiver-address] [name=walletPubkey]'),address);assert.equal(address.value,receiverB.walletPubkey);
  assert.equal(app.w.localStorage.getItem(app.rolesKey()),roles);assert.equal((await app.wallets()).length,2);assert.equal(app.rpc.sends,0);
  label.value=label.defaultValue;address.value=address.defaultValue;
 });
 await check('returning focus keeps an unsubmitted import file in the existing input',async()=>{
  const fileInput=app.q('[data-wallet-form=import] [name=backupFile]'),file=new app.w.File(['{"fixture":"unsaved-import"}'],'fixture-backup.json',{type:'application/json'});
  // JSDOM has no OS picker. Model its selected-file property and verify that
  // background refresh preserves the actual input node and file reference.
  Object.defineProperty(fileInput,'files',{configurable:true,value:[file]});
  app.w.dispatchEvent(new app.w.Event('focus'));app.w.document.dispatchEvent(new app.w.Event('visibilitychange'));for(let i=0;i<16;i++)await tick();
  assert.equal(app.q('[data-wallet-form=import] [name=backupFile]'),fileInput);assert.equal(fileInput.files.length,1);assert.equal(fileInput.files[0],file);
  assert.ok(!JSON.stringify(app.evidence()).includes('unsaved-import'));assert.equal((await app.wallets()).length,2);assert.equal(app.rpc.sends,0);
  delete fileInput.files;assert.equal(fileInput.files.length,0);
 });
 await check('all new payment drafts use the distinct receiver, including Arena evidence',async()=>{
  for(const route of ['checkout','service','proof','treasury','tokens','requests']){
   await app.go(route);assert.equal(app.q('input[name=recipient]').value,receiverB.walletPubkey,route);assert.notEqual(app.q('input[name=recipient]').value,await app.selectedPayer());
  }
  await app.go('batch');assert.equal(app.all('[data-payout-field=recipient]').length,2);assert.ok(app.all('[data-payout-field=recipient]').every(input=>input.value===receiverB.walletPubkey));
  await app.go('positions');await app.click('[data-form=position] button[type=submit]');await app.until(()=>app.q('[data-form=evidence] input[name=recipient]'));
  assert.equal(app.q('[data-form=evidence] input[name=recipient]').value,receiverB.walletPubkey);assert.equal(app.rpc.sends,0);
 });
 let receiverC;
 await check('Create a new receiver keeps the payer and updates automatic drafts',async()=>{
  await app.go('wallets');await app.click('[data-wallet-action=create-receiver]');await app.until(()=>app.all('.wallet-card').length===3&&!app.q('[data-wallet-action=create-receiver]').disabled);
  receiverC=(await app.wallets()).find(w=>![payerA.walletId,receiverB.walletId].includes(w.walletId));assert.ok(receiverC);assert.equal(app.receiver(),receiverC.walletPubkey);assert.equal(await app.selectedPayer(),payerA.walletPubkey);
  for(const route of ['checkout','service','proof','treasury','tokens','requests']){await app.go(route);assert.equal(app.q('input[name=recipient]').value,receiverC.walletPubkey,route);}
  await app.go('batch');assert.ok(app.all('[data-payout-field=recipient]').every(input=>input.value===receiverC.walletPubkey));
  await app.go('positions');assert.equal(app.q('[data-form=evidence] input[name=recipient]').value,receiverC.walletPubkey);assert.equal(app.rpc.sends,0);
 });
 await check('typed recipients survive draft receiver switches and explicit Use receiver replaces only that draft',async()=>{
  await app.go('batch');app.input('[data-payout-index="0"][data-payout-field=recipient]',receiverB.walletPubkey);
  await app.go('checkout');app.input('[data-form=payment] [name=recipient]',receiverB.walletPubkey);
  for(const wallet of [receiverB,receiverC]){
   app.input('[data-demo-receiver=checkout]',wallet.walletId,'change');await app.until(()=>app.receiver()===wallet.walletPubkey&&!app.q('[data-demo-receiver=checkout]').disabled);
  }
  assert.equal(app.q('[data-form=payment] [name=recipient]').value,receiverB.walletPubkey);
  await app.go('batch');assert.equal(app.q('[data-payout-index="0"][data-payout-field=recipient]').value,receiverB.walletPubkey);assert.equal(app.q('[data-payout-index="1"][data-payout-field=recipient]').value,receiverC.walletPubkey);
  await app.go('checkout');await app.click('[data-action=use-demo-receiver][data-id=checkout]');await app.until(()=>app.q('[data-form=payment] [name=recipient]').value===receiverC.walletPubkey);
  assert.equal(app.rpc.sends,0);
 });
 await check('Wallets forms set payer and receiver independently; mainnet view does not change devnet roles',async()=>{
  await app.go('wallets');app.input('[data-wallet-form=payer] [name=walletId]',receiverB.walletId,'change');await app.submit('[data-wallet-form=payer]');assert.equal(await app.selectedPayer(),receiverB.walletPubkey);assert.equal(app.receiver(),receiverC.walletPubkey);
  app.input('[data-wallet-form=receiver] [name=walletId]',payerA.walletId,'change');await app.submit('[data-wallet-form=receiver]');assert.equal(app.receiver(),payerA.walletPubkey);assert.equal(await app.selectedPayer(),receiverB.walletPubkey);
  const savedRoles=app.w.localStorage.getItem(app.rolesKey());await app.click('[data-wallet-action=network][data-wallet-id="mainnet-beta"]');
  assert.equal(app.q('#demo-wallet-roles'),null);assert.match(app.q('main').textContent,/Mainnet sending is not enabled/);assert.equal(await app.selectedPayer(),receiverB.walletPubkey);assert.equal(app.w.localStorage.getItem(app.rolesKey()),savedRoles);assert.equal(app.all('.wallet-card').length,0);
  await app.click('[data-wallet-action=network][data-wallet-id=devnet]');assert.equal(app.all('.wallet-card').length,3);
  app.input('[data-wallet-form=receiver] [name=walletId]',receiverC.walletId,'change');await app.submit('[data-wallet-form=receiver]');
  app.input('[data-wallet-form=payer] [name=walletId]',payerA.walletId,'change');await app.submit('[data-wallet-form=payer]');assert.equal(await app.selectedPayer(),payerA.walletPubkey);assert.equal(app.receiver(),receiverC.walletPubkey);assert.equal(app.rpc.sends,0);
 });
 await check('an older receiver form cannot replace a newer choice from another workspace context',async()=>{
  await app.go('wallets');const held=app.pauseLatchCall('status');
  try{
   app.input('[data-wallet-form=receiver] [name=walletId]',receiverB.walletId,'change');await app.click('[data-wallet-form=receiver] button[type=submit]');await pauseReached(held,'Receiver form wallet read');
   const external='1'.repeat(31)+'2';await app.setReceiverElsewhere({walletPubkey:external},held.original);const saved=app.w.localStorage.getItem(app.rolesKey());
   held.release();await app.until(()=>app.q('#content').getAttribute('aria-busy')==='false');
   assert.match(app.q('#toast').textContent,/receiver changed during setup/i);assert.equal(app.w.localStorage.getItem(app.rolesKey()),saved);
   assert.equal(app.receiver(),external);assert.equal(await app.selectedPayer(),payerA.walletPubkey);assert.equal(app.rpc.sends,0);
  }finally{held.release();held.restore();}
  app.input('[data-wallet-form=receiver] [name=walletId]',receiverC.walletId,'change');await app.submit('[data-wallet-form=receiver]');
 });
 for(const [route,form] of [['checkout','payment'],['service','workflow'],['positions','evidence']])await check(route+' refuses to record when the payer changes during the receiver funding read',async()=>{
  await app.go(route);if(route!=='checkout')app.input('[data-form='+form+'] [name=recipient]',receiverC.walletPubkey);
  const before=app.evidence(),amount=app.q('[data-form='+form+'] [name=amount]').value,reads=app.reads.length,held=app.pauseBalance(receiverC.walletPubkey);
  try{
   await app.click('[data-form='+form+'] button[type=submit]');await pauseReached(held,'Receiver funding read');
   await app.w.capp.solana.latch.walletSelect({network:'devnet',walletId:receiverC.walletId});held.release();
   await app.until(()=>app.q('#content').getAttribute('aria-busy')==='false');
   assert.match(app.q('#toast').textContent,/selected payer changed/i);assert.equal(await app.selectedPayer(),receiverC.walletPubkey);
   assert.deepEqual(app.evidence().state.payments,before.state.payments);
   assert.deepEqual(app.evidence().state.workflows,before.state.workflows);assert.deepEqual(app.evidence().state.positions,before.state.positions);
   assert.equal(app.q('[data-form='+form+'] [name=recipient]').value,route==='checkout'?'':receiverC.walletPubkey,'Clear a conflicting automatic receiver; preserve an entered address');
   assert.equal(app.q('[data-form='+form+'] [name=amount]').value,amount);assert.ok(!app.reads.slice(reads).some(r=>['getLatestBlockhash','sendTransaction'].includes(r.method)));assert.equal(app.rpc.sends,0);assert.equal(app.sideEffects.authorisations,0);
  }finally{held.release();}
  await app.go('wallets');app.input('[data-wallet-form=payer] [name=walletId]',payerA.walletId,'change');await app.submit('[data-wallet-form=payer]');
 });
 await check('a payer switch immediately before record creation cannot change the captured sender',async()=>{
  const main=app;app=await openApp(main.snapshot());let held;
  try{
   await app.go('checkout');app.input('[data-form=payment] [name=recipient]',receiverC.walletPubkey);
   // Bind payer, check payer after funding, then pause the record's own read.
   // This exercises the narrow window after the UI's final selection check.
   held=app.pauseLatchCall('status',3);await app.click('[data-form=payment] button[type=submit]');await pauseReached(held,'Record wallet read');
   assert.equal(app.evidence().state.payments.length,0);await held.original.walletSelect({network:'devnet',walletId:receiverC.walletId});held.release();
   await app.until(()=>app.q('#content').getAttribute('aria-busy')==='false');
   const payments=app.evidence().state.payments;assert.equal(payments.length,1);assert.equal(payments[0].walletPubkey,payerA.walletPubkey);assert.equal(payments[0].recipient,receiverC.walletPubkey);
   assert.notEqual(payments[0].walletPubkey,payments[0].recipient);assert.equal(await app.selectedPayer(),receiverC.walletPubkey);assert.equal(app.rpc.sends,0);
   assert.ok(!payments[0].operation?.signature,'A selection race cannot approve or sign');assert.equal(app.sideEffects.authorisations,0);
  }finally{held?.release();held?.restore();app.close();app=main;}
 });
 await check('a tiny first SOL credit shows receiver funding before saving or preparing work',async()=>{
  app.balances.set(receiverC.walletPubkey,0);await app.go('service');const before=app.evidence().state.workflows.length,reads=app.reads.length;
  await app.click('[data-form=workflow] button[type=submit]');await app.until(()=>app.q('.demo-recipient-choice .notice-card'));
  const notice=app.q('.demo-recipient-choice .notice-card');assert.match(notice.textContent,/Fund your devnet receiver/);assert.ok(notice.textContent.includes(receiverC.walletPubkey));assert.match(notice.textContent,/0.00089088/);
  assert.ok(notice.querySelector('a[href="https://faucet.solana.com/"]'));assert.equal(app.evidence().state.workflows.length,before);assert.equal(app.evidence().state.payments.length,0);assert.equal(app.rpc.sends,0);
  assert.ok(app.reads.slice(reads).some(r=>r.method==='getMinimumBalanceForRentExemption'));assert.ok(!app.reads.slice(reads).some(r=>['getLatestBlockhash','sendTransaction'].includes(r.method)));
  assert.equal(app.q('[data-form=workflow] [name=recipient]').value,receiverC.walletPubkey);
  app.balances.set(receiverC.walletPubkey,1000000000);await app.click('[data-form=workflow] button[type=submit]');await app.until(()=>app.evidence().state.workflows.length===before+1);
  assert.equal(app.rpc.sends,0);assert.equal(app.evidence().state.workflows.at(-1).items[0].recipient,receiverC.walletPubkey);
 });
 let paymentId,terminal;
 await check('changing roles leaves an active saved payment untouched and cannot send it',async()=>{
  await app.go('checkout');await app.click('[data-form=payment] button[type=submit]');await app.until(()=>app.q('[data-action=approve]')&&!app.q('[data-action=approve]').disabled);
  const payment=app.evidence().state.payments.find(p=>p.kind==='checkout');paymentId=payment.id;const saved=JSON.stringify(payment);
  assert.equal(payment.walletPubkey,payerA.walletPubkey);assert.equal(payment.recipient,receiverC.walletPubkey);
  await app.go('wallets');app.input('[data-wallet-form=receiver] [name=walletId]',receiverB.walletId,'change');await app.submit('[data-wallet-form=receiver]');
  app.input('[data-wallet-form=payer] [name=walletId]',receiverC.walletId,'change');await app.submit('[data-wallet-form=payer]');
  await app.go('checkout');assert.equal(JSON.stringify(app.evidence().state.payments.find(p=>p.id===paymentId)),saved);assert.equal(app.q('.demo-recipient-choice'),null);assert.match(app.q('main').textContent,/saved run uses a different wallet/);assert.equal(app.rpc.sends,0);
  await app.go('wallets');app.input('[data-wallet-form=payer] [name=walletId]',payerA.walletId,'change');await app.submit('[data-wallet-form=payer]');await app.go('checkout');
  await app.click('[data-action=approve]');await app.until(()=>app.q('[data-action=submit]')&&!app.q('[data-action=submit]').disabled);assert.equal(app.rpc.sends,0);
  await app.click('[data-action=submit]');await app.until(()=>app.q('[data-action=reconcile]')&&!app.q('[data-action=reconcile]').disabled);assert.equal(app.rpc.sends,1);
  await app.click('[data-action=reconcile]');await app.until(()=>app.q('[data-action=receipt]')&&!app.q('[data-action=receipt]').disabled);
  terminal=app.evidence().state.payments.find(p=>p.id===paymentId);assert.ok(terminal.operation.signature);assert.equal(terminal.recipient,receiverC.walletPubkey);assert.equal(terminal.operation.chainEvidence.wireVerified,true);
 });
 await check('role choices and the original receipt survive a fresh app without another broadcast',async()=>{
  await app.go('wallets');app.input('[data-wallet-form=payer] [name=walletId]',receiverC.walletId,'change');await app.submit('[data-wallet-form=payer]');const seed=app.snapshot();assert.equal(app.rpc.sends,1);app.close();app=await openApp(seed);
  await app.go('checkout');assert.deepEqual(app.evidence().state.payments.find(p=>p.id===paymentId),terminal);assert.equal(app.rpc.sends,0);assert.equal(app.q('[data-action=submit]'),null);
  await app.go('wallets');assert.equal(await app.selectedPayer(),receiverC.walletPubkey);assert.equal(app.receiver(),receiverB.walletPubkey);assert.equal((await app.wallets()).length,3);
 });
 await check('Lab evidence and role preferences contain no generated wallet keys',async()=>{
  const exported=JSON.stringify(app.evidence()),roles=app.w.localStorage.getItem(app.rolesKey());
  assert.doesNotMatch(exported,/"(?:privateKey|privateKeyBase58|secretKey|secret|ciphertext)"\s*:/);assert.doesNotMatch(roles,/"(?:privateKey|privateKeyBase58|secretKey|secret|ciphertext)"\s*:/);
  let inspectedKeys=0;
  for(const [key,value] of app.snapshot().filter(([key])=>key.startsWith('capp.solana-wallets.v1:'))){
   const stored=JSON.parse(value);if(stored.protocol!=='capp.solana-wallets.v1'||!Array.isArray(stored.wallets))continue;
   for(const wallet of stored.wallets)if(wallet.secret){assert.ok(!exported.includes(wallet.secret),'Device key must stay outside Lab evidence');assert.ok(!roles.includes(wallet.secret),'Device key must stay outside role preferences');inspectedKeys++;}
  }
  assert.equal(inspectedKeys,(await app.wallets()).length,'Inspect every generated device key without exposing it');assert.ok(inspectedKeys>=3);
 });
 console.log(JSON.stringify({passed,domControls:true,layoutVerified:false,nativeExecutionVerified:false,liveNetworkCalls:0,fundedTransfer:false}));
}finally{app?.close();}
