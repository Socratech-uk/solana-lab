# Wallet manager

Lab 0.7.11 uses **Wallets** for explicit devnet payer and receiver roles, device
wallets and supported external accounts. Solana Latch owns the keys in both the
installed app and standalone Lab. The Lab stores only the receiver's public
identity as a separate preference.

Historical releases 0.5, 0.5.1 and 0.5.2 introduced the manager, receive QR codes,
wallet-specific history, backup comparison and the complete source restoration.
See the dated [full restoration evidence](validation/FULL_RESTORE_2026-09-22.md).

## Apply the update

Follow [installed setup](INSTALLED_SETUP.md) to apply the cumulative cApp, Lab and
project folders to their matching roots. Keep the existing working profile and
RPC/AI settings; do not rerun `configure-capp` for this configured project.
Rebuild/restart the cApp owner with `-NoShowroomPublish`, compile the updated Lab
source into a new release, and build/install a new package while retaining app
identity, signing key and data. The supplied selections retain Latch
0.5.0-alpha.4 and Edge 0.5.0-alpha.3. Old releases remain historical artifacts.

If you already selected an external adapter or native MWA in Latch, that choice
is retained. To use device creation with such a provider, deliberately choose
**Device wallet manager** in Latch and rebuild the owner. Keep the payment network
on **devnet**. The Lab preset enables experimental mainnet management; the generic
Sidecar default leaves it off.

## Payer and receiver for the next demo

The devnet roles panel displays the selected payer and the separate receiver.
With two wallets already present, choose **Use as payer** on the spending wallet
and **Use as receiver** on the receiving wallet. The receiver can instead be an
external public address entered with **Set receiver address**; no private key or
wallet connection is needed for a public receiving address.

**Prepare demo wallets** reuses the selected payer and an eligible receiver. It
creates missing device wallets only when you press it and the provider supports
creation without changing the payer. With no wallets it creates a pair; with one
it supplies the missing role. **Create a new receiver** deliberately creates a
different wallet. **Open with Guide** starts the same setup in the new
**Prepare demo wallets** walkthrough. Page load and ordinary refresh create no
wallets, request no funds and never sign or send.

When no payer is selected, setup reserves the saved receiver and any entered
draft recipients while choosing a payer. Once you explicitly select a payer, an
unfunded balance does not make defaults switch to another wallet. If the saved
receiver is removed, or you select it as payer, the panel requires a different
receiver or an explicit setup action. It does not silently replace the role or
make an automatic self-transfer. An available but unsaved receiver is labelled
as a suggestion until you save or prepare the pair.

The receiver fills empty drafts in checkout, service, payouts, proof, treasury,
tokens, requests and optional position evidence. Role changes update only blank
or untouched automatic fields. Manually entered recipients and saved payment or
request terms stay fixed. The labelled self-transfer controls remain explicit
choices for appropriate SOL demos; **Use selected wallet as receiver** in Payment
requests is the separate incoming-payment choice.

Use the role panel's copy, balance and funding controls to check both addresses.
The payer needs the requested asset plus SOL for fees and any account rent. A
tiny native SOL payment to an empty receiver may also need receiver test SOL:
the setup check reads the actual account minimum, compares the transfer amount
and shows a manual funding handoff when it is too small. A failed read does not
pass. SPL owners do not need a separate SOL balance merely to receive tokens;
their associated token account can be created with the payer's SOL during the
reviewed transfer, subject to normal checks. Back up new device wallets before
funding them.

The receiver preference is scoped to this Lab's project/component/app identity
and contains public metadata only. It is separate from wallet custody, immutable
payment terms and the mainnet wallet tab.

## Device wallets

| Action | Devnet | Mainnet |
| --- | --- | --- |
| Create / import / rename / select / remove | Available | Available after the loss acknowledgement |
| Key storage | Unencrypted keypair in device app storage | Password-encrypted keypair in device app storage |
| Receive address and balance | Test SOL | Real SOL; verified mainnet read endpoint required |
| Backup | Contains an unencrypted test key | Encrypted; restore needs the same password |
| Export Solana keypair | Explicit confirmation | Password, loss acknowledgement and explicit confirmation |
| Sign / send through Lab recipes | Reviewed devnet transfers | Not enabled |

Passwords must contain at least 12 characters. Mainnet keys lock on app reload,
when the owning document is hidden, or after five minutes. Encryption uses
AES-256-GCM, a fresh salt and nonce, PBKDF2-SHA256 with 600,000 iterations, and
authenticated network/address metadata. It is **not** an OS keystore or a
hardware wallet, and is not independently audited. The prominent UI warning
states that security is not the primary focus of this alpha and all funds can
be lost.

Store an independent wallet backup before funding a wallet. The app cannot
recover a forgotten password. Clearing app data, uninstalling, switching
origins or changing the application identity can remove access. An origin may
store browser data differently from an installed WebView. A Lab receipt export
does not contain wallet keys or wallet backups.

Import accepts a Lab wallet backup, a Solana 64-byte keypair JSON file/array, or
a base58 private key. Recovery phrases are not supported. Raw keypair exports
are unencrypted and can be imported into compatible wallets; keep them private.
The same key cannot be saved twice or reused across both network tabs in this
store. Solana addresses themselves work on all clusters: **never fund a devnet
test key on mainnet**.

**Receive / QR** displays a locally generated QR containing only the public
address. Choose the displayed network separately in the sending wallet. QR
generation makes no network request and never encodes private keys or a payment
amount. The bundled MIT-licensed encoder is pinned to `qrcode-generator` 2.0.4;
`tools/vendor-qr.mjs` refreshes it explicitly and both builds verify its digest.

After **Download backup**, select the saved JSON file with **Check saved file**.
The app compares its recovery material and wallet identity with that download;
renaming a wallet or changing an export date does not change the comparison.
It retains only the comparison digest and result in memory for this session.
It does not decrypt the file, check its password, prove a restore, or prove the
file will remain available later. Restarting clears the comparison result.

**Lab activity for this wallet** lists the ten most recent saved operations for
the exact network and sender/recipient. It distinguishes self-transfers and
opens the original operation without creating another payment. This is local
Lab history; Explorer shows transactions originating outside the Lab.

Previously selected temporary-wallet mode remains available. Its non-exportable
process-local keys cannot be migrated automatically. Existing operations and
signatures remain available for reconciliation; their sender, network and
message are never changed to match a newly selected wallet.

## External wallets

The manager uses the official `@wallet-standard/app` registry to discover
compatible wallets exposed by the owning browser or host. Solflare can be
selected when it advertises the chosen network, an eligible account and
`solana:signTransaction`. Multiple returned accounts require explicit selection.
Private keys remain with the provider. There is no automatic account connection.

The returned signed transaction must match the reviewed bytes and wallet
cryptographically. A missing or changed account cannot silently become another
signer. The API used here is sign-only; Conduit/Dispatch still owns submission.
External adapters outside this manager retain their existing recovery rules.

This does not add a native Android MWA implementation or a mobile deeplink
transport. An ordinary installed WebView may expose no external wallet. The UI
reports that honestly and device wallets remain available. Real Solflare
extension/device approval is pending acceptance; the automated integration uses
a Wallet Standard provider fixture. [Solflare integration documentation](https://docs.solflare.com/solflare/technical/integrate-solflare)
describes its supported SDK/adapter approaches.

## Validation and remaining acceptance

- Lab `tests/demo-wallet-roles.test.mjs` covers zero/one/two-wallet setup,
  public receiver persistence, deletion and payer conflicts, concurrent setup,
  explicit choices and native SOL receiver checks. `tests/demo-wallet-ui.test.mjs`
  exercises the actual controls and draft/saved-record boundaries with fixtures.
- cApp `tests/solana_wallet_manager_smoke.mjs`: persistence and scope, encrypted
  backup round trip, wrong password and tampering, mainnet gates, input
  validation, failed writes, selection/deletion, exact signing, durable attempt
  binding, genesis-verified balances and altered external signatures.
- Lab `tests/ui.test.mjs`: actual wallet forms, prominent warning text,
  lock/unlock, devnet identity preservation and exclusion of private actions
  from activity/evidence. Existing payment, installed-shell and hosted-preview
  regressions also pass.
- `tests/wallet-tools.test.mjs`: independent decoding of rendered QR data,
  network-scoped history, changed/wrong backup rejection, healthy encrypted
  backup restore across runtime restart and stale controls after storage errors.
- `tests/wallet-browser.test.mjs` exercises real Chromium controls with fixture
  RPC, including downloads, backup comparison, mainnet remove/import/reload and
  desktop/mobile layouts. See the follow-up evidence for the observed result.
- `node tests/wallet-contracts.test.mjs` now passes all three requirements.
  `node tests/wallet-recovery-browser.test.mjs` verifies the recovery form in a
  real Chromium harness; complete application/native acceptance remains separate.
- Native Windows/Android restart/backup acceptance, actual wallet extensions,
  funded devnet transfers and the installed cApp self-host gate remain open.

The public `/solana-lab/wallets` preview is descriptive and inert. Its startup
does not read wallet storage, load Latch, connect wallets or call RPC. Publication
uses the existing cApp launcher when you choose to publish the rebuilt preview.

## Damaged storage

Use the explicit recovery form with an independent wallet backup and its full
address. Mainnet backups require their password and the loss acknowledgement.
The original damaged bytes are retained before replacement. Only this wallet
is restored; import independent backups for other wallets afterward. Payment
and signing history stays intact. Do not clear app data. Ordinary import cannot
replace a damaged store, and unavailable storage must become readable first.
