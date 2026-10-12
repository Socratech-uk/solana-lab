# Assets, payment requests and public activity

Lab 0.7.11 has twelve demos. Asset payments reuse the existing Solana Sidecars and keep the SOL, service, proof, batch, treasury, recovery and simulated-position workflows. The current wallet setup supplies a reusable separate receiver across the payment demos.

## What each new demo establishes

| Demo | Try | Evidence | Boundary |
| --- | --- | --- | --- |
| Token desk | Refresh assets, inspect a mint, prepare an allowed SPL transfer | Network, mint, program, observed decimals, exact atomic amount and a bound operation receipt | Original Token Program only; no issuance, Token-2022, wrapped SOL, swaps or price assertions |
| Payment requests | Save or import terms, share QR/JSON, pay explicitly, verify a signature | Independent finalized recipient-credit verification against a saved request | Local evidence and local signature claims; no merchant fulfillment service |
| Wallet activity | Choose a public address and network, load and page, inspect a signature | Bounded address history and transaction observations | No complete-history claim, background polling or indexer; an entry is not invoice payment proof |

## Required cApp capabilities

The supplied project retains these capability versions. Apply the matching cApp source before compiling and packaging the current Lab. Replacing Lab HTML does not replace Sidecars already packaged inside an executable.

| Sidecar | Version | Role |
| --- | --- | --- |
| Compass | 0.2.0-alpha.2 | Network/asset-bound payment requests |
| Conduit | 0.5.0-alpha.2 | Assets, token accounts, paged activity and transaction reads |
| Edge | 0.5.0-alpha.3 | Exact SPL transfers and request payments |
| Sentinel | 0.4.0-alpha.2 | Instruction checks, per-mint limits and rent limits |
| Latch | 0.5.0-alpha.4 | Explicit token signing limits and wallet approval |
| Witness | 0.4.0-alpha.2 | Independent recipient-credit verification |

The source includes verified copies for browser development. `runtime/sources.json` and `runtime/developer-assets.json` record versions and hashes. Older installed APIs can still open the earlier demos; attempting a new capability names the required update. There is no fallback from a missing installed provider to an unrelated browser wallet.

## Token desk setup

The supplied Lab project and browser-development profile permit **one Circle devnet USDC per transfer**: mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`, maximum `1000000` atomic units. Generic Sidecar defaults still permit no token mints. Guide never changes this configuration.

1. Select the devnet payer and a separate receiver in Wallets, or use **Prepare demo wallets** to reuse available wallets and create only missing roles. The selected payer stays selected. It needs test SOL for fees and possible receiver account rent, **and** the requested token in its associated token account.
2. In Token desk, use **Fill empty fields** and **Inspect mint**. Existing inputs are preserved. For the supplied USDC example, use **Copy payer address**, open [Get test USDC](https://faucet.circle.com/) and select **Solana Devnet** in the faucet. Fund the payer address, not the separate receiver. The official [Circle contract list](https://developers.circle.com/stablecoins/usdc-contract-addresses) identifies this devnet mint; decimals are read from the actual mint.
3. Use **Check setup**. It reads the exact associated source account as well as public Sidecar permissions, the mint and SOL balance. An absent or frozen account, insufficient tokens, failed connection, changed precision or missing permission blocks preparation with a specific reason. Tokens in other accounts do not fund this builder's associated source.
4. Review the receiver address. Empty fields use the separate receiver; an entered address stays unchanged. Guide can reuse the existing pair or explicitly create the missing receiver. Creation keeps the payer selected and creates no funds. Back up both wallets in Wallets. A missing recipient associated account may be created during the reviewed transfer using the payer's SOL for rent; the receiver does not need its own SOL balance for that SPL flow.
5. Once ready, prepare, review, sign, send and check the receipt. Signing and sending require separate clicks and wallet approval remains explicit. Guide waits on **Check token setup again** while prerequisites are missing; it does not create repeated saved transfers.

The supplied project's Sentinel and Latch both use:

```json
[{"mint":"4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU","maxAmountAtomic":"1000000"}]
```

Sentinel allows the System and Memo programs plus `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` and `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL`, with a `3000000` lamport recipient-account rent ceiling. This is a bounded devnet demo permission, not a production policy. For another mint or amount, deliberately configure both Sidecars and recompile/rebuild the app. Empty limits still deny, and mainnet signing remains disabled.

The same bounded defaults live in `src/demo-token.mjs` and the browser devnet profile in `src/catalog.mjs`. Replacing Lab HTML does not update Sidecars or settings in an installed executable.

A failed setup check leaves a new draft without a payment ID. If an older saved transfer is stuck at **Preparing**, fund its saved payer and continue that record; successful retry retains its original operation ID, recipient and amount. Account state can change between setup and preparation, so Edge and Sentinel still repeat exact checks. A changed mint precision never silently rewrites saved amounts. Submitted or uncertain transactions continue through receipt checks, not a new send.

## Get test USDC from Circle

Wallets shows the selected devnet payer. Token desk’s Payment setup uses the **saved transfer’s payer** when a saved operation is open. Copy the address displayed in that panel; never paste the mint address or fund the receiver by mistake. Select the saved payer in Wallets before continuing that operation.

1. Keep a backup of the payer’s device wallet and obtain devnet SOL for fees/rent if needed.
2. Choose **Copy payer address**, then **Open Circle faucet** at [faucet.circle.com](https://faucet.circle.com/).
3. Select **USDC** and **Solana Devnet**, paste the payer address, complete Circle’s own verification and choose **Send 20 USDC**.
4. Return to Token desk and choose **Check setup after funding**, or retry Guide’s **Check token setup again**. The check reads RPC balances and permissions without creating, approving or sending a transfer. If credits are still pending, wait and check again.
5. When ready, continue the review. An old interrupted preparation retries the same saved operation; its prior error clears after a successful review. A faucet credit itself does not appear as a Lab-created operation; use Refresh assets or public Wallet activity to inspect external activity.

Circle’s public faucet currently permits **20 test USDC every two hours, per address and blockchain**. If it reports **Limit Exceeded**, wait for the allowance to reset. Test tokens have no monetary value. The Lab’s **one-USDC-per-transfer** limit is separate from the faucet’s funding amount. A custom mint needs its own token source; the Circle link is shown for the supplied devnet USDC mint only.

### Supported API option

Circle documents `POST https://api.circle.com/v1/faucet/drips`, with `blockchain: "SOL-DEVNET"`, an address and `usdc: true`. It requires a Bearer API key, and the [API reference](https://developers.circle.com/api-reference/wallets/programmable-wallets/request-testnet-tokens) says access requires upgrading the Circle account to mainnet. That is an account-access requirement; the requested network remains testnet. The API reference does not establish the same 20-USDC allowance as the public page.

This release uses the public faucet. It does not automate reCAPTCHA or ship a Circle API key. An optional future integration should live in a credential-owning service, with an explicit user request, Circle eligibility and rate-limit handling, and a subsequent RPC balance check. An API key embedded in a distributed app or Sidecar bundle is extractable. No new Sidecar is needed for the current public handoff.

Sources checked 27 September 2026: [public faucet and allowance](https://faucet.circle.com/), [request-testnet-tokens API](https://developers.circle.com/api-reference/wallets/programmable-wallets/request-testnet-tokens), [official USDC mint list](https://developers.circle.com/stablecoins/usdc-contract-addresses).

## Payment requests

A request freezes recipient, network/genesis, asset, exact amount, random reference, creation time and expiry. Its JSON export contains normalized terms and a digest. Re-importing identical terms is idempotent; changing a saved ID's terms or reusing another local request's reference is rejected.

The QR is a Solana Pay transfer URI. **The URI does not encode network or expiry.** Use devnet in the payer and share the full JSON too. The digest identifies terms; it does not authenticate the person presenting them. Imported terms need independent recipient and mint review.

To receive an external payment, deliberately use **Use selected wallet as receiver**. For a complete local demo, both manual draft defaults and Guide use the reusable separate receiver. Guide sets up a missing receiver only on an explicit click while keeping your existing payer selected. For a saved request addressed to the selected wallet, Guide offers eligible payers directly on Payment requests. Its named selection click chooses and checks a wallet; if none is available, it offers explicit payer creation. Use the inline funding controls as needed, then **Check payer funds again**. Tiny native SOL requests also check the saved receiver and can show **Check receiver funds again**. Guide continues into preparation, review, separate signing and sending, and independent verification on this page. The outgoing operation ID is retained before preparation. Wallet switching or page refresh never replaces that payer operation. Once a request is independently verified paid, further signing/sending for it is blocked; existing attempts remain available for reconciliation.

Find candidates reads at most 20 recent signatures for the reference. Select a signature or paste an older one, then verify. Witness fetches its own RPC observations and requires:

- The expected network/genesis and finalized confirmation.
- Valid signatures and a supported transfer instruction layout.
- The requested recipient, asset, exact amount, reference and memo.
- A block time inside the saved payment window.
- The actual recipient balance credit matching the requested amount.

Pending, unavailable, failed, mismatched, no-credit and out-of-window results do not mark the request paid. The UI retains their reasons. A timely transfer can be verified after the request expires; expiry blocks starting a new payer operation. A verified result is retained and not replaced by another candidate. A signature cannot be claimed by two local requests.

## Reuse in a real service

Use `src/solana-client.mjs` for declared Sidecar calls. `src/solana-payments.mjs` and its declarations normalize exact asset/request terms and independently verify supplied trusted chain observations without signing or RPC transport. The shared [asset-payment contracts](../assets/SOLANA_ASSET_PAYMENTS.md) describe the reusable API.

```js
// Save request terms and a stable payment operation ID before effects.
await client.call('edge', 'preparePayment', {
  operationId: saved.operationId,
  walletPubkey: selectedPayer,
  paymentRequest: saved.terms
});
// Preflight, wallet approval and sending remain explicit, separate actions.

// Receiver-side verification uses its own saved request and trusted reads.
const evidence = await client.call('witness', 'verifyPayment', {
  paymentRequest: saved.terms,
  signature: candidateSignature,
  commitment: 'finalized'
});
```

A remote merchant needs server-owned invoice terms, trusted RPC reads, an atomic signature claim and durable fulfillment/outbox storage. Browser storage cannot provide those shared guarantees. The Lab does not deliver a purchase from an uploaded receipt or from a candidate activity entry.

## Wallet activity

Load an explicit address and network. Pages contain at most 20 signatures and the Lab retains at most 200 per query. New reads replace the snapshot only after success; errors do not turn old data into a fresh observation. The displayed address and observation time remain visible even when form fields change. Mainnet uses the configured read endpoint and never enables signing.

Token transfers can concern associated token accounts without appearing in the owner's wallet-address history. Open an account from Token desk, then load it in Wallet activity. Inspecting a transaction is still an observation; use the request verifier for payment meaning.

## Guide, Assistant and saved work

The 27 workflows include **Prepare demo wallets**, asset inspection, complete token payments, request creation/payment, independent verification and activity. Guide exposes separate explicit clicks for setup, review, wallet approval, sending and checking the receipt. A blocked setup stays on its check step; a failed checkpoint explains the actual error and can be retried. Earlier fee/freshness examples still call out expected rejection explicitly.

The Assistant has eleven declared reads. Its three new tools only return saved asset, request and activity observations; they cannot start background RPC work. Saved observations include identity, network and time. Enter sends, Shift+Enter inserts a line, and Stop cancels the current model turn. GPU selection remains owned by the shared Local AI Sidecar, with the project's existing inference settings preserved.

The hosted preview contains all twelve screens and docs, with runtime actions, RPC and persistence locked. Native GPU use, WebView2 layout and live devnet behavior require acceptance in the installed app.

## Check setup and stale-window payment protection

Token desk and the payer section of a saved Payment request expose **Check setup**. This action only reads public Sidecar status, devnet balance, a bounded token-account list, the chosen mint and the exact payer associated token account. It creates no payment and changes no permissions. The report identifies the wallet and observation time; data older than one minute or belonging to a different selected wallet must be refreshed.

Sentinel and Latch mint ceilings are separate checks. Latch 0.5.0-alpha.2 reports `signingPolicy`; an older installed version leaves this check unknown. The report uses the exact associated source balance; an aggregate wallet balance or truncated list cannot substitute for it. Fresh setup checks also gate new token and SPL-request preparations. Exact fees and recipient rent are shown once preparation has recorded them. Failed reads stay explicit and do not make old observations current. `lab.assets.read` lets the Assistant inspect the saved setup report without starting network activity.

Approval and submission reload the application's paid-request claim inside its workspace lock, before any wallet or send call. A stale window or queued action is refused after another cooperating window verifies payment. Existing attempts remain readable through Reconcile. This protects cooperating contexts using the same Lab state and Web Locks; a remote merchant still needs its own atomic claim and fulfillment store.

## Guide defaults

Use **Fill empty fields** or the first Guide step. An entered mint, receiver, amount or address is preserved. Guide first tries the current wallet's observed original SPL holdings. If none are found, it suggests Circle's Solana devnet USDC mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` for inspection. The address was checked against [Circle's contract list](https://developers.circle.com/stablecoins/usdc-contract-addresses) on 2026-09-26. Decimals are read from the actual mint; test tokens are available from [Circle's faucet](https://faucet.circle.com/). A suggested mint does not establish holdings, issuer identity or signing permission.

All payment demos use the saved separate receiver for empty recipients, or visibly suggest another available devnet wallet before the receiver preference has been saved. **Prepare demo wallets** and the first Guide setup action reuse existing roles and create only missing wallets. **Create a new receiver** deliberately creates another wallet. The selected payer stays authoritative; the receiver preference contains public metadata only. No wallet is created by loading a page.

A role change refreshes only blank or untouched automatic values in unsaved drafts. Entered recipients, each edited payout row, and saved operation/request terms remain unchanged. A removed receiver or a payer conflict needs a new role choice or an explicit setup action. Appropriate SOL demos keep a labelled manual self-transfer choice. Payment requests keep **Use selected wallet as receiver** as the deliberate incoming-payment action; manual **Fill empty fields** now uses the separate demo receiver, just like Guide. Self-payment of a request remains blocked, and Guide resolves its payer and funding on the request page.

Wallet activity uses the current devnet wallet when its address is empty, retains explicit network/address choices and clears details from a previous query. A query returning no transactions is valid.

## Native SOL receiver funding

A tiny native SOL transfer may be too small to create an empty receiver account. Setup reads the receiver balance and, when it is zero, the actual `getMinimumBalanceForRentExemption(0)` value from the selected devnet Conduit. A transfer large enough to supply that minimum can proceed to normal review. A smaller transfer pauses with that receiver's public address and a manual test-SOL funding link. Unknown or failed reads never count as funded. This check does not alter saved amounts, switch the payer, request an airdrop or send a payment. Existing signed or sent attempts continue through their recorded progression and observation.

This native SOL gate does not apply to SPL token recipients. A zero-SOL owner may receive tokens through its associated token account, with the payer funding account creation when needed. Exact token balance, permissions, fees and account rent remain mandatory checks.

## Payer choice and optional faucet tabs

An explicitly selected payer is retained even when it needs funding. If setup has to choose a missing payer, it may use bounded funded-wallet observations, but it excludes the saved receiver and entered draft recipients. Those observations establish initial funds only; exact source-account, fee, rent and policy checks still happen before approval. Saved payment senders remain authoritative.

If a locally created request with no payment names your only funded wallet as receiver, Guide can offer **Create a new demo with …**. That named action saves a new request with another receiver, a fresh reference and expiry, while retaining the original in history. Imported requests and saved payment attempts do not use this shortcut. Its receiver still passes the relevant native SOL or SPL checks.

When actual SOL or default-USDC funding is missing, Guide can open the relevant faucet in an app tab. Its companion keeps the public address for the payer or receiver being checked, a Copy button and Return to Guide beside the site. Complete the faucet's own steps, return, then check the balance again. Closing the faucet tab also restores the same checkpoint. It opens once for that asset/address in a step; **Open with Guide** reopens it deliberately. No funds are assumed from returning or from a faucet's success message.

This handoff requires Guide **0.11.0** plus Links **0.4.0-alpha.1**, enabled in-app websites and usable tabs. Without tabs, Guide skips the cross-site handoff and keeps ordinary faucet links/copy controls on the app page. The funds check remains required. No automatic external-browser opening, auto-paste, faucet API key or CAPTCHA bypass is involved. The companion carries only public text and does not persist clipboard history.

Historical Lab 0.7.8 introduced funded-wallet choices, the new-request shortcut and faucet tabs. Lab 0.7.11 narrows automatic payer selection to a missing payer and adds reusable receiver roles and native receiver funding checks. The supplied project retains Links 0.4.1-alpha.1 and publishes Guide 1.4.7, revision 16.
