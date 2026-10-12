# Request payer walkthrough validation · 27 September 2026

Lab **0.7.7** · project Guide **1.4.4 / revision 13** · Guide runtime **0.10.7**.

## Behavior

- Payer setup is a gated app action on Payment requests. It no longer advances past an unchecked instruction to visit Wallets.
- New guided requests reuse a separate devnet receiver or offer explicit receiver creation, keeping the existing payer selected. Manual incoming-request defaults and entered recipients remain supported.
- Existing requests offer eligible device payers on the same page. Named actions select or create a payer, then check balances and permissions. Funding links and copy controls remain usable with Guide open.
- A payer that needs funding stays at a retryable check. Once funded, the same request continues into preparation, separate signing and sending, receipt observation and independent finalized recipient-credit verification.
- Existing payments accept only their original payer. A wallet switch at signing returns to payer selection and presents the sign action again. Unknown or submitted attempts continue receipt observation, without a new send.
- Request expiry still prevents new payments. Saved terms and expired transaction history remain intact.

## Verification

| Check | Result |
|---|---|
| Guide catalog and action/default/transaction suites | 69 checks passed, including 9 new payer regressions |
| Capability, request replay and token/setup suites | 35 passed |
| Shipped Guide in Chromium | 4 end-to-end scenarios passed; two sends to an intercepted signed fixture, no live sends |
| Other demo defaults and layouts in Chromium | 11 passed across all twelve demos; desktop and 390-pixel layouts |
| Inert preview | 5 passed; zero network and storage effects |
| Lab build, preview build and cApp staging | Passed; 27 preview routes |
| Project-to-build resolution | Guide 1.4.4 resolved; other 15 Sidecars preserved |
| Preservation comparison | All 2,081 input files retained; original Guide versions and compiled history unchanged |

The browser regressions cover new receiver creation, a saved request addressed to the active wallet, missing funds followed by funding, exact request retention, wallet changes before signing and reload/resume. They exercise the shipped Guide and actual page controls, including focus bounds, faucet/copy control access and narrow-screen overflow. The unit regressions also cover missing exact SPL holdings, RPC failure, expired terms, stale selection checkpoints and operation identity.

No shared Sidecar implementation or runtime copy changed. This is application workflow orchestration using existing Latch and Conduit capabilities. Guide content, project selection, public help and the offline manual are synchronized. The old immutable releases remain byte-for-byte intact. Only the Guide manifest/version fields changed in saved project selections; wallet, RPC, mint limits, shell and Local AI settings are retained.

Validation used Chromium and signed local fixtures. A Windows/Tauri executable was not built or installed here, and the tests do not claim a live devnet payment. Recompile and rebuild the installed Lab to use this release.
