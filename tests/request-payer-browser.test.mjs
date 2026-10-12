// Shipped Guide, real page clicks and signed local RPC fixtures. No live funds.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {serve} from '../tools/serve.mjs';
import {capabilityFixture} from './capability-fixture.mjs';
import {DEVNET_DEMO_MINT} from '../src/demo-token.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CAPP_TEST_BROWSER_MODULES?path.join(process.env.CAPP_TEST_BROWSER_MODULES,'playwright'):'playwright');
const server=await serve({port:0}),origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.CAPP_TEST_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const context=await browser.newContext({viewport:{width:1380,height:1000}}),page=await context.newPage(),rpc=capabilityFixture({mintAddress:DEVNET_DEMO_MINT}),errors=[];
page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));page.on('dialog',d=>d.accept());
await context.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.copiedPayer=value;}}}));
await context.route('**/*',async route=>{
 const r=route.request();if(r.url().startsWith(origin))return route.continue();
 if(r.method()==='POST'&&/rpcpool.com|api.devnet.solana.com/.test(r.url())){const response=await rpc.fetch('https://fixture.invalid/',{body:r.postData()});return route.fulfill({contentType:'application/json',body:await response.text()});}
 return route.abort();
});
const state=()=>page.evaluate(()=>window.solanaLab.exportEvidence().state);
const tour=()=>page.evaluate(()=>JSON.parse(JSON.stringify(window.__CAPP_FTUE__.tour)));
const ready=()=>page.waitForFunction(()=>window.__CAPP_FTUE__?.status==='ready'&&window.solanaLab);
const go=async route=>{await page.evaluate(route=>location.hash='/'+route,route);await page.locator('.nav-item.active[href="#/'+route+'"]').waitFor();};
const advance=async()=>{
 await page.waitForFunction(()=>!['resolving','running','complete'].includes(window.__CAPP_FTUE__.tour.actionState));
 const before=await tour(),step=before.steps[before.index],checkpoint=step?.continuation?.checkpoint||'';
 await page.locator(`[data-ftue-action=${step.action.type==='focus'?'next':'perform'}]:visible`).click();
 await page.waitForFunction(({index,checkpoint})=>{const t=window.__CAPP_FTUE__.tour;return !t.active||!['resolving','running','complete'].includes(t.actionState)&&(t.index!==index||t.actionState==='failed'||(t.steps[t.index]?.continuation?.checkpoint||'')!==checkpoint);},{index:before.index,checkpoint});
 const after=await tour();assert.notEqual(after.actionState,'failed',await page.locator('[data-ftue-action-status]').textContent().catch(()=>''));return after;
};
const finish=async()=>{for(let n=0;n<30&&(await tour()).active;n++)await advance();assert.equal((await tour()).active,false);};
const payerFocus=()=>page.waitForFunction(()=>{const target=document.querySelector('#request-payer-setup'),ring=document.querySelector('[data-ftue-focus-ring]');if(!target||!ring)return false;const t=target.getBoundingClientRect(),r=ring.getBoundingClientRect();return window.__CAPP_FTUE_AGENT__.resolve('request-payment-flow').element===target&&Math.abs(r.left-Math.max(4,t.left-5))<2&&Math.abs(r.top-Math.max(4,t.top-5))<2&&Math.abs(r.width-t.width-10)<2;});
const capture=async name=>{const dir=process.env.CAPP_TEST_SCREENSHOT_DIR;if(dir){await fs.mkdir(dir,{recursive:true});await page.screenshot({path:path.join(dir,name+'.png')});}};
let passed=0,payer,receiver,savedRequest,paymentId;const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
try{
 await page.goto(origin+'/#/wallets');await page.locator('[data-wallet-form=create]').waitFor();
 await page.locator('[data-wallet-form=create] [name=label]').fill('Funded payer');await page.locator('[data-wallet-form=create] button[type=submit]').click();await page.locator('.wallet-card').waitFor();await ready();
 payer=await page.evaluate(async()=>(await window.capp.solana.latch.walletList({})).active.devnet);rpc.state.sender=payer.walletPubkey;
 await test('new request Guide creates a separate receiver and completes the entire payment without leaving the page',async()=>{
  await go('requests');await page.locator('[data-guide-start=create-payment-request]').click();
  await advance();assert.equal(await page.locator('[data-form-key=requests][name=recipient]').inputValue(),'');
  await advance();assert.match(await page.locator('[data-ftue-action=perform]').textContent(),/Create request receiver/);
  await advance();const wallets=await page.evaluate(()=>window.capp.solana.latch.walletList({}));receiver=wallets.wallets.find(w=>w.walletPubkey!==payer.walletPubkey);assert.ok(receiver);assert.equal(wallets.active.devnet.walletPubkey,payer.walletPubkey);
  await finish();const records=await state();assert.equal(records.paymentRequests.length,1);assert.equal(records.paymentRequests[0].terms.recipient,receiver.walletPubkey);assert.equal(records.paymentRequests[0].verification.paid,true);assert.equal(records.payments[0].walletPubkey,payer.walletPubkey);assert.equal(rpc.sends,1);assert.match(page.url(),/#\/requests$/);
 });
 await test('saved request for the active wallet offers a usable payer selection inside the open Guide',async()=>{
  await page.locator('[data-action=request-new]').click();await page.locator('[data-form-key=requests][name=recipient]').fill(payer.walletPubkey);await page.locator('[data-form=request] button[type=submit]').click();await page.locator('.payment-qr svg').waitFor();savedRequest=(await state()).paymentRequests.at(-1);
  rpc.state.solBalances.set(receiver.walletPubkey,0);rpc.state.solBalances.set(payer.walletPubkey,0);
  await page.locator('[data-guide-start=pay-payment-request]').click();await advance();await advance();
  assert.match(await page.locator('[data-ftue-action=perform]').textContent(),/Use Demo request receiver as payer/);
  assert.equal(await page.locator('[data-payer-choice]').inputValue(),receiver.walletId);assert.match(page.url(),/#\/requests$/);
  await page.locator('[data-payer-choice]').click({trial:true});await payerFocus();await capture('request-choose-payer');
  await advance();assert.match(await page.locator('[data-ftue-action=perform]').textContent(),/Check payer funds again/);
  assert.equal(await page.evaluate(async()=>(await window.capp.solana.latch.status({})).wallet.walletPubkey),receiver.walletPubkey);
  assert.equal((await state()).paymentRequests.at(-1).paymentId,undefined);assert.equal(rpc.sends,1);
 });
 await test('funding controls stay usable under Guide, and funding resumes the exact saved request',async()=>{
  await page.locator('#request-payer-setup [data-action=request-payer-copy]').click();await page.waitForFunction(address=>window.copiedPayer===address,receiver.walletPubkey);
  await page.locator('#request-payer-setup a[href="https://faucet.solana.com/"]').click({trial:true});
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>{const e=document.querySelector('.capp-ftue-tooltip'),r=e.getBoundingClientRect();return e.scrollWidth<=e.clientWidth&&r.left>=0&&r.right<=innerWidth;});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await payerFocus();await capture('request-funding-mobile');
  await page.locator('#request-payer-setup [data-action=request-payer-copy]').click();
  await page.locator('#request-payer-setup a[href="https://faucet.solana.com/"]').click({trial:true});
  const before=(await tour()).index;await advance();assert.equal((await tour()).index,before);assert.equal(rpc.sends,1);
  rpc.state.solBalances.set(receiver.walletPubkey,1000000000);rpc.state.sender=receiver.walletPubkey;
  await advance();assert.notEqual((await tour()).index,before);await page.setViewportSize({width:1380,height:1000});
  await advance();assert.match(await page.locator('[data-ftue-action=perform]').textContent(),/Prepare this payment/);
  await advance();assert.match(await page.locator('[data-ftue-action=perform]').textContent(),/Sign reviewed transfer/);paymentId=(await state()).paymentRequests.at(-1).paymentId;
  assert.deepEqual((await state()).paymentRequests.at(-1).terms,savedRequest.terms);assert.equal(rpc.sends,1);
 });
 await test('a wallet switch at signing recovers the original payer without signing on the selection click',async()=>{
  await page.evaluate(async id=>{await window.capp.solana.latch.walletSelect({walletId:id});window.dispatchEvent(new Event('focus'));},payer.walletId);
  await advance();assert.match(await page.locator('[data-ftue-title]').textContent(),/Select the saved payer/);assert.equal(await page.locator('[data-payer-choice] option').count(),1);
  await advance();assert.match(await page.locator('[data-ftue-action=perform]').textContent(),/Sign reviewed transfer/);
  assert.equal((await state()).payments.find(p=>p.id===paymentId).state,'preflighted');assert.equal(rpc.sends,1);
  await page.locator('[data-ftue-action=skip]').click();await page.reload();await ready();
  await page.locator('[data-guide-start=pay-payment-request]').click();await finish();
  const row=(await state()).paymentRequests.at(-1);assert.equal(row.id,savedRequest.id);assert.equal(row.paymentId,paymentId);assert.equal(row.verification.paid,true);assert.deepEqual(row.terms,savedRequest.terms);assert.equal(rpc.sends,2);
  assert.deepEqual(errors,[]);
 });
 await test('the funded wallet stays sender when an old request points at it as receiver',async()=>{
  rpc.state.solBalances.set(payer.walletPubkey,15000000000);rpc.state.solBalances.set(receiver.walletPubkey,0);
  await page.locator('[data-action=request-new]').click();await page.locator('[data-form-key=requests][name=recipient]').fill(payer.walletPubkey);await page.locator('[data-form=request] button[type=submit]').click();await page.locator('.payment-qr svg').waitFor();
  const original=(await state()).paymentRequests.at(-1),before=(await state()).paymentRequests.length;
  await page.locator('[data-guide-start=pay-payment-request]').click();await advance();await advance();
  assert.match(await page.locator('[data-ftue-action=perform]').textContent(),/Create a new demo/);await capture('request-reuse-funded-wallet');
  await advance();assert.equal(await page.evaluate(async()=>(await capp.solana.latch.status({})).wallet.walletPubkey),payer.walletPubkey);
  const next=(await state()).paymentRequests.at(-1);assert.notEqual(next.id,original.id);assert.equal(next.terms.recipient,receiver.walletPubkey);assert.equal((await state()).paymentRequests.length,before+1);assert.deepEqual((await state()).paymentRequests.find(r=>r.id===original.id),original);
  rpc.state.sender=payer.walletPubkey;await finish();const paid=(await state()).paymentRequests.at(-1);assert.equal(paid.verification.paid,true);assert.equal((await state()).payments.find(p=>p.id===paid.paymentId).walletPubkey,payer.walletPubkey);assert.equal(rpc.sends,3);assert.deepEqual(errors,[]);
 });
 console.log(JSON.stringify({passed,native:false,network:'intercepted-fixtures',browser:'Chromium',fixtureSends:rpc.sends}));
}catch(error){console.error('Request Guide diagnostic',await page.locator('#toast').textContent().catch(()=>''),await page.locator('[data-ftue-body]').textContent().catch(()=>''));throw error;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
