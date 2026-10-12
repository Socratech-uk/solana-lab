# Install the devnet Lab

## Update the existing configured project to Lab 0.7.13

This release improves the wording of all 27 Guide workflows, their 97 steps and the five welcome-tour steps. It selects authored Guide **1.4.10, revision 19** and retains shared Guide runtime **0.11.2**. Fresh launches, saved-record continuation, wallet checks and payment controls behave as in Lab 0.7.12.

Apply each bundle folder’s contents to its matching destination:

| Bundle folder | Existing root |
| --- | --- |
| `capp/` | `C:\Users\alex1\babelapp-v0` |
| `solana-lab/` | `C:\Users\alex1\solana-lab` |
| `solana-lab-project/` | `C:\Users\alex1\cApp\projects\solana-lab` |

1. Keep independent wallet backups and a copy of the project before applying the update. Close cApp and its browser tabs so they cannot overwrite the updated Guide binding with older state. From the cApp source root, `run-capp.ps1 -Stop` stops local services without resetting the project. Reconcile any local changes made after the supplied export before replacing those files.
2. Apply the three matching folders. **Do not rerun `tools\configure-capp.cmd` for an already configured project.** Existing RPC inputs, token policies, Local AI choices, Market configuration and non-Guide selections are retained. The project advances its authored Guide binding to **1.4.10, revision 19**, preserving all existing Guide releases and both profiles’ other settings.
3. **If the owner already contains Guide runtime 0.11.2, no owner rebuild is needed solely for this wording update.** An older owner must be rebuilt first using `run-capp.ps1 -Clean -NoShowroomPublish`, without `-SkipBuild`. `-Clean` retains compiler releases and project/Guide data while applying the existing retention policy to managed native outputs; mark an older output **Keep build** if it must be retained. `-NoShowroomPublish` suppresses the launcher’s public publication path for this local rehearsal.
4. Open the existing **Solana lab** project and **Main application** component. Refresh the existing Lab source root, confirm the current Guide binding, and **Compile a new release**. Earlier Compile releases remain intact. Repackaging an old Compile release will retain its old wording.
5. Keep the existing Solana Sidecars, Guide, Debug, Links, Market and optional Local AI selections. They need no reimport or remove/reselect cycle. The actual Guide runtime remains **0.11.2**, separate from authored content **1.4.10** and any historical selection label. Market Pulse remains **0.1.0-alpha.2**. Check the runtime resolved by the package if the owner has not yet received the previous update.
6. Build a new native package from the **new Compile release**. Keep the application identity and signing key, and choose a package version newer than the installed one. Native package versions are independent of the Lab source/footer version **0.7.13**; keep their existing history. Verify and install the package as an update, preserving app data, wallet keys and downloaded models. Do not uninstall, clear app data or run a full-clean emulator script.
7. Open the app and confirm footer **α 0.7.13** and authored Guide **1.4.10 / revision 19**. Launch checkout and check that the first step explains who pays and receives. Confirm the existing wallets and activity remain, run a demo twice to check that each launch starts fresh, and use **Continue with Guide** to reopen an earlier record. Check devnet funding before recording a payment, and a fresh Market price before recording Position Studio.

Only if the owner needs the earlier Guide runtime update, run from its source root:

```powershell
.\run-capp.ps1 -Clean -NoShowroomPublish -SolanaLabRoot C:\Users\alex1\solana-lab
```

Fresh Lab Compile and packaging are required even when the owner is already current. Source checks and a successful package do not establish installed acceptance. Rehearse one separately reviewed devnet payment and its receipt on the recording device, including the funding/return flow if needed. Check wallet persistence after restart. Lab receipt exports contain public payment evidence; they are not wallet backups.

## Selected providers

| Sidecar | Provider / network |
|---|---|
| Edge | devnet / auto composition |
| Conduit | direct-rpc / devnet, verifyDevnet and queueRequests enabled, writes enabled, mainnet writes disabled |
| Sentinel | conduit-peer / devnet, verifySolTransfer enabled; exact simulation required by Edge |
| Latch | device-wallet / devnet, allowMainnetWallets enabled; existing external/native provider selections are preserved |
| Dispatch | conduit-peer / devnet, submission enabled |
| Witness | conduit-peer / devnet, confirmed commitment |
| Compass | local-intent / devnet |
| Circuit, Switchyard, Accord | existing local providers |
| Arena | deterministic-local / no network |

## First-time configuration of an unconfigured project

The configuration helper is for deliberately applying the Lab preset to a project that still needs it. With cApp closed, run `node tools/configure-capp.mjs --check` from the Lab source folder to inspect changed field names. If that preset is wanted, `tools\configure-capp.cmd` applies it and saves an exact previous-state backup under the project's `Library\backups`. It does not print RPC token values. This is separate from updating the existing configured project above.

The helper preserves unrelated selections, Local AI configuration, Guide releases, FTUE files, compiler history and project fields. It replaces the earlier public Solana devnet default with the supplied Triton demo endpoint, while keeping a custom RPC endpoint or external RPC adapter and an existing external/native Latch provider. **It deliberately applies the Lab's Solana provider, policy and transfer limits.** Review customized Solana settings before applying it. An endpoint retained from another network will be rejected by genesis verification; choose a devnet endpoint in Conduit.

The supplied Lab profile has a devnet endpoint and a separate mainnet read-only endpoint. This update preserves the existing project inputs; it neither tests their current access nor issues a token or server proxy.

## RPC settings live in Conduit

In the installed Lab, use **Network window → Open Conduit settings**, or **Conduit RPC settings** beside the wallet. The dialog belongs to the installed Sidecar in the owning shell. It edits the existing connection without recreating a wallet. The cApp build defaults are under **Library → Solana · Conduit → Configure**.

| Connection | Endpoint | Use |
| --- | --- | --- |
| Primary | `https://alexpea-solanad-3383.devnet.rpcpool.com` | Devnet payment and observation RPC |
| Separate read-only | `https://alexpea-solanam-9956.mainnet.rpcpool.com` | Version, slot, block height, genesis inspection and verified mainnet wallet balances |

If the endpoint needs token authentication, paste the chosen client/demo token into its own `x-token` field. Select **Test & use connection**. Devnet identity must match before a new payment endpoint is adopted. A failed check keeps the active connection unchanged. **Remember this connection on this device** stores the endpoint and token in the Sidecar's project/component/app/network scope; otherwise the change lasts only in the current shell. These are extractable client settings, not a secret vault.

The advanced section holds the separate read connection. Its token never attaches to the payment endpoint, and its reads never switch the payment network or enable mainnet submission. Use **Connection checks** in that dialog to inspect it. Network window itself now checks the same primary Conduit used by checkout and treasury.

HTTP 401/403 means the provider denied access: check the chosen token and provider origin rules. HTTP 429 shows a cooldown and does not retry a send. A browser fetch failure has no usable HTTP response, so it names connection/endpoint/access-policy possibilities instead of pretending the provider returned a particular status. Triton documents its header and URL authentication options in [Getting started](https://docs.triton.one/getting-started).

## First transfer

Start with **Wallets → Prepare demo wallets**, **Open with Guide**, or **Run with Guide** on the demo page. Preparation reuses existing payer and receiver roles and creates only missing wallets. With the two wallets already present, select the spending wallet as payer and the other as receiver. Copy the payer address and fund it using the linked devnet faucet when needed. The app never requests an airdrop automatically. Check the receiver as well, review the amount and recipient, approve the payment with your wallet, send it, then check its receipt and Explorer link.

Saved devnet keys persist in app storage unencrypted. Download a wallet backup before clearing app data or uninstalling. Earlier temporary-wallet mode remains available and still loses its key when its process closes; it is not automatically migrated. Previously signed operations remain observable from their saved signatures. Never use a devnet test key for real assets.

For a tiny native SOL transfer, an empty receiver can need test SOL because account minimums exceed the scaled amount. Setup reads the actual minimum and pauses with the receiver's address when needed; a transfer large enough to create the account may proceed to normal review. Failed reads remain blocked. SPL recipients use their separate associated-account checks, with payer-funded rent where required. **Use my address as recipient** remains a deliberate labelled self-transfer for smoke testing. It records a transfer instruction and memo but pays nobody else; only the fee reduces the balance.

## Arena evidence

Open/reduce/close a position. In Optional devnet evidence, select its recorded action, enter a nominal SOL amount and recipient, then review. The example `0.1 SOL / 10,000` transfers `0.00001 devnet SOL`, plus a network fee. The nominal SOL is independent of the synthetic USD position size. Floor rounding and the remainder are shown; zero-lamport results are rejected.

The transfer and a digest memo share one signed transaction. Witness compares its complete bytes with the confirmed RPC result. The receipt proves only that small transfer and memo. Arena execution, returns and full-size settlement remain simulated.

## Recovery and previous records

Keep the same operation when a send times out. Reconcile observes its recorded signature; it never creates or resends a payment. If the blockhash expires before the first send, the operation stops. External wallets can broadcast before their reply arrives; a missing signature remains unresolved and needs provider inspection.

Saved devnet records remain available through **Continue with Guide**, using their original sender and network. Records from earlier simulated payment profiles remain exportable, but cannot be signed or sent as devnet payments. When no compatible operation exists, checkout and treasury offer a new devnet draft; an incompatible older record remains available to export. Old error events show their timestamps and remain history. Export evidence before clearing app data, uninstalling or changing storage identity. Do not reset project or Sidecar state to work around a provider error.

The dedicated Missing reply rehearsal stays offline in its own runtime. It uses Arena's drop-response mode and does not change the live payment settings. The MCP Context Adapter is optional; product controls call declared Sidecar APIs directly through the installed owning shell.

The dated sections below preserve earlier release details. Use the current update steps above for this package; earlier versions and source selections remain historical.

## Historical · Connected-service update (Lab 0.4)

Apply both source overlays, recompile the Lab web source and rebuild its installer with Edge 0.4.1 or later. The new recipes check for operation-memo and application-commitment support before preparing a payment. Missing support requires a new package; a page refresh cannot upgrade the owning shell.

Sentinel must allow the System program (`11111111111111111111111111111111`) and Memo (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`). The Lab preset already does. Preserve other existing policy limits and provider selections. No configuration helper is necessary for a working preset.

The public Guide projection adds current help to the existing authored release, including the three new recipes and developer docs. It does not replace tours, manifest settings, signed state or the project's FTUE folder.

## Historical · Wallet manager (Lab 0.5)

See [wallet management](WALLETS.md). Enable Device wallet manager in Latch, retain the devnet payment network and enable experimental mainnet wallet management only if desired. The supplied configuration helper applies this profile unless an existing external/native provider was selected; to use the new manager in that case, choose it explicitly in Latch configuration. Recompile and rebuild both owning Sidecars and the Lab app. Mainnet wallets are managed separately from the devnet payment recipes.


## Historical · Android startup and mobile layout (0.7.9)

Update **both** cApp and the Lab source. Android package activation is generated by cApp, so a web-only Lab update cannot repair an already built shell. Compile a new Lab release before building a new AAB; repackaging an older release leaves its old app code inside the new shell.

The September 28 startup report showed all eleven Solana APIs activating only after three optional components each consumed a six-second activation timeout. The Lab had already stopped its initial eight-second connection attempt. The repaired loader subscribes to each package's declared readiness and failure events before injection, preserves script order, and waits for independent activations together. Local AI publishes service readiness before downloading a baseline model. The Lab reconnects if installed APIs arrive late; Retry does not reset local records.

The Android window colour is a fallback behind app content. It no longer replaces an authored page background. On mobile, Explore demos opens the complete navigation list. Links hides the tab strip with only the app tab, restores it for additional tabs, and preserves app state when the final extra tab closes. Desktop tabs remain visible.

Check the rebuilt app's footer (0.7.9), Installed Sidecars label, and Debug startup record. A ready component can still report an RPC or wallet setup problem; verify devnet in Network window before attempting payments. Keep wallet backups. Use an update install to retain app storage; the earlier full-clean emulator script clears wallets and records.

See [mobile verification](MOBILE.md) for the device acceptance steps.

## Historical · Guide wallet setup and Android Links (0.7.10)

Apply all three bundle folders to their matching roots, including the cApp project. The project selects Guide 1.4.6 (revision 15) and Links 0.4.1-alpha.1. Refresh the source, compile a new release and rebuild Android. Packaging an old compiled release retains its old Guide and app code.

New guided drafts create or reuse a devnet device payer on the first setup click. The receiver step creates a separate wallet on its named click when needed. This covers tokens, requests, checkout, treasury, service, payouts, proof and optional position evidence. Asset inspection and blank devnet activity queries also set up a missing wallet; they do not require funding. Explicit public addresses and simulations need no new wallet.

Guide pauses at a funding check with the payer's address and the relevant SOL or test-USDC faucet. With app tabs, the existing copy/return companion is available. Without tabs, use the page link and retry the check. Faucet verification stays with the provider. Back up created device wallets. Saved payment senders, recipients and attempts remain fixed, and signing and sending remain separate actions.

In **cApp → Build → Android → Links & browser tabs**, choose automatic/always-visible tabs, link opening, tab limit, density, shape, width, colours and shortcuts. The live preview shows just the bar. Automatic mode hides it when only the app is open. These options require the compiled Links sidecar; they do not enable embedding or HTTP permissions. Repackage after changing them.

Install as an update with the same application ID and signing key to retain app data and downloaded GGUF files. Do not uninstall or run `pm clear` for this update.
