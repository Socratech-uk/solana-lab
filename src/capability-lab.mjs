import {ShowcaseLab} from './workflows.mjs';
import {uid,errorDetails,devnetAddress} from './lab.mjs';
import {assetDescriptor,parseAmount,paymentReference,paymentRequest,tokenAddress,tokenAccount} from './solana-payments.mjs';
import {walletAddress} from './wallet-tools.mjs';
import {setupStatuses,paymentSetup,setupBlockers} from './setup-readiness.mjs';

const copy=value=>structuredClone(value);
export const paymentRoute=p=>p.kind==='token'?'tokens':p.kind==='request-payment'?'requests':p.kind==='evidence'?'positions':p.kind;
export const supports=(status,feature)=>status?.[feature]===true||status?.supports?.[feature]===true;
export const closedPayment=p=>['blocked','rejected','failed','expired'].includes(p?.state);

// Additive state: older workflows and wallet storage retain their identities.
export class CapabilityLab extends ShowcaseLab {
  reload(){
    super.reload();
    this.state.paymentRequests??=[];this.state.mints??=[];
    if(!Array.isArray(this.state.paymentRequests)||!Array.isArray(this.state.mints))throw Error('The saved capability records are unreadable. Export the raw records before repairing storage.');
  }
  async requireCapability(component,feature){
    const info=await this.rawCall(component,'status',{},'main');
    if(!supports(info,feature))throw Error(`This demo needs the updated ${component} Sidecar (${feature}). Update the cApp Sidecars and compile the app again. Existing Lab records are retained.`);
    return info;
  }
  async sender(){const wallet=(await this.rawCall('latch','status',{},'main')).wallet;return devnetAddress(wallet?.connected?wallet.walletPubkey:'','sender');}
  async checkPaymentSetup(input={}){return this.run(()=>this.readPaymentSetup(input));}
  async readPaymentSetup({assetKind='spl-token',mint=''}={}){
    if(!['native','spl-token'].includes(assetKind))throw Error('Choose SOL or an original SPL token.');
    const statuses=setupStatuses(await this.statuses()),wallet=statuses.find(s=>s.id==='latch')?.wallet;
    const report={network:'devnet',walletPubkey:wallet?.connected?wallet.walletPubkey:null,statuses,observedAt:Date.now(),errors:{},balance:null,tokens:null,mint:null,source:null,authorises:false};
    const observe=async(key,fn)=>{try{report[key]=await fn();}catch(error){report.errors[key]=errorDetails(error).message;}};
    if(report.walletPubkey){
      await observe('balance',()=>this.call('conduit','balance',{network:'devnet',walletPubkey:report.walletPubkey},'network'));
      if(assetKind==='spl-token')await observe('tokens',async()=>{await this.requireCapability('conduit','assetReads');return this.call('conduit','tokenAccounts',{network:'devnet',walletPubkey:report.walletPubkey,limit:32},'network');});
    }
    if(assetKind==='spl-token'&&String(mint).trim())await observe('mint',async()=>{
      await this.requireCapability('conduit','assetReads');
      const result=await this.call('conduit','asset',{network:'devnet',mint:walletAddress(String(mint).trim())},'network');
      const asset=assetDescriptor('devnet',result.asset||result);
      if(asset.kind!=='spl-token')throw Error('Use an original Token Program mint.');
      const row={...result,asset,observedAt:result.observedAt||Date.now()};
      this.state.mints=this.state.mints.filter(m=>m.asset.mint!==asset.mint).concat(row).slice(-32);return row;
    });
    if(assetKind==='spl-token'&&report.mint&&report.balance)await observe('source',async()=>{
      const account=await tokenAddress(report.walletPubkey,report.mint.asset.mint);
      const response=await this.call('conduit','request',{network:'devnet',method:'getAccountInfo',params:[account,{encoding:'base64',commitment:'confirmed'}]},'network');
      if(!Number.isSafeInteger(response?.context?.slot)||!Object.hasOwn(response,'value'))throw Error('The RPC did not return an associated token account observation. Check the connection and retry.');
      const source=response.value===null?null:tokenAccount(response.value);
      if(source&&(source.owner!==report.walletPubkey||source.mint!==report.mint.asset.mint))throw Error('The associated token account does not match the selected payer and mint.');
      return {account,walletPubkey:report.walletPubkey,mint:report.mint.asset.mint,exists:!!source,amountAtomic:source?.amountAtomic||'0',slot:response.context.slot};
    });
    if(report.balance&&report.tokens)this.state.assetObservation={walletPubkey:report.walletPubkey,network:'devnet',balance:report.balance,tokens:report.tokens,observedAt:report.observedAt};
    this.state.paymentSetup=report;this.save();return copy(report);
  }
  async requireTokenSetup({asset,walletPubkey,amountAtomic}){
    const snapshot=await this.readPaymentSetup({assetKind:'spl-token',mint:asset.mint});
    if(await this.sender()!==walletPubkey||snapshot.walletPubkey!==walletPubkey)throw Error('The selected payer changed during setup. Review the wallet and try again.');
    if(snapshot.mint&&snapshot.mint.asset.decimals!==asset.decimals)throw Error('The mint precision changed. Inspect the mint again; saved amounts are not rewritten.');
    const report=paymentSetup({snapshot,statuses:snapshot.statuses,payment:{asset,walletPubkey,amountAtomic}}),blocked=setupBlockers(report,snapshot.statuses);
    if(blocked.length)throw Object.assign(Error('Token setup needs attention. '+blocked.map(c=>c.title+': '+c.detail).join(' ')),{code:'LAB_TOKEN_SETUP',detail:{checks:blocked}});
    return report;
  }
  async inspectAssets(){return this.run(async()=>{
    await this.requireCapability('conduit','assetReads');const walletPubkey=await this.sender();
    const balance=await this.call('conduit','balance',{network:'devnet',walletPubkey},'network');
    const tokens=await this.call('conduit','tokenAccounts',{network:'devnet',walletPubkey,limit:32},'network');
    this.state.assetObservation={walletPubkey,network:'devnet',balance,tokens,observedAt:Date.now()};this.save();return copy(this.state.assetObservation);
  });}
  async inspectMint(mint){return this.run(async()=>{
    await this.requireCapability('conduit','assetReads');
    let address;try{address=walletAddress(String(mint||'').trim());}catch{throw Error('Enter a valid devnet token mint, or choose “Fill empty fields” to use a demo mint. A token mint is different from a wallet address.');}
    const result=await this.call('conduit','asset',{network:'devnet',mint:address},'network');
    const asset=assetDescriptor('devnet',result.asset||result);
    if(asset.kind!=='spl-token')throw Error('This is not a supported original Token Program mint.');
    const row={...result,asset,observedAt:result.observedAt||Date.now()};
    this.state.mints=this.state.mints.filter(m=>m.asset.mint!==asset.mint).concat(row).slice(-32);this.save();return copy(row);
  });}
  selectedAsset({assetKind='native',mint=''}){
    if(assetKind==='native')return assetDescriptor('devnet');
    if(assetKind!=='spl-token')throw Error('Choose SOL or an inspected original SPL token.');
    const observed=this.state.mints.find(m=>m.asset.mint===String(mint).trim());
    if(!observed)throw Error('Inspect this mint in Token desk first. Its observed decimals and Token Program identify the asset; a ticker does not.');
    return assetDescriptor('devnet',observed.asset);
  }
  async prepareToken({mint,amount,recipient}={}){return this.run(async()=>{
    await this.requireCapability('edge','tokenTransfer');
    const asset=this.selectedAsset({assetKind:'spl-token',mint}),walletPubkey=await this.sender();recipient=devnetAddress(recipient);
    if(walletPubkey===recipient)throw Error('Choose a different recipient wallet for a token payment. A self-transfer does not demonstrate a payment.');
    const amountAtomic=parseAmount(String(amount),asset.decimals);
    await this.requireTokenSetup({asset,walletPubkey,amountAtomic});
    this.ensureCapacity(this.state.payments);
    const p={id:uid('token'),kind:'token',scope:'main',network:'devnet',walletPubkey,recipient,asset,amountAtomic,createdAt:Date.now(),state:'preparing'};
    this.state.payments.push(p);this.save();return this.prepareExisting(p,{setupChecked:true});
  });}
  async prepareExisting(p,{setupChecked=false}={}){
    if(!['token','request-payment'].includes(p.kind))return super.prepareExisting(p);
    this.requirePaymentRuntime(p);
    try{
      await this.requireCapability('edge','tokenTransfer');
      if(!setupChecked&&p.asset.kind==='spl-token'&&(!p.operation||p.operation.state==='preparing'))await this.requireTokenSetup(p);
      if(!p.operation){
        const input={operationId:p.id,network:p.network,walletPubkey:p.walletPubkey,recipient:p.recipient,asset:p.asset,amountAtomic:p.amountAtomic};
        if(p.requestId)input.paymentRequest=this.request(p.requestId).terms;
        p.operation=await this.call('edge',p.requestId?'preparePayment':'prepareTokenTransfer',input);this.save();
      }
      else if(p.operation.state==='preparing'){
        const input={operationId:p.id,network:p.network,walletPubkey:p.walletPubkey,recipient:p.recipient,asset:p.asset,amountAtomic:p.amountAtomic};
        if(p.requestId)input.paymentRequest=this.request(p.requestId).terms;
        p.operation=await this.call('edge',p.requestId?'preparePayment':'prepareTokenTransfer',input);this.save();
      }
      if(p.operation.state==='prepared'){p.operation=await this.call('edge','preflight',{operationId:p.id});this.save();}
      p.state=p.operation.state;delete p.error;this.save();return copy(p);
    }catch(error){p.error=errorDetails(error).message;this.save();throw error;}
  }
  requireUnpaidRequest(p){
    if(p.requestId&&this.request(p.requestId).verification?.paid)throw Error('This request already has a verified payment. Reconcile any existing attempt; do not sign or send another payment.');
  }
  requirePaymentAction(p){super.requirePaymentAction(p);this.requireUnpaidRequest(p);}
  request(id){const row=this.state.paymentRequests.find(r=>r.id===id);if(!row)throw Error('Payment request not found in this workspace.');return row;}
  async createRequest({recipient,assetKind='native',mint='',amount='0.001',minutes='60',label='',message='',memo=''}={}){return this.run(async()=>{
    await this.requireCapability('witness','independentPaymentVerification');
    const asset=this.selectedAsset({assetKind,mint}),duration=Number(minutes);
    if(!Number.isInteger(duration)||duration<1||duration>10080)throw Error('Choose an expiry from 1 minute to 7 days.');
    const createdAt=Math.floor(Date.now()/1000),input={requestId:uid('invoice'),network:'devnet',recipient:devnetAddress(recipient),asset,amountAtomic:parseAmount(String(amount),asset.decimals),reference:paymentReference(),createdAt,expiresAt:createdAt+duration*60,label,message,memo};
    const terms=await this.call('compass','paymentRequest',input);
    return this.storeRequest(await paymentRequest(terms),'created');
  });}
  async importRequest(text){return this.run(async()=>{
    if(typeof text!=='string'||text.length>12000)throw Error('Paste a payment-request JSON document of at most 12,000 characters.');
    let input;try{input=JSON.parse(text);}catch{throw Error('Paste the exported request JSON, including its network and expiry. A Solana Pay URI alone does not bind those terms.');}
    if(input?.protocol!=='capp.solana-payment-request.v1')throw Error('Use a capp.solana-payment-request.v1 document.');
    const terms=await paymentRequest(input);
    if(terms.network!=='devnet')throw Error('This Lab creates and pays devnet requests only. Mainnet activity is read-only.');
    return this.storeRequest(terms,'imported');
  });}
  storeRequest(terms,origin){
    const existing=this.state.paymentRequests.find(r=>r.id===terms.requestId);
    if(existing){if(existing.terms.requestDigest!==terms.requestDigest)throw Error('This request ID already has different terms. The saved request will not be replaced.');return copy(existing);}
    if(this.state.paymentRequests.some(r=>r.terms.reference===terms.reference))throw Error('This reference already belongs to another request in this workspace.');
    this.ensureCapacity(this.state.paymentRequests);
    const row={id:terms.requestId,terms,origin,createdAt:Date.now(),checks:[]};this.state.paymentRequests.push(row);this.save();return copy(row);
  }
  async prepareRequest(id,guard){return this.run(async()=>{
    guard?.();
    const row=this.request(id);
    if(row.paymentId)return this.prepareExisting(this.payment(row.paymentId));
    if(row.verification?.paid)throw Error('This request already has a verified payment. Inspect its evidence instead of paying again.');
    if(Math.floor(Date.now()/1000)>row.terms.expiresAt)throw Error('This request has expired. Timely past transactions can still be verified; create a fresh request for a new payment.');
    await this.requireCapability('edge','tokenTransfer');const walletPubkey=await this.sender();
    if(walletPubkey===row.terms.recipient)throw Error('The selected wallet is the recipient. Select a different funded devnet payer in Wallets; the request keeps its original recipient.');
    this.ensureCapacity(this.state.payments);
    const {network,asset,amountAtomic,recipient}=row.terms;
    if(asset.kind==='spl-token')await this.requireTokenSetup({asset,walletPubkey,amountAtomic});
    const p={id:uid('request_payment'),kind:'request-payment',requestId:id,requestDigest:row.terms.requestDigest,scope:'main',network,walletPubkey,recipient,asset,amountAtomic,...(asset.kind==='native'&&BigInt(amountAtomic)<=BigInt(Number.MAX_SAFE_INTEGER)?{amountLamports:Number(amountAtomic)}:{}),createdAt:Date.now(),state:'preparing'};
    row.paymentId=p.id;this.state.payments.push(p);this.save();return this.prepareExisting(p,{setupChecked:true});
  });}
  async findRequestPayments(id){return this.run(async()=>{
    const row=this.request(id);await this.requireCapability('conduit','activityPagination');
    row.candidates=await this.call('conduit','activity',{network:row.terms.network,address:row.terms.reference,limit:20},'network');this.save();return copy(row.candidates);
  });}
  async verifyRequest(id,signature,{refresh=false}={}){return this.run(async()=>{
    const row=this.request(id);signature=String(signature||'').trim();
    if(!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature))throw Error('Enter a transaction signature, or select a candidate found by this request’s reference.');
    const accepted=row.verification?.paid?row.verification:null;
    if(accepted){if(accepted.signature!==signature)throw Error('This request already has a verified payment. Its evidence will not be replaced by another signature.');if(!refresh)return copy(accepted);}
    if(this.state.paymentRequests.some(r=>r.id!==id&&r.verification?.signature===signature))throw Error('This signature has already been claimed by another local request.');
    await this.requireCapability('witness','independentPaymentVerification');
    try{
      const result=await this.call('witness','verifyPayment',{paymentRequest:row.terms,signature,commitment:'finalized'},'network');
      if(result.paid!==true||result.simulated!==false||result.requestDigest!==row.terms.requestDigest||result.requestId!==id||result.signature!==signature||result.network!==row.terms.network||result.confirmationStatus!=='finalized')throw Error('The verifier did not return a finalized match for this exact request.');
      // An explicitly requested fresh observation cannot revoke or overwrite
      // accepted evidence. It records this check and reports its own result.
      if(!accepted)row.verification=result;
      row.checks.push({signature,at:Date.now(),paid:true,...(accepted?{refreshed:true}:{})});row.checks=row.checks.slice(-8);this.save();return copy(result);
    }catch(error){row.checks.push({signature,at:Date.now(),paid:false,error:errorDetails(error)});row.checks=row.checks.slice(-8);this.save();throw error;}
  });}
  async loadActivity({address,network='devnet',more=false}={}){return this.run(async()=>{
    if(!['devnet','mainnet-beta'].includes(network))throw Error('Choose devnet or mainnet-beta.');
    address=walletAddress(String(address||'').trim());await this.requireCapability('conduit','activityPagination');
    const previous=this.state.addressActivity;
    if(more&&(!previous||previous.address!==address||previous.network!==network||!previous.nextBefore||previous.entries.length>=200))throw Error('Load this address first. At most 200 entries are retained per query.');
    const page=await this.call('conduit','activity',{network,address,limit:20,...(more?{before:previous.nextBefore}:{})},'network');
    const entries=[...new Map([...(more?previous.entries:[]),...page.entries].map(e=>[e.signature,e])).values()].slice(0,200);
    this.state.addressActivity={...page,entries,pages:more?previous.pages+1:1,historyComplete:false};
    if(!previous||previous.address!==address||previous.network!==network)delete this.state.activityTransaction;
    this.save();return copy(this.state.addressActivity);
  });}
  async inspectTransaction(signature){return this.run(async()=>{
    const page=this.state.addressActivity;
    if(!page?.entries.some(e=>e.signature===signature))throw Error('Load the address activity and choose one of its signatures first.');
    this.state.activityTransaction={...(await this.call('conduit','transaction',{network:page.network,signature,commitment:'finalized'},'network')),signature,network:page.network,observedAt:Date.now()};this.save();return copy(this.state.activityTransaction);
  });}
}
