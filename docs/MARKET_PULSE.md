# Market Pulse

Market Pulse is a reusable price feed and chart Sidecar. It has no dependency on Solana Edge, a wallet or an execution venue. Solana Lab 0.7.11 uses Market Pulse 0.1.0-alpha.2 for the top chart and for Arena position prices.

## Apply this update

Close cApp and apply the cumulative bundle folders to these matching existing roots:

| Bundle folder | Destination |
| --- | --- |
| `capp/` | `C:\Users\alex1\babelapp-v0` |
| `solana-lab/` | `C:\Users\alex1\solana-lab` |
| `solana-lab-project/` | `C:\Users\alex1\cApp\projects\solana-lab` |

Rebuild/restart cApp with `-NoShowroomPublish` and without `-SkipBuild`, compile the updated Lab source into a new release, then build and install an update. Keep the existing payment, Guide, Local AI, RPC and Market selections/configuration. No configuration helper is needed for this already configured project. Keep the installed app identity, signing key and storage; see [installed setup](INSTALLED_SETUP.md).

The canonical installed package is `capp/sidecars/market-pulse/`. The current owner registry advertises alpha.2, and cApp's build regenerates that registry from canonical manifests. This project's existing built-in Market selection resolves by ID to the current registry and package, preserving its configuration even if the stored selection label still says alpha.1. It needs no reimport or remove/reselect cycle. A new owner build and Lab package are required; merely refreshing a previously built executable cannot replace its Sidecar.

## Selected ownership and startup

The installed Lab shares only the selected Market Pulse published by its verified owning shell. Its selected enabled/disabled setting, provider and device scope remain authoritative. While it starts, the app waits for the owner readiness event; **Retry Market connection** also retries discovery. A startup failure stays visible, and an absent or incompatible selected package needs the appropriate owner update. The Lab does not start an enabled bundled feed to bypass that choice. Wallets and devnet payments remain available while Market is unavailable; new positions wait for a fresh price.

Standalone browser development uses the bundled implementation. The locked public preview starts no market provider. A selected installed instance owns its build and device settings; review provider access in **Market settings**. Existing credential values are retained without any claim that this update verified their validity or live access. Older device settings from another selection are retained separately and cannot silently enable or override the current selected provider.

## Use the chart

The **Market** bar starts collapsed below the header, inside the main column. Opening it pushes the content down and leaves the navigation beside it. It remains open as you navigate. Position Studio can keep the feed active with the chart collapsed.

- Candles, OHLC bars, line and area views share the same history.
- Choose 15-second, 1-minute or 5-minute intervals; additional intervals can be configured.
- Pan by dragging, zoom with the wheel or +/−, and use **Fit** or **Latest**. Keyboard: +/−, F and L when the canvas is focused.
- Market settings contain source, key, indicators, volume and device persistence. Advanced contains request cadence, quota, staleness, HTTP adapter settings and the instrument list.
- JSON import/export carries settings and an `extensions` object. Export omits credentials; blank key inputs preserve the current keys. To clear the active keys, select **Clear current keys** and **Apply settings** with the credential fields empty. This edits current configuration and, when remembering is enabled, its active device record. It does not erase retained earlier records or change packaged build defaults.

## Price and candle semantics

Jupiter Price V3 supplies current USD price observations. It does not supply historical OHLCV or traded volume. The default gathers one observation every 15 seconds and aggregates observations into 15-second buckets. A bucket containing one observation has equal open, high, low and close. The panel shows the sample count and marks volume unavailable. More frequent observations can produce richer candles.

The chart begins with the first observation. It retains bounded local history, leaves missing intervals empty and does not invent candles while paused or closed. Reloaded history is visible, but the current price stays unavailable until a fresh response arrives. Repeated responses with the same provider block ID eventually become stale.

An OHLCV provider may supply real candle snapshots with volume. Each snapshot replaces the same timestamp/interval; volume is never counted twice. Larger intervals aggregate bars only when the source interval divides them exactly. Smaller bars cannot be reconstructed from a larger provider interval.

## Rate settings

The default is **15-second polling and 15-second candles**, about four requests per minute while active. Saved settings take precedence, so an existing five-minute candle choice remains five minutes. Up to 50 Jupiter mint addresses share one request. Chart duration and polling frequency are separate settings.

Conservative mode enforces a 15-second minimum. Custom mode permits a requested 1-second interval, constrained by 80% of the configured requests-per-minute budget. For example, a budget of 60 produces at least 1.25 seconds between requests; a budget of 120 can permit 1 second. This setting does not purchase or detect a paid plan. Set the budget to capacity available to this application.

Jupiter documents shared organisation quotas across relevant APIs. Other devices and apps can consume that quota. This implementation shares one request loop within the owning app process, not across all installations or unrelated browser tabs. A future broadcaster can centralise those upstream requests through the existing HTTP provider contract.

Requests never overlap. A 429 honours `Retry-After` and `x-ratelimit-reset` and adds bounded backoff. Changing chart settings or pressing Resume cannot shorten that cooldown. Network failures back off; authentication failures stop automatic retries until settings change or the user resumes. No active consumer, background visibility or Pause stops polling.

## Position Studio

New long positions use the latest fresh SOL/USD observation. Size is simulated SOL units. Unrealised P&L is `(mark − entry) × remaining units`; realised P&L sums each completed reduce/close action at its saved price. Fees, slippage, leverage and real fills are not modelled.

Every action saves its observed price and provenance before Sidecar execution. The price is included in the message/evidence digests. Recovery observes the recorded action before considering another Arena execution and retains the original price even when the feed changes. Stale prices block new actions; an already recorded action can still reconcile. Legacy positions keep their original fixed-price basis.

The optional scaled devnet evidence transfer remains a separate reviewed transaction. Market Pulse never funds, signs or submits it.

## Reuse and extend

See [the independent Sidecar API](../sidecars/market-pulse/README.md) for ES-module use, shell use, multiple graphs and the HTTP/push packet contract. The package contains editable modules, a deterministic classic-script bundle, schemas, metadata and an asset ledger.

After intentional bundled Sidecar source edits, run `npm run build:market`, then `npm run test:all` and `npm run build`. Keep the canonical cApp package aligned for installed use and regenerate its registry through the normal cApp build. Normal Lab builds verify the market asset ledger and the eleven existing Solana runtime hashes before copying the public closure. Applying this already generated update needs no manual asset-ledger edits.

## Reference and acceptance

- [Jupiter Price API](https://developers.jup.ag/docs/price)
- [Jupiter request limits](https://developers.jup.ag/docs/portal/rate-limits)
- [Price data and history](https://developers.jup.ag/docs/guides/how-to-get-token-price)

Automated checks cover the actual bundled runtimes, mocked price responses, rate limits, stale data, retry identity, UI controls and installed shell/app-frame fixtures. Current ownership checks include delayed selected startup, disabled configuration, failure, retry and isolation from other frames. These fixtures do not establish live provider access, real chart layout or Windows/Android acceptance.

Historical validation attempts recorded Cloudflare HTTP 403 (1010), a separate direct timeout and a blocked cloud-browser preview. Those observations remain historical; they do not qualify a retained credential or establish the current provider's behavior on your machine.

For installed acceptance, open the chart and wait for a fresh price from the chosen provider. Visit Position Studio, open a simulated position, change the chart interval, pause/resume the feed, then reduce and close. Confirm that the chart pushes content down, the nav stays clear, stale data stops new actions, disabled Market stays disabled, and no wallet prompt occurs for Arena positions. An optional devnet evidence transfer remains a separate reviewed action using the Lab's saved receiver.
