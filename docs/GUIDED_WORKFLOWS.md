# Guided Solana Lab workflows

Use **Run with Guide** on a demo page or choose a recipe in **Guided demos**. Lab **0.7.13** publishes authored Guide **1.4.10, revision 19**, with **27 workflows, 97 workflow steps and five welcome-tour steps**. The Assistant offers these same walkthroughs. Guide works without a model; the optional Assistant model can explain results using read-only tools.

## What the guidance explains

Each step describes the task at hand, the next action and the result to inspect. Setup introduces who pays and receives; funding explains what is missing; payment steps show the amount and recipient before approval. Recovery explains how to check the original payment after a missing reply. The wording keeps devnet, simulation and wallet-approval requirements visible where they matter.

This is a wording update. The controllers, action identities, wallet checks and fresh-run behavior introduced in Lab 0.7.12 are retained. Shared **Guide runtime 0.11.2** is unchanged.

## Prepare the payer and receiver

Open **Wallets → Open with Guide** for **Prepare demo wallets**. The payer sends the test payment and the receiver collects it. Preparing the wallets keeps your selected devnet payer, reuses a separate receiver and creates only missing device wallets when the configured provider supports it. With two suitable wallets, Guide reuses both; with one, it creates the missing role; with none, it creates the pair. Opening Wallets or a walkthrough alone creates nothing. Back up each new device wallet before funding it.

Use **Use as payer**, **Use as receiver**, or **Set receiver address** to change the next demo’s roles. **Create a new receiver** deliberately creates another wallet; **Prepare demo wallets** prefers existing ones. An entered recipient remains unchanged, and saved payments keep their original sender, recipient and amount. If no payer is selected, setup excludes the saved receiver and addresses already entered as recipients when choosing one.

Setup and funding checks do not authorize payments. SOL and token balances are separate. A receiver with no SOL may need test funds before a tiny first SOL payment: Guide checks the network’s account minimum and shows the receiver address when funding is needed. Follow the faucet instructions, then return and check again. Unknown or failed balance reads remain unresolved. SPL transfers instead check whether the receiver’s token account can be created using the payer’s SOL for rent.

## Complete the payment

Review the displayed amount, sender and recipient. Guide then takes you through wallet approval, sending and receipt checks as separate actions. Treasury payments also require their simulated team reviews. Guide can help select or create a test payer, but it does not grant token permissions, unlock wallets or create funds. Wallet approval remains with the wallet provider.

| Recipe | Result to inspect |
| --- | --- |
| Pocket checkout | A reviewed devnet payment and its matching receipt |
| Collective treasury | Two local simulated team reviews followed by a separately approved devnet payment |
| Payout desk | A separate review, approval and receipt for each of 2–5 payouts |
| Service desk | A paid order, the generated report and a separately paid document proof that matches it |
| Proof studio | A document fingerprint recorded on devnet and a comparison with the saved text |
| Token desk | A transfer of the reviewed mint and amount to the intended receiver |
| Payment requests | Shared request terms, the payer’s transaction and independently verified recipient credit |
| Pay a payment request | A reviewed request, payment and recipient verification; **Continue with Guide** opens the exact saved request |
| Arena evidence transfer | A separate devnet transfer scaled to 1/10,000 of the nominal amount, linked to an Arena action |

The Arena position walkthrough uses observed Market Pulse prices to open, reduce and close a simulated position. It does not trade on a market. Policy and Missing reply are local demonstrations without wallet funds. **Watch demo** is available for local policy and isolated recovery; real payment approval and sending require your confirmation.

## Start again or continue saved work

**Run with Guide**, **Guide me**, **Watch demo**, **New run** and Guide’s own cards or offers start a new demonstration. Earlier records remain in history. Open one and choose **Continue with Guide** to continue that saved operation. Next, Back, Retry and returning from a faucet stay within the active run.

If an existing action is still running, a new launch waits for it to finish before preparing the next run. Cancelling a pending launch prevents it from starting later. A new demonstration does not settle an earlier uncertain payment, reuse its wallet approval or erase its evidence.

## Waiting, cancellation and retries

A pending payment stays on its receipt check. If a send response is lost, Guide checks the same saved attempt instead of sending again. Completed payouts remain complete; the batch cannot finish while any payout is blocked, failed or unverified. Its current title identifies which payout needs attention.

Cancel stops subsequent steps. A wallet action already in progress may finish, and its result remains saved. Continue the record to see what happened. An expired review may be refreshed only when it is safe to prepare another transaction; the refreshed payment requires new approval. An expired request has its own terms and cannot be extended by refreshing the transaction.

## Draft values, tokens and requests

Empty recipient fields use the separate demo receiver across checkout, service, payouts, proof, treasury, tokens, requests and optional position evidence. A role change updates only blank or unchanged automatic values in unsaved drafts. Typed recipients, including individual payout rows, remain as entered. The labelled manual self-transfer control remains available in appropriate SOL demos; it spends fees and pays no other account.

For token payments, Guide can suggest an observed original SPL mint or Circle devnet USDC. The payer needs that token, SOL for fees and possible account rent, and permission in both Sentinel and Latch. **Check setup** explains any missing requirement. Guide does not change those permissions.

A new payment request uses a separate receiver. **Use selected wallet as receiver** remains available when you want to request incoming payment. On a saved request, choose and fund a different payer in the highlighted panel, then use **Check payer funds again**. An existing payment requires its original sender. If the only funded wallet receives an unpaid request you created locally, Guide may offer a separate demo using it as payer; the original remains saved. Imported requests and existing payments retain their terms.

An outgoing receipt alone does not mark a request paid. Witness independently checks finalized network evidence and actual recipient credit against the saved request. Pending or mismatched evidence remains unverified. Use **Verify a request payment** to check a payment made elsewhere without making another transfer.

Wallet activity fills an empty devnet address with the selected wallet. An entered address and network remain as chosen. The fee and stale-information examples explain their expected policy rejection and use no wallet funds.

## Implementation and release

`src/guided-content.mjs` authors the manifest. `src/guided-actions.mjs` and `src/capability-guided.mjs` own app actions; `src/guided-transactions.mjs` binds review checkpoints to the saved payment and its next phase. `src/demo-wallets.mjs` owns public wallet roles, `src/demo-defaults.mjs` updates eligible drafts, and `src/request-payer.mjs` checks the request payer and funding. Private wallet results remain excluded from public event logs. `src/guided.mjs` installs and launches the shared workflows.

The unchanged Guide runtime **0.11.2** provides action progress and the awaited `registerWorkflowStart` hook. The Lab requires the owner’s acknowledgment before registering actions, preventing an older owner from silently skipping fresh-run preparation. A `capp.guide-action-progress.v1` result with `complete:false` keeps the current step open for further confirmation. The app owns completion checks; Latch owns wallet authority. Synthetic or brokered invocation cannot confirm transaction actions. The app rechecks saved payment state under its workspace lock before acting; this local coordination is not a shared merchant ledger.

Apply the three matching overlay roots with cApp closed. The project selects **Guide 1.4.10, revision 19**, preserving all existing immutable Guide releases, profile settings, compiler history, connection settings and inference choices. Authored Guide versions remain separate from the shared runtime and historical selection labels.

**Freshly Compile Lab and package that new release** to deliver the revised wording. An owner already running Guide 0.11.2 needs no rebuild solely for this copy update. For an older owner, use the established `run-capp.ps1 -Clean -NoShowroomPublish` rebuild first, without `-SkipBuild`. Install the new Lab package as a data-preserving update with the existing application identity and signing key. Do not rerun the configuration helper on an already configured project. See [installed setup](INSTALLED_SETUP.md).

`node tools/build-guide.mjs` regenerates public help and the embedded manifest; `--check` verifies both projections. Normal builds verify the shipped runtime hashes. No runtime vendoring is needed for this wording release. Installed builds use the owner shell and app document’s Guide agent; the hosted preview remains inert. The project maintenance promoter publishes a new authored version and changes only its current Guide binding. Never edit a prior immutable version directory.

The following sections describe earlier releases. Their former defaults and version selections are historical; current role and installation behavior is documented above.

## Historical · Expired review and receiver recovery · Lab 0.7.4

Guide offers **Refresh expired review** when a transaction expired before its first send. The old record remains exportable. One successor keeps the original sender, recipient, amount, asset and document/report commitment. The payout or request points to that successor; completed siblings retain their receipts. New treasury reviews, wallet approval and sending remain separate clicks. Select the saved sender in Wallets if another account is active.

Unknown or submitted attempts are never refreshed. Continue checking their original receipts. Payment-request validity is separate: expired request terms need a newly issued request; timely past transfers remain verifiable.

The token walkthrough now has a receiver setup step. It preserves a supplied address, uses another saved devnet wallet, or offers an explicit **Create receiver wallet** click. Latch creates the new receiver without changing the payer. Back up the receiver in Wallets. This does not create token holdings or permit a mint; Check setup still checks tokens, fees, rent and configured limits.

Guide error cards reposition when their contents grow, with the action area kept visible on smaller screens.

## Historical · Token setup checkpoint · Lab 0.7.5

The token walkthrough has seven authored steps, with its sign/send/receipt actions retained inside the transaction step. Before allocating a payment, Guide reads the exact payer associated token account, mint, SOL balance and configured permissions. Missing tokens or permissions keep the current step open as **Check token setup again**, with the next action explained. For demo USDC, copy the payer address and use the faucet's Solana Devnet network; funding a receiver or holding only SOL does not satisfy the check. No draft payment is created until setup passes.

Fresh checks run again before preparation, including SPL payment requests. A previously interrupted token preparation can resume its saved operation after funding. No fresh operation is allocated to hide that failure, and a submitted/unknown operation is still reconciled in place. These observations do not authorize, reserve or guarantee a transfer.

## Historical · Faucet handoff · Lab 0.7.6

The token setup checkpoint focuses the faucet panel, falling back to the setup panel for a custom mint. It explains that SOL is separate from USDC, shows the exact payer, and points to Circle’s manual **USDC / Solana Devnet / Send 20 USDC** flow. Guide stays on its check until RPC observations and configured permissions pass. It neither submits faucet requests nor infers funding from opening a link. Custom mints are never treated as Circle USDC. Wallets also exposes the handoff and a route back to Token desk; mainnet and the inert preview have no devnet wallet funding controls.

## Historical · Payer setup on the request page · Lab 0.7.7

The new-request walkthrough has eight authored steps, including receiver and payer setup. **Pay with Guide** has five. Neither sends the user to Wallets as an unchecked Next step. Payer selection, funding, review and transaction controls stay accessible within the active Guide target. If the active wallet changes during review, Guide returns to the saved payer selection and presents the sign checkpoint again. That selection click does not sign.

No suitable wallet or insufficient funds keeps setup open with an actionable choice. RPC failures remain retryable; they do not pass old observations. SOL requests need their amount plus fees. SPL requests need the exact associated token balance, SOL and both owners’ configured permissions. Exact fees and account rent are checked again in preparation. Wallet creation does not fund a wallet, and faucet requests remain manual.

## Historical · Funded payers and cross-site steps · Lab 0.7.8

New drafts reuse observed funded devnet wallets. If a local request with no payment names the only funded wallet as receiver, Guide offers a named new-demo action that preserves the old request and changes the new demo's roles. Imported terms and existing payment senders stay fixed.

Missing SOL or default-USDC funding may return an optional `guide.handoff`. Guide 0.11.0 opens a Links 0.4.0-alpha.1 tab with the public payer address and Copy/Return controls. The app spotlight pauses; return or tab close restores the same checkpoint. Checking again must observe real funds before proceeding. With no usable tabs, that handoff is skipped and normal copy/faucet links remain. The funds gate, review, signing, sending and verification are never skipped. The companion does not read the clipboard or drive the remote site.
