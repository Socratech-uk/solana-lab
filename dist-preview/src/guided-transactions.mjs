import {receiptReady} from './payment-proof.mjs';
import {paymentAmount} from './asset-format.mjs';
import {ensureGuidedWallet,guidedSolSetup} from './guided-wallet.mjs';

const protocol='capp.guide-action-progress.v1';
const connected=['service','batch','proof','service-proof'];
const observed=['submitting','submitted','unknown','authority-pending','confirmed','finalised'];
const terminal=['blocked','rejected','expired','failed'];

// The checkpoint names one rendered operation and phase. It is not wallet
// authority, is not persisted, and cannot survive a restart or be replayed.
export function transactionGuides({lab,selected,add,binding,render,payerSetup}){
 const checkpoints=new Map();
 const resolve=kind=>{
  const l=lab();l.reload();
  let p,w,item,row,index=0,total=1;
  if(connected.includes(kind)){
   const id=kind==='service-proof'?l.workflow(binding('service')).proofId:binding(kind);
   w=l.workflow(id);const expected=kind==='service-proof'?'proof':kind;
   if(w.kind!==expected||w.network!=='devnet')throw Error('This saved request is not compatible with this demo.');
   selected[expected]=w.id;total=w.items.length;
   item=w.items.find(i=>!l.paid(w,i));
   if(!item)return {kind,done:true,recordId:w.id,total};
   index=w.items.indexOf(item);selected[w.id]=item.id;
   p=l.state.payments.find(p=>p.id===item.operationId);
   if(p)l.assertItem(w,item,p);
  }else if(['requests','request-payment'].includes(kind)){
   row=l.request(binding(kind));selected.requests=row.id;
   p=row.paymentId?l.payment(row.paymentId):null;
   if(p&&(p.kind!=='request-payment'||p.requestId!==row.id||p.requestDigest!==row.terms.requestDigest||p.recipient!==row.terms.recipient))throw Error('The saved payment does not match this request.');
   if(row.verification?.paid&&(!p||!observed.includes(p.state)))return {kind,done:true,recordId:row.id,total};
  }else{
   const id=binding(kind);
   p=l.payment(id);selected[kind==='position-evidence'?'evidence':kind]=p.id;
   if(p.kind!==({tokens:'token','position-evidence':'evidence'}[kind]||kind))throw Error('This saved payment does not match the demo you are running.');
  }
  if(p){l.requirePaymentRuntime(p);if(p.network!=='devnet')throw Error('This walkthrough is restricted to devnet.');}
  if(p&&!w&&receiptReady(p))return {kind,done:true,recordId:row?.id||p.id,total};
  let phase=!p?'prepare':['preparing','prepared'].includes(p.state)?'review':p.state==='preflighted'?'approve':p.state==='authorised'?'submit':observed.includes(p.state)?'receipt':p.state==='expired'&&(!p.requestId||Date.now()/1000<=row?.terms?.expiresAt||Date.now()/1000<=l.request(p.requestId).terms.expiresAt)?'refresh':'blocked';
  if(row&&Date.now()/1000>row.terms.expiresAt&&!observed.includes(p?.state))phase='blocked';
  let member='';
  if(phase==='approve'&&p.kind==='treasury'&&!p.request?.quorumReached){phase='member';member=['ari','bo','cy'].find(m=>!p.request?.approvals?.some(a=>a.memberId===m));if(!member)throw Error('This request does not have enough recorded team reviews. Review the approvals before continuing.');}
  const stamp=JSON.stringify({kind,workflow:w,request:row,payment:p,phase,member});
  return {kind,p,w,item,row,index,total,phase,member,stamp};
 };
 const present=(view,note='')=>{
  render();
  if(view.done)return {recordId:view.recordId,confirmed:view.total,guide:{protocol,complete:true}};
  const {p,item,row,index,total,phase,member}=view;
  const label={prepare:'Prepare this payment',review:'Finish payment review',member:'Record '+member+'’s review',approve:'Sign reviewed transfer',submit:'Send signed transfer',receipt:'Check this receipt',refresh:'Refresh expired review',blocked:'Review payment details'}[phase];
  const title=(total>1?`Payout ${index+1} of ${total} · `:'')+({prepare:'Review the next payment',review:'Review the saved payment',member:'Team review',approve:'Wallet approval',submit:'Ready to send',receipt:'Confirm the receipt',refresh:'This review expired before sending',blocked:'This payment needs attention'}[phase]);
  const terms=p?`${paymentAmount(p)} on devnet. Sender ${p.walletPubkey}. Recipient ${p.recipient}.`:
    item?`${item.amountLamports/1e9} devnet SOL. Sender ${view.w.sender}. Recipient ${item.recipient}.`:
    `Request ${row.terms.label||row.id}. Recipient ${row.terms.recipient}. The payer has been checked. Review these terms before preparing the payment.`;
  const details={prepare:'Save this payment and check that it meets the payment rules. Signing and sending come later.',review:'Check the saved payment details and rules before wallet approval.',member:'This records a local simulated team review, not an authenticated signer approval. Wallet approval is separate.',approve:'Review the amount and recipient before authorising the wallet to sign. Signing does not send the payment. '+(row?'The payer saved for this request will be checked again if needed.':'The sender saved for this payment will be selected if needed.'),submit:'Send the signed transaction shown here to Solana Devnet. Network fees apply.',receipt:'Check whether this payment has completed, without sending it again. If it is pending, check again later. Guide continues only when a verified receipt matches this payment.',refresh:'The transaction review has expired. Prepare a fresh review of the same payment terms, then approve it again. This does not sign or send. Previous records and completed payouts are kept.',blocked:(row&&Date.now()/1000>row.terms.expiresAt)||(p?.requestId&&Date.now()/1000>lab().request(p.requestId).terms.expiresAt)?'The payment request itself expired. Ask for new terms; its expiry cannot be extended by refreshing a transaction. Past payments can still be verified.':terminal.includes(p?.state)?`This payment is ${p.state}. Review its payment checks and error details. Resolve this result before starting another payment. Completed payouts will not be sent again.`:'Review this saved payment before continuing.'}[phase];
  const checkpoint=crypto.randomUUID();checkpoints.set(view.kind,{checkpoint,stamp:view.stamp});
  return {operationId:p?.id||item?.operationId||null,phase,guide:{protocol,complete:false,title,body:[note,terms,details].filter(Boolean).join(' ').slice(0,700),label,checkpoint}};
 };
 add('transaction.step','Continue this payment',{
  kind:{type:'string',required:true,enum:['checkout','treasury','service','batch','proof','service-proof','tokens','requests','request-payment','position-evidence'],maxLength:40}
 },async({kind},context)=>{
  if(!['checkout','treasury','service','batch','proof','service-proof','tokens','requests','request-payment','position-evidence'].includes(kind))throw Error('That transaction recipe is not declared.');
  let view=resolve(kind),checkpoint=checkpoints.get(kind);
  if(!context.userConfirmed)throw Error('Confirm this step in Guide to continue.');
  if(view.done)return present(view);
  if(view.row&&['prepare','review','refresh','approve'].includes(view.phase)){
   const setup=await payerSetup.guide(view.row.id,context);
   if(!setup.ready){checkpoints.delete(kind);render();return setup;}
   if(setup.requestId&&setup.requestId!==view.row.id){checkpoints.delete(kind);return present(resolve(kind));}
  }
  if(!view.row&&['prepare','review','refresh','approve'].includes(view.phase)){
   const sender=view.p?.walletPubkey||view.w?.sender||'';
   const setup=await ensureGuidedWallet(lab(),{sender});
   if(setup.selected){checkpoints.delete(kind);render();return present(view,'The wallet saved for this payment is now selected.');}
   if(view.phase!=='approve'&&view.p?.asset?.kind!=='spl-token'){
    const funds=await guidedSolSetup(lab(),{sender,amount:String((view.p?.amountLamports??view.item?.amountLamports??0)/1e9)});
    if(funds.guide){checkpoints.delete(kind);render();return funds;}
   }
  }
  // First visit, Back, refresh, another window, or changed page state: show the
  // actual next action first. A button can never silently change its meaning.
  if(!context.checkpoint||checkpoint?.checkpoint!==context.checkpoint||checkpoint.stamp!==view.stamp)return present(view);
  checkpoints.delete(kind);
  const l=lab(),snapshot=view.p?JSON.stringify(view.p):undefined;
  const guard=()=>{
   if(resolve(kind).stamp!==view.stamp){const e=Error('This payment changed while it was open. Review the updated details before continuing.');e.code='GUIDE_REVIEW_CHANGED';throw e;}
  };
  try{
   if(view.phase==='prepare'){
    if(view.w)await l.prepareWorkflowPayment(view.w.id,view.item.id,guard);
    else await l.prepareRequest(view.row.id,guard);
   }else if(view.phase==='review')await l.reviewPayment(view.p.id,snapshot);
   else if(view.phase==='refresh')await l.refreshPayment(view.p.id,snapshot);
   else if(view.phase==='member')await l.memberApprove(view.p.id,view.member,snapshot);
   else if(view.phase==='approve')await l.approvePayment(view.p.id,snapshot);
   else if(view.phase==='submit')await l.submitPayment(view.p.id,snapshot);
   else if(view.phase==='receipt')await l.reconcilePayment(view.p.id);
   else throw Error('This payment cannot continue from '+(view.p?.state||'expired request')+'. Review the payment checks and error details.');
   return present(resolve(kind));
  }catch(error){
   // Submission may have reached the chain even when its reply was lost.
   // Present the persisted unknown attempt as a receipt check, never resend.
   return present(resolve(kind),String(error?.message||error).slice(0,240));
  }
 },{requiresUserConfirmation:true});
 return {reset:()=>checkpoints.clear()};
}
