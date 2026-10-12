# Solana Lab: workflows people can follow

Solana Lab demonstrates reusable infrastructure through small, working application journeys. Each demo explains the job, the reason it matters, the next action and the evidence that establishes its outcome.

## Original workflow UI update

Extract the overlay into **`C:\Users\alex1\solana-lab`**, replacing the included files. It is based only on `solana-lab(20260922-172934).zip`.

- For local web development, refresh the running Lab page.
- For installed Solana Lab, compile the updated web source in cApp and rebuild the installer. Installed releases contain immutable frontend assets; refreshing the old installed build cannot load this new UI.
- The included `dist/` is rebuilt. To generate a locked public preview, use the existing `npm run build:preview` flow and your existing hosting integration.

Existing operations and local storage keep their identities. This update does not migrate an old simulation into a devnet transfer, change network configuration or select different Sidecars. No cApp project settings need resetting.

## What changed

| Surface | Purpose and experience |
| --- | --- |
| The Lab | Three suggested starting points: payment-to-delivery, recovery, then architecture. The full diagram remains interactive inside an expandable section. |
| Service desk | Save an order, review its payment, then generate a readable report. Its row count and numeric totals are visible before the optional JSON. A separate action opens the document commitment. |
| Payout desk | Add 2–5 contributor rows with names, addresses and amounts. Each transfer keeps its own review and receipt. Completed contributors offer a next-unpaid-item action. |
| Proof studio | Explain the original document, its chain commitment and a copy comparison separately. A local match without a bound receipt is explicitly provisional. |
| Pocket checkout | Present a fictional purchase, then show Review → Approval → Send → Receipt. A signed transaction is not presented as a completed purchase. |
| Collective treasury | Show team-review progress before wallet approval. Simulated reviewers remain clearly identified; this is not presented as a multisig wallet. |
| Position studio | Explain live marks versus simulated execution. Optional scaled devnet evidence is a separate expandable journey below the positions. |
| The missing reply | State the problem and expected recovery result. Check the original attempt without constructing another payment. |
| Policy playground | Start with normal, excessive-fee, stale and high-risk examples. Advanced inputs remain available; the decision explains its failed checks. |
| Network window | Lead with devnet verification. Explain returned chain facts and keep raw RPC data optional. |
| Component library | Connect each component description to demos that use it, while preserving the shared architecture and SDK references. |
| Receipts & activity | Separate work needing review from retained receipts. Show human-readable outcomes and links back to the original workflow. Raw event records remain inspectable and exportable. |
| Developer docs | Preserve the shared contracts, downloadable client and detailed provider boundaries. Explain their relationship to the visible demos. |
| Assistant / Guide | Add “Explain this page”, backed by route-scoped authored Guide search. No model is required for this help. Model tools remain read-only. |
| Public preview | Keep the full narrative, navigation and docs. Runtime actions, live prices and model execution remain locked. |

## Interaction rules

1. **Start with purpose.** Each demo states why it matters and what the visitor will see. It does not assume the visitor already understands operations, attempts or receipt digests.
2. **Show actual progress.** An observed chain status without a matching transaction receipt is not marked complete. Simulation outcomes are labelled separately.
3. **Keep actions explicit.** Saving, reviewing, signing, sending and observing remain distinct. History selection and field presets do not execute a workflow.
4. **Make previous work readable.** Paginated history cards replace the saved-operation dropdowns. Earlier simulations remain read-only and exportable.
5. **Keep detail available.** Developer activity is scoped to the selected run. Transaction data and raw receipts live in closed disclosures; opening them is preserved through rerenders.
6. **Keep the result useful.** A report is a readable report, a proof is a clear comparison, and a batch is a set of separately tracked contributors.

## Earlier terminal-ledger issue

The September 22 UI work exposed a missing `evidenceDigest` in a terminal Circuit transition. The current canonical Edge runtime includes that repair. Older installed executables can still show “Receipt available · local tracking needs attention”; preserve the receipt and rebuild against current Sidecars. Do not send a replacement payment. See the [current payment/setup repair](validation/PAYMENT_SETUP_2026-09-26.md).

## Validation and acceptance

All **110 existing and added automated checks pass**, including 22 DOM workflow checks, 11 installed-shell bridge checks and the locked preview’s 20 routes. RPC responses and Local AI output in these checks are fixtures; no real payment was submitted during validation.

The new checks exercise history pagination without execution, scoped activity, inspection state, contributor editing without accidental submission, route-specific help, and a confirmed receipt accompanied by the exact local tracking warning from the supplied example.

Browser access to the local preview was blocked in this environment. These tests do not establish visual correctness in WebView2 or Android. After rebuilding, check:

- Checkout and treasury at desktop and narrow window widths: progress, next action and exact recipient stay readable.
- A saved old simulation: opening it offers inspection/export, with no signing or sending controls.
- Service desk → Proof studio: the report is readable; a changed copy fails comparison; a local-only match is labelled correctly.
- Payout desk: add/remove contributors, change selection, and revisit a completed item without replaying it.
- Position studio: optional evidence starts collapsed and expands within the content column.
- Receipts: opening a payment returns to that exact record; raw JSON is optional.
- Public preview: every page and help drawer remains readable, while actions requiring installed Sidecars remain unavailable.

The handover evidence and changed-file inventory are under `docs/validation/`.
