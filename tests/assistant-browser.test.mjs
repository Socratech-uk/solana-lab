// Real browser + Lab/Guide controllers. RPC, market and model outputs are
// fixtures; this test neither contacts devnet nor measures native inference.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {serve} from '../tools/serve.mjs';
import {fixture} from './devnet-fixture.mjs';
import {marketResponse} from './market-fixture.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CAPP_TEST_BROWSER_MODULES?path.join(process.env.CAPP_TEST_BROWSER_MODULES,'playwright'):'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CAPP_TEST_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const server=await serve({port:0}),origin='http://127.0.0.1:'+server.address().port,context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),rpc=fixture(),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
await context.route('**/*',async route=>{
 const r=route.request();if(r.url().startsWith(origin))return route.continue();
 if(r.method()==='POST'&&/rpcpool.com|api.devnet.solana.com/.test(r.url())){const response=await rpc.ctx.fetch('https://fixture.invalid/',{body:r.postData()});const json=JSON.parse(await response.text());if(JSON.parse(r.postData()).method==='getBalance')json.result.value=15000000000;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(json)});}
 if(r.url().startsWith('https://api.jup.ag/price/v3')){const response=await marketResponse();return route.fulfill({status:200,contentType:'application/json',body:await response.text()});}return route.abort();
});
let passed=0;const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
const go=async route=>{await page.evaluate(route=>{location.hash='/'+route;},route);await page.waitForFunction(route=>location.hash==='#/'+route,route);};
const click=async selector=>{await page.locator(selector+':visible').first().click();};
const perform=async()=>{const before=await page.evaluate(()=>window.__CAPP_FTUE__.tour.index);await click('[data-ftue-action=perform]');await page.waitForFunction(i=>window.__CAPP_FTUE__.tour.index!==i||window.__CAPP_FTUE__.tour.actionState==='failed',before);};
const start=async id=>page.evaluate(async id=>{const mod=await import('./src/guided.mjs');await mod.startLabWorkflow(id);},id);
try{
 await page.goto(origin+'/#/service');await page.waitForFunction(()=>window.solanaLab&&window.__CAPP_FTUE__?.status==='ready');
 let old,oldSender,newSender;
 await check('a completed old order remains bound to its original wallet after switching accounts',async()=>{
  await click('[data-action=wallet-connect]');await click('[data-action=self-recipient]');await click('[data-form=workflow] button[type=submit]');await click('[data-action=workflow-prepare]');await click('[data-action=approve]');await click('[data-action=submit]');await click('[data-action=reconcile]');await click('[data-action=service-deliver]');await page.waitForFunction(()=>document.querySelector('.delivery-panel h2')?.textContent==='Your report is ready');
  old=await page.evaluate(()=>window.solanaLab.exportEvidence().state.workflows[0]);oldSender=old.sender;
  newSender=await page.evaluate(async()=>{const latch=window.capp.solana.latch,w=await latch.walletCreate({network:'devnet',label:'Funded current wallet'});await latch.walletSelect({walletId:w.walletId});window.dispatchEvent(new Event('focus'));return w.walletPubkey;});
  await page.waitForFunction(()=>document.querySelector('#content').textContent.includes('This saved run uses a different wallet'));
  assert.notEqual(oldSender,newSender);assert.equal(await page.evaluate(()=>window.solanaLab.exportEvidence().state.workflows[0].sender),oldSender);await page.reload();await page.waitForFunction(()=>window.solanaLab&&window.__CAPP_FTUE__?.status==='ready');
 });
 await check('Guide fills a new draft using the current wallet while retaining prior history',async()=>{
  const sends=rpc.sends;await start('demo-service');await page.locator('[data-form=workflow]').waitFor();await perform();await perform();
  assert.equal(await page.evaluate(()=>window.__CAPP_FTUE__.tour.index),2);assert.equal(rpc.sends,sends);
  const records=await page.evaluate(()=>window.solanaLab.exportEvidence().state);assert.equal(records.workflows.length,2);assert.equal(records.workflows[1].sender,newSender);assert.deepEqual(records.workflows[0],old);assert.equal(rpc.sends,sends);
  await page.evaluate(()=>window.capp.guide.cancelWorkflow());
 });
 await check('Enter sends a greeting without a model and keeps Guide usable',async()=>{
  await click('#assistant-open');await page.locator('#assistant-message').fill('hello');await page.locator('#assistant-message').press('Enter');await page.getByText('Hi! I can walk you through a demo, explain this page, or help interpret a result. What would you like to try?',{exact:true}).waitFor();
  assert.equal(await page.locator('lab-assistant .message.user').count(),1);
 });
 await check('Shift+Enter and IME composition do not submit, and drafts survive tab changes and model refresh',async()=>{
  const input=page.locator('#assistant-message');await input.fill('first');await input.press('Shift+Enter');await input.press('End');await input.type('second');assert.equal(await input.inputValue(),'first\nsecond');
  await input.evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true})));assert.equal(await page.locator('lab-assistant .message.user').count(),1);
  await click('[data-assist-tab=help]');await page.locator('#assistant-search').fill('quorum');assert.ok(await page.locator('.assistant-article').count()>0);await click('[data-assist-tab=chat]');assert.equal(await input.inputValue(),'first\nsecond');
  await page.evaluate(()=>document.querySelector('lab-assistant').refresh());assert.equal(await input.inputValue(),'first\nsecond');
 });
 await check('all twelve pages offer their own Guide and the three new demos route by name without a model',async()=>{
  const defaults={service:'demo-service',batch:'demo-batch',proof:'demo-proof',checkout:'understand-checkout',treasury:'understand-treasury',positions:'plan-position',recovery:'understand-recovery',policy:'reset-policy-proposal',network:'prepare-public-rpc',tokens:'demo-token-payment',requests:'create-payment-request',activity:'inspect-wallet-activity'};
  const sends=rpc.sends;
  for(const [route,id] of Object.entries(defaults)){
   await page.evaluate(route=>location.hash='/'+route,route);await page.locator(`.nav-item.active[href="#/${route}"]`).waitFor();
   await page.locator('#assistant-message').fill('walk me through a demo');await page.locator('#assistant-message').press('Enter');
   await page.locator(`.message.assistant`).last().locator(`[data-assist-task="${id}"]`).waitFor();
  }
  await page.evaluate(()=>location.hash='/service');await page.locator('.nav-item.active[href="#/service"]').waitFor();
  for(const [prompt,id] of [['show me the token payment demo','demo-token-payment'],['show me the payment request demo','create-payment-request'],['show me the wallet activity demo','inspect-wallet-activity']]){
   await page.locator('#assistant-message').fill(prompt);await page.locator('#assistant-message').press('Enter');
   const reply=page.locator('.message.assistant').last();await reply.locator(`[data-assist-task="${id}"]`).waitFor();
   assert.equal(await reply.locator('[data-assist-new]').count(),id==='inspect-wallet-activity'?0:1);
  }
  assert.equal(rpc.sends,sends);assert.equal(await page.evaluate(()=>window.__CAPP_FTUE__.tour.active),false);
 });
 await check('model replies can be plain text, and cancelled late replies cannot enter a later turn',async()=>{
  await page.evaluate(()=>{window.modelRequests=[];window.capp.ai={local:{connect:()=>({status:async()=>({nativeReady:true,currentModelId:'Fixture local model',limits:{contextTokens:4096,jsonSchemaOutput:true}}),complete:async request=>{window.modelRequests.push(request);if(request.prompt.includes('slow question'))return new Promise(resolve=>{window.finishSlow=resolve;});return {output:'Your saved order keeps the wallet it was created with.'};},cancel:async()=>({cancelled:true})})}};});
  await page.evaluate(()=>document.querySelector('lab-assistant').refresh());await page.locator('#assistant-message').fill('Explain this saved order');await page.locator('#assistant-message').press('Enter');await page.getByText('Your saved order keeps the wallet it was created with.',{exact:true}).waitFor();assert.ok(await page.evaluate(()=>window.modelRequests.at(-1).responseSchema));
  await page.locator('#assistant-message').fill('slow question');await page.locator('#assistant-message').press('Enter');await page.waitForFunction(()=>typeof window.finishSlow==='function');await click('[data-assist=stop]');await page.locator('.message').filter({hasText:'Stopped. Completed reads'}).waitFor();await page.evaluate(()=>window.finishSlow({output:'LATE REPLY MUST NOT APPEAR'}));await page.waitForTimeout(100);assert.equal(await page.getByText('LATE REPLY MUST NOT APPEAR').count(),0);
 });
 await check('Assistant launches the actual Guide workflow without signing or replaying the saved transfer',async()=>{
  const sends=rpc.sends;await click('[data-assist-tab=demos]');await page.locator('#assistant-search').fill('excessive fee');await click('[data-assist-watch=try-excessive-fee]');await page.waitForFunction(()=>!window.__CAPP_FTUE__.tour.active&&window.solanaLab.exportEvidence().state.policy?.example==='fee',{},{timeout:12000});assert.match(await page.locator('.policy-verdict').textContent(),/Expected rejection/);assert.equal(rpc.sends,sends);
 });
 await check('the helper explains the actual policy decision and the panel fits desktop and mobile',async()=>{
  await click('#assistant-open');await click('[data-assist-tab=chat]');await click('[data-assist=page]');assert.match(await page.locator('.message.assistant').last().textContent(),/150000.*100,000|150,000.*100,000/);
  const shots=process.env.CAPP_TEST_SCREENSHOT_DIR;if(shots){await fs.mkdir(shots,{recursive:true});await page.screenshot({path:path.join(shots,'assistant-desktop.png')});}
  await page.setViewportSize({width:390,height:844});if(shots)await page.screenshot({path:path.join(shots,'assistant-mobile.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const send=await page.locator('.assistant-compose button[type=submit]').boundingBox();assert.ok(send.y+send.height<=844);
  if(shots)await page.screenshot({path:path.join(shots,'assistant-mobile.png')});
  await click('[data-assist-tab=demos]');if(shots)await page.screenshot({path:path.join(shots,'assistant-demos-mobile.png')});
 });
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,realNative:false,realNetwork:false,fixtureSends:rpc.sends}));
}catch(error){console.error('Visible errors',await page.locator('[data-ftue-action-status],#toast').allTextContents());console.error(errors);console.error(await page.evaluate(()=>({tour:window.__CAPP_FTUE__?.tour,lastError:window.__CAPP_FTUE__?.lastError})));throw error;}
finally{await browser.close();await new Promise(r=>server.close(r));}
