import {hasBoundDevnetReceipt} from './solana-client.mjs';
import {sameAsset} from './asset-format.mjs';
import {assetDescriptor} from './solana-payments.mjs';
export function receiptReady(p) {
  if((p.network||'demo')==='devnet'){
    const op=p.operation;
    if(!hasBoundDevnetReceipt(op)||op.operationId!==p.id||op.recipient!==p.recipient||op.sender!==p.walletPubkey)return false;
    // Native requests retain the compatible SOL operation format; SPL uses v4.
    const amountMatches=p.asset?.kind==='spl-token'?sameAsset(op.asset,p.asset)&&op.amountAtomic===p.amountAtomic:
      p.asset?sameAsset(p.asset,assetDescriptor('devnet'))&&!op.asset&&String(op.amountLamports)===p.amountAtomic:op.amountLamports===p.amountLamports;
    const requestMatches=!p.requestId||op.paymentRequest?.requestId===p.requestId&&op.paymentRequest?.requestDigest===p.requestDigest&&sameAsset(op.paymentRequest?.asset,p.asset)&&op.paymentRequest?.amountAtomic===p.amountAtomic;
    return amountMatches&&requestMatches;
  }
  const r=p.operation?.receipt;
  return !!(r?.simulated===true && r.operationId===p.id && ['confirmed','finalised'].includes(p.state));
}
