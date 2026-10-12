**Solana Lab against the Colosseum plan — 25 September 2026**

**Decision: the next valuable work is a complete, recoverable payment-to-delivery journey, supported by native-wallet evidence. First fix the already-paid request guard described below.** The Lab now has useful token and invoice primitives as well as its SOL workflows. Its breadth has advanced faster than its first-run setup, connected merchant journey and evidence from real devices.

I applied `solana-lab-direct-guide-overlay.zip` over the exact last upload, `solana-lab(20260925-132945).zip`. The resulting full archive includes the direct Guide buttons, existing source and distributions, and this review with reproducible evidence. No further application fixes were applied during the review. Findings below remain open unless explicitly identified as already resolved. You do not need to apply the Guide patch separately.

The comparison uses the original `colosseum.md` plan, its identical later copy, the September 24 capability audit, and the actual merged Lab 0.7.0 source. The bundled source declares Guide 1.3.0, 24 workflows, 11 Assistant read tools, eleven Solana runtimes and Market Pulse. The current cApp project selection, canonical cApp source and installed executables are outside this snapshot. Their deployed state cannot be established from this archive.

**Progress against the plan**

| Agreed goal | Evidence in this copy | What remains |
|---|---|---|
| Reliable payment operations | Saved operation and attempt identity; explicit review, approval, send and observation; exact receipt bindings | Fix the stale paid-request guard; demonstrate recovery with a real native wallet and interrupted app |
| Useful token operations | Original SPL Token Program transfers, exact atomic amounts, mint/account observations, deliberate mint permissions | First-run token setup, real funded acceptance and a connected business workflow |
| Independent payment verification | Saved request terms, reference/expiry binding, finalized recipient-credit verification, local signature claims | Shared merchant-owned request/claim storage and durable fulfilment |
| Mobile-first product | Responsive pages, owning-shell bridge, Latch native-provider interface | Physical Android/MWA acceptance; cancellation, account changes and process death |
| Reusable Sidecars | Thin client, typed declarations, hash-checked runtimes and capability-specific calls | A second small integration proving reuse outside the full Lab; route-specific readiness |
| Clearly separated simulation and chain evidence | Arena positions/recovery; real devnet payments; simulated reviewers explicitly identified | Preserve those labels in the pitch; prove the same useful payment journey in rehearsal and devnet |
| Lightweight data providers | Bounded HTTP RPC and account history; shared Market Pulse observations | No background monitoring or full indexer is provided; neither is needed for the first milestone |
| Later authority/rail/intelligence phases | Local Accord and Switchyard semantics; simulated positions | Authenticated people, enforced treasury authority and provider-verified settlement remain later work |

The September 24 audit's first capability gap is substantially narrowed: token payments, portable requests and public activity are now implemented and exercised by fixtures. Merchant fulfilment, native handoff, issuance, swaps and authenticated collective authority have not become complete simply because those foundations now exist.

**All twelve demos reviewed**

| Demo | What it establishes today | Most useful improvement |
|---|---|---|
| Service desk | A bound SOL payment unlocks a local report; delivery and document proof are linked | Accept a verified SOL/token invoice and connect it to durable merchant fulfilment |
| Payout desk | Separate child payments, retained partial progress and per-transfer evidence | Add token payouts and explicit recovery/refund handling for individual children |
| Proof studio | Exact text digest, transaction commitment and copy comparison | Portable verification; describe issuer identity and claim coverage separately |
| Pocket checkout | Visible payment stages and an observed devnet receipt | Make it the simple entry point to the invoice/service journey |
| Collective treasury | Local reviewer labels and quorum checks before a separate wallet approval | Two authenticated identities and a real authority provider, only when that capability is needed |
| Position studio | Arena open/reduce/close lifecycle using observed SOL marks; optional separate devnet evidence | Keep its simulation boundary prominent; live venue execution is a separate project |
| The missing reply | Deterministic lost-response recovery using the original attempt | Repeat the recovery story in the real payment journey after native interruption |
| Policy playground | Passing and intentionally failing fee/freshness/risk examples | Keep explaining the expected rejection; reuse structured reasons for real setup failures |
| Network window | Primary RPC inspection and separate connection settings | Feed network readiness into each demo's setup status |
| Token desk | Mint identity, account balances, precise amount handling and permitted transfers | Explain missing permissions/balance/rent before a user starts the walkthrough |
| Payment requests | QR/JSON terms, separate payer, candidate search and independent finality/credit checks | Repair cross-context paid guards; add merchant delivery and linked refund |
| Wallet activity | Foreground, paged address observations with explicit network and time | Make token-account navigation easier; add bounded notifications only when justified |

Position Studio currently models synthetic long exposure and P&L; it does not establish live perpetual execution. The treasury's reviewer labels are not authenticated multisig signers. Proof Studio establishes a document commitment, not the truth of the document or a verified issuer. These distinctions are generally handled honestly in the current product.

**R01 — High priority: an already-paid request can still be approved or sent from stale application state. Reproduced.**

`CapabilityLab.approvePayment()` and `submitPayment()` call `requireUnpaidRequest()` before delegating to the base controller. The base controller's `Lab.run()` then reloads current saved state, but does not repeat the paid check. An instance that was open before another instance verified payment can therefore pass the check using an old snapshot.

The counterexample uses two controllers sharing the same saved records and real shipped Sidecars with offline signed-transaction fixtures. One retains a local prepared payment; the other verifies a separate payment of the same request. For approval, the stale instance still receives an `authorised` result. For submission, a previously signed local payment is sent even though the reloaded request is already verified paid: the fixture send count increases from one to two. This does not require simultaneous execution. It models a stale second window and does not demonstrate a remotely exploitable native-wallet bypass.

**Correction:** evaluate the paid-request invariant against freshly loaded state inside the same lock and action boundary used for approval/submission. Retain reconciliation of existing attempts. Add a two-instance regression for both actions; a same-instance test already passes and does not cover this case. A shared merchant still needs its own atomic claim and fulfilment boundary; this local fix does not solve independent external payers racing to pay an invoice.

Evidence: `src/capability-lab.mjs` (`requireUnpaidRequest`, `approvePayment`, `submitPayment`), `src/lab.mjs` (`run` and the base payment actions), and `docs/validation/colosseum-review-2026-09-25/request-replay.mjs`.

**R02 — Medium priority: Assistant routing has fallen behind the new demos. Reproduced.**

On Token desk, “show me the token payment demo” offers `understand-recovery`. The equivalent payment-request and wallet-activity prompts do the same. The deterministic shortcut runs before model inference, so changing the model or GPU will not correct this behavior. The Assistant's page map and named-demo matcher omit these three routes.

Token and request “New run” controls also exist in the main Guide catalogue but are absent from Assistant cards. The new page buttons themselves are correct: all twelve opened the intended workflow, stayed on their page and executed no steps automatically.

**Correction:** use one workflow catalogue for route defaults, named intent matching, page buttons and reset availability. Include all twelve demos in acceptance. Preserve deterministic help without requiring a model.

Evidence: `src/assistant.mjs` (`taskForRoute`, `ask`, `taskCard`), `src/guided.mjs` (`PAGE_WORKFLOWS`, `guidedView`), and the browser probe/evidence in the review folder.

**R03 — High value: token onboarding is still a configuration exercise. Source and test evidence.**

The shipped browser profile permits no token mint and initially allows only System/Memo programs in Sentinel. Successful token browser tests deliberately add fixture mint limits and token/associated-token program permissions. That is correct denial by default, but it means a funded SOL wallet alone cannot complete Token desk. The user also needs the chosen token, sender account, fee/rent balance and matching Sentinel/Latch settings.

`requireCapability()` checks the presence of features; it does not present all these per-operation prerequisites as one actionable readiness result. Instructions are available in docs and disclosures, but too much diagnosis happens after starting a workflow.

**Correction:** show a per-demo setup summary: wallet/network, observed SOL, token/mint/account, fee/rent budget, both permission limits and provider/version. Distinguish unknown observations from insufficient balances. Link to the owning settings screen and refresh readiness after explicit configuration. Use a clearly labelled devnet test asset for acceptance; do not present it as official USDC. Permissions must remain an explicit user choice.

Evidence: `src/catalog.mjs`, `src/capability-lab.mjs`, `src/capability-ui.mjs`, `docs/ASSETS_AND_PAYMENTS.md`, `tests/capability-browser.test.mjs`.

**R04 — Highest-value feature gap: requests, service delivery and payouts are still separate journeys. Source evidence.**

`ShowcaseLab` service and batch records contain `amountLamports` and their own SOL child operations. `deliverService()` relies on those children; it does not consume the new request's independently verified payment. Token/request logic lives in `CapabilityLab`. Payment requests explicitly finish at local verification and perform no merchant fulfilment. There is no linked refund workflow in this implementation.

**Correction:** introduce an application-level order → immutable payment request → independently verified payment → delivery relationship. Keep order/request identity and the original payer attempt through restart. A small merchant companion should own trusted terms, obtain trusted chain observations, atomically claim payment and durably enqueue delivery. Make a refund a separately approved operation linked to the original payment, with explicit amount and cumulative-refund limits. Never treat a refund as deletion or reversal of historical evidence.

This mostly composes Compass, Circuit, Edge, Latch, Sentinel, Dispatch and Witness. A merchant-specific service does not automatically justify a new general Sidecar. The useful acceptance is one delivery after a lost reply/restart, a rejected second claim, and an observed linked refund.

**R05 — Original milestone still needs native acceptance. Evidence gap.**

Latch exposes a `native-mwa` provider interface and reports `CAPP_SOLANA_MWA_UNAVAILABLE` when that provider is absent. The Lab's installed tests exercise a fixture owning-shell bridge. They do not run an Android wallet app or Windows executable. This archive alone cannot establish whether the latest cApp binary implements the native provider.

**Correction:** qualify one Android/MWA wallet path first: connection, explicit approval, real devnet payment to another account, receipt, cancellation, account change, background/foreground transition and process death around handoff. Persist operation bindings before handoff. Solana Mobile documents wallet-managed signing and sending; the adapter must record that result without broadcasting a duplicate through Dispatch. [S3]

The device-wallet manager is an explicitly chosen prototype facility. Its devnet exports and experimental mainnet custody are exceptions to the original plan's strict wallet-isolation goal, not proof of a production custody boundary. Mainnet sending remains disabled. Keep the Colosseum acceptance focused on the external-wallet native path.

**R06 — Reuse is documented more strongly than it is demonstrated. Source evidence.**

The thin client, declarations, runtime hashes and independent Market Pulse are good foundations. However, the Lab bootstrap checks the baseline methods across all eleven Solana components. A missing unrelated component can stop operational pages even when a particular page's providers would suffice; static documentation remains available. This is a Lab composition choice, not evidence that the underlying Sidecars cannot run independently.

**Correction:** add route-specific dependency/readiness reporting, then build one tiny second app or receiver integration using the same client and only its needed providers. Have another developer reach an observed receipt and record setup time, manual fixes and feedback. That gives tangible evidence for the platform claim and exposes SDK/documentation friction.

Evidence: `src/runtime.mjs` (`missingMethods`, `connectRuntime`), `src/solana-client.mjs`, `src/catalog.mjs`, distribution tests.

**R07 — Documentation needs a current-state pass. Confirmed.**

`README.md` links `docs/INVESTOR_WORKFLOWS.md` as current workflow guidance. That document still describes a September 22 overlay, 110 checks, unavailable browser inspection and a “known installed Sidecar issue” involving a missing terminal evidence digest. Current wallet contract tests demonstrate the repaired terminal transitions. `docs/LOCAL_AI.md` says there are eleven read tools but its table lists eight. The architecture page omits the new capability controller/UI modules and describes the central transaction path primarily as SOL.

**Correction:** keep historical validation records intact, move old application instructions out of current guides, and publish one current setup/compatibility page. Include the direct page launches, all eleven tools, token/request boundaries, supported versions and a concise fresh-install path. These contradictions cost confidence even when the current implementation works.

**R08 — Some important capabilities remain deliberately bounded. Preserve and explain those boundaries.**

Wallet activity reads at most twenty entries per page and retains at most two hundred; owner-address history can omit token-account activity. Conduit reports no WebSocket/background monitoring. Market Pulse price-sample candles do not establish historical traded volume. Local records are app/origin scoped, with a sixty-four-record application limit in several collections. Export exists; this is not a shared multi-device recovery service.

These are reasonable alpha choices. Better token-account navigation and an archive/retention workflow are useful maintenance work. Durable notifications, shared state and unattended agent execution require an available provider when the app sleeps. Keep managed RPC/data services for the heavy work.

Local AI settings belong to cApp's shared inference provider. This review does not establish actual RTX 4070 acceleration. A later installed acceptance should capture the loaded backend, actual offloaded layers, memory use and a successful grounded response. A GPU label or recommended profile is not that evidence. Guide remains usable without a model.

**Recommended order of work**

| Order | Deliverable | Relative effort | Acceptance that makes it useful |
|---|---|---|---|
| 1 | Paid-request guard repair; unified Assistant workflow routing; current docs | Small, targeted | A second stale instance cannot sign/send a paid request; all twelve named demos route correctly |
| 2 | Per-demo readiness and a documented devnet token setup | Small–medium | A fresh user can explain every blocker and complete a permitted transfer without editing source |
| 3 | Native wallet/payment acceptance | Depends on the current cApp provider and device | Actual Android handoff, receipt and interruption recovery; no duplicate submission |
| 4 | Connected invoice → payment → delivery → refund | Medium; app plus small merchant companion | Receiver verifies independently, delivers once after restart, and records a separate refund |
| 5 | Second integration plus external builder feedback | Small–medium | Same Sidecars reused outside the Lab; measured time to first receipt and recorded friction |
| 6 | Submission narrative, videos and frozen evidence | Small after the journey works | Clear user/problem, working demo, repository access and disclosed new versus prior work |

These are relative scope estimates, not promises of elapsed time. Native qualification and product integration can overlap once the paid-request defect is fixed. The next priority should be determined by evidence from the current cApp provider, not by assuming its native implementation is either complete or absent.

**The strongest demonstration to build next**

Show a small service receiving a labelled devnet token payment and delivering one useful result. Reopen after an interrupted response and recover the saved operation. Independently verify recipient credit, deliver once, inspect the receipt, and issue a small linked refund. Finish by showing a second small client using the same primitives.

A three-minute recording can allocate roughly twenty seconds to the user problem, fifty to invoice/payment, forty to interruption/recovery, forty to verified delivery/refund and thirty to reuse. That is a proposed recording after the missing work is completed. It is not a claim that the current source already performs the whole journey.

Keep the twelve-demo catalogue available for exploration, while making this one coherent journey the default presentation. A deterministic version should explain its simulated evidence and let a visitor learn the flow without funding a wallet. The current missing-reply demo is useful, but is a separate rehearsal rather than the same merchant journey running in both providers. The public preview currently locks effects, RPC and persistence intentionally.

**General Web3 usefulness after that milestone**

Token checkout, invoices, contributor payouts and refunds are the strongest immediate application family because they reuse work already present. Authenticated approvals and a proof-linked ticket/certificate are good subsequent extensions: real wallet identity, trusted issuer/collection and observed ownership add a capability the current catalogue does not establish. Spot conversion is useful later, with a current provider adapter and inspected effects. Enforced agent budgets, escrow, live perpetuals and reusable funded rails each need additional authority and settlement contracts.

Continue extracting useful Quorm/Rail Manager concepts—immutable bindings, reservation, lifecycle transitions and settlement evidence—into the current responsibilities. Do not revive the old product shells. Accord's local quorum and Switchyard's allocation records must not be promoted into custody or spend authority without a qualified provider. No new Sidecar is required merely to add another themed Lab page, and no on-device chain indexer or custom oracle is needed for the recommended sequence.

**Submission value**

The official event page lists **12 October 2026** as the deadline. [S1] Colosseum's current guidance evaluates execution, insight, communication, viability and traction alongside the team and market. It requests a repository, a two-to-three-minute presentation and a product demo of at most three minutes; relevant pre-existing development must be disclosed. [S2]

For cApp, the target customer to test first is a builder who wants reliable native payment workflows without reconstructing their operation lifecycle. The Lab is the demonstrator. A successful outside integration and concrete feedback would support that proposition more directly than an additional catalogue page. I did not find customer-validation or submission-video evidence in this source archive; that does not mean it does not exist elsewhere.

**Verification and limits**

- `npm run test:all`: passed, with 157 `PASS` entries.
- Real Chromium capability, Guide and Assistant suites: 4 + 8 + 7 checks passed. Network/model responses were fixtures.
- Direct page-button sweep: all twelve opened the expected Guide at step zero, in guided mode, on the same route. No operations or sends were created. All twelve pages fit the 390 × 844 test viewport without document overflow; this is not a physical Android keyboard/accessibility acceptance.
- New counterexamples: stale-state approval and submission guards reproduced; three Assistant prompts misrouted; two Assistant reset controls missing while the catalogue controls exist.
- Independent rebuilds: 69 distribution files and 42 preview files reproduced byte-for-byte, including the preview's 26 routes. Runtime, shared asset, Guide and QR ledgers validated.
- No live-chain transaction, native build, physical wallet, GPU inference, remote merchant or installed project-release selection was exercised. This is a source and behavior review across the supplied surfaces, not a complete cryptographic/security audit of cApp.

The passing regression suites and reproduced defects are both part of the result. The new defect probes deliberately demonstrate current behavior; after repair, replace them with assertions requiring rejection/correct routing. To reproduce the payment finding from the merged source root, run `node docs/validation/colosseum-review-2026-09-25/request-replay.mjs`. It uses only bundled offline fixtures and no real funds. Browser probes additionally require Playwright and a Chromium executable through the same environment variables as the existing browser tests.

Review evidence and logs are included under `docs/validation/colosseum-review-2026-09-25/`. The original upload SHA-256 was `ba943572da656364956da7b42ab31d90e88bbb28254dd50aa4fd042d655b1b8d`; the applied Guide overlay SHA-256 was `2b0e65d96aa5658864842f86fa875eea9fe2a61d3efb589b205cfee4085b92d1`. Existing application/runtime bytes differ from that upload only in the seven Guide-overlay paths; the review files are additive documentation.

**References checked on 25 September 2026**

- Original plan: `colosseum.md`, especially the mobile first milestone, capability boundaries and later authority/rail phases. The separately stored `colosseum(1).md` has identical contents.
- Prior comparison: `colosseum-capability-audit.md`, 24 September 2026. Its proposed token/request/activity work was compared with current implementation rather than repeated as still missing.
- [S1 — Crypto World's Fair](https://colosseum.com/worldsfair): current event date.
- [S2 — Colosseum hackathon guidance](https://colosseum.com/hackathon): submission materials, judging and prior-development disclosure.
- [S3 — Solana Mobile Wallet Adapter](https://docs.solanamobile.com/android-native/using_mobile_wallet_adapter): native connection, signing/sending and session behavior.
- [S4 — Solana Pay specification](https://docs.solanapay.com/spec): request encoding. The Lab correctly explains that its shared JSON carries network/expiry terms which its transfer URI does not.
