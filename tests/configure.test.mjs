import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {DEMO_PROFILE as PROFILE} from '../src/catalog.mjs';
import {demoSettings,devnetSettings,configureProject} from '../tools/configure-capp.mjs';
const KEY='capp.sidecar-library.selections.v1';
const selected=Object.fromEntries(PROFILE.library.selected.map(item=>[item.id,structuredClone(item)]));
for(const name of ['compass','sentinel','latch','dispatch','witness'])selected['uk.capp.sidecar.solana-'+name].config.network='devnet';
selected['uk.capp.sidecar.local-ai']={id:'uk.capp.sidecar.local-ai',config:{model:'keep-my-model',gpuMemoryPercent:65}};
selected['uk.capp.sidecar.ftue']={id:'uk.capp.sidecar.ftue',config:{manifestJson:'preserve this authored release',releaseVersion:'1.0.0'}};
selected['uk.capp.sidecar.solana-sentinel'].config.maxLamports=67890;
const state={protocol:'capp.project-state.v1',projectId:'solana-lab',browserStorage:{[KEY]:JSON.stringify({protocol:KEY,apps:{'app:solana-lab':{selected},'app:another':{selected:{keep:true}}}}),other:'unchanged'},forms:{keep:true},compiled:{artifactRef:'keep-release'},compiledComponents:{main:{artifactRef:'keep-component-release'}},showroomProductDraft:{keep:true},savedAt:'preserve'};
const source=JSON.stringify(state,null,2)+'\n';
let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'solana-lab-settings-'));
try {
 await test('five network labels change; model, Guide, policy limits and unrelated project fields survive',async()=>{
  const result=demoSettings(state);assert.equal(result.changes.length,5);
  const expected=structuredClone(state),library=JSON.parse(expected.browserStorage[KEY]);
  for(const name of ['compass','sentinel','latch','dispatch','witness'])library.apps['app:solana-lab'].selected['uk.capp.sidecar.solana-'+name].config.network='demo';
  expected.browserStorage[KEY]=JSON.stringify(library);expected.updatedAt=result.state.updatedAt;
  assert.deepEqual(result.state,expected);assert.equal(JSON.stringify(state,null,2)+'\n',source);
 });
 await test('live/custom providers and missing selections fail without replacing their settings',async()=>{
  for(const invalid of ['external-adapter','missing']){
   const value=structuredClone(state),library=JSON.parse(value.browserStorage[KEY]);
   if(invalid==='missing')delete library.apps['app:solana-lab'].selected['uk.capp.sidecar.solana-latch'];
   else library.apps['app:solana-lab'].selected['uk.capp.sidecar.solana-latch'].config.providerMode=invalid;
   value.browserStorage[KEY]=JSON.stringify(library);const before=structuredClone(value);
   assert.throws(()=>demoSettings(value),/nothing changed/);assert.deepEqual(value,before);
  }
 });
 await test('devnet setup adopts the supplied demo endpoints and preserves chosen tokens and custom providers',async()=>{
  const value=structuredClone(state),library=JSON.parse(value.browserStorage[KEY]),item=library.apps['app:solana-lab'].selected['uk.capp.sidecar.solana-conduit'];
  item.config={providerMode:'direct-rpc',rpcUrl:'https://api.devnet.solana.com/',rpcToken:'client-value'};value.browserStorage[KEY]=JSON.stringify(library);
  let result=devnetSettings(value),applied=JSON.parse(result.state.browserStorage[KEY]).apps['app:solana-lab'].selected;
  assert.equal(applied[item.id].config.rpcUrl,'https://alexpea-solanad-3383.devnet.rpcpool.com');assert.equal(applied[item.id].config.rpcToken,'client-value');assert.equal(applied[item.id].config.readRpcUrl,'https://alexpea-solanam-9956.mainnet.rpcpool.com');assert.equal(applied[item.id].config.allowRuntimeRpcSettings,true);assert.equal(applied[item.id].config.allowMainnetWrites,false);
  assert.deepEqual(applied['uk.capp.sidecar.ftue'],selected['uk.capp.sidecar.ftue']);assert.deepEqual(applied['uk.capp.sidecar.local-ai'],selected['uk.capp.sidecar.local-ai']);assert.ok(!JSON.stringify(result.changes).includes('client-value'));
  item.config={...item.config,providerMode:'external-adapter',externalAdapterUrl:'https://service.example',rpcUrl:'https://chosen.example',readRpcUrl:'https://chosen-read.example',readRpcToken:'separate-value'};value.browserStorage[KEY]=JSON.stringify(library);
  result=devnetSettings(value);applied=JSON.parse(result.state.browserStorage[KEY]).apps['app:solana-lab'].selected;
  assert.equal(applied[item.id].config.providerMode,'external-adapter');assert.equal(applied[item.id].config.rpcUrl,'https://chosen.example');assert.equal(applied[item.id].config.readRpcToken,'separate-value');assert.equal(devnetSettings(result.state).changes.length,0);
 });
 await test('a second merge makes no changes',async()=>{const first=demoSettings(state);assert.equal(demoSettings(first.state).changes.length,0);});
 await fs.writeFile(path.join(temporary,'project.json'),JSON.stringify({projectId:'solana-lab'}));
 await fs.writeFile(path.join(temporary,'state.json'),source);
 await fs.mkdir(path.join(temporary,'FTUE'));await fs.writeFile(path.join(temporary,'FTUE','draft.json'),'preserved');
 await test('check mode writes no files',async()=>{
  const result=await configureProject(temporary,{check:true});assert.equal(result.written,false);assert.ok(result.changes.length>=5);
  assert.equal(await fs.readFile(path.join(temporary,'state.json'),'utf8'),source);
  assert.deepEqual((await fs.readdir(temporary)).sort(),['FTUE','project.json','state.json']);
 });
 await test('on-disk update keeps an exact original backup and preserves the Guide files',async()=>{
  const result=await configureProject(temporary);assert.equal(result.written,true);
  assert.equal(await fs.readFile(result.backup,'utf8'),source);
  const after=JSON.parse(await fs.readFile(path.join(temporary,'state.json'),'utf8'));
  assert.equal(devnetSettings(after).changes.length,0);assert.deepEqual(after.compiled,state.compiled);
  assert.equal(await fs.readFile(path.join(temporary,'FTUE','draft.json'),'utf8'),'preserved');
  assert.equal((await configureProject(temporary)).written,false);
 });
 await test('wrong workspace identity and malformed saved state are not overwritten',async()=>{
  const file=path.join(temporary,'state.json');await fs.writeFile(file,'{broken');
  await assert.rejects(()=>configureProject(temporary));assert.equal(await fs.readFile(file,'utf8'),'{broken');
  await fs.writeFile(file,source);await fs.writeFile(path.join(temporary,'project.json'),JSON.stringify({projectId:'other'}));
  await assert.rejects(()=>configureProject(temporary),/workspace/);assert.equal(await fs.readFile(file,'utf8'),source);
 });
 console.log(JSON.stringify({passed,networkUsed:false}));
}finally{await fs.rm(temporary,{recursive:true,force:true});}
