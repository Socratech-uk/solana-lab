import {GUIDED_WORKFLOWS,GUIDE_MANIFEST} from './guided-content.mjs';
import {PREVIEW,requireRuntime} from './preview.mjs';
import {esc} from './visuals.mjs';
import {workflowForPage,canResetWorkflow} from './guide-catalog.mjs';
export {createGuidedActions} from './guided-actions.mjs';
const ID='uk.capp.sidecar.ftue';
export const GUIDE_CONFIG={mode:'user',autoStart:false,ftueEnabled:true,adminDraftPersistence:false,allowRuntimeManifestRegistration:false,projectDraftAutosave:false,
 guidedActions:true,guidedActionConfirmation:true,guidedActionTimeoutMs:15000,controllerMode:'guided',autoPresentationMode:'step-through',autoStepDelayMs:1200,
 intentMode:'hybrid',assistantMode:'auto',defaultView:'assistant',maxHelpContextChars:10000,maxAssistantTokens:768,maxWorkflowSteps:12};
// App actions must register in this document’s Guide agent, never the outer shell.
const guideApi=()=>window.capp?.guide;
let installPromise,resetRun;
const loadScript=src=>new Promise((resolve,reject)=>{const el=document.createElement('script');el.src=src;el.onload=resolve;el.onerror=()=>reject(Error('Bundled Guide could not load.'));document.head.append(el);});
export async function installLabGuide({browser=false,actions=[]}={}){
 if(PREVIEW)return null;
 if(installPromise)return installPromise;
 installPromise=(async()=>{
  if(browser&&!guideApi()){
   const plan=window.__CAPP_EXECUTABLE_PLAN__;
   if(!plan)throw Error('The browser Lab runtime must be ready before Guide.');
   plan.library={...plan.library,selected:[...(plan.library?.selected||[]),{id:ID,config:{...GUIDE_CONFIG,manifestJson:JSON.stringify(GUIDE_MANIFEST)}}]};
   await loadScript(new URL('../runtime/guide/ftue-agent.js',import.meta.url).href);
   await loadScript(new URL('../runtime/guide/ftue-shell.js',import.meta.url).href);
  }
  if(!guideApi()?.registerAction){
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{window.removeEventListener('capp:ftue-ready',done);reject(Error('Include Guide in this build and select the Solana Lab Guide release.'));},10000);function done(){if(guideApi()?.registerAction){clearTimeout(timer);window.removeEventListener('capp:ftue-ready',done);resolve();}}window.addEventListener('capp:ftue-ready',done);done();});
  }
  const api=guideApi();if(!api.supports?.actionProgress||!api.supports?.userConfirmation||!api.supports?.workflowStart||!api.registerWorkflowStart)throw Error('Update cApp Guide to 0.11.2 or later, then freshly compile and rebuild this app for new demo runs.');
  if(typeof actions.startRun!=='function')throw Error('The Lab demo controller is not ready.');
  // All entry points, including the owning Guide shell's cards and offers,
  // prepare the same application run before presenting their first step.
  await api.registerWorkflowStart(context=>actions.startRun(context));
  resetRun=actions.resetRun;await api.registerTargets(GUIDE_MANIFEST.targets);
  for(const {definition,handler} of actions)api.registerAction(definition,handler);
  return api;
 })().catch(error=>{installPromise=null;throw error;});return installPromise;
}
export async function startLabWorkflow(id,{auto=false,slots={},runMode='new',recordId}={}){
 requireRuntime();const workflow=GUIDED_WORKFLOWS.find(w=>w.id===id);if(!workflow)throw Error('Unknown guided demo.');
 if(!['new','resume'].includes(runMode))throw Error('Choose a new demo or continue an exact saved record.');
 if(runMode==='resume'&&!recordId)throw Error('Choose the saved record to continue.');
 const api=await installPromise;if(!api)throw Error('Guide is not ready. Include Guide and the current Lab FTUE release in this build.');
 const available=await api.listWorkflows();if(!available.some(w=>w.id===id))throw Error('Select the updated Solana Lab Guide release, then recompile and rebuild this app.');
 if(auto&&!workflow.auto)throw Error('This workflow requires step-by-step review.');
 return api.startWorkflow(id,slots,workflow.title,{executionMode:auto?'auto-all':'guided',source:'solana-lab',runMode,...(runMode==='resume'?{recordId}:{})});
}
export async function newLabGuidedRun(id){requireRuntime();const api=await installPromise;if(!api||!resetRun)throw Error('Guide is not ready.');await api.cancelWorkflow();return resetRun(id);}
export function pageGuideButton(page,{workflowId,resumeWorkflowId,recordId}={}){
 const workflow=GUIDED_WORKFLOWS.find(w=>w.id===(workflowId||workflowForPage(page)));
 if(!workflow)return '';
 const saved=recordId&&GUIDED_WORKFLOWS.find(w=>w.id===(resumeWorkflowId||workflow.id));
 return `<button type="button" class="button" data-guide-start="${esc(workflow.id)}" aria-label="Run with Guide: ${esc(workflow.title)}" ${PREVIEW?'disabled':''}>Run with Guide</button>${saved?`<button type="button" class="button" data-guide-resume="${esc(saved.id)}" data-guide-record="${esc(recordId)}" aria-label="Continue saved record with Guide: ${esc(saved.title)}" ${PREVIEW?'disabled':''}>Continue with Guide</button>`:''}`;
}
export function guidedView({error=''}={}){
 return `<header class="page-head"><div><div class="eyebrow">GUIDE · REAL APP WORKFLOWS</div><h1>See the Lab in motion.</h1><p>Choose a goal and follow Guide from setup to result. You can also watch the local demonstrations.</p></div></header>${error?`<p class="notice-card" role="status">${esc(error)}</p>`:''}<div class="guided-grid">${GUIDED_WORKFLOWS.map(w=>`<article class="panel guided-card"><span class="tag">${esc({local:'ON THIS DEVICE',devnet:'DEVNET · YOUR APPROVAL',market:'LIVE PRICE · SIMULATION',network:'READ-ONLY NETWORK'}[w.mode])}</span><h2>${esc(w.title)}</h2><p>${esc(w.description)}</p><div class="actions"><button class="button primary" data-guide-start="${esc(w.id)}" ${PREVIEW?'disabled':''}>Guide me</button>${canResetWorkflow(w.id)?`<button class="button" data-guide-new="${esc(w.id)}" ${PREVIEW?'disabled':''}>New run</button>`:''}${w.auto?`<button class="button" data-guide-watch="${esc(w.id)}" ${PREVIEW?'disabled':''}>Watch demo</button>`:''}</div></article>`).join('')}</div><p class="hint">${PREVIEW?'This public preview describes the workflows. Use the installed app or local Lab to run them.':'Each demo starts a new run. To pick up earlier work, open its saved record and choose Continue with Guide. Watch demo is available for local demonstrations. Devnet payments always need your approval to sign and send. You can stop the walkthrough at any time.'}</p>`;
}
