import {devnetAddress} from './lab.mjs';
import {fundingHandoff} from './funding-handoff.mjs';
import {parseAmount,formatAmount} from './solana-payments.mjs';

import {ensureGuidedWallet} from './demo-wallets.mjs';
export {ensureGuidedWallet};

// Read-only funding gate, before a SOL request is prepared. The transaction
// controller still obtains the exact fee and performs all policy checks.
export async function guidedSolSetup(lab,{sender='',walletPubkey='',recipient='',amount='0',amountAtomic,recipients=[]}={}){
 sender=sender||walletPubkey;
 const wallet=await ensureGuidedWallet(lab,{sender,recipient,recipients:recipients.map(row=>row.recipient)});
 let required=0n;try{required=BigInt(amountAtomic??parseAmount(String(amount),9));}catch{return wallet;}
 const progress=(title,body)=>({ready:false,guide:{protocol:'capp.guide-action-progress.v1',complete:false,title,body:body.slice(0,700),label:'Check payer funds again',checkpoint:crypto.randomUUID()}});
 try{
  const balance=await lab.rawCall('conduit','balance',{network:'devnet',walletPubkey:wallet.walletPubkey},'main');
  if(balance.network!=='devnet'||balance.walletPubkey!==wallet.walletPubkey||!Number.isSafeInteger(balance.value)||balance.value<0)throw Error('The devnet balance could not be verified.');
  const current=await lab.rawCall('latch','status',{},'main');
  if(current.network!=='devnet'||!current.wallet?.connected||current.wallet.walletPubkey!==wallet.walletPubkey)throw Error('The selected payer changed. Check again.');
  if(BigInt(balance.value)<=required){
    const result=progress('Fund your devnet payer',`This payer has ${formatAmount(String(balance.value),9)} devnet SOL and needs ${formatAmount(String(required),9)} SOL plus fees. Use Get test SOL with ${wallet.walletPubkey}, then return and choose Check payer funds again. Back up a new device wallet in Wallets. This check does not sign or send a payment.`);
    result.guide.handoff=fundingHandoff({payer:wallet.walletPubkey,needsSol:true});return result;
  }
  const rows=recipients.length?recipients:[{recipient,amountAtomic:required.toString()}];
  for(const row of rows){
    if(!row.recipient||row.recipient===wallet.walletPubkey)continue;
    const checked=await checkDemoSolReceiver(lab,row);
    if(!checked.ready)return checked;
  }
  const final=await lab.rawCall('latch','status',{},'main');
  if(final.network!=='devnet'||!final.wallet?.connected||final.wallet.walletPubkey!==wallet.walletPubkey)throw Error('The selected payer changed while receiver funds were checked. Review the current payer and check again.');
  return {...wallet,ready:true};
 }catch(error){return progress('Check the devnet connection',String(error.message)+' Check the connection, then try again.');}
}

// Read-only first-credit check, before creating a new tiny SOL transfer. A zero
// balance account may need the observed rent-exempt minimum for zero data. The
// transfer itself may meet it; no arbitrary local threshold is substituted.
// Existing signed/sent attempts must bypass this draft gate and be observed.
export async function checkDemoSolReceiver(lab,{recipient='',amount='0',amountAtomic}={}){
 const key=devnetAddress(recipient);
 let atomic;
 try{atomic=BigInt(amountAtomic??parseAmount(String(amount),9));if(atomic<=0n)throw Error();}
 catch{throw Error('Enter a positive SOL amount before checking its receiver.');}
 const progress=(title,body)=>({ready:false,receiver:key,guide:{protocol:'capp.guide-action-progress.v1',complete:false,title,body:body.slice(0,700),label:'Check receiver funds again',checkpoint:crypto.randomUUID()}});
 try{
  const balance=await lab.rawCall('conduit','balance',{network:'devnet',walletPubkey:key},'network');
  if(balance.network!=='devnet'||balance.walletPubkey!==key||!Number.isSafeInteger(balance.value)||balance.value<0)throw Error('The receiver’s devnet balance could not be verified.');
  if(balance.value>0)return {ready:true,receiver:key,balanceLamports:balance.value,authorises:false};
  const minimum=await lab.rawCall('conduit','request',{network:'devnet',method:'getMinimumBalanceForRentExemption',params:[0,{commitment:'confirmed'}]},'network');
  if(!Number.isSafeInteger(minimum)||minimum<0)throw Error('The receiver’s account funding minimum could not be verified.');
  if(atomic>=BigInt(minimum))return {ready:true,receiver:key,balanceLamports:0,minimumLamports:minimum,fundedByTransfer:true,authorises:false};
  const result=progress('Fund your devnet receiver',`This receiver has no SOL yet. Its first payment must provide at least ${formatAmount(String(minimum),9)} SOL; the requested ${formatAmount(atomic.toString(),9)} SOL transfer is too small. Use Get receiver test SOL with ${key}, then check again. Request the faucet funds yourself; this check does not approve or send the demo payment.`);
  result.minimumLamports=minimum;result.balanceLamports=0;result.guide.handoff=fundingHandoff({payer:key,needsSol:true,role:'receiver'});return result;
 }catch(error){return progress('Check receiver funding',String(error.message)+' Check the devnet connection, then try again. Guide needs a verified balance before continuing.');}
}
