// Public, bounded devnet observations. Never switch an existing operation's sender.
export async function fundedWallets(lab,{wallets,active,amountAtomic='0',asset={kind:'native'},exclude='',stopWhen=()=>true}={}){
 const rows=[...wallets].filter(w=>w.network==='devnet'&&w.walletPubkey!==exclude);
 rows.sort((a,b)=>Number(b.walletPubkey===active)-Number(a.walletPubkey===active));
 const funded=[];
 for(const w of rows.slice(0,8)){
  try{
   const b=await lab.rawCall('conduit','balance',{network:'devnet',walletPubkey:w.walletPubkey},'network');
   if(b?.network!=='devnet'||b.walletPubkey!==w.walletPubkey||!Number.isSafeInteger(b.value)||b.value<0)continue;
   const minimum=asset.kind==='native'?BigInt(amountAtomic):0n;
   if(BigInt(b.value)<=minimum)continue;
   if(asset.kind==='spl-token'){
    const tokens=await lab.rawCall('conduit','tokenAccounts',{network:'devnet',walletPubkey:w.walletPubkey,limit:32},'network');
    if(tokens?.network!=='devnet'||tokens.walletPubkey!==w.walletPubkey||!tokens.accounts?.some(a=>a.supported&&(!asset.mint||a.mint===asset.mint)&&/^\d+$/.test(a.amountAtomic)&&BigInt(a.amountAtomic)>0n&&BigInt(a.amountAtomic)>=BigInt(amountAtomic)))continue;
   }
   funded.push({...w,balance:b.value});if(stopWhen(w))break;
  }catch{/* Unknown funds are never treated as funded. The setup panel explains failures. */}
 }
 return funded;
}

export async function useFundedDemoPayer(lab,{recipient='',amountAtomic='0',asset={kind:'native'}}={}){
 const status=await lab.rawCall('latch','status',{},'main');
 if(status.network!=='devnet'||!status.walletManager||status.wallet?.external)return null;
 const list=await lab.rawCall('latch','walletList',{},'main');
 // An already-selected payer is an explicit account choice. A useful default
 // must not replace it just because another account has more observed funds.
 if(status.wallet?.connected){
  const current=list.wallets.find(w=>w.walletPubkey===status.wallet.walletPubkey&&w.network==='devnet');
  if(!current||current.walletPubkey===recipient)return null;
  return (await fundedWallets(lab,{wallets:[current],active:current.walletPubkey,amountAtomic,asset}))[0]||null;
 }
 let [wallet]=await fundedWallets(lab,{wallets:list.wallets,active:status.wallet?.walletPubkey,exclude:recipient,amountAtomic,asset});
 // If nobody has the token yet, reuse SOL for fees and fund tokens on that payer.
 if(!wallet&&asset.kind==='spl-token')[wallet]=await fundedWallets(lab,{wallets:list.wallets,active:status.wallet?.walletPubkey,exclude:recipient});
 if(!wallet)return null;
 const current=await lab.rawCall('latch','status',{},'main');
 if(current.network!=='devnet'||current.wallet?.walletPubkey!==status.wallet?.walletPubkey)throw Error('The wallet changed during demo setup. Try again with the selected wallet.');
 if(wallet.walletPubkey!==status.wallet?.walletPubkey)await lab.rawCall('latch','walletSelect',{network:'devnet',walletId:wallet.walletId},'main');
 return wallet;
}
