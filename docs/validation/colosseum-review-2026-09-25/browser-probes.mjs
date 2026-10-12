import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {serve} from '../../../tools/serve.mjs';
import {capabilityFixture} from '../../../tests/capability-fixture.mjs';
import {marketResponse} from '../../../tests/market-fixture.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CAPP_TEST_BROWSER_MODULES+'/playwright');
const server=await serve({port:0}),origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.CAPP_TEST_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),rpc=capabilityFixture();
const errors=[],report={directLaunches:[],assistantRouting:[],newRunControls:[],mobileWidths:[],native:false,liveNetwork:false};
page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',d=>d.accept());
await context.route('**/*',async route=>{
 const request=route.request();
 if(request.url().startsWith(origin))return route.continue();
 if(request.method()==='POST'&&/rpcpool.com|api.devnet.solana.com/.test(request.url())){
  const response=await rpc.fetch('https://fixture.invalid/',{body:request.postData()});
  return route.fulfill({status:200,contentType:'application/json',body:await response.text()});
 }
 if(request.url().startsWith('https://api.jup.ag/price/v3')){
  const response=await marketResponse();return route.fulfill({status:200,contentType:'application/json',body:await response.text()});
 }
 return route.abort();
});
const ready=()=>page.waitForFunction(()=>window.solanaLab&&window.__CAPP_FTUE__?.status==='ready');
const go=async route=>{await page.evaluate(r=>location.hash='/'+r,route);await page.locator('.nav-item.active[href="#/'+route+'"]').waitFor();};
try{
 await page.goto(origin+'/#/service');await ready();
 const pairs={service:'demo-service',batch:'demo-batch',proof:'demo-proof',checkout:'understand-checkout',treasury:'understand-treasury',positions:'plan-position',recovery:'understand-recovery',policy:'reset-policy-proposal',network:'prepare-public-rpc',tokens:'demo-token-payment',requests:'create-payment-request',activity:'inspect-wallet-activity'};
 for(const [route,expected] of Object.entries(pairs)){
  await go(route);
  const width=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth}));
  report.mobileWidths.push({route,...width});
  assert.ok(width.document<=width.width,route+' overflow');
  await page.locator('.guided-entry button').click();
  await page.waitForFunction(id=>window.__CAPP_FTUE__.tour.active&&window.__CAPP_FTUE__.tour.workflowId===id,expected);
  const tour=await page.evaluate(()=>({route:location.hash,...window.__CAPP_FTUE__.tour}));
  assert.equal(tour.route,'#/'+route);assert.equal(tour.index,0);assert.equal(tour.executionMode,'guided');
  report.directLaunches.push({route,workflow:tour.workflowId,index:tour.index,mode:tour.executionMode});
  await page.evaluate(()=>window.capp.guide.cancelWorkflow());
 }
 const state=await page.evaluate(()=>window.solanaLab.exportEvidence().state);
 report.operationCounts=Object.fromEntries(['payments','positions','workflows','paymentRequests'].map(k=>[k,state[k].length]));
 assert.deepEqual(Object.values(report.operationCounts),[0,0,0,0]);
 report.sends=rpc.sends;assert.equal(rpc.sends,0);
 console.log('PASS all 12 direct Guide buttons: same page, expected workflow, no automatic operations, mobile width');
 for(const [route,prompt,expected] of [
  ['tokens','show me the token payment demo','demo-token-payment'],
  ['requests','show me the payment request demo','create-payment-request'],
  ['activity','show me the wallet activity demo','inspect-wallet-activity']
 ]){
  await go(route);await page.locator('#assistant-open').click();
  await page.evaluate(()=>{const a=document.querySelector('lab-assistant');a.messages=[];a.render();});
  await page.locator('#assistant-message').fill(prompt);await page.locator('#assistant-message').press('Enter');
  await page.waitForFunction(()=>{const a=document.querySelector('lab-assistant');return !a.running&&a.messages.some(m=>m.role==='assistant');});
  const actual=await page.evaluate(()=>document.querySelector('lab-assistant').messages.findLast(m=>m.role==='assistant')?.workflowId);
  report.assistantRouting.push({route,prompt,expected,actual,correct:actual===expected});
  assert.equal(actual,'understand-recovery');
  await page.locator('[data-assist=close]').click();
 }
 console.log('REPRODUCED Assistant routes all three new demo requests to lost-response recovery');
 await go('guided');await page.locator('#assistant-open').click();await page.locator('[data-assist-tab=demos]').click();
 for(const workflow of ['demo-token-payment','create-payment-request']){
  const catalogueButtons=await page.locator('[data-guide-new="'+workflow+'"]').count();
  const assistantButtons=await page.locator('[data-assist-new="'+workflow+'"]').count();
  report.newRunControls.push({workflow,catalogueButtons,assistantButtons});assert.equal(catalogueButtons,1);assert.equal(assistantButtons,0);
 }
 console.log('REPRODUCED token/request New run exists in the catalogue but is missing from Assistant cards');
 assert.deepEqual(errors,[]);report.pageErrors=errors;
 await fs.writeFile(new URL('./review-browser-evidence.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({directLaunches:12,misroutedAssistantRequests:3,missingNewRunButtons:2,pageErrors:errors.length,fixtureSends:rpc.sends}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
