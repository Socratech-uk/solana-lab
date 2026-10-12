# Solana assets, payment requests and verification

The existing Sidecars now support original SPL-token payments on devnet, Solana Pay transfer requests, independent payment verification, and foreground wallet reads. No new Sidecar or on-device indexer is required. This is source-level capability delivery; funded token transfers and installed Windows/Android wallet acceptance remain separate gates.

## Capability ownership

| Sidecar | Added capability |
|---|---|
| Compass | Asset-aware payment intents; `paymentRequest` creates stable Solana Pay terms and a URI. |
| Conduit | `asset`, `tokenAccounts`, `activity`, `transaction` read configured RPC endpoints and verify their genesis. |
| Edge | `prepareTokenTransfer` and `preparePayment` retain a request before effects and compose the existing review/approval/submission path. |
| Sentinel | Decodes the exact token instruction, checks mint/account state and per-mint amounts, observes rent/fees, then simulates the reviewed bytes. |
| Latch | Names the mint, atomic amount and token accounts during explicit approval; applies its own configured token limits. |
| Dispatch / Circuit | Existing attempt/signature retention and recovery are reused unchanged. |
| Witness | `verifyPayment` independently reads a transaction and verifies the saved payment terms and actual recipient credit. |

An asset is identified by network, genesis hash, mint and token program. Symbols, images and metadata are display information, never identity. A token amount is a canonical unsigned 64-bit integer **string**, such as `"1000000"`; it is never a floating-point SOL amount. `parseAmount("1.25", 6)` returns `"1250000"` and rejects excess precision instead of rounding. This provider supports 0–18 decimals.

## Configure a native build

Select Edge, Conduit, Circuit, Sentinel, Latch, Dispatch and Witness. Compass is optional for transfers and independently useful for payment requests. Use Edge's **Devnet** mode and the same devnet network throughout the payment peers. Configure Conduit's endpoint and devnet verification, allow its writes, and explicitly enable Dispatch submission. Configure Latch's device wallet or an appropriate external provider. Native MWA remains an unqualified host implementation boundary.

In Sentinel, select Conduit preflight, allow the programs below, and configure fee and recipient-account rent ceilings. In both **Sentinel and Latch**, add a mint limit:

```json
[{"mint":"YOUR_DEVNET_MINT","maxAmountAtomic":"1000000"}]
```

`[]` disables token payments. Limits are keyed by mint and expressed in atomic units, independently of SOL fee/rent limits. Select limits appropriate to your app; the example is a shape, not a financial policy. Existing native-SOL limits retain their meaning.

```text
11111111111111111111111111111111
TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL
MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr
```

Account creation uses the standard idempotent associated-token-account instruction. A missing recipient account requires SOL rent, separate from the token amount and network fee. A frozen, uninitialized, mismatched or underfunded source stops preparation. Sentinel re-observes account state before approval; simulation does not reserve balances or guarantee subsequent execution.

Recompile the application against these Sidecar versions, package and reinstall to embed the update. Changing a build setting does not update an already installed app.

## Read setup before asking for approval

Use Conduit `balance`, `asset` and `tokenAccounts` for explicit, bounded observations. Preserve the wallet, network and observation time. A positive SOL balance does not establish token ownership, and a token-account listing does not prove that the builder's associated source account has funds. Exact source-account, fee and recipient-rent observations are in Edge's prepared operation and Sentinel preflight.

Sentinel `status()` exposes its `tokenLimits`, `allowedPrograms`, fee and rent ceilings. Latch **0.5.0-alpha.2** adds `signingPolicyStatus: true` and this public read-only projection:

```js
const {signingPolicy} = await client.call('latch', 'status');
// {protocol:'capp.solana-signing-policy.v1', network:'devnet',
//  enforcedLocally:true, maxLamports:1000000000, tokenLimits:'[]',
//  authorises:false}
```

The device and temporary devnet signers report the exact configuration that signing enforces. Provider-owned modes report `enforcedLocally:false` and `null` limits; their provider must grant approval separately. An older build may omit this field. In either case show unavailable permission information as unknown. Empty mint limits deny token transfers; invalid limits need configuration. Never interpret a status read or successful preflight as wallet authority. Reading status causes no RPC, confirmation or wallet mutation.

### Inspect the exact payer account before creating a draft

The portable `solana-payments.mjs` now exports `tokenAddress(owner, mint)` and `tokenAccount(accountInfo)`. These are pure address/strict account decoding helpers, with no RPC, wallet access or authority. Use a genesis-verified Conduit read to distinguish an absent associated source from a wrong program, malformed encoding, frozen or uninitialized account:

```js
import {tokenAddress, tokenAccount} from './solana-payments.mjs';
const sourceAddress = await tokenAddress(selectedPayer, observed.asset.mint);
const read = await client.call('conduit', 'request', {
  network: 'devnet', method: 'getAccountInfo',
  params: [sourceAddress, {encoding: 'base64', commitment: 'confirmed'}],
});
// First require an explicit value and valid context.slot; failed RPC is unknown.
if (read.value === null) {
  // Ask for this token in the payer's associated account. SOL is only fee/rent funds.
} else {
  const source = tokenAccount(read.value);
  // Require source.owner === selectedPayer and source.mint === observed.asset.mint.
  // Compare BigInt(source.amountAtomic) with the exact saved/requested amount.
}
```

Do not infer an absent source from a wallet-wide list: it may be truncated or include other accounts. Do not substitute a stale successful read after an RPC failure. Preserve selected payer, mint and observation time; reject a payer change during preparation. An application can stop an unready draft before allocating its payment ID, while Edge/Sentinel still repeat authoritative account, fee, rent and byte checks.

A missing payer account now names the payer, mint and required token funding. Missing receiver accounts retain the existing deliberate creation/rent path. Wrong-owner and frozen accounts remain rejected. Edge retains an interrupted preparation's operation ID and original terms; retry that ID after repairing setup. Never replace an unknown or submitted attempt. No new wire protocol or wallet permission is introduced.

## Keep application payment claims under the application lock

When an application records a request as paid, reload that claim **inside the same workspace lock** before both approval and submission. A check against an earlier in-memory snapshot can permit a duplicate after another window verifies payment. Keep reconciliation available for retained attempts. Circuit and Dispatch retain individual operation and attempt identities; they do not turn an app-local invoice claim into a shared merchant ledger. Remote merchants still need atomic claims and durable fulfillment in their own trusted storage.

## Prepare a token payment

```js
import {createSolanaClient} from './solana-client.mjs';
import {parseAmount} from './solana-payments.mjs';
const client = createSolanaClient(() => window.capp.solana);

const observed = await client.call('conduit', 'asset', {
  network: 'devnet', mint: selectedMint,
});
// Save the sender, recipient, asset, exact amount and operationId in your app.
const prepared = await client.call('edge', 'prepareTokenTransfer', {
  operationId: savedPayment.operationId,
  network: 'devnet', walletPubkey: savedPayment.sender,
  recipient: savedPayment.recipient, asset: observed.asset,
  amountAtomic: parseAmount(savedPayment.amountText, observed.asset.decimals),
});
const reviewed = await client.call('edge', 'preflight', {
  operationId: prepared.operationId,
});
// Display reviewed.transaction, reviewed.preflight and accountObservation.
// Bind approval and submission to explicit user actions.
await client.call('edge', 'authorise', {operationId: prepared.operationId});
await client.call('edge', 'submit', {operationId: prepared.operationId});
// Resume this ID after an interruption. Do not generate a replacement ID.
const current = await client.call('edge', 'transactionStatus', {
  operationId: prepared.operationId,
});
```

Persist the resolved asset and atomic amount with the operation before calling `prepareTokenTransfer`; a later token metadata read must not silently reinterpret a saved request. The example's `savedPayment.amountText` is the original user input, not a value recovered by dividing a JS number. Reuse the saved request exactly on retry.

Only original Token Program associated accounts are built in this phase. Token-2022 extensions, wrapped SOL, non-associated sources, multisig signing, arbitrary instructions, swaps and mainnet signing are rejected or outside this builder. A devnet mint named USDC is not established as genuine USDC. Mainnet wallet management/read support does not enable payment signing.

## Request and independently verify a payment

```js
import {paymentReference} from './solana-payments.mjs';
const createdAt = Math.floor(Date.now() / 1000);
const request = await client.call('compass', 'paymentRequest', {
  requestId: savedInvoice.id,
  network: 'devnet', recipient: savedInvoice.recipient,
  asset: savedInvoice.asset, amountAtomic: savedInvoice.amountAtomic,
  reference: paymentReference(), createdAt, expiresAt: createdAt + 900,
  label: 'My app', memo: savedInvoice.id,
});
// Persist the whole request once, before displaying request.uri as a QR/link.
// Retry with that stored request/reference; do not create another reference.

// A payer inside a compatible cApp can use the same terms:
await client.call('edge', 'preparePayment', {
  operationId: savedPayment.operationId,
  walletPubkey: savedPayment.sender, paymentRequest: request,
});
// Then preflight, authorise, submit, and reconcile as above.

// The receiving app obtains a candidate signature from its reference activity.
const candidates = await client.call('conduit', 'activity', {
  network: request.network, address: request.reference, limit: 20,
});
const verified = await client.call('witness', 'verifyPayment', {
  paymentRequest: request, signature: candidateSignature,
  commitment: 'finalized',
});
```

The standard Solana Pay transfer URI does **not** encode the network or expiry. Display both beside the QR/link and configure the payer's wallet accordingly. cApp's saved document binds them; the verifier rejects another genesis or a block timestamp outside the saved lifetime. A valid block timestamp is required. Late payments may need a separately reviewed refund; rejection is not a chain reversal.

`preparePayment` preserves the requested memo and adds the invoice reference plus an operation-specific reference to the transfer. Different operation IDs cannot accidentally produce identical messages in one blockhash window. A request's reference belongs to one invoice; the app must retain the same payment operation when resuming it. Request expiry is checked before approval and before the first send, but cannot prevent a submitted transaction from landing later.

Witness fetches the successful transaction at the requested confirmation, checks its signatures and supported instructions, and requires the exact recipient balance increase. It rejects self-payments, wrong references, wrong mints/precision/programs, fees withheld from the expected token credit, failure, insufficient confirmation, and ambiguous/missing evidence. It accepts ordinary SOL transfers, SPL `Transfer`/`TransferChecked`, optional standard ATA creation, optional memo/signers and bounded compute-budget instructions, including sponsored payments. Legacy and v0 messages without address lookup tables are supported. Other instructions/programs and Token-2022 need a separate verifier.

`paid: true` means the configured RPC supplied matching observed chain evidence. It is not light-client consensus verification or a delivery decision. A payment/request digest detects changed bytes; a digest is not an issuer signature.

## Merchant/server boundary

For a remote order, the merchant independently reads its own trusted invoice and configured RPC. Do not trust browser-supplied amounts, recipients, endpoint URLs, transaction metadata, or `paid`/`verified` booleans. The network-free `sidecars/runtime/solana-payments.mjs` exports the same request/transaction verification logic for a server or Web Crypto runtime; it contains no wallet signer, RPC client or fulfilment implementation. The accompanying declaration file defines its inputs. It requires Web Crypto with Ed25519 and SHA-256; a browser must provide a secure context. Source tests cover Node 24.19.0 and an isolated browser-like context without Node globals. Installed browser/WebView acceptance remains a separate gate.

See [`sdk/examples/solana-merchant-verification.mjs`](../../sdk/examples/solana-merchant-verification.mjs). After independent verification, atomically claim the network/signature, match the still-current saved request digest, mark the invoice paid and create one durable fulfilment job. A unique reference per invoice and a unique signature claim prevent reuse across orders. Restart the same job after failure. Local Sidecar storage and the SDK's in-memory sample stores do not implement a distributed merchant claim.

Refunds, asset issuance and delivery are separate linked operations with their own approval and idempotency. Never automatically resend a payment or re-mint an asset because an acknowledgement was lost.

## Wallet reads and remaining work

`conduit.asset` observes original Token Program mint precision/supply/authorities, without asserting brand or metadata authenticity. `tokenAccounts` returns up to 128 accounts (default 32), exact balances, and explicit unsupported/truncated flags. Standard RPC has no cursor for this listing; the transport bounds its response bytes. A large wallet may require a managed data provider. Token-2022 accounts are excluded explicitly.

`activity({network,address,before,until,limit})` returns up to 100 signature observations (default 20), an optional `nextBefore` cursor and `historyComplete: false`. Query each relevant token-account address for its token activity; the wallet address alone is not a complete incoming-token feed. These are explicit foreground reads, with no timers, app-wake service or WebSocket subscription. Provider history/pruning and commitment limit what is visible. A status page is not a verified payment: pass a candidate signature through Witness.

The capability work graph separately tracks authenticated Accord approvals, authority-backed treasury/rail execution, recoverable issuance, spot swaps, provider-based background events and native wallet qualification. Positions remain Arena simulations until an actual venue adapter is implemented and qualified. Old Quorm/Rail services are not bundled into cApp.

Source references: [Token transfers](https://solana.com/docs/tokens/basics/transfer-tokens), [Solana Pay specification](https://docs.solanapay.com/spec), [token-account reads](https://solana.com/docs/rpc/http/gettokenaccountsbyowner).
