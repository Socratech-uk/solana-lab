import {MarketPulse} from '../sidecars/market-pulse/core.mjs';
import {mountMarketPanel} from '../sidecars/market-pulse/panel.mjs';
import {installedShell} from './runtime.mjs';
import {MARKET_CONFIG} from './market-config.mjs';

export {MARKET_COMPONENT} from './market-metadata.mjs';
const ID='uk.capp.sidecar.market-pulse';
const METHODS=['status','quote','candles','configuration','snapshot','acquire','subscribe','configure','exportConfig','importConfig','pause','resume','setHidden'];
const unavailable=(message,reason,code='LAB_MARKET_UNAVAILABLE')=>Object.assign(new Error(message),{code,reason});
const compatible=api=>{
  if(METHODS.some(method=>typeof api?.[method]!=='function'))throw unavailable('Update the selected Market Pulse Sidecar; its API is incompatible.','incompatible');
  if(api.status().ready===false)throw unavailable('The selected Market Pulse is closed. Reconnect after the Sidecar is ready.','closed');
  return api;
};
const scopeFor=plan=>[plan.projectId||'app',plan.componentId||'main',plan.appId||plan.app?.appId||plan.app?.id||plan.app?.siteId||'solana-lab'];
export function connectMarket(win=window,{standalone=false}={}){
  const shell=installedShell(win),owner=shell||win;
  const plan=owner.__CAPP_EXECUTABLE_PLAN__||{};
  const selected=plan.library?.selected;
  if(selected!=null&&!Array.isArray(selected))throw unavailable('Market Pulse selection is invalid. Check the packaged Sidecars.','invalid-selection');
  const matches=(selected||[]).filter(item=>item?.id===ID);
  if(matches.length>1)throw unavailable('Market Pulse has more than one selected configuration. Check the packaged Sidecars.','duplicate-selection');
  if(matches.length){
    // Only the selected runtime in the verified owning window can publish the
    // feed. Child-frame APIs and bundled defaults cannot stand in for it.
    const library=owner.CAppMarketPulse;
    if(library?.protocol==='capp.market-library.v1'&&typeof library.selected==='function'){
      const api=library.selected();
      if(api)return compatible(api);
      const failure=library.activationStatus?.();
      if(failure)throw unavailable(failure.message||'The selected Market Pulse could not start.','activation-failed');
      if(owner.capp?.market?.pulse)throw unavailable('The selected Market Pulse configuration has changed. Reconnect after the selected Sidecar restarts.','stale-selection');
    }else if(owner.capp?.market?.pulse){
      throw unavailable('Update the selected Market Pulse Sidecar to verify its configuration ownership.','unverified-owner');
    }
    throw unavailable('The selected Market Pulse is still starting. Payment workflows are available while it connects.','selected-starting','LAB_MARKET_STARTING');
  }
  const installed=!!(shell||win.__CAPP_PACKAGED_RUNTIME__||win.__TAURI_INTERNALS__||win.__CAPP_SHELL_NATIVE_READY__||/^(tauri|asset)\.localhost$/.test(win.location?.hostname||''));
  if(installed||(owner.__CAPP_EXECUTABLE_PLAN__||win.capp?.solana)&&!standalone)throw unavailable('Market Pulse is not selected for this app. Select the Sidecar to enable live market data.','not-selected');
  const scope=scopeFor(plan);
  const existing=owner.capp?.market?.pulse;
  if(existing){
    if(existing.authority&&(existing.authority.mode!=='standalone'||JSON.stringify(existing.authority.scope)!==JSON.stringify(scope)))throw unavailable('The existing Market Pulse belongs to another configuration. Restart the app to reconnect.','unverified-owner');
    return compatible(existing);
  }
  let storage=null;try{storage=owner.localStorage;}catch{/* Continue in memory if storage is unavailable. */}
  const api=new MarketPulse(MARKET_CONFIG,{storage,document:owner.document,storageKey:'capp.market-pulse.v1:'+encodeURIComponent(JSON.stringify(scope)),fetch:owner.fetch?.bind(owner),setTimeout:owner.setTimeout.bind(owner),clearTimeout:owner.clearTimeout.bind(owner)});
  Object.defineProperty(api,'authority',{value:Object.freeze({protocol:'capp.market-owner.v1',mode:'standalone',id:ID,scope:Object.freeze(scope.slice()),revision:1})});
  owner.capp=owner.capp||{};owner.capp.market=owner.capp.market||{};owner.capp.market.pulse=api;
  return api;
}
export function watchMarketRuntime(onChange,win=window){
  const owners=[win,installedShell(win)].filter(Boolean),events=['capp:market-pulse-ready','capp:market-pulse-error'];
  const check=event=>{if(event.detail?.id===ID)onChange(event);};
  for(const owner of owners)for(const event of events)owner.addEventListener(event,check);
  return ()=>{for(const owner of owners)for(const event of events)owner.removeEventListener(event,check);};
}
export function mountLabMarket(container,api,levels){return mountMarketPanel(container,api,{levels});}
