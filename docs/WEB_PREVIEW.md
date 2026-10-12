# Publish Solana Lab as a web preview

Solana Lab stays in its own project folder, including
`C:\Users\alex1\solana-lab`. cApp's Cloudflare publisher can build from that
folder and mount the output at `https://c-app.uk/solana-lab` without copying
the source project into cApp.

## Local preview

```powershell
npm run build:preview
npm run preview:web
```

Open `http://127.0.0.1:8095/solana-lab`. Direct paths work for all twelve recipes,
wallets, the component library, receipts and developer docs. For example,
`/solana-lab/service`, `/solana-lab/positions` and `/solana-lab/docs/sdk`.
The old `#/...` links are migrated to the corresponding clean paths.

The preview keeps the architecture explorer, Guide articles and SDK/guide
downloads. Runtime-dependent controls are disabled, including simulated
Arena and policy execution. Wallets, RPC, live pricing and Local AI are not
started. The preview neither loads saved operations nor writes new ones.
No provider configuration, runtime bundles or client credentials are included.

`npm run build` still produces the full app for cApp packaging and local
browser development. Do not use that output for the locked hosted preview.
The normal build's hash routing and installed-runtime discovery are unchanged.

## Publish through cApp

Apply the matching cApp hosting update, then run this from the cApp repository
root (not from this Lab folder):

```powershell
.\run-capp.ps1 -PublishShowroom -SolanaLabRoot "C:\Users\alex1\solana-lab"
```

The launcher uses your existing Cloudflare configuration. It stages a verified
preview into cApp's generated `dist/solana-lab` directory, then publishes the
combined static assets with the existing Worker. Later Lab edits trigger the
same changed-input publication check. The default source is
`%USERPROFILE%\solana-lab`; use private `CAPP_SOLANA_LAB_SOURCE` or the command
parameter for another location.

The preview build uses a public asset allowlist and deterministic manifest.
Unknown routes stay 404, missing files do not return an app shell, and the
host applies a CSP with `connect-src 'none'`. It is deliberately a browseable
preview; these locks do not claim to secure arbitrary third-party JavaScript
that a visitor writes themselves.

## Checks

`npm run test:preview` tests the actual preview output over HTTP and in a DOM:
all 21 routes, docs/Guide/map interactions, omitted runtime configuration,
forced-action rejection and no network or stored-operation effects. It is
also part of `npm run test:all`. These checks do not claim a visual review,
live Cloudflare acceptance or an installed-device test.

Delivery status: built and tested locally. Publish using the command above;
this patch was not deployed from the editing environment.
