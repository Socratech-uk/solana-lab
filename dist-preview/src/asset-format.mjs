import {formatAmount} from './solana-payments.mjs';
export const assetLabel=asset=>asset?.kind==='spl-token'?'tokens · '+asset.mint.slice(0,8)+'…'+asset.mint.slice(-4):'SOL';
export const paymentAmount=p=>p.asset?formatAmount(p.amountAtomic,p.asset.decimals)+' '+assetLabel(p.asset):(Number(p.amountLamports)/1e9).toLocaleString('en-US',{maximumFractionDigits:9})+' SOL';
export function sameAsset(a,b){return !!a&&!!b&&a.kind===b.kind&&a.network===b.network&&a.genesisHash===b.genesisHash&&a.decimals===b.decimals&&a.mint===b.mint&&a.tokenProgram===b.tokenProgram;}
