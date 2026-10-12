import {paymentSetup,setupBlockers} from './setup-readiness.mjs';
import {formatAmount} from './solana-payments.mjs';
import {DEVNET_DEMO_MINT} from './demo-token.mjs';
import {fundedWallets} from './funded-wallet.mjs';
import {fundingHandoff} from './funding-handoff.mjs';
import {createDemoReceiver} from './demo-defaults.mjs';
import {checkDemoSolReceiver} from './guided-wallet.mjs';

const progress=(title,body,label,checkpoint)=>({phase:'payer',guide:{protocol:'capp.guide-action-progress.v1',complete:false,title,body:body.slice(0,700),label,checkpoint}});
const walletView=w=>({walletId:w.walletId||'',walletPubkey:w.walletPubkey,label:w.label||w.providerName||'Devnet wallet',external:!!w.external});
const observed=new Set(['authorised','submitting','submitted','unknown','authority-pending','confirmed','finalised']);

// Transient, public setup observations only. Wallet keys go directly to Latch;
// request terms and payment identity are never edited by this controller.
export class RequestPayerSetup {
 constructor({getLab,render=()=>{},refreshStatuses=async()=>{},onNewRequest=()=>{}}){this.getLab=getLab;this.render=render;this.refreshStatuses=refreshStatuses;this.onNewRequest=onNewRequest;this.current=null;this.busy=false;this.checkpoint=null;}
 choose(walletId){if(this.busy)return;const s=this.current;if(!s?.wallets.some(w=>w.walletId===walletId))return;s.choice=walletId;this.checkpoint=null;this.render();}
 async operate(fn){if(this.busy)throw Error('Wait for the payer check to finish.');this.busy=true;this.render();try{return await fn();}finally{this.busy=false;await this.refreshStatuses();this.render();}}
 async inspect(id){return this.operate(()=>this.read(id));}
 async read(id){
  const l=this.getLab();return l.run(async()=>{
   const row=l.request(id),p=row.paymentId?l.payment(row.paymentId):null,previous=this.current;
   const s={requestId:id,requestDigest:row.terms.requestDigest,paymentId:p?.id||'',requiredPayer:p?.walletPubkey||'',recipient:row.terms.recipient,asset:row.terms.asset,amountAtomic:row.terms.amountAtomic,wallets:[],active:null,choice:'',canCreate:false,stage:'choose',detail:'',observedAt:Date.now(),snapshot:null};
   this.current=s;
   if(row.verification?.paid||p&&observed.has(p.state)){s.stage='done';s.detail='Continue this saved payment and verify its existing receipt.';return s;}
   const expired=Date.now()/1000>row.terms.expiresAt;
   try{
    const status=await l.rawCall('latch','status',{},'main');
    if(status.network!=='devnet')throw Error('This request requires the devnet wallet provider. Check its cApp configuration.');
    s.active=status.wallet?.connected?walletView(status.wallet):null;
    let allWallets=[];
    if(status.walletManager){
     const list=await l.rawCall('latch','walletList',{},'main');allWallets=list.wallets;
     s.wallets=allWallets.filter(w=>w.network==='devnet'&&(s.requiredPayer?w.walletPubkey===s.requiredPayer:w.walletPubkey!==s.recipient)).map(walletView);
     s.canCreate=!s.requiredPayer&&status.walletCreateKeepsSelection===true;
    }
    const findFunded=async()=>{
     if(p||!allWallets.length)return;
     const funded=await fundedWallets(l,{wallets:allWallets,active:s.active?.walletPubkey,asset:s.asset,amountAtomic:s.amountAtomic,stopWhen:w=>w.walletPubkey!==s.recipient});
     s.fundedChoice=funded.find(w=>w.walletPubkey!==s.recipient)?.walletId||'';
     if(row.origin==='created'&&(expired||!s.fundedChoice))s.demoPayer=funded.find(w=>w.walletPubkey===s.recipient)||null;
    };
    const offerDemo=()=>{
     if(!s.demoPayer||s.manualSelection)return false;
     s.stage='demo';s.detail=`${s.demoPayer.label} already has the requested devnet funds, but receives this request. Create a new demo with it as payer and a separate receiver. The original request stays in history.`;return true;
    };
    const rightWallet=s.active&&(s.requiredPayer?s.active.walletPubkey===s.requiredPayer:s.active.walletPubkey!==s.recipient);
    if(!rightWallet||expired)await findFunded();
    const oldChoice=previous?.requestId===id?previous.choice:'';
    s.choice=s.wallets.find(w=>w.walletId===oldChoice)?.walletId||s.fundedChoice||s.wallets.find(w=>w.walletPubkey===s.active?.walletPubkey)?.walletId||s.wallets[0]?.walletId||'';
    s.manualSelection=previous?.requestId===id&&previous.manualSelection&&previous.choice===s.active?.walletId;
    if(offerDemo())return s;
    if(expired){s.stage='expired';s.detail='This request has expired. A past payment can still be verified; a new payment needs a new request. Its saved terms cannot be extended.';return s;}
    if(!rightWallet){
     s.detail=s.requiredPayer?'Select the original payer below to continue this payment.':s.active?.walletPubkey===s.recipient?'The selected wallet is the receiver. Choose a different wallet to pay this request.':'Choose a devnet payer below, or connect one with your wallet provider.';
     return s;
    }
    const snapshot=await l.readPaymentSetup({assetKind:row.terms.asset.kind,mint:row.terms.asset.mint||''});s.snapshot=snapshot;
    const latest=await l.rawCall('latch','status',{},'main');
    if(latest.network!=='devnet'||!latest.wallet?.connected||latest.wallet.walletPubkey!==s.active.walletPubkey||snapshot.walletPubkey!==s.active.walletPubkey)throw Error('The selected payer changed during the check. Check the payer again.');
    const report=paymentSetup({snapshot,statuses:snapshot.statuses,input:{assetKind:s.asset.kind,mint:s.asset.mint,amount:formatAmount(s.amountAtomic,s.asset.decimals)},payment:p?{walletPubkey:p.walletPubkey,asset:p.asset,amountAtomic:p.amountAtomic}:null});
    const blockers=s.asset.kind==='spl-token'?setupBlockers(report,snapshot.statuses):report.checks.filter(c=>c.state==='blocked'||['wallet','network','amount'].includes(c.id)&&c.state!=='pass');
    const balance=snapshot.balance;
    if(!balance||balance.network!=='devnet'||balance.walletPubkey!==s.active.walletPubkey||!Number.isSafeInteger(balance.value)||balance.value<0)throw Error(snapshot.errors.balance||'A current devnet SOL balance could not be established. Check the connection and retry.');
    const nativeMinimum=s.asset.kind==='native'?BigInt(s.amountAtomic):0n;
    if(BigInt(balance.value)<=nativeMinimum)blockers.unshift({id:'funds',detail:s.asset.kind==='native'?`The payer has ${formatAmount(String(balance.value),9)} devnet SOL. It needs more than ${formatAmount(s.amountAtomic,9)} SOL to cover this payment plus fees.`:'The payer needs devnet SOL for fees and possible token-account rent.'});
    const missingTokens=snapshot.source&&(snapshot.source.exists===false||/^\d+$/.test(snapshot.source.amountAtomic)&&BigInt(snapshot.source.amountAtomic)<BigInt(s.amountAtomic));
    if(!s.manualSelection&&(BigInt(balance.value)<=nativeMinimum||missingTokens)){
     await findFunded();if(offerDemo())return s;
     if(s.fundedChoice&&s.wallets.find(w=>w.walletId===s.fundedChoice)?.walletPubkey!==s.active?.walletPubkey){s.choice=s.fundedChoice;s.stage='choose';s.detail='Another saved wallet has the requested devnet funds. Select it here to continue.';return s;}
    }
    s.stage=blockers.length?'funds':'ready';
    const needsSol=blockers.some(c=>c.id==='funds'||c.id==='sol');
    s.handoff=needsSol||missingTokens?fundingHandoff({payer:s.active.walletPubkey,mint:s.asset.mint,needsSol}):null;
    s.detail=blockers.length?blockers.filter(c=>!(c.id==='sol'&&blockers.some(b=>b.id==='funds'))).slice(0,2).map(c=>c.detail).join(' '):'The payer has passed the initial funds checks. Review the recipient, amount and fees next. Wallet approval and sending are separate steps.';
    if(!blockers.length&&s.asset.kind==='native'){
     const receiver=await checkDemoSolReceiver(l,{recipient:s.recipient,amountAtomic:s.amountAtomic});
     const checked=await l.rawCall('latch','status',{},'main');
     if(checked.network!=='devnet'||!checked.wallet?.connected||checked.wallet.walletPubkey!==s.active.walletPubkey)throw Error('The selected payer changed while receiver funds were checked. Check the payer again.');
     if(!receiver.ready){s.stage='receiver';s.detail=receiver.guide.body;s.handoff=receiver.guide.handoff||null;}
    }
   }catch(error){s.stage='check';s.detail=String(error?.message||error);}
   return s;
  });
 }
 stamp(s){return JSON.stringify({request:s.requestId,digest:s.requestDigest,payment:s.paymentId,required:s.requiredPayer,active:s.active?.walletPubkey||'',choice:s.choice,stage:s.stage,demo:s.demoPayer?.walletPubkey||''});}
 present(s){
  const wallet=s.wallets.find(w=>w.walletId===s.choice),checkpoint=crypto.randomUUID();
  this.checkpoint={id:checkpoint,stamp:this.stamp(s)};
  let title='Check the payer',label='Check payer again',body=s.detail;
  if(s.stage==='choose'){
   title=s.requiredPayer?'Select the original payer':'Choose a payer';
   if(wallet){label='Use '+wallet.label.slice(0,75)+' as payer';body+=` Use ${wallet.walletPubkey} to pay, or choose another wallet in the highlighted panel. Guide will check its funds before any payment approval.`;}
   else if(s.canCreate){label='Create and select devnet payer';body+=' Create a separate test wallet for the payment, then add test funds. Keep a backup in Wallets. Creating a wallet does not send a payment.';}
   else body+=' Connect or restore the required devnet wallet, then check again. Your request stays saved.';
  }else if(s.stage==='demo'){
   title='Use your funded wallet';label='Create a new demo with '+s.demoPayer.label.slice(0,60);body+=' Review the new request before approving any payment.';
  }else if(s.stage==='funds'){
   title='Complete the payer setup';label='Check payer funds again';
   body+=' Follow the funding or setup instructions in the highlighted panel, then check the payer again.';
   if(s.asset.mint===DEVNET_DEMO_MINT)body+=' Test USDC and SOL are separate balances.';
  }else if(s.stage==='receiver'){
   title='Fund the receiver';label='Check receiver funds again';
  }else if(s.stage==='expired'){title='This request has expired';label='Check saved request';}
  const result=progress(title,body,label,checkpoint);if(s.handoff)result.guide.handoff=s.handoff;return result;
 }
 async newDemo(id){return this.operate(async()=>{
  const s=await this.read(id);if(!s.demoPayer)throw Error('Check the funded wallet again before creating a new demo.');
  return this.createFundedDemo(id,s);
 });}
 async createFundedDemo(id,s){
  const l=this.getLab(),row=l.request(id);
  if(row.origin!=='created'||row.paymentId||row.verification)throw Error('Keep this request and any saved payment unchanged.');
  const form={assetKind:s.asset.kind,mint:s.asset.mint||'',amount:formatAmount(s.amountAtomic,s.asset.decimals),minutes:'60',label:row.terms.label||'Devnet order',message:row.terms.message||'',memo:row.terms.memo||'',recipient:''};
  await l.rawCall('latch','walletSelect',{walletId:s.demoPayer.walletId,network:'devnet'},'main');
  await createDemoReceiver(l,form,{kind:'requests'});
  if(form.recipient===s.demoPayer.walletPubkey)throw Error('The demo receiver must differ from its payer.');
  const next=await l.createRequest(form);
  this.checkpoint=null;this.onNewRequest(id,next.id);await this.read(next.id);
  return {ready:this.current.stage==='ready',requestId:next.id,retainedRequest:id,authorises:false};
 }
 async select(id,walletId){return this.operate(async()=>{await this.change(id,walletId);return this.read(id);});}
 async create(id){return this.operate(async()=>{await this.change(id,'',true);return this.read(id);});}
 async change(id,walletId,create=false){
  const l=this.getLab();await l.run(async()=>{
   const row=l.request(id),p=row.paymentId?l.payment(row.paymentId):null;
   if(row.verification?.paid||p&&observed.has(p.state)||Date.now()/1000>row.terms.expiresAt)throw Error('This request no longer needs a new payer. Continue its saved result.');
   const status=await l.rawCall('latch','status',{},'main');
   if(status.network!=='devnet'||!status.walletManager)throw Error('Select a devnet account using your wallet provider, then check again.');
   if(create){
    if(p||!status.walletCreateKeepsSelection)throw Error('Keep the saved payer; creating another wallet cannot replace it.');
    // Return only public metadata. Never log a wallet-creation result.
    const w=await l.rawCall('latch','walletCreate',{network:'devnet',label:'Demo request payer',select:false},'main');walletId=w.walletId;
   }
   const list=await l.rawCall('latch','walletList',{},'main'),w=list.wallets.find(w=>w.walletId===walletId&&w.network==='devnet');
   if(!w||w.walletPubkey===row.terms.recipient||p&&w.walletPubkey!==p.walletPubkey)throw Error('Choose the saved payer, or a wallet different from this request’s recipient.');
   await l.rawCall('latch','walletSelect',{walletId:w.walletId,network:'devnet'},'main');
   if(this.current?.requestId===id){this.current.choice=w.walletId;this.current.manualSelection=true;}
  });
 }
 async guide(id,context={}){
  if(!context.userConfirmed)throw Error('Use the payer action in Guide to continue.');
  return this.operate(async()=>{
   let s=await this.read(id);
   if(['ready','done'].includes(s.stage)){this.checkpoint=null;return {ready:true,payer:s.active?.walletPubkey||s.requiredPayer,authorises:false};}
   const checkpoint=this.checkpoint;
   if(s.stage==='demo'&&context.checkpoint&&checkpoint?.id===context.checkpoint&&checkpoint.stamp===this.stamp(s)){
    const result=await this.createFundedDemo(id,s);
    return result.ready?result:this.present(this.current);
   }
   if(s.stage==='choose'&&context.checkpoint&&checkpoint?.id===context.checkpoint&&checkpoint.stamp===this.stamp(s)&&(s.choice||s.canCreate)){
    this.checkpoint=null;await this.change(id,s.choice,!s.choice);s=await this.read(id);
    if(s.stage==='ready')return {ready:true,payer:s.active.walletPubkey,authorises:false};
   }
   return this.present(s);
  });
 }
}
