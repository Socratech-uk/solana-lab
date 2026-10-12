// Shipped Guide shell/agent and Lab controllers; every external RPC is intercepted.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {serve} from '../tools/serve.mjs';
import {capabilityFixture,mint,recipient,wire} from './capability-fixture.mjs';
import {marketResponse} from './market-fixture.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CAPP_TEST_BROWSER_MODULES?path.join(process.env.CAPP_TEST_BROWSER_MODULES,'playwright'):'playwright');
const server=await serve({port:0}),origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.CAPP_TEST_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const context=await browser.newContext({viewport:{width:1380,height:1000}}),page=await context.newPage(),rpc=capabilityFixture(),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
await context.route('**/*',async route=>{
 const r=route.request();
 if(r.url()===origin+'/src/catalog.mjs'){
  const source=await fs.readFile(new URL('../src/catalog.mjs',import.meta.url),'utf8');
  const limits=JSON.stringify([{mint,maxAmountAtomic:'18446744073709551615'}]);
  const append=`\nfor(const item of PROFILE.library.selected){if(/solana-(sentinel|latch)$/.test(item.id))item.config.tokenLimits=${JSON.stringify(limits)};if(item.id.endsWith('solana-sentinel')){item.config.allowedPrograms=${JSON.stringify([wire.SYSTEM,wire.MEMO,wire.TOKEN,wire.ASSOCIATED_TOKEN].join(','))};item.config.maxAccountRentLamports=3000000;}}\n`;
  return route.fulfill({status:200,contentType:'text/javascript',body:source+append});
 }
 if(r.url().startsWith(origin))return route.continue();
 if(r.method()==='POST'&&/rpcpool.com|api.devnet.solana.com/.test(r.url())){try{const response=await rpc.fetch('https://fixture.invalid/',{body:r.postData()});return route.fulfill({status:200,contentType:'application/json',body:await response.text()});}catch(error){if(rpc.state.lostReply&&JSON.parse(r.postData()).method==='sendTransaction')return route.abort('failed');throw error;}}
 if(r.url().startsWith('https://api.jup.ag/price/v3')){const response=await marketResponse();return route.fulfill({status:200,contentType:'application/json',body:await response.text()});}
 return route.abort();
});
const ready=()=>page.waitForFunction(()=>window.capp?.guide?.supports?.actionProgress&&window.solanaLab&&window.__CAPP_FTUE__?.status==='ready');
const tour=()=>page.evaluate(()=>JSON.parse(JSON.stringify(window.__CAPP_FTUE__.tour)));
const records=()=>page.evaluate(()=>window.solanaLab.exportEvidence().state);
const start=id=>page.evaluate(async id=>(await import('./src/guided.mjs')).startLabWorkflow(id),id);
const advance=async()=>{
 await page.waitForFunction(()=>!window.__CAPP_FTUE__.tour.active||!['resolving','running','complete'].includes(window.__CAPP_FTUE__.tour.actionState));
 const before=await tour(),step=before.steps[before.index],checkpoint=step?.continuation?.checkpoint||'';
 await page.locator(`[data-ftue-action=${step.action.type==='focus'?'next':'perform'}]:visible`).click();
 await page.waitForFunction(({index,checkpoint})=>{const t=window.__CAPP_FTUE__.tour;return !t.active||t.index!==index||t.actionState==='failed'||(t.steps[t.index]?.continuation?.checkpoint||'')!==checkpoint;},{index:before.index,checkpoint},{timeout:20000});
 const next=await tour();assert.notEqual(next.actionState,'failed',await page.locator('[data-ftue-action-status]').textContent());return next;
};
const finish=async()=>{for(let n=0;n<100&&(await tour()).active;n++)await advance();assert.equal((await tour()).active,false);};
const go=async route=>{await page.evaluate(route=>location.hash='/'+route,route);await page.locator('.nav-item.active[href="#/'+route+'"]').waitFor();};
const input=(key,name,value)=>page.locator(`[data-form-key="${key}"][name="${name}"]`).fill(value);
let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
try{
 await page.goto(origin+'/#/guided');await ready();
 rpc.state.sender=await page.evaluate(async()=>{const w=await window.capp.solana.latch.connect({});window.dispatchEvent(new Event('focus'));return w.walletPubkey;});
 await test('Auto stops at required confirmation; synthetic clicks and brokered calls cannot sign',async()=>{
  await page.evaluate(()=>window.capp.guide.startWorkflow('understand-checkout',{},'',{executionMode:'auto-all'}));
  await page.waitForFunction(()=>window.__CAPP_FTUE__.tour.index===2&&window.__CAPP_FTUE__.tour.actionState==='idle');
  await page.waitForTimeout(1800);assert.equal(rpc.sends,0);assert.equal((await records()).payments.at(-1).state,'preflighted');
  const broker=await page.evaluate(async()=>{try{await window.__CAPP_FTUE_AGENT__.command('brokered-app-action',{actionId:'solana-lab.transaction.step',operationId:'op_'+'a'.repeat(32),arguments:{kind:'checkout'}});return 'unexpected';}catch(e){return e.message;}});assert.match(broker,/requires a click/);
  await page.locator('[data-ftue-action=perform]').evaluate(el=>el.click());await page.waitForFunction(()=>window.__CAPP_FTUE__.tour.actionState==='failed');assert.equal((await records()).payments.at(-1).state,'preflighted');
  await advance();assert.match(await page.locator('[data-ftue-action=perform]').textContent(),/Sign reviewed/);assert.equal((await records()).payments.at(-1).state,'preflighted');
  await advance();assert.match(await page.locator('[data-ftue-action=perform]').textContent(),/Send signed/);assert.equal(rpc.sends,0);
  await finish();assert.equal(rpc.sends,1);
 });
 await test('treasury guides the two local reviewers and preserves their visible approvals',async()=>{
  const before=rpc.sends;await start('understand-treasury');await finish();assert.equal(rpc.sends,before+1);assert.equal((await records()).payments.find(p=>p.kind==='treasury').request.approvals.length,2);
 });
 await test('five-payout walkthrough follows each child and resumes after page reload',async()=>{
  await go('batch');for(let n=0;n<3;n++)await page.locator('[data-action=payout-add]').click();await start('demo-batch');await advance();await advance();await advance();
  assert.match(await page.locator('[data-ftue-title]').textContent(),/Payout 1 of 5/);assert.ok(await page.locator('.capp-ftue-tooltip').evaluate(el=>el.scrollWidth<=el.clientWidth));
  const shots=process.env.CAPP_TEST_SCREENSHOT_DIR;if(shots){await fs.mkdir(shots,{recursive:true});await page.screenshot({path:path.join(shots,'guide-payout-sign.png')});}
  const before=rpc.sends;await advance();await advance();await advance();assert.equal(rpc.sends,before+1);assert.match(await page.locator('[data-ftue-title]').textContent(),/Payout 2 of 5/);
  const ids=(await records()).workflows.find(w=>w.kind==='batch').items.map(i=>i.operationId);
  await page.reload();await ready();await start('demo-batch');await finish();assert.equal(rpc.sends,before+5);assert.deepEqual((await records()).workflows.find(w=>w.kind==='batch').items.map(i=>i.operationId),ids);
 });
 await test('service Guide completes delivery, navigates to its linked proof, pays and compares',async()=>{
  const before=rpc.sends;await start('demo-service');await finish();assert.equal(rpc.sends,before+2);const state=await records(),order=state.workflows.find(w=>w.kind==='service'),proof=state.workflows.find(w=>w.id===order.proofId);assert.equal(order.delivery.complete,true);assert.equal(proof.verification.matches,true);assert.equal(proof.verification.chainObserved,true);
 });
 await test('standalone document proof also completes through Guide',async()=>{const before=rpc.sends;await start('demo-proof');await finish();assert.equal(rpc.sends,before+1);});
 await test('token Guide waits for payer tokens, then drives approval and receipt after funding',async()=>{
  await go('tokens');await input('tokens','mint',mint);await input('tokens','recipient',recipient);const before=rpc.sends,payments=(await records()).payments.length;rpc.state.sourceMissing=true;
  await start('demo-token-payment');await advance();await advance();await advance();await advance();
  assert.match(await page.locator('[data-ftue-action=perform]').textContent(),/Check token setup again/);
  assert.match(await page.locator('[data-ftue-body]').textContent(),/No associated token account/);
  assert.equal((await records()).payments.length,payments);assert.equal(rpc.sends,before);
  const index=(await tour()).index;await advance();assert.equal((await tour()).index,index);assert.equal((await records()).payments.length,payments);
  rpc.state.sourceMissing=false;await finish();assert.equal(rpc.sends,before+1);assert.equal((await records()).payments.find(p=>p.kind==='token').operation.receipt.network,'devnet');
 });
 await test('request walkthrough returns from payer choice and independently verifies the payment',async()=>{
  await go('requests');await input('requests','recipient',recipient);const before=rpc.sends;await start('create-payment-request');await finish();assert.equal(rpc.sends,before+1);assert.equal((await records()).paymentRequests[0].verification.paid,true);
 });
 await test('Pay with Guide resumes a saved unpaid request and verifies its own signature',async()=>{
  await go('requests');await page.locator('[data-action=request-new]').click();await input('requests','recipient',recipient);await page.locator('[data-form=request] button[type=submit]').click();await page.locator('.payment-qr svg').waitFor();const before=rpc.sends;await page.locator('[data-guide-start=pay-payment-request]').click();await finish();assert.equal(rpc.sends,before+1);assert.equal((await records()).paymentRequests.at(-1).verification.paid,true);
 });
 await test('signed treasury expiry stays in Guide, refreshes, and requires new team and wallet approvals',async()=>{
  await page.evaluate(async()=>{const guide=await import('./src/guided.mjs');await guide.newLabGuidedRun('understand-treasury');});
  await start('understand-treasury');await advance();await advance();await advance();await advance();await advance();
  assert.match(await page.locator('[data-ftue-action=perform]').textContent(),/Sign reviewed/);await advance();
  const old=(await records()).payments.filter(p=>p.kind==='treasury').at(-1),before=rpc.sends;
  rpc.state.blockHeight=201;await advance();assert.match(await page.locator('[data-ftue-action=perform]').textContent(),/Refresh expired review/);
  await page.setViewportSize({width:960,height:850});await page.waitForTimeout(200);
  const card=await page.locator('.capp-ftue-tooltip').boundingBox();assert.ok(card.y+card.height<=850);
  const shots=process.env.CAPP_TEST_SCREENSHOT_DIR;if(shots)await page.screenshot({path:path.join(shots,'guide-expired-treasury.png')});
  rpc.state.blockHeight=100;await advance();assert.match(await page.locator('[data-ftue-action=perform]').textContent(),/Record ari/);assert.equal(rpc.sends,before);
  const fresh=(await records()).payments.filter(p=>p.kind==='treasury').at(-1);assert.notEqual(fresh.id,old.id);assert.equal(fresh.request.approvals.length,0);
  await finish();assert.equal(rpc.sends,before+1);
  await page.setViewportSize({width:1380,height:1000});
 });
 await test('Guide creates a missing receiver without selecting it or moving funds',async()=>{
  await page.evaluate(async()=>{const guide=await import('./src/guided.mjs');await guide.newLabGuidedRun('demo-token-payment');});
  await go('tokens');await input('tokens','recipient','');await start('demo-token-payment');await advance();await advance();await advance();
  assert.match(await page.locator('[data-ftue-action=perform]').textContent(),/Create receiver wallet/);
  const payer=rpc.state.sender,before=rpc.sends;await page.setViewportSize({width:390,height:700});await page.waitForTimeout(200);
  const shots=process.env.CAPP_TEST_SCREENSHOT_DIR;if(shots)await page.screenshot({path:path.join(shots,'guide-create-receiver-mobile.png')});
  await advance();const wallet=await page.evaluate(()=>window.capp.solana.latch.walletList({}));assert.equal(wallet.active.devnet.walletPubkey,payer);assert.equal(wallet.wallets.length,2);assert.equal(rpc.sends,before);
  rpc.state.recipient=await page.locator('[data-form-key=tokens][name=recipient]').inputValue();assert.notEqual(rpc.state.recipient,payer);
  // A blocked setup expands the already-positioned card; retry must remain reachable.
  await page.waitForFunction(()=>window.__CAPP_FTUE__.tour.actionState==='idle');await input('tokens','amount','bad');await advance();
  assert.match(await page.locator('[data-ftue-action=perform]').textContent(),/Check token setup again/);
  await page.waitForTimeout(150);const rect=await page.locator('.capp-ftue-tooltip').boundingBox(),button=await page.locator('[data-ftue-action=perform]').boundingBox();assert.ok(rect.y>=0&&rect.y+rect.height<=700);assert.ok(button.y+button.height<=700);
  if(shots)await page.screenshot({path:path.join(shots,'guide-error-mobile.png')});
  await input('tokens','amount','1');await finish();assert.equal(rpc.sends,before+1);await page.setViewportSize({width:1380,height:1000});
 });
 await test('lost reply stays on Check receipt and mobile checkpoint remains usable',async()=>{
  await page.evaluate(async()=>{const guide=await import('./src/guided.mjs');await guide.newLabGuidedRun('understand-checkout');});await start('understand-checkout');await advance();await advance();await advance();await advance();rpc.state.lostReply=true;const before=rpc.sends;await advance();assert.match(await page.locator('[data-ftue-action=perform]').textContent(),/Check this receipt/);assert.equal(rpc.sends,before+1);
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>{const e=document.querySelector('.capp-ftue-tooltip'),r=e.getBoundingClientRect();return e.scrollWidth<=e.clientWidth&&r.left>=0&&r.right<=innerWidth;});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const shots=process.env.CAPP_TEST_SCREENSHOT_DIR;if(shots)await page.screenshot({path:path.join(shots,'guide-pending-mobile.png')});await finish();rpc.state.lostReply=false;assert.equal(rpc.sends,before+1);
 });
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,native:false,realNetwork:false,sends:rpc.sends}));
}catch(e){console.error('Tour',JSON.stringify(await tour()));console.error('Page errors',errors);throw e;}
finally{await browser.close();await new Promise(r=>server.close(r));}
