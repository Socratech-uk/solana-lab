# Solana Lab

A standalone workbench for reusable infrastructure expressed as reliable operations, with twelve working recipes, eleven cApp Solana Sidecars and Market Pulse for live prices and charts. Checkout and treasury use reviewed devnet transfers. Positions use Arena, with an optional 1/10,000 devnet transfer linking the simulation to a transaction receipt. Local AI is optional.

## Current release · 0.7.13

**Guide explains the task, the next action and the result to look for.** All **27 workflows and their 97 steps**, plus the **five welcome-tour steps**, have revised wording. Wallet setup, funding, payment review and recovery now describe what you are trying to achieve, with concise instructions where a decision is needed. Supporting help, page introductions and Assistant offers use the same language.

This release publishes **Guide 1.4.10, revision 19**. **Guide runtime 0.11.2 is unchanged.** The fresh-run behavior from Lab 0.7.12 is retained: **Run with Guide**, **Guide me**, **Watch demo** and **New run** begin a new demonstration; **Continue with Guide** opens the selected saved record. Next, Retry and returning from a faucet continue the current run. Earlier payments, receipts and unfinished attempts remain available.

**Wallets** keeps separate devnet payer and receiver roles. Use your existing wallets with **Use as payer** and **Use as receiver**, enter a receiver’s public address, or choose **Prepare demo wallets** to reuse available wallets and create only missing ones. Back up new device wallets before funding them. An address you entered and a saved payment’s terms remain unchanged when roles change. SOL and token funding remain separate, and a small first SOL payment may require the receiver to have test SOL already.

Payment review, wallet approval, sending and receipt checks remain separate steps. Treasury reviews, Arena positions and Missing reply results retain their simulation labels; devnet payments use test funds. Existing Market, RPC, Local AI, wallet and project settings are preserved, together with all existing authored Guide releases.

Apply the cumulative `capp`, `solana-lab` and `solana-lab-project` folders to their matching roots, then **Compile a new Lab release and build a new native package from it**. If the cApp owner already contains Guide runtime 0.11.2, it does not need rebuilding solely for this wording update. An older owner needs the established `run-capp.ps1 -Clean -NoShowroomPublish` rebuild first. Keep the existing app identity, signing key and app data. An already configured project does not need the configuration helper or Sidecar reselection. See [installation steps](docs/INSTALLED_SETUP.md), [wallet roles](docs/WALLETS.md) and [Guide behavior](docs/GUIDED_WORKFLOWS.md).

The following dated sections retain earlier release details. Their version selections and former default behavior are historical; use the current release and installation steps above.

## Historical · Request payer walkthrough in 0.7.8

Guide now chooses and checks the payer directly on Payment requests. A new guided demo uses a separate receiver while keeping the funded wallet selected. Existing requests retain their recipient and terms; Guide offers an explicit payer selection or creation, shows funding controls, and resumes review, signing, sending and independent verification on the same page.

This release uses **Guide 1.4.4, revision 13**. Shared Sidecar versions and settings are unchanged. See [Guide behavior](docs/GUIDED_WORKFLOWS.md) and [validation](docs/validation/REQUEST_PAYER_2026-09-27.md).

## Historical · Test USDC funding in 0.7.6

Wallets and Token desk now show a prominent Circle faucet handoff: copy the displayed payer address, choose **USDC · Solana Devnet**, complete Circle’s verification, request **20 test USDC**, then return and **Check setup**. SOL and USDC are separate balances. The public allowance is 20 USDC every two hours per address and blockchain; the Lab keeps its one-USDC transfer limit.

Saved transfers copy their original payer even when another wallet is selected. Guide focuses the funding panel and waits for observed token holdings and permissions. Other mints keep their own funding requirements. The 0.7.6 release used **Guide 1.4.3, revision 12** and preserves existing Sidecar settings and saved operations. No API credential is included; see [funding and API options](docs/ASSETS_AND_PAYMENTS.md).

## Historical · Token setup fixes in 0.7.5

Token desk checks the exact payer associated account, amount and permissions before saving a new payment. Missing tokens keep the draft editable and Guide waiting on **Check token setup again**. After funding, an older interrupted preparation resumes its original operation. The supplied project permits up to one Circle devnet USDC per transfer; the payer still needs actual test USDC plus SOL for fees/rent. Generic Sidecar defaults remain deny-all.

The 0.7.5 project selected **Guide 1.4.2, revision 11**, with Guide Sidecar **0.10.7**. Apply the three matching folder overlays, run `run-capp.ps1 -Clean`, recompile the Lab, and rebuild/reinstall while retaining app data. See [token setup](docs/ASSETS_AND_PAYMENTS.md), [workflow behavior](docs/GUIDED_WORKFLOWS.md) and [validation](docs/validation/TOKEN_SETUP_2026-09-27.md).

The dated release notes below describe earlier changes; this release supersedes their version selections.

## Historical · Complete Guide workflows in 0.7.3

Guide now walks through every transaction: review, treasury reviewers where needed, wallet approval, send and receipt. Batches handle all 2–5 payouts separately. Services continue into their linked document proof. Requests include payment and independent finalized verification. Token payments and optional Arena evidence transfers have full walkthroughs. Pending or interrupted attempts resume their saved identity.

Apply all three overlays with cApp closed. The project selects Guide 1.4.0 revision 9, using Guide Sidecar 0.10.6. Run `run-capp.ps1 -Clean`, recompile the Lab, and rebuild/reinstall. See [workflow behavior](docs/GUIDED_WORKFLOWS.md) and [validation](docs/validation/GUIDE_TRANSACTIONS_2026-09-27.md).

## Historical · Demo setup fixes in 0.7.2

Guide fills empty recipients, token mints and wallet-activity addresses with visible defaults. SOL self-transfers use the current wallet; token payments require a separate receiver. Entered choices and saved operations are retained. Policy presets reset complete examples, and activity clears details from the previous query. See [Guide behaviour](docs/GUIDED_WORKFLOWS.md).

Apply all three overlays with cApp closed: Lab source, cApp source and the supplied Solana Lab project. That release selected Guide 1.3.1; the current release above supersedes it. Run your usual `run-capp.ps1 -Clean`, then recompile and rebuild/reinstall Solana Lab.

## Historical · Payment and setup fixes in 0.7.1

Approval and submission recheck paid requests after reloading under the workspace lock. Check setup shows wallet, token, permission and fee/rent diagnostics. The Assistant and page buttons share all twelve demo routes and guarded New run controls. The matching cApp update adds Latch signing-policy diagnostics. See [changes and verification](docs/validation/PAYMENT_SETUP_2026-09-26.md).

## Historical · Asset and payment capabilities in 0.7.0

Token desk adds exact SPL transfers with deliberate mint permissions. Payment requests adds immutable terms, Solana Pay QR sharing and independent finalized recipient-credit verification. Wallet activity adds explicit, paged public reads. Guide has 24 workflows and the Assistant has 11 read tools. See [setup and reuse](docs/ASSETS_AND_PAYMENTS.md) and [sweep evidence](docs/validation/CAPABILITY_SWEEP_2026-09-25.md).

Apply the Lab overlay in `C:\Users\alex1\solana-lab` and the matching cApp overlay at your cApp source root. Refresh project source, compile and rebuild. Existing Guide 1.3.0 workflow IDs remain compatible. The bundled browser runtime is updated; an installed executable needs rebuilding for Latch 0.5.0-alpha.2 diagnostics. See [Guide publishing](docs/GUIDED_WORKFLOWS.md) for revised walkthrough wording.

## Historical · Guide and Assistant fixes in 0.6.1

Guide opens the correct draft or bound run, shows saved senders, and distinguishes missing recipients from funding failures. Policy examples explain their expected rejections. Assistant combines chat, searchable help and the real Guide workflow launcher; Enter sends and Shift+Enter adds a line. See [the repair notes](docs/validation/GUIDE_ASSISTANT_2026-09-24.md).

## Run

Install Node.js 20 or newer, open a terminal in this folder, then:

```sh
npm run dev
```

Open **http://127.0.0.1:8095/**. The app has no npm runtime dependencies, so there
is no install step to run or build it. Use `npm run dev -- --port 8096` to choose
another port. Keep the terminal open; press Ctrl+C to stop.

This is its own web project. It does not need a cApp checkout, create a cApp
workspace or modify cApp files.

## Wallets

Use **Wallets** to create or restore persistent devnet accounts, manage password-encrypted experimental mainnet accounts, and connect compatible external wallet providers. Mainnet custody has a prominent loss warning; mainnet sending is disabled. See [wallet setup, backup and validation](docs/WALLETS.md).

Historical wallet release 0.5.2 restored the complete project and included receive QR codes,
per-wallet activity, backup file comparison, explicit damaged-store recovery
and the repaired terminal payment ledger. Mainnet recovery verifies the backup
password and preserves the damaged store before replacement. See
[complete restoration and validation](docs/validation/FULL_RESTORE_2026-09-22.md).

## Guided demos

Open **Guided demos** to run the real app with Guide. Watch local policy and lost-response recovery end to end, or follow receipt-checked devnet recipes with your own wallet approvals. There are 27 workflows, including **Prepare demo wallets**; no model is needed for deterministic guidance. See [guided workflows and FTUE setup](docs/GUIDED_WORKFLOWS.md) and the historical [architecture review](docs/validation/GUIDE_AI_ARCHITECTURE_2026-09-23.md).

## Explore

Start with Service desk for a payment-to-delivery journey, The missing reply for
recovery, or the Component library for the architecture. Each demo explains its
purpose and outcome. Previous runs are readable history cards; transaction JSON
and scoped API activity remain available in optional developer disclosures.

See [workflow UX and update instructions](docs/INVESTOR_WORKFLOWS.md) for the full
surface map, validation and installed-app acceptance checklist.

| Demo | What to try |
| --- | --- |
| Service desk | Confirm a payment, deliver a JSON report, then anchor its digest. |
| Payout desk | Review 2–5 separate payouts; preserve partial progress and reconcile each attempt. |
| Proof studio | Commit a document digest and compare exact text against its observed receipt. |
| Pocket checkout | Review a fictional purchase, approve it and inspect its receipt. |
| Collective treasury | Record two of three reviewer approvals before the separate wallet step. |
| Position studio | Open at the observed SOL price, follow simulated P&L, reduce and close through Arena. |
| The missing reply | Lose an execution response, refresh, then reconcile the same attempt. |
| Policy playground | Change fees, risk and freshness; inspect the checks that pass or fail. |
| Token desk | Inspect mint identity and balances; prepare an allowlisted token transfer. |
| Payment requests | Share exact devnet terms and verify actual recipient credit independently. |
| Wallet activity | Read bounded public address history; keep observations distinct from paid invoices. |
| Network window | Check the payment Conduit and open its own RPC settings; inspect the separate read connection there. |

The component library shows actual runtime status. Receipts & activity makes tool
calls and results inspectable and exportable. The optional Assistant can browse
authored guidance without a model and connect to the Local AI Sidecar when a
compatible host provides it.

## Architecture and developer docs

The landing page has an interactive architecture explorer. Choose a recipe, walk its steps or inspect any of the twelve components. **Developer docs** explains provider dependencies, operation recovery, receipts, the source SDK and connected service recipes. Static pages remain readable when installed providers need setup.

The explorer, public developer guide and typed application client are shared byte-for-byte with cApp. `tools/vendor-sidecars.mjs` refreshes them explicitly from a cApp source tree. Guide receives additive public help. The current authored Guide release is 1.4.10, revision 19. It retains the shared help and all existing immutable releases.

## Market chart

Open the collapsed **Market** bar above the main content. It expands in place and keeps the left navigation clear. The default is 15-second candles and 15-second Jupiter price polling, shared with Position Studio; saved settings take precedence. The installed app uses its selected Market owner and configuration. Review provider access in **Market settings** and wait for a fresh observation before recording Position Studio.

Use **Market settings** for chart options; **Advanced** contains cadence, quota, multiple instruments and alternative OHLCV providers. Jupiter provides current price observations, so candles accumulate while active and have no traded volume. See [Market Pulse setup and API](docs/MARKET_PULSE.md).

## Build and host

```sh
npm run build
npm run preview
```

The build verifies the shipped Sidecar hashes and writes **`dist/`**. The complete archive
also includes a freshly rebuilt `dist/` and the locked `/solana-lab/` web
preview in `dist-preview/`. Deploy only that folder to any static host
that serves JavaScript modules over HTTPS. Routes use hashes and assets use
relative paths, so no server-side router or backend is required. Do not open the
app using `file://`. This project has not been published.

## Develop

- [Market Pulse setup, integration and provider contract](docs/MARKET_PULSE.md)
- [Architecture and component map](docs/ARCHITECTURE.md)
- [Local AI and web-component extension points](docs/LOCAL_AI.md)
- [Checks and manual acceptance](docs/TESTING.md)

Run `npm test` for the workflow and standalone distribution checks. The optional
DOM tests require development dependencies: `npm ci`, then `npm run test:all`.

The eleven runtime files are vendored from your supplied Sidecars. Normal builds
use those files directly. To deliberately update them from another cApp source
checkout, run `node tools/vendor-sidecars.mjs /path/to/capp-source`, inspect the
changed files, then rerun the tests. Keep `runtime/sources.json` with the assets.

For the devnet build, start with [installed setup](docs/INSTALLED_SETUP.md) and [verification](docs/TESTING.md). No cApp core files belong in this project.

Historical Lab 0.7.8 introduced observed funded-wallet choices and the saved receiver-only request's new-demo option, retaining its original terms/history. The current release keeps an explicitly selected payer and reserves the receiver when choosing a missing payer. The faucet Copy/Return companion uses the existing Guide and optional Links runtimes; their configuration is unchanged. Without usable tabs, ordinary links and funding checks remain available. See [assets and payments](docs/ASSETS_AND_PAYMENTS.md).
