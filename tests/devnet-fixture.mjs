import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
const root=new URL('../',import.meta.url);
const names=['compass','circuit','switchyard','accord','conduit','sentinel','latch','arena','dispatch','witness','edge'];
export const config={
  compass:{providerMode:'local-intent',network:'devnet'},circuit:{providerMode:'local-store'},switchyard:{providerMode:'local-allocation'},accord:{providerMode:'local-control'},
  conduit:{providerMode:'direct-rpc',network:'devnet',rpcUrl:'https://fixture.invalid',allowWriteMethods:true,verifyDevnet:true,maxRequestsPerSecond:1000,queueRequests:true},
  sentinel:{providerMode:'conduit-peer',network:'devnet',verifySolTransfer:true,requireSimulation:false,allowedPrograms:'11111111111111111111111111111111,MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'},
  latch:{providerMode:'devnet-test-wallet',network:'devnet'},arena:{providerMode:'deterministic-local'},
  dispatch:{providerMode:'conduit-peer',network:'devnet',allowSubmission:true},witness:{providerMode:'conduit-peer',network:'devnet',commitment:'confirmed'},
  edge:{providerMode:'devnet',compositionMode:'auto',showCompositionPanel:false},
};
export function fixture({storage=new Map(),badNetwork=false,lostReply=false,policyError=false,walletMode='devnet-test-wallet',confirmationStatus='confirmed',transactionError=null,overrides={},environment={}}={}) {
  let sends=0,lastTransaction='',lastSignature='',calls=[],transactions=new Map();
  const state={badNetwork,lostReply,policyError,confirmationStatus,transactionError,seen:false};
  const ctx=vm.createContext({console,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,URL,URLSearchParams,AbortController,
    atob,btoa,setTimeout,clearTimeout,Headers,Response,isSecureContext:true,
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    CustomEvent:class{},__CAPP_EXECUTABLE_PLAN__:{appId:'devnet-fixture',projectId:'fixture',componentId:'main',library:{selected:names.map(n=>({id:'uk.capp.sidecar.solana-'+n,config:{...config[n],...(n==='latch'?{providerMode:walletMode,allowMainnetWallets:true}:{}),...overrides[n]}}))}},
    confirm:()=>true,dispatchEvent:()=>{},
    fetch:async(url,options)=>{
      assert.equal(String(url),'https://fixture.invalid/');
      const q=JSON.parse(options.body);calls.push(q.method);let result;
      if(q.method==='getGenesisHash')result=state.badNetwork?'wrong-genesis':'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
      else if(q.method==='getLatestBlockhash')result={context:{slot:10},value:{blockhash:state.blockhash||'11111111111111111111111111111111',lastValidBlockHeight:state.lastValidBlockHeight||200}};
      else if(q.method==='getFeeForMessage')result={context:{slot:10},value:5000};
      else if(q.method==='simulateTransaction')result={context:{slot:10},value:{err:state.policyError?{InstructionError:[0,'fixture']}:null,logs:[]}};
      else if(q.method==='isBlockhashValid')result={context:{slot:10},value:state.blockhashValid!==false};
      else if(q.method==='getBlockHeight')result=state.blockHeight||100;
      else if(q.method==='getBalance')result={context:{slot:10},value:1000000000};
      else if(q.method==='sendTransaction') {
        sends++;lastTransaction=q.params[0];
        const bytes=Uint8Array.from(atob(lastTransaction),c=>c.charCodeAt(0));
        const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        let n=0n;for(const b of bytes.slice(1,65))n=n*256n+BigInt(b);
        let s='';while(n){s=alphabet[Number(n%58n)]+s;n/=58n;}
        for(const b of bytes.slice(1,65)){if(b)break;s='1'+s;}
        lastSignature=s;result=s;state.seen=true;transactions.set(s,lastTransaction);
        if(state.lostReply)throw new TypeError('fixture lost reply after acceptance');
      } else if(q.method==='getSignatureStatuses')result={context:{slot:11},value:q.params[0].map(signature=>state.seen&&transactions.has(signature)?{slot:11,err:state.transactionError,confirmations:state.confirmationStatus==='finalized'?null:1,confirmationStatus:state.confirmationStatus}:null)};
      else if(q.method==='getTransaction')result=state.seen&&transactions.has(q.params[0])?{slot:11,meta:{err:state.transactionError},transaction:[transactions.get(q.params[0]),'base64']}:null;
      else throw Error('Undeclared fixture RPC '+q.method);
      return new Response(JSON.stringify({jsonrpc:'2.0',id:q.id,result}),{status:200,headers:{'content-type':'application/json'}});
    },
    ...environment,
  });
  ctx.window=ctx;
  for(const name of names){const file=name==='edge'?'solana-edge-shell.js':name+'-shell.js';vm.runInContext(fs.readFileSync(new URL(`runtime/${name}.js`,root),'utf8'),ctx);}
  return {api:ctx.capp.solana,ctx,storage,state,calls,get sends(){return sends;},get signed(){return lastTransaction;},get signature(){return lastSignature;}};
}
