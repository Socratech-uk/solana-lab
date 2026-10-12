// Real Chromium, actual WalletManager and generated Sidecars, isolated page
// harness. This does not claim an installed native or complete Lab build.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url);
const screenshotRoot=process.env.CAPP_TEST_SCREENSHOT_DIR||fileURLToPath(new URL('../docs/validation/wallet-recovery/',import.meta.url));
const {chromium}=require(process.env.CAPP_TEST_BROWSER_MODULES?path.join(process.env.CAPP_TEST_BROWSER_MODULES,'playwright'):'playwright');
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/src/wallets.css"><title>Wallet recovery test harness</title></head><body><main style="padding:20px;max-width:1200px;margin:auto"></main><p id="notice" role="status"></p><script type="module">
import {WalletManager} from '/src/wallets.mjs';import {createSolanaClient} from '/src/solana-client.mjs';
const preview=new URLSearchParams(location.search).has('preview');
if(!preview){const {PROFILE}=await import('/src/catalog.mjs');window.__CAPP_EXECUTABLE_PLAN__=structuredClone(PROFILE);
for(const item of PROFILE.library.selected){const script=document.createElement('script');script.src='/runtime/'+item.id.replace('uk.capp.sidecar.solana-','')+'.js';await new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=reject;document.head.append(script);});}}
const client=createSolanaClient(()=>window.capp?.solana),main=document.querySelector('main');
const manager=new WalletManager({preview,call:client.call,onChange:render,notify:message=>document.querySelector('#notice').textContent=message,
download:async(name,data)=>{const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}});
function render(){main.innerHTML=manager.html();manager.bind(main);}
window.testWalletManager=manager;await manager.refresh();render();
</script></body></html>`;
const types={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  if(req.url==='/'||req.url.startsWith('/?')){res.setHeader('content-type','text/html');res.end(html);return;}
  try{const pathname=new URL(req.url,'http://localhost').pathname;if(!/^\/(?:src\/|runtime\/|assets\/|style\.css$)/.test(pathname))throw Error();const target=await fs.realpath(path.join(root,pathname));if(!target.startsWith(root))throw Error();const bytes=await fs.readFile(target);res.setHeader('content-type',types[path.extname(target)]||'application/octet-stream');res.end(bytes);}
  catch{res.statusCode=404;res.end('missing');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.CAPP_TEST_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const context=await browser.newContext({viewport:{width:1200,height:1000}}),page=await context.newPage(),origin='http://127.0.0.1:'+server.address().port;
const errors=[],dialogs=[];let passed=0;
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});
await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
const form=kind=>page.locator('[data-wallet-form="'+kind+'"]');
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
const download=async()=>{const [file]=await Promise.all([page.waitForEvent('download'),page.locator('[data-wallet-action=backup]').click()]);return JSON.parse(await fs.readFile(await file.path(),'utf8'));};
const corrupt=()=>page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('capp.solana-wallets.v1:')&&!k.includes(':damaged:')&&!k.endsWith(':attempts'));const raw='{damaged:'+localStorage.getItem(key);localStorage.setItem(key,raw);return {key,raw};});
const fillRecovery=async(backup,password)=>{
  const f=form('recover');await f.locator('[name=backupFile]').setInputFiles({name:'wallet-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await f.locator('[name=confirmAddress]').fill(backup.wallet.walletPubkey);await f.locator('[name=acknowledgeRecovery]').check();
  if(password){await f.locator('[name=password]').fill(password);await f.locator('[name=acknowledgeMainnetLoss]').check();}
  await f.locator('button[type=submit]').click();
};
try{
  await page.goto(origin);await form('create').waitFor();
  let devBackup,mainBackup,damage;
  await check('damaged storage exposes an explicit recovery form and hides stale wallet controls',async()=>{
    await form('create').locator('[name=label]').fill('Browser recovery');await form('create').locator('button[type=submit]').click();await page.locator('.wallet-card').waitFor();
    devBackup=await download();damage=await corrupt();await page.reload();await form('recover').waitFor();
    assert.equal(await form('create').count(),0);assert.equal(await form('import').count(),0);assert.equal(await page.locator('.wallet-card').count(),0);
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),damage.key),damage.raw);
  });
  await check('the real backup upload restores the same devnet address and retains damaged bytes across reload',async()=>{
    await fillRecovery(devBackup);await page.locator('.wallet-card').waitFor();
    assert.equal(await page.locator('.wallet-address').textContent(),devBackup.wallet.walletPubkey);
    assert.match(await page.locator('#notice').textContent(),/damaged store was retained/);
    assert.ok(await page.evaluate(raw=>Object.values(localStorage).includes(raw),damage.raw));
    await page.reload();await page.locator('.wallet-card').waitFor();assert.equal(await page.locator('.wallet-address').textContent(),devBackup.wallet.walletPubkey);
  });
  await check('wrong mainnet recovery password preserves the store and clears private form inputs',async()=>{
    await page.locator('[data-wallet-action=network][data-wallet-id=mainnet-beta]').click();
    await form('create').locator('[name=label]').fill('Encrypted browser recovery');await form('create').locator('[name=password]').fill('browser-recovery-password');await form('create').locator('[name=passwordAgain]').fill('browser-recovery-password');await form('create').locator('[name=acknowledgeMainnetLoss]').check();await form('create').locator('button[type=submit]').click();await page.locator('.wallet-card').waitFor();
    mainBackup=await download();damage=await corrupt();await page.locator('[data-wallet-action=refresh]').first().click();await form('recover').waitFor();
    await fillRecovery(mainBackup,'incorrect-recovery-password');await page.getByRole('alert').filter({hasText:/Incorrect password or damaged wallet backup/}).waitFor();
    assert.equal(await form('recover').locator('[name=password]').inputValue(),'');assert.equal(await form('recover').locator('[name=backupFile]').inputValue(),'');
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),damage.key),damage.raw);
    assert.equal(await page.evaluate(()=>JSON.stringify(window.testWalletManager).includes('incorrect-recovery-password')),false);
  });
  await check('mainnet recovery warning and confirmation stay usable on a narrow viewport',async()=>{
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.match(await page.locator('.wallet-danger').textContent(),/permanently lose ALL funds/);
    await fs.mkdir(screenshotRoot,{recursive:true});
    await page.screenshot({path:path.join(screenshotRoot,'mainnet-damaged.png'),fullPage:true});
    await fillRecovery(mainBackup,'browser-recovery-password');await form('unlock').waitFor();
    assert.equal(await page.locator('.wallet-address').textContent(),mainBackup.wallet.walletPubkey);assert.ok(dialogs.some(d=>d.includes('Only this wallet will be restored')));
    await page.reload();await form('create').waitFor();await page.locator('[data-wallet-action=network][data-wallet-id=mainnet-beta]').click();await form('unlock').waitFor();
    assert.ok(await page.evaluate(raw=>Object.values(localStorage).includes(raw),damage.raw));
  });
  await check('preview renders no recovery or wallet actions and no runtime is installed',async()=>{
    await page.goto(origin+'/?preview=1');await page.getByRole('heading',{name:'Available in the installed app'}).waitFor();
    assert.equal(await page.locator('[data-wallet-form]').count(),0);assert.equal(await page.evaluate(()=>!!window.capp?.solana),false);assert.deepEqual(errors,[]);
  });
  console.log(JSON.stringify({passed,browser:browser.version(),surface:'isolated WalletManager harness',externalNetworkUsed:false,nativeAcceptance:false}));
}finally{await browser.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
