# Test-USDC funding update · 27 September 2026

Lab **0.7.6** · project Guide **1.4.3 / revision 12** · Guide runtime **0.10.7**.

## Delivered

- A prominent funding panel in Wallets for the selected devnet payer, plus Token desk and SPL Payment request setup for the supplied Circle devnet USDC mint.
- Separate explanations for SOL fees/rent and the USDC transfer balance. Copy payer → open Circle → choose USDC and Solana Devnet → complete verification → Send 20 USDC → return and Check setup.
- The public 20-USDC/every-two-hours/per-address/per-blockchain allowance, rate-limit guidance and the separate one-USDC Lab transfer ceiling.
- A saved transfer displays and copies its original payer, even when a different wallet is selected. Its operation, recipient and amount are preserved.
- Guide focuses the funding panel, retains its setup checkpoint while funds or permissions are missing, and avoids directing custom-token transfers to Circle. Fresh checks create no payment and grant no approval.
- Updated Guide articles, project manual and API integration notes. All earlier immutable Guide releases remain unchanged. The preview inventory now includes its previously missing demo-token import and the new funding module.

## Verification on this supplied bundle

- 35 capability/setup/replay groups passed, including missing/frozen/insufficient token holdings, original saved-operation recovery, payer switches and custom-mint funding advice.
- Guide catalogue plus 59 guided-action/default/transaction groups passed.
- Five Chromium funding groups passed: selected payer copying, funded-SOL/missing-USDC behavior, read-only recheck after fixture funding, actual Guide setup targeting and an accessible faucet link, ordinary public-page handoff, saved payer copying after a wallet switch, custom mint handling, mainnet exclusion and 390px layout.
- Five preview groups passed: deterministic inventory, module closure and route rendering, locked runtime actions, no persistent-storage effects and no network effects.
- Lab build, preview build and cApp staging passed. The actual project-to-build resolver selects Guide 1.4.3 and preserves the other 15 Sidecars.

RPC responses and the external faucet page were fixtures. No real faucet request, real transfer or Windows/Android installation was performed. This update changes application funding UX and authored Guide content; it does not change shared Sidecar execution code or settings.

## Check in the installed build

Select the intended devnet payer, copy its address from the funding panel, open [Circle’s faucet](https://faucet.circle.com/), choose USDC and Solana Devnet, complete its verification and request test funds. Return to Token desk and Check setup. Select a saved transfer’s original payer before continuing it. Guide should wait until its associated account holds the required tokens and configured permissions pass, then continue through separate review, signature, send and receipt actions.

See [funding and the optional API integration](../ASSETS_AND_PAYMENTS.md). Circle’s API requires a Bearer key and the documented account upgrade; no credentials or CAPTCHA automation are included.
