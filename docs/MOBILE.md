# Mobile verification — 0.7.10

This update changes the cApp Android package loader, Links, Local AI, Guide and Debug presentation, and the Lab's startup/navigation. Apply both source roots, compile a new release, then rebuild the Android bundle.

## Expected behaviour

- Cold start: all eleven Solana APIs connect even while an optional AI model is downloading. Missing components remain diagnosed; late activation recovers without restarting the app or loading rehearsal providers.
- One app tab: automatic mode hides the browser strip on mobile. Android Build can instead keep it visible; its new preview also controls bar appearance, shortcuts, link handling and tab count. Opening another tab restores it, and closing the last extra tab hides it. Returning preserves forms, wallets and operations. Desktop behaviour stays the same.
- Navigation: Explore demos expands all groups. Choosing a page or pressing Escape closes it; browser history continues to work.
- Appearance: the Lab retains its light canvas and text contrast. Guide, AI and Debug shortcuts share a bottom row; full panels suppress other launchers. Download progress has one dismissible notice. Dismissing it does not cancel a download.
- Guide: on a fresh install, starting a wallet-based demo creates a missing device devnet payer on the setup click, then reuses or creates a distinct receiver for tokens/requests. Back up these wallets. Funding checks remain in Guide. Transaction steps still require separate review, wallet approval, send and receipt actions. Funding handoffs depend on the installed tab capability.

## Device acceptance

1. Install the rebuilt AAB as an update on the Pixel emulator and a physical Android device. Confirm the footer says 0.7.10. Avoid a data-clearing install if you need to retain device wallets.
2. Cold start with a model still downloading. Check Debug: declared components are activated, and Local AI model progress is separate from service readiness.
3. Open every demo using Explore demos; check portrait, landscape, a narrow display, the on-screen keyboard and Back. Check Guide, AI and Debug panel bounds against system bars.
4. Open a faucet or a bundled documentation file; return to the app, close the other tab, and check the strip hides and entered fields remain.
5. With a backed-up funded devnet wallet, complete one small reviewed payment and observe its receipt. Continue a saved payout without replaying a completed child. Check external-wallet prompts only if the host has a provider.
6. Close and reopen during a model download and during an unfinished payment. Inspect model resume and reconcile the existing payment instead of creating a new one.

## Automated coverage and limits

The generated Android frontend is exercised in Chromium phone emulation with all 16 selected components. RPC and native Local AI/browser commands are controlled fixtures. These checks cover activation, late recovery, layout, tab state, model notices and a guided checkout. Existing desktop Links and complete Guide transaction suites remain relevant.

Browser emulation does not verify JNI/Gradle compilation, Android WebView/native child geometry, hardware keyboard/insets, a real model download or inference, live RPC availability, wallet providers or funded transactions. Those remain device acceptance checks.

## Compact AI progress

Downloading and initialising share one 32-pixel edge indicator on Android and desktop. The Links app/browser surface and the desktop app frame reserve its height, including Android guard clearance, so it does not cover app content. Details opens the full AI controls; dismissing returns the space without cancelling model setup. Initialisation replaces downloading in the same indicator. Native progress and baseline setup do not create duplicate cards.
