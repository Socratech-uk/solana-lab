# Solana Lab demo setup sweep — 0.7.2

## What changed

| Demo / area | Result |
|---|---|
| Service, payout, proof, checkout and treasury | Guide fills empty recipients from the current devnet sender. Each blank payout row is handled independently. Entered addresses and saved run identities are retained. |
| Self-transfer controls / optional position evidence | The button reads the current Latch wallet, not cached UI status. Controls wait for that read before preparation. A self-transfer records the instruction and spends fees; it does not pay another account. |
| Token desk | Guide or Fill empty fields chooses an observed original SPL wallet mint, or Circle devnet USDC for inspection when holdings are absent/unavailable. On-chain inspection supplies precision. Another saved devnet wallet supplies a missing receiver when available. The page explains how to create/select a receiver and obtain test tokens. |
| Payment requests | Empty receiver defaults to the current devnet wallet. An SPL mint is filled and inspected before saving. Paying requires a different funded payer, with a visible disabled self-payment control. A blank verification signature may come only from that request's recorded operation. Independent verification still decides whether credit arrived. |
| Wallet activity | Guide and Load activity fill an empty devnet address with the selected wallet, preserve explicit address/network choices and require an explicit mainnet address. A different query clears old transaction details. Empty history is valid. |
| Policy playground | Manual presets and Guide now share complete examples, resetting action, amount, fees, slippage, risk and age. Intentional fee/freshness failures remain explained as expected results. |
| Recovery, positions and network | Existing isolated recovery, fresh-price simulation and network-verification flows remain intact and covered by their existing suites. |
| Guide / cApp | Generic app-action spotlight handling is fixed in Guide Sidecar 0.10.5. Lab targets the actual form panels. App-specific defaults stay in the Lab; no new Sidecar is needed. |
| Project / documentation | The supplied project publishes/selects immutable Guide 1.3.1, revision 8. Prior releases, compiled artifact references, wallet/connection/token/inference configuration and other form preferences are retained. |

The supplied source's direct self-transfer control worked in an initial Chromium reproduction. The reported empty-recipient Guide failure was reproducible from an unfilled draft; the old Guide actions never supplied a recipient. Fresh-wallet lookup also removes a cached-selection race. This does not claim diagnosis of an unobserved installed WebView or RPC error.

## Verification

- Complete Lab `npm run test:all`: passed, 180 PASS groups at the full-suite run.
- Focused defaults/controller suite: 14 groups passed, including a subsequently added recorded-signature verification case. Its only send was explicitly invoked in a local fixture; default actions do not sign/send.
- Chromium defaults sweep: 11 groups passed across all twelve demo routes and narrow layouts; zero sends.
- Chromium Guide: 8 groups passed, including isolated lost-response recovery, cancellation, replay and missing-wallet handling.
- Chromium Assistant: 8 groups passed, including retained old orders, current-wallet Guide setup, keyboard behaviour and all page launchers.
- Chromium capability suite: 5 groups passed, including token transfers and independently verified recipient credit using intercepted RPC fixtures.
- cApp standard gate: 587 checks passed. Guide field/action/package/application/policy/mode checks, source JavaScript syntax, project FTUE publisher/build binding and generated registry checks passed.
- Lab production build, inert 26-route preview and cApp-staged preview rebuilt.
- Published Guide content and exact release hashes verified. All pre-existing project FTUE version files are byte-identical. Non-Guide provider config, compiled releases and project form preferences are unchanged.
- Token Guide screenshot visually inspected; its actual transfer panel and filled address remain readable.

No live devnet transaction, installed Windows/WebView2 or Android session, or GPU inference acceptance was performed. Real token transfers still need the selected mint's tokens, SOL for fees/rent and deliberate Sentinel/Latch permissions. No balance or permission is fabricated by defaults.

## Default mint reference

Circle's Solana devnet USDC address was checked against https://developers.circle.com/stablecoins/usdc-contract-addresses on 2026-09-26. The page links https://faucet.circle.com/. RPC inspection remains authoritative for the supported mint account and decimals.
