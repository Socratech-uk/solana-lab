# Guide, Local AI and Solana Lab architecture review

## Scope and result

Reviewed the supplied September 23 cApp source, Solana Lab 0.5.2 source, and both exported project FTUE stores. Delivered Lab 0.6.0, Guide 0.10.3, Local AI 0.9.4, and a new Lab project FTUE 1.1.0. The cApp project export was a reference; its release history was not changed.

The existing separation is sound: native Local AI owns hardware/engine authority; Guide owns declared workflow control; Lab owns business rules; sidecars own wallet, policy, execution and receipts. This update keeps those boundaries and adds working integration rather than letting model text execute arbitrary app code.

## Findings resolved in this phase

| Finding | Consequence | Repair / evidence |
|---|---|---|
| Inference controls existed only on Agents; shared runtime started from an older 4K fallback | Guide/Studio could not expose or reset the same device policy | One Local AI recommendation policy and Studio control panel, linked from Guide and Agents; 11 hardware-policy scenarios |
| Guide sliced serialized workflows at a fixed character boundary | Invalid catalogue JSON and later workflows missing from model context | Relevance ordering, whole-record packing and budgets from loaded context/response limits; planner regression |
| Supplied Lab FTUE was mostly passive and targeted an earlier layout | A tour described actions without performing and checking them | 19 authored workflows and 19 bounded actions against current controllers |
| Installed Guide registration must belong to the app document | Owner-shell callbacks cannot safely identify app controls | Inner Guide agent owns app handlers; installed mode never creates a browser fallback |
| Repeated workflow starts lacked an app-owned operation binding | Automation could create a replacement after a lost response | Durable bindings, idempotent retries and explicit New run; original attempt checked by recovery |
| Controller operations reload persisted Lab state | Holding a pre-action object gave a stale completion result | Re-read the authoritative record after every position action |
| Standalone Guide stylesheet paths assumed the server root | A nested deployment could miss its declared stylesheet | Same-origin script-relative CSS with the existing native fallback path |

## Architecture sweep

- **Runtime ownership:** `runtime.mjs` checks same-origin owner/app identity and the exact app frame. Missing installed providers remain visible failures. The new Guide adapter registers actions only in the application document.
- **Transactions:** Edge preparation, Latch authority, Dispatch attempts and Witness observations remain separate. Guide verifies the saved operation, sender, recipient, amount and bound receipt. It does not add wallet signing or submission actions. Treasury still requires the existing reviewer quorum and separate wallet approval.
- **Recovery:** The dedicated MessagePort rehearsal remains an isolated, no-network Arena profile. Guide refuses any binding that points to a live payment and verifies the original attempt after reconciliation.
- **Service composition:** Parent/child identities and application commitments remain durable before effects. Report delivery requires exact paid evidence; batch payouts remain independent and non-atomic; document comparison checks exact text and its observed commitment.
- **Market:** Real timestamped Market Pulse observations feed simulated Arena execution. A missing/stale price fails before creating another action. No quote fixture is installed in production code.
- **Wallet privacy:** Wallet secrets continue to bypass application evidence and model tools. Existing device custody semantics, mainnet warnings and disabled mainnet sending are unchanged.
- **AI authority:** Lab Assistant remains a bounded read-only tool loop. Guide selects authored workflows and declared slots. New inference management methods are owner-only and absent from scoped Local AI connections.
- **Distribution:** Solana runtimes, developer assets, QR attribution and the new Guide runtime have independent checked inventories. The static preview still has no execution, network effects or persistent state writes.
- **FTUE:** Source-authored workflows are exported as a new immutable release through the canonical cApp project publisher. Prior releases and the previous draft remain recoverable. Project identity, source paths and RPC/wallet configuration are not rewritten.

## Remaining work

1. **Native qualification:** Run a rebuilt Windows installation on actual NVIDIA and CPU-only devices, then Android. Source/mock/browser tests do not prove CUDA performance, memory pressure, native wallet/provider acceptance or an installed self-host chain.
2. **Custody hardening:** Device mainnet custody remains experimental app storage, not an audited hardware-backed wallet. Adding guided flows does not improve key custody. Sending remains disabled for mainnet.
3. **Cross-context writes:** Lab storage relies on cooperating-context Web Locks where available and in-process busy state otherwise. It is not a distributed database or protection against hostile same-origin code. A future native storage boundary should provide transactional compare-and-swap.
4. **UI maintainability:** `app.mjs` still contains large template functions and rebuilds the content surface after state changes. The new workflow definitions/actions are separate modules, but incremental UI rendering and finer stable target IDs are sensible later work.
5. **Output cleanup:** `tools/build.mjs` still protects only the exact source root from a custom output target. Its exported `build(output)` should receive the same ancestor/symlink/managed-output guard as `build-preview.mjs` before arbitrary custom output paths are offered. Normal `npm run build` uses the fixed `dist/` folder.
6. **Provider reality:** End-to-end live devnet transfers and real external wallet adapters still require device acceptance. Test RPC responses and simulated model outputs are not provider evidence.

## Verification

- The full existing Lab suite passed on the uploaded baseline and after the update. New domain tests exercise all real devnet workflow gates with local RPC fixtures, actual shipped codecs, policy, Arena and receipt logic.
- Real Chromium drives the canonical Guide shell and agent: embedded workflow discovery, automatic passing/failing policy, lost response and reconciliation, refresh/replay identity, cancellation, missing-wallet and missing-model failures. Desktop/mobile screenshots accompany the result.
- A separate installed owner/app-frame browser check verifies a single Guide shell and application-owned action registration. It remains browser evidence, not native device certification.
- cApp focused checks cover preference preservation, small/busy/multiple/missing GPUs, custom settings, busy isolation, Android limitations, whole JSON workflow packing and shared settings handoff. Broader Guide, GPU launch, generation, Android/Windows scaffolds, SDK and self-compilation gates are recorded with the delivered cApp validation report.
- No real model, external RPC, wallet funds, publishing, installation or deployment was used for these checks.
