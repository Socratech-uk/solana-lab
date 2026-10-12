import {explainPolicy,policyExample,lamports,devnetAddress} from './lab.mjs';
import {COMPONENTS as SOLANA_COMPONENTS,DEMOS as CORE_DEMOS} from './catalog.mjs';
import {CapabilityLab as Lab,paymentRoute} from './capability-lab.mjs';
import {CAPABILITY_DEMOS} from './capability-content.mjs';
import {capabilityView} from './capability-ui.mjs';
import {paymentSetup} from './setup-readiness.mjs';
import {openFundingHandoff} from './funding-handoff.mjs';
import {DEVNET_DEMO_MINT} from './demo-token.mjs';
import {copyFundingPayer} from './token-funding.mjs';
import {fillDemoDefaults,selectedDevnetWallet,createDemoReceiver,refreshDemoRecipients} from './demo-defaults.mjs';
import {readDemoWalletRoles,setDemoReceiver,ensureDemoWalletPair,demoWalletRolesKey} from './demo-wallets.mjs';
import {checkDemoSolReceiver} from './guided-wallet.mjs';
import {formatAmount} from './solana-payments.mjs';
import {paymentAmount} from './asset-format.mjs';
import {CONNECTED,CONNECTED_DEMOS,landing,workflowView,docsView} from './showcase-ui.mjs';
const DEMOS=[...CONNECTED_DEMOS,...CORE_DEMOS.map((d,i)=>({...d,number:String(i+4).padStart(2,'0')})),...CAPABILITY_DEMOS];
import {connectRuntime,createRehearsal,directCall,watchInstalledRuntime} from './runtime.mjs';
import {RECIPIENT,READ_TOOLS,readTool,errorDetails} from './lab.mjs';
import {esc,icon} from './visuals.mjs';
import './assistant.mjs';
import './guide-docset.js';
import {createGuidedActions,installLabGuide,startLabWorkflow,newLabGuidedRun,guidedView,pageGuideButton} from './guided.mjs';
import {EXPERIENCES,experienceIntro,nextDemo,stateBadge,stateLabel,technical,dataBlock,paymentJourney,paymentPresentation,receiptReady,receiptSummary,runHistory,relevantEvents,componentExplanation,eventInspector,dateLabel,shortId} from './experience.mjs';
import {connectMarket,mountLabMarket,watchMarketRuntime,MARKET_COMPONENT} from './market.mjs';
import {PREVIEW,PREVIEW_REASON,requireRuntime,routePath,wirePreviewNavigation,applyPreviewPresentation} from './preview.mjs';
import {WalletManager} from './wallets.mjs';
const COMPONENTS=[...SOLANA_COMPONENTS,MARKET_COMPONENT];
let market=null,marketPanel=null,releasePositionFeed=null,marketUnsubscribe=null,guideError='',marketError='';

const $=s=>document.querySelector(s),content=$('#content'),assistant=$('lab-assistant');
let bootFlight=null,stopRuntimeWatch=()=>{},stopMarketWatch=()=>{},walletContextFlight=null,formBusy=false;
let payerSetup=null,lab,runtime,statuses=[],recovery=null,networkResult=null,ready=false,bootError=null,selected={},walletBalance=null;
const walletManager=new WalletManager({preview:PREVIEW,call:(component,method,input)=>{requireRuntime();return directCall(runtime.api,component,method,input);},download,notify,getLab:()=>lab,payments:()=>lab?.state.payments||[],openPayment:id=>action('open-record',id),
  onChange:()=>{render();if(!walletManager.busy&&lab&&!PREVIEW)void refreshWalletContext();}});
const historyPages={},disclosures=new Map();let renderedRoute='gallery';
const forms={checkout:{amount:'0.0025',recipient:'',walletPubkey:''},treasury:{amount:'0.075',recipient:'',walletPubkey:''},recovery:{amount:'0.01',recipient:RECIPIENT},policy:{action:'open',amount:'0.01',fee:'5000',slippage:'50',risk:'medium',age:'0'},positions:{units:'100',amount:'0.1',recipient:'',walletPubkey:''}};
Object.assign(forms,{service:{title:'Community activity report',text:'[\n  {"team":"Design","tasks":12},\n  {"team":"Build","tasks":18}\n]',amount:'0.00001',recipient:'',walletPubkey:''},batch:{title:'Contributor payouts',rows:'',items:[{label:'Design',recipient:'',amount:'0.00001'},{label:'Build',recipient:'',amount:'0.00001'}],recipient:'',walletPubkey:''},proof:{title:'Release notes commitment',text:'Solana Lab — release notes\nReusable infrastructure, expressed as reliable operations.',amount:'0.00001',recipient:'',walletPubkey:'',verifyText:''}});
Object.assign(forms,{tokens:{mint:'',amount:'1',recipient:''},requests:{assetKind:'native',mint:'',amount:'0.001',minutes:'60',label:'Devnet order',message:'',memo:'',recipient:'',signature:'',importText:''},activity:{network:'devnet',address:''}});
const route=()=>{const s=routePath().split('/')[0];return [...DEMOS.map(d=>d.id),'components','receipts','docs','wallets','guided'].includes(s)?s:'gallery';};
const badgeList=names=>`<div class="badge-list">${names.map(n=>`<sidecar-badge name="${esc(COMPONENTS.find(c=>c.id===n)?.name||n)}"></sidecar-badge>`).join('')}</div>`;
const status=stateBadge;
const json=v=>`<pre>${esc(JSON.stringify(v,null,2))}</pre>`;
const short=s=>s?String(s).slice(0,12)+'…':'—';
const sol=n=>(Number(n)/1e9).toLocaleString('en-US',{maximumFractionDigits:9});
const button=(action,text,{id='',primary=false,disabled=false}={})=>`<button type="button" class="button ${primary?'primary':''}" data-action="${action}" ${id?`data-id="${esc(id)}"`:''} ${disabled||lab?.busy||formBusy||walletManager.busy||(action==='self-recipient'&&!statuses.find(s=>s.id==='latch')?.wallet?.connected)?'disabled':''}>${text}</button>`;
function notify(message,error=false){const el=$('#toast');clearTimeout(notify.timer);el.textContent=message;el.dataset.error=error;el.hidden=!message;if(message)notify.timer=setTimeout(()=>el.hidden=true,error?11000:4500);}
function download(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function nav(){
  const groups=[['', [['gallery','The Lab','grid'],['guided','Guided demos','layers'],['wallets','Wallets','bag']]],['Business demos',DEMOS.filter(d=>['service','batch','proof','checkout','treasury'].includes(d.id)).map(d=>[d.id,d.name,d.icon])],['Reliability demos',DEMOS.filter(d=>['positions','recovery','policy','network'].includes(d.id)).map(d=>[d.id,d.name,d.icon])],['Assets & requests',CAPABILITY_DEMOS.map(d=>[d.id,d.name,d.icon])],['Explore & build',[['receipts','Receipts & activity','receipt'],['components','Component library','layers'],['docs','cApp developer docs','layers']]]];
  const items=groups.flatMap(g=>g[1]);
  $('#nav').innerHTML=groups.map(([name,items])=>(name?`<span class="nav-group">${name}</span>`:'')+items.map(([id,label,i])=>`<a class="nav-item ${route()===id?'active':''}" href="#/${id==='gallery'?'':id}" ${route()===id?'aria-current="page"':''}>${icon(i)}${label}</a>`).join('')).join('');
  $('#crumb').textContent=items.find(x=>x[0]===route())?.[1]||'The Lab';
}
function gallery(){return landing(DEMOS,{preview:PREVIEW});}
function guidePageOptions(page){
 if(!lab||selected[page]==='new')return {};
 if(page==='requests'){
  const row=lab.state.paymentRequests.find(r=>r.id===selected.requests)||lab.state.paymentRequests.at(-1);
  return row?{resumeWorkflowId:'pay-payment-request',recordId:row.id}:{};
 }
 const rows=['service','batch','proof'].includes(page)?lab.state.workflows.filter(w=>w.kind===page):lab.state.payments.filter(p=>p.kind===(page==='tokens'?'token':page)&&lab.compatiblePayment(p));
 const row=rows.find(row=>row.id===selected[page])||rows.at(-1);
 return row?{recordId:row.id}:{};
}

function head(d){
 const mode=PREVIEW?'PREVIEW · INSTALLED APP TO RUN':['checkout','treasury',...CONNECTED].includes(d.id)?'DEVNET · TEST SOL':['tokens','requests'].includes(d.id)?'DEVNET · TEST ASSETS':d.id==='activity'?'PUBLIC NETWORK READS':d.id==='positions'?'LIVE PRICES · SIMULATED EXECUTION':d.id==='network'?'READ-ONLY NETWORK':'SIMULATION · NO TRANSFER';
 return `<header class="page-head"><div><div class="eyebrow">${d.tag}</div><h1>${esc(d.name)}</h1><p>${esc(EXPERIENCES[d.id]?.goal||d.description)}</p></div><span class="tag sim-tag">${mode}</span></header><div class="actions guided-entry">${pageGuideButton(d.id,guidePageOptions(d.id))}</div>${experienceIntro(d.id)}`;
}
function draftForms(){
  const result={};
  for(const kind of ['checkout','treasury','service','batch','proof','tokens','requests','positions']){
    let saved=false;
    if(kind!=='positions'&&selected[kind]!=='new'){
      const rows=kind==='requests'?lab?.state.paymentRequests||[]:CONNECTED.includes(kind)?(lab?.state.workflows||[]).filter(w=>w.kind===kind):(lab?.state.payments||[]).filter(p=>p.kind===(kind==='tokens'?'token':kind)&&lab.compatiblePayment(p));
      saved=!!(rows.find(row=>row.id===selected[kind])||(!selected[kind]?rows.at(-1):null));
    }
    if(!saved)result[kind]=forms[kind];
  }
  return result;
}
async function refreshWalletContext(){
  if(PREVIEW||!lab||lab.busy)return;
  if(walletContextFlight)return walletContextFlight;
  walletContextFlight=(async()=>{
    try{[statuses]=await Promise.all([lab.statuses(),walletManager.refreshRoles()]);await refreshDemoRecipients(lab,draftForms(),{roleSnapshot:walletManager.roles||{payer:null,receiver:null,receiverIssue:walletManager.rolesError}});if(ready)render(true);}
    catch(error){walletManager.rolesError=errorDetails(error).message;if(ready)render(true);}
  })().finally(()=>{walletContextFlight=null;});return walletContextFlight;
}
function recipientTools(kind,record=null){
  if(PREVIEW||record)return '';
  const roles=walletManager.roles,receiver=roles?.receiver,payer=roles?.payer;
  const choices=(roles?.wallets||[]).filter(w=>w.walletPubkey!==payer?.walletPubkey),form=forms[kind],recipient=kind==='batch'?form.items?.[0]?.recipient:form?.recipient;
  return `<section class="demo-recipient-choice" aria-label="Demo receiver"><strong>Demo receiver</strong>${receiver?`<p><b>${esc(receiver.label)}</b>${receiver.suggested?' · available wallet':''}<br><code>${esc(receiver.walletPubkey)}</code></p>`:`<p>${esc(roles?.receiverIssue||'Choose a separate receiver or prepare the demo wallets here.')}</p>`}
    ${choices.length?`<label>Change receiver for new demos<select data-demo-receiver="${esc(kind)}" aria-label="Change demo receiver" ${lab?.busy||formBusy?'disabled':''}><option value="">Choose a receiver</option>${choices.map(w=>`<option value="${esc(w.walletId)}" ${w.walletPubkey===receiver?.walletPubkey?'selected':''}>${esc(w.label)} · ${esc(short(w.walletPubkey))}</option>`).join('')}</select></label>`:''}
    <div class="actions">${receiver?button('use-demo-receiver',recipient===receiver.walletPubkey?'Use this receiver':'Use receiver in this draft',{id:kind}):''}${button('prepare-demo-wallets',payer&&receiver?'Prepare wallets':'Prepare payer & receiver',{id:kind})}<a class="text-button" href="#/wallets">Create or manage wallets ↗</a></div><p class="hint">An entered address stays yours to review. Saved payments keep their original sender and recipient.</p>
    ${form?.receiverCheck?`<div class="notice-card" role="status"><strong>${esc(form.receiverCheck.title)}</strong><p>${esc(form.receiverCheck.body)}</p>${form.receiverCheck.handoff?`<code>${esc(form.receiverCheck.handoff.copyText)}</code><div class="actions">${button('receiver-funding-copy','Copy receiver address',{id:form.receiverCheck.handoff.copyText})}<a class="button" href="https://faucet.solana.com/" target="_blank" rel="noopener noreferrer">Get receiver test SOL ↗</a></div>`:''}<p class="hint">After funding or correcting the connection, retry Review. Your draft is retained.</p></div>`:''}</section>`;
}
async function bindNewDraftPayer(form){
  const shown=statuses.find(s=>s.id==='latch')?.wallet;
  const current=await lab.rawCall('latch','status',{},'main'),selected=current.wallet?.connected?current.wallet.walletPubkey:'';
  if(current.network!=='devnet')throw Error('Select a devnet payer before reviewing this draft.');
  if(!form.walletPubkey&&shown?.connected&&selected!==shown.walletPubkey)throw Object.assign(Error('The selected payer changed. Review the current payer and try again.'),{code:'LAB_PAYER_CHANGED'});
  // Bind the public sender before any funding await. Even a selection change
  // after the final status check cannot make record creation choose a new payer.
  form.walletPubkey=devnetAddress(form.walletPubkey||selected,'sender');
  return {walletPubkey:form.walletPubkey,selected};
}
async function checkDraftPayer(payer){
  const current=await lab.rawCall('latch','status',{},'main'),selected=current.wallet?.connected?current.wallet.walletPubkey:'';
  if(current.network!=='devnet'||selected!==payer.selected)throw Object.assign(Error('The selected payer changed while receiver funds were checked. Review the current payer and try again; no payment was prepared.'),{code:'LAB_PAYER_CHANGED'});
}
async function checkNewSolReceivers(kind,entries,payer){
  delete forms[kind].receiverCheck;
  for(const entry of entries){
    const result=await checkDemoSolReceiver(lab,entry);
    await checkDraftPayer(payer);
    if(result.ready===false||result.guide){forms[kind].receiverCheck=result.guide;notify(result.guide?.title||'Check the receiver before continuing.');return false;}
  }
  return true;
}
function walletPanel(formKey,record=null){
  if(PREVIEW)return `<details class="panel wallet-panel" data-disclosure="wallet-${formKey}"><summary><strong>Wallet & test funds</strong><span class="tag">INSTALLED APP</span></summary><div class="wallet-content"><p>Explore the steps here. Connecting a wallet and running this demo requires the installed app with its selected Sidecars.</p><a class="text-button" href="#/docs/dependencies">See the required components ↗</a></div></details>`;
  const provider=statuses.find(s=>s.id==='latch'),wallet=provider?.wallet,f=forms[formKey]||forms.checkout;
  return `${recipientTools(formKey,record)}${record&&(record.sender||record.walletPubkey)!==wallet?.walletPubkey?`<div class="notice-card"><b>This saved run uses a different wallet</b><p>Recorded sender: <code>${esc(record.sender||record.walletPubkey)}</code>. Selecting a wallet does not change a saved request. Resume with its original wallet, or start a new run. Its history is retained.</p></div>`:''}<details class="panel wallet-panel" data-disclosure="wallet-${formKey}" ${wallet?.connected?'':'open'}><summary><strong>Wallet & test funds</strong><span class="tag">${wallet?.connected?'CONNECTED · DEVNET':'SET UP TO RUN'}</span></summary><div class="wallet-content">

    ${['devnet-test-wallet','device-wallet'].includes(provider?.providerMode)?`<p>${provider.providerMode==='device-wallet'?(wallet?.external?'Your external wallet keeps its private key. Each payment needs its approval.':'Your selected devnet wallet is saved on this device. Back it up before clearing app data.'):'This temporary wallet is for devnet test SOL. Its key stays in this app process and is lost when you close or reload it.'}</p>
    ${wallet?.connected?`<code class="wallet-address">${esc(wallet.walletPubkey)}</code><div class="actions">${button('copy-wallet','Copy address')}${button('wallet-balance','Check balance')}${button('self-recipient','Use my address as recipient',{id:formKey})}<a class="button" href="https://faucet.solana.com/" target="_blank" rel="noopener noreferrer">Get test SOL ↗</a></div>${walletBalance?.walletPubkey===wallet.walletPubkey?`<p>Last observed balance: <b>${sol(walletBalance.value)} devnet SOL</b></p>`:''}`:button('wallet-connect',provider.providerMode==='device-wallet'?'Create saved devnet wallet':'Create temporary wallet',{primary:true})}<a class="button" href="#/wallets">Manage wallets ↗</a>`:
    `<p>Use the external wallet configured in Latch. Wallet approval and sending remain separate steps.</p><label>Wallet public address<input name="walletPubkey" value="${esc(f.walletPubkey||'')}" data-form-key="${formKey}" autocomplete="off"></label>`}
    <div class="actions">${button('rpc-settings','Connection settings')}</div>${technical('funding-'+formKey,'About test funds and self-transfers','<p>Fund the sender using the devnet faucet. Tiny transfers need a recipient that already has a devnet balance. Sending to your own address records a self-transfer; it does not pay another person. Network fees are additional.</p>')}
  </div></details>`;
}
function activityPanel(d){
 const events=relevantEvents(lab,d,selected);
 return `<section class="panel how-it-works"><span class="eyebrow">REUSABLE INFRASTRUCTURE</span><h2>How this works</h2><p>${PREVIEW?'The installed app connects these reusable components.':'Each step uses the same reusable Sidecar APIs an app can integrate.'}</p>${componentExplanation(d.components)}${eventInspector(events,'activity-'+d.id)}<div class="journey-next">${nextDemo(d.id)}</div></section>`;
}
function paymentView(d){
 const p=selected[d.id]?lab.state.payments.find(p=>p.id===selected[d.id]):lab.latest(d.id),f=forms[d.id],sim=d.id==='recovery';
 const rows=lab.state.payments.filter(x=>x.kind===d.id),connected=statuses.find(s=>s.id==='latch')?.wallet?.connected;
 return `${head(d)}<div class="demo-layout"><div>${sim?'':walletPanel(d.id,p)}<section class="panel" id="${d.id}-request"><div class="panel-header"><h2>${d.id==='treasury'?'Community grant':sim?'Missing reply rehearsal':'Icon pack checkout'}</h2>${p?status(p.state):`<span class="tag">${sim?'ARENA':'DEVNET'}</span>`}</div>
 ${!p?`${d.id==='checkout'?'<div class="product"><div class="product-art">'+icon('bag',28)+'</div><div><strong>Independent creator icon pack</strong><p>Fictional purchase · demonstrates payment confirmation</p></div></div>':''}<form data-form="payment">${f.setupNote?`<p class="notice-card" role="status">${esc(f.setupNote)}</p>`:''}<div class="form-grid"><label>Amount · ${sim?'demo':'devnet'} SOL<input name="amount" inputmode="decimal" value="${esc(f.amount)}" required data-form-key="${d.id}"></label><label>Network<input value="${sim?'Arena simulation':'Solana devnet'}" disabled></label><label class="full">Recipient address<input name="recipient" value="${esc(f.recipient)}" spellcheck="false" required data-form-key="${d.id}"><span class="hint">${sim?'Illustrative address; no transfer occurs.':'Enter a valid devnet account address. You will review the exact amount and address before signing.'}</span></label></div>${!sim&&connected?button('self-recipient','Use my wallet for a self-transfer',{id:d.id}):''}<div class="actions"><button class="button primary" type="submit" ${lab.busy?'disabled':''}>${sim?'Prepare recovery rehearsal':d.id==='treasury'?'Review grant request':'Review payment'}</button></div><p class="hint">${sim?'No network funds move in this rehearsal.':'Reviewing checks the request. It does not sign or send it.'}</p></form>`:paymentDetail(p,d)}</section>
 ${sim?'<section class="panel subtle"><h3>Try returning after a refresh.</h3><p>After the missing reply, use Check existing attempt. It observes the original simulated execution without creating another payment.</p></section>':''}
 ${runHistory({kind:d.id,rows,activeId:p?.id,page:historyPages[d.id],lab})}</div><aside>${activityPanel(d)}<section class="panel"><h3>${d.id==='treasury'?'What the team review proves':'What the result proves'}</h3><p>${d.id==='treasury'?'Two distinct local reviewer labels have approved this exact request. These simulated reviewers are not authenticated people or threshold signers. Latch handles the separate wallet approval.':sim?'The same saved attempt can return its simulated result after a missing response. Arena does not move network funds.':'A devnet receipt ties an observed transfer to its reviewed amount and recipient. This fictional shop does not deliver a real icon pack.'}</p><a class="text-button" href="#/receipts">Open receipt book ↗</a></section></aside></div>`;
}
function paymentDetail(p,d={id:p.kind}){
 const op=p.operation,receipt=op?.receipt,q=p.request,sim=(p.network||'demo')==='demo',historical=!lab.compatiblePayment(p),view=paymentPresentation(p),terminal=['confirmed','finalised','failed','blocked','rejected','expired'].includes(p.state);
 const canObserve=!historical&&['submitting','submitted','unknown','authority-pending','confirmed','finalised','failed'].includes(p.state);
 const explorer=op?.signature&&!sim&&['submitting','submitted','unknown','confirmed','finalised','failed'].includes(p.state);
 const issue=op?.recoveryError?.message||p.error,requestPaid=p.requestId&&lab.request(p.requestId).verification?.paid;
 return `${historical?'<div class="notice-card"><b>Previous demo operation · retained history</b><p>This is an earlier simulation, kept for inspection. It cannot become a devnet payment. Start a new request to use the current network.</p></div>':paymentJourney(p)}
 <div class="payment-review"><div class="payment-amount">${esc(paymentAmount(p))} <small>· ${sim?'demo':'devnet'}${op?.feeLamports!=null?' + '+sol(op.feeLamports)+' SOL fee':''}</small></div><dl class="meta-list">${!sim?`<div><dt>Saved sender</dt><dd><code>${esc(p.walletPubkey)}</code></dd></div>`:''}<div><dt>Recipient</dt><dd><code>${esc(p.recipient)}</code></dd></div>${op?.preflight?`<div><dt>Request checks</dt><dd>${op.preflight.allowed?'Passed':'Blocked'}</dd></div>`:''}</dl>${!sim&&op?.sender===p.recipient?'<p class="self-transfer-note">Self-transfer: this records the instruction and memo. It does not pay another account; network fees still apply.</p>':''}</div>
 ${p.evidence?`<div class="notice-card"><b>Scaled simulation evidence</b><p>${sol(p.evidence.originalAmountLamports)} nominal SOL ÷ ${p.evidence.divisor.toLocaleString()} = ${sol(p.amountLamports)} devnet SOL. This proves only the small transfer and its link to the Arena result, not a market trade.</p></div>`:''}
 ${!historical&&d.id==='treasury'&&q?`<div class="team-review"><h3>${q.approvals?.length||0} of 3 team reviews recorded</h3><p class="hint">Two different simulated reviewers are required for this request.</p><div class="member-grid">${['ari','bo','cy'].map(m=>{const approved=q.approvals?.some(a=>a.memberId===m);return `<div class="member ${approved?'approved':''}"><strong>${m}</strong><small>Simulated reviewer</small>${button('member-'+m,approved?'✓ Recorded':'Record approval',{id:p.id,disabled:approved||p.state!=='preflighted'})}</div>`;}).join('')}</div></div>`:''}
 ${issue?`<div class="pending-note" role="alert"><strong>${view.ready?'Receipt available · local tracking needs attention':'This step needs attention'}</strong>${view.ready?(String(issue).includes('evidenceDigest')?'The transfer has a matching receipt. A Sidecar update is needed to finish its local tracking record. Keep or export the receipt; do not pay again.':'The transfer has a matching receipt, but local tracking could not finish. Keep the receipt and refresh its status when the connection is ready; do not pay again.'):esc(issue)}${technical('error-'+p.id,'Technical error details',dataBlock({error:issue,code:op?.recoveryError?.code}))}</div>`:''}
 ${requestPaid&&!view.ready?'<div class="notice-card"><b>This request already has a verified payment</b><p>Signing and sending this preparation are disabled. Any existing submitted attempt remains available for reconciliation.</p></div>':''}
 ${receipt?receiptSummary(p):''}
 <div class="actions">${historical?button('payment-export','Export saved operation',{id:p.id})+button('new-payment','New devnet payment',{id:d.id,primary:true}):''}${!historical&&!requestPaid&&p.state==='expired'&&!p.replacementPaymentId?button('refresh-payment','Refresh expired review',{id:p.id,primary:true}):''}${p.replacementPaymentId?button('open-record','Open refreshed payment',{id:p.replacementPaymentId,primary:true}):''}${!historical&&!requestPaid&&['preparing','prepared'].includes(p.state)?button('review','Continue review',{id:p.id,primary:true}):''}${!historical&&!requestPaid&&p.state==='preflighted'?button('approve',sim?'Approve demo request':'Sign reviewed transfer',{id:p.id,primary:true,disabled:d.id==='treasury'&&!q?.quorumReached}):''}${!historical&&!requestPaid&&p.state==='authorised'?button('submit',sim?'Simulate execution & lose reply':'Send signed transfer',{id:p.id,primary:true}):''}${canObserve?button('reconcile',view.ready?'Refresh receipt':sim?'Check existing attempt':'Check for receipt',{id:p.id,primary:!view.ready}):''}${receipt?button('receipt','Export receipt',{id:p.id,primary:view.ready}):''}${explorer?`<a class="button" href="https://explorer.solana.com/tx/${encodeURIComponent(op.signature)}?cluster=devnet" target="_blank" rel="noopener noreferrer">View on Solana Explorer ↗</a>`:''}${!historical&&terminal&&!['evidence','tokens','requests',...CONNECTED].includes(d.id)?button('new-payment','Start another '+(sim?'rehearsal':'payment'),{id:d.id}):''}</div>
 ${technical('operation-'+p.id,'Transaction details & evidence',`<dl class="meta-list"><div><dt>Operation ID</dt><dd><code>${esc(p.id)}</code></dd></div><div><dt>Network</dt><dd>${sim?'Arena simulation':'Solana devnet'}</dd></div></dl>${receipt?technical('receipt-'+p.id,'Raw receipt',json(receipt)):''}${op?technical('raw-operation-'+p.id,'Operation and policy',json(op)):''}`)}`;
}
const money=value=>Number.isFinite(value)?'$'+value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
function updateMarketView(){
 if(!lab)return;
 if(!market){const note=$('[data-market-note]');if(note)note.textContent=marketError||'Market Pulse is unavailable. Payments remain available.';const open=$('[data-form=position] button[type=submit]');if(open)open.disabled=true;return;}
 let q;try{q=market.quote({id:'So11111111111111111111111111111111111111112'});}catch{q={available:false,stale:true};}
 const live=q.available&&!q.stale;
 const entry=$('[data-market-entry]');if(entry)entry.value=live?money(q.price):q.available?'Price is stale':'Waiting for SOL price';
 const current=$('[data-market-current]');if(current)current.textContent=q.available?money(q.price):'—';
 const interval=$('[data-market-interval]');if(interval)interval.textContent=market.configuration().candleMs/1000+' seconds';
 const note=$('[data-market-note]');if(note)note.textContent=live?'Live price observations · simulated execution':q.available?'Price is stale. New actions wait for a fresh observation.':'Open Market settings to configure the price feed. New actions wait for a current price.';
 const open=$('[data-form=position] button[type=submit]');if(open)open.disabled=lab.busy||!live;
 for(const p of lab.state.positions){const m=lab.positionMetrics(p),el=content.querySelector('[data-position-metrics="'+p.id+'"]');if(el){el.querySelector('[data-unrealised]').textContent=money(m.unrealised);el.querySelector('[data-unrealised]').className=m.unrealised>=0?'market-positive':'market-negative';el.querySelector('[data-realised]').textContent=money(m.realised);el.querySelector('[data-position-mark]').textContent=money(m.mark);el.querySelector('[data-price-state]').textContent=m.legacy?'Legacy fixed-price fixture':m.stale?'Price stale · updates paused':'Live sampled price · simulated P&L';}
   for(const action of ['position-reduce','position-close']){const b=content.querySelector('[data-action="'+action+'"][data-id="'+p.id+'"]');if(b)b.disabled=lab.busy||!m.legacy&&m.stale;}
 }
}
function positionsView(d){return `${head(d)}<div class="demo-layout"><div><section class="panel"><div class="panel-header"><div class="eyebrow">LIVE MARKET · ARENA EXECUTION</div><span class="tag">SOL / USD</span></div><h2>Open a simulated SOL position</h2><p>Open with the latest observed SOL price. Watch simulated P&L change, then reduce or close the position and inspect its recorded lifecycle.</p><div class="market-stat-row"><div><small>CURRENT SOL PRICE</small><strong data-market-current>—</strong></div><div><small>CANDLES</small><strong data-market-interval>15 seconds</strong></div><div><small>EXECUTION</small><strong>Arena</strong></div></div><p class="market-status-note" data-market-note>Connecting the price feed…</p><form data-form="position"><div class="form-grid"><label>Size · simulated SOL units<input name="units" type="number" min="1" max="10000" step="1" value="${esc(forms.positions.units)}" data-form-key="positions" required></label><label>Observed entry · USD<input class="market-entry-input" data-market-entry value="Waiting for a price" disabled></label></div><div class="actions"><button class="button primary" type="submit" disabled>Open simulated position ${icon('arrow',15)}</button><button class="button" type="button" data-action="market-settings">Market settings</button></div></form><div class="notice-card">Prices are market observations. Execution and P&L are simulated, with no fees, slippage or leverage. Each action freezes its observed price for safe recovery.</div></section><section class="panel"><div class="panel-header"><h2>Your positions</h2><span class="tag">${lab.state.positions.length} RECORDS</span></div>${lab.state.positions.length?`<div class="record-list">${[...lab.state.positions].reverse().map(p=>{const job=p.jobs.find(j=>!j.done),m=lab.positionMetrics(p);return `<article class="record"><div class="row"><h3>${esc(p.market)} · long</h3>${status(p.state)}</div><p><code>${esc(short(p.id))}</code> · ${p.position?.size??p.units} simulated units · entry ${money(m.entry)}</p><div data-position-metrics="${esc(p.id)}"><div class="market-stat-row"><div><small>MARK</small><strong data-position-mark>—</strong></div><div><small>UNREALISED P&L</small><strong data-unrealised>—</strong></div><div><small>REALISED P&L</small><strong data-realised>—</strong></div></div><small data-price-state></small></div><dl class="meta-list"><div><dt>Execution bucket</dt><dd>${esc(p.rail?.state||'Not allocated')}</dd></div><div><dt>Recorded actions</dt><dd>${p.jobs.length}</dd></div></dl>${job?.error?`<div class="notice-card">${esc(job.error)}</div>`:''}<div class="actions">${job?button('position-resume','Resume recorded action',{id:p.id,primary:true}):p.state==='open'?button('position-reduce','Reduce by half',{id:p.id})+button('position-close','Close position',{id:p.id,primary:true}):'<span class="tag">BUCKET REUSABLE</span>'}</div>${technical('position-'+p.id,'Lifecycle, prices and evidence',json(p))}</article>`;}).join('')}</div>`:'<div class="empty">Your first position starts with a current price observation.</div>'}</section><details class="panel optional-evidence" data-disclosure="position-evidence"><summary>Optional: link an Arena result to a devnet receipt</summary><p>Record a small, separate test transfer as evidence of this simulation. It does not execute the simulated trade.</p>${walletPanel('positions')}${evidencePanel()}</details></div><aside>${activityPanel(d)}<section class="panel"><h3>Keep the identities separate.</h3><p>The position, execution bucket and operation keep their own identity. A devnet evidence transfer is a separate reviewed action.</p></section></aside></div>`;}
function evidencePanel(){const positions=lab.state.positions.filter(p=>p.jobs.some(j=>j.done));return `<section class="panel" id="position-evidence"><div class="eyebrow">OPTIONAL DEVNET EVIDENCE</div><h2>A small transfer. A linked record.</h2><button type="button" class="button" data-guide-start="anchor-position-evidence" ${PREVIEW?'disabled':''}>Record with Guide</button><p>Commit an Arena result with a transfer of 1/10,000 of a nominal SOL amount you choose. The simulation and the on-chain transfer remain separate records.</p>
 ${positions.length?`<form data-form="evidence"><label>Arena position<select name="positionId" data-form-key="positions">${positions.map(p=>`<option value="${esc(p.id)}" ${forms.positions.positionId===p.id?'selected':''}>${short(p.id)} · ${esc(p.state)}</option>`).join('')}</select></label><label>Nominal SOL amount<input name="amount" value="${esc(forms.positions.amount)}" data-form-key="positions" inputmode="decimal" required><span class="hint">0.1 SOL becomes 0.00001 devnet SOL, plus fees. This is independent of the simulated position size and USD price.</span></label><label>Devnet recipient address<input name="recipient" value="${esc(forms.positions.recipient)}" data-form-key="positions" required></label><button class="button primary" type="submit" ${lab.busy?'disabled':''}>Review evidence transfer</button></form>`:'<p>Complete an Arena position action first.</p>'}
 ${lab.state.payments.filter(p=>p.kind==='evidence').slice().reverse().sort((a,b)=>Number(b.id===selected.evidence)-Number(a.id===selected.evidence)).slice(0,4).map(p=>`<details data-disclosure="evidence-${p.id}" ${selected.evidence===p.id?'open':''}><summary>Evidence transfer · ${sol(p.amountLamports)} devnet SOL · ${esc(stateLabel(p.state))}</summary>${paymentDetail(p)}<button type="button" class="button" data-guide-resume="anchor-position-evidence" data-guide-record="${esc(p.id)}" ${PREVIEW?'disabled':''}>Continue this evidence with Guide</button></details>`).join('')}</section>`;}

function policyView(d){const f=forms.policy,result=lab.state.policy?.result;return `${head(d)}<div class="demo-layout"><section class="panel"><div class="panel-header"><h2>Try a request against the limits</h2>${result?status(result.allowed?'passed':'rejected'):''}</div><p>Choose an example, then run the checks. You can adjust the request without changing the configured policy.</p><div class="scenario-presets" aria-label="Example policy requests">${button('policy-example','Normal request',{id:'normal'})}${button('bad-policy','Excessive fee')}${button('policy-example','Stale request',{id:'stale'})}${button('policy-example','High risk',{id:'risk'})}</div><form data-form="policy"><div class="form-grid"><label>Requested action<select name="action" data-form-key="policy">${[['open','Open position'],['reduce','Reduce position'],['close','Close position'],['hold','Hold / no execution']].map(([v,t])=>`<option value="${v}" ${f.action===v?'selected':''}>${t}</option>`).join('')}</select></label><label>Amount · demo SOL<input name="amount" value="${esc(f.amount)}" inputmode="decimal" data-form-key="policy" required></label></div>${technical('policy-inputs','Adjust fees, risk and freshness',`<div class="form-grid"><label>Fee · lamports<input name="fee" type="number" min="0" max="10000000" value="${esc(f.fee)}" data-form-key="policy" required><span class="hint">Ceiling: 100,000 lamports (0.0001 SOL)</span></label><label>Slippage · basis points<input name="slippage" type="number" min="0" max="10000" value="${esc(f.slippage)}" data-form-key="policy" required><span class="hint">Ceiling: 500 bps (5%)</span></label><label>Declared risk<select name="risk" data-form-key="policy">${['low','medium','high'].map(v=>`<option ${f.risk===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Request age · seconds<input name="age" type="number" min="0" max="3600" value="${esc(f.age)}" data-form-key="policy" required><span class="hint">Freshness limit: 300 seconds</span></label></div>`)}<div class="actions"><button class="button primary" type="submit" ${lab.busy?'disabled':''}>Check policy ${icon('shield',15)}</button></div></form>${result?`<div class="outcome-card policy-verdict ${result.allowed?'success':'attention'}"><span class="outcome-icon">${result.allowed?'✓':'!'}</span><div><h3>${result.allowed?'This request passes the configured checks':'This request is blocked'}</h3><p>${esc(explainPolicy(lab.state.policy))}</p></div></div><div class="check-list">${result.checks.map(c=>`<div class="check ${c.pass?'':'fail'}"><span>${c.pass?'✓':'×'} ${esc(c.id)}</span><small>${esc(c.detail)}</small></div>`).join('')}</div>${technical('policy-result','Policy inputs and raw result',json(lab.state.policy))}`:'<div class="empty">Run the policy to see the decision and its reasons.</div>'}</section><aside>${activityPanel(d)}<section class="panel"><h3>Where the check stops</h3><p>This playground reviews supplied metadata against configured limits. It does not decode a real transaction or grant wallet authority. Checkout uses the separate transfer preflight.</p></section></aside></div>`;}
function networkView(d){
 const info=statuses.find(s=>s.id==='conduit'),error=networkResult?.error||info?.lastRequestError||info?.error;
 return `${head(d)}<div class="demo-layout"><section class="panel"><div class="panel-header"><h2>Check your payment connection</h2><span class="tag">${info?.connectionVerified?'DEVNET VERIFIED':info?.ready?'CONFIGURED · CHECK CONNECTION':'NEEDS SETUP'}</span></div>
 <p>These checks use the same Conduit Sidecar as checkout, treasury and evidence transfers.</p><dl class="meta-list"><div><dt>Network</dt><dd>${esc(info?.network||'Unknown')}</dd></div><div><dt>Endpoint</dt><dd><code>${esc(info?.endpointOrigin||'Not configured')}</code></dd></div><div><dt>Client token</dt><dd>${info?.clientTokenConfigured?'Configured':'None configured'}</dd></div><div><dt>Settings</dt><dd>${esc(info?.settingsSource||'build')}</dd></div></dl>
 <div class="actions">${button('rpc-verify','Verify devnet',{primary:true,disabled:!info?.ready})}${button('rpc-settings','Connection settings')}${button('rpc-version','Node version',{disabled:!info?.ready})}${button('rpc-slot','Current slot',{disabled:!info?.ready})}${button('rpc-height','Block height',{disabled:!info?.ready})}${button('refresh-status','Refresh status')}</div>
 ${error?`<div class="notice-card" role="alert"><b>Connection check failed</b><p>${esc(errorDetails(error).message)}</p><small>${esc(errorDetails(error).code)}</small></div>`:''}
 ${networkResult&&!networkResult.error?`<div class="network-result"><div class="row"><strong>${esc(networkResult.method)}</strong><small>${new Date(networkResult.at).toLocaleTimeString()}</small></div><p>${esc(networkResult.method==='getGenesisHash'?'The configured connection returned its devnet chain identity.':networkResult.method==='getVersion'?'The RPC node responded with its software version.':networkResult.method==='getSlot'?'The connection returned the current slot.':'The connection returned its current block height.')}</p>${technical('network-result','Returned RPC data',json(networkResult.result))}</div>`:'<div class="empty">Choose a connection check. Reads do not submit a transaction.</div>'}
 <p>Conduit owns endpoint and client-token settings. Change them there without recreating your wallet. Network and write permissions stay fixed by the build.</p></section><aside>${activityPanel(d)}<section class="panel"><h3>Separate mainnet reads.</h3><p>${info?.readConnection?.configured?'A separate read-only endpoint is configured in Conduit. Open its settings → Connection checks to inspect it.':'Conduit can hold a separate read-only endpoint in its advanced settings.'}</p><p>That connection cannot submit a transaction or change the devnet payment network. Nothing polls automatically.</p></section></aside></div>`;
}
function componentsView(){const columns=[['INTENT & COORDINATION',['compass','circuit','switchyard']],['POLICY & AUTHORITY',['sentinel','accord','latch']],['EXECUTION',['edge','dispatch','arena']],['OBSERVATION & NETWORK',['witness','conduit','market']]];return `<header class="page-head"><div><div class="eyebrow">THE COMPONENT LIBRARY</div><h1>Twelve parts. Clear responsibilities.</h1><p>Explore the components behind every demo. Each owns one responsibility and can be integrated independently when its provider requirements are met. Edge coordinates a compatible payment stack.</p></div>${button('refresh-status','Refresh status')}</header><capp-solana-map></capp-solana-map><div class="stack-map">${columns.map(([title,names])=>`<div class="stack-column"><strong>${title}</strong>${names.map(n=>`<div class="stack-node">${COMPONENTS.find(c=>c.id===n).name}<span>${PREVIEW?'○ INSTALLED APP':statuses.find(s=>s.id===n)?.ready?'● READY':'○ SETUP'}</span></div>`).join('')}</div>`).join('')}</div><div class="component-grid">${COMPONENTS.map(c=>{const s=statuses.find(s=>s.id===c.id);return `<article class="component-card"><div class="row"><h3>${c.name}</h3>${status(PREVIEW?'preview':s?.ready?'ready':'setup')}</div><div class="eyebrow">${c.role}</div><p>${c.description}</p><div class="used-in">Used in ${DEMOS.filter(d=>d.components.includes(c.id)).map(d=>`<a href="#/${d.id}">${esc(d.name)}</a>`).join(', ')||'Position studio and the Market chart'}</div><details><summary>Scope & limitations</summary><p>${c.limit}</p></details><details><summary>Runtime status</summary>${json(s||{ready:false})}</details></article>`;}).join('')}</div>`;}
function receiptsView(){
 const rows=lab.receipts(),events=[...lab.state.events].reverse(),payments=lab.state.payments,pending=payments.filter(p=>lab.compatiblePayment(p)&&!receiptReady(p));
 return `<header class="page-head"><div><div class="eyebrow">EVIDENCE YOU CAN INSPECT</div><h1>Receipts & activity</h1><p>${PREVIEW?'Running a demo in the installed app creates its own record here. No results are fabricated in this preview.':'See what completed, what still needs attention and what each result establishes. Records stay on this device.'}</p></div>${button('export','Export evidence')}</header><div class="stats-grid"><div class="stat"><small>PAYMENT RECEIPTS READY</small><strong>${payments.filter(receiptReady).length}</strong></div><div class="stat"><small>OPERATIONS TO REVIEW</small><strong>${pending.length}</strong></div><div class="stat"><small>ALL RETAINED RECEIPTS</small><strong>${rows.length}</strong></div></div>
 ${pending.length?`<section class="panel"><div class="panel-header"><h2>Continue a saved operation</h2></div><div class="history-list">${pending.slice().reverse().map(p=>`<button type="button" class="history-record" data-action="open-record" data-id="${esc(p.id)}"><span><strong>${esc(DEMOS.find(d=>d.id===paymentRoute(p))?.name||'Arena evidence transfer')}</strong><small>${esc(paymentAmount(p))} · ${p.network==='devnet'?'devnet':'demo'} · ${esc(dateLabel(p.createdAt))}</small></span><span><b>${esc(stateLabel(p.state))}</b><small>Open this operation →</small></span></button>`).join('')}</div></section>`:''}
 <section class="panel"><div class="panel-header"><h2>Receipt book</h2><span class="tag sim-tag">NETWORK LABELLED EVIDENCE</span></div>${rows.length?`<div class="receipt-book">${rows.slice().reverse().map(r=>{const p=payments.find(p=>p.id===r.operationId),kind=p?.kind,view=p?receiptSummary(p):`<p>${r.simulated?'Arena simulation only; no network transfer.':'Retained evidence; inspect its original scope before using it.'}</p>`;return `<article class="receipt-record"><div class="row"><div><h3>${esc(DEMOS.find(d=>d.id===(p?paymentRoute(p):kind))?.name||'Arena position action')}</h3><small>${esc(dateLabel(r.createdAt))}</small></div>${status(r.observedState||r.finality)}</div>${view}<div class="actions">${p?button('open-record','Open original workflow',{id:p.id})+button('receipt','Export receipt',{id:p.id}):'<a class="button" href="#/positions">Open Position studio</a>'}${!r.simulated&&r.network==='devnet'&&r.signature?`<a class="text-button" href="https://explorer.solana.com/tx/${encodeURIComponent(r.signature)}?cluster=devnet" target="_blank" rel="noopener noreferrer">Solana Explorer ↗</a>`:''}</div>${technical('book-'+r.operationId,'Receipt details',json(r))}</article>`;}).join('')}</div>`:`<div class="empty">${icon('receipt',27)}${PREVIEW?'Use the installed app to create your first receipt.':'No receipts yet. Start with checkout for a reviewed transfer, or Missing reply for an offline rehearsal.'}<div class="actions"><a class="button" href="#/checkout">Open checkout</a><a class="button" href="#/recovery">Try recovery</a></div></div>`}</section>
 ${lab.state.paymentRequests.some(r=>r.verification?.paid)?`<section class="panel"><div class="panel-header"><h2>Independently verified requests</h2><span class="tag">RECIPIENT CREDIT</span></div><p>These finalized observations bind saved request terms to actual recipient credit. They do not record merchant fulfillment.</p><div class="history-list">${lab.state.paymentRequests.filter(r=>r.verification?.paid).slice().reverse().map(r=>`<button class="history-record" data-action="request-open" data-id="${esc(r.id)}"><span><strong>${esc(r.terms.label||r.id)}</strong><small>${esc(paymentAmount(r.terms))} · devnet</small></span><span>Verified<small>${esc(shortId(r.verification.signature))}</small></span></button>`).join('')}</div></section>`:''}
 <section class="panel"><h2>How to read this evidence</h2><p>A devnet receipt describes a test-network transaction. An Arena receipt describes a simulation. A document fingerprint proves matching bytes, not ownership or truth. Export records before changing devices or clearing storage.</p>${eventInspector(events,'receipt-events')}</section>`;
}
function setupView(){return `<section class="panel"><div class="eyebrow">SETUP REQUIRED</div><h1>Let’s reconnect the components.</h1><p>${esc(bootError||'Connecting the selected Sidecars…')}</p><div class="actions"><button class="button primary" data-action="retry-boot">Retry</button><button class="button" data-action="raw-backup">Export local lab records</button><a class="button" href="#/docs">Read setup guide</a></div></section>`;}
function walletDraftActive(){
  if(route()!=='wallets'||walletManager.busy)return false;
  // Keep native file inputs and private form fields in their existing DOM.
  // We only detect unfinished input; none is copied into application state.
  for(const form of content.querySelectorAll('[data-wallet-form]')){
    if(form.contains(document.activeElement))return true;
    for(const el of form.querySelectorAll('input,textarea,select')){
      if(el.type==='file'){if(el.files?.length)return true;continue;}
      if(el.type==='checkbox'||el.type==='radio'){if(el.checked!==el.defaultChecked)return true;continue;}
      if(el.tagName==='SELECT'){if([...el.options].some(o=>o.selected!==o.defaultSelected)&&el.value)return true;continue;}
      if(el.value!==el.defaultValue)return true;
    }
  }
  return false;
}
function render(background=false){
 if(background===true&&walletDraftActive())return;
 const active=document.activeElement;
 const focus=active&&content.contains(active)?{name:active.name,formKey:active.dataset.formKey,payoutIndex:active.dataset.payoutIndex,payoutField:active.dataset.payoutField,action:active.dataset.action,id:active.dataset.id,selection:active.selectionStart}:null;
 content.querySelectorAll('details[data-disclosure]').forEach(el=>disclosures.set(renderedRoute+':'+el.dataset.disclosure,el.open));
 nav();const r=route(),d=DEMOS.find(d=>d.id===r);if(!PREVIEW&&ready&&market&&r==='positions'&&!releasePositionFeed){releasePositionFeed=()=>{};releasePositionFeed=market.acquire('position-studio');}else if(r!=='positions'&&releasePositionFeed){releasePositionFeed();releasePositionFeed=null;}
content.innerHTML=r==='gallery'?gallery():r==='guided'?guidedView({error:guideError}):r==='docs'?docsView(routePath().split('/')[1]):r==='components'?componentsView():r==='wallets'?walletManager.html():!ready?setupView():CONNECTED.includes(r)?workflowView(d,{lab,forms,selected,head,walletPanel,activityPanel,paymentDetail,button,json,short,sol,historyPages}):CAPABILITY_DEMOS.some(d=>d.id===r)?capabilityView(d,{lab,forms,selected,head,button,paymentDetail,statuses,payerSetup,recipientTools}):r==='receipts'?receiptsView():['checkout','treasury','recovery'].includes(r)?paymentView(d):r==='positions'?positionsView(d):r==='policy'?policyView(d):networkView(d);renderedRoute=r;content.setAttribute('aria-busy',String(!!lab?.busy||walletManager.busy||formBusy));
 if(r==='wallets')walletManager.bind(content);
 if(formBusy)content.querySelectorAll('button,input,textarea,select').forEach(b=>b.disabled=true);
 content.querySelectorAll('details[data-disclosure]').forEach(el=>{const key=r+':'+el.dataset.disclosure;if(disclosures.has(key))el.open=disclosures.get(key);});
 updateMarketView();marketPanel?.refresh();applyPreviewPresentation();
 if(focus){const target=[...content.querySelectorAll('input,textarea,button,select')].find(el=>focus.name?el.name===focus.name&&el.dataset.formKey===focus.formKey:focus.action&&el.dataset.action===focus.action&&el.dataset.id===focus.id);if(target&&!target.disabled){target.focus({preventScroll:true});if(typeof focus.selection==='number')try{target.setSelectionRange(focus.selection,focus.selection);}catch{}}}
} 
function change(){if(!ready)return;if(lab.busy){content.setAttribute('aria-busy','true');content.querySelectorAll('button').forEach(b=>b.disabled=true);return;}render();}
async function scopedCall(component,method,input,scope){
  requireRuntime();
  if(scope==='recovery'){if(!recovery)recovery=await createRehearsal('recovery');return recovery.call(component,method,input);}
  if(component==='market'&&['status','quote','candles'].includes(method)){if(!market)throw Error(marketError||'Market Pulse is unavailable.');return market[method](input);}
  return directCall(runtime.api,component,method,input);
}
async function action(name,id){
  if(PREVIEW){notify(PREVIEW_REASON);return;}
  if(name==='retry-boot'){await startLab();return;}
  if(name==='raw-backup'){const records={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith('capp.solana-lab.v1:')||k.startsWith('capp.solana-lab.wallet-roles.v1:'))records[k]=localStorage.getItem(k);}download('solana-lab-raw-records.json',{records});return;}
  if(!lab||lab.busy||walletManager.busy||formBusy)return;
  try {
    if(name==='demo-defaults'){await fillDemoDefaults(lab,id,forms[id]);statuses=await lab.statuses();render();notify('Empty fields filled. Review the visible values before continuing.');return;}
    if(name==='prepare-demo-wallets'){
      if(!draftForms()[id])throw Error('Open a new draft to change its wallets. The saved run stays unchanged.');
      await lab.run(()=>ensureDemoWalletPair(lab));await refreshWalletContext();notify('Payer and receiver are prepared. Review their addresses and test funds before continuing.');return;
    }
    if(name==='use-demo-receiver'){
      if(!draftForms()[id])throw Error('Open a new draft to change its receiver.');
      const roles=await readDemoWalletRoles(lab);if(!roles.receiver)throw Error(roles.receiverIssue||'Prepare or choose a receiver in Wallets.');
      if(roles.receiver.suggested)await setDemoReceiver(lab,{walletId:roles.receiver.walletId});
      const rows=id==='batch'?forms.batch.items:[forms[id]];rows.forEach(row=>{row.recipient=roles.receiver.walletPubkey;row.demoRecipient=roles.receiver.walletPubkey;});
      await refreshWalletContext();notify('Receiver applied to this draft. Review the address before saving.');return;
    }
    if(name==='history-open'){const [kind,record]=id.split(':');selected[kind]=record;render();content.focus({preventScroll:true});window.scrollTo({top:0,behavior:'auto'});return;}
    if(name==='history-page'){const [kind,page]=id.split(':');historyPages[kind]=Math.max(0,Number(page)||0);render();return;}
    if(name==='open-record'){const p=lab.payment(id);if(p.kind==='evidence'){selected.evidence=p.id;disclosures.set('positions:position-evidence',true);disclosures.set('positions:evidence-'+p.id,true);}if(p.parentId){selected[p.kind]=p.parentId;selected[p.parentId]=lab.workflow(p.parentId).items.find(i=>i.operationId===p.id)?.id;}else selected[paymentRoute(p)]=p.requestId||p.id;location.hash='/'+paymentRoute(p);render();return;}
    if(name==='assets-refresh'){await lab.inspectAssets();render();return;}
    if(name==='payment-setup'){
      const row=id==='requests'?(lab.state.paymentRequests.find(r=>r.id===selected.requests)||lab.state.paymentRequests.at(-1)):null;
      const p=id==='tokens'&&selected.tokens!=='new'?(lab.state.payments.find(p=>p.id===selected.tokens)||lab.latest('token')):null;
      await lab.checkPaymentSetup(row?{assetKind:row.terms.asset.kind,mint:row.terms.asset.mint||''}:p?{assetKind:p.asset.kind,mint:p.asset.mint||''}:{assetKind:'spl-token',mint:forms.tokens.mint});
      statuses=await lab.statuses();render();return;
    }
    if(name==='funding-sol'||name==='funding-usdc'){const result=await openFundingHandoff({payer:id,mint:name==='funding-usdc'?DEVNET_DEMO_MINT:'',needsSol:name==='funding-sol'});if(!result.opened)notify('In-app tabs are unavailable. Copy the payer address and use the faucet link here.');return;}
    if(name==='token-payer-copy'){await copyFundingPayer(id);notify('Displayed payer address copied. Choose USDC and Solana Devnet at Circle’s faucet.');return;}
    if(name==='token-inspect'){forms.tokens.mint=id;await lab.inspectMint(id);render();return;}
    if(name==='account-activity'){Object.assign(forms.activity,{address:id,network:'devnet'});location.hash='/activity';render();return;}
    if(name==='request-payer-inspect'){await payerSetup.inspect(id);return;}
    if(name==='request-payer-use'){await payerSetup.select(id,payerSetup.current?.requestId===id?payerSetup.current.choice:'');return;}
    if(name==='request-funded-demo'){const result=await payerSetup.newDemo(id);await globalThis.capp?.guide?.cancelWorkflow();await startLabWorkflow('pay-payment-request',{runMode:'resume',recordId:result.requestId});return;}
    if(name==='request-payer-create'){await payerSetup.create(id);return;}
    if(name==='request-payer-copy'){await copyFundingPayer(id);notify('Payer address copied. Use the devnet faucet for the required asset.');return;}
    if(name==='receiver-funding-copy'){await navigator.clipboard.writeText(id);notify('Receiver address copied. Use Solana Devnet at the faucet.');return;}
    if(name==='request-demo-receiver'){await createDemoReceiver(lab,forms.requests,{kind:'requests'});statuses=await lab.statuses();render();return;}
    if(name==='request-new'){await newLabGuidedRun('create-payment-request');selected.requests='new';forms.requests.recipient='';delete forms.requests.demoRecipient;forms.requests.signature='';await refreshWalletContext();render();return;}
    if(name==='request-open'){selected.requests=id;location.hash='/requests';forms.requests.signature=lab.request(id).verification?.signature||'';render();return;}
    if(name==='request-recipient'){await lab.run(async()=>{forms.requests.recipient=await selectedDevnetWallet(lab);delete forms.requests.demoRecipient;});render();return;}
    if(name==='request-export'){download('payment-request-'+id+'.json',lab.request(id).terms);return;}
    if(name==='request-copy'){await navigator.clipboard.writeText(lab.request(id).terms.uri);notify('URI copied. Share the JSON too: network and expiry are not encoded in the URI.');return;}
    if(name==='verification-export'){download('payment-verification-'+id+'.json',lab.request(id).verification);return;}
    if(name==='request-find'){await lab.findRequestPayments(id);render();return;}
    if(name==='request-candidate'){forms.requests.signature=id;render();return;}
    if(name==='request-pay'){const setup=await payerSetup.inspect(id);if(!['ready','done'].includes(setup.stage)){notify(setup.detail);return;}await lab.prepareRequest(id);render();return;}
    if(name==='activity-wallet'){await lab.run(async()=>{Object.assign(forms.activity,{address:await selectedDevnetWallet(lab),network:'devnet'});});render();return;}
    if(name==='activity-more'){const page=lab.state.addressActivity;await lab.loadActivity({address:page.address,network:page.network,more:true});render();return;}
    if(name==='activity-transaction'){await lab.inspectTransaction(id);render();return;}
    if(name==='payout-add'){if(forms.batch.items.length<5)forms.batch.items.push({label:'Contributor '+(forms.batch.items.length+1),recipient:'',amount:'0.00001'});render();return;}
    if(name==='payout-remove'){const n=Number(id);if(forms.batch.items.length>2&&Number.isInteger(n)&&n>=0&&n<forms.batch.items.length)forms.batch.items.splice(n,1);render();return;}
    if(name==='policy-example'||name==='bad-policy'){Object.assign(forms.policy,policyExample(name==='bad-policy'?'fee':id));render();notify('Example loaded. Run Check policy to see the decision.');return;}
    if(name==='workflow-new'){selected[id]='new';render();await refreshWalletContext();return;}
    if(name==='workflow-item'){const [w,i]=id.split(':');selected[w]=i;render();return;}
    if(name==='workflow-prepare'){const [w,i]=id.split(':');await lab.prepareWorkflowPayment(w,i);render();return;}
    if(name==='service-deliver'){await lab.deliverService(id);render();return;}
    if(name==='delivery-anchor'){const proof=await lab.anchorDelivery(id);selected.proof=proof.id;location.hash='/proof';render();return;}
    if(name==='delivery-export'){download('report-'+id+'.json',lab.workflow(id).delivery.artifact);return;}
    if(name==='workflow-export'){const workflow=lab.workflow(id);download('workflow-'+id+'.json',{workflow,payments:workflow.items.map(i=>lab.itemPayment(workflow,i)||null)});return;}
    if(name==='proof-original'){forms.proof.verifyText=lab.workflow(id).text;render();return;}

    if(name==='wallet-connect'){await lab.connectWallet();statuses=await lab.statuses();render();return;}
    if(name==='wallet-balance'){walletBalance=await lab.walletBalance();render();return;}
    if(name==='copy-wallet'){await navigator.clipboard.writeText(statuses.find(s=>s.id==='latch').wallet.walletPubkey);notify('Wallet address copied');return;}
    if(name==='self-recipient'){await lab.run(async()=>{const sender=await selectedDevnetWallet(lab);forms[id].recipient=sender;delete forms[id].demoRecipient;if(id==='batch')forms.batch.items.forEach(item=>{item.recipient=sender;delete item.demoRecipient;});statuses=await lab.statuses();});render();notify('Self-transfer selected: only network fees change your balance.');return;}
    if(name==='market-settings'){if(!marketPanel)throw Error(marketError||'Market Pulse is unavailable. Check its selected settings in cApp.');marketPanel.openSettings();return;}
    if(name==='refresh-market'){connectOptionalMarket();statuses=await lab.statuses();render();return;}
    if(name==='assistant'){await assistant.open();return;}
    if(name==='export'){download('solana-lab-evidence.json',lab.export());return;}
    if(name==='refresh-status'){statuses=await lab.statuses();render();return;}
    if(name==='new-payment'){selected[id]='new';render();await refreshWalletContext();return;}
    if(name==='payment-export'){download('operation-'+id+'.json',lab.payment(id));return;}
    if(name==='rpc-settings'){await directCall(runtime.api,'conduit','openSettings');return;}
    if(name==='receipt'){download('receipt-'+id+'.json',lab.payment(id).operation.receipt);return;}
    if(name.startsWith('rpc-')) {
      const method={'rpc-version':'getVersion','rpc-slot':'getSlot','rpc-height':'getBlockHeight'}[name];
      try{await lab.run(async()=>{const result=name==='rpc-verify'?await lab.call('conduit','verifyNetwork'):await lab.call('conduit','inspect',{method,target:'primary'});networkResult={method:method||'getGenesisHash',result,at:Date.now()};});}
      catch(error){networkResult={error:errorDetails(error),at:Date.now()};throw error;}
      finally{statuses=await lab.statuses();render();}return;
    }
    if(name==='token-receiver'){await createDemoReceiver(lab,forms.tokens);statuses=await lab.statuses();}
    else if(name==='refresh-payment'){try{await lab.refreshPayment(id);}finally{const next=lab.payment(id).replacementPaymentId;if(next)for(const key of Object.keys(selected))if(selected[key]===id)selected[key]=next;}}
    else if(name==='review')await lab.reviewPayment(id);
    else if(name==='approve')await lab.approvePayment(id);
    else if(name==='submit')await lab.submitPayment(id);
    else if(name==='reconcile')await lab.reconcilePayment(id);
    else if(name.startsWith('member-'))await lab.memberApprove(id,name.slice(7));
    else if(name==='position-resume')await lab.resumePosition(id);
    else if(name==='position-reduce')await lab.changePosition(id,'reduce');
    else if(name==='position-close')await lab.changePosition(id,'close');
    render();
  }catch(e){notify(errorDetails(e).message,true);render();}
}
document.addEventListener('click',async e=>{const launch=e.target.closest('[data-guide-start],[data-guide-watch],[data-guide-new],[data-guide-resume]');if(launch&&!launch.disabled){try{await startLabWorkflow(launch.dataset.guideStart||launch.dataset.guideWatch||launch.dataset.guideNew||launch.dataset.guideResume,{auto:!!launch.dataset.guideWatch,runMode:launch.dataset.guideResume?'resume':'new',recordId:launch.dataset.guideRecord});}catch(error){notify(error.message,true);}return;}const b=e.target.closest('[data-action]');if(b&&!b.disabled)action(b.dataset.action,b.dataset.id);});
document.addEventListener('input',e=>{const el=e.target;if(el.dataset.payoutIndex!==undefined&&['label','recipient','amount'].includes(el.dataset.payoutField)){const item=forms.batch.items[Number(el.dataset.payoutIndex)];if(item){item[el.dataset.payoutField]=el.value;if(el.dataset.payoutField==='recipient')delete item.demoRecipient;delete forms.batch.receiverCheck;delete forms.batch.setupNote;}}if(el.dataset.formKey&&el.name){const form=forms[el.dataset.formKey];form[el.name]=el.value;if(el.name==='recipient')delete form.demoRecipient;delete form.receiverCheck;delete form.setupNote;if(el.dataset.formKey==='policy')forms.policy.example=null;}});
document.addEventListener('change',async e=>{const el=e.target;if(el.hasAttribute('data-demo-receiver')){
  if(PREVIEW||!lab||lab.busy||walletManager.busy||formBusy||!el.value)return;
  const kind=el.dataset.demoReceiver;if(!draftForms()[kind])return;
  try{await lab.run(()=>setDemoReceiver(lab,{walletId:el.value}));await refreshWalletContext();notify('Receiver choice saved. Entered addresses and saved payments are unchanged.');}catch(error){notify(errorDetails(error).message,true);render();}return;
}if(el.hasAttribute('data-payer-choice')&&!PREVIEW){payerSetup?.choose(el.value);return;}if(el.dataset.history){selected[el.dataset.history]=el.value;render();}if(el.dataset.formKey&&el.name){const form=forms[el.dataset.formKey];form[el.name]=el.value;if(el.name==='recipient')delete form.demoRecipient;delete form.receiverCheck;delete form.setupNote;if(el.dataset.formKey==='policy')forms.policy.example=null;}});
document.addEventListener('submit',async e=>{
  const kind=e.target.dataset.form;if(!kind)return;e.preventDefault();if(PREVIEW){notify(PREVIEW_REASON);return;}if(!lab||lab.busy||walletManager.busy||formBusy)return;
  formBusy=true;render();
  try {
    if(kind==='workflow'){const r=route(),f=structuredClone(forms[r]),recipients=r==='batch'?f.items:[],payer=await bindNewDraftPayer(f);if(!await checkNewSolReceivers(r,r==='batch'?recipients:[f],payer))return;const w=await lab.createWorkflow({kind:r,...f,recipients});selected[r]=w.id;}
    if(kind==='mint')await lab.inspectMint(forms.tokens.mint);
    if(kind==='token'){const before=new Set(lab.state.payments.map(p=>p.id));try{const p=await lab.prepareToken(forms.tokens);selected.tokens=p.id;}finally{const p=lab.state.payments.find(p=>!before.has(p.id));if(p)selected.tokens=p.id;}}
    if(kind==='request'){const row=await lab.createRequest(forms.requests);selected.requests=row.id;forms.requests.signature='';}
    if(kind==='request-import'){const row=await lab.importRequest(forms.requests.importText);selected.requests=row.id;forms.requests.signature='';}
    if(kind==='request-verify')await lab.verifyRequest(e.target.dataset.request,forms.requests.signature);
    if(kind==='activity'){await fillDemoDefaults(lab,'activity',forms.activity);await lab.loadActivity(forms.activity);}
    if(kind==='verify-proof')await lab.verifyDocument(e.target.dataset.workflow,forms.proof.verifyText);
    if(kind==='payment'){const r=route(),f=structuredClone(forms[r]);if(r!=='recovery'){const payer=await bindNewDraftPayer(f);if(!await checkNewSolReceivers(r,[f],payer))return;}const p=await lab.preparePayment({kind:r,...f});selected[r]=p.id;}
    if(kind==='evidence'){const f=structuredClone(forms.positions),positionId=new FormData(e.target).get('positionId'),payer=await bindNewDraftPayer(f);if(!await checkNewSolReceivers('positions',[{recipient:f.recipient,amountAtomic:String(Math.max(1,Math.floor(lamports(f.amount,10000000000000)/10000)))}],payer))return;await lab.prepareEvidenceTransfer(positionId,f);}
    if(kind==='position'){if(!market)throw Error(marketError||'Market Pulse must provide a current price before opening a position.');await lab.openPosition(forms.positions.units);}
    if(kind==='policy')await lab.policy(forms.policy);
    render();
  }catch(err){notify(errorDetails(err).message,true);if(err.code==='LAB_PAYER_CHANGED')await refreshWalletContext();}
  finally{formBusy=false;render();}
});
window.addEventListener('focus',async()=>{if(!PREVIEW&&ready&&!lab.busy&&!walletManager.busy&&!walletDraftActive()){if(route()==='wallets')await walletManager.refresh();await refreshWalletContext();}});
window.addEventListener('capp:solana-conduit-configured',async()=>{if(!PREVIEW&&ready&&!lab.busy){statuses=await lab.statuses();render(true);}});
document.addEventListener('visibilitychange',async()=>{if(!PREVIEW&&!document.hidden&&ready&&route()==='wallets'&&!walletManager.busy&&!walletDraftActive()){await walletManager.refresh();render(true);}});
if(!PREVIEW)window.addEventListener('hashchange',async()=>{if(ready){if(route()==='wallets')await walletManager.refresh();await refreshWalletContext();}render();content.focus({preventScroll:true});window.scrollTo({top:0});});
window.addEventListener('keydown',e=>{if(e.key==='Escape')assistant.hidden=true;});
window.addEventListener('storage',e=>{if(!PREVIEW&&lab&&!lab.busy){if(e.key===demoWalletRolesKey(lab)||e.key?.startsWith('capp.solana-wallets.v1:')){void refreshWalletContext();return;}if(e.key===lab.key){try{lab.reload();render(true);}catch(err){notify(errorDetails(err).message,true);}}}});
$('#assistant-open').onclick=()=>assistant.open();$('#export-all').onclick=()=>{if(lab&&!PREVIEW)download('solana-lab-evidence.json',lab.export());};
const closeNavigation=()=>{document.body.classList.remove('mobile-nav-open');$('#nav-toggle').setAttribute('aria-expanded','false');};
$('#nav-toggle').onclick=()=>{const open=document.body.classList.toggle('mobile-nav-open');$('#nav-toggle').setAttribute('aria-expanded',String(open));if(open){$('#nav').scrollTop=0;window.requestAnimationFrame(()=>$('.sidebar').scrollIntoView({block:'start'}));}};
$('#nav').addEventListener('click',event=>{if(event.target.closest('a'))closeNavigation();});
window.addEventListener('hashchange',()=>{closeNavigation();document.getElementById('capp-links-app-surface')?.scrollTo?.({top:0});});
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('mobile-nav-open')){closeNavigation();$('#nav-toggle').focus();}});
wirePreviewNavigation(render);
render();
if(PREVIEW){
  const unavailable=()=>{throw Object.assign(new Error(PREVIEW_REASON),{code:'LAB_PREVIEW_ONLY'});};
  // Never read installed/rehearsal records or persist preview operations.
  lab=new Lab({call:unavailable,storage:{getItem:()=>null,setItem:unavailable},key:'solana-lab.preview',onChange:change});
  statuses=COMPONENTS.map(c=>({id:c.id,ready:false,providerMode:'requires-installed-app'}));
  lab.statuses=async()=>statuses;
  assistant.setLab(lab);ready=true;
  $('#runtime-mode').textContent='Web preview';
  $('#assistant-open').innerHTML='Guide & assistant';
  $('#notice').hidden=false;
  $('#notice').innerHTML='<div class="preview-notice" id="preview-notice"><div><strong>Explore the Lab.</strong><span>Pages, diagrams and docs are available here. Running recipes, live prices and Local AI requires the installed app with its Sidecars.</span></div><a href="#/docs/dependencies">What you’ll need ↗</a></div>';
  $('#market-dock').innerHTML='<details class="preview-market"><summary>Market Pulse <span>Live charts · installed app</span></summary><p>Shared pricing and candles connect through the Market Pulse Sidecar. Live feeds are disabled in this web preview.</p><a href="#/components">Explore the components ↗</a></details>';
  document.body.classList.add('hosted-preview');render();
}else {
  stopRuntimeWatch=watchInstalledRuntime(()=>{void startLab();});
  await startLab();
}

function connectOptionalMarket(){
  let next=null;
  try{next=connectMarket(window,{standalone:runtime?.mode==='browser'});marketError='';}
  catch(error){marketError=errorDetails(error).message;}
  if(next===market&&market){if(lab)lab.market=market;return;}
  marketUnsubscribe?.();marketUnsubscribe=null;marketPanel?.destroy();marketPanel=null;releasePositionFeed?.();releasePositionFeed=null;
  market=next;if(lab)lab.market=market;
  if(!market){$('#market-dock').innerHTML=`<details class="preview-market"><summary>Market Pulse <span>Unavailable</span></summary><p>${esc(marketError||'The selected price feed has not started.')}</p><p>Wallets and devnet payments remain available.</p>${button('refresh-market','Retry Market connection')}</details>`;return;}
  if(!lab)return;
  $('#market-dock').replaceChildren();
  marketPanel=mountLabMarket($('#market-dock'),market,id=>lab.state.positions.filter(p=>p.marketAsset===id&&p.state==='open'&&p.position?.entryPrice).slice(-5).map(p=>({price:p.position.entryPrice,label:'Arena entry'})));
  marketUnsubscribe=market.subscribe(()=>updateMarketView());market.setHidden(document.hidden);
}
async function startLab(){
  if(bootFlight||ready)return bootFlight;
  bootFlight=(async()=>{try {
  bootError=null;$('#runtime-mode').textContent='Connecting';render();
  runtime=await connectRuntime();$('#runtime-mode').textContent=runtime.label;$('#assistant-open').disabled=false;notify('');
  const plan=window.__CAPP_EXECUTABLE_PLAN__||{};
  lab=new Lab({call:scopedCall,key:'capp.solana-lab.v1:'+encodeURIComponent(JSON.stringify([plan.projectId||'app',plan.componentId||'main',plan.appId||plan.app?.id||'solana-lab'])),onChange:change,marketRequired:true});
  connectOptionalMarket();
  stopMarketWatch();stopMarketWatch=watchMarketRuntime(()=>{if(lab){connectOptionalMarket();if(ready)void lab.statuses().then(rows=>{statuses=rows;render(true);});}});
  statuses=await lab.statuses();assistant.setLab(lab);
  await walletManager.refresh();await refreshDemoRecipients(lab,draftForms(),{roleSnapshot:walletManager.roles||{payer:null,receiver:null,receiverIssue:walletManager.rolesError}});ready=true;stopRuntimeWatch();
  const visibility=()=>market?.setHidden(document.hidden);
  document.addEventListener('visibilitychange',visibility);
  const marketHeartbeat=window.setInterval(()=>updateMarketView(),5000);
  window.addEventListener('pagehide',()=>{stopMarketWatch();marketUnsubscribe?.();marketPanel?.destroy();releasePositionFeed?.();window.clearInterval(marketHeartbeat);document.removeEventListener('visibilitychange',visibility);},{once:true});
  market?.setHidden(document.hidden);render();
  assistant.setContext(()=>{
    const kind=route(),id=selected[kind],record=id==='new'?null:kind==='requests'?lab.state.paymentRequests.find(r=>r.id===id)||lab.state.paymentRequests.at(-1):CONNECTED.includes(kind)?lab.state.workflows.find(w=>w.id===id)||lab.state.workflows.filter(w=>w.kind===kind).at(-1):lab.state.payments.find(p=>p.id===id)||lab.latest(kind==='tokens'?'token':kind);
    const wallet=statuses.find(s=>s.id==='latch')?.wallet;
    const payment=kind==='requests'&&record?.paymentId?lab.payment(record.paymentId):kind==='tokens'?record:null;
    const setup=(kind==='tokens'||kind==='requests'&&record&&!record.verification)?paymentSetup({snapshot:lab.state.paymentSetup,statuses,payment,input:kind==='requests'&&record?{assetKind:record.terms.asset.kind,mint:record.terms.asset.mint,amount:formatAmount(record.terms.amountAtomic,record.terms.asset.decimals)}:{...forms.tokens,assetKind:'spl-token'}}):null;
    return {route:'#/'+routePath(),page:DEMOS.find(d=>d.id===kind)?.name||'The Lab',wallet:{connected:!!wallet?.connected,address:wallet?.walletPubkey||null,network:'devnet'},record:record?{id:record.id,kind:record.kind,sender:record.sender||record.walletPubkey,network:record.network,state:record.state,progress:record.items?lab.progress(record):null}:null,paymentRequest:kind==='requests'&&record?{id:record.id,terms:record.terms,verified:!!record.verification,lastCheck:record.checks.at(-1)}:null,policy:kind==='policy'?explainPolicy(lab.state.policy):null,setup:setup?{summary:setup.summary,fresh:setup.fresh,checks:setup.checks.filter(c=>c.state!=='pass').slice(0,6)}:null};
  });
  const guideActions=createGuidedActions({getLab:()=>lab,forms,selected,render,assistant,
    refreshStatuses:async()=>{statuses=await lab.statuses();render();},
    verifyNetwork:async()=>{try{const result=await lab.run(()=>lab.call('conduit','verifyNetwork'));networkResult={method:'getGenesisHash',result,at:Date.now()};return result;}catch(error){networkResult={error:errorDetails(error),at:Date.now()};throw error;}finally{statuses=await lab.statuses();render();}}
  });
  payerSetup=guideActions.payerSetup;render();
  void installLabGuide({browser:runtime.mode==='browser',actions:guideActions}).catch(error=>{guideError=error.message;if(route()==='guided')render();});
  Object.defineProperty(window,'solanaLab',{value:Object.freeze({protocol:'capp.solana-lab.tools.v1',tools:READ_TOOLS,call:(name,args)=>readTool(lab,name,args),exportEvidence:()=>lab.export()})});
}catch(e){bootError=errorDetails(e).message;$('#runtime-mode').textContent='Needs attention';$('#assistant-open').disabled=true;render();notify(bootError,true);}

  })().finally(()=>{bootFlight=null;});
  return bootFlight;
}
