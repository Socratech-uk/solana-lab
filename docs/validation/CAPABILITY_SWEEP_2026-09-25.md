# Solana Lab 0.7.0 capability sweep

Inputs were the two September 25 uploads, not an older working tree. The six runtime updates and shared payment SDK came from the verified cApp capability overlay delivered in the previous phase.

| Input | SHA-256 |
| --- | --- |
| solana-lab(20260925-105117).zip | `1bd0dba454c9347b616499eb05506bf40f7327745cab2783219946e347397559` |
| CUsersalex1cAppprojectssolana-lab(7).zip | `37563156efe6daf6fdabd08235ef2b163b2ccd7f14000a82e81069df985da0fc` |
| cApp asset/payment dependency overlay | `31a2afbeb8757d11aaed6606956f8b18a3ef7d29154800ccdf82e29383328b4b` |

## Delivered

- Twelve demos: all nine earlier recipes plus Token desk, Payment requests and Wallet activity.
- Exact SPL amounts, inspected mint precision, explicit mint permissions and native/SPL receipt binding.
- Immutable request terms, Solana Pay QR/JSON sharing, a separate saved payer operation, independent finalized recipient-credit verification and local duplicate-claim protection.
- Explicit address paging, network labels, token-account navigation and observation timestamps.
- Five new guided workflows; 24 total. Eleven Assistant read tools, with new tools limited to saved snapshots.
- Correct wallet mismatch notices on checkout/treasury and token/request payments. Terminal blocked/failed connected runs can start separately through Guide; unresolved attempts remain protected.
- Guide 1.3.0, revision 6: 129 project articles, four targets and a five-step overview. The saved project selection now binds the full release instead of the generic manifest with zero workflows.
- Rebuilt `dist` and locked `dist-preview`, with 26 directly navigable preview routes.

## Verified here

`npm run test:all` passes, logging 157 PASS results, alongside the structured wallet-contract checks. It covers all existing suites and 17 new capability cases. Three rendered Chromium suites pass 19 additional checks: four capability, eight Guide and seven Assistant checks.

Capability coverage includes amounts beyond JavaScript's safe integer range, missing mint permissions, changed mint precision, immutable terms, same-operation recovery, native and SPL receipts, pending finality, absent recipient credit, local claim reuse, already-paid duplicate prevention, expiry, paging, network-switch failures and saved-only assistant reads.

Browser coverage runs the real app and Guide with intercepted RPC/model data. Token signing and sending, request sharing/payment/verification, reload, receipt navigation, activity, Enter/Shift+Enter, cancellation and earlier wallet-switch failures are exercised through actual controls. New screens were inspected at 1440×1000 and 390×844; no page errors or horizontal overflow remained. Observed screenshots contain fixtures, not live payments.

The project check verifies release hashes, source/manifest equality, 129 exported articles, the selected Guide binding and all six capability version selections. Comparison against the uploaded project verifies unchanged source binding, prior immutable releases, build history, shell settings, RPC configuration, Local AI selection and unrelated Sidecars. Sentinel/Latch receive empty token limits only where absent.

Machine-readable suite results are in [CAPABILITY_SWEEP_2026-09-25.json](CAPABILITY_SWEEP_2026-09-25.json). Overlay manifests and `REPLAY_VERIFICATION.json` identify every changed file and verify replay against the original upload, including regenerated distribution trees. No deletion is required.

## Remaining installed acceptance

This environment did not compile or run Windows/Android artifacts, contact live devnet, or load the user's local model/GPU. Existing Local AI settings were preserved. After applying the two overlays and the prior cApp capability update, refresh source, select User Guide 1.3.0, compile and rebuild. Confirm the native app shows source version 0.7.0 and the new Guide workflows.

Use a deliberately allowlisted devnet mint and two controlled test wallets for native token/request acceptance. Verify the visible wallet and actual balances, approve and send explicitly, and inspect a finalized request proof. Confirm the shared Local AI UI reports its actual loaded backend/layer allocation; this source update makes no GPU performance claim.
