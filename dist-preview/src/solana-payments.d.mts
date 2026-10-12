/** Network-free payment helpers. Feed verification with your own trusted RPC
 * reads and server-owned request terms. No signing or fulfilment authority. */
export type SolanaNetwork = 'devnet' | 'mainnet-beta';
export type AtomicAmount = string;
export type AssetInput = {kind: 'native'; decimals?: 9} | {kind: 'spl-token'; mint: string; tokenProgram: string; decimals: number};
export type SolanaAsset = AssetInput & {protocol: 'capp.solana-asset.v1'; network: SolanaNetwork; genesisHash: string; decimals: number};
export interface PaymentRequestInput {
  requestId: string; network: SolanaNetwork; recipient: string; asset: AssetInput;
  amountAtomic: AtomicAmount; reference: string; createdAt: number; expiresAt: number;
  label?: string; message?: string; memo?: string; requestDigest?: string;
}
export interface PaymentRequest extends PaymentRequestInput {
  protocol: 'capp.solana-payment-request.v1'; genesisHash: string; asset: SolanaAsset;
  requestDigest: string; uri: string; label: string; message: string; memo: string;
}
export interface PaymentVerification {
  protocol: 'capp.solana-payment-verification.v1'; requestId: string; requestDigest: string;
  network: SolanaNetwork; genesisHash: string; signature: string; slot: number; blockTime: number;
  commitment: 'confirmed' | 'finalized'; confirmationStatus: 'confirmed' | 'finalized';
  recipient: string; sender: string; asset: SolanaAsset; amountAtomic: string; receivedAtomic: string;
  reference: string; transactionDigest: string; paid: true; simulated: false;
  source: 'rpc-observation'; authorises: false; fulfilmentRecorded: false; evidenceDigest: string;
}
export interface PaymentTransactionInput {
  paymentRequest: PaymentRequestInput; signature: string; transaction: [string, 'base64'];
  /** Unmodified getTransaction meta from the trusted RPC. */
  meta: Record<string, unknown>; slot: number; blockTime: number | null;
  confirmationStatus: 'processed' | 'confirmed' | 'finalized'; genesisHash: string;
  commitment?: 'confirmed' | 'finalized';
}
export declare const TOKEN: string;
export declare const GENESIS: Readonly<Record<SolanaNetwork, string>>;
export declare function assetDescriptor(network: SolanaNetwork, input?: AssetInput): SolanaAsset;
export declare function atomic(value: string, options?: {positive?: boolean}): AtomicAmount;
export declare function parseAmount(value: string, decimals: number): AtomicAmount;
export declare function formatAmount(value: AtomicAmount, decimals: number): string;
/** Derive the original SPL associated token address; no RPC or account creation. */
export declare function tokenAddress(owner: string, mint: string): Promise<string>;
/** Decode a trusted RPC base64 original SPL token account. Rejects missing,
 * frozen, uninitialized, wrapped-SOL and unsupported account layouts. */
export declare function tokenAccount(value: {owner: string; executable: boolean; data: [string, 'base64']}): {mint: string; owner: string; amountAtomic: AtomicAmount};
export declare function paymentReference(): string;
export declare function paymentRequest(input: PaymentRequestInput): Promise<PaymentRequest>;
export declare function verifyPaymentTransaction(input: PaymentTransactionInput): Promise<PaymentVerification>;
