# Token setup repair · 2026-09-27

Lab **0.7.5**, project Guide **1.4.2 / revision 11**, Guide runtime **0.10.7**.

## What caused the reported failure

The payer had SOL but no original SPL token account. The shared account decoder treated an absent source like a malformed program account. The Lab saved a transfer before checking those prerequisites, while both project mint permissions were empty. Guide then reached preparation without a useful funding checkpoint.

## Changes

- Shared Sidecars distinguish missing payer/mint accounts from wrong-owner, malformed, frozen and uninitialized accounts. The portable payment helper exports strict account decoding and associated-address derivation.
- Lab checks the exact payer associated account and current permission/amount requirements before allocating a token transfer or SPL-request payment. A wallet-wide or truncated balance list cannot establish source funds. Stale or failed reads cannot substitute for a fresh check.
- Existing interrupted preparations retain their operation ID, sender, asset and amount after funding. No submitted or unknown operation is replaced or resent.
- Guide's seven-step token walkthrough includes an explicit receiver step and a read-only setup wait/retry step before the complete review, approval, send and receipt process. Manual failed setup keeps its draft editable.
- The supplied project and browser devnet profile allow one test USDC per transfer (1,000,000 atomic units), with both mint owners configured and Token/ATA programs enabled. Generic Sidecar defaults remain `[]`; the app and Guide cannot change permissions at runtime.
- Docs, generated Guide help, source runtime copies and inert preview assets are updated. Prior Guide versions remain immutable and the old draft is backed up.

## Verification

591 cApp standard checks, 20 actual schema-validated payment documents, 10 Sidecar payment groups, 34 Lab capability/setup/replay groups, 14 guided-action groups, 14 default groups, 31 transaction-guide groups and nine workflow groups passed. The portable helper types and merchant verifier passed. Chromium passed 11 Guide transaction groups and six manual capability groups, including missing-source retries and 390px layouts. Builds and generated-asset checks passed.

The actual project-to-build Guide resolver selects 1.4.2 and preserves the other Sidecars. Comparison with the supplied archive confirms all 16 prior release files, source binding, build history, RPC configuration, shell and Local AI settings remain unchanged outside the documented version/permission updates.

All chain responses were fixtures. No faucet, live transfer, native Windows/Android install or GPU acceptance was performed. Run the installed checks after recompiling; source/browser success is not native certification.

## Installed check

Select the intended devnet payer. For the example mint, use Copy payer address and [Circle's faucet](https://faucet.circle.com/) with **Solana Devnet**. Fund that payer with test USDC as well as SOL. Inspect the mint and Check setup again, then continue the saved Preparing record if present, or create a fresh transfer when appropriate. Review, approve, send and check the receipt with separate clicks. The receiver can be a second saved wallet; creating it does not fund the payer.

The mint is listed in [Circle's official devnet addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses). Exact fees, recipient rent, current accounts and transaction bytes are checked again by Edge/Sentinel during preparation.
