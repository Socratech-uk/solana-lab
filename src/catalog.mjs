import {DEMO_TOKEN_LIMITS,DEMO_TOKEN_PROGRAMS} from './demo-token.mjs';
import {CAPABILITY_GUIDE} from './capability-content.mjs';
export const COMPONENTS = [
  ['edge','Edge','Compose','Runs a payment through compatible selected Sidecars, from intent to receipt.','Devnet SOL transfers require the six live peers; Arena is never an automatic fallback.'],
  ['compass','Compass','Intent','Turns an application request into a consistent intent with a stable identity.','An intent is a proposal. It does not select a wallet or grant authority.'],
  ['circuit','Circuit','Identity','Retains operations and attempts, and prevents overlapping work on the same leg.','Browser records are local to this app and origin, not a distributed transaction store.'],
  ['sentinel','Sentinel','Policy','Checks declared amounts, fees, programs, freshness and risk against configured limits.','Exact SOL and original SPL token transfers have dedicated verifiers. Token mints need explicit limits; generic policy checks still use supplied metadata.'],
  ['accord','Accord','Collective approval','Records member approvals against an exact message and policy.','Local member names are simulated identities. A quorum is not a cryptographic signature.'],
  ['latch','Latch','Authority','Separates a request for wallet authority from policy and execution.','Device wallets persist locally. Mainnet keys are password encrypted, with a loss warning; mainnet signing is disabled. External providers retain their own keys.'],
  ['switchyard','Switchyard','Allocation','Assigns a position to an execution bucket and records the path back to reuse.','Allocation is off-chain. Moving a record does not move funds.'],
  ['arena','Arena','Simulation','Executes deterministic payment and position scenarios without a network.','Every Arena outcome is simulated, including its finality and settlement evidence.'],
  ['dispatch','Dispatch','Submission','Records an attempt before execution and keeps uncertain outcomes recoverable.','Reconciliation observes the existing attempt; it never creates another payment.'],
  ['witness','Witness','Evidence','Observes outcomes and stores receipts with stable content digests.','A digest identifies evidence. It does not make simulated or supplied evidence authoritative.'],
  ['conduit','Conduit','Network','Sends bounded HTTP RPC requests through a configured public endpoint or adapter.','The inspector only exposes read requests. Public endpoints are visible to app users.'],
].map(([id,name,role,description,limit])=>({id,name,role,description,limit}));

export const DEMOS = [
  {id:'checkout',number:'01',name:'Pocket checkout',tag:'PAYMENTS',description:'A tiny digital storefront. Review a payment, approve the exact request and inspect its receipt.',components:['edge','compass','circuit','sentinel','latch','dispatch','conduit','witness'],color:'green',icon:'bag'},
  {id:'treasury',number:'02',name:'Collective treasury',tag:'GROUP APPROVALS',description:'Review a shared payment with three simulated members, then approve it with your wallet.',components:['accord','edge','sentinel','latch','witness'],color:'purple',icon:'people'},
  {id:'positions',number:'03',name:'Position studio',tag:'RESOURCE LIFECYCLE',description:'Follow live SOL prices through a simulated position, from entry and P&L to close and recovery.',components:['compass','switchyard','circuit','sentinel','arena','witness','edge'],color:'blue',icon:'chart'},
  {id:'recovery',number:'04',name:'The missing reply',tag:'RECOVERY LAB',description:'A simulated payment succeeds, but its reply disappears. Find the result without starting another payment.',components:['edge','circuit','dispatch','arena','witness'],color:'orange',icon:'recovery'},
  {id:'policy',number:'05',name:'Policy playground',tag:'PREFLIGHT',description:'Try payment limits and risk settings. See why a request passes or is rejected before approval.',components:['compass','sentinel'],color:'pink',icon:'shield'},
  {id:'network',number:'06',name:'Network window',tag:'RPC CONNECTION',description:'Inspect the Conduit connection used by your payment workflows. Configure endpoints inside the Sidecar.',components:['conduit'],color:'teal',icon:'network'},
];

export const DEMO_PROFILE = {
  protocol:'capp.solana-lab.profile.v1', appId:'solana-lab', projectId:'solana-lab', componentId:'main',
  library:{selected:[
    {id:'uk.capp.sidecar.solana-compass',config:{providerMode:'local-intent',network:'demo'}},
    {id:'uk.capp.sidecar.solana-circuit',config:{providerMode:'local-store',maxOperations:256}},
    {id:'uk.capp.sidecar.solana-switchyard',config:{providerMode:'local-allocation',requireUniqueExecutionWallet:true}},
    {id:'uk.capp.sidecar.solana-accord',config:{providerMode:'local-control',defaultThreshold:2}},
    {id:'uk.capp.sidecar.solana-conduit',config:{providerMode:'offline',network:'devnet',allowWriteMethods:false,allowMainnetWrites:false}},
    {id:'uk.capp.sidecar.solana-sentinel',config:{providerMode:'local-policy',network:'demo',maxLamports:1000000000,maxFeeLamports:100000,maxSlippageBps:500,riskCapacity:'medium'}},
    {id:'uk.capp.sidecar.solana-latch',config:{providerMode:'demo-confirm',network:'demo'}},
    {id:'uk.capp.sidecar.solana-arena',config:{providerMode:'deterministic-local',failureMode:'none',finality:'simulated-finalised'}},
    {id:'uk.capp.sidecar.solana-dispatch',config:{providerMode:'arena-peer',network:'demo',allowSubmission:false}},
    {id:'uk.capp.sidecar.solana-witness',config:{providerMode:'arena-peer',network:'demo',commitment:'finalized'}},
    {id:'uk.capp.sidecar.solana-edge',config:{providerMode:'demo',compositionMode:'auto',demoMaxLamports:1000000000,showCompositionPanel:false}},
  ]},
};

// One devnet workspace. Arena remains a no-network venue; recovery is isolated.
export const PROFILE=structuredClone(DEMO_PROFILE);
const live={
 compass:{providerMode:'local-intent',network:'devnet'},
 conduit:{providerMode:'direct-rpc',network:'devnet',rpcUrl:'https://alexpea-solanad-3383.devnet.rpcpool.com',rpcToken:'',allowRuntimeRpcSettings:true,readRpcUrl:'https://alexpea-solanam-9956.mainnet.rpcpool.com',readRpcToken:'',readRpcNetwork:'mainnet-beta',allowWriteMethods:true,allowMainnetWrites:false,verifyDevnet:true,queueRequests:true,maxRequestsPerSecond:4,requestTimeoutMs:20000},
 sentinel:{providerMode:'conduit-peer',network:'devnet',verifySolTransfer:true,requireSimulation:false,tokenLimits:DEMO_TOKEN_LIMITS,maxAccountRentLamports:3000000,allowedPrograms:['11111111111111111111111111111111','MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',...DEMO_TOKEN_PROGRAMS].join(',')},
 latch:{tokenLimits:DEMO_TOKEN_LIMITS,providerMode:'device-wallet',network:'devnet',testMaxLamports:1000000000,allowMainnetWallets:true},
 dispatch:{providerMode:'conduit-peer',network:'devnet',allowSubmission:true},
 witness:{providerMode:'conduit-peer',network:'devnet',commitment:'confirmed'},
 edge:{providerMode:'devnet',compositionMode:'auto',devnetMaxLamports:1000000000,showCompositionPanel:false}
};
for(const item of PROFILE.library.selected)Object.assign(item.config,live[item.id.replace('uk.capp.sidecar.solana-','')]||{});

export const GUIDE = [
 {id:'android-startup',title:'Android components are still connecting',route:'#/docs/dependencies',text:'The installed Lab uses the Sidecars packaged with the app. Android starts independent components without waiting for Local AI model downloads. If startup takes longer, the Lab waits for the installed APIs and reconnects automatically when they arrive; Retry checks again without resetting wallets or records. If components remain unavailable, export the Debug report, check the selected packages in cApp, compile the current Lab source and build a new Android bundle. Once the components are connected, an RPC error is a separate connection issue: open Network window and verify devnet.'},
 {id:'mobile-navigation',title:'Find pages and browser tabs on mobile',route:'#/guided',text:'Use Explore demos at the top of the Lab to open every demo and documentation page. The mobile browser tab strip is hidden while only the app is open. Opening another tab reveals it; closing the last extra tab gives the space back to the app without resetting your work. Desktop keeps its tab strip. Guide funding handoffs can keep a copyable wallet address beside a faucet when the host supports browser tabs. Without that capability the tab handoff is skipped and the page offers the ordinary funding link.'},
 {id:'mobile-local-ai',title:'Local AI setup and mobile notices',route:'#/guided',text:'Local AI service readiness and model readiness are separate. You can use the Lab and its authored Guide workflows while the optional model downloads. Chat inference needs a loaded model. Downloading and initialising use one compact 32-pixel status line on mobile and desktop. Space is reserved below the app so progress never covers the page. Details opens AI settings. Dismissing the indicator gives that space back without cancelling the download. Guide, AI and Debug shortcuts share a bottom row on Android and move out of the way when another full panel is open.'},
 {id:'guide-transactions',title:'Finish every payment inside Guide',route:'#/guided',text:"Start a new demo with Guide me, or open an earlier payment with Continue with Guide. Review the sender, recipient and amount, approve signing, then confirm when to send. Guide checks the receipt and waits if the payment is pending. Cancelling stops the walkthrough; a payment already sent can still complete and remains in your history."},
 {id:'guide-payout-progress',title:'How Guide completes a payout batch',route:'#/batch',text:"Pay each contributor separately and follow their progress from review to receipt. Completed payments stay complete when you return. If a reply is missing, check that contributor’s existing payment before continuing. The batch is finished only when every contributor has a verified receipt."},
 {id:'guide-service-proof',title:'From paid report to verified document',route:'#/service',text:"Pay for a local report, generate it, then create a linked document proof. The proof is a separate devnet payment with its own approval and network fee. Compare a copy of the report with the saved original to see whether its contents changed. Both payments and the report remain in your history."},
 ...CAPABILITY_GUIDE,
  ...COMPONENTS.map(c=>({id:'sidecar-'+c.id,title:c.name,route:'#/components',text:c.description+' '+c.limit})),
  ...DEMOS.map(d=>({id:'demo-'+d.id,title:d.name,route:'#/'+d.id,text:d.description+' Components: '+d.components.join(', ')+'.'})),
  {id:'modes',title:'Devnet and simulation',route:'#/',text:"Payment demos use test assets on Solana devnet. Positions and The missing reply run as clearly labelled Arena simulations. You can link a position result to a separate, small devnet transfer and memo; its receipt proves that transfer, not a real trade."},
  {id:'recovery',title:'Recover after refresh',route:'#/recovery',text:"If a reply is missing, open the saved rehearsal and choose Check existing attempt. This checks whether the original operation completed without starting another payment. Your saved history is local to this app; export evidence before clearing app storage."},
  {id:'ai',title:'Local AI and web components',route:'#/assistant',text:"Assistant can explain the Lab, find help and inspect saved results. Optional Local AI adds conversational answers. To carry out a task, choose a suggested guided demo. Payments still require your approval; the Assistant cannot sign or send them for you."},
 {id:'conduit-settings',title:'Set up the payment RPC',route:'#/network',text:'Open Conduit settings from Network window or the wallet panel. Set the endpoint and optional client x-token there, then Test & use connection. Conduit verifies devnet before adopting the new primary endpoint. Advanced settings keep mainnet reads separate. Your wallet remains in the same shell.'},
 {id:'old-demo-records',title:'Earlier demo operations',route:'#/treasury',text:"Earlier simulations remain available in history for inspection and export. Start a devnet payment when you want to use test funds. Opening an old simulation does not turn it into a network transfer."},
];

GUIDE.push(
 {id:'wallet',title:'Manage and fund a saved devnet wallet',route:'#/wallets',text:"Create or import a devnet wallet in Wallets, save its backup and add test SOL. Check the balance before starting a payment. Your selected wallet pays for new demos. Device wallets survive restarts, but clearing app data can remove access; keep an independent backup."},
 {id:'evidence',title:'Link an Arena outcome to devnet',route:'#/positions',text:'After an Arena action, choose a nominal SOL amount and recipient. The evidence transfer is 1/10,000 of that SOL amount, floored in integer lamports, plus fees. The memo commits the stored simulation digest. It does not prove that the simulated trade happened. The nominal SOL is independent of synthetic USD notional.'},
 {id:'small-transfer',title:'Funded recipients and self-transfers',route:'#/positions',text:"A new receiver may need test SOL before it can accept a tiny SOL payment. Guide checks this and shows the receiver address to fund when needed. Token transfers have separate account-rent requirements. An explicit self-transfer returns funds to the payer; it does not pay another person."},
 {id:'receipt-scope',title:'What a devnet receipt establishes',route:'#/receipts',text:'Witness checks the recorded signature and compares the complete signed bytes with the confirmed RPC transaction. RPC is the observation source. A simulated Arena receipt is separate. A lost reply requires reconciliation of the same operation, never an automatic replacement payment.'},
);

GUIDE.push(
 {id:'market-pulse',title:'Market Pulse and the chart',route:'#/positions',text:'Expand Market above the page for 15-second sampled candles, OHLC bars, line or area charts. The accordion pushes the content down inside the main column. Position Studio and the chart share one price request loop.'},
 {id:'market-cadence',title:'Price polling and candle intervals',route:'#/positions',text:'Candle width and sampling cadence are separate. Conservative mode polls no faster than 15 seconds. At that cadence a 15-second candle may contain one price and have no wick. Custom mode can poll faster within the configured quota and retains 20 percent headroom. Rate limits trigger backoff. Jupiter supplies no traded volume or historical candles.'},
 {id:'market-positions',title:'Live marks and simulated P&L',route:'#/positions',text:'A new position needs a fresh SOL mark. Entry, reduce and close actions freeze their observation before execution. Resume keeps that exact price. Unrealised P&L is current mark minus entry, multiplied by remaining simulated SOL units. Realised P&L uses completed reduce and close prices. Fees, slippage and leverage are excluded. Earlier fixed-price records keep their original basis.'},
 {id:'market-provider',title:'Bring another price provider',route:'#/components',text:'Market Pulse is independent of the Solana transaction Sidecars. Its settings support JSON import/export and multiple instruments. HTTP OHLCV providers can return the declared market feed contract, or a trusted app adapter can push observations in manual mode. No background provider is created automatically.'},
);

// The shared developer guide is also searchable through the existing read-only assistant tool.
import './architecture.js';
GUIDE.push(...globalThis.CappSolanaDocs.topics.map(t=>({id:'developer-'+t.id,title:t.title,route:'#/docs/'+t.id,text:t.summary+' '+t.paragraphs.join(' ')})));

GUIDE.push(
 {id:'service-desk',title:'Service desk: receipt-gated report',route:'#/service',text:"Save an order and pay its reviewed devnet amount. Once the matching receipt is verified, generate the report on this device. You can then create a separate Proof studio payment to commit the report’s fingerprint. This demonstrates a local paid report; production merchant delivery needs its own independent payment verification."},
 {id:'payout-desk',title:'Payout desk: independent transfers',route:'#/batch',text:"Add two to five contributors with their names, addresses and SOL amounts. Review and pay each person separately. Completed payments remain complete while others wait. If one payment has an uncertain result, check that payment before continuing. The batch is not an all-or-nothing transfer."},
 {id:'proof-studio',title:'Proof studio: compare a document',route:'#/proof',text:"Save a document and record its fingerprint with a devnet payment. After checking the receipt, compare another copy with the original to see whether it changed. A matching fingerprint identifies the same content; it does not establish who wrote it or whether its claims are true."}
);

import {EXPERIENCES} from './experience-content.mjs';
GUIDE.push(...Object.entries(EXPERIENCES).map(([id,x])=>({id:'journey-'+id,title:x.goal,route:'#/'+id,text:x.why+' '+x.result+' Steps: '+x.steps.join(' → ')+'. Previous runs shows saved work; opening a record never starts another transaction. Transaction details and Developer activity contain the technical evidence.'})));
GUIDE.push({id:'receipt-tracking-warning',title:'Receipt ready but local tracking needs attention',route:'#/receipts',text:'A matching devnet receipt and a local Sidecar tracking error are separate facts. Keep the receipt, inspect Technical error details and use Refresh receipt. Do not send another payment just to clear a tracking warning. A network confirmation without matching transaction evidence is not marked complete.'});

GUIDE.push({id:'mainnet-wallets',title:'Experimental mainnet wallet management',route:'#/wallets',text:'Mainnet Wallets can create, import, receive, check balances, lock and export keys. Mainnet keys require a password and an explicit warning that all funds can be lost. Wallet security is not the primary focus of this alpha. Mainnet sending is not enabled. Keep an independent backup and password before funding. Compatible external wallets appear when the browser or host exposes them; native MWA is not included.'});

GUIDE.push(
 {id:'expected-policy-rejection',title:'Why a guided policy demo rejects the request',route:'#/policy',text:'Excessive fee deliberately requests 150,000 lamports against a 100,000-lamport ceiling. Stale request deliberately uses an age of 600 seconds against a 300-second limit. Rejection of exactly that check is the expected successful demo outcome. The playground checks no wallet balance and spends no funds. Guide stops if an unexpected check fails. Compare Normal request to see a pass; obtain fresh information before reviewing a real stale request.'},
 {id:'guided-wallet-and-draft',title:'A funded wallet but an address error',route:'#/service',text:"Check the recipient address as well as the payer’s balance. Having test SOL does not fill a missing recipient. Guide can reuse or create a payer and separate receiver, and fills only empty recipient fields. Change your demo wallets in Wallets. A saved payment still belongs to its original sender, which is shown when you reopen it."},
 {id:'assistant-chat-and-guide',title:'Chat, guided demos and help in the Assistant',route:'#/',text:"Use Chat for questions, Guided demos to choose a task, and Guide library to browse help. Page explanations and walkthroughs work without an AI model; conversational AI needs a loaded model. A suggested demo begins when you choose Guide me or Watch demo. You can inspect or stop the current walkthrough from the Guide controls. Stopping an answer does not erase saved work."}
);

GUIDE.push({id:'guide-missing-wallet',title:'Start Guide without a devnet wallet',route:'#/tokens',text:"Guide can reuse your saved wallets or create a missing devnet payer and separate receiver. You can also choose Prepare demo wallets in Wallets. Save a backup of each new device wallet. When funding is needed, Guide shows the address and faucet link; return after adding test funds. SOL pays network fees, while token demos also need the chosen token. You approve signing and sending separately."});

GUIDE.push({id:'demo-wallet-roles',title:'Set your demo payer and receiver',route:'#/wallets',text:"The payer sends the payment; the receiver gets it. Choose existing wallets, enter an external receiver address, or use Prepare demo wallets to create any missing accounts. Review both addresses before paying. Addresses you enter and payments already saved keep their original values. If a receiver becomes unavailable or matches the payer, choose a different receiver. A new receiver may need test SOL before its first tiny payment."});
