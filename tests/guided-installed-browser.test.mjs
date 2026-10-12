// Installed shell/app-frame topology, real Guide and Lab scripts. Native
// engines and RPC are not used; this is browser bridge acceptance only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {serve} from '../tools/serve.mjs';
import {PROFILE} from '../src/catalog.mjs';
import {GUIDE_MANIFEST} from '../src/guided-content.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CAPP_TEST_BROWSER_MODULES?path.join(process.env.CAPP_TEST_BROWSER_MODULES,'playwright'):'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CAPP_TEST_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']}),server=await serve({port:0}),origin='http://127.0.0.1:'+server.address().port;
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],blocked=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
const plan=structuredClone(PROFILE);plan.app={id:'solana-lab',appId:'solana-lab',name:'Solana Lab'};
plan.library.selected.push({id:'uk.capp.sidecar.ftue',config:{mode:'user',manifestJson:JSON.stringify(GUIDE_MANIFEST),autoStart:false,guidedActions:true,controllerMode:'guided',autoPresentationMode:'step-through',autoStepDelayMs:300,allowRuntimeManifestRegistration:false}});
const encoded=JSON.stringify(plan).replaceAll('<','\\u003c'),scripts=PROFILE.library.selected.map(i=>`<script src="runtime/${i.id.replace('uk.capp.sidecar.solana-','')}.js"></script>`).join('');
await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==origin){blocked.push(url.href);return route.abort();}
 if(url.pathname==='/installed-owner.html')return route.fulfill({contentType:'text/html',body:`<!doctype html><style>body{margin:0}iframe{border:0;width:100vw;height:100vh}</style><script>window.__CAPP_EXECUTABLE_PLAN__=${encoded};window.__CAPP_SHELL_NATIVE_READY__={protocol:'capp.shell-native-ready.v1'};</script>${scripts}<iframe id="appFrame" src="installed-app.html"></iframe><script src="runtime/guide/ftue-shell.js"></script>`});
 if(url.pathname==='/installed-app.html'){let html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');html=html.replace('<script type="module"',`<script>window.__CAPP_EXECUTABLE_PLAN__=${encoded};</script><script src="runtime/guide/ftue-agent.js"></script><script type="module"`);return route.fulfill({contentType:'text/html',body:html});}
 return route.continue();});
try{
 await page.goto(origin+'/installed-owner.html');await page.waitForFunction(()=>window.__CAPP_FTUE__?.status==='ready');const frame=page.frames().find(f=>f.url().includes('installed-app.html'));
 await frame.waitForFunction(()=>window.capp?.guide?.listActions().length===20&&window.solanaLab);
 assert.equal(await page.locator('#cappFtueShellHost').count(),1);assert.equal(await frame.locator('#cappFtueShellHost').count(),0);
 await frame.evaluate(async()=>{const {startLabWorkflow}=await import('./src/guided.mjs');await startLabWorkflow('try-excessive-fee',{auto:true});});
 await page.waitForFunction(()=>!window.__CAPP_FTUE__.tour.active,{},{timeout:10000});assert.match(await frame.locator('.policy-verdict').textContent(),/blocked/);
 await frame.evaluate(async()=>{const {startLabWorkflow}=await import('./src/guided.mjs');await startLabWorkflow('understand-recovery',{auto:true});});
 await page.waitForFunction(()=>!window.__CAPP_FTUE__.tour.active,{},{timeout:15000});
 const record=await frame.evaluate(()=>window.solanaLab.exportEvidence().state.payments.at(-1));assert.equal(record.state,'finalised');assert.equal(record.scope,'recovery');assert.equal(record.operation.receipt.simulated,true);
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);console.log('PASS installed owner/app-frame Guide registration, single shell, real policy, isolated recovery and no network effects');
}catch(error){console.error('Owner',await page.evaluate(()=>({status:window.__CAPP_FTUE__?.status,tour:window.__CAPP_FTUE__?.tour,lastError:window.__CAPP_FTUE__?.lastError})));console.error('Frames',await Promise.all(page.frames().map(async f=>({url:f.url(),status:await f.locator('[data-ftue-action-status]').allTextContents(),toast:await f.locator('#toast').allTextContents()}))));console.error('Errors',errors,'blocked',blocked);throw error;}finally{await browser.close();await new Promise(r=>server.close(r));}
