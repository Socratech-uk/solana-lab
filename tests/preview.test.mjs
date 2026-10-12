// Exercise the built publication, including forced events and detected native
// APIs. Full browser/installed builds keep their separate existing tests.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {JSDOM,ResourceLoader} from 'jsdom';
import {buildPreview,PREVIEW_FILES} from '../tools/build-preview.mjs';
import {serve} from '../tools/serve.mjs';
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'solana-lab-preview-'));
let server,dom,passed=0;
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
try{
  const output=path.join(temporary,'site'),first=await buildPreview(output),manifest=first.manifest;
  await check('preview is deterministic and excludes runtime bundles and credentials',async()=>{
    assert.equal(manifest.routes.length,27);assert.ok(manifest.routes.includes('wallets'));
    assert.deepEqual(manifest,(await buildPreview(output)).manifest);
    assert.equal(Object.keys(manifest.files).length,PREVIEW_FILES.length+2);
    for(const file of ['runtime','sidecars','src/market-config.mjs','tools','.env'])await assert.rejects(fs.stat(path.join(output,file)),{code:'ENOENT'});
    const catalogue=await fs.readFile(path.join(output,'src/catalog.mjs'),'utf8');
    assert.match(catalogue,/PROFILE=\{library:\{selected:\[\]\}\}/);
    assert.ok(!/jup_[a-f0-9]{32}|rpcpool\.com|clientToken"\s*:/.test(catalogue),'Provider configuration entered the public catalogue');
    await assert.rejects(buildPreview(path.resolve('src')),/separate folder/);
    await assert.rejects(buildPreview(path.resolve('..')),/contain the source/);
    const unrelated=path.join(temporary,'unrelated');await fs.mkdir(unrelated);await fs.writeFile(path.join(unrelated,'keep.txt'),'Keep');
    await assert.rejects(buildPreview(unrelated),/Refusing to replace/);
    assert.equal(await fs.readFile(path.join(unrelated,'keep.txt'),'utf8'),'Keep');
  });
  server=await serve({root:output,port:0});
  const origin=`http://127.0.0.1:${server.address().port}`;
  await check('every clean page and asset survives a direct HTTP request',async()=>{
    for(const route of manifest.routes){const r=await fetch(origin+'/solana-lab'+(route?'/'+route:''));assert.equal(r.status,200,route);assert.match(r.headers.get('content-type'),/html/);assert.match(await r.text(),/solana-lab-mode/);assert.match(r.headers.get('content-security-policy'),/connect-src 'none'/);}
    for(const file of Object.keys(manifest.files)){const r=await fetch(origin+'/solana-lab/'+file);assert.equal(r.status,200,file);if(/\.m?js$/.test(file))assert.match(r.headers.get('content-type'),/javascript/);}
    for(const file of ['runtime/edge.js','src/market-config.mjs','preview-manifest.json','missing','docs/missing','tools/build-preview.mjs'])assert.equal((await fetch(origin+'/solana-lab/'+file)).status,404,file);
    assert.equal((await fetch(origin+'/solana-lab',{method:'POST'})).status,405);
    const head=await fetch(origin+'/solana-lab/docs/sdk',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
    const alias=await fetch(origin+'/solana-lab/docs/sdk/?from=share',{redirect:'manual'});assert.equal(alias.status,308);assert.equal(alias.headers.get('location'),'/solana-lab/docs/sdk?from=share');
  });
  const bytes=new Map(await Promise.all(Object.keys(manifest.files).map(async f=>[f,await fs.readFile(path.join(output,f))])));
  const requests=[];
  class Assets extends ResourceLoader{fetch(url){const u=new URL(url);assert.equal(u.origin,origin);const file=u.pathname.replace('/solana-lab/','');assert.ok(bytes.has(file),file);requests.push(file);return Promise.resolve(bytes.get(file));}}
  dom=new JSDOM(bytes.get('index.html').toString(),{url:origin+'/solana-lab/docs/sdk',runScripts:'dangerously',resources:new Assets(),pretendToBeVisual:true});
  const w=dom.window;w.scrollTo=()=>{};w.structuredClone=structuredClone;
  let effects=0,storageReads=0,storageWrites=0;
  const forbidden=()=>{effects++;throw Error('Sidecar/network effect in preview');};
  w.fetch=forbidden;w.setInterval=forbidden;
  w.__CAPP_PACKAGED_RUNTIME__={};w.__CAPP_EXECUTABLE_PLAN__={appId:'solana-lab'};
  w.capp={solana:{edge:{status:forbidden}},ai:{local:{connect:forbidden,openStudio:forbidden}}};
  w.localStorage.setItem('capp.solana-lab.v1','private fixture');
  w.Storage.prototype.getItem=()=>{storageReads++;throw Error('Preview read saved work');};
  w.Storage.prototype.setItem=()=>{storageWrites++;throw Error('Preview wrote saved work');};
  const context=dom.getInternalVMContext(),modules=new Map();
  function moduleAt(file){if(modules.has(file))return modules.get(file);assert.ok(bytes.has(file),'Import omitted from preview: '+file);const module=new vm.SourceTextModule(bytes.get(file).toString(),{context,identifier:file,initializeImportMeta:meta=>meta.url=origin+'/solana-lab/'+file});modules.set(file,module);return module;}
  const entry=moduleAt('src/app.mjs');await entry.link((s,p)=>moduleAt(path.posix.normalize(path.posix.join(path.posix.dirname(p.identifier),s))));await entry.evaluate();
  const q=s=>w.document.querySelector(s),all=s=>[...w.document.querySelectorAll(s)],tick=()=>new Promise(r=>setTimeout(r,5));
  const go=async route=>{w.history.pushState(null,'','/solana-lab'+(route?'/'+route:''));w.dispatchEvent(new w.PopStateEvent('popstate'));await tick();};
  await check('all published pages render; native/runtime controls stay locked',async()=>{
    assert.match(q('.docs-article h2').textContent,/Portable Solana client API/);
    assert.equal(q('.docs-article a.button.primary').href,'https://c-app.uk/developer-docs/sdk/solana-client/');
    assert.equal(q('#runtime-mode').textContent,'Web preview');
    for(const route of manifest.routes){await go(route);assert.ok(q('main h1')?.textContent,route);assert.equal(all('.nav-item.active').length,1);assert.equal(q('.skip').getAttribute('href'),'/solana-lab'+(route?'/'+route:'')+'#content');for(const control of all('#content [data-action], #content form[data-form] input, #content form[data-form] select, #content form[data-form] textarea, #content form[data-form] button'))assert.equal(control.disabled,true,route);}
    assert.equal(w.document.querySelectorAll('iframe, script[src*="runtime/"]').length,0);
    assert.equal(w.solanaLab,undefined);assert.equal(effects,0);assert.equal(storageReads,0);assert.equal(storageWrites,0);
  });
  await check('forced forms, actions and runtime APIs cannot bypass preview locks',async()=>{
    await go('service');const form=q('[data-form=workflow]');form.querySelector('button').disabled=false;form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();
    await go('network');const button=q('[data-action=rpc-verify]');button.disabled=false;button.click();await tick();
    const runtime=modules.get('src/runtime.mjs').namespace;
    assert.equal(runtime.apiFor(w),null);assert.equal(runtime.localAiFor(w),null);
    await assert.rejects(runtime.connectRuntime(),{code:'LAB_PREVIEW_ONLY'});
    await assert.rejects(runtime.loadBrowserRuntime(),{code:'LAB_PREVIEW_ONLY'});
    await assert.rejects(runtime.createRehearsal('recovery'),{code:'LAB_PREVIEW_ONLY'});
    assert.throws(()=>runtime.directCall(w.capp.solana,'edge','status'),{code:'LAB_PREVIEW_ONLY'});
    assert.throws(()=>modules.get('src/market.mjs').namespace.connectMarket(),{code:'LAB_PREVIEW_ONLY'});
    await assert.rejects(modules.get('src/assistant.mjs').namespace.assistantTurn({connection:{complete:forbidden},prompt:'hello'}),{code:'LAB_PREVIEW_ONLY'});
    assert.equal(effects,0);assert.equal(storageReads,0);assert.equal(storageWrites,0);
  });
  await check('architecture, docs, Guide and path navigation stay interactive',async()=>{
    await go('');assert.equal(all('.demo-card').length,12);q('[data-map-flow=positions]').click();q('[data-map-node=arena]').click();assert.match(q('.sm-detail').textContent,/simulation/i);
    const landingGuide=q('.hero-actions a[href="https://c-app.uk/developer-docs/solana/"]');assert.ok(landingGuide);assert.equal(landingGuide.target,'_blank');assert.ok(landingGuide.relList.contains('noopener'));assert.ok(landingGuide.relList.contains('noreferrer'));
    await go('docs');assert.equal(w.location.pathname,'/solana-lab/docs');assert.match(q('main h1').textContent,/Build beyond the Lab/);
    await go('docs/sdk');assert.equal(w.location.pathname,'/solana-lab/docs/sdk');assert.match(q('.docs-article h2').textContent,/Portable Solana client API/);
    const guide=q('.docs-article a.button.primary');assert.equal(guide.href,'https://c-app.uk/developer-docs/sdk/solana-client/');assert.equal(guide.target,'_blank');assert.ok(guide.relList.contains('noopener'));assert.ok(guide.relList.contains('noreferrer'));assert.equal(q('.docs-article a[download]'),null);
    q('.docs-article a[href="/solana-lab/components"]').click();assert.equal(w.location.pathname,'/solana-lab/components');assert.match(q('main h1').textContent,/Clear responsibilities/);
    q('#assistant-open').click();await tick();assert.equal(q('[data-assist=model]').disabled,true);assert.equal(q('#assistant-message').disabled,true);q('[data-assist=guide]').click();await tick();assert.match(q('.assistant-browser-results').textContent,/payment|recovery|policy/i);q('[data-assist-tab=chat]').click();
    q('[data-assist=status]').click();await tick();assert.match(q('.assistant-messages').textContent,/requires installed app/);
    w.location.hash='/treasury';await tick();assert.equal(w.location.pathname,'/solana-lab/treasury');assert.equal(w.location.hash,'');
    assert.equal(effects,0);assert.equal(storageReads,0);assert.equal(storageWrites,0);
  });
}finally{dom?.window.close();if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});await fs.rm(temporary,{recursive:true,force:true});}
console.log(JSON.stringify({passed,networkEffects:0,persistentStorageEffects:0,previewOnly:true}));
