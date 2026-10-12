# Solana Lab — complete Guide workflows

Implemented against the three newly supplied archives dated 27 September 2026. No older source checkout was used as the editing baseline.

| Component | Updated version |
|---|---|
| Solana Lab | 0.7.3 |
| cApp Guide Sidecar | 0.10.6 |
| Project Guide release | 1.4.0, revision 9 |

## What changed

The old walkthrough prepared a payment, then jumped to receipt verification and asked the user to finish elsewhere. Guide now displays the actual next transaction action and waits for its own click: review, wallet approval, send, or check receipt. Each card shows the saved sender, recipient and amount.

- **Payout desk:** all 2–5 children, one at a time, with a payout counter. Completed children stay complete across reloads.
- **Treasury:** two distinct local reviewer approvals, then wallet approval, send and receipt. Reviewer details remain visible after the quorum check.
- **Service desk:** order payment, report delivery, linked document proof payment and exact-text comparison.
- **Checkout, Proof studio and Token desk:** complete preparation, signing, sending and receipt verification.
- **Payment requests:** create/share, choose a separate funded payer, pay, then independently verify finalized recipient credit. “Pay with Guide” follows the request open on the page.
- **Position evidence:** the optional scaled devnet transfer has its own complete walkthrough, bound to the chosen completed Arena action.
- **Page launches:** a visible saved transaction can be continued directly, without creating another order. Guide hub launches retain their saved run binding.

The Assistant offers the same workflows. Its model tools remain read-only. Public help and the project’s searchable offline manual have been regenerated; the release has 26 workflows and 71 authored app articles.

## Shared cApp fix

Guide now supports a schema-backed action-progress result. An app can retain the current step, explain the next action and wait for another click. Required user confirmation also applies in Auto mode and across the owner-shell/app-frame boundary. Synthetic clicks and brokered calls cannot confirm these actions. Existing ordinary action handlers keep their behavior.

Long wallet addresses wrap inside Guide cards, and the primary action fits the card on desktop and mobile. No additional Sidecar was created. Solana payment authority still belongs to the existing providers; Lab owns its workflow orchestration.

## Continuity and failure behavior

Signing and sending are separate clicks. A lost send response becomes a check of the same attempt. Pending finality keeps the receipt checkpoint open. Blocked or failed children cannot produce a completed batch. Restart, Back, a replayed checkpoint or changed saved state requires a fresh review before another effect. Guided effects recheck expected state under the workspace lock. A service cannot reset while its linked proof payment remains unresolved.

All previous published Guide versions are byte-identical. The project’s source bindings, compiled history, shell settings, RPC configuration, mint limits and Local AI/GPU choices are preserved. The current Guide release was created through the supplied cApp project publisher.

## Verification

- Full Lab source suite, including installed-owner fixtures and inert preview checks.
- 19 transaction-controller regression groups with the shipped Solana runtimes and offline signed RPC fixtures.
- 9 full click-through browser groups: Auto confirmation, synthetic/broker rejection, five payouts, reload, service-to-proof, tokens, requests, lost replies and mobile layout.
- 8 existing Guide browser groups, 11 draft/default browser groups and 8 Assistant browser groups.
- Separate-document cApp owner-shell/app-agent browser check, plus Guide lifecycle and compatibility smoke tests.
- cApp standard gate: 591 checks; canonical registry, project release hashes, source/build binding and preserved settings verified.
- Normal Lab build, 26-route inert preview and staged cApp preview verified.

No live devnet funds were spent. Browser/RPC fixtures do not certify the Windows WebView, native wallet prompts or external-wallet providers. After rebuilding, run a small devnet checkout, a two-payout batch and a service-to-proof walkthrough in the installed app.

## Apply

1. Close cApp.
2. Extract `solana-lab-0.7.3-guide-workflows-overlay.zip` into the existing Lab source root (`C:\Users\alex1\solana-lab`).
3. Extract `capp-guide-0.10.6-workflows-overlay.zip` into the cApp source root.
4. Extract `solana-lab-guide-1.4.0-project-overlay.zip` into `C:\Users\alex1\cApp\projects\solana-lab`.
5. Run the usual `run-capp.ps1 -Clean`. Refresh/recompile the Lab and rebuild/reinstall. The updated project selects Guide 1.4.0 revision 9. Reapply Guide release (User) if an open editor cached an older selection.

Each overlay is root-relative, with no extra wrapper directory. Updated full source archives are also supplied. Preserve the installed app’s data when updating so its wallets and saved runs remain available.
