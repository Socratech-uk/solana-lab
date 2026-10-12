# Local AI and web components

The web app runs fully without a model. The Assistant drawer can browse authored
Guide articles and actual component status on its own. Model chat is available
when a compatible host exposes the Local AI Sidecar's `window.capp.ai.local`
API, either in the app window or its same-origin packaged parent.

Model download, GPU/inference settings and loading stay with that Sidecar's
Studio. Solana Lab does not start a model server or assume an arbitrary loopback
port is trusted. A plain browser visit therefore shows the model connection as
optional and leaves Guide/status usable.

## Connection contract

`src/assistant.mjs` creates an app-scoped `connect()` connection, checks
`status()` for `nativeReady` and `currentModelId`, and calls:

```js
connection.complete({
  system: authoredInstructions,
  prompt: userTaskAndToolContext,
  maxTokens: 768,
  responseFormat: 'json',
  isolated: true
});
```

`connection.cancel()` stops this assistant's request. `ai.local.openStudio()`
opens model settings. A future Local AI web-components app can implement this
adapter contract, or use the exported `assistantTurn()` loop with its own scoped
connection. An HTTP transport and authentication scheme would be an explicit
adapter, rather than a hidden automatic connection from every website.

## Shared tools

The app exposes eleven typed read tools through `window.solanaLab.tools` and
`window.solanaLab.call(name, arguments)`:

| Tool | Input | Result |
| --- | --- | --- |
| `lab.market.status` | `{}` | Feed readiness and cadence |
| `lab.market.quote` | `{id?: string}` | Observed price and freshness |
| `lab.market.candles` | `{id?: string, intervalMs?: number}` | Up to 120 retained candles |
| `lab.guide.search` | `{query: string}` | Authored articles with IDs, titles and routes |
| `lab.sidecars.status` | `{}` | Actual availability and provider status |
| `lab.operations.list` | `{}` | Saved payment and connected-workflow summaries |
| `lab.operation.read` | `{id: string}` | One recorded payment or bounded workflow summary |
| `lab.receipts.list` | `{}` | Recent receipts, explicitly labelled Arena or devnet |
| `lab.assets.read` | `{}` | Saved asset/mint observations and the last read-only payment setup report |
| `lab.requests.list` | `{}` | Saved request terms, verification and last check |
| `lab.activity.read` | `{}` | Last bounded address-activity observation |

```js
const context = await window.solanaLab.call('lab.guide.search', {
  query: 'quorum recovery'
});
```

These are local app contracts. They are not a network MCP server, an external
agent session or an authorization grant. Tool schemas and dispatch live in
`src/lab.mjs`, shared by the assistant and its UI shortcuts.

All twelve page defaults, named demo offers and New run availability use `src/guide-catalog.mjs`. Token payments, payment requests and wallet activity route to their own workflows, including when requested from a different page. Failure questions remain questions; they do not automatically start a workflow. Guide me still requires a click. Token and request cards expose the same guarded New run control as Guided demos.

Check setup is an explicit page action. The Assistant reads its saved report and can explain missing mint permissions, stale wallet observations and fee/rent checks; it does not refresh balances, change permissions or prepare a payment through a model tool.

Ordinary prose is accepted as display-only text. JSON read requests are validated
against the declared tools; malformed envelopes receive one format-repair attempt.
Supported engines receive a structured-output schema. Requests reserve answer space
in the loaded context and compact whole older history/evidence records. The current
question is never silently truncated. Reads are bounded and duplicate reads are not
executed again in the same turn. Tool errors are visible observations.

A model can offer a declared workflow, rendered as Guide me / Watch demo buttons.
Only clicking a button starts the actual Guide controller; the model has no wallet
authority or arbitrary execution API. Stop cancels scoped inference and discards late
responses. Real-model acceptance remains separate from fixture tests.

## Custom elements

`lab-assistant`, `sidecar-badge` and `flow-strip` are native web components.
`lab-assistant.setLab(lab)` supplies its scoped application access;
`open()` reveals the panel and refreshes connection status. New web components
can use the same typed read tools without coupling themselves to a page layout.

The current expansion adds the developer guide to search and connected workflows to the existing read tools. A workflow read returns digests and progress, not its raw document or report input. The Assistant also receives the current page, selected public wallet address, saved sender and policy explanation. Its model can suggest declared Guide tasks, and its UI starts the shared Guide controller.

## Shared device defaults

Guide, Agent and Local AI Studio use the same installed engine and owner preferences. The updated cApp detects supported NVIDIA GPUs, uses automatic layer fitting with CPU fallback, and selects a 4K or 8K context from the current memory budget. Existing custom settings remain intact; **Use recommended settings** explicitly re-enables adaptation. Open Guide → Ask & tasks → **Model & inference settings** or the Lab Assistant’s model settings. Applying reloads an already loaded model. Android retains its packaged engine; the Windows GPU controls are not an Android GPU claim.

## Chat and Guide UX

Enter sends; Shift+Enter adds a line, and IME composition does not submit. Drafts
survive tab changes and model status refreshes. Greetings, Explain this page,
Guided demos and the searchable Guide library work without a model. The open
panel refreshes readiness every five seconds and on window focus. Model settings
opens the shared inference controls, with Studio as a compatible fallback.

The demo catalogue launches the existing Guide API; it does not duplicate its
workflow engine. Step highlights, Next/Back, action confirmation and receipt gates
remain in Guide’s page overlay. The Assistant exposes tour, status, stop and full
Guide controls alongside conversation and read results.

The asset, request and activity tools read saved observations only. They do not poll RPC or prepare payments. Every snapshot carries its wallet/address, network and observation time. Guide workflows expose new asset and request actions through explicit user confirmation; model text cannot authorize them.
