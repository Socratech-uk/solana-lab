// Deterministic classic-script distribution for cApp shell injection.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url);
const manifest=JSON.parse(await fs.readFile(new URL('sidecar.json',root),'utf8'));
const version=manifest.version;
let code=`/* Market Pulse ${version} · derived from supplied SYNTH chart code. */\n(function(global){\n"use strict";\nif(global.CAppMarketPulse?.protocol==='capp.market-library.v1'&&global.CAppMarketPulse.version===${JSON.stringify(version)}){global.CAppMarketPulse.activateSelected();return;}\n`;
for(const file of ['core.mjs','chart.mjs','panel.mjs'])code+=(await fs.readFile(new URL(file,root),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export /gm,'')+'\n';
code+=`const ID='uk.capp.sidecar.market-pulse',VERSION=${JSON.stringify(version)};
let binding=null,revision=0,activationError=null;
function selection(){
 const plan=global.__CAPP_EXECUTABLE_PLAN__||{},items=plan.library?.selected||[];
 if(!Array.isArray(items))throw Error('Invalid selected library.');
 const matches=items.filter(item=>item?.id===ID);
 if(matches.length>1)throw Error('Duplicate selected Market Pulse.');
 if(!matches.length)return null;
 const item=matches[0],scope=[plan.projectId||'app',plan.componentId||'main',plan.appId||plan.app?.appId||plan.app?.id||plan.app?.siteId||'app'];
 const source={protocol:'capp.market-selection.v1',version:VERSION,selectedVersion:item.version||null,config:normaliseConfig(item.config||{})};
 return {scope,source,identity:configurationIdentity([scope,source])};
}
function selected(){
 try{const current=selection();return current&&binding&&binding.identity===current.identity&&global.capp?.market?.pulse===binding.api&&!binding.api.dead?binding.api:null;}catch{return null;}
}
function close(api){
 if(!api)return;
 if(typeof api.destroy!=='function')throw Error('The existing feed cannot be stopped.');
 api.destroy();
 if(typeof api.status!=='function'||api.status().ready!==false)throw Error('The existing feed did not confirm it stopped.');
 if(global.capp?.market?.pulse===api)delete global.capp.market.pulse;
}
function publish(type,detail){global.dispatchEvent(new global.CustomEvent(type,{detail:{protocol:'capp.market-activation.v1',id:ID,...detail}}));}
function activateSelected(){
 try{
  const current=selection(),valid=selected();
  if(valid){activationError=null;return valid;}
  if(!current){
   if(binding){close(binding.api);binding=null;publish('capp:market-pulse-error',{code:'MARKET_NOT_SELECTED',message:'Market Pulse is not selected for this application.'});}
   return null;
  }
  // Stop the previous owner before installing a replacement. An arbitrary API
  // that cannot be stopped is unavailable, not an invitation for a second feed.
  const existing=global.capp?.market?.pulse;
  if(binding?.api&&binding.api!==existing)close(binding.api);
  close(existing);binding=null;
  let storage=null;try{storage=global.localStorage;}catch{}
  const api=new MarketPulse(current.source.config,{storage,document:global.document,fetch:global.fetch?.bind(global),setTimeout:global.setTimeout.bind(global),clearTimeout:global.clearTimeout.bind(global),storageKey:'capp.market-pulse.v1:'+encodeURIComponent(JSON.stringify(current.scope)),configurationSource:current.source});
  const authority=Object.freeze({protocol:'capp.market-owner.v1',mode:'selected',id:ID,version:VERSION,selectedVersion:current.source.selectedVersion,scope:Object.freeze(current.scope.slice()),revision:++revision});
  Object.defineProperty(api,'authority',{value:authority});
  global.capp=global.capp||{};global.capp.market=global.capp.market||{};global.capp.market.pulse=api;
  binding={api,identity:current.identity};activationError=null;
  publish('capp:market-pulse-ready',{authority});return api;
 }catch(error){
  try{close(binding?.api);if(global.capp?.market?.pulse)close(global.capp.market.pulse);}catch{}
  binding=null;activationError={code:'MARKET_SELECTION_UNAVAILABLE',message:'The selected Market Pulse could not start. Check its configuration and update the selected Sidecar.'};
  publish('capp:market-pulse-error',activationError);return null;
 }
}
const library=Object.freeze({protocol:'capp.market-library.v1',version:VERSION,create:(config,env)=>new MarketPulse(config,env),mount:mountMarketPanel,selected,activateSelected,activationStatus:()=>activationError?{...activationError}:null});
global.CAppMarketPulse=library;
activateSelected();
})(window);\n`;
await fs.writeFile(new URL('runtime.js',root),code);
const files=[];
for(const file of ['core.mjs','chart.mjs','panel.mjs','runtime.js','sidecar.json'])files.push({file,sha256:createHash('sha256').update(await fs.readFile(new URL(file,root))).digest('hex')});
await fs.writeFile(new URL('assets.json',root),JSON.stringify({protocol:'capp.market-assets.v1',files},null,2)+'\n');
console.log('Built Market Pulse shell runtime.');
