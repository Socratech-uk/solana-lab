import {parseAmount,formatAmount,TOKEN} from './solana-payments.mjs';
import {walletAddress} from './wallet-tools.mjs';

const ASSOCIATED_TOKEN='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const atomic=value=>typeof value==='string'&&/^(0|[1-9]\d*)$/.test(value)&&BigInt(value)<=18446744073709551615n;
const lamports=value=>Number.isSafeInteger(value)&&value>=0;
// Retain only public setup fields, never whole provider configuration.
export function setupStatuses(statuses){return statuses.filter(s=>['latch','sentinel','conduit','edge'].includes(s.id)).map(s=>({
 id:s.id,ready:s.ready,network:s.network,providerMode:s.providerMode,error:s.error?{message:s.error.message}:null,
 ...(s.id==='latch'?{wallet:s.wallet?{connected:s.wallet.connected,walletPubkey:s.wallet.walletPubkey}:null,signingPolicy:s.signingPolicy?{
  network:s.signingPolicy.network,enforcedLocally:s.signingPolicy.enforcedLocally,maxLamports:s.signingPolicy.maxLamports,tokenLimits:s.signingPolicy.tokenLimits,authorises:false
 }:null}:{}),
 ...(s.id==='sentinel'?{tokenLimits:s.tokenLimits,maxLamports:s.maxLamports,maxFeeLamports:s.maxFeeLamports,maxAccountRentLamports:s.maxAccountRentLamports,allowedPrograms:s.allowedPrograms}:{}),
 ...(s.id==='edge'?{tokenTransfer:s.tokenTransfer||s.supports?.tokenTransfer}:{}),
}));}

function mintPermission(raw,mint,amount){
 if(typeof raw!=='string')return ['unknown','This installed Sidecar does not expose its mint limits. Check its configuration in cApp.'];
 try{
  if(raw.length>16384)throw Error();const limits=JSON.parse(raw),seen=new Set();
  if(!Array.isArray(limits)||limits.length>32)throw Error();
  for(const row of limits){walletAddress(row?.mint);if(!atomic(row?.maxAmountAtomic)||BigInt(row.maxAmountAtomic)===0n||seen.has(row.mint))throw Error();seen.add(row.mint);}
  const limit=limits.find(row=>row.mint===mint);
  if(!limit)return ['blocked',limits.length?'This mint is not permitted. Add a deliberate tokenLimits entry in cApp and rebuild.':'No mints are permitted. Configure tokenLimits in cApp and rebuild.'];
  return amount&&BigInt(amount)>BigInt(limit.maxAmountAtomic)?['blocked',`Requested ${amount} atomic units exceeds the configured ${limit.maxAmountAtomic} ceiling.`]:[amount?'pass':'unknown',`Mint ceiling: ${limit.maxAmountAtomic} atomic units.${amount?' Requested amount is within the limit.':' Enter a valid amount to compare.'}`];
 }catch{return ['blocked','The mint limits are invalid. Use at most 32 unique mint addresses with positive atomic amount strings in cApp.'];}
}

// Setup can stop an unready draft. It never authorises a transfer: the Sidecars
// still check the exact accounts, bytes, fees and current policy during review.
export function setupBlockers(report,statuses=[]){
 const required=new Set(['wallet','network','amount','mint','tokens','sentinel-mint','programs']);
 if(statuses.find(s=>s.id==='latch')?.signingPolicy?.enforcedLocally!==false)required.add('latch-mint');
 return report.checks.filter(c=>c.state==='blocked'||required.has(c.id)&&c.state!=='pass');
}
export function paymentSetup({snapshot,statuses=[],input={},payment=null,now=Date.now()}={}){
 const checks=[],add=(id,title,state,detail)=>checks.push({id,title,state,detail});
 const latch=statuses.find(s=>s.id==='latch'),wallet=latch?.wallet,selected=wallet?.connected?wallet.walletPubkey:null;
 const fresh=!!snapshot&&now>=snapshot.observedAt&&now-snapshot.observedAt<=60000&&snapshot.walletPubkey===selected;
 const report=fresh?snapshot:null,info=id=>(report?.statuses||statuses).find(s=>s.id===id)||{};
 const token=(payment?.asset?.kind||input.assetKind||'spl-token')==='spl-token';
 const mint=payment?.asset?.mint||String(input.mint||'').trim(),observed=report?.mint?.asset?.mint===mint?report.mint:null;
 const asset=payment?.asset||observed?.asset;let amount=payment?.amountAtomic;
 if(!amount)try{amount=parseAmount(String(input.amount||''),token?asset?.decimals:9);}catch{}
 if(!atomic(amount)||BigInt(amount)===0n)amount=null;
 const original=payment?.walletPubkey;
 add('wallet','Selected payer',!selected||latch?.network!=='devnet'||original&&original!==selected?'blocked':'pass',
  !selected?'Create or select a devnet wallet in Wallets.':latch?.network!=='devnet'?'Select the devnet wallet provider for payments.':original&&original!==selected?`This saved payment belongs to ${original}. Select that wallet to continue.`:`Devnet wallet ${selected}`);
 const balance=report?.balance?.walletPubkey===selected&&report.balance.network==='devnet'&&lamports(report.balance.value)?report.balance:null;
 add('network','Devnet connection',balance?'pass':report?.errors?.balance?'blocked':'unknown',balance?'The configured endpoint returned a verified devnet balance.':report?.errors?.balance||'Check setup to verify the selected wallet on devnet.');
 add('amount','Exact amount',amount?'pass':'unknown',amount?`${amount} atomic units${token?' for this mint':''}.`:'Inspect the mint if needed, then enter a positive amount within its decimal precision.');
 if(token){
  add('mint','Original SPL mint',observed?'pass':report?.errors?.mint?'blocked':'unknown',observed?`${observed.asset.decimals} decimals · ${mint}`:report?.errors?.mint||'Enter the mint and check setup to observe its Token Program and decimals.');
  const accounts=report?.tokens?.walletPubkey===selected?report.tokens:null,matches=accounts?.accounts.filter(a=>a.supported&&a.mint===mint&&atomic(a.amountAtomic))||[];
  const total=matches.reduce((n,a)=>n+BigInt(a.amountAtomic),0n),source=payment?.operation?.preflight?.transferFacts?.sourceTokenAccount,exact=matches.find(a=>a.account===source);
  let state='unknown',detail='Check setup to read token accounts. SOL alone is not a token balance.';
  if(accounts&&mint){
   if(exact&&amount){state=BigInt(exact.amountAtomic)>=BigInt(amount)?'pass':'blocked';detail=`Associated source account: ${exact.amountAtomic} atomic units observed.`;}
   else if(!accounts.truncated&&amount&&total<BigInt(amount)){state='blocked';detail=`Observed ${total} atomic units across ${matches.length} accounts for this mint; the request needs ${amount}. Obtain devnet tokens in the payer’s associated account.`;}
   else detail=`Observed ${total} atomic units across ${matches.length} matching accounts${accounts.truncated?' in a truncated listing':''}. Preparation checks the exact associated source account; other accounts cannot fund this transfer.`;
  }else if(report?.errors?.tokens)detail=report.errors.tokens;
  const exactSource=report?.source?.walletPubkey===selected&&report.source.mint===mint?report.source:null;
  if(exactSource){
   if(!exactSource.exists){state='blocked';detail=`No associated token account for this mint in payer ${selected}. Obtain devnet tokens for this wallet, then check again. Creating a receiver does not fund the payer; SOL only covers fees and rent.`;}
   else if(atomic(exactSource.amountAtomic)){
    state=amount?(BigInt(exactSource.amountAtomic)>=BigInt(amount)?'pass':'blocked'):'unknown';
    detail=`Associated source account ${exactSource.account}: ${exactSource.amountAtomic} atomic units observed.${amount?` The transfer needs ${amount}.`:''}${state==='blocked'?' Obtain more of this token in the selected payer wallet.':''}`;
   }
  }else if(report?.errors?.source){state='blocked';detail='Payer associated token account: '+report.errors.source;}
  add('tokens','Token holdings',state,detail);
  for(const id of ['sentinel','latch']){
   const s=info(id),policy=id==='latch'?s.signingPolicy:null;
   const result=id==='latch'&&policy?.enforcedLocally===false?['unknown','This wallet provider owns its approval policy. Local mint limits do not establish provider permission.']:mintPermission(id==='latch'?policy?.tokenLimits:s.tokenLimits,mint,amount);
   add(id+'-mint',id==='latch'?'Wallet mint permission':'Sentinel mint permission',...result);
  }
  const programs=info('sentinel').allowedPrograms;
  const programsAllowed=Array.isArray(programs)&&[TOKEN,ASSOCIATED_TOKEN].every(p=>programs.includes(p));
  add('programs','Token programs',!Array.isArray(programs)?'unknown':programsAllowed?'pass':'blocked',!Array.isArray(programs)?'This Sidecar does not expose its allowed programs.':programsAllowed?'Sentinel allows the original Token and Associated Token programs.':'Allow the original Token and Associated Token programs in Sentinel, then rebuild.');
 }
 const op=payment?.operation,fee=op?.feeLamports,rent=token?op?.preflight?.accountObservation?.rentLamports:0;
 const exactCosts=lamports(fee)&&lamports(rent)&&!!amount;
 const required=exactCosts?BigInt(fee)+BigInt(rent)+(token?0n:BigInt(amount)):null;
 add('sol','SOL for fees and rent',!balance?'unknown':balance.value===0||required!==null&&BigInt(balance.value)<required?'blocked':required!==null?'pass':'unknown',!balance?'Check setup to observe the payer’s SOL balance.':`${formatAmount(String(balance.value),9)} devnet SOL observed. ${exactCosts?`Recorded fee: ${fee} lamports; account rent: ${rent} lamports. ${required} lamports needed${token?'':' including the payment'}.`:'Prepare the transfer to obtain its exact fee and account-rent checks.'}`);
 if(token){const ceiling=info('sentinel').maxAccountRentLamports;add('rent','Account rent ceiling',!lamports(ceiling)||!lamports(rent)?'unknown':rent>ceiling?'blocked':'pass',lamports(ceiling)?`Configured ceiling: ${ceiling} lamports. ${lamports(rent)?`Recorded account rent: ${rent} lamports.`:'Preparation checks whether the recipient needs an account and observes its rent.'}`:'Read the configured rent ceiling from Sentinel before preparing.');}
 if(!token&&amount){
  for(const id of ['sentinel','latch']){const s=info(id),ceiling=id==='latch'?s.signingPolicy?.maxLamports:s.maxLamports;add(id+'-sol',id==='latch'?'Wallet SOL limit':'Sentinel SOL limit',!lamports(ceiling)?'unknown':BigInt(amount)>BigInt(ceiling)?'blocked':'pass',lamports(ceiling)?`Configured native transfer ceiling: ${ceiling} lamports.`:'The installed provider does not expose a local SOL limit. Approval still checks its policy.');}
 }
 for(const id of ['edge','sentinel','latch']){
  if(info(id).ready===false)add(id+'-provider',id+' provider','blocked',info(id).error?.message||'Configure this Sidecar in cApp and rebuild.');
  else if(info(id).network&&info(id).network!=='devnet')add(id+'-provider',id+' provider','blocked','This payment requires a devnet provider. Update the Sidecar settings in cApp and rebuild.');
 }
 if(token&&info('sentinel').providerMode&&info('sentinel').providerMode!=='conduit-peer')add('sentinel-mode','Token preflight provider','blocked','Choose Sentinel’s Conduit preflight mode for token account checks and rebuild.');
 if(op?.preflight?.checks){const failed=op.preflight.checks.filter(c=>!c.pass&&!c.bypass);if(failed.length)add('preflight','Recorded preparation','blocked',failed.map(c=>`${c.id}: ${c.detail}`).join(' · '));}
 if(payment?.error)add('operation','Saved operation needs attention','blocked',payment.error);
 return {checks,fresh,observedAt:snapshot?.observedAt||null,walletPubkey:snapshot?.walletPubkey||null,authorises:false,
  summary:checks.some(c=>c.state==='blocked')?'Needs attention':checks.some(c=>c.state==='unknown')?'Checks remaining':'Observed checks passed'};
}
