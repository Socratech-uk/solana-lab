import {devnetAddress} from './lab.mjs';
import {fundedWallets} from './funded-wallet.mjs';
import {walletAddress} from './wallet-tools.mjs';

const protocol='capp.solana-lab.demo-wallet-roles.v1';
const pending=new WeakMap();
export const demoWalletRolesKey=lab=>'capp.solana-lab.wallet-roles.v1:'+encodeURIComponent(String(lab.key||'capp.solana-lab.v1'));
const address=value=>devnetAddress(walletAddress(String(value||'').trim()));
const publicWallet=(wallet,{source='wallet',suggested=false}={})=>({
  walletId:typeof wallet.walletId==='string'?wallet.walletId:'',
  walletPubkey:address(wallet.walletPubkey),
  label:String(wallet.label||wallet.providerName||(wallet.external?'External wallet':'Devnet wallet')).slice(0,80),
  network:'devnet',external:!!wallet.external,source,suggested
});
function preferences(lab){
  if(!lab.storage?.getItem)return {available:false,receiver:null,issue:'Receiver preferences are unavailable in this workspace.'};
  try{
    const raw=lab.storage.getItem(demoWalletRolesKey(lab));
    if(raw===null)return {available:!!lab.storage.setItem,receiver:null,issue:'',raw};
    const value=JSON.parse(raw);
    if(value?.protocol!==protocol||!value.receiver||typeof value.receiver!=='object'||Array.isArray(value.receiver))throw Error();
    return {available:!!lab.storage.setItem,receiver:publicWallet(value.receiver,{source:'saved'}),issue:'',raw};
  }catch{return {available:false,receiver:null,issue:'Saved receiver preferences could not be read. Export or repair that preference before replacing it; payment records are unchanged.'};}
}
const activeAddress=status=>status.wallet?.connected?status.wallet.walletPubkey:'';
async function unchangedPayer(lab,payer){
  const status=await lab.rawCall('latch','status',{},'main');
  if(status.network!=='devnet'||activeAddress(status)!==(payer?.walletPubkey||''))throw Error('The selected payer changed during wallet setup. Retry to use your current choice; any created wallet remains saved in Wallets.');
}
function saveReceiver(lab,receiver,expected){
  const prefs=preferences(lab);
  if(!prefs.available)throw Error(prefs.issue||'Receiver preferences cannot be saved in this workspace.');
  if(expected!==undefined&&prefs.raw!==expected)throw Error('The demo receiver changed during setup. Your latest choice is retained; any created wallet remains in Wallets.');
  const clean=publicWallet(receiver,{source:'saved'});
  // Only public role metadata is stored here. Latch remains the only key owner.
  lab.storage.setItem(demoWalletRolesKey(lab),JSON.stringify({protocol,receiver:{walletId:clean.walletId,walletPubkey:clean.walletPubkey,label:clean.label,network:'devnet',external:clean.external}}));
  lab.onChange?.();return clean;
}

// Safe on page refresh: public status/list reads only, with no key generation,
// wallet selection, funds reads or payment mutation. A remembered but removed
// receiver is reported rather than silently replaced by a different account.
export async function readDemoWalletRoles(lab){
  const status=await lab.rawCall('latch','status',{},'main');
  if(status.network!=='devnet'||status.wallet?.network&&status.wallet.network!=='devnet')throw Error('Use the devnet wallet provider for demo payer and receiver setup.');
  const list=status.walletManager?await lab.rawCall('latch','walletList',{},'main'):{wallets:[]};
  const wallets=(Array.isArray(list.wallets)?list.wallets:[]).filter(w=>w.network==='devnet').map(w=>publicWallet(w));
  // Older manager status may omit wallet while still returning an active list
  // entry. An explicitly disconnected current status is never overridden.
  const active=status.wallet===undefined?list.active?.devnet:status.wallet?.connected?status.wallet:null;
  const selected=active?.walletPubkey?wallets.find(w=>w.walletPubkey===active.walletPubkey):null;
  const payer=active?.walletPubkey?publicWallet({...selected,...active},{source:'selected'}):null;
  const prefs=preferences(lab);let receiver=null,receiverIssue=prefs.issue,receiverIssueCode=receiverIssue?'storage':'';
  if(prefs.receiver){
    const remembered=prefs.receiver;
    const existing=remembered.walletId?wallets.find(w=>w.walletId===remembered.walletId&&w.walletPubkey===remembered.walletPubkey):remembered;
    if(!existing){receiverIssue='The saved receiver wallet is no longer in Wallets. Choose another receiver or use Prepare demo wallets.';receiverIssueCode='missing';}
    else if(payer?.walletPubkey===remembered.walletPubkey){receiverIssue='The selected payer is also the saved receiver. Choose a different receiver or use Prepare demo wallets.';receiverIssueCode='same-as-payer';}
    else receiver=publicWallet(existing,{source:'saved'});
  }else if(!receiverIssue&&payer){
    const available=wallets.find(w=>w.walletPubkey!==payer.walletPubkey);
    if(available)receiver=publicWallet(available,{source:'available',suggested:true});
  }
  return {payer,receiver,wallets,canCreate:!!(status.walletManager&&status.walletCreateKeepsSelection),walletManager:!!status.walletManager,storageAvailable:prefs.available,receiverIssue,receiverIssueCode,rememberedReceiver:prefs.receiver,authorises:false};
}

// Explicit in-app role assignment. A public external recipient is allowed;
// selecting a known device wallet records its identity so deletion is visible.
export async function setDemoReceiver(lab,{walletId='',walletPubkey=''}={}){
  const expected=preferences(lab).raw;
  const roles=await readDemoWalletRoles(lab);let receiver;
  if(walletId){
    receiver=roles.wallets.find(w=>w.walletId===walletId);
    if(!receiver||walletPubkey&&address(walletPubkey)!==receiver.walletPubkey)throw Error('Choose an available devnet receiver wallet.');
  }else{
    const key=address(walletPubkey);
    receiver=roles.wallets.find(w=>w.walletPubkey===key)||{walletPubkey:key,network:'devnet',external:true,label:'External receiver'};
  }
  if(receiver.walletPubkey===roles.payer?.walletPubkey)throw Error('Choose a receiver different from the selected payer. Self-transfers are a separate explicit demo choice.');
  await unchangedPayer(lab,roles.payer);
  return saveReceiver(lab,receiver,expected);
}

export async function selectDemoPayer(lab,walletId){
  const roles=await readDemoWalletRoles(lab),wallet=roles.wallets.find(w=>w.walletId===walletId);
  if(!wallet)throw Error('Choose an available devnet payer wallet.');
  await unchangedPayer(lab,roles.payer);
  await lab.rawCall('latch','walletSelect',{walletId:wallet.walletId,network:'devnet'},'main');
  // The receiver preference is retained even when it conflicts. The chooser
  // explains that conflict; saved payments and their senders remain untouched.
  return readDemoWalletRoles(lab);
}

const payerPending=new WeakMap();
const payerView=w=>({walletId:w.walletId||'',walletPubkey:devnetAddress(w.walletPubkey,'sender'),created:false,authorises:false});

// Setup is driven by a Guide/page button, never by page load. Only public wallet
// metadata leaves Latch. A saved sender may be reselected, never replaced.
export function ensureGuidedWallet(lab,options={}){
 if(payerPending.has(lab))return payerPending.get(lab).then(()=>ensureGuidedWallet(lab,options));
 const task=ensure(lab,options).finally(()=>payerPending.delete(lab));payerPending.set(lab,task);return task;
}
async function ensure(lab,{sender='',recipient='',recipients=[],payerLabel='Demo payer'}={}){
 const status=await lab.rawCall('latch','status',{},'main'),active=status.wallet?.connected?status.wallet:null;
 if(status.network!=='devnet'||active?.network&&active.network!=='devnet')throw Error('This demo needs the devnet wallet provider. Check the installed Latch settings.');
 if(active&&(!sender||active.walletPubkey===sender))return payerView(active);
 if(!status.walletManager)throw Error('Connect your devnet wallet with its provider, then retry this Guide step. This provider cannot create a device wallet.');
 const list=await lab.rawCall('latch','walletList',{},'main');
 // An unselected payer must not consume the receiver role simply because it
 // holds funds. Reserve both an entered receiver and the saved public role.
 const reserved=new Set([recipient,...(Array.isArray(recipients)?recipients:[]),preferences(lab).receiver?.walletPubkey].filter(Boolean).map(value=>String(value).trim()));
 const wallets=list.wallets.filter(w=>w.network==='devnet'&&(sender?w.walletPubkey===sender:!reserved.has(w.walletPubkey))); 
 let wallet=sender?wallets[0]:(await fundedWallets(lab,{wallets,amountAtomic:'0'}))[0]||wallets[0];
 if(sender&&!wallet)throw Error('Restore the saved sender '+sender+' in Wallets, then retry. A new wallet cannot sign this saved payment.');
 // A wallet selected while the read was pending must win over setup defaults.
 const latest=await lab.rawCall('latch','status',{},'main');
 if(latest.network!=='devnet')throw Error('The wallet network changed. Retry the Guide step.');
 if((latest.wallet?.connected?latest.wallet.walletPubkey:'')!==(active?.walletPubkey||''))throw Error('The selected wallet changed during setup. Retry the Guide step to use that choice.');
 let created=false;
 if(!wallet){
  if(!latest.walletCreateKeepsSelection)throw Error('Update Latch to create a devnet wallet in Guide. Your current provider needs a wallet connected first.');
  wallet=await lab.rawCall('latch','walletCreate',{network:'devnet',label:String(payerLabel).slice(0,64),select:false},'main');created=true;
 }
 const after=await lab.rawCall('latch','status',{},'main');
 if(after.network!=='devnet'||(after.wallet?.connected?after.wallet.walletPubkey:'')!==(active?.walletPubkey||''))throw Error('The selected wallet changed during setup. Retry to keep your selection; any new wallet is saved in Wallets.');
 await lab.rawCall('latch','walletSelect',{walletId:wallet.walletId,network:'devnet'},'main');
 return {...payerView(wallet),created,selected:true};
}

// Called only by a named setup action. Identical concurrent setup clicks share
// one task. Callers may already hold lab.run; this module never takes that lock.
export function ensureDemoWalletPair(lab,options={}){
  const key=JSON.stringify({sender:options.sender||'',recipient:options.recipient||'',forceNewReceiver:!!options.forceNewReceiver,payerLabel:options.payerLabel||'',receiverLabel:options.receiverLabel||''});
  const running=pending.get(lab);
  if(running)return running.key===key?running.task:running.task.then(()=>ensureDemoWalletPair(lab,options));
  const task=ensurePair(lab,options).finally(()=>pending.delete(lab));pending.set(lab,{key,task});return task;
}
async function ensurePair(lab,{sender='',recipient='',forceNewReceiver=false,payerLabel='Demo payer',receiverLabel='Demo receiver'}={}){
  const expected=preferences(lab).raw;
  const before=await readDemoWalletRoles(lab);
  if(!before.storageAvailable)throw Error(before.receiverIssue||'Receiver preferences cannot be saved in this workspace.');
  const payerResult=await ensureGuidedWallet(lab,{sender,recipient,payerLabel});
  const roles=await readDemoWalletRoles(lab),payer=roles.payer;
  if(!payer||payer.walletPubkey!==payerResult.walletPubkey)throw Error('Check the selected devnet payer before setting its receiver.');
  let receiver=null,created=false;
  if(recipient){
    const key=address(recipient);
    if(key===payer.walletPubkey)throw Error('A demo pair needs different payer and receiver wallets.');
    receiver=roles.wallets.find(w=>w.walletPubkey===key)||{walletPubkey:key,external:true,label:'External receiver'};
  }else if(!forceNewReceiver){
    receiver=roles.receiver||roles.wallets.find(w=>w.walletPubkey!==payer.walletPubkey);
  }
  if(!receiver){
    if(!roles.canCreate)throw Error('Create or connect a different devnet receiver in Wallets, or enter its public address. This provider cannot create a device receiver without changing your payer.');
    await unchangedPayer(lab,payer);
    receiver=publicWallet(await lab.rawCall('latch','walletCreate',{network:'devnet',label:String(receiverLabel).slice(0,64),select:false},'main'));
    created=true;
  }
  await unchangedPayer(lab,payer);
  receiver=saveReceiver(lab,receiver,expected);
  return {payer,receiver,created:{payer:!!payerResult.created,receiver:created},authorises:false};
}
