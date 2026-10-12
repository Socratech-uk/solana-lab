# Payment setup and Assistant repair — 26 September 2026

Built from the supplied `solana-lab(9).zip` and `capp-v1(20260926-160820).zip`. The Lab upload is byte-identical to `(8)`; only these current uploads are the delivery baselines. Input hashes and checks are in [verification.json](payment-setup-2026-09-26/verification.json).

## What changed

- **Paid requests:** approval and submission check the paid claim after acquiring the workspace lock and reloading state. Stale and queued windows reject before invoking signing or sending. Existing attempts remain available for reconciliation.
- **Reusable Sidecar diagnostics:** canonical Latch 0.5.0-alpha.2 reports configured local SOL/mint limits and distinguishes provider-owned policies. The desktop and Android runtimes, manifests, registry, public schema, optional client types and docs agree. Empty token limits still deny signing.
- **Check setup:** Token desk and a saved request's payer section show wallet/network identity, exact amounts, token holdings, separate Sentinel/Latch permissions, allowed token programs and fee/rent checks. Foreground reads retain their time and wallet. Failed/old observations remain explicit. Exact source-account and fee/rent evidence comes from preparation.
- **Assistant and Guide:** twelve page defaults, named demo requests and reset availability use one catalogue. Token payments, payment requests and activity no longer fall back to recovery. New run is shown for token/request workflows and retains the existing unresolved-payment guard. Enter/Shift+Enter/IME behavior is preserved. The Assistant can explain saved setup evidence through its existing read tool.
- **Docs and builds:** eleven read tools are now all documented; architecture and earlier terminal-ledger guidance are current. Guide public help is regenerated and manifest revision 7 carries setup wording. Normal Lab output and the locked public preview were rebuilt; cApp's preview was staged from those current bytes.

## Verification

`npm run test:all` passed (167 PASS messages). Added regressions cover four stale/queued approval/submission cases and five setup groups, including exact amounts above JS's safe integer limit, denied/unknown permissions, changed wallets, stale observations, truncated token lists, RPC failure and fee/rent funding. Chromium passed five capability groups and eight Assistant groups, including all twelve page defaults. No test submitted to a real network.

Canonical cApp asset/payment, wallet-manager, terminal-recovery and schema tests passed. Strict client types passed under TypeScript 5.8.3. The cApp standard gate passed 587 checks. Generated runtime/registry/Guide checks, preview staging and the public asset boundary passed.

[Setup screenshot](payment-setup-2026-09-26/payment-setup-detail.png) and [Assistant screenshot](payment-setup-2026-09-26/assistant-desktop.png) are browser fixtures, not native acceptance evidence.

## Apply and native acceptance

Apply each root-relative overlay to its matching source root. Rebuild cApp with the canonical Sidecar update, refresh/compile Solana Lab and rebuild/reinstall its executable. Latch diagnostics require the new installed runtime; older builds show unknown permission information. There is no change to your project source reference, wallet storage, provider credentials or chosen inference settings.

Existing Guide 1.3.0 action/workflow IDs remain compatible. If you want the revised step wording in the installed Guide, import `assets/solana-lab-guide.json` through the project Guide publisher and create/select a new immutable release, such as 1.3.1. No project FTUE selection was edited without its source.

Windows/Android WebView behavior, real funded devnet transfers, external wallet integration and GPU inference remain native acceptance work. Local paid-request checks are not a remote merchant's atomic claim or fulfillment service.
