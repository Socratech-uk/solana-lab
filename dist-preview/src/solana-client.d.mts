/** Thin application client. Provider-specific schemas remain authoritative. */
import type {PaymentRequest, PaymentRequestInput, PaymentVerification, SolanaAsset, SolanaNetwork} from './solana-payments.mjs';
export type JsonValue = null | boolean | number | string | JsonValue[] | {[key: string]: JsonValue};
export type JsonObject = {[key: string]: JsonValue};
export interface SolanaMethods {
  edge: 'status'|'composition'|'prepare'|'preflight'|'authorise'|'submit'|'transactionStatus'|'receipt'|'prepareTokenTransfer'|'preparePayment'|'refresh';
  compass: 'status'|'classify'|'intent'|'paymentRequest';
  circuit: 'status'|'reserve'|'read'|'beginAttempt'|'transition'|'trace';
  switchyard: 'status'|'allocate'|'read'|'transition'|'manifest';
  accord: 'status'|'createGroup'|'group'|'request'|'approve'|'quorum';
  conduit: 'status'|'request'|'verifyNetwork'|'inspect'|'openSettings'|'balance'|'asset'|'tokenAccounts'|'activity'|'transaction';
  sentinel: 'status'|'evaluate'|'preflight';
  latch: 'status'|'authorise'|'connect'|'walletList'|'walletCreate'|'walletImport'|'walletSelect'|'walletRename'|'walletRemove'|'walletUnlock'|'walletLock'|'walletExport'|'walletConnectExternal'|'walletDisconnectExternal'|'walletRecoveryStatus'|'walletRecover';
  arena: 'status'|'execute'|'read'|'position'|'evidenceTransfer';
  dispatch: 'status'|'submit'|'read'|'reconcile';
  witness: 'status'|'observe'|'appendEvidence'|'receipt'|'readReceipt'|'trace'|'transactionEvidence'|'verifyPayment';
}
export type SolanaAPI = {[C in keyof SolanaMethods]?: Partial<Record<SolanaMethods[C], (input: JsonObject) => JsonValue | Promise<JsonValue>>>};
export declare const SOLANA_METHODS: Readonly<{[C in keyof SolanaMethods]: readonly SolanaMethods[C][]}>;
export interface SolanaClient {
  available(): {[C in keyof SolanaMethods]: SolanaMethods[C][]};
  call(component: 'latch', method: 'status', input?: JsonObject): Promise<JsonObject & {signingPolicyStatus?: boolean; signingPolicy?: SigningPolicyStatus}>;
  call(component: 'compass', method: 'paymentRequest', input: PaymentRequestInput): Promise<PaymentRequest>;
  /** Explicitly replace only an expired, never-submitted review. Requires fresh preflight and approval. */
  call(component: 'edge', method: 'refresh', input: {operationId: string}): Promise<JsonObject>;
  call(component: 'latch', method: 'walletCreate', input: {network: SolanaNetwork; label?: string; select?: boolean; password?: string; acknowledgeMainnetLoss?: boolean}): Promise<JsonObject>;
  call(component: 'edge', method: 'prepareTokenTransfer', input: TokenTransferInput): Promise<JsonObject>;
  call(component: 'edge', method: 'preparePayment', input: {operationId: string; walletPubkey: string; paymentRequest: PaymentRequestInput; legKey?: string}): Promise<JsonObject>;
  call(component: 'witness', method: 'verifyPayment', input: {paymentRequest: PaymentRequestInput; signature: string; commitment?: 'confirmed' | 'finalized'}): Promise<PaymentVerification>;
  call(component: 'conduit', method: 'asset', input: {network: SolanaNetwork; mint: string}): Promise<AssetObservation>;
  call<C extends keyof SolanaMethods>(component: C, method: SolanaMethods[NoInfer<C>], input?: JsonObject): Promise<JsonValue>;
}
export declare function createSolanaClient(resolve?: () => SolanaAPI | undefined): SolanaClient;
/** Public configured limits only; absent on older Latch builds. */
export type SigningPolicyStatus = {
  protocol: 'capp.solana-signing-policy.v1'; network: string;
  enforcedLocally: boolean; maxLamports: number | null; tokenLimits: string | null;
  authorises: false;
};
/** Binding check on trusted Edge/Witness results, not a verifier for imported receipts. */
export declare function hasBoundDevnetReceipt(operation: unknown): boolean;
export type {SolanaNetwork, AtomicAmount, AssetInput, SolanaAsset, PaymentRequest, PaymentRequestInput, PaymentVerification} from './solana-payments.mjs';
export interface TokenTransferInput {
  operationId: string; network: 'devnet'; walletPubkey: string; recipient: string;
  asset: {kind: 'spl-token'; mint: string; tokenProgram: string; decimals: number};
  amountAtomic: string; legKey?: string; references?: string[];
  commitment?: {namespace: string; sha256: string};
}
export interface AssetObservation {
  protocol: 'capp.solana-asset-observation.v1'; asset: SolanaAsset; decimals: number; supplyAtomic: string;
  mintAuthority: string | null; freezeAuthority: string | null; slot: number; genesisHash: string;
  observedAt: number; source: 'rpc-observation'; metadataAuthenticated: false;
}
