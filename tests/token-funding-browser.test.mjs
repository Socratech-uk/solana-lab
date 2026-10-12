// Actual page controls with deterministic devnet RPC fixtures. Circle is stubbed;
// no faucet request, real wallet funding, signature or send occurs.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {serve} from '../tools/serve.mjs';
import {capabilityFixture,mint as otherMint} from './capability-fixture.mjs';
import {DEVNET_DEMO_MINT} from '../src/demo-token.mjs';
const CIRCLE_FAUCET='https://faucet.circle.com/';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CAPP_TEST_BROWSER_MODULES?path.join(process.env.CAPP_TEST_BROWSER_MODULES,'playwright'):'playwright');
const server=await serve({port:0}),origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.CAPP_TEST_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),rpc=capabilityFixture({mintAddress:DEVNET_DEMO_MINT}),errors=[],faucetRequests=[];
await context.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.copiedPayer=value;}}}));
page.on('pageerror',e=>errors.push(e.message));
await context.route('**/*',async route=>{
 const r=route.request();
 if(r.url().startsWith(origin))return route.continue();
 if(r.url()===CIRCLE_FAUCET){faucetRequests.push(r.method());return route.fulfill({contentType:'text/html',body:'<h1>Circle faucet handoff fixture</h1>'});}
 if(r.method()==='POST'&&/rpcpool.com|api.devnet.solana.com/.test(r.url())){const response=await rpc.fetch('https://fixture.invalid/',{body:r.postData()});return route.fulfill({contentType:'application/json',body:await response.text()});}
 return route.abort();
});
let passed=0,payer,receiver;const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
const go=async name=>{await page.evaluate(name=>location.hash='/'+name,name);await page.locator('.nav-item.active[href="#/'+name+'"]').waitFor();};
const state=()=>page.evaluate(()=>window.solanaLab.exportEvidence().state);
const shots=process.env.CAPP_TEST_SCREENSHOT_DIR;
const capture=async name=>{if(shots){await fs.mkdir(shots,{recursive:true});await page.screenshot({path:path.join(shots,name+'.png'),fullPage:true});}};
try{
 await page.goto(origin+'/#/wallets');await page.locator('[data-wallet-form=create]').waitFor();
 await check('Wallets presents USDC separately from SOL and copies the displayed selected payer',async()=>{
  assert.match(await page.locator('#wallet-test-funds').textContent(),/Create or select a devnet payer/);
  assert.equal(await page.locator('[data-wallet-action=copy-funding]').count(),0);
  await page.locator('[data-wallet-form=create] [name=label]').fill('Funding fixture payer');
  await page.locator('[data-wallet-form=create] button[type=submit]').click();await page.locator('.wallet-card').waitFor();
  payer=await page.locator('.wallet-card .wallet-address').textContent();rpc.state.sender=payer;
  assert.equal(await page.locator('#wallet-test-funds .wallet-address').textContent(),payer);
  await page.locator('[data-wallet-action=copy-funding]').click();await page.waitForFunction(p=>window.copiedPayer===p,payer);
  assert.match(await page.locator('#wallet-test-funds').textContent(),/20 test USDC every 2 hours/);
  await capture('usdc-wallets-desktop');
  await page.locator('[data-wallet-action=network][data-wallet-id=mainnet-beta]').click();
  assert.equal(await page.locator('#wallet-test-funds').count(),0);
  await page.locator('[data-wallet-action=network][data-wallet-id=devnet]').click();
  receiver=await page.evaluate(()=>window.capp.solana.latch.walletCreate({network:'devnet',label:'Fixture receiver',select:false}));
 });
 await check('USDC setup waits for an actual associated balance; returning and checking does not create a payment',async()=>{
  rpc.state.sourceMissing=true;await go('tokens');await page.locator('[data-action=demo-defaults]').click();await page.locator('#token-funding').waitFor();
  assert.equal(await page.locator('#token-funding .wallet-address').textContent(),payer);
  await page.locator('#token-funding [data-action=payment-setup]').click();await page.locator('[data-setup-check=tokens][data-state=blocked]').waitFor();
  assert.match(await page.locator('[data-setup-check=tokens]').textContent(),/No associated token account/);
  assert.equal((await state()).payments.length,0);assert.equal(rpc.sends,0);
  await capture('usdc-tokens-desktop');
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await capture('usdc-tokens-mobile');await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(async()=>(await import('./src/guided.mjs')).startLabWorkflow('demo-token-payment'));
  for(let step=0;step<4;step++){
   await page.waitForFunction(()=>window.__CAPP_FTUE__.tour.actionState==='idle');
   await page.locator('[data-ftue-action=perform]:visible').click();
   await page.waitForFunction(index=>{const t=window.__CAPP_FTUE__.tour;return t.index>index||t.actionState==='failed'||!!t.steps[t.index]?.continuation;},step);
  }
  const guided=await page.evaluate(()=>{const t=window.__CAPP_FTUE__.tour;return {index:t.index,target:t.steps[t.index].targetId,failed:t.actionState==='failed'};});
  assert.deepEqual(guided,{index:3,target:'token-setup',failed:false});
  assert.match(await page.locator('[data-ftue-body]').textContent(),/Send 20 USDC/);
  await page.locator('#token-funding a[href="'+CIRCLE_FAUCET+'"]').click({trial:true,timeout:5000});
  await capture('usdc-guide-desktop');
  await page.locator('[data-ftue-action=skip]:visible').click();
  rpc.state.sourceMissing=false;rpc.state.sourceBalance=20000000n;
  await page.locator('#token-funding [data-action=payment-setup]').click();await page.locator('[data-setup-check=tokens][data-state=pass]').waitFor();
  assert.equal((await state()).payments.length,0);assert.equal(rpc.sends,0);
 });
 await check('Circle opens its ordinary public page without an API request or attached wallet address',async()=>{
  const [popup]=await Promise.all([context.waitForEvent('page'),page.locator('#token-funding a[href="'+CIRCLE_FAUCET+'"]').click()]);
  await popup.waitForLoadState();assert.equal(popup.url(),CIRCLE_FAUCET);assert.deepEqual(faucetRequests,['GET']);await popup.close();
 });
 await check('a saved transfer still displays and copies its original payer after a wallet switch',async()=>{
  await page.locator('[data-form=mint] button[type=submit]').click();await page.getByText('Original SPL Token Program · 6 decimals').waitFor();
  await page.locator('[data-form-key=tokens][name=recipient]').fill(receiver.walletPubkey);
  await page.locator('[data-form=token] button[type=submit]').click();await page.locator('[data-action=approve]:enabled').waitFor();
  const before=(await state()).payments[0];assert.equal(before.walletPubkey,payer);
  await page.evaluate(async id=>{await window.capp.solana.latch.walletSelect({network:'devnet',walletId:id});window.dispatchEvent(new Event('focus'));},receiver.walletId);
  await page.getByText('This saved payment uses a different sender.',{exact:true}).waitFor();
  assert.equal(await page.locator('#token-funding .wallet-address').textContent(),payer);
  await page.locator('#token-funding [data-action=token-payer-copy]').click();await page.waitForFunction(p=>window.copiedPayer===p,payer);
  const after=(await state()).payments;assert.equal(after.length,1);assert.equal(after[0].id,before.id);assert.equal(after[0].walletPubkey,payer);assert.equal(rpc.sends,0);
 });
 await check('custom token drafts do not offer Circle as their funding source and invalid addresses cannot be copied',async()=>{
  await page.locator('[data-action=new-payment][data-id=tokens]').click();
  await page.locator('[data-form-key=tokens][name=mint]').fill(otherMint);
  await page.locator('[data-action=demo-defaults]').click();
  assert.equal(await page.locator('#token-funding').count(),0);assert.equal(await page.locator('#tokens-setup').count(),1);
  const invalid=await page.evaluate(async()=>{const {copyFundingPayer}=await import('./src/token-funding.mjs');let writes=0;try{await copyFundingPayer('bad-address',{writeText:()=>{writes++;}});}catch(error){return {error:error.message,writes};}});assert.match(invalid.error,/Invalid wallet address/);assert.equal(invalid.writes,0);
  assert.deepEqual(errors,[]);assert.equal(rpc.sends,0);
 });
 console.log(JSON.stringify({passed,browser:'Chromium',network:'intercepted-fixtures',native:false,realFaucetRequests:0,sends:rpc.sends}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
