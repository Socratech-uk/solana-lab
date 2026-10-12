// Signed transactions and observations are local fixtures, never network claims.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {fixture} from './devnet-fixture.mjs';
const context=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,URL,URLSearchParams,atob,btoa,isSecureContext:true});
vm.runInContext(fs.readFileSync(new URL('./fixtures/solana-wire.generated.js',import.meta.url),'utf8'),context);
export const wire=context.SolanaWire;
export const recipient=(await wire.createWallet()).address,mint=(await wire.createWallet()).address;
const programs=[wire.SYSTEM,wire.MEMO,wire.TOKEN,wire.ASSOCIATED_TOKEN].join(',');
export const amountAtomic='9007199254740993';
const raw=bytes=>({owner:wire.TOKEN,executable:false,lamports:2039280,data:[Buffer.from(bytes).toString('base64'),'base64']});
const mintRaw=decimals=>{const b=Buffer.alloc(82);b.writeBigUInt64LE(18446744073709551615n,36);b[44]=decimals;b[45]=1;return raw(b);};
const accountRaw=(mint,owner,balance=18446744073709551615n,frozen=false)=>{const b=Buffer.alloc(165);b.set(wire.addressBytes(mint));b.set(wire.addressBytes(owner),32);b.writeBigUInt64LE(balance,64);b[108]=frozen?2:1;return raw(b);};
function keyIndex(message,key){const b=Buffer.from(message,'base64');for(let i=0;i<b[3];i++)if(b.subarray(4+32*i,36+32*i).equals(Buffer.from(wire.addressBytes(key))))return i;throw Error('Missing fixture key');}
export function capabilityFixture({allowed=true,overrides={},mintAddress=mint}={}){
 const mint=mintAddress;
 const state={sender:null,recipient,solBalances:new Map(),decimals:6,sourceMissing:false,sourceBalance:18446744073709551615n,sourceFrozen:false,finality:'finalized',slot:21,blockTime:Math.floor(Date.now()/1000),transactions:new Map(),noCredit:false,lostReply:false,activityPages:null};
 const calls=[];let sends=0;
 const fetch=async(url,options)=>{
  assert.equal(String(url),'https://fixture.invalid/');const q=JSON.parse(options.body);calls.push(q);let result;
  if(q.method==='getGenesisHash')result=wire.DEVNET_GENESIS;
  else if(q.method==='getLatestBlockhash')result={context:{slot:20},value:{blockhash:state.blockhash||wire.SYSTEM,lastValidBlockHeight:state.lastValidBlockHeight||200}};
  else if(q.method==='getMultipleAccounts')result={context:{slot:20},value:[mintRaw(state.preparationDecimals??state.decimals),state.sourceMissing?null:accountRaw(mint,state.sender,state.sourceBalance,state.sourceFrozen),null]};
  else if(q.method==='getMinimumBalanceForRentExemption')result=q.params[0]===0?890880:2039280;
  else if(q.method==='getBalance')result={context:{slot:20},value:state.solBalances.get(q.params[0])??15000000000};
  else if(q.method==='getFeeForMessage')result={context:{slot:20},value:5000};
  else if(q.method==='isBlockhashValid')result={context:{slot:20},value:state.blockhashValid!==false};
  else if(q.method==='getBlockHeight')result=state.blockHeight||100;
  else if(q.method==='simulateTransaction')result={context:{slot:20},value:{err:null}};
  else if(q.method==='sendTransaction'){
   sends++;const signed=q.params[0],message=wire.transactionMessage(signed),facts=await wire.inspectTransfer(message),signature=await wire.verify(signed,message,facts.sender),base={err:null,fee:5000};let meta;
   if(facts.asset){const index=keyIndex(message,facts.destinationTokenAccount),balance=value=>({accountIndex:index,mint,owner:state.recipient,programId:wire.TOKEN,uiTokenAmount:{amount:value,decimals:6,uiAmount:null}});meta={...base,preTokenBalances:[],postTokenBalances:[balance(facts.amountAtomic)]};}
   else{const count=Buffer.from(message,'base64')[3],index=keyIndex(message,facts.recipient),preBalances=Array(count).fill(10000000),postBalances=[...preBalances];postBalances[index]+=facts.amountLamports;meta={...base,preBalances,postBalances};}
   state.transactions.set(signature,{signed,meta,facts,blockTime:Math.floor(Date.now()/1000)});result=signature;if(state.lostReply)throw Error('Lost response after acceptance');
  }
  else if(q.method==='getSignatureStatuses')result={context:{slot:21},value:q.params[0].map(signature=>state.transactions.has(signature)?{slot:21,err:null,confirmationStatus:state.finality,confirmations:null}:null)};
  else if(q.method==='getTransaction'){const tx=state.transactions.get(q.params[0]);const meta=tx&&structuredClone(tx.meta);if(meta&&state.noCredit){if(meta.postBalances)meta.postBalances=[...meta.preBalances];if(meta.postTokenBalances)meta.postTokenBalances[0].uiTokenAmount.amount='0';}result=tx?{slot:21,meta,transaction:[tx.signed,'base64'],blockTime:state.blockTimeOverride??tx.blockTime}:null;}
  else if(q.method==='getAccountInfo')result={context:{slot:20},value:q.params[0]===mint?mintRaw(state.decimals):state.sourceMissing?null:accountRaw(mint,state.sender,state.sourceBalance,state.sourceFrozen)};
  else if(q.method==='getTokenAccountsByOwner')result={context:{slot:20},value:[{pubkey:await wire.tokenAddress(q.params[0],mint),account:accountRaw(mint,q.params[0])}]};
  else if(q.method==='getSignaturesForAddress')result=state.activityPages?state.activityPages(q.params):[...state.transactions].map(([signature])=>({signature,slot:21,err:null,confirmationStatus:state.finality,blockTime:state.blockTime,memo:null}));
  else throw Error('Unexpected capability fixture RPC '+q.method);
  return new Response(JSON.stringify({jsonrpc:'2.0',id:q.id,result}),{status:200,headers:{'content-type':'application/json'}});
 };
 const limits=JSON.stringify(allowed?[{mint,maxAmountAtomic:'18446744073709551615'}]:[]);
 const f=fixture({overrides:{sentinel:{allowedPrograms:programs,tokenLimits:limits,maxAccountRentLamports:3000000},latch:{tokenLimits:limits},...overrides},environment:{fetch}});
 return {api:f.api,ctx:f.ctx,fetch,state,calls,get sends(){return sends;}};
}
