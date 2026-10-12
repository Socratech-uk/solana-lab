// Rendered Guide and page controls against bounded RPC fixtures. No live funds.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {serve} from '../tools/serve.mjs';
import {capabilityFixture,mint} from './capability-fixture.mjs';
import {marketResponse} from './market-fixture.mjs';
const require=createRequire(import.meta.url),{chromium}=require(path.join(process.env.CAPP_TEST_BROWSER_MODULES||process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'));
const server=await serve({port:0}),origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.CAPP_TEST_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1180,height:820}}),rpc=capabilityFixture(),errors=[];
page.on('pageerror',error=>errors.push(error.message));page.on('dialog',d=>d.accept());
await page.route('**/*',async route=>{const r=route.request();if(r.url().startsWith(origin))return route.continue();if(r.method()==='POST'&&/rpcpool.com|api.devnet.solana.com/.test(r.url())){const response=await rpc.fetch('https://fixture.invalid/',{body:r.postData()});return route.fulfill({status:200,contentType:'application/json',body:await response.text()});}if(r.url().startsWith('https://api.jup.ag/price/v3')){const response=await marketResponse();return route.fulfill({status:200,contentType:'application/json',body:await response.text()});}return route.abort();});
const go=async name=>{await page.evaluate(name=>location.hash='/'+name,name);await page.locator('.nav-item.active[href="#/'+name+'"]').waitFor();};
const ready=()=>page.waitForFunction(()=>window.solanaLab&&window.__CAPP_FTUE__?.status==='ready');
const state=()=>page.evaluate(()=>window.solanaLab.exportEvidence().state);
const step=async()=>{const index=await page.evaluate(()=>window.__CAPP_FTUE__.tour.index);await page.locator('[data-ftue-action=perform]:visible').click();await page.waitForFunction(i=>window.__CAPP_FTUE__.tour.index!==i||window.__CAPP_FTUE__.tour.actionState==='failed',index);const error=await page.locator('[data-ftue-action-status]').textContent();assert.notEqual(await page.evaluate(()=>window.__CAPP_FTUE__.tour.actionState),'failed',error);};
const cancel=()=>page.evaluate(()=>window.capp.guide.cancelWorkflow());
const click=selector=>page.locator(selector+':visible').first().click();
const start=async route=>{await go(route);await click('[data-guide-start]');};
let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
try{
 await page.goto(origin+'/#/service');await ready();
 const wallet=await page.evaluate(async()=>{const w=await window.capp.solana.latch.walletCreate({network:'devnet',label:'Funded payer'});window.dispatchEvent(new Event('focus'));return w;});rpc.state.sender=wallet.walletPubkey;
 const receiver=await page.evaluate(async payer=>{const w=await window.capp.solana.latch.walletCreate({network:'devnet',label:'Demo receiver'});await window.capp.solana.latch.walletSelect({walletId:payer});window.dispatchEvent(new Event('focus'));return w;},wallet.walletId);
 for(const route of ['service','batch','proof','checkout','treasury'])await test('Guide fills blank '+route+' recipients and prepares without signing',async()=>{
  await start(route);await step();
  const inputs=page.locator(route==='batch'?'[data-payout-field=recipient]':'[data-form-key="'+route+'"][name=recipient]');
  for(const input of await inputs.all())assert.equal(await input.inputValue(),receiver.walletPubkey);
  // App handlers highlight their declared workspace, not the first input.
  const size=await page.evaluate(()=>({ring:document.querySelector('[data-ftue-focus-ring]').getBoundingClientRect().height,field:document.querySelector('#content input').getBoundingClientRect().height}));assert.ok(size.ring>size.field*2);
  await step();assert.equal(await page.evaluate(()=>window.__CAPP_FTUE__.tour.index),2);assert.equal(rpc.sends,0);await cancel();
 });
 await test('Self-transfer uses a newly selected wallet rather than the cached sender',async()=>{
  await go('service');await click('[data-action=workflow-new]');
  await page.evaluate(id=>window.capp.solana.latch.walletSelect({walletId:id}),receiver.walletId);
  await click('[data-action=self-recipient]');await page.waitForFunction(address=>document.querySelector('[data-form-key=service][name=recipient]')?.value===address,receiver.walletPubkey);
  await page.evaluate(id=>window.capp.solana.latch.walletSelect({walletId:id}),wallet.walletId);
 });
 await test('Token Guide fills a real observed mint and a separate saved receiver',async()=>{
  await start('tokens');await step();assert.equal(await page.locator('[data-form-key=tokens][name=mint]').inputValue(),mint);assert.equal(await page.locator('[data-form-key=tokens][name=recipient]').inputValue(),receiver.walletPubkey);
  await step();await page.getByText('Original SPL Token Program · 6 decimals',{exact:true}).waitFor();
  const dir=process.env.CAPP_TEST_SCREENSHOT_DIR;if(dir){await fs.mkdir(dir,{recursive:true});await page.locator('#token-transfer').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(dir,'guide-token-defaults.png')});}
  await cancel();assert.equal(rpc.sends,0);
 });
 await test('Request Guide keeps the funded payer and uses a separate saved receiver',async()=>{
  await start('requests');await step();assert.equal(await page.locator('[data-form-key=requests][name=recipient]').inputValue(),receiver.walletPubkey);await step();await step();await cancel();await page.locator('.payment-qr svg').waitFor();assert.equal(await page.locator('[data-action=request-pay]').isDisabled(),false);assert.equal(await page.evaluate(async()=>(await window.capp.solana.latch.status({})).wallet.walletPubkey),wallet.walletPubkey);assert.equal(rpc.sends,0);
 });
 await test('Wallet activity defaults to the current devnet wallet and blank history stays valid',async()=>{
  await start('activity');await click('[data-ftue-action=next]');await step();await cancel();assert.equal(await page.locator('[data-form-key=activity][name=address]').inputValue(),wallet.walletPubkey);assert.equal((await state()).addressActivity.address,wallet.walletPubkey);await page.getByText('No entries returned for this address by the configured endpoint.',{exact:true}).waitFor();
  await page.locator('[data-form-key=activity][name=address]').fill(receiver.walletPubkey);await click('[data-form=activity] button[type=submit]');await page.waitForFunction(address=>window.solanaLab.exportEvidence().state.addressActivity.address===address,receiver.walletPubkey);
 });
 await test('Manual policy examples select the actual fee and freshness failures',async()=>{
  await go('policy');await page.locator('[name=action]').selectOption('hold');await page.locator('[data-form-key=policy][name=amount]').fill('999');await click('[data-action=bad-policy]');assert.equal(await page.locator('[name=action]').inputValue(),'open');assert.equal(await page.locator('[data-form-key=policy][name=amount]').inputValue(),'0.01');assert.equal(await page.locator('[name=fee]').inputValue(),'150000');await click('[data-form=policy] button[type=submit]');await page.waitForFunction(()=>window.solanaLab.exportEvidence().state.policy?.result?.allowed===false);assert.deepEqual((await state()).policy.result.violations,['fee']);
  await click('[data-action=policy-example][data-id=stale]');await click('[data-form=policy] button[type=submit]');await page.waitForFunction(()=>window.solanaLab.exportEvidence().state.policy?.result?.violations.includes('freshness'));
  await click('[data-action=policy-example][data-id=normal]');await click('[data-form=policy] button[type=submit]');await page.waitForFunction(()=>window.solanaLab.exportEvidence().state.policy?.result?.allowed===true);
 });
 await test('All twelve demo pages remain usable at desktop and narrow widths',async()=>{
  for(const route of ['service','batch','proof','checkout','treasury','positions','recovery','policy','network','tokens','requests','activity']){await go(route);assert.ok(await page.locator('main h1').textContent());await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route+' overflow');await page.setViewportSize({width:1180,height:820});}
  assert.deepEqual(errors,[]);assert.equal(rpc.sends,0);
 });
 console.log(JSON.stringify({passed,native:false,network:'intercepted-fixtures',sends:rpc.sends}));
}catch(error){console.error('diagnostic',await page.locator('#toast').textContent(),await page.locator('[data-ftue-action-status]').textContent().catch(()=>''));throw error;}finally{await browser.close();await new Promise(r=>server.close(r));}
