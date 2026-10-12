import {RequestPayerSetup} from './request-payer.mjs';
import {transactionGuides} from './guided-transactions.mjs';
import {capabilityGuides} from './capability-guided.mjs';
import {localAiFor} from './runtime.mjs';
import {hasBoundDevnetReceipt} from './solana-client.mjs';
import {requireRuntime} from './preview.mjs';
import {uid,RECIPIENT,explainPolicy,policyExample,lamports} from './lab.mjs';
import {prepareDemoWalletsForDraft} from './demo-defaults.mjs';
import {guidedSolSetup} from './guided-wallet.mjs';
import {readDemoWalletRoles,ensureDemoWalletPair} from './demo-wallets.mjs';
const runKeys={'understand-recovery':'recovery','understand-checkout':'checkout','understand-treasury':'treasury','demo-service':'service','demo-batch':'batch','demo-proof':'proof','plan-position':'position','anchor-position-evidence':'position-evidence'};
const named=(value,values)=>{if(!values.includes(value))throw Error('That guided action is not declared.');return value;};
export function createGuidedActions({getLab,forms,selected,render=()=>{},refreshStatuses=async()=>{},verifyNetwork=async()=>{},assistant}){
 let inFlight=false,actionSettled=Promise.resolve();
 const aborted=()=>Object.assign(Error('A newer Guide launch replaced this request.'),{name:'AbortError',code:'GUIDE_RUN_SUPERSEDED'});
 const checkSignal=signal=>{if(signal?.aborted)throw aborted();};
 const waitFor=(promise,signal)=>{
  checkSignal(signal);if(!signal)return promise;
  return new Promise((resolve,reject)=>{const cancel=()=>{cleanup();reject(aborted());},cleanup=()=>signal.removeEventListener('abort',cancel);signal.addEventListener('abort',cancel,{once:true});Promise.resolve(promise).then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});});
 };
 const lab=()=>{requireRuntime();const value=getLab();if(!value)throw Error('Wait for the Lab components to connect.');return value;};
 const binding=(key)=>{
  const value=lab().state.guideBindings;
  if(value!==undefined&&(!value||typeof value!=='object'||Array.isArray(value)))throw Error('This demo’s saved progress is unreadable. Export your records before attempting a repair.');
  return value?.[key]||'';
 };
 const bind=(key,id)=>{const l=lab();binding(key);l.state.guideBindings={...l.state.guideBindings,[key]:id};l.save();};
 const payment=kind=>{const l=lab(),id=binding(kind);if(!id)throw Error('Prepare this payment first.');const p=l.payment(id);if(p.kind!==kind||!l.compatiblePayment(p))throw Error('This saved payment does not match the demo you are running.');selected[kind]=p.id;return p;};
 const recovery=()=>{const p=payment('recovery');if(p.network!=='demo'||p.scope!=='recovery')throw Error('This recovery rehearsal only supports simulated payments.');return p;};
 const workflow=kind=>{const l=lab(),w=l.workflow(binding(kind));if(w.kind!==kind)throw Error('This saved request belongs to a different demo.');selected[kind]=w.id;return w;};
 const openRun=kind=>{
  const id=binding(kind);
  // Never infer a guided run from the newest history card. A blank binding
  // opens the draft; a saved binding always resumes that exact record.
  if(id&&lab().state.workflows.some(w=>w.id===id))workflow(kind);
  else if(id&&lab().state.payments.some(p=>p.id===id))payment(kind);
  else selected[kind]='new';
  render();return {recordId:id||null,draft:selected[kind]==='new'};
 };
 const requireVisibleDraft=kind=>{
  if(selected[kind]!=='new'){
   openRun(kind);
   throw Error('The new request form is now open. Review the recipient and amount, then retry this step.');
  }
 };
 const ensurePayment=async kind=>{
  const l=lab();let id=binding(kind);if(!id){if(kind!=='recovery')requireVisibleDraft(kind);id=uid('guide-'+kind);bind(kind,id);}
  let p=l.state.payments.find(row=>row.id===id);
  try {
   if(!p){if(kind!=='recovery'){await prepareDemoWalletsForDraft(l,kind,forms[kind]);const setup=await guidedSolSetup(l,forms[kind]);await refreshStatuses();if(setup.guide)return setup;}await l.preparePayment({kind,...(kind==='recovery'?{amount:'0.01',recipient:RECIPIENT}:forms[kind]),operationId:id});}
   else if(['preparing','prepared'].includes(p.state))await l.reviewPayment(id);
  }finally{selected[kind]=l.state.payments.some(p=>p.id===id)?id:'new';render();}
  p=payment(kind);if(!p.operation)throw Error('The payment is not ready yet. Try preparing it again.');
  return {operationId:p.id,attemptId:p.operation.attemptId,state:p.state,network:p.network};
 };
 const definitions=[];
 const add=(name,title,args,handler,options={})=>definitions.push({definition:{id:'solana-lab.'+name,title,arguments:args,...options},handler:async (raw,context={})=>{
  if(options.requiresUserConfirmation&&!context.userConfirmed)throw Error('Confirm this step in Guide to continue.');
  requireRuntime();if(inFlight||lab().busy)throw Error('Wait for the current Lab operation to finish.');inFlight=true;
  let settled;actionSettled=new Promise(resolve=>{settled=resolve;});
  try{return await handler(raw||{},context);}finally{inFlight=false;settled();render();}
 }});
 const choice=values=>({type:'string',required:true,enum:values,maxLength:40});
 add('wallets.setup','Set up your demo wallets',{},async()=>{
  const result=await ensureDemoWalletPair(lab());await refreshStatuses();return result;
 },{requiresUserConfirmation:true});
 add('wallets.checkFunds','Check payer and receiver balances',{},async()=>{
  const l=lab(),roles=await readDemoWalletRoles(l);
  if(!roles.payer||!roles.receiver)throw Error(roles.receiverIssue||'Prepare demo wallets first, or choose a payer and receiver in Wallets.');
  const result=await guidedSolSetup(l,{sender:roles.payer.walletPubkey,recipient:roles.receiver.walletPubkey,amount:'0.00001'});
  await refreshStatuses();return result;
 });

 add('run.review','Review this request',{kind:choice(['checkout','treasury','service','batch','proof'])},async({kind})=>{
  const result=openRun(named(kind,['checkout','treasury','service','batch','proof']));
  if(result.draft)result.defaults=await prepareDemoWalletsForDraft(lab(),kind,forms[kind]);
  await refreshStatuses();return result;
 });
 add('policy.check','Run a policy example',{scenario:choice(['normal','fee','stale'])},async({scenario})=>{
  named(scenario,['normal','fee','stale']);Object.assign(forms.policy,policyExample(scenario));render();
  await lab().policy(forms.policy);const result=lab().state.policy?.result;
  const failed=result?.checks?.filter(c=>!c.pass&&!c.bypass).map(c=>c.id),expected={normal:[],fee:['fee'],stale:['freshness']}[scenario];
  if(!result||result.allowed!==(scenario==='normal')||JSON.stringify(failed)!==JSON.stringify(expected))throw Error('The policy result differs from this example. Inspect the actual checks before continuing.');
  return {allowed:result.allowed,expected:true,explanation:explainPolicy(lab().state.policy),checks:result.checks};
 });
 add('recovery.prepare','Prepare the recovery simulation',{},()=>ensurePayment('recovery'));
 add('recovery.approve','Approve the simulated payment',{},async()=>{let p=recovery();if(['authorised','unknown','submitted','finalised'].includes(p.state))return {operationId:p.id,state:p.state};await lab().approvePayment(p.id);p=recovery();if(p.state!=='authorised')throw Error('The simulated request was not authorised.');return {operationId:p.id,state:p.state};});
 add('recovery.submit','Simulate a missing reply',{},async()=>{
  const p=recovery();if(['unknown','finalised'].includes(p.state))return {operationId:p.id,state:p.state,reused:true};
  if(p.state!=='authorised')throw Error('Approve the simulated request first.');
  try{await lab().submitPayment(p.id);}catch(error){if(recovery().state!=='unknown'||!/response.lost/i.test(String(error.message)))throw error;}
  const next=recovery();if(next.state!=='unknown')throw Error('The rehearsal did not produce the expected lost response. Inspect its result.');
  return {operationId:next.id,attemptId:next.operation.attemptId,state:next.state,simulated:true};
 });
 add('recovery.reconcile','Recover the simulated receipt',{},async()=>{
  const p=recovery(),attemptId=p.operation?.attemptId;
  if(!['unknown','submitted','finalised'].includes(p.state))throw Error('Run the missing-reply simulation before checking its receipt.');
  await lab().reconcilePayment(p.id);const next=recovery(),receipt=next.operation?.receipt;
  if(next.state!=='finalised'||receipt?.simulated!==true||receipt.operationId!==p.id||next.operation.attemptId!==attemptId)throw Error('The receipt does not yet verify the original simulated payment. Review the saved result, then check again.');
  return {operationId:p.id,attemptId,state:next.state,simulated:true};
 });
 add('payment.prepare','Prepare this devnet payment',{kind:choice(['checkout','treasury'])},({kind})=>ensurePayment(named(kind,['checkout','treasury'])));
 add('payment.verify','Verify a devnet receipt',{kind:choice(['checkout','treasury'])},({kind})=>{
  const p=payment(named(kind,['checkout','treasury'])),op=p.operation;
  if(p.network!=='devnet'||!hasBoundDevnetReceipt(op)||op.operationId!==p.id||op.sender!==p.walletPubkey||op.recipient!==p.recipient||op.amountLamports!==p.amountLamports)throw Error('This exact request still needs a verified devnet receipt matching its sender, recipient and amount. Complete the signing, sending and receipt checks.');
  return {operationId:p.id,signature:op.receipt.signature,network:'devnet'};
 });
 add('workflow.prepare','Prepare this request',{kind:choice(['service','batch','proof'])},async({kind})=>{
  named(kind,['service','batch','proof']);const l=lab();let id=binding(kind);
  if(!id){requireVisibleDraft(kind);await prepareDemoWalletsForDraft(l,kind,forms[kind]);const setup=await guidedSolSetup(l,kind==='batch'?{walletPubkey:forms.batch.walletPubkey,amountAtomic:String(forms.batch.items.reduce((n,i)=>n+lamports(i.amount),0)),recipients:forms.batch.items}:forms[kind]);await refreshStatuses();if(setup.guide)return setup;const before=new Set(l.state.workflows.map(w=>w.id));try{const w=await l.createWorkflow({kind,...forms[kind],recipients:kind==='batch'?forms.batch.items.map(i=>({...i})):[]});id=w.id;}finally{const created=l.state.workflows.find(w=>!before.has(w.id));if(created){id=created.id;bind(kind,id);}}}
  const w=workflow(kind);await l.prepareWorkflowPayment(w.id,w.items[0].id);return {workflowId:w.id,items:w.items.length,state:'prepared'};
 });
 add('workflow.verify','Verify all payment receipts',{kind:choice(['service','batch','proof'])},({kind})=>{
  const w=workflow(named(kind,['service','batch','proof']));if(!w.items.every(i=>lab().paid(w,i)))throw Error('Each payment needs its own verified devnet receipt. Complete the signing, sending and receipt checks for every payment.');return {workflowId:w.id,confirmed:w.items.length};
 });
 add('workflow.deliver','Deliver a paid report',{},async()=>{const w=workflow('service'),result=await lab().deliverService(w.id);if(!result.complete)throw Error('Report delivery has not completed.');return {workflowId:w.id,digest:result.digest,complete:true};});
 add('workflow.anchor','Open the delivered report’s proof',{},async()=>{const proof=await lab().anchorDelivery(workflow('service').id);selected.proof=proof.id;return {workflowId:proof.id};});
 add('workflow.compare','Check the document against its proof',{source:{type:'string',enum:['proof','service']}},async({source='proof'})=>{const w=source==='service'?lab().workflow(workflow('service').proofId):workflow('proof');selected.proof=w.id;forms.proof.verifyText=w.text;const result=await lab().verifyDocument(w.id,w.text);if(!result.matches||!result.chainObserved)throw Error('The document has not yet been verified against its on-chain proof.');return result;});
 add('position.open','Open a simulated position',{units:{type:'number',required:true,min:1,max:100000}},async({units})=>{
  const l=lab();let id=binding('position'),p=id?l.position(id):null;
  if(p&&p.jobs.some(j=>!j.done)){await l.resumePosition(p.id);p=l.position(p.id);}
  if(!p){forms.positions.units=String(units);render();const before=new Set(l.state.positions.map(p=>p.id));try{await l.openPosition(units);}finally{p=l.state.positions.find(p=>!before.has(p.id));if(p)bind('position',p.id);}}
  if(p){selected.position=p.id;forms.positions.positionId=p.id;}
  if(!p||!p.jobs.some(j=>j.action==='open'&&j.done))throw Error('The simulated position has not opened yet.');return {positionId:p.id,state:p.state,simulated:true};
 });
 add('position.change','Update the simulated position',{action:choice(['reduce','close'])},async({action})=>{
  named(action,['reduce','close']);const l=lab();let p=l.position(binding('position'));
  if(p.jobs.some(j=>!j.done)){await l.resumePosition(p.id);p=l.position(p.id);}
  if(!p.jobs.some(j=>j.action===action&&j.done)){await l.changePosition(p.id,action);p=l.position(p.id);}
  if(!p.jobs.some(j=>j.action===action&&j.done))throw Error('The simulated position update is not complete.');return {positionId:p.id,state:p.state,simulated:true};
 });
 add('position.evidencePrepare','Prepare the devnet evidence payment',{},async()=>{
  const l=lab(),saved=binding('position-evidence'),existing=saved?l.state.payments.find(p=>p.id===saved):null;
  if(existing){selected.evidence=saved;if(existing.kind!=='evidence'||!l.compatiblePayment(existing))throw Error('The saved evidence payment is not compatible with this demo.');return ['preparing','prepared'].includes(existing.state)?l.reviewPayment(saved):{operationId:saved};}
  const id=forms.positions.positionId||binding('position')||l.state.positions.find(p=>p.jobs.some(j=>j.done))?.id;
  if(!id)throw Error('Complete a simulated position action first, then return to record its evidence on devnet.');
  forms.positions.positionId=id;const job=l.position(id).jobs.filter(j=>j.done).at(-1);if(!job)throw Error('Complete this position action before recording its evidence.');
  await prepareDemoWalletsForDraft(l,'positions',forms.positions);const setup=await guidedSolSetup(l,{...forms.positions,amountAtomic:String(BigInt(lamports(forms.positions.amount,10000000000000))/10000n)});await refreshStatuses();if(setup.guide)return setup;
  const operationId=saved||uid('guide-evidence');bind('position-evidence',operationId);
  try{const p=await l.prepareEvidenceTransfer(id,{...forms.positions,jobId:job.id,operationId});return {operationId:p.id};}
  finally{if(l.state.payments.some(p=>p.id===operationId))selected.evidence=operationId;}
 });
 add('components.refresh','Check component connections',{},async()=>{await refreshStatuses();return {checked:true};});
 add('network.verify','Verify the devnet connection',{},()=>verifyNetwork());
 add('ai.settings','Open Local AI settings',{},async()=>{const api=localAiFor();if(!api?.openStudio&&!api?.openInferenceSettings)throw Error('Local AI is not included in this build. Add it to manage models and AI settings.');await (api.openInferenceSettings?api.openInferenceSettings():api.openStudio());return {opened:true};});
 for(const mode of ['open','guide','status'])add('assistant.'+mode,'Lab Assistant: '+mode,{},async()=>{await assistant.open();if(mode!=='open')await assistant.action(mode);return {opened:true};});
 const payerSetup=new RequestPayerSetup({getLab:lab,render,refreshStatuses,onNewRequest:(oldId,newId)=>{
  for(const key of ['requests','request-payment'])if(binding(key)===oldId)bind(key,newId);
  selected.requests=newId;forms.requests.signature='';render();
 }});
 definitions.payerSetup=payerSetup;
 const transactions=transactionGuides({lab,selected,add,binding,render,payerSetup});
 const capability=capabilityGuides({lab,forms,selected,render,add,binding,bind,refreshStatuses,payerSetup});
 const clearCheckpoints=()=>{transactions.reset();payerSetup.current=null;payerSetup.checkpoint=null;};
 const clearDraft=workflowId=>{
  const key=runKeys[workflowId]||({'demo-token-payment':'tokens','create-payment-request':'requests','pay-payment-request':'requests'})[workflowId];
  const form=forms[['position','position-evidence'].includes(key)?'positions':key];if(!form)return;
  // These are captured setup state, not editable transaction terms. A fresh
  // run uses the current payer; a saved-record continuation keeps its sender.
  if(Object.hasOwn(form,'walletPubkey'))form.walletPubkey='';
  if(Object.hasOwn(form,'sender'))form.sender='';
  if(Object.hasOwn(form,'setupNote'))form.setupNote='';
  if(Object.hasOwn(form,'verifyText'))form.verifyText='';
  if(Object.hasOwn(form,'signature'))form.signature='';
 };
 definitions.openRun=(workflowId,options={})=>{
  if(inFlight||lab().busy)throw Error('Wait for the current Lab operation to finish.');
  const extra=capability.openRun(workflowId,options);if(extra)return extra;
  const key=runKeys[workflowId],l=lab();
  if(options.recordId&&key){
   const id=options.recordId,w=l.state.workflows.find(w=>w.id===id),p=l.state.payments.find(p=>p.id===id),position=l.state.positions.find(p=>p.id===id);
   if(key==='position'){if(!position)throw Error('This saved record cannot be opened in this demo.');forms.positions.positionId=id;selected.position=id;}
   else if(w?.kind!==key&&!(p?.kind===(key==='position-evidence'?'evidence':key)&&l.compatiblePayment(p)))throw Error('This saved record cannot be opened in this demo.');
   bind(key,id);
  }
  if(key==='position-evidence'){
   const id=binding(key),p=id?l.state.payments.find(p=>p.id===id):null;
   if(p)forms.positions.positionId=l.state.positions.find(position=>position.jobs.some(job=>job.id===p.evidence?.operationId))?.id||forms.positions.positionId;
   forms.positions.positionId ||= binding('position')||l.state.positions.find(p=>p.jobs.some(j=>j.done))?.id||'';
   selected.evidence=id||'new';render();return {recordId:id||null,draft:!id};
  }
  if(key==='position'){const id=binding(key);selected.position=id||'new';if(id)forms.positions.positionId=id;render();return {recordId:id||null,draft:!id};}
  return key?openRun(key):null;
 };
 definitions.resetRun=workflowId=>{
  if(inFlight||lab().busy)throw Error('Wait for the current operation to finish.');
  lab().reload();clearCheckpoints();clearDraft(workflowId);
  const extra=capability.resetRun(workflowId);if(extra)return extra;
  const key=runKeys[workflowId];if(!key)return {reset:false};
  const l=lab(),id=binding(key),next={...l.state.guideBindings};delete next[key];
  // Starting another walkthrough never cancels, rewrites or completes the old
  // record. Even an unknown send remains available for exact-record recovery.
  l.state.guideBindings=next;selected[key==='position-evidence'?'evidence':key]='new';
  if(key==='position')forms.positions.positionId='';
  l.save();return {reset:!!id,retainedRecord:id||null};
 };
 definitions.waitForIdle=async({signal}={})=>{
  checkSignal(signal);
  while(inFlight||lab().busy||payerSetup.busy){await waitFor(inFlight?actionSettled:new Promise(resolve=>setTimeout(resolve,25)),signal);checkSignal(signal);}
 };
 // The Guide owner calls this once for an explicit launch. Next, Retry and
 // progress checkpoints continue the same bindings without invoking it.
 definitions.startRun=async({workflowId,runMode='new',recordId,signal}={})=>{
  if(!workflowId||!['new','resume'].includes(runMode))throw Error('Start a new demo or choose a saved record to continue.');
  if(runMode==='resume'&&!recordId)throw Error('Choose the exact saved record to continue with Guide.');
  await definitions.waitForIdle({signal});checkSignal(signal);lab().reload();
  if(runMode==='new'){
   const reset=definitions.resetRun(workflowId);checkSignal(signal);
   return {...reset,...definitions.openRun(workflowId),runMode:'new'};
  }
  clearCheckpoints();checkSignal(signal);
  const opened=definitions.openRun(workflowId,{recordId});
  if(!opened?.recordId)throw Error('This demo has no saved run to continue.');
  return {...opened,runMode:'resume'};
 };
 return definitions;
}
