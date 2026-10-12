// Required regression gate for the canonical recovery and ledger fixes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fixture} from './devnet-fixture.mjs';
import {Lab} from '../src/lab.mjs';

const results=[];
async function check(name,fn){try{await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,message:e.message});}}
for(const failed of [false,true])await check(failed?'failed transaction closes its original local ledger entry':'finalized transaction closes its original local ledger entry',async()=>{
  const f=fixture({walletMode:'device-wallet',confirmationStatus:'finalized',transactionError:failed?{InstructionError:[0,'fixture']}:null});
  const stored=new Map(),lab=new Lab({call:(c,m,i)=>f.api[c][m](i),storage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v)}});
  const wallet=await lab.connectWallet(),p=await lab.preparePayment({recipient:wallet.walletPubkey});
  await lab.approvePayment(p.id);await lab.submitPayment(p.id);const before=lab.payment(p.id).operation;
  await lab.reconcilePayment(p.id);await lab.reconcilePayment(p.id);
  const operation=lab.payment(p.id).operation,ledger=await f.api.circuit.read({operationId:p.id});
  assert.equal(f.sends,1);assert.equal(operation.signature,before.signature);assert.equal(operation.attemptId,before.attemptId);
  assert.equal(operation.state,failed?'failed':'finalised');
  assert.equal(ledger.state,operation.state,`Chain outcome is ${operation.state}, but Circuit remains ${ledger.state}: ${operation.recoveryError?.message||'no error supplied'}`);
  assert.equal(operation.recoveryError,undefined);
});
await check('damaged wallet storage has a supported recovery API that preserves the original bytes',async()=>{
  const f=fixture({walletMode:'device-wallet'}),api=f.api.latch,wallet=await api.walletCreate({network:'devnet',label:'Recovery fixture'});
  const backup=await api.walletExport({walletId:wallet.walletId,format:'backup'});
  const key=[...f.storage.keys()].find(k=>k.startsWith('capp.solana-wallets.v1:')&&!k.endsWith(':attempts')),damaged='{damaged-fixture';f.storage.set(key,damaged);
  await assert.rejects(api.walletImport({network:'devnet',label:'Restored fixture',backup}),/preserved/);
  assert.equal(f.storage.get(key),damaged);
  const recovery=await api.walletRecoveryStatus();
  await api.walletRecover({network:'devnet',label:'Restored fixture',backup,storeDigest:recovery.storeDigest,confirmAddress:wallet.walletPubkey,acknowledgeRecovery:true});
  assert.equal((await api.walletList()).wallets.some(w=>w.walletPubkey===wallet.walletPubkey),true);
  assert.ok([...f.storage.values()].some(value=>value===damaged),'Original damaged bytes must remain available for recovery');
});
const evidence={protocol:'capp.solana-lab.wallet-contracts.v1',source:'current shipped runtimes',results,passed:results.filter(r=>r.passed).length,unmet:results.filter(r=>!r.passed).length,networkUsed:false,nativeAcceptance:false};
for(const row of results)console.log((row.passed?'PASS ':'UNMET ')+row.name+(row.message?' — '+row.message:''));
console.log(JSON.stringify(evidence));
const outputIndex=process.argv.indexOf('--output');if(outputIndex>=0)await fs.writeFile(process.argv[outputIndex+1],JSON.stringify(evidence,null,2)+'\n');
if(evidence.unmet&&!process.argv.includes('--report'))process.exitCode=1;
