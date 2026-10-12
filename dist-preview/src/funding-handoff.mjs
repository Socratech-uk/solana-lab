import {DEVNET_DEMO_MINT} from './demo-token.mjs';
import {walletAddress} from './wallet-tools.mjs';

export const handoffAvailable=()=>!!(globalThis.capp?.guide?.supports?.handoff&&globalThis.capp?.links?.status?.().companionAvailable);

export function fundingHandoff({payer,mint='',needsSol=false,role='payer'}={}){
 try{walletAddress(payer);}catch{return null;}
 const label=role==='receiver'?'receiver':'payer';
 const usdc=!needsSol&&mint===DEVNET_DEMO_MINT;
 if(mint&&!usdc&&!needsSol)return null; // Never send another mint to the USDC faucet.
 return {id:`devnet-funding:${usdc?'usdc':'sol'}:${label}:${payer}`,url:usdc?'https://faucet.circle.com/':'https://faucet.solana.com/',title:usdc?'Get test USDC':label==='receiver'?'Get receiver test SOL':'Get test SOL',body:usdc?'Select USDC and Solana Devnet. Paste this '+label+' address and complete the faucet’s checks. Return to Guide to check the balance.':'Choose Devnet, paste this '+label+' address and complete the faucet’s checks. Return to Guide to check the balance.',copyLabel:(label==='receiver'?'Receiver':'Payer')+' wallet · Solana Devnet',copyText:payer};
}

export async function openFundingHandoff(input){
 const handoff=fundingHandoff(input),guide=globalThis.capp?.guide;
 if(!handoff||!guide?.supports?.handoff)return {opened:false,skipped:true};
 return guide.openHandoff(handoff);
}
