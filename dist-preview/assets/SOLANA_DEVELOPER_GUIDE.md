# Solana Sidecar developer guide

Reusable capabilities for operations that can be inspected, recovered and composed.

## Start here

Select a recipe, then the capabilities it needs.

For a standalone browser Lab, the shipped runtimes load with the reviewed devnet profile. For installed Lab, select the Solana Lab preset, compile this web project and rebuild the installer. It uses the owning installed runtime; missing providers do not trigger a browser replacement.

Open Wallets to create a saved devnet wallet, fund it from the faucet, then choose an existing funded recipient. Back up the wallet before clearing app data. A self-transfer records a memo but pays nobody else; fees are additional.

New devnet operations require Sentinel to allow the System program and Memo program (MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr). The Lab preset includes both. Existing custom settings are preserved; update them explicitly if policy blocks a new memo.

Begin with Service desk for a connected journey, or Pocket checkout for a single transfer. Review, sign, send and reconcile are separate controls. Nothing in the architecture map submits a transaction.

## Operations and recovery

Make identity survive the failure.

Persist an operation ID and the intended sender, recipient, amount and commitment before preparation. Reuse that identity for the same work. A different intent must not overwrite an existing operation.

Edge’s devnet states include prepared, preflighted, authority-pending, authorised, submitting, submitted, unknown, confirmed, finalised, blocked, failed and expired. Not every provider supports every state. Keep the returned state and error together.

After submission or a lost response, call transactionStatus with the existing operation ID. Do not call prepare with a new ID as an automatic retry. A missing observation remains unresolved.

New transactions include a memo bound to operation ID and request digest. Distinct operations with identical amounts remain distinct even when they use the same blockhash. Persisted prepared transactions retain their bytes.

Local ledgers depend on app/origin storage. Export records before moving devices or clearing data. Browser tab locks coordinate this Lab where Web Locks is available; Sidecar local storage is not a distributed locking service.

## Choose your Sidecars

Provider modes determine dependencies.

You do not need all eleven for every app. Conduit alone supports RPC reads. Compass alone shapes intent; Circuit tracks a local operation; Accord rehearses member approval; Switchyard manages resource records; Arena simulates execution.

Edge devnet composes Circuit, Sentinel, Latch, Dispatch, Witness and Conduit. Compass is optional. Accord and Switchyard are application-composed extensions, not implicit prerequisites of every payment.

For positions, Solana Lab calls Compass, Circuit, Sentinel, Switchyard, Arena and Witness itself and consumes Market Pulse separately. An optional evidence transfer then uses Edge’s devnet path.

An external adapter can replace a provider, but its authentication, availability and production guarantees are yours to implement and test. Selecting a component does not deploy a managed service.

## What a receipt establishes

A successful send response is only one fact.

For live Edge operations, Witness checks genesis, signature observation and equality of the complete signed transaction bytes returned by RPC. A usable receipt must also meet the configured commitment.

The helper hasBoundDevnetReceipt checks field binding on trusted Edge/Witness output. It does not authenticate arbitrary imported JSON. A remote merchant must independently verify the chain transaction, expected network, recipient, amount, commitment and single-use fulfilment.

Local Accord reviews, Arena outcomes and application evidence keep their original scope. A hash does not transform a simulation or an application assertion into a chain fact.

A document memo commits a namespace and SHA-256 digest of exact UTF-8 bytes. It establishes a recorded commitment; it does not establish the author, truth, ownership or confidentiality of the document.

## Connected service recipes

Three reusable handoffs.

Service desk: persist a JSON report order → review its devnet payment → reconcile the exact receipt → generate the report → append delivery evidence → optionally anchor the report in Proof studio. Repeat delivery returns the same artifact.

Payout desk: reserve a batch and every child ID before work starts. Prepare, approve, send and reconcile each item separately. A partial batch is not rolled back, and confirmed items are not resent. It is not an atomic multi-recipient transaction.

Proof studio: hash bounded text locally → prepare a small devnet transfer with the document commitment → obtain an observed receipt → compare another copy of the text. The document itself is never put in the memo.

Position studio: capture a fresh price → simulate open/reduce/close in Arena → retain evidence → sweep the off-chain bucket for reuse. The optional 1/10,000 transfer is a separate payment, not a trade settlement.

## Application client

A thin interface over declared APIs.

Use createSolanaClient(() => window.capp.solana) with the API belonging to your app. Its method allowlist is shared with the Lab. available() reports method presence; call status for provider readiness.

The client validates bounded JSON arguments and preserves the method receiver. It does not start providers, add permissions, approve signatures, retry sends or conceal missing Sidecars.

Market Pulse has its own client API and shared polling lifecycle. The eleven Solana Sidecars are exposed at window.capp.solana. Code examples here assume those APIs are present in the owning app.

Typed method names and JSON inputs are provided as a small source SDK. Provider-specific result shapes remain versioned runtime contracts; this is not a generated full schema binding.

## Providers and distribution

Keep network and authority explicit.

Configure RPC endpoints and the chosen distributable client token in Conduit. Inspect the payment connection there. The advanced read-only connection cannot change the build-owned payment network or submit transactions.

A distributed token is extractable. This version does not issue ephemeral provider tokens. Deploying your own authenticated adapter or credential broker is a separate integration.

Local AI is optional and can explain guidance and inspect bounded read tools. It does not gain wallet authority or submit these workflows. Guide teaches the same recipes and links to developer docs.

The included tests use actual runtimes with deterministic RPC fixtures. They establish behavior under those fixtures; installed Windows/Android, production wallet and live provider acceptance must be checked on those targets.

Latch device-wallet mode stores devnet keypairs in app data and mainnet keypairs as AES-256-GCM ciphertext derived from a user password with PBKDF2-SHA256 (600,000 iterations). This is experimental custody, not an audited wallet or hardware-backed key store. Mainnet accounts support create/import, receive, balance, lock/unlock and backup/export; mainnet signing remains disabled.

Wallet Standard discovery can connect compatible wallets exposed in the owning browser or host, including Solflare when it advertises the selected network and signTransaction feature. Missing providers remain unavailable. This does not add native Android MWA or a mobile deeplink transport. Wallet accounts and exact returned signed bytes are checked before accepting a devnet signature.

Call walletCreate, walletImport, walletUnlock and walletExport directly from an explicit owner UI. Never send their input or result to activity logs, an assistant, analytics or receipt exports. Encrypted backups require their password; raw keypair exports are explicitly confirmed and unencrypted. Wallet labels and addresses are public metadata, not secrets.

## Asset-aware payments and independent verification

Build token payments and invoices from the existing Sidecars. No additional Sidecar or custom indexer is required.

A token is identified by network, genesis, mint and program; amounts are exact unsigned integer strings. Conduit reads mint precision and account state. Sentinel checks the configured mint ceiling, network fee and possible recipient account rent before Latch signs the exact reviewed bytes.

Compass creates a Solana Pay transfer request with a durable reference. Edge can prepare its payment, while Witness can verify a payer’s independently submitted transaction against the trusted saved terms and actual recipient credit. Remote fulfilment still needs a server-owned atomic invoice/signature claim; local client state is not that authority.

See [asset payment integration](SOLANA_ASSET_PAYMENTS.md) for build settings, API examples, supported wallet transaction forms, read limits and remaining native qualification.

## Recover an expired review

A short-lived transaction review may expire before any submission. Refresh that review explicitly; reconcile an uncertain send.

Edge checks blockhash validity before wallet approval and records expired state when the transaction was never submitted. Use edge.refresh({operationId}) only on an expired, never-submitted operation. It retains the old record, returns one durable successor and keeps the saved sender, recipient, asset, amount, commitment and logical leg. Repeat calls resume the same successor. Save its returned operationId in the application workflow, then run preflight and request new wallet and team approvals. Refresh never signs or sends.

A Circuit attempt, unknown authority outcome or submitted transaction prevents refresh, even if its blockhash is now old. Keep reconciling its original signature. A payment request’s own expiry is separate and cannot be extended by refreshing its transaction.

Latch walletCreate({network:"devnet",label:"Receiver",select:false}) can create a test receiver without changing the payer. Check status.walletCreateKeepsSelection first. No token balance or permission is implied, and backups remain the user’s responsibility.

## Sidecar reference

### Solana Edge

Compose reviewed SOL and SPL-token payments on devnet, with durable attempts and exact receipts.

**Standalone:** Use Edge as a small operation coordinator, or call the other Sidecars directly. Apps retain ownership of business logic.

**Dependencies:** Devnet requires Circuit, Sentinel, Latch, Dispatch, Witness and Conduit. Compass is optional. Explicit demo mode can use Arena; devnet never falls back to it.

**Scope:** Devnet signing supports native SOL and original SPL Token Program transfers through associated token accounts. Token-2022, wrapped SOL, swaps and mainnet signing require separate providers. Exact bytes and retained attempts survive retries; token amounts are atomic strings.

Calls: `status`, `composition`, `prepare`, `preflight`, `authorise`, `submit`, `transactionStatus`, `receipt`, `prepareTokenTransfer`, `preparePayment`, `refresh`.

### Compass

Shape payment and position intents, and create Solana Pay transfer requests.

**Standalone:** Use it to normalize application requests and preserve operation or position identity.

**Dependencies:** Local planning needs no peers. An external mode needs your configured adapter. Edge can shape a simple transfer when Compass is absent.

**Scope:** An intent does not choose a wallet, authorize a payment or establish that a trade is safe. Payment requests contain explicit network/expiry alongside a Solana Pay URI; the standard URI does not encode those constraints.

Calls: `status`, `classify`, `intent`, `paymentRequest`.

### Circuit

Reserves operation IDs, tracks attempts and protects a pending execution leg from conflicting work.

**Standalone:** Use the local ledger for a workflow that needs durable attempts and explicit transitions.

**Dependencies:** Local storage needs no peers. Applications supply the evidence for terminal transitions; a remote provider can replace local storage.

**Scope:** Local persistence is scoped to this app and origin. It is not a distributed database or a cross-device lock. A timeout does not release an unresolved leg.

Calls: `status`, `reserve`, `read`, `beginAttempt`, `transition`, `trace`.

### Sentinel

Check exact SOL or SPL-token payments, per-mint limits, fees, rent and account state.

**Standalone:** Evaluate declared metadata, or decode and simulate a supported serialized SOL or SPL-token payment.

**Dependencies:** RPC simulation uses Conduit in a compatible network or your configured adapter. Edge devnet requires transfer verification.

**Scope:** Token preflight requires Conduit, a configured per-mint atomic ceiling, verified mint/account state, sufficient SOL fees/rent, and simulation of the exact bytes. A policy pass never grants wallet authority.

Calls: `status`, `evaluate`, `preflight`.

### Latch

Manage wallets and approve exact devnet SOL or explicitly allowed SPL-token payments.

**Standalone:** Manage device wallets or connect a compatible Wallet Standard provider. Request approval for one exact devnet transaction.

**Dependencies:** Device-wallet signing requires Conduit for devnet verification. Wallet Standard needs a compatible provider exposed in the owning browser or host. Native MWA remains a host implementation contract.

**Scope:** Devnet device keys are stored unencrypted. Mainnet management requires password encryption and a prominent loss warning; mainnet signing is disabled. The older temporary provider still loses its key on reload. This alpha is not an audited wallet. Explicit damaged-store recovery requires a verified independent backup and retains the original bytes before replacement. Other wallets require separate backups; payment and signing history is preserved. Token signing also requires its own per-mint atomic limits; the confirmation names the mint, accounts and amount.

Calls: `status`, `authorise`, `connect`, `walletList`, `walletCreate`, `walletImport`, `walletSelect`, `walletRename`, `walletRemove`, `walletUnlock`, `walletLock`, `walletExport`, `walletConnectExternal`, `walletDisconnectExternal`, `walletRecoveryStatus`, `walletRecover`.

### Dispatch

Records a bounded attempt before sending and retains the signature when a reply is lost.

**Standalone:** Submit already signed bytes through a selected transport; read or reconcile the same attempt later.

**Dependencies:** Direct chain submission uses Conduit. Arena mode uses Arena. Reconciliation can use Witness; an external adapter can implement the provider.

**Scope:** Dispatch never signs. A lost response is unknown, not permission to construct another payment. Mainnet writes need explicit gates outside this Lab.

Calls: `status`, `submit`, `read`, `reconcile`.

### Conduit

Read wallet balances, token accounts and activity through your configured RPC connection.

**Standalone:** Use public reads or an explicitly enabled write path without Edge. Settings belong to the Sidecar.

**Dependencies:** Direct HTTP mode needs a reachable endpoint; external mode needs your adapter. Offline mode does not make network calls.

**Scope:** Bounded RPC reads with observed network identity. Token listings cover the original Token Program and report truncation; address activity is cursor-paged RPC history, not a complete indexer or background subscription.

Calls: `status`, `request`, `verifyNetwork`, `inspect`, `openSettings`, `balance`, `asset`, `tokenAccounts`, `activity`, `transaction`.

### Witness

Observe transactions and independently verify a saved payment request against the recipient’s credited balance.

**Standalone:** Observe a recorded attempt, append compact evidence, and read receipts or an evidence trace.

**Dependencies:** Live observation uses Conduit or a configured adapter. Simulation observation uses Arena. Locally appended evidence needs no RPC.

**Scope:** Independent payment verification reads RPC bytes and recipient balance changes against a trusted saved request. It does not trust imported receipts, fulfil an order or replace a merchant’s durable invoice/signature claim. Token-2022 and transactions with lookup tables or unknown instructions are rejected.

Calls: `status`, `observe`, `appendEvidence`, `receipt`, `readReceipt`, `trace`, `transactionEvidence`, `verifyPayment`.

### Accord

Binds group approvals to a particular message, attempt, policy and wallet.

**Standalone:** Rehearse a quorum and audit which reviewer labels approved the same request.

**Dependencies:** Local control mode needs no peers. Apps explicitly enforce the decision before Latch. Real member authentication and threshold signing need a trusted provider.

**Scope:** The included local reviewers are simulated identities. Two names on a request are not two cryptographic signatures.

Calls: `status`, `createGroup`, `group`, `request`, `approve`, `quorum`.

### Switchyard

Allocates execution buckets to positions and records close, sweep and return to reuse.

**Standalone:** Manage the off-chain lifecycle of a finite execution resource.

**Dependencies:** Local allocation needs no peers. The app supplies execution evidence from Arena or a real service.

**Scope:** A bucket is a record, not an on-chain vault. Changing its lifecycle does not move funds. Position identity remains historical when a resource is reused.

Calls: `status`, `allocate`, `read`, `transition`, `manifest`.

### Arena

Runs repeatable payment and position scenarios, including response loss, without a network.

**Standalone:** Test an unavailable venue or a recovery path with explicit simulated outcomes.

**Dependencies:** No network and no required peer. Apps can pair it with Circuit, Switchyard and Witness.

**Scope:** Its trades, P&L and settlement are simulations. A 1/10,000 devnet evidence transfer proves only that small transfer and its memo.

Calls: `status`, `execute`, `read`, `position`, `evidenceTransfer`.

### Market Pulse

Shares one bounded price feed across charts and app consumers. Builds sampled OHLC candles from observed prices.

**Standalone:** Use prices and a chart directly, or freeze an observation into a simulated position action.

**Dependencies:** Needs a configured supported price provider. It is independent of the eleven Solana APIs and does not require Conduit.

**Scope:** Sampled candles are not exchange trade history. Missing intervals remain gaps; stale data blocks new Lab position actions. No historical volume is invented.

Calls: `status`, `quote`, `candles`, `configuration`, `acquire`, `subscribe`.

## Reviewed devnet transfer

```js
import {createSolanaClient} from './solana-client.mjs';
const client = createSolanaClient(() => window.capp.solana);
// Save this ID and the intended payment in your application before calling prepare.
const operationId = savedOrder.operationId;
await client.call('edge', 'prepare', {operationId, network: 'devnet',
  walletPubkey: savedOrder.sender, recipient: savedOrder.recipient,
  amountLamports: savedOrder.amountLamports});
await client.call('edge', 'preflight', {operationId});
// Bind these next calls to separate, explicit user actions.
await client.call('edge', 'authorise', {operationId});
await client.call('edge', 'submit', {operationId});
// Reconcile submitted/unknown attempts with this same ID. Never refresh an uncertain send.
const current = await client.call('edge', 'transactionStatus', {operationId});
```

Optional document commitment for `prepare`: `commitment: {namespace: "document", sha256: digestOfExactUtf8Bytes}`. Namespace is 1–24 lower-case letters/digits/dots/hyphens, starting with a letter. SHA-256 is 64 lower-case hex characters. It cannot be combined with simulation scaling.

See the per-component package manifests for build settings and versioned protocols.

## Public protocol references

- [Solana transaction structure and atomicity](https://solana.com/docs/core/transactions)
- [Confirmed transaction RPC response](https://solana.com/docs/rpc/http/gettransaction)
- [Memo program](https://www.solana-program.com/docs/memo)
- [Solana SPL token transfers](https://solana.com/docs/tokens/basics/transfer-tokens)
- [Solana Pay transfer requests](https://docs.solanapay.com/spec)

