# Complete Solana Lab restoration — 0.5.2

This is a complete, root-relative project archive: source, tools, package and
lockfile, tests, vendored runtimes, documentation, fresh `dist/`, and the locked
21-route `dist-preview/`. It does not require any earlier Lab overlay.

## What was wrong

The supplied `sikab0kab.zip` passes ZIP integrity checks. Four root source files
were absent: `index.html`, `package.json`, `package-lock.json`, and `README.md`.
Nine files in its built `dist/` differed from the newer source/runtime files.
The wallet/ledger recovery patch itself was present byte-for-byte.

The four missing files exist in the previously delivered 0.5.1 artifact.
They were recovered from that artifact under the user's explicit restoration
request, then the root package/lock/footer were advanced together to 0.5.2.
No wallet keys, operation records or private workspace state were reconstructed.
The archive alone does not establish what deleted the root files.

The current uploaded application and runtime code is retained. The wallet
contract checks now run in `test:all`, and the browser command runs both wallet
suites. An optional screenshot directory keeps this phase's screenshots
separate from the earlier evidence. Current setup/testing docs are updated;
historical evidence is preserved.

## Use it

Keep a copy of the existing source folder, then extract the complete ZIP into
`C:\Users\alex1\solana-lab`. `index.html` and `package.json` belong directly in
that folder. Do not clear installed application data to replace source files.

```powershell
cd C:\Users\alex1\solana-lab
npm run dev
```

Open `http://127.0.0.1:8095/`. Running/building the app needs Node.js 20 or newer
and uses the shipped runtimes; no npm runtime installation is needed.
For development checks: `npm ci`, then `npm run test:all`. Rebuild with
`npm run build` or `npm run build:preview`.

For cApp publishing, keep the paired cApp recovery/preview fix in
`C:\Users\alex1\babelapp-v0` and rerun the existing PowerShell command with
`-Clean -PublishShowroom -SolanaLabRoot "C:\Users\alex1\solana-lab"`.
Installed Lab builds need the matching Latch 0.4.1 and Edge 0.4.3 cApp runtimes;
recompile/rebuild the Lab while keeping its existing app/project identity and
working RPC profile. This archive contains no cApp core files.

## Verified

- Clean lockfile installation succeeds.
- All 122 checks in `npm run test:all` pass, including previously blocked
  complete UI, installed-frame, distribution and preview tests.
- All 13 real Chromium wallet/recovery scenarios pass, with mocked RPC and
  disposable wallets. Screenshots are in `wallet-full-restore/`.
- Normal app and locked preview builds succeed and match the current source.
- The paired cApp hosting gate passes all six checks against this complete
  project, including QR license/metadata serving and all 21 clean routes.
- Complete-archive extraction, file hashes, dependency installation and both
  builds are verified before delivery.

Native Windows/Android engines, real Solflare, funded transfers and live
production publication remain separate acceptance work. Mainnet sending
remains disabled and the experimental custody warning remains prominent.

Recovery provenance: `FULL_RESTORE_PROVENANCE.json`. Test output:
`FULL_RESTORE_TESTS.log` and `FULL_RESTORE_BROWSER.log`. The complete ZIP file
inventory is `FULL_RESTORE_FILES.json`; that inventory excludes itself from its
own digest list. The accompanying SHA-256 identifies the complete archive.
