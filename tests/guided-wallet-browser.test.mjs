// Fresh device storage, rendered mobile Guide and signed RPC fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {serve} from '../tools/serve.mjs';
import {capabilityFixture} from './capability-fixture.mjs';
import {DEVNET_DEMO_MINT} from '../src/demo-token.mjs';
import {marketResponse} from './market-fixture.mjs';
const require=createRequire(import.meta.url),{chromium}=require(path.join(process.env.CAPP_TEST_BROWSER_MODULES||process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'));
const server=await serve({port:0}),origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.CAPP_TEST_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:393,height:851},isMobile:true,hasTouch:true}),rpc=capabilityFixture({mintAddress:DEVNET_DEMO_MINT}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
await page.route('**/*',async route=>{const r=route.request();if(r.url().startsWith(origin))return route.continue();if(r.method()==='POST'){const response=await rpc.fetch('https://fixture.invalid/',{body:r.postData()});return route.fulfill({status:200,contentType:'application/json',body:await response.text()});}if(r.url().includes('api.jup.ag')){const response=await marketResponse();return route.fulfill({status:200,contentType:'application/json',body:await response.text()});}return route.abort();});
const click=async()=>{await page.waitForFunction(()=>__CAPP_FTUE__.tour.actionState==='idle');const before=await page.evaluate(()=>{const t=__CAPP_FTUE__.tour;return {index:t.index,checkpoint:t.steps[t.index]?.continuation?.checkpoint};});await page.locator('[data-ftue-action=perform]:visible').click();await page.waitForFunction(before=>{const t=__CAPP_FTUE__.tour;return t.actionState==='failed'||t.actionState==='idle'&&(t.index!==before.index||t.steps[t.index]?.continuation?.checkpoint!==before.checkpoint);},before);assert.notEqual(await page.evaluate(()=>__CAPP_FTUE__.tour.actionState),'failed',await page.locator('[data-ftue-action-status]').textContent());};
const index=()=>page.evaluate(()=>__CAPP_FTUE__.tour.index);
try{
 await page.goto(origin+'/#/tokens');await page.waitForFunction(()=>window.solanaLab&&window.__CAPP_FTUE__?.status==='ready');
 assert.equal(await page.evaluate(async()=>(await capp.solana.latch.walletList()).wallets.length),0);
 await page.locator('[data-guide-start=demo-token-payment]').click();await click();assert.equal(await index(),1);
 const payer=await page.evaluate(async()=>(await capp.solana.latch.status()).wallet.walletPubkey);rpc.state.sender=payer;rpc.state.solBalances.set(payer,0);rpc.state.sourceMissing=true;
 await click();assert.equal(await index(),2);await click();assert.equal(await index(),3);
 assert.equal(await page.evaluate(async()=>(await capp.solana.latch.walletList()).wallets.length),2);assert.equal(await page.evaluate(async()=>(await capp.solana.latch.status()).wallet.walletPubkey),payer);
 assert.equal(new URL(page.url()).hash,'#/tokens');assert.equal(rpc.sends,0);
 console.log('PASS mobile Guide creates payer and receiver on the page from empty storage');
 await click();assert.equal(await index(),3);assert.equal(await page.evaluate(()=>solanaLab.exportEvidence().state.payments.length),0);
 rpc.state.solBalances.set(payer,1000000000);await click();assert.equal(await index(),3);
 rpc.state.sourceMissing=false;await click();assert.equal(await index(),4);await click();assert.equal(await index(),5);
 assert.equal(rpc.sends,0);assert.equal(await page.evaluate(()=>solanaLab.exportEvidence().state.payments.length),1);
 console.log('PASS SOL and USDC funding checks resume the same Guide without creating or sending early payments');
 await click();assert.match(await page.locator('[data-ftue-action=perform]:visible').innerText(),/Sign reviewed transfer/);assert.equal(rpc.sends,0);
 if(process.env.CAPP_TEST_SCREENSHOT_DIR){await fs.mkdir(process.env.CAPP_TEST_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.CAPP_TEST_SCREENSHOT_DIR,'mobile-guide-wallet-ready.png')});}
 await click();assert.equal(rpc.sends,0);assert.match(await page.locator('[data-ftue-action=perform]:visible').innerText(),/Send/);
 await click();assert.equal(rpc.sends,1);await click();assert.equal(await index(),6);
 assert.deepEqual(errors,[]);console.log('PASS fresh mobile walkthrough keeps sign, send and receipt separate; one fixture transfer');
 console.log(JSON.stringify({passed:3,nativeDevice:false,realFunds:false}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
