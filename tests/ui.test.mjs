// DOM integration, not a substitute for WebView2/Android layout acceptance.
// Run with: CAPP_TEST_NODE_MODULES=/path/to/node_modules node --experimental-vm-modules tests/ui.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import {marketResponse} from './market-fixture.mjs';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import {fixture} from './devnet-fixture.mjs';
const require=createRequire(import.meta.url);
const {JSDOM,ResourceLoader}=require(process.env.CAPP_TEST_NODE_MODULES?path.join(process.env.CAPP_TEST_NODE_MODULES,'jsdom'):'jsdom');
const root=new URL('../',import.meta.url),read=rel=>fs.readFileSync(new URL(rel,root),'utf8');
class LocalAssets extends ResourceLoader {
 fetch(url){
  const u=new URL(url);if(u.origin!=='https://lab.test')throw Error('No remote assets allowed');
  return Promise.resolve(Buffer.from(read(u.pathname.slice(1))));
 }
}
const dom=new JSDOM(read('index.html'),{url:'https://lab.test/',runScripts:'dangerously',resources:new LocalAssets(),pretendToBeVisual:true});
const w=dom.window;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.AbortController=AbortController;w.scrollTo=()=>{};w.confirm=()=>true;
Object.defineProperty(w,'crypto',{value:webcrypto});
const rpc=fixture();w.fetch=(url,options)=>String(url).startsWith('https://api.jup.ag/price/v3')?marketResponse():rpc.ctx.fetch('https://fixture.invalid/',options);w.structuredClone=structuredClone;w.isSecureContext=true;
const ctx=dom.getInternalVMContext(),cache=new Map();
function moduleAt(rel){if(cache.has(rel))return cache.get(rel);const m=new vm.SourceTextModule(read(rel),{context:ctx,identifier:rel,initializeImportMeta:meta=>meta.url='https://lab.test/'+rel});cache.set(rel,m);return m;}
const entry=moduleAt('src/app.mjs');await entry.link((specifier,parent)=>moduleAt(path.posix.normalize(path.posix.join(path.posix.dirname(parent.identifier),specifier))));await entry.evaluate();
const q=s=>w.document.querySelector(s),all=s=>[...w.document.querySelectorAll(s)];
const tick=()=>new Promise(r=>setTimeout(r,5));
async function until(fn,{timeoutMs=1500}={}){for(let i=0;i<Math.ceil(timeoutMs/5);i++){if(fn())return;await tick();}throw Error('UI condition timed out: '+q('#content').textContent.slice(-1200)+' BUSY '+q('#content').getAttribute('aria-busy')+' TOAST '+q('#toast').textContent);}
async function go(route){w.location.hash='/'+route;await tick();}
let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
await test('standalone browser bootstrap loads eleven runtimes and renders twelve recipes',async()=>{assert.equal(all('.demo-card').length,12);assert.equal(q('lab-assistant').hidden,true);assert.match(q('h1').textContent,/Make the whole/);assert.equal(q('#runtime-mode').textContent,'Devnet · browser Sidecars');assert.equal(Object.keys(w.capp.solana).length,11);});
await test('all screens render from navigation without an empty page',async()=>{for(const r of ['service','batch','proof','checkout','treasury','positions','recovery','policy','network','tokens','requests','activity','components','receipts','docs']){await go(r);assert.ok(q('main h1').textContent.length>4);assert.equal(all('.nav-item.active').length,1);if(!['components','receipts','docs'].includes(r)){assert.ok(q('.experience-brief'));assert.match(q('.experience-brief').textContent,/WHY IT MATTERS/);assert.match(q('.experience-brief').textContent,/WHAT YOU’LL SEE/);assert.equal(all('.recipe-outline li').length,3);}}await go('');});
await test('checkout form, explicit approval, submit and receipt operate from actual controls',async()=>{await go('checkout');q('[data-action=wallet-connect]').click();await until(()=>q('[data-action=self-recipient]'));q('[data-action=self-recipient]').click();await until(()=>q('[name=recipient]').value&&!q('[data-form=payment] button[type=submit]').disabled);q('[data-form=payment] button[type=submit]').click();await until(()=>q('[data-action=approve]')&&!q('[data-action=approve]').disabled);q('[data-action=approve]').click();await until(()=>q('[data-action=submit]')&&!q('[data-action=submit]').disabled);q('[data-action=submit]').click();await until(()=>q('[data-action=reconcile]')&&!q('[data-action=reconcile]').disabled);q('[data-action=reconcile]').click();await until(()=>q('[data-action=receipt]')&&!q('[data-action=receipt]').disabled);assert.match(q('main').textContent,/Confirmed devnet transaction/);});
await test('architecture explorer changes explanations without invoking any Sidecar',async()=>{
 await go('');const before=rpc.calls.length;
 q('[data-map-flow=positions]').click();assert.match(q('.sm-walk').textContent,/application composes/i);
 q('[data-map-node=arena]').click();assert.match(q('.sm-detail').textContent,/simulations/);
 q('[data-map-step="5"]').click();assert.match(q('.sm-detail h3').textContent,/Switchyard/);
 assert.equal(rpc.calls.length,before);assert.equal(q('capp-solana-map').querySelectorAll('[data-map-node]').length,12);
 await go('docs/sdk');assert.match(q('.docs-article h2').textContent,/Portable Solana client API/);
 const guide=q('.docs-article a.button.primary');assert.equal(guide.href,'https://c-app.uk/developer-docs/sdk/solana-client/');assert.equal(guide.target,'_blank');assert.ok(guide.relList.contains('noopener'));assert.ok(guide.relList.contains('noreferrer'));
 assert.equal(q('.docs-article a[download]'),null);assert.ok(q('.docs-article a[href="#/components"]'));assert.equal(rpc.calls.length,before,'Opening the docs handoff must not invoke a Sidecar');
});
await test('service UI gates delivery, produces a report and links a separate document operation',async()=>{
 await go('service');q('[data-action=self-recipient]').click();await until(()=>!q('[data-form=workflow] button').disabled);q('[data-form=workflow] button[type=submit]').click();await until(()=>q('[data-action=workflow-prepare]')&&!q('[data-action=workflow-prepare]').disabled);
 assert.equal(q('[data-action=service-deliver]').disabled,true);q('[data-action=workflow-prepare]').click();
 await until(()=>q('[data-action=approve]')&&!q('[data-action=approve]').disabled);q('[data-action=approve]').click();await until(()=>q('[data-action=submit]')&&!q('[data-action=submit]').disabled);q('[data-action=submit]').click();await until(()=>q('[data-action=reconcile]')&&!q('[data-action=reconcile]').disabled);q('[data-action=reconcile]').click();await until(()=>!q('[data-action=service-deliver]').disabled);q('[data-action=service-deliver]').click();await until(()=>q('[data-action=delivery-anchor]')&&!q('[data-action=delivery-anchor]').disabled);
 assert.match(q('.delivery-panel').textContent,/numericTotals/);const sent=rpc.sends;q('[data-action=delivery-anchor]').click();await until(()=>w.location.hash==='#/proof'&&q('[data-action=workflow-prepare]')&&!q('[data-action=workflow-prepare]').disabled);assert.equal(rpc.sends,sent);
 q('[data-action=proof-original]').click();q('[data-form=verify-proof] button[type=submit]').click();await until(()=>q('main').textContent.includes('Document digest matches'));assert.match(q('main').textContent,/not yet produced a bound receipt/);
});
await test('batch UI preserves independent child state when choosing an item',async()=>{
 await go('batch');q('[data-action=self-recipient]').click();await until(()=>!q('[data-form=workflow] button').disabled);q('[data-form=workflow] button[type=submit]').click();await until(()=>all('[data-action=workflow-item]').length===2&&!q('[data-action=workflow-item]').disabled);const items=all('[data-action=workflow-item]');items[1].click();assert.equal(all('[data-action=workflow-item]')[1].getAttribute('aria-pressed'),'true');assert.match(q('main').textContent,/not an atomic batch/);assert.equal(q('[data-action=approve]'),null);
 await go('checkout');
});
await test('new payment returns to an editable form',async()=>{q('[data-action=new-payment]').click();assert.ok(q('input[name=amount]'));assert.ok(q('input[name=recipient]'));});
await test('older treasury records stay exportable and cannot trap or mutate new devnet work',async()=>{
 const key=Object.keys(w.localStorage).find(k=>k.startsWith('capp.solana-lab.v1:')),state=JSON.parse(w.localStorage.getItem(key));
 const old={id:'old-treasury',kind:'treasury',scope:'main',state:'preparing',amountLamports:75000000,recipient:'11111111111111111111111111111111',createdAt:1};state.payments.push(old);w.localStorage.setItem(key,JSON.stringify(state));w.dispatchEvent(new w.StorageEvent('storage',{key}));
 await go('treasury');assert.ok(q('[data-form=payment]'),'new devnet draft opens by default');assert.equal(q('select[data-history]'),null);q('[data-action=history-open][data-id="treasury:old-treasury"]').click();assert.match(q('main').textContent,/Previous demo operation/);assert.equal(q('[data-action=review]'),null);assert.ok(q('[data-action=payment-export]'));q('[data-action=new-payment]').click();assert.ok(q('[data-form=payment]'));assert.deepEqual(JSON.parse(JSON.stringify(w.solanaLab.exportEvidence().state.payments.find(p=>p.id===old.id))),old);
});
await test('treasury control remains disabled until two distinct reviewers approve',async()=>{
 await go('treasury');q('[data-action=self-recipient]').click();await until(()=>q('[name=recipient]').value&&!q('[data-form=payment] button[type=submit]').disabled);
 const form=q('[data-form=payment]'),recipient=form.elements.namedItem('recipient').value,sends=rpc.sends;
 assert.equal(form.checkValidity(),true);assert.equal(q('#content').getAttribute('aria-busy'),'false');form.querySelector('button[type=submit]').click();
 // These controlled replies still pass through the selected 4-RPC/second
 // Conduit queue. Receiver funding adds two reads before Edge preflight, so
 // preparation can span successive one-second windows after earlier demos.
 // Keep short waits for UI changes and give this queued preparation 5 seconds.
 await until(()=>q('[data-action=member-ari]')&&!q('[data-action=member-ari]').disabled,{timeoutMs:5000});
 assert.equal(q('[data-action=approve]').disabled,true);q('[data-action=member-ari]').click();await until(()=>q('[data-action=member-bo]')&&!q('[data-action=member-bo]').disabled);
 assert.equal(q('[data-action=approve]').disabled,true);q('[data-action=member-bo]').click();await until(()=>q('[data-action=approve]')&&!q('[data-action=approve]').disabled);
 assert.equal(all('.member.approved').length,2);const payment=w.solanaLab.exportEvidence().state.payments.find(p=>p.kind==='treasury'&&p.network==='devnet');
 assert.equal(payment.recipient,recipient);assert.equal(payment.amountLamports,75000000);assert.equal(rpc.sends,sends,'Preparation and team reviews do not broadcast');
});
await test('policy playground displays the actual failed fee check',async()=>{await go('policy');q('[data-action=bad-policy]').click();q('[data-form=policy] button[type=submit]').click();await until(()=>q('.check.fail'));assert.ok(all('.check.fail').some(el=>el.textContent.includes('fee')));});
await test('position controls create, reduce, close and show bucket reuse',async()=>{await go('positions');await until(()=>!q('[data-form=position] button').disabled);q('[data-form=position] button').click();await until(()=>q('[data-action=position-reduce]')&&!q('[data-action=position-reduce]').disabled);q('[data-action=position-reduce]').click();await until(()=>q('[data-action=position-close]')&&!q('[data-action=position-close]').disabled);q('[data-action=position-close]').click();await until(()=>q('main').textContent.includes('BUCKET REUSABLE'));});
await test('Arena evidence controls retain a distinct reviewed devnet payment',async()=>{await go('positions');q('[data-action=self-recipient]').click();await until(()=>!q('[data-form=evidence] button').disabled);q('[data-form=evidence] button').click();await until(()=>q('[data-action=approve]')&&!q('[data-action=approve]').disabled);assert.match(q('main').textContent,/Scaled simulation evidence/);assert.match(q('main').textContent,/0.00001 devnet SOL/);const p=w.solanaLab.exportEvidence().state.payments.find(p=>p.kind==='evidence');assert.equal(p.evidence.simulated,true);assert.equal(p.network,'devnet');});
await test('Network window reads the payment Conduit and opens Sidecar-owned settings',async()=>{await go('network');assert.equal(q('[data-action=rpc-version]').disabled,false);assert.equal(q('[data-form=network]'),null);q('[data-action=rpc-verify]').click();await until(()=>q('.network-result'));assert.match(q('.network-result').textContent,/EtWTRAB/);q('[data-action=rpc-settings]').click();await until(()=>q('.capp-conduit-settings'));const root=q('.capp-conduit-settings').shadowRoot;assert.equal(root.querySelector('input[name=rpcUrl]').value,'https://alexpea-solanad-3383.devnet.rpcpool.com');root.querySelector('[data-close]').click();});
await test('optional assistant opens, searches real guidance, and escapes content',async()=>{q('#assistant-open').click();await until(()=>!q('lab-assistant').hidden);q('[data-assist=guide]').click();await until(()=>q('.assistant-browser-results'));assert.match(q('.assistant-browser-results').textContent,/approval|policy|recovery/i);q('[data-assist-tab=chat]').click();const a=q('lab-assistant');a.add('assistant','<img src=x onerror=alert(1)>');assert.equal(a.querySelector('img'),null);assert.equal(q('.assistant-compose button[type=submit]').disabled,false);q('[data-assist=close]').click();assert.ok(a.hidden);});
await test('receipts and evidence contain the UI-executed operations',async()=>{await go('receipts');assert.ok(q('main').textContent.includes('NETWORK LABELLED EVIDENCE'));const evidence=w.solanaLab.exportEvidence();assert.equal(evidence.state.positions[0].state,'closed');assert.equal(evidence.state.payments[0].operation.receipt.simulated,false);assert.equal(w.solanaLab.tools.length,11);});
await test('assistant detects the actual ai.local namespace and passes system instructions',async()=>{
 let request;
 w.capp.ai={local:{connect:()=>({status:async()=>({nativeReady:true,currentModelId:'fixture-model'}),complete:async value=>{request=value;return{output:JSON.stringify({answer:'This is a simulated receipt.'})};}})}};
 q('#assistant-open').click();await until(()=>!q('.assistant-compose button[type=submit]').disabled);
 q('#assistant-message').value='Explain this receipt';q('.assistant-compose button[type=submit]').click();
 await until(()=>all('.message').some(m=>m.textContent.includes('This is a simulated receipt.')));
 assert.match(request.system,/declared read tools/);assert.equal(request.isolated,true);
});

await test('saved-run cards are read-only, scoped and keep the inspector closed by default',async()=>{
 await go('checkout');const payment=w.solanaLab.exportEvidence().state.payments.find(p=>p.kind==='checkout'),before=rpc.calls.length;
 assert.equal(q('select[data-history]'),null);
 q('[data-action=history-open][data-id="checkout:'+payment.id+'"]').click();
 assert.equal(rpc.calls.length,before);assert.match(q('.payment-progress').textContent,/Receipt/);
 assert.equal(q('.how-it-works > .technical-details').open,false);
 const trace=q('.how-it-works').textContent;
 for(const p of w.solanaLab.exportEvidence().state.payments.filter(p=>p.kind!=='checkout'))assert.ok(!trace.includes(p.id),'other workflows must not leak into this run’s activity');
 q('.how-it-works > .technical-details').open=true;
 q('[data-action=history-open][data-id="checkout:'+payment.id+'"]').click();
 assert.equal(q('.how-it-works > .technical-details').open,true,'inspection stays open during a render');
});
await test('confirmation without bound evidence is not presented as a finished payment',async()=>{
 const {paymentPresentation,receiptReady}=cache.get('src/experience.mjs').namespace;
 const payment=structuredClone(w.solanaLab.exportEvidence().state.payments.find(p=>p.kind==='checkout'));
 assert.equal(receiptReady(payment),true);assert.equal(paymentPresentation(payment).tone,'success');
 delete payment.operation.chainEvidence;
 assert.equal(receiptReady(payment),false);assert.notEqual(paymentPresentation(payment).tone,'success');
 const signed=structuredClone(payment);signed.state='authorised';signed.operation.state='authorised';
 assert.match(paymentPresentation(signed).title,/ready to send/);assert.equal(paymentPresentation(signed).ready,false);
});
await test('a confirmed receipt with a local ledger warning never offers to submit again',async()=>{
 const key=Object.keys(w.localStorage).find(k=>k.startsWith('capp.solana-lab.v1:')),saved=w.localStorage.getItem(key),state=JSON.parse(saved);
 const p=state.payments.find(p=>p.kind==='checkout');p.operation.recoveryError={code:'EVIDENCE_REQUIRED',message:'A terminal outcome after submission requires evidenceDigest'};p.error=p.operation.recoveryError.message;
 try{
  w.localStorage.setItem(key,JSON.stringify(state));w.dispatchEvent(new w.StorageEvent('storage',{key}));await go('checkout');
  q('[data-action=history-open][data-id="checkout:'+p.id+'"]').click();
  assert.match(q('.pending-note').textContent,/Receipt available · local tracking needs attention/);
  assert.match(q('.outcome-card').textContent,/Confirmed devnet transaction/);
  assert.equal(q('[data-action=submit]'),null);assert.ok(q('[data-action=receipt]'));
 }finally{w.localStorage.setItem(key,saved);w.dispatchEvent(new w.StorageEvent('storage',{key}));}
});
await test('payout editor changes preserve inputs and do not create work or send a payment',async()=>{
 await go('batch');q('[data-action=workflow-new]').click();const before=w.solanaLab.exportEvidence().state.workflows.length,sends=rpc.sends;
 const name=q('[data-payout-index="0"][data-payout-field=label]');name.value='Design & research';name.dispatchEvent(new w.Event('input',{bubbles:true}));
 q('[data-action=payout-add]').click();assert.equal(all('.payout-draft').length,3);assert.equal(q('[data-payout-index="0"][data-payout-field=label]').value,'Design & research');
 q('[data-action=payout-remove][data-id="2"]').click();assert.equal(all('.payout-draft').length,2);
 q('[data-form=workflow] [data-action=self-recipient]').click();await until(()=>!q('[data-form=workflow] button[type=submit]').disabled);
 assert.equal(w.solanaLab.exportEvidence().state.workflows.length,before);assert.equal(rpc.sends,sends);
 assert.ok(all('[data-payout-field=recipient]').every(i=>i.value.length>30));
});
await test('history pagination retains all records and selecting one cannot replay a transaction',async()=>{
 const key=Object.keys(w.localStorage).find(k=>k.startsWith('capp.solana-lab.v1:')),saved=w.localStorage.getItem(key),state=JSON.parse(saved),original=state.payments.find(p=>p.kind==='checkout'),calls=rpc.calls.length;
 try{
  for(let n=0;n<8;n++)state.payments.push({...original,id:'history-fixture-'+n,createdAt:Date.now()+n});
  w.localStorage.setItem(key,JSON.stringify(state));w.dispatchEvent(new w.StorageEvent('storage',{key}));await go('checkout');
  assert.equal(all('.run-history .history-record').length,4);q('[data-action=history-page][data-id="checkout:1"]').click();assert.match(q('.history-pagination').textContent,/Page 2 of 3/);
  assert.equal(all('.run-history .history-record').length,4);q('[data-action=history-page][data-id="checkout:2"]').click();assert.equal(all('.run-history .history-record').length,1);assert.equal(rpc.calls.length,calls);
 }finally{w.localStorage.setItem(key,saved);w.dispatchEvent(new w.StorageEvent('storage',{key}));}
});
await test('the assistant can explain a specific page without invoking a model',async()=>{
 await go('proof');q('#assistant-open').click();await until(()=>q('[data-assist=page]'));const calls=rpc.calls.length;
 q('[data-assist=page]').click();await until(()=>all('.message.assistant').some(el=>el.textContent.includes('Check that a document has not changed')));
 const text=all('.message.assistant').at(-1).textContent;assert.match(text,/fingerprint/);assert.equal(rpc.calls.length,calls);q('[data-assist=close]').click();
});

await test('Wallets creates and selects another saved devnet account through its form',async()=>{
 await go('wallets');await until(()=>q('[data-wallet-form=create]'));
 const f=q('[data-wallet-form=create]');f.querySelector('[name=label]').value='Second devnet account';f.querySelector('button[type=submit]').click();
 await until(()=>all('.wallet-card').length===2&&!q('[data-wallet-action=refresh]').disabled);
 assert.equal((await w.capp.solana.latch.status()).wallet.temporary,false);
 assert.match(all('.wallet-card').at(-1).textContent,/Second devnet account/);
 q('[data-wallet-action=balance]').click();await until(()=>q('.wallet-balance'));assert.match(q('.wallet-balance').textContent,/Devnet SOL/);
});
await test('mainnet creation presents the loss warning, encrypts the key and leaves devnet selected',async()=>{
 const devnet=(await w.capp.solana.latch.status()).wallet.walletPubkey;
 q('[data-wallet-action=network][data-wallet-id=mainnet-beta]').click();
 assert.match(q('.wallet-danger').textContent,/lose all your funds/);assert.match(q('main').textContent,/Mainnet sending is not enabled/);
 const f=q('[data-wallet-form=create]');f.querySelector('[name=label]').value='Mainnet UI test';f.querySelector('[name=password]').value='ui-test-password-only';f.querySelector('[name=passwordAgain]').value='ui-test-password-only';f.querySelector('[name=acknowledgeMainnetLoss]').checked=true;f.querySelector('button[type=submit]').click();
 await until(()=>q('.wallet-card')&&!q('[data-wallet-action=lock]').disabled);
 const list=await w.capp.solana.latch.walletList(),row=list.wallets.find(r=>r.network==='mainnet-beta');assert.ok(row);assert.equal(row.protection,'password-aes-gcm');
 assert.equal((await w.capp.solana.latch.status()).wallet.walletPubkey,devnet);
 assert.equal(q('[data-wallet-form=create] [name=password]').value,'');
 assert.doesNotMatch(JSON.stringify(w.solanaLab.exportEvidence()),/ui-test-password-only|walletCreate|ciphertext/);
 for(const k of Object.keys(w.localStorage))assert.ok(!w.localStorage.getItem(k).includes('ui-test-password-only'));
});
await test('wrong password is explained, lock/unlock works and private APIs cannot enter Lab event logging',async()=>{
 q('[data-wallet-action=lock]').click();await until(()=>q('[data-wallet-form=unlock]')&&!q('[data-wallet-action=lock]').disabled);
 q('[data-wallet-form=unlock] [name=password]').value='wrong-test-password';q('[data-wallet-form=unlock] button').click();await until(()=>q('.wallet-error')&&!q('[data-wallet-action=lock]').disabled);assert.match(q('.wallet-error').textContent,/Incorrect password/);
 q('[data-wallet-form=unlock] [name=password]').value='ui-test-password-only';q('[data-wallet-form=unlock] button').click();await until(()=>!q('[data-wallet-form=unlock]')&&!q('[data-wallet-action=lock]').disabled);
 const {Lab}=cache.get('src/lab.mjs').namespace;let effects=0;
 const isolated=new Lab({call:()=>{effects++;},storage:{getItem:()=>null,setItem:()=>{}},key:'no-private-logging'});
 await assert.rejects(isolated.call('latch','walletImport',{privateKey:'NEVER_LOG_THIS'}),/direct wallet manager/);assert.equal(effects,0);assert.equal(isolated.state.events.length,0);
});

dom.window.close();console.log(JSON.stringify({passed,layoutVerified:false}));
