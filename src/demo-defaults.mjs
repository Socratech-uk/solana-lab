import {devnetAddress} from './lab.mjs';
import {readDemoWalletRoles,ensureDemoWalletPair} from './demo-wallets.mjs';
import {ensureGuidedWallet} from './guided-wallet.mjs';

import {DEVNET_DEMO_MINT} from './demo-token.mjs';
export {DEVNET_DEMO_MINT,DEMO_MINT_SOURCE} from './demo-token.mjs';
export const blank=value=>!String(value??'').trim();

export async function selectedDevnetWallet(lab){
  const status=await lab.rawCall('latch','status',{},'main'),wallet=status.wallet;
  if(status.network!=='devnet'||wallet?.network&&wallet.network!=='devnet')throw Error('Select a devnet wallet provider in cApp, then rebuild. These demos use test funds.');
  return devnetAddress(wallet?.connected?wallet.walletPubkey:'','sender');
}

async function chooseMint(lab){
  // Query the current wallet, rather than copying a previous wallet's mint.
  // A read failure still leaves a useful inspection example, never a claim
  // that the payer is funded or that this mint is permitted.
  try{
    const observation=await lab.inspectAssets();
    const account=observation.tokens.accounts.find(a=>a.supported&&/^\d+$/.test(a.amountAtomic)&&BigInt(a.amountAtomic)>0n);
    if(account)return {mint:account.mint,note:'A token from your wallet is selected. Check its mint address and amount before preparing a transfer.'};
    return {mint:DEVNET_DEMO_MINT,note:'No supported token balance was found in this wallet check. Test USDC is selected as an example; add test tokens before paying.'};
  }catch(error){
    return {mint:DEVNET_DEMO_MINT,note:'Test USDC is selected as an example. Check your wallet’s tokens before paying; this read failed: '+error.message};
  }
}

const paymentKinds=new Set(['checkout','treasury','service','batch','proof','positions','tokens','requests']);
const recipientRows=(kind,form)=>kind==='batch'?(form.items||[]):[form];
const senderFor=(roles,form)=>blank(form.walletPubkey)?roles.payer?.walletPubkey:devnetAddress(form.walletPubkey,'sender');
const suitableReceiver=(roles,form)=>roles.receiver&&roles.receiver.walletPubkey!==senderFor(roles,form)?roles.receiver:null;

// Hydrate only editable drafts supplied by the UI. A typed address (or explicit
// self-transfer) has no demoRecipient marker and is never replaced. This path
// only reads public role metadata; it cannot create a wallet or read RPC funds.
export async function refreshDemoRecipients(lab,forms,{roleSnapshot,roles:providedRoles}={}){
  const roles=roleSnapshot||providedRoles||await readDemoWalletRoles(lab),changed=[];
  for(const [kind,form] of Object.entries(forms||{})){
    if(!form||!paymentKinds.has(kind))continue;
    const receiver=suitableReceiver(roles,form);
    for(const [index,row] of recipientRows(kind,form).entries()){
      const automatic=!!row.demoRecipient&&String(row.recipient||'').trim()===row.demoRecipient;
      if(!blank(row.recipient)&&!automatic)continue;
      const next=receiver?.walletPubkey||'';
      if(row.recipient!==next)changed.push(kind+(kind==='batch'?'.'+index:''));
      row.recipient=next;
      if(next)row.demoRecipient=next;else delete row.demoRecipient;
    }
  }
  return {changed,payer:roles.payer,receiver:roles.receiver,receiverIssue:roles.receiverIssue,authorises:false};
}

// Called by explicit Guide/page setup actions. Only empty draft fields are
// filled; saved operations and user-entered choices are never rewritten.
export async function fillDemoDefaults(lab,kind,form,{requestDemo=false}={}){
  if(!form)throw Error('This demo has no editable draft.');
  const filled=[],notes=[];
  const put=(object,key,value,label=key)=>{if(blank(object[key])){object[key]=value;if(key==='recipient')object.demoRecipient=value;filled.push(label);}};
  if(paymentKinds.has(kind)){
    const recipients=recipientRows(kind,form);
    if(recipients.some(row=>blank(row.recipient))){
      const roles=await readDemoWalletRoles(lab),receiver=suitableReceiver(roles,form);
      if(receiver){
        recipients.forEach((row,i)=>put(row,'recipient',receiver.walletPubkey,kind==='batch'?'recipient '+(i+1):'recipient'));
        notes.push((receiver.suggested?'A different saved wallet is suggested':'Your saved demo receiver is filled')+' for empty recipients. Review its address; the selected payer stays unchanged.');
      }else notes.push(roles.receiverIssue||'Choose a separate devnet receiver in Wallets. Guide can create the missing payer and receiver on its setup button, or enter another wallet address.');
    }
    if(kind==='requests')notes.push('The saved request will keep its exact receiver, amount, network and expiry. Paying it requires a different payer.');
  }else if(kind==='activity'){
    if(blank(form.network))put(form,'network','devnet');
    if(blank(form.address)){
      if(form.network!=='devnet')throw Error('Enter the public mainnet address to inspect, or choose “Use selected devnet wallet”. Guide keeps your chosen network.');
      put(form,'address',await selectedDevnetWallet(lab));
    }
    notes.push('Read the visible address on the selected network. An empty history is a valid observation, not a funding check.');
  }
  if(kind==='tokens'||kind==='requests'&&form.assetKind==='spl-token'){
    if(blank(form.mint)){
      const suggestion=await chooseMint(lab);put(form,'mint',suggestion.mint);notes.push(suggestion.note);
    }
    if(kind==='tokens')notes.push('Token payments need a different receiver. The payer needs the selected token plus SOL for fees and any associated account rent.');
  }
  if(notes.length)form.setupNote=notes.join(' ');
  return {filled,note:form.setupNote||'',authorises:false};
}

// Explicit setup button only. Existing recipients stay deliberate choices;
// missing recipients are assigned the reusable demo receiver, never the payer.
export async function prepareDemoWalletsForDraft(lab,kind,form){
  await ensureGuidedWallet(lab,{sender:form.walletPubkey||'',recipients:recipientRows(kind,form).map(row=>row.recipient).filter(value=>!blank(value))});
  await refreshDemoRecipients(lab,{[kind]:form});
  if(recipientRows(kind,form).some(row=>blank(row.recipient))){
    await ensureDemoWalletPair(lab,{sender:form.walletPubkey||''});
  }else if(recipientRows(kind,form).some(row=>row.demoRecipient&&row.demoRecipient===row.recipient)){
    const roles=await readDemoWalletRoles(lab);
    if(roles.receiver?.suggested)await ensureDemoWalletPair(lab,{sender:form.walletPubkey||''});
  }
  return fillDemoDefaults(lab,kind,form,{requestDemo:kind==='requests'});
}

// No private key material enters Lab logs. The pair controller owns concurrency
// and role persistence; another click reuses the same public wallet pair.
export async function createDemoReceiver(lab,form,{kind='tokens'}={}){
  if(!blank(form.recipient)&&form.demoRecipient!==String(form.recipient).trim())return {recipient:devnetAddress(form.recipient),created:false,authorises:false};
  await refreshDemoRecipients(lab,{[kind]:form});
  const prior=String(form.recipient||'');
  const pair=await ensureDemoWalletPair(lab,{sender:form.walletPubkey||'',...(prior?{recipient:prior}:{})});
  // Input entered while wallet setup was pending wins over defaults.
  if(blank(form.recipient)||form.recipient===prior&&form.demoRecipient===prior){form.recipient=pair.receiver.walletPubkey;form.demoRecipient=pair.receiver.walletPubkey;}
  form.setupNote=(pair.created.receiver?'Created':'Selected')+' a separate devnet receiver. Your payer selection is unchanged. Back up new device wallets in Wallets. '+(kind==='requests'?'The saved request will pay this receiver; check both wallets before continuing.':'The payer still needs funds and fees; a fresh receiver may need test SOL for a tiny SOL payment.');
  return {recipient:devnetAddress(form.recipient),created:pair.created.receiver,payerCreated:pair.created.payer,authorises:false};
}
