import {receiptReady} from './payment-proof.mjs';
import {fillDemoDefaults,blank,createDemoReceiver,prepareDemoWalletsForDraft} from './demo-defaults.mjs';
import {paymentSetup,setupBlockers} from './setup-readiness.mjs';
import {DEVNET_DEMO_MINT} from './demo-token.mjs';
import {fundingHandoff} from './funding-handoff.mjs';
import {ensureGuidedWallet} from './guided-wallet.mjs';

const setupProgress=(checks,mint)=>({guide:{protocol:'capp.guide-action-progress.v1',complete:false,title:'Complete token setup',body:(checks.slice(0,2).map(c=>(c.title+': '+c.detail).slice(0,150)).join(' ')+(mint===DEVNET_DEMO_MINT?' In Payment setup, copy your payer address. Open Circle faucet, choose USDC and Solana Devnet, complete verification, then choose Send 20 USDC. The limit is 20 every 2 hours per address and blockchain. Return here to check the balance.':' Fund the payer’s associated token account with this exact mint’s tokens on Solana Devnet. Circle’s USDC faucet does not fund other mints. Review Payment setup for the remaining checks, then try again.')+' Checking setup does not sign or send a payment.').slice(0,700),label:'Check token setup again',checkpoint:crypto.randomUUID()}});

export function capabilityGuides({lab,forms,selected,render,add,binding,bind,refreshStatuses=async()=>{},payerSetup}){
 const keys={'demo-token-payment':'tokens','create-payment-request':'requests','pay-payment-request':'request-payment'};
 const open=key=>{const page=key==='request-payment'?'requests':key;selected[page]=binding(key)||'new';render();return {recordId:binding(key)||null,draft:selected[page]==='new'};};
 const visibleRequest=()=>{const id=selected.requests==='new'?null:selected.requests||lab().state.paymentRequests.at(-1)?.id;if(!id)throw Error('Create or open a saved payment request first.');return lab().request(id);};
 add('assets.refresh','Check your wallet’s assets',{},async()=>{await ensureGuidedWallet(lab());await refreshStatuses();return lab().inspectAssets();});
 add('mint.inspect','Check the token details',{},async()=>{
   const id=binding('tokens');
   if(id)return lab().inspectMint(lab().payment(id).asset.mint);
   await fillDemoDefaults(lab(),'tokens',forms.tokens);render();return lab().inspectMint(forms.tokens.mint);
 });
 add('token.review','Review the token transfer',{},async()=>{const result=open('tokens');if(result.draft)result.defaults=await prepareDemoWalletsForDraft(lab(),'tokens',forms.tokens);await refreshStatuses();return result;});
 add('token.setup','Check token balance and permissions',{},async()=>{
   const l=lab(),id=binding('tokens'),p=id?l.payment(id):null;
   if(p&&!['preparing','prepared'].includes(p.state))return {saved:true};
   await ensureGuidedWallet(l,{sender:p?.walletPubkey||forms.tokens.walletPubkey||'',recipient:p?.recipient||forms.tokens.recipient});
   if(!p)await fillDemoDefaults(l,'tokens',forms.tokens);
   const input={...forms.tokens,assetKind:'spl-token',mint:p?.asset.mint||forms.tokens.mint};
   const snapshot=await l.checkPaymentSetup(input);
   const report=paymentSetup({snapshot,statuses:snapshot.statuses,input,payment:p?{asset:p.asset,walletPubkey:p.walletPubkey,amountAtomic:p.amountAtomic}:null});
   const blocked=setupBlockers(report,snapshot.statuses);await refreshStatuses();render();
   if(!blocked.length)return {checked:true,authorises:false};
   const result=setupProgress(blocked,input.mint.trim()),needsSol=blocked.some(c=>c.id==='sol'&&c.state==='blocked');
   const missingTokens=snapshot.source&&(snapshot.source.exists===false||blocked.some(c=>c.id==='tokens'&&c.state==='blocked')&&!snapshot.errors.source);
   if(needsSol||missingTokens)result.guide.handoff=fundingHandoff({payer:snapshot.walletPubkey,mint:input.mint.trim(),needsSol});
   return result;
 });
 add('token.receiver','Set up the token receiver',{},async(_args,context)=>{
   if(binding('tokens'))return {saved:true};
   if(!context.userConfirmed)throw Error('Confirm the receiver setup in Guide to continue.');
   await ensureGuidedWallet(lab(),{sender:forms.tokens.walletPubkey||'',recipient:forms.tokens.recipient});
   const result=await createDemoReceiver(lab(),forms.tokens);await refreshStatuses();render();return result;
 },{requiresUserConfirmation:true});
 add('token.prepare','Prepare the reviewed token transfer',{},async()=>{
   const l=lab(),id=binding('tokens');
   if(id){selected.tokens=id;try{return await l.reviewPayment(id);}catch(error){if(error.code==='LAB_TOKEN_SETUP')return setupProgress(error.detail.checks,l.payment(id).asset.mint);throw error;}}
   if(selected.tokens!=='new'){open('tokens');throw Error('Review the new token draft before preparing it.');}
   await fillDemoDefaults(l,'tokens',forms.tokens);
   if(blank(forms.tokens.recipient))throw Error(forms.tokens.setupNote);
   if(!l.state.mints.some(m=>m.asset.mint===forms.tokens.mint.trim()))await l.inspectMint(forms.tokens.mint);
   const before=new Set(l.state.payments.map(p=>p.id));
   try{return await l.prepareToken(forms.tokens);}
   catch(error){if(error.code==='LAB_TOKEN_SETUP'){await refreshStatuses();render();return setupProgress(error.detail.checks,forms.tokens.mint.trim());}throw error;}
   finally{const p=l.state.payments.find(p=>!before.has(p.id));if(p){bind('tokens',p.id);selected.tokens=p.id;}}
 });
 add('token.verify','Check this token transfer’s receipt',{},()=>{
   const id=binding('tokens');if(!id)throw Error('Prepare this token transfer first.');
   const p=lab().payment(id);selected.tokens=id;
   if(!receiptReady(p))throw Error('This transfer still needs a verified devnet receipt matching its token, amount and recipient. Review any failed payment checks, then complete signing, sending and the receipt check.');
   return {operationId:id,asset:p.asset,amountAtomic:p.amountAtomic,signature:p.operation.receipt.signature};
 });
 add('request.review','Review the payment request',{},async()=>{const result=open('requests');if(result.draft)result.defaults=await prepareDemoWalletsForDraft(lab(),'requests',forms.requests);await refreshStatuses();return result;});
 add('request.receiver','Set up the demo request receiver',{},async(_args,context)=>{
   if(binding('requests'))return {saved:true};
   if(!context.userConfirmed)throw Error('Confirm the receiver setup in Guide to continue.');
   await ensureGuidedWallet(lab(),{recipient:forms.requests.recipient});
   const result=await createDemoReceiver(lab(),forms.requests,{kind:'requests'});await refreshStatuses();render();return result;
 },{requiresUserConfirmation:true});
 add('request.payer','Choose and check this request’s payer',{kind:{type:'string',required:true,enum:['requests','request-payment'],maxLength:40}},async({kind},context)=>{
   if(!['requests','request-payment'].includes(kind))throw Error('That request recipe is not declared.');
   const id=binding(kind);lab().request(id);selected.requests=id;render();return payerSetup.guide(id,context);
 },{requiresUserConfirmation:true});
 add('request.create','Save these payment terms',{},async()=>{
   const id=binding('requests');if(id){selected.requests=id;return lab().request(id);}
   if(selected.requests!=='new'){open('requests');throw Error('Review the new request terms before saving them.');}
   await fillDemoDefaults(lab(),'requests',forms.requests,{requestDemo:true});
   if(blank(forms.requests.recipient))throw Error('Complete the receiver step or enter a recipient before saving the request.');
   if(forms.requests.assetKind==='spl-token')await lab().inspectMint(forms.requests.mint);
   const row=await lab().createRequest(forms.requests);bind('requests',row.id);selected.requests=row.id;return row;
 });
 add('request.payReview','Review this payment request',{},async()=>{
   const saved=binding('request-payment');
   // A generic launch owns new terms. Existing requests enter this flow only
   // through an explicit record continuation, never from the newest card.
   if(!saved&&selected.requests!=='new'){open('request-payment');throw Error('Review the new request terms, then continue. To reopen an earlier request, use Continue with Guide on its saved record.');}
   if(!saved){
    await prepareDemoWalletsForDraft(lab(),'requests',forms.requests);
    if(blank(forms.requests.recipient))throw Error('Choose a receiver before saving this new request.');
    if(forms.requests.assetKind==='spl-token')await lab().inspectMint(forms.requests.mint);
   }
   const row=saved?lab().request(saved):await lab().createRequest(forms.requests);
   bind('request-payment',row.id);selected.requests=row.id;return {requestId:row.id,terms:row.terms};
 });
 add('request.verifyBound','Check that the receiver was paid',{kind:{type:'string',required:true,enum:['requests','request-payment'],maxLength:40}},({kind})=>{
   if(!['requests','request-payment'].includes(kind))throw Error('That request recipe is not declared.');
   const row=lab().request(binding(kind));selected.requests=row.id;
   const signature=row.verification?.paid?row.verification.signature:row.paymentId?lab().payment(row.paymentId).operation?.signature:null;
   if(!signature)throw Error('Complete this request’s payment first, or use Verify a request payment to inspect an external signature.');
   return lab().verifyRequest(row.id,signature);
 });
 add('request.find','Find possible payments for this request',{},()=>lab().findRequestPayments(visibleRequest().id));
 add('request.verify','Verify payment to the receiver',{},()=>{
   const row=visibleRequest(),signature=row.verification?.signature||(row.paymentId?lab().payment(row.paymentId).operation?.signature:null);
   if(blank(forms.requests.signature)&&signature)forms.requests.signature=signature;
   return lab().verifyRequest(row.id,forms.requests.signature,{refresh:true});
 });
 add('activity.load','Load activity for this address',{},async()=>{if(blank(forms.activity.address)&&(!forms.activity.network||forms.activity.network==='devnet')){await ensureGuidedWallet(lab());await refreshStatuses();}await fillDemoDefaults(lab(),'activity',forms.activity);render();return lab().loadActivity(forms.activity);});
 return {
   openRun:(id,{recordId}={})=>{if(['pay-payment-request','create-payment-request'].includes(id)&&recordId){const row=lab().request(recordId);bind(keys[id],row.id);selected.requests=row.id;render();}if(id==='demo-token-payment'&&recordId){const p=lab().payment(recordId);if(p.kind!=='token'||!lab().compatiblePayment(p))throw Error('This saved record cannot be used for the token payment demo.');bind('tokens',p.id);}return keys[id]?open(keys[id]):null;},
   resetRun:id=>{
     const key=keys[id];if(!key)return null;
     const l=lab(),saved=binding(key);if(l.busy)throw Error('Wait for the current operation to finish.');
     // Detach the walkthrough, not the payment. Pending and unknown attempts
     // remain intact and can be continued explicitly from their saved record.
     if(['requests','request-payment'].includes(key)){forms.requests.signature='';forms.requests.setupNote='';}
     const next={...l.state.guideBindings};delete next[key];l.state.guideBindings=next;selected[key==='request-payment'?'requests':key]='new';l.save();return {reset:!!saved,retainedRecord:saved||null};
   }
 };
}
