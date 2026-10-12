// Rendered integration with intercepted RPC only. No real funds or native claims.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {serve} from '../tools/serve.mjs';
import {capabilityFixture,mint,recipient,wire} from './capability-fixture.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CAPP_TEST_BROWSER_MODULES?path.join(process.env.CAPP_TEST_BROWSER_MODULES,'playwright'):'playwright');
const server=await serve({port:0}),origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.CAPP_TEST_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),rpc=capabilityFixture(),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
await context.route('**/*',async route=>{
 const r=route.request();
 if(r.url()===origin+'/src/catalog.mjs'){
  // Explicit fixture mint permissions. Production defaults remain deny-all.
  const source=await fs.readFile(new URL('../src/catalog.mjs',import.meta.url),'utf8');
  const config=JSON.stringify([{mint,maxAmountAtomic:'18446744073709551615'}]);
  const append=`\nfor(const item of PROFILE.library.selected){if(/solana-(sentinel|latch)$/.test(item.id))item.config.tokenLimits=${JSON.stringify(config)};if(item.id.endsWith('solana-sentinel')){item.config.allowedPrograms=${JSON.stringify([wire.SYSTEM,wire.MEMO,wire.TOKEN,wire.ASSOCIATED_TOKEN].join(','))};item.config.maxAccountRentLamports=3000000;}}\n`;
  return route.fulfill({status:200,contentType:'text/javascript',body:source+append});
 }
 if(r.url().startsWith(origin))return route.continue();
 if(r.method()==='POST'&&/rpcpool.com|api.devnet.solana.com/.test(r.url())){const response=await rpc.fetch('https://fixture.invalid/',{body:r.postData()});return route.fulfill({status:200,contentType:'application/json',body:await response.text()});}
 return route.abort();
});
let passed=0;const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
const go=async name=>{await page.evaluate(name=>location.hash='/'+name,name);await page.locator('.nav-item.active[href="#/'+name+'"]').waitFor();};
const click=async selector=>page.locator(selector+':visible').first().click();
const input=async(key,name,value)=>page.locator(`[data-form-key="${key}"][name="${name}"]`).fill(value);
const ready=()=>page.waitForFunction(()=>window.solanaLab&&window.__CAPP_FTUE__?.status==='ready');
const state=()=>page.evaluate(()=>window.solanaLab.exportEvidence().state);
try{
 await page.goto(origin+'/#/tokens');await ready();
 rpc.state.sender=await page.evaluate(async()=>{const w=await window.capp.solana.latch.connect({});window.dispatchEvent(new Event('focus'));return w.walletPubkey;});
 await check('Check setup reports both permission owners and separates observed tokens from exact fee/rent checks',async()=>{
  await input('tokens','mint',mint);await input('tokens','amount','1');await input('tokens','recipient',recipient);
  await click('[data-action=payment-setup]');await page.locator('[data-setup-check=latch-mint][data-state=pass]').waitFor();
  assert.equal(await page.locator('[data-setup-check=sentinel-mint]').getAttribute('data-state'),'pass');
  assert.equal(await page.locator('[data-setup-check=tokens]').getAttribute('data-state'),'pass');
  assert.match(await page.locator('[data-setup-check=sol]').textContent(),/Prepare.*fee.*rent/);
  assert.equal((await state()).payments.length,0);assert.equal(rpc.sends,0);
 });
 await check('Manual preparation keeps an unfunded token draft editable without creating an operation',async()=>{
  rpc.state.sourceMissing=true;await click('[data-form=token] button[type=submit]');
  await page.locator('[data-setup-check=tokens][data-state=blocked]').waitFor();
  assert.match(await page.locator('[data-setup-check=tokens]').textContent(),/No associated token account/);
  assert.equal((await state()).payments.length,0);assert.equal(rpc.sends,0);
  assert.ok(await page.locator('[data-form=token]').isVisible());
  rpc.state.sourceMissing=false;
 });
 await check('Token desk renders real observations and preserves precision through actual payment controls',async()=>{
  await click('[data-action=assets-refresh]');await page.getByText('15 devnet SOL',{exact:true}).waitFor();
  await input('tokens','mint',mint);await click('[data-form=mint] button[type=submit]');await page.getByText('Original SPL Token Program · 6 decimals').waitFor();
  await input('tokens','recipient',recipient);await input('tokens','amount','9007199254.740993');await click('[data-form=token] button[type=submit]');await page.locator('[data-action=approve]:enabled').waitFor();
  assert.match(await page.locator('[data-setup-check=sol]').textContent(),/2039280/);
  assert.match(await page.locator('.payment-amount').textContent(),/9007199254\.740993/);await click('[data-action=approve]');await click('[data-action=submit]');await click('[data-action=reconcile]');await page.getByText('Confirmed devnet transaction',{exact:true}).waitFor();assert.equal(rpc.sends,1);
 });
 await check('Payment request QR, draft, separate payer and independent verification work through the rendered forms',async()=>{
  await go('requests');await input('requests','recipient',recipient);await input('requests','amount','0.001');await click('[data-form=request] button[type=submit]');await page.locator('.payment-qr svg').waitFor();
  const created=(await state()).paymentRequests[0];assert.match(created.terms.uri,/reference=/);assert.equal(rpc.sends,1);
  await click('[data-action=request-pay]');await click('[data-action=approve]');await click('[data-action=submit]');await click('[data-action=reconcile]');await page.getByText('Confirmed devnet transaction',{exact:true}).waitFor();assert.equal(rpc.sends,2);
  await click('[data-action=request-find]');const signature=(await state()).payments.find(p=>p.requestId===created.id).operation.signature;await click(`[data-action=request-candidate][data-id="${signature}"]`);
  rpc.state.noCredit=true;await click('[data-form=request-verify] button[type=submit]');await page.getByText('Payment not established',{exact:true}).waitFor();assert.equal((await state()).paymentRequests[0].verification,undefined);
  rpc.state.noCredit=false;await click('[data-form=request-verify] button[type=submit]');await page.getByText('Finalized payment verified',{exact:true}).waitFor();assert.equal((await state()).paymentRequests[0].verification.paid,true);assert.equal(rpc.sends,2);
  await page.reload();await ready();await page.getByText('Finalized payment verified',{exact:true}).waitFor();assert.equal((await state()).paymentRequests.length,1);
 });
 await check('Saved operation routing, wallet activity and snapshot tools use the correct networks',async()=>{
  await go('receipts');const token=(await state()).payments.find(p=>p.kind==='token');await click(`[data-action=open-record][data-id="${token.id}"]`);await page.locator('h1').filter({hasText:'Token desk'}).waitFor();assert.match(await page.locator('.payment-amount').textContent(),/9007199254\.740993/);
  await go('activity');await input('activity','address',recipient);await click('[data-form=activity] button[type=submit]');await page.getByText('Devnet address activity',{exact:true}).waitFor();assert.equal((await state()).addressActivity.entries.length,2);await click('[data-action=activity-transaction]');await page.getByText('Transaction observation · devnet',{exact:true}).waitFor();
  const calls=rpc.calls.length;const result=await page.evaluate(()=>window.solanaLab.call('lab.activity.read',{}));assert.equal(result.historyComplete,false);assert.equal(rpc.calls.length,calls);
 });
 await check('New Guide workflows and narrow layouts are usable without document overflow',async()=>{
  await go('guided');assert.equal(await page.locator('.guided-card').count(),26);
  for(const name of ['tokens','requests','activity']){
   await go(name);const shots=process.env.CAPP_TEST_SCREENSHOT_DIR;if(shots){await fs.mkdir(shots,{recursive:true});await page.screenshot({path:path.join(shots,name+'-desktop.png'),fullPage:true});}
   await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' overflow');
   if(shots)await page.screenshot({path:path.join(shots,name+'-mobile.png'),fullPage:true});await page.setViewportSize({width:1440,height:1000});
  }
  assert.deepEqual(errors,[]);
 });
 console.log(JSON.stringify({passed,native:false,network:'intercepted-fixtures',browser:'Chromium'}));
}catch(error){console.error('UI diagnostic',await page.locator('#toast').textContent(),JSON.stringify((await state()).paymentRequests.map(r=>({id:r.id,last:r.checks.at(-1)}))));throw error;}finally{await browser.close();await new Promise(r=>server.close(r));}
