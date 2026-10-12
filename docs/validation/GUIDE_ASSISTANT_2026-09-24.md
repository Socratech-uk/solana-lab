# Guide and Assistant repair · Solana Lab 0.6.1

## Apply

Extract the Lab source overlay into `C:\Users\alex1\solana-lab`.
Extract the companion Guide project overlay into
`C:\Users\alex1\cApp\projects\solana-lab` while that project's Guide editor is closed.

Refresh the source in cApp, select **Guide release (User) 1.2.0**, recompile
Solana Lab, then package and reinstall it while preserving app data. Reusing the
previous compiled release will not include these app changes. The app footer
should read **0.6.1**; Guide's current release should be **1.2.0**.

This update uses the supplied September 24 Lab source and project export.
cApp Agent's current conversation, context-budget and tool patterns were used
as a read-only reference. No cApp core or shared runtime files are patched.
Use the previously supplied top-bar / GPU builder update when rebuilding.

## Repairs

- The old “Use a funded devnet account address” exception was raised by a syntax
  check, without reading a balance. Missing sender and recipient errors are now
  distinct and say exactly what to fix.
- Guide no longer reads an invisible blank draft behind the latest history card.
  Starting a new run opens the draft; retrying a bound run resumes the exact
  saved record. A defensive check also makes older Guide manifests reveal the
  draft before they can create anything. An unsuccessful creation keeps the
  draft visible instead of falling back to the latest historical payment.
- Saved sender addresses and wallet-mismatch messages make it clear when an old
  record belongs to another wallet. Selection never rewrites an existing payment.
- Policy demos verify the exact expected failed check. Fee 150,000 versus limit
  100,000 and age 600 seconds versus limit 300 are explained as expected
  rejections. An unrelated rejection still blocks the walkthrough.
- Assistant has Chat, Guided demos and searchable Guide library views. It starts
  the existing Guide controller through its public API, exposes tour/status/stop
  controls, and links to the full installed Guide. Step highlights, confirmations,
  Next/Back and payment checkpoints stay with that controller.
- Greetings and authored help work without a model. Model chat uses the current
  page, recorded sender, policy explanation, recent conversation and declared
  read tools. Plain prose is accepted for display. Malformed action envelopes get
  one bounded repair; unknown tools and mutation requests cannot execute.
- Enter sends, Shift+Enter adds a line and IME composition is respected. Drafts
  survive tabs and model refreshes. Named read activity replaces generic tool
  labels. Stop cancels scoped inference and suppresses late replies.
- Model settings opens the shared Local AI controls. The open panel refreshes
  readiness without requiring it to be reopened. Context packing reserves answer
  space and retains the entire current question.
- Long policy identifiers wrap on mobile; the browser Guide launcher no longer
  overlaps the open Assistant.

## Verification

All tests use fixture RPC/model responses; no real funds or live devnet writes.

| Check | Result |
|---|---|
| Guided action contracts | 14 passed |
| Lab/model controller contracts | 22 passed |
| Existing devnet regression runner | Passed |
| Connected service workflows | 9 passed |
| Distribution/integrity | 5 passed |
| Project configuration preservation | 7 passed |
| App DOM integration | 25 passed |
| Installed owner/app-frame DOM integration | 11 passed |
| Hosted preview restrictions | 5 passed; zero network/storage effects |
| Real-browser Guide scenarios | 8 passed |
| Real-browser Assistant + wallet/history reproduction | 7 passed |
| Real-browser installed Guide bridge | Passed |
| Project release hydration through cApp | Passed; 15 unrelated selections preserved |
| App and preview builds | Passed; runtime asset hashes verified |

The wallet/history browser case uses a 15 SOL balance response, two device
wallets and an older completed service report. It checks that the old record is
unchanged, a blank new recipient produces the right error, self-recipient
selection allows preparation with the new sender, and Guide sends nothing.
The one fixture transaction establishes the old completed report through the
normal explicit page controls.

Screenshots in `docs/validation/guide-assistant-2026-09-24/` cover desktop and
390px mobile views. Native Windows/WebView2 installation, a real model's answer
quality and actual RTX GPU offload were not available in this environment.

The prior published FTUE directories, source bindings, saved Sidecar selections,
credentials and wallet data are excluded from replacement. A file/hash inventory
accompanies each overlay.
