// Optional real-Chromium acceptance with mocked RPC. No network funds or real keys.
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {serve} from '../tools/serve.mjs';
import {fixture} from './devnet-fixture.mjs';
import {marketResponse} from './market-fixture.mjs';
const require=createRequire(import.meta.url);
const screenshotRoot=process.env.CAPP_TEST_SCREENSHOT_DIR||new URL('../docs/validation/wallets/',import.meta.url).pathname;
const screenshot=name=>path.join(screenshotRoot,name);
const {chromium}=require(process.env.CAPP_TEST_BROWSER_MODULES?path.join(process.env.CAPP_TEST_BROWSER_MODULES,'playwright'):'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CAPP_TEST_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
let server;try{server=await serve({port:0});}catch(error){await browser.close();throw error;}
const origin='http://127.0.0.1:'+server.address().port;
const context=await browser.newContext({viewport:{width:1440,height:1050}}),page=await context.newPage(),rpc=fixture();
const errors=[],dialogs=[];let passed=0;
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});
await context.route('**/*',async route=>{
  const request=route.request();if(request.url().startsWith(origin))return route.continue();
  if(request.method()==='POST'&&request.url().includes('rpcpool.com')){
    const response=await rpc.ctx.fetch('https://fixture.invalid/',{body:request.postData()});return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
  }
  if(request.url().startsWith('https://api.jup.ag/price/v3')){const r=marketResponse();return route.fulfill({status:200,contentType:'application/json',body:await r.text()});}
  await route.abort();
});
const form=kind=>page.locator(`[data-wallet-form="${kind}"]`);
const backupDownload=async()=>{
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-wallet-action=backup]').click()]);
  return JSON.parse(await fs.readFile(await download.path(),'utf8'));
};
const checkBackup=async backup=>{
  await form('check-backup').locator('[name=backupFile]').setInputFiles({name:'wallet-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await form('check-backup').locator('button[type=submit]').click();
};
try{
  await page.goto(origin+'/#/wallets');await page.locator('[data-wallet-form=create]').waitFor();
  await check('visible create form saves a devnet account and retains it through a real browser reload',async()=>{
    await form('create').locator('[name=label]').fill('Devnet demos');await form('create').locator('button[type=submit]').click();
    await page.locator('.wallet-card').waitFor();const address=await page.locator('.wallet-card .wallet-address').textContent();
    await page.reload();await page.locator('.wallet-card').waitFor();assert.equal(await page.locator('.wallet-card .wallet-address').textContent(),address);
    await page.locator('[data-wallet-action=balance]').click();await page.locator('.wallet-balance').waitFor();assert.match(await page.locator('.wallet-balance').textContent(),/1 Devnet SOL/);
    await page.locator('[data-wallet-action=receive]').click();await page.locator('.wallet-qr svg').waitFor();
    assert.match(await page.locator('.wallet-receive').textContent(),/Devnet · test assets only/);
    await fs.mkdir(screenshotRoot,{recursive:true});
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:screenshot('devnet-desktop.png'),fullPage:true});
  });
  await check('saved backup file checks use actual downloads and reject changed recovery material',async()=>{
    const backup=await backupDownload(),before=rpc.calls.length;
    await checkBackup(backup);await page.getByText('Saved file matches the downloaded backup.',{exact:false}).waitFor();
    const changed=structuredClone(backup);changed.wallet.secret='changed';await checkBackup(changed);
    await page.locator('.wallet-error').waitFor();assert.match(await page.locator('.wallet-error').textContent(),/does not match/);
    assert.doesNotMatch(await page.locator('.wallet-backup-check').textContent(),/Saved file matches the downloaded/);
    await checkBackup(backup);await page.getByText('Saved file matches the downloaded backup.',{exact:false}).waitFor();
    assert.equal(rpc.calls.length,before);
    const evidence=await page.evaluate(()=>JSON.stringify(window.solanaLab.exportEvidence()));assert.ok(!evidence.includes(backup.wallet.secret));
  });
  await check('mainnet warning is prominent, creation requires confirmation and password never enters Lab evidence',async()=>{
    await page.locator('[data-wallet-action=network][data-wallet-id=mainnet-beta]').click();
    assert.match(await page.locator('.wallet-danger').textContent(),/lose all your funds/);
    const f=form('create');await f.locator('[name=label]').fill('Mainnet experiment');await f.locator('[name=password]').fill('browser-test-password');await f.locator('[name=passwordAgain]').fill('browser-test-password');await f.locator('[name=acknowledgeMainnetLoss]').check();
    await f.locator('button[type=submit]').click();await page.locator('.wallet-card').waitFor();assert.ok(dialogs.some(d=>d.includes('ALL funds')));
    const data=await page.evaluate(()=>JSON.stringify(window.solanaLab.exportEvidence()));assert.ok(!data.includes('browser-test-password'));assert.ok(!data.includes('walletCreate'));
    assert.equal(await form('create').locator('[name=password]').inputValue(),'');
    await page.locator('[data-wallet-action=lock]').click();await form('unlock').waitFor();
    await page.locator('[data-wallet-action=receive]').click();await page.locator('.wallet-qr svg').waitFor();
    assert.match(await page.locator('.wallet-receive').textContent(),/Mainnet · real SOL/);
    await form('unlock').locator('[name=password]').fill('wrong-test-password');await form('unlock').locator('button[type=submit]').click();
    await page.locator('.wallet-error').waitFor();assert.match(await page.locator('.wallet-error').textContent(),/Incorrect password/);
    await form('unlock').locator('[name=password]').fill('browser-test-password');await form('unlock').locator('button[type=submit]').click();await form('unlock').waitFor({state:'detached'});
    assert.equal(await page.locator('#toast').isVisible(),false,'A corrected password must clear the previous error notice');
    await page.locator('[data-wallet-action=lock]').click();await form('unlock').waitFor();
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:screenshot('mainnet-desktop.png'),fullPage:true});
  });
  await check('mainnet backup downloads, checks, removes and restores through real browser controls',async()=>{
    const address=await page.locator('.wallet-card .wallet-address').textContent(),backup=await backupDownload();
    assert.ok(backup.wallet.encrypted);assert.equal(backup.wallet.secret,undefined);
    await checkBackup(backup);await page.getByText('Saved file matches the downloaded backup.',{exact:false}).waitFor();
    await page.getByText('Rename, export key or remove',{exact:true}).click();
    await form('remove').locator('[name=confirmAddress]').fill(address);await form('remove').locator('button[type=submit]').click();await page.locator('.wallet-card').waitFor({state:'detached'});
    const restore=form('import');await restore.locator('[name=label]').fill('Restored mainnet fixture');await restore.locator('[name=backupFile]').setInputFiles({name:'encrypted-wallet-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
    await restore.locator('[name=password]').fill('browser-test-password');await restore.locator('[name=acknowledgeMainnetLoss]').check();await restore.locator('button[type=submit]').click();await page.locator('.wallet-card').waitFor();
    assert.equal(await page.locator('.wallet-card .wallet-address').textContent(),address);
    await page.reload();await page.locator('[data-wallet-form=create]').waitFor();await page.locator('[data-wallet-action=network][data-wallet-id=mainnet-beta]').click();await form('unlock').waitFor();
    assert.equal(await page.locator('.wallet-card .wallet-address').textContent(),address);
    await page.locator('[data-wallet-action=receive]').click();
  });
  await check('mobile layout keeps the loss warning and wallet forms inside the viewport',async()=>{
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:screenshot('mainnet-mobile.png'),fullPage:true});
    await page.setViewportSize({width:1440,height:1050});
  });
  await check('mainnet management leaves checkout bound to the saved devnet wallet',async()=>{
    await page.locator('a.nav-item[href="#/checkout"]').click();
    const wallet=await page.evaluate(async()=> (await window.capp.solana.latch.status()).wallet);
    assert.equal(wallet.network,'devnet');assert.equal(wallet.connected,true);
    await page.locator('[data-disclosure=wallet-checkout] > summary').click();
    await page.locator('[data-action=self-recipient]').first().click();
    await page.locator('[data-form=payment] button[type=submit]').click();
    await page.locator('[data-action=approve]').click();await page.locator('[data-action=submit]').click();await page.locator('[data-action=reconcile]').click();
    await page.locator('[data-action=receipt]').waitFor();assert.equal(rpc.sends,1);
    assert.match(await page.locator('main').textContent(),/Confirmed devnet transaction/);
    assert.deepEqual(errors,[]);
  });
  await check('wallet history opens the existing operation without creating or submitting another payment',async()=>{
    const before=rpc.sends;await page.locator('a.nav-item[href="#/wallets"]').click();
    await page.locator('[data-wallet-action=network][data-wallet-id=devnet]').click();
    await page.locator('.wallet-history summary').click();await page.locator('[data-wallet-action=open-payment]').waitFor();
    assert.match(await page.locator('.wallet-history').textContent(),/Self-transfer/);assert.match(await page.locator('.wallet-history').textContent(),/Receipt matched/);
    await page.locator('[data-wallet-action=open-payment]').click();await page.locator('[data-action=receipt]').waitFor();assert.equal(rpc.sends,before);
  });
  await check('a corrupt wallet store removes stale account controls and retains the damaged bytes',async()=>{
    await page.locator('a.nav-item[href="#/wallets"]').click();await page.locator('.wallet-card').waitFor();
    const key=await page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('capp.solana-wallets.v1:')&&!k.endsWith(':attempts'));localStorage.setItem(key,'{broken-fixture');return key;});
    await page.locator('[data-wallet-action=refresh]').first().click();await page.getByRole('heading',{name:'Saved wallets need recovery'}).waitFor();
    assert.equal(await page.locator('.wallet-card').count(),0);assert.equal(await form('import').count(),0);
    assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),'{broken-fixture');assert.deepEqual(errors,[]);
  });
  console.log(JSON.stringify({passed,browser:browser.version(),network:'mocked',nativeAcceptance:false}));
}finally{await browser.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
