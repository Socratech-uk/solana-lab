# Wallet recovery and preview repair — 22 September 2026

Apply the paired cApp overlay to `C:\Users\alex1\babelapp-v0` and this
root-relative overlay to `C:\Users\alex1\solana-lab`. Re-run the original
PowerShell rebuild/publish command. Recompile and rebuild the installed Lab
to adopt Edge 0.4.3-alpha.1 and Latch 0.4.1-alpha.1. Keep existing project
identity, app data, wallet backups and RPC settings.

The cApp patch repairs QR license/metadata staging and serving. The Lab patch
adds explicit damaged-store recovery and vendors the canonical ledger repair.
Finalized and failed transfers close their original Circuit attempts with
bound evidence; reconciliation never sends another payment.

On damaged storage, Wallets hides stale accounts and offers **Preserve damaged
store and recover wallet**. Supply an independent Lab wallet backup, its full
address and acknowledgement. Mainnet also requires the backup password and
loss acknowledgement. Latch validates the backup and preserves original bytes
before replacement. Other wallets require separate backups, which can then be
imported normally. Payment/signing records remain intact. Recovery does not
recover a lost password and does not enable mainnet sending.

Passed: Lab workflow/devnet/offline/host/wallet-tools tests; all three
`wallet-contracts.test.mjs` requirements; runtime/developer/QR/Market ledgers.
Five real Chromium recovery scenarios use actual source modules and Sidecars
inside an isolated test page, including mobile warning layout and wrong
passwords. Screenshot: `wallet-recovery/mainnet-damaged.png`. Run that gate with
`node tests/wallet-recovery-browser.test.mjs` and the existing Playwright/
Chromium environment variables described in `docs/TESTING.md`.

The current upload omits root `index.html`, `package.json`, package lock and
project configuration. Full UI, installed-frame, distribution and preview
build checks stop on missing `index.html`; the original full-browser suite
cannot run from this archive. No missing source was reconstructed from old
archives or generated dist. This overlay preserves the existing root files on
your computer and updates source/runtimes only; build the complete local
project to regenerate dist. Actual PowerShell/publish, native Windows/Android,
funded devnet and real Solflare acceptance remain open.

Both overlays reproduce on fresh extractions. The paired cApp builds and
verifies registry/capsule reconstruction; the Lab contract and Chromium recovery
gates pass after reapplication. Historical follow-up evidence is retained. The current source/file inventory
is `WALLET_RECOVERY_PREVIEW_FILES.json`; the cApp handover contains canonical
bug and regression evidence.
