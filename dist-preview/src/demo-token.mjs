// Application-specific devnet demo policy. Generic Sidecar defaults still deny.
// Circle's published Solana devnet mint; on-chain decimals and balances are read.
export const DEVNET_DEMO_MINT='4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
export const DEMO_MINT_SOURCE='https://developers.circle.com/stablecoins/usdc-contract-addresses';
export const DEMO_TOKEN_LIMITS=JSON.stringify([{mint:DEVNET_DEMO_MINT,maxAmountAtomic:'1000000'}]);
export const DEMO_TOKEN_PROGRAMS=['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA','ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'];
