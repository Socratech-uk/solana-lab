import {esc, icon} from './visuals.mjs';
import {receiptReady} from './payment-proof.mjs';
import {paymentAmount} from './asset-format.mjs';

// Presentation describes observed work. It never creates, signs or retries it.
import {EXPERIENCES} from './experience-content.mjs';
export {EXPERIENCES};

export const amount = n => (Number(n)/1e9).toLocaleString('en-US',{maximumFractionDigits:9});
export const shortId = value => value ? String(value).slice(0,8)+'…'+String(value).slice(-4) : '—';
export const stateLabel = state => ({preparing:'Preparing',prepared:'Ready for review',preflighted:'Ready to approve',authorised:'Signed · not sent',submitting:'Sending',submitted:'Awaiting confirmation',confirmed:'Confirmed',finalised:'Finalised',unknown:'Outcome unresolved','authority-pending':'Approval unresolved',blocked:'Blocked by policy',rejected:'Not approved',expired:'Expired before send',failed:'Failed',open:'Open',closed:'Closed',opening:'Opening',ready:'Ready',setup:'Needs setup',preview:'Installed app',passed:'Passed'}[state] || state || 'Not started');
export const stateBadge = state => `<span class="status ${esc(state||'ready')}">${esc(stateLabel(state))}</span>`;
export const dateLabel = value => value ? new Date(value < 1e12 ? value*1000 : value).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : 'Saved locally';
export const technical = (key, title, body) => `<details class="technical-details" data-disclosure="${esc(key)}"><summary>${esc(title)}</summary><div class="technical-body">${body}</div></details>`;
export const dataBlock = value => `<pre>${esc(JSON.stringify(value ?? null,null,2))}</pre>`;

export function experienceIntro(id) {
  const x=EXPERIENCES[id]; if(!x)return '';
  return `<section class="experience-brief" aria-label="What this demo demonstrates"><div><span class="eyebrow">WHY IT MATTERS</span><p>${esc(x.why)}</p></div><div><span class="eyebrow">WHAT YOU’LL SEE</span><p>${esc(x.result)}</p></div><ol class="recipe-outline" aria-label="Demo outline">${x.steps.map((s,i)=>`<li><span>${i+1}</span>${esc(s)}</li>`).join('')}</ol></section>`;
}

export function nextDemo(id) {
  const x=EXPERIENCES[id];return x?`<a class="text-button" href="#/${esc(x.next)}">${esc(x.nextLabel)} ${icon('arrow',14)}</a>`:'';
}

export {receiptReady} from './payment-proof.mjs';

export function paymentPresentation(p) {
  const ready=receiptReady(p),sim=(p.network||'demo')==='demo',team=p.kind==='treasury',quorum=!!p.request?.quorumReached;
  const steps=team?['Review','Team review','Wallet approval','Send','Receipt']:['Review','Approval','Send','Receipt'];
  const last=steps.length-1,send=last-1,sign=last-2;
  let current=0,title='Review the request',detail='The amount and recipient are saved. Complete the checks before approval.',tone='neutral';
  if(p.state==='preflighted'){
    current=team&&!quorum?1:sign;
    title=team&&!quorum?'Record two team reviews':sim?'Approve the simulation':'Ready for your wallet approval';
    detail=team&&!quorum?'Choose two different simulated reviewers below. Wallet approval remains a separate step.':sim?'This rehearsal has no network transfer. Approve this exact request to continue.':'Check the amount and recipient below. Signing does not send this transfer.';
  }else if(p.state==='authorised'){
    current=send; title=sim?'Ready to simulate the missing reply':'Signed and ready to send';
    detail=sim?'Arena will record the execution and deliberately lose the response.':'Your wallet has signed this transfer. It has not been sent by this workflow yet.';
  }else if(['submitting','submitted','unknown','authority-pending','confirmed','finalised'].includes(p.state)){
    current=last;title=['unknown','authority-pending'].includes(p.state)?'The outcome is still unresolved':'Check the existing transaction';
    detail='Check this saved attempt for its receipt. This action observes the existing operation; it does not create another payment.';
    tone=['unknown','authority-pending'].includes(p.state)?'attention':'neutral';
  }else if(['blocked','rejected','expired','failed'].includes(p.state)){
    current=p.state==='failed'?last:0;tone='attention';title=stateLabel(p.state);
    detail=p.state==='blocked'?'The request did not pass policy. Inspect the failed checks before preparing a different request.':p.state==='expired'?'This transaction review expired before its first send. Refresh expired review keeps its terms and history, then requires fresh approval before sending.':'Inspect this outcome before deciding whether to start another request.';
  }
  if(ready){current=steps.length;tone='success';title=sim?'Simulation recovered':'Confirmed devnet transaction';detail=sim?'The original simulated attempt now has a receipt. No network funds moved.':'The recorded receipt matches this transfer. You can inspect it or continue to the next part of the demo.';}
  return {ready,sim,steps,current,title,detail,tone};
}

export function paymentJourney(p) {
  const s=paymentPresentation(p);
  return `<ol class="payment-progress" aria-label="Payment progress">${s.steps.map((label,i)=>`<li class="${i<s.current?'done':i===s.current?'current':''}" ${i===s.current?'aria-current="step"':''}><span>${i<s.current?'✓':i+1}</span><b>${esc(label)}</b></li>`).join('')}</ol><div class="outcome-card ${s.tone}" role="status"><span class="outcome-icon" aria-hidden="true">${s.ready?'✓':s.tone==='attention'?'!':'→'}</span><div><h3>${esc(s.title)}</h3><p>${esc(s.detail)}</p></div></div>`;
}

// Saved runs remain read-only until a separate, explicit operation action.
export function runHistory({kind,rows,activeId,workflows=false,page=0,lab}) {
  if(!rows.length)return '';
  const ordered=rows.slice().reverse(),pages=Math.ceil(ordered.length/4),current=Math.max(0,Math.min(page,pages-1));
  return `<section class="panel run-history" aria-label="Previous runs"><div class="panel-header"><div><span class="eyebrow">SAVED ON THIS DEVICE</span><h2>Previous runs</h2></div><span class="tag">${rows.length}</span></div><p>Open a record to see where it finished or continue its next step.</p><div class="history-list">${ordered.slice(current*4,current*4+4).map(row=>{
    const progress=workflows?lab.progress(row):null,old=!workflows&&!lab.compatiblePayment(row);
    const title=workflows?row.title:({checkout:'Icon pack checkout',treasury:'Community grant',recovery:'Missing reply rehearsal'}[kind]||'Payment');
    const state=workflows?`${progress.confirmed} of ${progress.total} receipts`:stateLabel(row.state);
    return `<button type="button" class="history-record ${row.id===activeId?'active':''}" data-action="history-open" data-id="${esc(kind+':'+row.id)}" aria-pressed="${row.id===activeId}"><span><strong>${esc(title)}</strong><small>${esc(dateLabel(row.createdAt))}${workflows?'':' · '+esc(paymentAmount(row))}</small></span><span><b>${esc(state)}</b><small>${old?'Earlier simulation · read only':row.network==='devnet'?'Devnet · test SOL':'Arena simulation'}</small></span></button>`;
  }).join('')}</div>${pages>1?`<div class="history-pagination"><button class="button small" type="button" data-action="history-page" data-id="${kind}:${current-1}" ${current===0?'disabled':''}>Previous</button><small>Page ${current+1} of ${pages}</small><button class="button small" type="button" data-action="history-page" data-id="${kind}:${current+1}" ${current===pages-1?'disabled':''}>Next</button></div>`:''}</section>`;
}

export function relevantEvents(lab,d,selected={}) {
  const ids=new Set(),kind=d.id;
  if(['service','batch','proof'].includes(kind)){
    const rows=lab.state.workflows.filter(w=>w.kind===kind),w=selected[kind]==='new'?null:rows.find(w=>w.id===selected[kind])||rows.at(-1);
    w?.items.forEach(i=>ids.add(i.operationId));
  }else if(['checkout','treasury','recovery'].includes(kind)){
    const p=selected[kind]==='new'?null:lab.state.payments.find(p=>p.id===selected[kind])||lab.latest(kind);if(p)ids.add(p.id);
  }else if(kind==='positions')lab.state.positions.forEach(p=>p.jobs.forEach(j=>ids.add(j.id)));
  return lab.state.events.filter(e=>d.components.includes(e.component) && (
    ids.has(e.input?.operationId)||ids.has(e.result?.operationId)||[...ids].some(id=>e.input?.requestId==='review_'+id)||
    kind==='policy'&&['compass','sentinel'].includes(e.component)&&e.input?.clientPositionId==='policy-preview'||
    kind==='policy'&&e.input?.intent?.clientPositionId==='policy-preview'||
    kind==='network'&&e.component==='conduit'&&['inspect','verifyNetwork'].includes(e.method)
  )).slice(-10).reverse();
}

const componentValue={edge:'Coordinates the reviewed payment',compass:'Gives the request a consistent shape',circuit:'Keeps the same operation through retries',sentinel:'Checks the configured limits',accord:'Binds team reviews to the request',latch:'Asks the wallet for explicit approval',dispatch:'Records the attempt before sending',conduit:'Connects to the configured chain',witness:'Checks the result and keeps evidence',arena:'Rehearses execution without a venue',switchyard:'Tracks allocation and resource reuse',market:'Shares live price observations'};
export function componentExplanation(components) {
  return `<ul class="component-explanation">${components.map(c=>`<li><a href="#/components"><strong>${esc(c==='market'?'Market Pulse':c[0].toUpperCase()+c.slice(1))}</strong></a><span>${esc(componentValue[c]||'Reusable application capability')}</span></li>`).join('')}</ul>`;
}

export function eventInspector(events,key) {
  return technical(key,`Developer activity · ${events.length} recent calls`,events.length?`<div class="call-list">${events.map(e=>`<div class="call-line" data-state="${esc(e.state)}"><strong>${esc(e.component)}.${esc(e.method)}</strong><small>${esc(dateLabel(e.at))} · ${esc(e.state)}</small>${technical(e.id,'Request and result',dataBlock({input:e.input,result:e.result,error:e.error}))}</div>`).join('')}</div>`:'<p>No calls for this run yet. Executing a step adds its returned evidence here.</p>');
}

export function receiptSummary(p) {
  const r=p.operation?.receipt,ready=receiptReady(p),sim=(p.network||'demo')==='demo';if(!r)return '';
  return `<div class="receipt-summary"><div class="row"><h3>${ready?'Receipt recorded':'Receipt needs inspection'}</h3><span class="tag">${sim?'SIMULATION':'DEVNET'}</span></div><p>${sim?'Evidence of the Arena rehearsal only.':ready?'The signature and recorded transaction bytes match the observed devnet transaction.':'A receipt object is present, but the app has not established its binding to this exact transfer.'}</p><dl class="receipt-facts"><div><dt>Amount</dt><dd>${esc(paymentAmount(p))} · ${sim?'demo':'devnet'}</dd></div><div><dt>Recorded finality</dt><dd>${esc(r.finality||r.observedState||'Unspecified')}</dd></div><div><dt>Recipient</dt><dd><code>${esc(shortId(p.recipient))}</code></dd></div></dl></div>`;
}
