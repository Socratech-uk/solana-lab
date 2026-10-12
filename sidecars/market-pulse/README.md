# cApp Market Pulse

An independent market-data Sidecar with a shared request loop, bounded history, configurable OHLCV charts and read APIs. The renderer is adapted from the supplied SYNTH canvas implementation: candles, zoom, crosshair, moving averages and instance-local rendering. No external chart library or TradingView key is required.

## ES modules

```js
import {MarketPulse, SOL_MINT} from './sidecars/market-pulse/core.mjs';
import {mountMarketPanel} from './sidecars/market-pulse/panel.mjs';

const feed = new MarketPulse({
  providerMode: 'jupiter',
  apiKey: '',
  symbols: [{id: SOL_MINT, label: 'SOL / USD'}],
  pollMs: 15000,
  candleMs: 15000,
});
const panel = mountMarketPanel(document.querySelector('#market'), feed);
// Starts collapsed. Its lifecycle acquires/releases the feed automatically.

// Another application consumer shares the same requests:
const release = feed.acquire('position-view');
const unsubscribe = feed.subscribe(({status}) => {
  const quote = feed.quote({id: SOL_MINT});
  // Check quote.available and !quote.stale before using quote.price.
});
// On view removal:
unsubscribe(); release(); panel.destroy();
// On final owner shutdown: feed.destroy();
```

Mount multiple panels against one feed, or instantiate `PulseChart` from `chart.mjs` and pass validated candle rows to `chart.update(rows, config, levels)`. Panels share provider and style settings; each has its own instrument selection, pan and zoom. An independent `MarketPulse` instance has its own provider configuration and request budget.

The feed follows its owning document's visibility automatically. For a custom host or worker, use `feed.setHidden(bool)` when the consuming view goes into the background. Release consumers when their views close. `refresh()` is bounded by the same cadence and cooldown; it is not an unrestricted bypass.

The optional environment object accepts `fetch`, `now`, timer functions, `document`, `storage` and `storageKey`. Supply a project/component/app-scoped storage key when persistence is wanted. Without a storage adapter the module retains history in memory. Remembered device settings include configured client credentials; exported settings omit them.

## cApp shell package

Select `uk.capp.sidecar.market-pulse`. The bundled `runtime.js` reads that selection from the executable plan and exposes `window.capp.market.pulse`. `window.CAppMarketPulse` exposes `create(config, env)` and `mount(container, feed, options)` for custom views. Activation emits `capp:market-pulse-ready`; an invalid configuration emits `capp:market-pulse-error`. An unselected package does not start a feed.

Version `0.1.0-alpha.2` binds that API to the exact owning window, project/component/app scope, selected package version and normalized starting configuration. `CAppMarketPulse.selected()` returns only the current matching selected instance. `activateSelected()` reconciles a changed selection, stops a conflicting instance first and preserves a valid shared instance. Re-evaluating the generated runtime is idempotent. Ready/error events include `protocol: capp.market-activation.v1` and the Sidecar ID; ready events include a credential-free authority descriptor and selection revision. Errors never report configuration or credential values.

Installed consumers must treat a selected but missing, failed or stale API as unavailable. Solana Lab continues its payment workflows and can reconnect when the owning runtime announces readiness. Bundled Lab defaults are used only for an explicitly standalone browser flow without an installed selection. They cannot replace a selected manual or disabled feed.

Remembered in-app settings are restored only for the same selected starting configuration and package revision. A new selection uses its own settings, so a legacy enabled feed cannot override a newly selected disabled or manual provider. Compatible historical bars remain readable but never become a fresh quote. Before any later persistence replaces older state, the original bytes are retained under a separate key on this device; a failed retention write blocks the overwrite. The panel explains that the selected settings are active and invites a settings review. No wallet data is changed. Like existing remembered settings, retained market state can contain configured client credentials and must not be treated as a public export.

The package has no required Sidecar peers. The manifest declares read capabilities for status, quotes and candles; an app/broker can map those to the methods below. Solana Lab exposes these through its existing bounded assistant tool adapter as `lab.market.status`, `lab.market.quote` and `lab.market.candles`. No general cApp agent-broker modification is included in this additive package.

| Method | Result / purpose |
|---|---|
| `status()` | Redacted status, cadence, deadlines, instrument marks and errors |
| `quote({id})` | Available/stale flags, USD price, observation/source time, block and quality |
| `candles({id, intervalMs, limit})` | OHLCV rows with null volume where absent, sample count and interval status |
| `configuration()` | Settings with credential-presence flags, without credential values |
| `configure(patch)` | Validate and persist settings; return redacted configuration |
| `exportConfig()` / `importConfig(objectOrJSON)` | Extensible versioned settings; export omits keys |
| `subscribe(callback)` | Immediate and subsequent snapshots; returns unsubscribe |
| `acquire(label)` | Start/retain demand; returns release |
| `pause()` / `resume()` / `setHidden(bool)` | Lifecycle controls |
| `ingest(packet)` | App-supplied quotes/candles in manual-provider mode |
| `destroy()` | Abort and dispose the owning instance |

## Provider contract

Jupiter mode requests `https://api.jup.ag/price/v3?ids=...` and attaches only its optional `x-api-key`. It aggregates current price samples, not historical trade data. No traded volume is inferred.

For an HTTP OHLCV service:

```json
{
  "providerMode": "http-candles",
  "adapterUrl": "https://your-provider.example/candles",
  "adapterToken": "",
  "symbols": [{"id": "SOL-USD", "label": "SOL / USD"}],
  "pollMs": 15000,
  "candleMs": 15000,
  "extensions": {"deployment": "example"}
}
```

The Sidecar sends a GET with `ids` and `intervalMs`. A configured adapter token uses `Authorization: Bearer …`; the Jupiter key is never forwarded to this endpoint. The endpoint must support the requesting browser/WebView origin and headers. Redirects are rejected. Return `capp.market-feed.v1`:

```json
{
  "protocol": "capp.market-feed.v1",
  "instruments": [{
    "id": "SOL-USD",
    "quote": {"price": 151.2, "time": 1800000000000},
    "candles": [{
      "time": 1799999985000,
      "intervalMs": 15000,
      "open": 151.0,
      "high": 151.4,
      "low": 150.8,
      "close": 151.2,
      "volume": 23.5
    }]
  }]
}
```

Times are Unix milliseconds. Candle start times must align to `intervalMs`. Prices are USD; volume, when supplied, is traded base-asset units. Quote time must describe a current source observation, not the age of the HTTP response. Use one base candle interval per instrument; a later packet replaces matching bars rather than adding their volume. Omit volume or use null when unavailable. Supply a quote for live marks/P&L; bars alone only populate history. Packets are bounded to 50 instruments, 1,000 bars per instrument and 1 MB per HTTP response.

Manual mode accepts the same packet with `feed.ingest(packet)`, so a host-managed WebSocket, oracle or broadcaster can adapt without replacing chart code. This package supplies an HTTP adapter and push contract, not a hosted broadcaster or WebSocket reconnect service. `extensions` stores bounded JSON metadata; it does not execute provider code. New native providers can be added in `core.mjs` while preserving the public contract.

## Development

Run `node sidecars/market-pulse/build.mjs` from the project root after intentional changes. This deterministically rebuilds `runtime.js` and `assets.json`. The source modules remain the editable source of truth. `schemas/` documents configuration and packet shapes; runtime validation also checks time alignment, range consistency, response limits and stale ordering.

Data quality, rendering and transaction authority are separate: this Sidecar never chooses a wallet, authorises an operation, signs or submits a trade.
