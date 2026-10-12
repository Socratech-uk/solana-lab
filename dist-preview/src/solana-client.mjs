/** Small application client for independently selected Solana Sidecars.
 * No provider startup, wallet approval, submission retry or authority escalation.
 */
export const SOLANA_METHODS = Object.freeze(Object.fromEntries(Object.entries({
  edge: ['status','composition','prepare','preflight','authorise','submit','transactionStatus','receipt','prepareTokenTransfer','preparePayment','refresh'],
  compass: ['status','classify','intent','paymentRequest'],
  circuit: ['status','reserve','read','beginAttempt','transition','trace'],
  switchyard: ['status','allocate','read','transition','manifest'],
  accord: ['status','createGroup','group','request','approve','quorum'],
  conduit: ['status','request','verifyNetwork','inspect','openSettings','balance','asset','tokenAccounts','activity','transaction'],
  sentinel: ['status','evaluate','preflight'], latch: ['status', 'authorise', 'connect', 'walletList', 'walletCreate', 'walletImport', 'walletSelect', 'walletRename', 'walletRemove', 'walletUnlock', 'walletLock', 'walletExport', 'walletConnectExternal', 'walletDisconnectExternal', 'walletRecoveryStatus', 'walletRecover'],
  arena: ['status','execute','read','position','evidenceTransfer'],
  dispatch: ['status','submit','read','reconcile'],
  witness: ['status','observe','appendEvidence','receipt','readReceipt','trace','transactionEvidence','verifyPayment'],
}).map(([name, methods]) => [name, Object.freeze(methods)])));

export function createSolanaClient(resolve = () => globalThis.capp?.solana) {
  if (typeof resolve !== 'function') throw new TypeError('Pass a resolver for the owning app API');
  return Object.freeze({
    available() {
      const api = resolve();
      return Object.fromEntries(Object.entries(SOLANA_METHODS).map(([component, methods]) =>
        [component, methods.filter(method => typeof api?.[component]?.[method] === 'function')]));
    },
    async call(component, method, input = {}) {
      if (!Object.hasOwn(SOLANA_METHODS, component) || !SOLANA_METHODS[component].includes(method)) throw new Error('Tool is not declared');
      const peer = resolve()?.[component];
      if (typeof peer?.[method] !== 'function') throw new Error(component + ' is not available in this build.');
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Use a JSON argument object');
      const encoded = JSON.stringify(input);
      if (typeof encoded !== 'string') throw new TypeError('Use a JSON argument object');
      if (encoded.length > 131072) throw new Error('Sidecar arguments exceed the client limit');
      const value = JSON.parse(encoded);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Use a JSON argument object');
      return peer[method](value);
    },
  });
}

/** Checks binding of evidence already returned by Edge/Witness. It is not a
 * server-side receipt verifier and does not turn caller-supplied data into proof.
 */
export function hasBoundDevnetReceipt(operation) {
  const row = operation, receipt = row?.receipt, chain = row?.chainEvidence;
  if (!row || row.network !== 'devnet' || row.simulated !== false ||
      !['confirmed','finalised'].includes(row.state) || receipt?.network !== 'devnet' ||
      receipt.simulated !== false || receipt.commitmentMet !== true ||
      chain?.network !== 'devnet' || chain.simulated !== false || chain.wireVerified !== true) return false;
  for (const field of ['operationId','attemptId','signature','messageDigest','transactionDigest']) {
    if (!row[field] || receipt[field] !== row[field] || chain[field] !== row[field]) return false;
  }
  return /^[a-f0-9]{64}$/.test(row.transactionDigest) &&
    chain.observedTransactionDigest === row.transactionDigest &&
    ['confirmed','finalised'].includes(receipt.observedState);
}
