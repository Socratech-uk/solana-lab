import {PROFILE} from './catalog.mjs';
import {isHostedPreview,requireRuntime} from './preview.mjs';
import {SOLANA_METHODS,createSolanaClient} from './solana-client.mjs';
export const METHODS = SOLANA_METHODS;
export const clone = value=>JSON.parse(JSON.stringify(value));
// Windows loads Sidecars in the owning shell. Its app-frame bridge carries the
// packaged marker; the shell itself carries shell-native-ready instead. Bind to
// that exact, same-origin appFrame rather than guessing from an ancestor flag.
export function installedShell(win=window) {
  try {
    const host=win.parent;
    if(!host||host===win||host.location.origin!==win.location.origin)return null;
    if(host.__CAPP_SHELL_NATIVE_READY__?.protocol!=='capp.shell-native-ready.v1')return null;
    if(host.document.getElementById('appFrame')?.contentWindow!==win)return null;
    const identity=plan=>plan?.appId||plan?.app?.appId||plan?.app?.id||plan?.app?.siteId;
    const appId=identity(win.__CAPP_EXECUTABLE_PLAN__);
    if(!appId||appId!==identity(host.__CAPP_EXECUTABLE_PLAN__))return null;
    return host;
  }catch{return null;}
}
export function apiFor(win=window) {
  if(isHostedPreview(win))return null;
  return win.capp?.solana||installedShell(win)?.capp?.solana||null;
}
export function localAiFor(win=window) {
  if(isHostedPreview(win))return null;
  const own=win.capp?.ai?.local;
  if(typeof own?.connect==='function')return own;
  const hosted=installedShell(win)?.capp?.ai?.local;
  return typeof hosted?.connect==='function'?hosted:null;
}
const ADDITIVE_METHODS=new Set(['edge.prepareTokenTransfer','edge.preparePayment','compass.paymentRequest','conduit.asset','conduit.tokenAccounts','conduit.activity','conduit.transaction','witness.verifyPayment']);
export function missingMethods(api) {
  return Object.entries(METHODS).flatMap(([name,methods])=>
    methods.filter(method=>!ADDITIVE_METHODS.has(`${name}.${method}`)&&typeof api?.[name]?.[method]!=='function').map(method=>`${name}.${method}`));
}
export async function loadBrowserRuntime(plan=PROFILE,{isolated=false}={}) {
  requireRuntime();
  let ownedRehearsal=false;
  if(isolated){
    try{ownedRehearsal=window.parent!==window&&window.parent.location.origin===location.origin&&location.pathname===new URL('../runtime/host.html',import.meta.url).pathname&&window.frameElement?.dataset.solanaLabRehearsal==='recovery'&&plan.componentId==='lab-recovery';}catch{}
    if(!ownedRehearsal)throw new Error('Recovery runtime must belong to the dedicated Lab rehearsal frame.');
  }
  if(apiFor() || (window.__CAPP_EXECUTABLE_PLAN__ && !ownedRehearsal)) throw new Error('An existing runtime cannot be replaced by the browser rehearsal.');
  window.__CAPP_EXECUTABLE_PLAN__=clone(plan);
  for(const item of plan.library.selected) {
    const name=item.id.replace('uk.capp.sidecar.solana-','');
    if(!METHODS[name]) throw new Error('Unknown bundled component');
    await new Promise((resolve,reject)=>{
      const s=document.createElement('script');s.src=new URL('../runtime/'+name+'.js',import.meta.url).href;
      s.onload=resolve;s.onerror=()=>reject(new Error('Unable to load '+name));document.head.append(s);
    });
  }
  return apiFor();
}
export async function connectRuntime() {
  requireRuntime();
  const packaged=!!(window.__CAPP_PACKAGED_RUNTIME__||window.__TAURI_INTERNALS__||window.__CAPP_EXECUTABLE_PLAN__||window.capp?.solana||installedShell()||/^(tauri|asset)\.localhost$/.test(location.hostname));
  if(!packaged) return {api:await loadBrowserRuntime(),mode:'browser',label:'Devnet · browser Sidecars'};
  const end=Date.now()+8000;
  while(Date.now()<end) { const api=apiFor();if(!missingMethods(api).length) return {api,mode:'installed',label:'Installed Sidecars'};await new Promise(r=>setTimeout(r,100)); }
  const missing=missingMethods(apiFor());
  const names=[...new Set(missing.map(name=>name.split('.')[0]))].join(', ');
  const error=new Error(`Still waiting for these installed Sidecars: ${names}. The Lab reconnects automatically when they are ready. You can retry now; if they stay unavailable, export the Debug report and check the packaged selection in the setup guide.`);
  error.code='LAB_INSTALLED_API_UNAVAILABLE';error.missingMethods=missing;
  throw error;
}
// Watch the actual installed API, including late Android activation. Never
// install replacement browser providers into a packaged app.
export function watchInstalledRuntime(onReady,win=window) {
  const owners=[win,installedShell(win)].filter(Boolean);
  const events=['capp:sidecar-ready','capp:android-sidecars-ready'];
  const check=()=>{if(!missingMethods(apiFor(win)).length)onReady();};
  for(const owner of owners)for(const event of events)owner.addEventListener(event,check);
  return ()=>{for(const owner of owners)for(const event of events)owner.removeEventListener(event,check);};
}
export function directCall(api,component,method,input={}) {
  requireRuntime();
  return createSolanaClient(()=>api).call(component,method,input);
}

// Each rehearsal owns an isolated runtime and storage namespace. Communication
// uses a private MessagePort; arbitrary window messages cannot invoke methods.
export async function createRehearsal(kind,{rpcUrl='',network='devnet'}={}) {
  requireRuntime();
  if(!['recovery','network'].includes(kind)) throw new Error('Unknown rehearsal');
  const frame=document.createElement('iframe');frame.hidden=true;frame.title=kind+' runtime';
  frame.dataset.solanaLabRehearsal=kind;frame.src=new URL('../runtime/host.html',import.meta.url).href;
  const loaded=new Promise((res,rej)=>{const timer=setTimeout(()=>rej(new Error('Rehearsal did not load')),10000);frame.onload=()=>{clearTimeout(timer);res();};});
  document.body.append(frame);
  try {await loaded;} catch(e){frame.remove();throw e;}
  const channel=new MessageChannel(),pending=new Map();let seq=0,closed=false;
  const call=(component,method,input={})=>new Promise((resolve,reject)=>{
    if(closed) return reject(new Error('Rehearsal closed'));
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Rehearsal timed out; reconcile existing work.'));},45000);
    pending.set(id,{resolve,reject,timer});channel.port1.postMessage({id,component,method,input:clone(input)});
  });
  channel.port1.onmessage=({data})=>{const p=pending.get(data?.id);if(!p)return;clearTimeout(p.timer);pending.delete(data.id);data.error?p.reject(Object.assign(new Error(data.error.message),{code:data.error.code})):p.resolve(data.result);};
  const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Rehearsal initialization timed out')),10000);pending.set(0,{resolve,reject,timer});});
  frame.contentWindow.postMessage({type:'solana-lab:init',kind,rpcUrl,network},location.origin,[channel.port2]);
  const close=()=>{closed=true;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Rehearsal closed'));}pending.clear();channel.port1.close();frame.remove();};
  try {await ready;} catch(e){close();throw e;}
  return {call,close};
}
