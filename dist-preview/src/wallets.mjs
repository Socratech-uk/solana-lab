import {paymentAmount} from './asset-format.mjs';
import {testUsdcFunding,copyFundingPayer} from './token-funding.mjs';
import {esc} from './visuals.mjs';
import {dateLabel,receiptReady,stateLabel} from './experience.mjs';
import {backupFingerprint,receiveSvg,walletPayments} from './wallet-tools.mjs';
import {readDemoWalletRoles,setDemoReceiver,selectDemoPayer,ensureDemoWalletPair} from './demo-wallets.mjs';

export const MAINNET_WARNING='Wallet security is not the primary focus of this alpha. Bugs, malicious scripts, a compromised device, a lost password or cleared app data can permanently lose ALL funds. Password encryption does not make this an audited wallet or a hardware wallet. Keep an independent backup. Use only funds you can afford to lose.';
const networkName=n=>n==='devnet'?'Devnet':'Mainnet';
const button=(action,label,id='')=>`<button class="button" type="button" data-wallet-action="${action}" data-wallet-id="${esc(id)}">${label}</button>`;
const password=(label='Wallet password')=>`<label>${label}<input name="password" type="password" minlength="12" maxlength="1024" autocomplete="off" required></label>`;
const consent=()=>'<label class="wallet-consent"><input type="checkbox" name="acknowledgeMainnetLoss" required><span>I understand this is experimental mainnet custody and I could permanently lose all funds.</span></label>';
const amount=n=>(n/1e9).toLocaleString('en-US',{maximumFractionDigits:9});

export class WalletManager {
  constructor({call,onChange=()=>{},notify=()=>{},download=()=>{},payments=()=>[],openPayment=()=>{},getLab=()=>null,preview=false}){
    this.call=call;this.onChange=onChange;this.notify=notify;this.download=download;this.payments=payments;this.openPayment=openPayment;this.getLab=getLab;this.preview=preview;this.roles=null;this.rolesError='';
    this.network='devnet';this.snapshot=null;this.recovery=null;this.error='';this.errorCode='';this.busy=false;this.balances=new Map();this.accounts=null;this.receiving=null;this.backups=new Map();
  }
  async refresh(){
    if(this.preview)return;
    this.recovery=null;
    try{
      this.snapshot=await this.call('latch','walletList',{});this.error='';this.errorCode='';
      const ids=new Set(this.snapshot.wallets.map(w=>w.walletId));
      for(const id of this.backups.keys())if(!ids.has(id))this.backups.delete(id);
      await this.refreshRoles();
    }catch(e){
      this.snapshot=null;this.roles=null;this.accounts=null;this.receiving=null;this.backups.clear();this.balances.clear();this.error=e.message;this.errorCode=e.code||'';
      if(this.errorCode.endsWith('WALLET_STORAGE'))try{this.recovery=await this.call('latch','walletRecoveryStatus',{});}catch{}
    }
  }
  async refreshRoles(){
    const lab=this.getLab();if(this.preview||!lab){this.roles=null;return;}
    try{this.roles=await readDemoWalletRoles(lab);this.rolesError='';}
    catch(error){this.roles=null;this.rolesError=error.message;}
  }
  async run(fn){
    if(this.preview||this.busy||this.getLab()?.busy)return;
    this.notify('',false);this.error='';this.busy=true;this.onChange();
    try{await fn();this.error='';}
    catch(e){this.error=e.message;this.notify(e.message,true);}
    finally{const error=this.error;await this.refresh().catch(()=>{});if(error)this.error=error;this.busy=false;this.onChange();}
  }
  html(){
    const mainnet=this.network==='mainnet-beta',rows=this.snapshot?.wallets.filter(w=>w.network===this.network)||[],active=this.snapshot?.active[this.network];
    return `<header class="page-head"><div><div class="eyebrow">YOUR WALLETS</div><h1>Keep your wallet. Keep your progress.</h1><p>Choose the payer and receiver for your next devnet demo. Reuse your wallets, create the missing ones, or enter another receiver’s public address.</p></div><span class="tag">${this.preview?'INSTALLED APP':mainnet?'MAINNET · REAL MONEY':'DEVNET · TEST ASSETS'}</span></header>
      <div class="wallet-tabs" role="group" aria-label="Wallet network">${['devnet','mainnet-beta'].map(n=>`<button type="button" class="button ${n===this.network?'primary':''}" data-wallet-action="network" data-wallet-id="${n}" aria-pressed="${n===this.network}">${networkName(n)} ${n==='devnet'?'· test funds':'· real funds'}</button>`).join('')}</div>
      ${mainnet?`<section class="wallet-danger" role="note" aria-label="Experimental mainnet warning"><span class="eyebrow">EXPERIMENTAL · REAL MONEY AT RISK</span><h2>You could lose all your funds.</h2><p>${MAINNET_WARNING}</p><strong>Back up the wallet and its password before funding it.</strong></section>`:'<div class="notice-card">Devnet wallets stay in this app’s device storage across restarts. Their keys are unencrypted and intended only for devnet test assets. Clearing app data, uninstalling or changing the browser origin can remove access; download a backup.</div>'}
      <p class="wallet-scope">${mainnet?'Manage mainnet accounts, receive SOL, check balances and back up or export keys here. Mainnet sending is not enabled in this alpha.':'Your devnet payer and receiver choices are shared by new checkout, payout, service, treasury, proof, token and payment-request demos.'} Saved payments keep their original network, sender and recipient.</p>
      ${this.preview?'<section class="panel"><h2>Available in the installed app</h2><p>The public preview does not create, import, connect or read wallets.</p><a class="button" href="#/docs/dependencies">Read setup guidance</a></section>':`
      ${this.error?`<div class="notice-card wallet-error" role="alert">${esc(this.error)}</div>`:''}
      ${!this.snapshot?this.recoveryHtml():`
      ${!mainnet?this.rolesHtml():''}
      ${!mainnet?testUsdcFunding({payer:active?.walletPubkey||'',id:'wallet-test-funds',copyControl:button('copy-funding','Copy payer address',active?.walletPubkey||''),checkControl:'<a class="button" href="#/tokens">Continue in Token desk →</a>'}):''}
      <div class="wallet-layout"><section class="panel"><div class="panel-header"><h2>${networkName(this.network)} wallets</h2><div class="actions">${button('refresh','Refresh')}${mainnet?button('lock','Lock device wallets'):''}</div></div>
      ${active?.external?`<article class="wallet-card external"><div class="row"><h3>${esc(active.providerName)}</h3><span class="tag">CONNECTED EXTERNALLY</span></div><code class="wallet-address">${esc(active.walletPubkey)}</code><p>Your private key stays with the wallet provider.</p><div class="actions">${button('receive-external','Receive / QR')}${button('copy-external','Copy address')}${button('balance-external','Check balance')}${button('disconnect','Disconnect')}</div>${this.receiveHtml(active)}${this.balanceHtml(active)}${this.historyHtml(active)}</article>`:''}
      ${rows.length?rows.map(w=>this.card(w,active)).join(''):'<div class="empty">No saved '+networkName(this.network).toLowerCase()+' wallets yet. Create one below or restore a backup.</div>'}
      </section><aside><section class="panel"><div class="eyebrow">EXTERNAL WALLET</div><h2>Connect Solflare or another wallet</h2><p>Compatible wallets exposed by this browser or host appear here. They keep custody of their keys and confirm each signature in their own UI.</p>
      ${this.snapshot.externalProviders.filter(p=>p.networks.includes(this.network)).map(p=>`<form data-wallet-form="external"><input type="hidden" name="providerId" value="${esc(p.id)}">${mainnet?consent():''}<button class="button primary" type="submit">Connect ${esc(p.name)}</button></form>`).join('')||'<p class="hint">No compatible provider detected for this network. Use a browser with a wallet extension, or the wallet’s dApp browser. An installed WebView needs a host wallet provider.</p>'}
      ${button('refresh','Look for wallets')}
      ${this.accounts?`<form data-wallet-form="external-account"><input type="hidden" name="providerId" value="${esc(this.accounts.providerId)}"><label>Choose an account<select name="walletPubkey" required>${this.accounts.accounts.map(a=>`<option value="${esc(a.walletPubkey)}">${esc(a.label)} · ${esc(a.walletPubkey)}</option>`).join('')}</select></label>${mainnet?consent():''}<button class="button primary" type="submit">Use this account</button></form>`:''}
      </section><section class="panel"><h3>Recovery is yours</h3><p>Device wallets have no account recovery service. A wallet backup is separate from exported Lab receipts. The encrypted mainnet backup requires the same password to restore.</p><p>A Solana keypair export can be imported into compatible wallets. That export is unencrypted and can spend the funds.</p>${button('rpc-settings','RPC connection settings')}</section></aside></div>
      <section class="panel"><h2>Add a ${networkName(this.network).toLowerCase()} wallet</h2>${mainnet&&!this.snapshot.mainnetEnabled?'<p>Enable experimental mainnet wallet management in Latch configuration and rebuild to use these controls.</p>':`
      <div class="wallet-add-grid"><form data-wallet-form="create"><h3>Create on this device</h3><label>Wallet name<input name="label" maxlength="64" required placeholder="${mainnet?'Mainnet experiment':'Devnet testing'}" autocomplete="off"></label>${mainnet?password('New wallet password')+'<label>Repeat password<input type="password" name="passwordAgain" autocomplete="off" required></label>'+consent():''}<button class="button primary" type="submit">Create ${networkName(this.network).toLowerCase()} wallet</button></form>
      <form data-wallet-form="import"><h3>Restore or import</h3><label>Wallet name<input name="label" maxlength="64" required placeholder="Restored wallet" autocomplete="off"></label><label>Wallet backup or Solana keypair file<input type="file" name="backupFile" accept=".json,application/json"></label><label>Or paste a keypair / base58 private key<textarea name="privateKey" rows="3" maxlength="10000" spellcheck="false" autocomplete="off" placeholder="64-byte keypair JSON or base58 private key"></textarea></label><p class="hint">Recovery phrases are not supported. Imported mainnet keypairs are encrypted before saving.</p>${mainnet?password('Backup password / password for imported key')+consent():''}<button class="button" type="submit">Import wallet</button></form></div>`}</section>`}`}
      <div class="actions"><a class="button" href="#/checkout">Open devnet checkout ↗</a><a class="button" href="#/receipts">Receipts & activity ↗</a></div>`;
  }
  rolesHtml(){
    const roles=this.roles,payer=roles?.payer,receiver=roles?.receiver;
    if(!roles)return `<section class="panel demo-wallet-roles"><h2>Demo payer & receiver</h2><p>${esc(this.rolesError||'Refresh to read your devnet wallet choices.')}</p>${button('refresh','Refresh wallet choices')}</section>`;
    const wallets=roles.wallets||[],choices=wallets.filter(w=>w.walletPubkey!==payer?.walletPubkey);
    const option=w=>`<option value="${esc(w.walletId)}" ${w.walletId===receiver?.walletId?'selected':''}>${esc(w.label||'Device wallet')} · ${esc(w.walletPubkey.slice(0,7))}…${esc(w.walletPubkey.slice(-5))}</option>`;
    const detail=w=>w?`<strong>${esc(w.label||w.providerName||'Public address')}</strong><code class="wallet-address">${esc(w.walletPubkey)}</code>`:'<p class="hint">Not selected yet</p>';
    return `<section class="panel demo-wallet-roles" id="demo-wallet-roles"><div class="panel-header"><div><div class="eyebrow">TWO ROLES · DEVNET</div><h2>Demo payer & receiver</h2></div><span class="tag">${payer&&receiver?'DISTINCT ACCOUNTS':'SET UP TO RUN'}</span></div>
      <p>Prepare uses your existing wallets first and creates only what is missing. No funds are created, signed or sent. Back up any new device wallets below.</p>
      <div class="demo-wallet-role-grid"><section data-wallet-role="payer"><h3>Payer <span class="tag">SENDS</span></h3>${detail(payer)}
      ${wallets.length?`<form data-wallet-form="payer"><label>Choose a saved payer<select name="walletId" required aria-label="Choose demo payer"><option value="">Choose a wallet</option>${wallets.map(w=>`<option value="${esc(w.walletId)}" ${w.walletId===payer?.walletId?'selected':''}>${esc(w.label)} · ${esc(w.walletPubkey.slice(0,7))}…${esc(w.walletPubkey.slice(-5))}</option>`).join('')}</select></label><button class="button" type="submit">Set payer</button></form>`:''}<p class="hint">Needs the payment asset plus devnet SOL for fees. External wallets are selected through their connection controls below.</p></section>
      <section data-wallet-role="receiver"><h3>Receiver <span class="tag">${receiver?.suggested?'SUGGESTED':'RECEIVES'}</span></h3>${detail(receiver)}
      ${roles.receiverIssue?`<p class="notice-card" role="status">${esc(roles.receiverIssue.message||roles.receiverIssue)}</p>`:''}
      ${receiver?.suggested?'<p class="hint">This existing wallet is available. Set it as receiver or let Prepare choose it.</p>':''}
      ${choices.length?`<form data-wallet-form="receiver"><label>Choose a saved receiver<select name="walletId" required aria-label="Choose demo receiver"><option value="">Choose a different wallet</option>${choices.map(option).join('')}</select></label><button class="button" type="submit">Set receiver</button></form>`:'<p class="hint">Create a separate receiver or enter a public address below.</p>'}
      ${receiver?`<div class="actions">${button('copy-receiver','Copy receiver address')}${button('balance-receiver','Check receiver balance')}<a class="button" href="https://faucet.solana.com/" target="_blank" rel="noopener noreferrer">Get receiver test SOL ↗</a></div>${this.balanceHtml(receiver)}`:''}<p class="hint">For very small SOL payments, a fresh receiver may need test SOL first. Token payments check and, when needed, create its associated token account.</p></section></div>
      <div class="actions">${button('prepare-pair','Prepare demo wallets')}<button class="button" type="button" data-guide-start="prepare-demo-wallets">Open with Guide</button>${roles.canCreate?button('create-receiver','Create a new receiver'):''}<a class="button" href="#/requests">Open Payment requests →</a></div>
      <details class="demo-wallet-address"><summary>Use another receiver’s public address</summary><form data-wallet-form="receiver-address"><label>Devnet receiver public address<input name="walletPubkey" value="${receiver&&!receiver.walletId?esc(receiver.walletPubkey):''}" autocomplete="off" spellcheck="false" required></label><p class="hint">Only the address is needed to receive. Never paste a private key here.</p><button class="button" type="submit">Set receiver address</button></form></details>
      <p class="hint">These choices apply to new drafts. Changing a role does not rewrite a saved payment, request or report.</p></section>`;
  }
  recoveryHtml(){
    const damaged=this.errorCode.endsWith('WALLET_STORAGE'),unavailable=this.errorCode.endsWith('WALLET_STORAGE_UNAVAILABLE'),mainnet=this.network==='mainnet-beta';
    return `<section class="panel"><h2>${damaged?'Saved wallets need recovery':unavailable?'Device storage is unavailable':'Connect the wallet manager'}</h2><p>${damaged?'Keep your independent backups and leave app data intact. Recovery preserves the damaged store on this device, then restores one wallet. Other wallets need their own backups; saved payments and signing attempts stay intact.':unavailable?'Restore access to device storage and retry. No wallet data has been replaced.':'Select <strong>Device wallet manager</strong> in Latch configuration, compile the updated Lab source and rebuild the installed app.'}</p>
      ${this.recovery?.canRecover&&(!mainnet||this.recovery.mainnetEnabled)?`<form data-wallet-form="recover"><h3>Recover a ${networkName(this.network).toLowerCase()} wallet</h3><label>Wallet name<input name="label" maxlength="64" required value="Restored wallet" autocomplete="off"></label><label>Independent wallet backup<input type="file" name="backupFile" accept=".json,application/json" required></label><label>Full address of the wallet in this backup<input name="confirmAddress" autocomplete="off" spellcheck="false" required></label>${mainnet?password('Encrypted backup password')+consent():''}<label class="wallet-consent"><input type="checkbox" name="acknowledgeRecovery" required><span>I have an independent backup. Only this wallet will be restored; other wallets require their own backups.</span></label><button class="button primary" type="submit">Preserve damaged store and recover wallet</button></form>`:damaged?'<p>Recovery controls require the updated Latch runtime and available device storage. Rebuild with the current cApp source if they remain unavailable.</p>':''}
      ${button('refresh','Retry connection')}</section>`;
  }
  receiveHtml(wallet){
    if(this.receiving!==(wallet.walletId||'external:'+wallet.walletPubkey))return '';
    const mainnet=wallet.network==='mainnet-beta';
    return `<section class="wallet-receive" aria-label="Receive ${networkName(wallet.network)} ${mainnet?'SOL':'test assets'}"><div class="wallet-qr">${receiveSvg(wallet.walletPubkey)}</div><div><h4>${mainnet?'Mainnet · real SOL':'Devnet · test assets only'}</h4><p>The QR contains the address only. Select <strong>${networkName(wallet.network)}</strong> in the sending wallet and check the full address above.</p><p>${mainnet?'Keep an independent backup before funding this account. To move funds out, export the keypair and import it into a compatible wallet. Mainnet sending is not available here.':'Never send real mainnet funds to this test key.'}</p></div></section>`;
  }
  historyHtml(wallet){
    const rows=walletPayments(this.payments(),wallet),key=wallet.walletId||wallet.walletPubkey;
    return `<details class="wallet-history" data-disclosure="wallet-history-${esc(key)}"><summary>Lab activity for this wallet · ${rows.length}</summary><p class="hint">Saved Lab operations on ${networkName(wallet.network)}. Incoming transfers made outside this Lab are visible in Explorer.</p>${rows.length?`<div class="history-list">${rows.slice(0,10).map(p=>{
      const direction=p.walletPubkey===wallet.walletPubkey?(p.recipient===wallet.walletPubkey?'Self-transfer':'Outgoing'):'Incoming';
      return `<button type="button" class="history-record" data-wallet-action="open-payment" data-wallet-id="${esc(p.id)}"><span><strong>${direction} · ${esc(paymentAmount(p))}</strong><small>${esc(p.kind)} · ${esc(dateLabel(p.createdAt))}</small></span><span><b>${receiptReady(p)?'Receipt matched':esc(stateLabel(p.state))}</b>${p.operation?.recoveryError?'<small>Local tracking needs attention</small>':''}<small>Open saved operation →</small></span></button>`;
    }).join('')}</div>${rows.length>10?'<p class="hint">Showing the 10 most recent operations. Open Receipts & activity for all saved records.</p>':''}`:'<p>No Lab operations recorded for this address on this network.</p>'}</details>`;
  }
  backupHtml(wallet){
    const backup=this.backups.get(wallet.walletId);
    return `<section class="wallet-backup-check"><p class="hint">${backup?.checkedAt?'Saved file matches the downloaded backup. Password and restore have not been tested.':backup?'Download requested. Select the saved file below to check that its recovery data matches.':'Keep an independent backup before funding this wallet. A requested download does not prove the file was saved.'}</p>${backup?`<form data-wallet-form="check-backup" data-wallet-id="${esc(wallet.walletId)}"><label>Saved backup file<input type="file" name="backupFile" accept=".json,application/json" required></label><button class="button" type="submit">Check saved file</button><p class="hint">This check stays in this session and does not import keys or change the wallet. After restarting, download a backup again to repeat it.</p></form>`:''}</section>`;
  }
  balanceHtml(wallet){const b=this.balances.get(wallet.network+':'+wallet.walletPubkey);return b?`<p class="wallet-balance"><strong>${amount(b.value)} ${networkName(b.network)} SOL</strong><small>Observed ${new Date(b.observedAt).toLocaleTimeString()} · confirmed</small></p>`:'';}
  card(w,active){const mainnet=w.network==='mainnet-beta',selected=w.selected&&!active?.external,receiver=!mainnet&&this.roles?.receiver?.walletPubkey===w.walletPubkey&&!this.roles.receiver.suggested;return `<article class="wallet-card" data-wallet-card="${esc(w.walletId)}"><div class="row"><h3>${esc(w.label)}</h3><span class="tag">${selected?(mainnet?'SELECTED · ':'PAYER · '):''}${receiver?'RECEIVER · ':''}${mainnet?(w.locked?'LOCKED':'UNLOCKED'):'DEVICE'}</span></div><code class="wallet-address">${esc(w.walletPubkey)}</code><p class="hint">${mainnet?'Password encrypted · locks after five minutes or when hidden':'Unencrypted test key · saved on this device'}</p>${this.balanceHtml(w)}<div class="actions">${!selected?button('select',mainnet?'Use wallet':'Use as payer',w.walletId):''}${!mainnet&&!selected&&!receiver?button('select-receiver','Use as receiver',w.walletId):''}${button('receive','Receive / QR',w.walletId)}${button('copy','Copy address',w.walletId)}${button('balance','Check balance',w.walletId)}${button('backup','Download backup',w.walletId)}${!mainnet?'<a class="button" href="https://faucet.solana.com/" target="_blank" rel="noopener noreferrer">Get test SOL ↗</a>':''}<a class="text-button" href="https://explorer.solana.com/address/${encodeURIComponent(w.walletPubkey)}${mainnet?'':'?cluster=devnet'}" target="_blank" rel="noopener noreferrer">Explorer ↗</a></div>${this.receiveHtml(w)}${this.backupHtml(w)}${this.historyHtml(w)}
      ${mainnet&&w.locked?`<form data-wallet-form="unlock" data-wallet-id="${esc(w.walletId)}">${password()}<button class="button" type="submit">Unlock wallet</button></form>`:''}
      <details><summary>Rename, export key or remove</summary><form data-wallet-form="rename" data-wallet-id="${esc(w.walletId)}"><label>Wallet name<input name="label" value="${esc(w.label)}" maxlength="64" required></label><button class="button" type="submit">Save name</button></form>
      <form data-wallet-form="keypair" data-wallet-id="${esc(w.walletId)}"><h4>Export private key</h4><p class="hint">This downloads an unencrypted Solana keypair. Anyone with it can spend the funds.</p>${mainnet?password()+consent():''}<button class="button" type="submit">Export unencrypted keypair</button></form>
      <form data-wallet-form="remove" data-wallet-id="${esc(w.walletId)}"><h4>Remove from device</h4><p>Only remove a funded wallet after keeping an independent backup. This does not move its funds.</p><label>Type or paste the full wallet address to confirm<input name="confirmAddress" autocomplete="off" spellcheck="false" required></label><button class="button wallet-remove" type="submit">Remove wallet</button></form></details></article>`;}
  bind(root){
    for(const el of root.querySelectorAll('[data-wallet-action]'))el.onclick=()=>{
      const action=el.dataset.walletAction,id=el.dataset.walletId;
      if(this.busy)return;
      if(action==='network'){this.network=id;this.accounts=null;this.receiving=null;this.error='';this.onChange();return;}
      if(this.preview)return;
      const w=this.snapshot?.wallets.find(w=>w.walletId===id),active=this.snapshot?.active[this.network];
      if(action==='open-payment'){this.openPayment(id);return;}
      if(action==='receive'||action==='receive-external'){const key=w?.walletId||'external:'+active?.walletPubkey;this.receiving=this.receiving===key?null:key;this.onChange();return;}
      void this.run(async()=>{
        if(action==='refresh')await this.refresh();
        if(action==='lock')await this.call('latch','walletLock',{});
        if(action==='select'){if(this.network==='devnet'&&this.getLab())await selectDemoPayer(this.getLab(),id);else await this.call('latch','walletSelect',{walletId:id});}
        if(action==='select-receiver'){await setDemoReceiver(this.getLab(),{walletId:id});this.notify('Receiver saved for new demos. Existing payment terms are unchanged.');}
        if(action==='prepare-pair'||action==='create-receiver'){
          const pair=await ensureDemoWalletPair(this.getLab(),{forceNewReceiver:action==='create-receiver'});
          this.notify(pair.created?.payer||pair.created?.receiver?'Demo wallets are ready. Back up the new wallets and fund them with test assets.':'Payer and receiver are ready for new demos.');
        }
        if(action==='copy-receiver'){
          const receiver=(await readDemoWalletRoles(this.getLab())).receiver;if(!receiver)throw Error('Select a receiver first.');
          await navigator.clipboard.writeText(receiver.walletPubkey);this.notify('Receiver address copied. Use devnet test assets only.');
        }
        if(action==='balance-receiver'){
          const receiver=(await readDemoWalletRoles(this.getLab())).receiver;if(!receiver)throw Error('Select a receiver first.');
          const b=await this.call('conduit','balance',{network:'devnet',walletPubkey:receiver.walletPubkey});this.balances.set('devnet:'+receiver.walletPubkey,b);
        }
        if(action==='disconnect')await this.call('latch','walletDisconnectExternal',{network:this.network});
        if(action==='copy-funding'){if(this.network!=='devnet'||id!==active?.walletPubkey)throw Error('The selected payer changed. Copy its address again.');await copyFundingPayer(id);this.notify('Payer address copied. Choose USDC and Solana Devnet at Circle’s faucet.');}
        if(action==='copy'||action==='copy-external'){await navigator.clipboard.writeText((w||active).walletPubkey);this.notify('Wallet address copied');}
        if(action==='balance'||action==='balance-external'){const wallet=w||active;const b=await this.call('conduit','balance',{network:wallet.network,walletPubkey:wallet.walletPubkey});this.balances.set(wallet.network+':'+wallet.walletPubkey,b);}
        if(action==='backup'){const data=await this.call('latch','walletExport',{walletId:id,format:'backup'}),fingerprint=await backupFingerprint(data,w);await this.download(`wallet-${w.network}-${w.walletPubkey.slice(0,8)}-backup.json`,data);this.backups.set(id,{fingerprint,checkedAt:null});this.notify('Backup download requested. Select the saved file to check it.');}
        if(action==='rpc-settings')await this.call('conduit','openSettings',{});
      });
    };
    for(const form of root.querySelectorAll('[data-wallet-form]'))form.onsubmit=event=>{
      event.preventDefault();if(this.busy||this.preview)return;
      const data=new FormData(form),kind=form.dataset.walletForm;
      // Capture once, erase the UI, and call Latch directly. Never put passwords,
      // keypairs or backups into Lab state, activity, assistant input or receipts.
      let input={network:this.network,walletId:form.dataset.walletId,label:data.get('label'),password:data.get('password'),acknowledgeMainnetLoss:data.get('acknowledgeMainnetLoss')==='on'};
      const passwordAgain=data.get('passwordAgain');let privateKey=data.get('privateKey');const file=data.get('backupFile');
      input.providerId=data.get('providerId');input.walletPubkey=data.get('walletPubkey');input.confirmAddress=data.get('confirmAddress');
      if(kind==='recover'){input.storeDigest=this.recovery?.storeDigest;input.acknowledgeRecovery=data.get('acknowledgeRecovery')==='on';}
      form.reset();
      void this.run(async()=>{
        try{
          if(kind==='payer'){await selectDemoPayer(this.getLab(),String(data.get('walletId')||''));this.notify('Payer selected. Saved payments keep their original sender.');}
          if(kind==='receiver'||kind==='receiver-address'){
            await setDemoReceiver(this.getLab(),kind==='receiver'?{walletId:String(data.get('walletId')||'')}:{walletPubkey:String(data.get('walletPubkey')||'')});
            this.notify('Receiver saved for new demos. Existing payment terms are unchanged.');
          }
          if(kind==='check-backup'){
            const wallet=this.snapshot?.wallets.find(w=>w.walletId===input.walletId),expected=this.backups.get(input.walletId);
            if(!wallet||!expected)throw Error('Download a backup for this wallet first.');
            // A failed recheck must not retain an earlier successful indicator.
            expected.checkedAt=null;
            if(!file?.size||file.size>100000)throw Error('Choose a wallet backup file smaller than 100 KB.');
            let backup;try{backup=JSON.parse(await file.text());}catch{throw Error('The backup is not valid JSON. Its contents have not been logged.');}
            if(await backupFingerprint(backup,wallet)!==expected.fingerprint)throw Error('The file does not match the downloaded backup. Keep your existing backups and download a fresh copy.');
            expected.checkedAt=Date.now();this.notify('Saved file matches. Password and restore have not been tested.');
          }
          if(kind==='create'){
            if(this.network==='mainnet-beta'&&input.password!==passwordAgain)throw Error('Passwords do not match.');
            await this.call('latch','walletCreate',input);
          }
          if(kind==='import'){
            if(file?.size&&String(privateKey||'').trim())throw Error('Choose a file or paste a private key, not both.');
            if(file?.size){if(file.size>100000)throw Error('Wallet files must be smaller than 100 KB.');let parsed;try{parsed=JSON.parse(await file.text());}catch{throw Error('The wallet file is not valid JSON. Its contents have not been logged.');}if(Array.isArray(parsed))input.privateKey=JSON.stringify(parsed);else input.backup=parsed;}
            else input.privateKey=String(privateKey||'').trim();
            if(!input.privateKey&&!input.backup)throw Error('Choose a backup file or paste a private key.');
            await this.call('latch','walletImport',input);
          }
          if(kind==='recover'){
            if(!file?.size||file.size>100000)throw Error('Choose a wallet backup file smaller than 100 KB.');
            try{input.backup=JSON.parse(await file.text());}catch{throw Error('The backup is not valid JSON. Its contents have not been logged.');}
            await this.call('latch','walletRecover',input);
            this.notify('Wallet recovered. The damaged store was retained on this device. Import independent backups for any other wallets.');
          }
          if(kind==='unlock')await this.call('latch','walletUnlock',input);
          if(kind==='rename')await this.call('latch','walletRename',input);
          if(kind==='remove')await this.call('latch','walletRemove',input);
          if(kind==='keypair'){const result=await this.call('latch','walletExport',{...input,format:'keypair'});this.download(`solana-${this.network}-${input.walletId}.json`,result.keypair);}
          if(kind==='external'||kind==='external-account'){
            const result=await this.call('latch','walletConnectExternal',input);this.accounts=result.chooseAccount&&result.accounts.length?result:null;
            if(result.chooseAccount&&!result.accounts.length)throw Error('The wallet did not expose a signing account for this network. Enable the network in your wallet, then reconnect.');
          }
        }finally{input=null;privateKey=null;}
      });
    };
    if(this.busy)root.querySelectorAll('[data-wallet-action],[data-wallet-form] input,[data-wallet-form] textarea,[data-wallet-form] button,[data-wallet-form] select').forEach(el=>el.disabled=true);
  }
}
