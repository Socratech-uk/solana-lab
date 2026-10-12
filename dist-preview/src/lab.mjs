import {COMPONENTS,GUIDE} from './catalog.mjs';
export const RECIPIENT='11111111111111111111111111111111';
export const PROGRAM=RECIPIENT;
export function policyExample(scenario){
  if(!['normal','fee','stale','risk'].includes(scenario))throw Error('Choose a declared policy example.');
  return {action:'open',amount:'0.01',fee:scenario==='fee'?'150000':'5000',slippage:'50',risk:scenario==='risk'?'high':'medium',age:scenario==='stale'?'600':'0',example:scenario};
}
export function devnetAddress(value,role='recipient') {
  const address=String(value||'').trim();
  if(!address&&role==='sender')throw Error('Create or select a devnet wallet in Wallets, then return to this request.');
  if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)||address===PROGRAM)throw Error(role==='sender'?'The sender address is invalid. Select a devnet wallet in Wallets.':'Enter a valid devnet recipient address, or choose “Use my wallet for a self-transfer”. This checks the address, not its balance.');
  return address;
}
export function explainPolicy(policy) {
  const result=policy?.result;if(!result)return 'Run Check policy to see the result. This playground uses no wallet funds.';
  const failed=result.checks.filter(c=>!c.pass&&!c.bypass);
  if(result.allowed)return 'All configured checks passed. This is a simulation: no wallet was checked or charged. A policy pass alone would not authorise a payment.';
  const reasons=failed.map(c=>c.id==='fee'?`${c.detail} exceeds the configured ceiling of ${result.policy.maxFeeLamports.toLocaleString()} lamports.`:c.id==='freshness'?`${c.detail} exceeds the ${result.policy.maxIntentAgeSeconds}-second freshness limit.`:c.id==='risk-matrix'?'The declared risk exceeds this policy’s risk capacity.':`${c.id}: ${c.detail}.`);
  const example=policy.example,expected=example&&failed.length===1&&failed[0].id===({fee:'fee',stale:'freshness',risk:'risk-matrix'})[example];
  return `${expected?'Expected rejection — this example worked. ':'The policy blocked this request. '}${reasons.join(' ')} No wallet funds were checked or spent. ${failed.some(c=>c.id==='freshness')?'A real app should obtain a fresh request and review it again.':'Try Normal request to compare the passing case.'}`;
}
const copy=v=>JSON.parse(JSON.stringify(v));
export const uid=prefix=>prefix+'_'+crypto.randomUUID().replaceAll('-','');
export const digest=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(v))))).map(x=>x.toString(16).padStart(2,'0')).join('');
export function lamports(value,maximum=1000000000) {
  const s=String(value).trim();if(!/^\d{1,5}(\.\d{1,9})?$/.test(s))throw new Error('Enter a SOL amount with at most 9 decimal places.');
  const [a,b='']=s.split('.'),n=Number(BigInt(a)*1000000000n+BigInt(b.padEnd(9,'0')));
  if(!Number.isSafeInteger(n)||n<1||n>maximum)throw new Error(`Choose an amount above zero and at most ${maximum/1e9} SOL.`);return n;
}
export function errorDetails(error) {
  const message = typeof error === 'string' ? error : error?.message || error?.error?.message || error?.detail?.message || '';
  return {code: typeof error?.code === 'string' ? error.code : 'LAB_ERROR', message: String(message || 'The Sidecar request failed without a readable response. Open Conduit settings and test the connection.').slice(0,1600), ...(error?.detail && typeof error.detail === 'object' ? {detail:copy(error.detail)} : {})};
}
const modes={edge:'demo',compass:'local-intent',circuit:'local-store',switchyard:'local-allocation',accord:'local-control',sentinel:'local-policy',latch:'demo-confirm',arena:'deterministic-local',dispatch:'arena-peer',witness:'arena-peer'};

export class Lab {
  constructor({call,storage=localStorage,key='capp.solana-lab.v1',onChange=()=>{},network='devnet',market=null,marketRequired=false}) {
    this.market=market;this.marketRequired=marketRequired;this.network=network;this.rawCall=call;this.storage=storage;this.key=key;this.onChange=onChange;this.busy=false;this.reload();
  }
  reload() {
    const raw=this.storage.getItem(this.key);
    if(raw===null){this.state={protocol:'capp.solana-lab.state.v1',payments:[],positions:[],events:[],policy:null};return;}
    try {const s=JSON.parse(raw);if(s.protocol!=='capp.solana-lab.state.v1'||!['payments','positions','events'].every(k=>Array.isArray(s[k])))throw Error();this.state=s;}
    catch {throw new Error('Solana Lab records could not be read. Export the raw records before repairing storage; the app will not overwrite them.');}
  }
  save(){this.storage.setItem(this.key,JSON.stringify(this.state));this.onChange();}
  async run(fn) {
    if(this.busy)throw new Error('An action is already running.');this.busy=true;this.onChange();
    const work=async()=>{this.reload();return fn();};
    try{return await (globalThis.navigator?.locks?navigator.locks.request(this.key,work):work());}
    finally{this.busy=false;this.onChange();}
  }
  async call(component,method,input={},scope='main') {
    if(component==='latch'&&method.startsWith('wallet')&&method!=='walletList')throw Error('Use the direct wallet manager for private wallet actions; they must not enter activity or evidence logs.');
    const ev={id:uid('event'),at:Date.now(),component,method,scope,provenance:scope==='network'?'rpc-read':scope==='recovery'||component==='arena'?'simulation':'devnet-workspace',input:copy(input),state:'running'};
    this.state.events.push(ev);this.state.events=this.state.events.slice(-160);this.save();
    try {
      if(method!=='status') {
        const info=await this.rawCall(component,'status',{},scope);
        if(info.ready===false)throw Error(info.error?.message||`${component} needs configuration`);
        if(component==='edge') {
          const expected=scope==='recovery'?'demo':this.network;
          if((info.mode||info.providerMode)!==expected)throw Error(`This workflow needs Edge in ${expected} mode. Update the project settings and rebuild.`);
        }
      }
      const result=await this.rawCall(component,method,input,scope);
      ev.state='complete';ev.result=copy(result);this.save();return result;
    }catch(e){ev.state='error';ev.error=errorDetails(e);this.save();throw Object.assign(new Error(ev.error.message),ev.error);}
  }
  async statuses(){const rows=await Promise.all(COMPONENTS.map(async c=>{try{return {id:c.id,...await this.rawCall(c.id,'status',{},'main')};}catch(e){return {id:c.id,ready:false,error:errorDetails(e)};}}));if(this.market)rows.push({id:'market',...this.market.status()});return rows;}
  payment(id){const p=this.state.payments.find(x=>x.id===id);if(!p)throw new Error('Payment not found in this workspace');return p;}
  compatiblePayment(p){return (p.network||'demo') === (p.kind==='recovery'?'demo':this.network) && (p.kind==='recovery' ? p.scope==='recovery' : p.scope==='main');}
  requirePaymentRuntime(p){if(!this.compatiblePayment(p))throw Error('This is a saved operation from an earlier demo profile. It remains available for export; start a new devnet payment.');}
  // Action guards run after run() acquires the workspace lock and reloads.
  // Reconciliation is a read and deliberately uses requirePaymentRuntime only.
  requirePaymentAction(p){this.requirePaymentRuntime(p);}
  latest(kind){return this.state.payments.filter(x=>x.kind===kind&&this.compatiblePayment(x)).at(-1);}
  ensureCapacity(list){if(list.length>=64)throw new Error('This rehearsal has reached 64 records. Export evidence and start a separate workspace to retain the history.');}
  async connectWallet(){return this.run(()=>this.call('latch','connect',{}));}
  async walletBalance(){return this.run(async()=>{
    const wallet=(await this.rawCall('latch','status')).wallet;
    if(!wallet?.connected)throw Error('Create or select a devnet wallet first.');
    await this.call('conduit','verifyNetwork');
    return {walletPubkey:wallet.walletPubkey,...await this.call('conduit','request',{method:'getBalance',params:[wallet.walletPubkey,{commitment:'confirmed'}],network:'devnet'})};
  });}
  async preparePayment(input={}) {return this.run(()=>this.recordPayment(input));}
  async recordPayment({kind='checkout',amount='0.0025',recipient=RECIPIENT,walletPubkey='',evidence=null,commitment=null,operationId='',parentId=''}={}) {
    if(!['checkout','treasury','recovery','evidence','service','batch','proof'].includes(kind))throw Error('Unknown payment workflow');
    const network=kind==='recovery'?'demo':this.network;
    if(network==='devnet') {
      const wallet=(await this.rawCall('latch','status')).wallet;
      walletPubkey=devnetAddress(walletPubkey||wallet?.walletPubkey,'sender');
      recipient=devnetAddress(recipient);
    }
    this.ensureCapacity(this.state.payments);
    if(operationId&&this.state.payments.some(p=>p.id===operationId))throw Error('This payment already exists. Resume its recorded operation.');
    const p={id:operationId||uid(kind),kind,network,walletPubkey,amountLamports:evidence?.amountLamports??lamports(amount),recipient:String(recipient).trim(),evidence,...(commitment?{commitment}:{}),...(parentId?{parentId}:{}),
      createdAt:Date.now(),scope:kind==='recovery'?'recovery':'main',state:'preparing'};
    this.state.payments.push(p);this.save();return this.prepareExisting(p);
  }
  async prepareEvidenceTransfer(positionId,{amount,recipient,walletPubkey,operationId='',jobId=''}={}){return this.run(async()=>{
    const position=this.position(positionId),job=jobId?position.jobs.find(j=>j.id===jobId&&j.done):position.jobs.filter(j=>j.done).at(-1);
    if(!job)throw Error('Complete an Arena action first.');
    const existing=operationId?this.state.payments.find(p=>p.id===operationId):job.evidencePaymentId?this.payment(job.evidencePaymentId):null;
    if(existing){if(existing.kind!=='evidence'||existing.evidence?.operationId!==job.id||!this.compatiblePayment(existing))throw Error('This evidence payment belongs to a different Arena action.');return copy(existing);}
    const evidence=await this.call('arena','evidenceTransfer',{operationId:job.id,originalAmountLamports:lamports(amount,10000000000000),divisor:10000});
    // Persist the link before preparation can fail; retry resumes this same payment.
    const before=this.state.payments.length;
    try{return await this.recordPayment({kind:'evidence',recipient,walletPubkey,evidence,operationId});}
    finally{if(this.state.payments.length>before){
      const id=this.state.payments.at(-1).id;
      // Manual retries keep their original one-action link. An explicit new
      // Guide run can add another reviewed payment without replacing it.
      if(job.evidencePaymentId&&job.evidencePaymentId!==id)job.evidencePaymentIds=[...new Set([...(job.evidencePaymentIds||[]),job.evidencePaymentId,id])];
      else job.evidencePaymentId=id;
      this.save();
    }}
  });}
  async prepareExisting(p){
    this.requirePaymentRuntime(p);
    const call=(c,m,a)=>this.call(c,m,a,p.scope);
    const network=p.network||'demo';
    if(p.scope!=='recovery'&&network!==this.network)throw Error('This saved payment uses the previous demo profile. Its records remain exportable; create a new devnet payment.');
    if(!p.operation){p.operation=await call('edge','prepare',{operationId:p.id,amountLamports:p.amountLamports,recipient:p.recipient,network,walletPubkey:p.walletPubkey,legKey:p.id,...(p.commitment?{commitment:p.commitment}:{}),...(p.evidence?{evidenceDigest:p.evidence.evidenceDigest,scaling:{originalAmountLamports:p.evidence.originalAmountLamports,divisor:p.evidence.divisor}}:{})});this.save();}
    if(p.operation.state==='prepared'){p.operation=await call('edge','preflight',{operationId:p.id});this.save();}
    if(p.kind==='treasury'&&!p.request&&p.operation.state==='preflighted'){
      p.group=await call('accord','createGroup',{groupId:'lab-treasury-reviewers-v1',members:['ari','bo','cy'],threshold:2});this.save();
      p.request=await call('accord','request',{requestId:'review_'+p.id,groupId:p.group.groupId,operationId:p.id,attemptId:p.operation.attemptId,messageDigest:p.operation.messageDigest,policyDigest:p.operation.preflight.policyDigest,network,walletPubkey:p.walletPubkey||'demo-treasury'});this.save();
    }
    p.state=p.operation.state;this.save();return copy(p);
  }
  assertPaymentSnapshot(p,expected){if(expected!==undefined&&JSON.stringify(p)!==expected){const error=Error('This payment changed after Guide displayed it. Review the current state before continuing.');error.code='GUIDE_REVIEW_CHANGED';throw error;}}
  async reviewPayment(id,expected){return this.run(()=>{const p=this.payment(id);this.assertPaymentSnapshot(p,expected);return this.prepareExisting(p);});}
  async refreshPayment(id,expected){return this.run(async()=>{
    const p=this.payment(id);this.assertPaymentSnapshot(p,expected);this.requirePaymentAction(p);
    if(p.network!=='devnet')throw Error('Only expired devnet reviews can be refreshed.');
    if(p.replacementPaymentId)return this.prepareExisting(this.payment(p.replacementPaymentId));
    const status=await this.rawCall('edge','status',{},p.scope);
    if(!status.supports?.refreshExpired)throw Error('Update the Edge Sidecar, recompile and rebuild to refresh this expired review. Keep its saved record.');
    this.ensureCapacity(this.state.payments);
    const operation=await this.call('edge','refresh',{operationId:p.id},p.scope);
    if(operation.previousOperationId!==p.id||operation.sender!==p.walletPubkey||operation.recipient!==p.recipient)throw Error('The refreshed operation does not match the saved payment. Keep both records for inspection.');
    const fields=['kind','network','walletPubkey','amountLamports','recipient','evidence','commitment','parentId','asset','amountAtomic','requestId','requestDigest','scope'];
    const next={...Object.fromEntries(fields.filter(k=>Object.hasOwn(p,k)).map(k=>[k,copy(p[k])])),id:operation.operationId,previousPaymentId:p.id,createdAt:Date.now(),operation,state:operation.state};
    p.state='expired';p.replacementPaymentId=next.id;p.error='';p.operation={...p.operation,state:'expired',replacementOperationId:next.id};
    this.state.payments.push(next);
    for(const w of this.state.workflows||[])for(const item of w.items)if(item.operationId===p.id){item.previousOperationIds=[...(item.previousOperationIds||[]),p.id];item.operationId=next.id;}
    for(const row of this.state.paymentRequests||[])if(row.paymentId===p.id)row.paymentId=next.id;
    for(const position of this.state.positions)for(const job of position.jobs){if(job.evidencePaymentId===p.id)job.evidencePaymentId=next.id;if(job.evidencePaymentIds?.includes(p.id)&&!job.evidencePaymentIds.includes(next.id))job.evidencePaymentIds.push(next.id);}
    for(const [key,value] of Object.entries(this.state.guideBindings||{}))if(value===p.id)this.state.guideBindings[key]=next.id;
    // Save the replacement links together before preflight can fail. The old
    // transaction and approvals remain retained; the successor starts fresh.
    this.save();return this.prepareExisting(next);
  });}
  async memberApprove(id,memberId,expected){return this.run(async()=>{
    const p=this.payment(id);this.assertPaymentSnapshot(p,expected);this.requirePaymentRuntime(p);if(p.kind!=='treasury'||!p.request)throw new Error('Create a treasury request first');
    p.request=await this.call('accord','approve',{requestId:p.request.requestId,memberId});this.save();return copy(p);
  });}
  async approvePayment(id,expected){return this.run(async()=>{
    const p=this.payment(id);this.assertPaymentSnapshot(p,expected);this.requirePaymentAction(p);
    if(p.kind==='treasury'){
      const q=await this.call('accord','quorum',{requestId:p.request?.requestId});p.request={...p.request,...q};this.save();
      if(!q.quorumReached)throw new Error('Record at least two simulated member approvals first.');
    }
    p.state='authority-pending';this.save();
    try{p.operation=await this.call('edge','authorise',{operationId:p.id},p.scope);p.state=p.operation.state;delete p.error;this.save();return copy(p);}
    catch(error){
      try{p.operation=await this.call('edge','transactionStatus',{operationId:p.id},p.scope);p.state=p.operation.state;}catch{}
      p.error=errorDetails(error).message;this.save();throw error;
    }
  });}
  async submitPayment(id,expected){return this.run(async()=>{
    const p=this.payment(id);this.assertPaymentSnapshot(p,expected);this.requirePaymentAction(p);if(p.state!=='authorised')throw new Error('Approve this exact payment before submitting it. Use Reconcile for an existing attempt.');
    p.state='submitting';this.save();
    try {p.operation=await this.call('edge','submit',{operationId:p.id},p.scope);p.state=p.operation.state;this.save();return copy(p);}
    catch(e){p.state='unknown';p.error=e.message;this.save();throw e;}
  });}
  async reconcilePayment(id){return this.run(async()=>{
    const p=this.payment(id);this.requirePaymentRuntime(p);p.operation=await this.call('edge','transactionStatus',{operationId:p.id},p.scope);
    p.state=p.operation.state;p.error=p.operation.recoveryError?.message||'';this.save();return copy(p);
  });}
  async policy({action='open',amount='0.01',fee=5000,slippage=50,risk='medium',age=0,example=null}={}) {
    return this.run(async()=>{
      const intent=await this.call('compass','intent',{kind:'position',action,clientPositionId:'policy-preview',network:this.network,amountLamports:lamports(amount),createdAt:Date.now()/1000-Number(age)});
      const result=await this.call('sentinel','evaluate',{intent,feeLamports:Number(fee),slippageBps:Number(slippage),riskTier:risk,intentCreatedAt:Date.now()/1000-Number(age),programIds:[PROGRAM]});
      this.state.policy={intent,result,example};this.save();return copy(this.state.policy);
    });
  }
  async openPosition(units=100) {return this.run(async()=>{
    if(this.marketRequired&&!this.market)throw Error('Market Pulse is unavailable. Connect the selected price feed before opening a new position.');
    const n=Number(units);if(!Number.isFinite(n)||n<=0||n>10000)throw new Error('Choose 1 to 10,000 synthetic units.');
    this.ensureCapacity(this.state.positions);
    const marketAsset=this.market?'So11111111111111111111111111111111111111112':null;
    if(marketAsset)this.captureMarketPrice(marketAsset);
    const p={id:uid('position'),units:n,market:'SOL / USD',...(marketAsset?{marketAsset,pricingKind:'market-sample'}:{}),state:'opening',createdAt:Date.now(),jobs:[]};this.state.positions.push(p);this.save();
    return this.positionJob(p,'open',n);
  });}
  captureMarketPrice(asset){const q=this.market?.quote({id:asset});if(!q?.available||q.stale)throw Error('Wait for a fresh SOL price before starting a new position action. Open Market settings if the feed needs attention.');return copy({price:q.price,asset:q.asset,observedAt:q.observedAt,sourceAt:q.sourceAt,source:q.source,blockId:q.blockId,quality:q.quality});}
  positionMetrics(p){
    const entry=p.position?.entryPrice||p.jobs.find(j=>j.action==='open')?.pricing?.price||100,size=p.position?.size??p.units;
    let q=null;try{q=p.marketAsset?this.market?.quote({id:p.marketAsset}):{available:true,stale:false,price:100};}catch{}
    const current=!!q?.available&&!q.stale,realised=p.jobs.filter(j=>j.done&&['reduce','close'].includes(j.action)).reduce((sum,j)=>sum+((j.pricing?.price??100)-entry)*j.units,0);
    return {entry,size,mark:q?.available?q.price:null,stale:!current,unrealised:!size?0:current?(q.price-entry)*size:null,realised,legacy:!p.marketAsset};
  }
  position(id){const p=this.state.positions.find(x=>x.id===id);if(!p)throw new Error('Position not found');return p;}
  async changePosition(id,action){return this.run(async()=>{
    const p=this.position(id);
    if(p.jobs.some(x=>!x.done))throw new Error('Resume the recorded action before creating another one.');
    if(!['reduce','close'].includes(action)||p.state!=='open')throw new Error('Choose an open position');
    return this.positionJob(p,action,action==='reduce'?p.position.size/2:p.position.size);
  });}
  async resumePosition(id){return this.run(async()=>{const p=this.position(id),job=p.jobs.find(x=>!x.done);if(!job)throw new Error('No action to resume');return this.positionJob(p,job.action,job.units,job);});}
  async positionJob(p,action,units,job=null) {
    const resuming=!!job;
    if(!job){const pricing=p.marketAsset?this.captureMarketPrice(p.marketAsset):null;job={id:uid(action),action,units,...(pricing?{pricing}:{}),at:Date.now(),steps:{},done:false};p.jobs.push(job);this.save();}
    const step=async(name,fn)=>{if(!Object.hasOwn(job.steps,name)){job.steps[name]=await fn();this.save();}return job.steps[name];};
    try {
      const intent=await step('intent',()=>this.call('compass','intent',{operationId:job.id,kind:'position',action,network:this.network,clientPositionId:p.id,market:p.market,side:'long',size:units,amountLamports:10000000}));
      const policy=await step('policy',()=>this.call('sentinel','evaluate',{intent,feeLamports:5000,slippageBps:50,riskTier:'low',programIds:[PROGRAM]}));
      if(!policy.allowed)throw new Error('Sentinel rejected this position request; no execution took place.');
      const messageDigest=await step('messageDigest',()=>digest({operationId:job.id,action,units,positionId:p.id,intentDigest:intent.intentDigest,policyDigest:policy.policyDigest,...(job.pricing?{pricing:job.pricing}:{})}));
      const attemptId='attempt_'+job.id;
      await step('reserve',()=>this.call('circuit','reserve',{operationId:job.id,legKey:p.id,intentDigest:intent.intentDigest}));
      await step('preflight',()=>this.call('circuit','transition',{operationId:job.id,state:'preflighted'}));
      await step('authority',async()=>({simulated:true,authorised:false,decision:'user-requested-arena-action',messageDigest}));
      await step('authorised',()=>this.call('circuit','transition',{operationId:job.id,state:'authorised'}));
      if(action==='open') {
        p.rail=await step('allocation',()=>this.call('switchyard','allocate',{clientPositionId:p.id,market:p.market,side:'long',executionWallet:'demo-wallet-'+p.id,profileId:'lab'}));this.save();
        for(const state of ['rail_wallet_funded','position_request_created','position_open_pending'])await step(state,()=>this.call('switchyard','transition',{railId:p.rail.railId,state,evidenceDigest:messageDigest,event:'demo-'+state}));
      }else if(action==='close')await step('closePending',()=>this.call('switchyard','transition',{railId:p.rail.railId,state:'position_close_pending'}));
      await step('attempt',()=>this.call('circuit','beginAttempt',{operationId:job.id,attemptId,messageDigest}));
      // On resume, observe the saved Arena operation before considering execution.
      let outcome=job.steps.execution;
      if(!outcome && resuming){try{outcome=await this.call('arena','read',{operationId:job.id,attemptId});}catch(error){if(!String(error.code).endsWith('NOT_FOUND'))throw error;}}
      if(!outcome)outcome=await this.call('arena','execute',{operationId:job.id,attemptId,messageDigest,network:'demo',action,clientPositionId:p.id,market:p.market,side:'long',size:units,reduceSize:units,price:job.pricing?.price??100});
      job.steps.execution=outcome;this.save();
      if(outcome.state!=='finalised')throw Error('Arena outcome is '+outcome.state+'; retain this action for inspection.');
      p.position=await step('position',()=>this.call('arena','position',{clientPositionId:p.id}));this.save();
      const evidence=await step('evidence',()=>this.call('witness','appendEvidence',{operationId:job.id,attemptId,kind:'position-outcome',payload:job.pricing?{outcome,pricing:job.pricing}:outcome}));
      job.receipt=await step('receipt',async()=>({protocol:'capp.solana-lab.arena-receipt.v1',operationId:job.id,attemptId,simulated:true,network:'demo',observedState:'finalised',receiptDigest:evidence.evidenceDigest,evidence,outcome}));
      if(action==='open')p.rail=await step('opened',()=>this.call('switchyard','transition',{railId:p.rail.railId,state:'position_open',evidenceDigest:evidence.evidenceDigest}));
      if(action==='close') {
        if(!outcome.settlement?.sweepConfirmed)throw new Error('Sweep evidence is missing; bucket stays allocated.');
        for(const state of ['position_closed','sweep_requested','rail_bucket_reusable'])p.rail=await step(state,()=>this.call('switchyard','transition',{railId:p.rail.railId,state,evidenceDigest:evidence.evidenceDigest}));
      }
      await step('finalised',()=>this.call('circuit','transition',{operationId:job.id,attemptId,state:'finalised',evidenceDigest:evidence.evidenceDigest}));
      p.state=p.position.state;job.done=true;delete job.error;this.save();return copy(p);
    }catch(e){job.error=e.message;this.save();throw e;}
  }
  receipts(){return [...this.state.payments.filter(p=>p.operation?.receipt).map(p=>p.operation.receipt),...this.state.positions.flatMap(p=>p.jobs.filter(j=>j.receipt).map(j=>j.receipt))];}
  export(){return {protocol:'capp.solana-lab.evidence.v1',exportedAt:new Date().toISOString(),executionMode:'devnet-and-arena',containsRpcReads:this.state.events.some(e=>e.provenance==='rpc-read'),notice:'Arena outcomes are simulated. Devnet receipts describe only the exact test transaction observed; a scaled transfer does not establish that the full simulated trade occurred.',state:copy(this.state)};}
}

export const READ_TOOLS=[
  {name:'lab.assets.read',description:'Read the last explicitly observed wallet assets and inspected mints; may be stale or from a previous wallet.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'lab.requests.list',description:'Read saved payment terms, latest verification outcomes and expiry; this never marks a request paid.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'lab.activity.read',description:'Read the last bounded address-activity snapshot, including its network and time. No new RPC call.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'lab.market.status',description:'Read market provider status, cadence and freshness without making a request.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'lab.market.quote',description:'Read an observed price and its stale flag. A sample is not an executable trade quote.',inputSchema:{type:'object',properties:{id:{type:'string'}},additionalProperties:false}},
  {name:'lab.market.candles',description:'Read up to 120 locally retained OHLCV candles. Null volume means unavailable.',inputSchema:{type:'object',properties:{id:{type:'string'},intervalMs:{type:'integer',minimum:1000,maximum:3600000}},additionalProperties:false}},
  {name:'lab.guide.search',description:'Search authored guidance and component limitations.',inputSchema:{type:'object',properties:{query:{type:'string'},route:{type:'string',description:'Optional authored route, for example #/checkout.'}},required:['query'],additionalProperties:false}},
  {name:'lab.sidecars.status',description:'Read current component availability.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'lab.operations.list',description:'List the recorded operations.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'lab.operation.read',description:'Read one operation from this app.',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false}},
  {name:'lab.receipts.list',description:'Read recent receipts, each with its network and simulation label.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
].map(x=>({...x,annotations:{readOnlyHint:true,destructiveHint:false}}));
export async function readTool(lab,name,args={}) {
  if(!READ_TOOLS.some(t=>t.name===name))throw new Error('This assistant tool is not granted. Approvals and execution stay with the user.');
  if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('Tool arguments must be an object');
  const schema=READ_TOOLS.find(t=>t.name===name).inputSchema;
  if(Object.keys(args).some(k=>!Object.hasOwn(schema.properties,k)))throw Error('Unknown tool argument');
  if(name==='lab.assets.read')return copy({observation:lab.state.assetObservation||null,mints:(lab.state.mints||[]).slice(-8),setup:lab.state.paymentSetup||null});
  if(name==='lab.requests.list')return copy((lab.state.paymentRequests||[]).slice(-12).map(r=>({id:r.id,terms:r.terms,expired:Date.now()/1000>r.terms.expiresAt,verification:r.verification||null,lastCheck:r.checks.at(-1)||null,paymentId:r.paymentId||null})));
  if(name==='lab.activity.read')return copy(lab.state.addressActivity||{available:false});
  if(name.startsWith('lab.market.')){if(!lab.market)throw Error('Market Pulse is not connected.');if(Object.keys(args).some(k=>!['id','intervalMs'].includes(k)))throw Error('Unknown market argument');if(args.id!==undefined&&(typeof args.id!=='string'||args.id.length>96))throw Error('Invalid instrument');if(name.endsWith('.status'))return lab.market.status();if(name.endsWith('.quote'))return lab.market.quote({id:args.id});return lab.market.candles({id:args.id,intervalMs:args.intervalMs,limit:120});}
  if(name==='lab.guide.search'){
    if(typeof args.query!=='string'||args.query.length>300)throw new Error('Use a short search query');
    if(args.route!==undefined&&(typeof args.route!=='string'||args.route.length>120||!args.route.startsWith('#/')))throw Error('Use an authored application route');
    const words=args.query.toLowerCase().split(/\W+/).filter(x=>x.length>2);
    return GUIDE.filter(g=>!args.route||g.route===args.route).map(g=>({...g,score:words.reduce((n,w)=>n+Number((g.title+' '+g.text).toLowerCase().includes(w)),0)})).filter(g=>g.score).sort((a,b)=>b.score-a.score).slice(0,5);
  }
  if(name==='lab.sidecars.status')return (await lab.statuses()).map(s=>({id:s.id,ready:s.ready,providerMode:s.providerMode,network:s.network,error:s.error}));
  if(name==='lab.operations.list')return [...lab.state.payments.map(p=>({id:p.id,kind:p.kind,state:p.state,network:p.network,sender:p.walletPubkey,amountLamports:p.amountLamports,asset:p.asset,amountAtomic:p.amountAtomic,requestId:p.requestId,createdAt:p.createdAt})),...(lab.state.workflows||[]).map(w=>({id:w.id,kind:w.kind,title:w.title,createdAt:w.createdAt,progress:lab.progress(w)}))].sort((a,b)=>a.createdAt-b.createdAt).slice(-16);
  if(name==='lab.operation.read'){if(typeof args.id!=='string'||args.id.length>100)throw new Error('Invalid operation ID');const workflow=(lab.state.workflows||[]).find(w=>w.id===args.id);if(workflow)return copy({id:workflow.id,kind:workflow.kind,title:workflow.title,network:workflow.network,sender:workflow.sender,progress:lab.progress(workflow),items:workflow.items,inputDigest:workflow.inputDigest,documentDigest:workflow.documentDigest,delivery:workflow.delivery?{complete:workflow.delivery.complete,digest:workflow.delivery.digest}:null,proofId:workflow.proofId,verification:workflow.verification});return copy(lab.payment(args.id));}
  return lab.receipts().slice(-4);
}
