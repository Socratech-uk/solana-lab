# Wallet follow-up: Lab 0.5.1

Source: the supplied `solana-lab(2).zip`, SHA-256
`ca803c3efcdfc89e19d59d24e5005b5404ed812212302f801c988eaba0113e70`.

## Delivered in this Lab overlay

- Public receive QR for device and connected external accounts, with the network
  and mainnet exit path stated beside the address. An independent decoder checks
  the rendered QR data against the original address.
- Per-wallet local Lab history, filtered by exact network and sender/recipient.
  Opening a record resumes its existing operation and does not send a payment.
- Downloaded-backup file comparison. Only a digest and result remain in session
  memory; private keys and backup content do not enter Lab activity/evidence.
  A match is a file-copy check, not a password or restore guarantee.
- Failed wallet reads remove stale account controls. Damaged-store guidance
  explains the current recovery limitation and preserves the stored bytes.
- A pinned, vendored QR encoder with its MIT notice and build-time integrity
  check. Running the app still needs no npm install or remote encoder service.

## Evidence

| Gate | Result | Scope |
| --- | --- | --- |
| `npm run test:all` | 119 passing scenario groups | Lab, DOM, fixture RPC, installed-shell fixture and inert public preview |
| `npm run test:wallet:browser` | 8 passing scenarios | Real Chromium 138.0.7204.0, fixture RPC, disposable wallets |
| `npm run build` | Passed | Shipped runtime, shared developer assets and QR digests verified |
| `npm run test:wallet:contracts` | **Failed: 3 unmet cases** | Two canonical cApp defects below |

The browser run covers real file downloads and file inputs, devnet persistence
across reload, mainnet encryption/warning/lock controls, encrypted backup
download → remove → import → reload with the same address, a reviewed devnet
fixture payment, history reopening without another send, and damaged-store
presentation. Desktop and 390-pixel mobile screenshots are under `wallets/`.
The desktop and mobile layouts were visually inspected.

No live RPC transaction, funded wallet, Solflare extension, native Windows app,
Android app, or cApp self-host build was accepted by these tests.

## Blocked canonical repairs

The current upload contains generated Sidecar copies and their provenance
ledgers, but no authoritative cApp templates, schemas or generator. The supplied
`memory.md` contract from this session requires current source and repairs at
the owning boundary. All `runtime/` files and shared cApp developer assets remain
byte-identical to this upload; no older cApp checkout was patched.

1. **Terminal payment ledger transitions:** finalized and failed observations
   leave Circuit in `submitting`, with `CAPP_SOLANA_CIRCUIT_EVIDENCE` because Edge
   omits outcome evidence when transitioning. The probes reconcile twice and
   retain the original attempt/signature with exactly one fixture submission.
2. **Damaged wallet store:** ordinary backup import first reads the damaged
   store and fails. The repair needs an explicit, confirmed recovery operation
   that preserves/quarantines the damaged bytes. Do not silently overwrite them
   to make the current import probe pass. Extend the probe for the eventual
   canonical recovery API when that source is supplied.

Machine-readable observations are in `WALLET_CONTRACT_GAPS.json`. The contracts
command exits nonzero; `node tests/wallet-contracts.test.mjs --report` emits the
same findings for diagnosis. It is deliberately separate from the normal Lab
regression suite, and must pass after the canonical fixes are re-vendored.

Password changes, durable backup/restore verification, the 256-signing-attempt
capacity policy, mainnet sending, native wallet transport and real Solflare
acceptance remain pending. The file-copy check does not substitute for these.

## Apply

Extract the cumulative overlay over the Lab source root, recompile the web
source and rebuild the installed app. No wallet, operation, RPC configuration
or saved identity is migrated or reset. The footer reads **α 0.5.1**.
Current cApp source is needed for the next owning-runtime repair phase.
