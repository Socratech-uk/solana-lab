# Solana Lab 0.4 — connected operations

## Apply

Base: `solana-lab(9).zip`. Extract the Lab overlay at this web project's root. Apply the companion cApp overlay at the cApp source root from `capp-v1(20260922-122849).zip`.

- Browser: run `npm run dev`, then refresh the Lab. `dist/` is rebuilt and ready for static hosting. The separate web ZIP contains that complete folder at its root.
- Installed: restart cApp from the updated source, compile the updated Lab, and rebuild the installer. New recipes require Edge 0.4.1 or later. Rebuild installed cApp too if you want its new Library overviews there. Local cApp testing should use the root launcher's `-NoShowroomPublish` option.
- Keep the working RPC endpoints, demo credentials, wallet provider and market settings. The patch does not modify the cApp project store. Sentinel's allowed programs must include System and Memo; the existing Lab preset already includes both. Review a custom policy explicitly if it blocks the new memo.
- Guide's public projection is additive. Existing immutable tours and FTUE files are untouched. Local AI remains optional through Sidecar selection.

## What to try

1. Landing: inspect the four architecture recipes and twelve components. Walk the steps and open Developer docs. These controls do not call a provider.
2. Service desk: create/fund a temporary devnet wallet, choose an existing funded recipient, save a JSON report order, prepare, sign, send and reconcile. Generate paid report then produces its deterministic artifact and evidence. A self-transfer is a testing convenience, not a purchase from another party.
3. Anchor the report: this opens one linked Proof studio request. Approve its separate small transfer, reconcile, then compare the saved text and an edited copy. Only the document digest enters the memo.
4. Payout desk: save two small payments, complete one, then inspect partial progress. Each item has its own identity and approval. Reconcile unknown work; do not replace the batch to recover one child. This is not atomic.
5. Existing flows: treasury review, Arena position open/reduce/close, optional scaled evidence, isolated Missing reply, policy rejection, Conduit settings, Market accordion and Guide/Local AI help.

Closing/reloading a standalone app loses the temporary test-wallet key. Signed operations remain observable from their retained signatures. Keep the owning shell open to sign other payments with that key. Export records before removing data or changing devices.

## Verification and limits

The full Lab suite passes 99 named PASS checks plus its build/Guide assertions. Nine focused workflow groups pass, including a lost delivery acknowledgement followed by payment re-observation and recovery, without duplicate evidence. The installed DOM fixture uses the owning shell's real Sidecar APIs; it does not load another runtime in the app frame.

The companion cApp passes 13 focused regression scripts, actual JSON-schema/package-contract checks, generator checks, bootloader assembly/syntax and 542 framework checks. New Edge transactions have an operation-bound memo so identical transfers in one blockhash window remain distinct. Existing pre-memo prepared rows retain their bytes.

All network execution here used RPC fixtures. A funded devnet transfer, actual Windows/Android execution, a real model and rendered browser geometry remain unverified. The browser environment blocks local previews; DOM checks are not a screenshot review. Validate desktop, narrow and zoomed layouts locally, including Library overview dialogs and market expansion inside the main column.

Local report delivery demonstrates orchestration, not a production merchant security boundary. A remote service must verify payment independently and persist fulfilment. Accord's reviewers and Arena's positions remain simulated; document commitments do not prove authorship or truth. The assistant gains richer documentation and workflow reads, not payment authority.

## Recovery / rollback

The overlay includes only changed/new files and deletes none. Keep a copy of your source before replacing files. Retain app and Sidecar records for unresolved operations; downgrading source does not undo a chain transaction. Do not clear storage or reset settings to dismiss a provider error.

Shared explorer/client/developer-guide files are refreshed explicitly with `node tools/vendor-sidecars.mjs /path/to/capp`, and their hashes are checked during build. Regenerate the Lab public help after authored changes with `npm run build:guide`. The full source remains two separate projects.
