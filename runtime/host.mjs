import {DEMO_PROFILE as PROFILE} from '../src/catalog.mjs';
import {clone,loadBrowserRuntime,directCall} from '../src/runtime.mjs';
let connected=false;
window.addEventListener('message',async e=>{
  if(connected||e.source!==parent||e.origin!==location.origin||e.data?.type!=='solana-lab:init'||!e.ports[0])return;
  connected=true;const port=e.ports[0];
  try {
    const {kind,rpcUrl,network}=e.data;
    if(!['recovery','network'].includes(kind))throw new Error('Unknown rehearsal');
    const plan=clone(PROFILE);plan.componentId='lab-'+kind;
    if(kind==='recovery')plan.library.selected.find(x=>x.id.endsWith('solana-arena')).config.failureMode='drop-response';
    else {
      const url=new URL(rpcUrl);
      if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Use a public HTTPS endpoint origin without a secret, query or token path.');
      if(!['devnet','testnet','mainnet-beta'].includes(network))throw new Error('Choose a supported network');
      plan.library.selected=plan.library.selected.filter(x=>x.id.endsWith('solana-conduit'));
      Object.assign(plan.library.selected[0].config,{providerMode:'direct-rpc',network,rpcUrl:url.href,maxRequestsPerSecond:3,requestTimeoutMs:10000});
    }
    const api=await loadBrowserRuntime(plan,{isolated:kind==='recovery'});
    port.onmessage=async({data})=>{
      try {
        if(kind==='network'&&(data.component!=='conduit'||!['status','request'].includes(data.method)))throw new Error('Network inspector only supports Conduit reads');
        if(kind==='network'&&data.method==='request'&&!['getVersion','getSlot','getBlockHeight'].includes(data.input?.method))throw new Error('RPC method is not available in this inspector');
        const result=await directCall(api,data.component,data.method,data.input);port.postMessage({id:data.id,result});
      }catch(err){port.postMessage({id:data.id,error:{code:err.code||'LAB_ERROR',message:err.message}});}
    };
    port.postMessage({id:0,result:{ready:true,kind}});
  }catch(err){port.postMessage({id:0,error:{message:err.message}});port.close();}
});
