# Verification and acceptance

Run `npm ci`, then `npm run test:all` and `npm run build` with Node 20 or newer. Tests use pinned jsdom and locally supplied RPC fixtures. They do not fund a wallet or submit a real transaction.

Wallet UI/backup/QR checks are included in `test:all`. The required
`node tests/wallet-contracts.test.mjs` gate now passes finalized/failed payment
ledger completion and explicit recovery from damaged wallet storage. Run
`node tests/wallet-recovery-browser.test.mjs` for the actual recovery form in an
isolated Chromium harness. Version 0.5.2 restores the complete root source and
builds both distributions successfully. See [full restoration evidence](validation/FULL_RESTORE_2026-09-22.md).
The wallet contract gate is now included in `test:all`.

For rendered acceptance, install Playwright in your development environment
and its Chromium browser, then run `npm run test:wallet:browser`.
`CAPP_TEST_BROWSER_MODULES` can point to an existing `node_modules` containing
Playwright; `CAPP_TEST_CHROMIUM_PATH` can select an installed Chromium executable.
This runs the complete wallet page suite and the isolated recovery suite with
fixture RPC and disposable wallets. `CAPP_TEST_SCREENSHOT_DIR` selects a fresh
screenshot folder; this restoration used `docs/validation/wallet-full-restore/`
to preserve earlier evidence. It does not verify native Windows/Android engines
or a real external wallet extension.

The original Market Pulse checks remain in the full suite. Its focused tests cover OHLC aggregation, missing volume, provider snapshots, shared consumers, quota cooldowns, stale block IDs, credential separation, saved history, app controls, classic shell packaging and position-price recovery. Canvas drawing is exercised with a mocked context; this is not a rendered visual check. See [Market Pulse](MARKET_PULSE.md) for local acceptance and provider limitations.

The suite exercises actual shipped runtimes and SDK-generated transaction bytes/signatures. It covers devnet checkout, treasury quorum gating, exact policy, a lost reply, restart recovery without duplicate sends, Arena position lifecycle, integer-scaled memo evidence, state backup and Guide/Local AI preservation. DOM tests exercise actual controls and a separate installed shell/app-frame connection. They are not visual or native-engine acceptance.

## Local acceptance

1. For the current operation/landing update, apply the Lab overlay, compile the updated web source and rebuild the installer. An already working devnet/RPC configuration needs no reset. For a first-time devnet installation, follow `INSTALLED_SETUP.md`.
2. Check the catalogue filters and provider configuration in cApp. A missing peer must produce an actionable package error. External providers should work independently when their own service is configured.
3. In the rebuilt Lab, create a saved devnet wallet, download its backup, restart and verify the address persists. Fund it with devnet SOL, check balance, and review/sign/send a small transfer to an existing account. Reconcile and open the devnet Explorer link. Verify amount, recipient, fee and success. Check that finalization closes the same local ledger attempt, with no recovery error or extra send.
4. Open, reduce and close an Arena position. This must not submit a chain transaction. Verify bucket reuse and the simulated receipt.
5. Review a 1/10,000 evidence transfer. Verify the nominal SOL amount, transferred lamports, rounding and memo digest. The Explorer transaction proves only the scaled transfer.
6. Refresh after submitting. Reconcile the same operation; the attempt and signature must remain unchanged. Do not manufacture response loss by repeatedly sending.
7. Use Missing reply to test the offline failure scenario without live funds or changed project settings.
8. Check Guide, Local AI, navigation and responsive layout on Windows and Android. Saved device wallets persist; the optional temporary-wallet mode remains process-local. Verify backup downloads and restores on each native target. The linked local Guide release is preserved.

Earlier rendered-browser attempts were blocked; the wallet follow-up now has a
local Chromium runner and recorded results. Actual Windows/Android execution,
provider acceptance and funded transfers remain unverified. RPC fixtures test
token routing and endpoint profiles, not the availability of a live provider.
No live funding, signing, submission or publication was performed.

## Connected-recipe checks

`tests/workflows.test.mjs` executes real Sidecars with fixture RPCs: service receipt gating, delivery acknowledgement loss, stable report output, document handoff/mismatch, partial batch recovery, exact parent binding, invalid inputs, standalone SDK behavior, old installed Edge rejection and corrupt storage. UI tests operate the actual recipe controls. Shared architecture controls are checked for no network effects. Installed fixtures verify the service recipe resolves the owning shell's APIs.

Local review: Service desk → create/fund wallet → use a funded recipient → save order → prepare/sign/send/reconcile → generate report → anchor report in Proof studio → review its separate payment → compare original and changed text. Payout desk → two small payouts → finish one → retain partial progress → finish/reconcile the other. A self-transfer exercises identity and receipts but pays nobody else.

The source SDK and explorer hashes are checked during a build. `node tools/build-guide.mjs --check` checks the public Guide projection. Documentation, not the selected immutable Guide release, is updated by this build.

## Guided workflows

`npm run test:guided` checks real controller postconditions and replay with fixture RPC. `npm run test:guided:browser` drives the actual Guide in Chromium. `node tests/guided-installed-browser.test.mjs` checks the owner/app-frame boundary. Set `CAPP_TEST_BROWSER_MODULES` and `CAPP_TEST_CHROMIUM_PATH` if Playwright/Chromium are not installed in their default locations. Browser checks never contact real providers or move funds. See [review and acceptance](validation/GUIDE_AI_ARCHITECTURE_2026-09-23.md).

## Demo defaults regression (0.7.2)

`npm run test:guided` includes fixture coverage for all five native SOL Guide drafts, per-row payout defaults, retained operations, current-wallet selection, token mint fallback and separate receiver selection, SPL request precision, activity network preservation and input changes during async reads. No default action signs or sends.

`npm run test:defaults:browser` runs the real Guide and page UI in Chromium with intercepted RPC: empty drafts, wallet switch, token setup, receiver/payer separation, empty activity history, complete policy presets and all twelve routes at narrow width. Set `CAPP_TEST_BROWSER_MODULES` and `CAPP_TEST_CHROMIUM_PATH` if Playwright/Chromium are not installed locally. `CAPP_TEST_SCREENSHOT_DIR` captures the token Guide form for visual inspection.

Native acceptance remains: apply all overlays; compile and package; reopen the same installed wallet; run Guide from blank service, payout, proof, checkout, treasury, token/request and activity forms. Token tests require actual devnet token holdings and deliberate mint limits. Check operation identity and receipt recovery after restart. These source/browser tests do not certify WebView2, GPU inference or a live devnet transaction.

## Full Guide transactions (0.7.3)

`node tests/guide-transactions.test.mjs` drives the shipped Solana runtimes with offline signed RPC fixtures: every transaction family, five-child batches, reload/replay, wallet cancellation, pending finality, lost replies, blocked token permission, exact receipt binding and independent recipient credit. `npm run test:guided:transactions:browser` clicks the real Guide UI and checks Auto/manual confirmation, synthetic/broker rejection, desktop and mobile, route transitions, every payout and saved-request payment. Both use fixtures; Windows wallet prompts and live devnet still need installed acceptance.


## Android/mobile regression

See [MOBILE.md](MOBILE.md). From the updated cApp root, with the updated Lab as a sibling (or explicit path), generate a fixture with:

```sh
python tests/android_solana_lab_mobile_fixture.py /tmp/lab-android-fixture /path/to/solana-lab
```

Run `tests/android_sidecar_startup_smoke.mjs` with `CAPP_TEST_NODE_MODULES` pointing to a directory containing jsdom. Run `tests/android_solana_lab_mobile_smoke.mjs` with `CAPP_TEST_ANDROID_FIXTURE`, `CAPP_TEST_SOLANA_LAB_ROOT`, `CAPP_TEST_BROWSER_MODULES` (containing Playwright) and optionally `CAPP_TEST_CHROMIUM_PATH`. The fixture builder copies current generated Android packages and the Windows Local AI package, including its native adapter and separate stylesheet. It does not build an AAB or execute a native AI engine. See the [September 28 results](validation/MOBILE_SWEEP_2026-09-28.md).
