import {Lab,uid,digest,lamports,devnetAddress} from './lab.mjs';
import {hasBoundDevnetReceipt} from './solana-client.mjs';
const clone=value=>JSON.parse(JSON.stringify(value));
export async function textDigest(text) {
  if(typeof text!=='string'||!text.trim()||new TextEncoder().encode(text).length>24000)throw Error('Use 1–24,000 bytes of text.');
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
}
export class ShowcaseLab extends Lab {
  reload(){super.reload();if(this.state.workflows===undefined)this.state.workflows=[];if(!Array.isArray(this.state.workflows))throw Error('Workflow records are unreadable. Export the records before repair.');}
  workflow(id){const row=this.state.workflows.find(w=>w.id===id);if(!row)throw Error('Workflow not found');return row;}
  async requireCommitments(){const status=await this.rawCall('edge','status',{});if(status?.supports?.applicationCommitment!==true||status?.supports?.operationMemo!==true)throw Error('These service recipes need Solana Edge 0.4.1 or later. Update cApp, recompile Solana Lab and rebuild the installed app before preparing a payment.');}
  async createWorkflow(input){return this.run(()=>this.recordWorkflow(input));}
  async recordWorkflow({kind,title='',text='',amount='0.00001',recipient='',walletPubkey='',recipients=[],source=null}){
    if(!['service','batch','proof'].includes(kind))throw Error('Unknown service workflow');
    if(this.network!=='devnet')throw Error('Connected services require devnet.');
    await this.requireCommitments();
    this.ensureCapacity(this.state.workflows);
    const sender=devnetAddress(walletPubkey||(await this.rawCall('latch','status')).wallet?.walletPubkey,'sender');
    const id=uid(kind),row={id,kind,title:String(title||{service:'JSON report',batch:'Contributor payouts',proof:'Document commitment'}[kind]).slice(0,100),createdAt:Date.now(),network:'devnet',sender,items:[],source};
    if(kind==='service'){
      await textDigest(text);let data;try{data=JSON.parse(text);}catch{throw Error('The report service accepts valid JSON.');}
      if(!data||typeof data!=='object')throw Error('Use a JSON object or array.');
      row.text=text;row.inputDigest=await textDigest(text);
    } else if(kind==='proof'){row.text=text;row.documentDigest=await textDigest(text);}
    const entries=kind==='batch'?recipients:[{recipient,amount,label:row.title}];
    if(!Array.isArray(entries)||entries.length<1||entries.length>5||(kind==='batch'&&entries.length<2))throw Error('A batch contains 2–5 payments.');
    for(const entry of entries){
      const item={id:uid('item'),operationId:uid(kind+'_payment'),label:String(entry.label||'Payment').slice(0,64),recipient:devnetAddress(entry.recipient),amountLamports:lamports(entry.amount)};
      const sha256=kind==='proof'?row.documentDigest:await digest({workflowId:id,itemId:item.id,inputDigest:row.inputDigest||null,sender,recipient:item.recipient,amountLamports:item.amountLamports});
      item.commitment={namespace:{service:'service-order',batch:'batch-item',proof:'document'}[kind],sha256};row.items.push(item);
    }
    if(row.items.reduce((n,i)=>n+i.amountLamports,0)>1e9)throw Error('Keep the total at or below 1 devnet SOL, plus fees.');
    if(this.state.payments.length+row.items.length>64)throw Error('Export your records; this workspace has reached its payment limit.');
    // The parent and every child identity are durable before any RPC or wallet effect.
    this.state.workflows.push(row);this.save();return clone(row);
  }
  itemPayment(workflow,item){return this.state.payments.find(p=>p.id===item.operationId&&p.parentId===workflow.id);}
  assertItem(workflow,item,payment){
    if(!payment||payment.parentId!==workflow.id||payment.id!==item.operationId||payment.network!=='devnet'||payment.kind!==workflow.kind||payment.walletPubkey!==workflow.sender||payment.recipient!==item.recipient||payment.amountLamports!==item.amountLamports||JSON.stringify(payment.commitment)!==JSON.stringify(item.commitment))throw Error('The saved payment does not match this workflow. Keep both records for inspection.');
  }
  paid(workflow,item){
    const p=this.itemPayment(workflow,item);if(!p)return false;
    try{this.assertItem(workflow,item,p);}catch{return false;}
    const op=p.operation;return hasBoundDevnetReceipt(op)&&op.operationId===item.operationId&&op.sender===workflow.sender&&op.recipient===item.recipient&&op.amountLamports===item.amountLamports&&op.commitment?.namespace===item.commitment.namespace&&op.commitment?.sha256===item.commitment.sha256;
  }
  progress(workflow){return {total:workflow.items.length,confirmed:workflow.items.filter(i=>this.paid(workflow,i)).length,unresolved:workflow.items.filter(i=>['unknown','submitting','submitted','authority-pending'].includes(this.itemPayment(workflow,i)?.state)).length};}
  async prepareWorkflowPayment(id,itemId,guard){return this.run(async()=>{
    guard?.();
    await this.requireCommitments();
    const w=this.workflow(id),item=w.items.find(i=>i.id===itemId);if(!item)throw Error('Payment not found in this workflow');
    const p=this.state.payments.find(p=>p.id===item.operationId);
    if(p){this.assertItem(w,item,p);return ['preparing','prepared'].includes(p.state)?this.prepareExisting(p):clone(p);}
    return this.recordPayment({kind:w.kind,parentId:w.id,operationId:item.operationId,walletPubkey:w.sender,recipient:item.recipient,amount:(BigInt(item.amountLamports)/1000000000n)+'.'+String(item.amountLamports%1e9).padStart(9,'0'),commitment:item.commitment});
  });}
  async deliverService(id){return this.run(async()=>{
    const w=this.workflow(id);if(w.kind!=='service')throw Error('This workflow is not a service order');
    if(!w.items.every(i=>this.paid(w,i)))throw Error('Delivery waits for a bound, observed devnet receipt. Reconcile the payment first.');
    if(await textDigest(w.text)!==w.inputDigest)throw Error('The service input changed after payment preparation.');
    if(w.delivery?.complete)return clone(w.delivery);
    if(!w.delivery){
      const data=JSON.parse(w.text),rows=Array.isArray(data)?data:[data],keys=[...new Set(rows.flatMap(r=>r&&typeof r==='object'&&!Array.isArray(r)?Object.keys(r):[]))].sort();
      const numericTotals=Object.fromEntries(keys.map(k=>[k,rows.reduce((n,r)=>typeof r?.[k]==='number'&&Number.isFinite(r[k])?n+r[k]:n,0)]).filter(([k])=>rows.some(r=>typeof r?.[k]==='number')));
      if(Object.values(numericTotals).some(v=>!Number.isFinite(v)))throw Error('Numeric totals exceed the report range.');
      const artifact={protocol:'capp.solana-lab.report.v1',orderId:w.id,inputDigest:w.inputDigest,rows:rows.length,fields:keys,numericTotals,paymentReceipt:w.items.map(i=>this.itemPayment(w,i).operation.receipt.receiptDigest)};
      const text=JSON.stringify(artifact,null,2);w.delivery={artifact,text,digest:await textDigest(text),complete:false};this.save();
    }
    const p=this.itemPayment(w,w.items[0]);
    w.delivery.evidence=await this.call('witness','appendEvidence',{operationId:p.id,attemptId:p.operation.attemptId,kind:'service-delivery',source:'application',payload:{operationId:p.id,attemptId:p.operation.attemptId,receiptDigest:w.delivery.artifact.paymentReceipt[0],proofDigest:w.delivery.digest,evidenceKind:'local-report-delivery',network:'devnet',simulated:false}});
    w.delivery.complete=true;this.save();return clone(w.delivery);
  });}
  async anchorDelivery(id){return this.run(async()=>{
    const order=this.workflow(id);if(!order.delivery?.complete)throw Error('Deliver the report first.');
    if(order.proofId)return clone(this.workflow(order.proofId));
    // Recovery also finds a linked child if a previous save wrote the child but lost the parent link.
    const old=this.state.workflows.find(w=>w.kind==='proof'&&w.source?.orderId===id);
    const proof=old||await this.recordWorkflow({kind:'proof',title:'Report commitment',text:order.delivery.text,recipient:order.items[0].recipient,amount:'0.00001',source:{orderId:id,deliveryDigest:order.delivery.digest}});
    order.proofId=proof.id;this.save();return clone(proof);
  });}
  async verifyDocument(id,text){return this.run(async()=>{
    const w=this.workflow(id);if(w.kind!=='proof')throw Error('Choose a document commitment');
    const suppliedDigest=await textDigest(text);w.verification={suppliedDigest,matches:suppliedDigest===w.documentDigest,chainObserved:this.paid(w,w.items[0]),checkedAt:Date.now()};this.save();return clone(w.verification);
  });}
}
