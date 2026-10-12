import {handoffAvailable} from './funding-handoff.mjs';
import {esc} from './visuals.mjs';
import {walletAddress} from './wallet-tools.mjs';

export const CIRCLE_FAUCET='https://faucet.circle.com/';

// A public-address handoff to Circle. No wallet connection, API key or faucet
// request is made here; the person completes Circle's own verification.
export function testUsdcFunding({payer='',copyControl='',checkControl='',saved=false,id='token-funding',returnTo='Token desk',checkLabel='Check setup'}={}){
 return `<section class="token-funding" id="${esc(id)}" aria-label="Get devnet test USDC">
 <div class="eyebrow">TOKEN DEMO · TEST FUNDS</div><h3>Get test USDC from Circle</h3>
 <p>You need <strong>test USDC to transfer USDC</strong>, plus devnet SOL for fees and account rent. A funded SOL balance does not include USDC.</p>
 ${payer?`<p class="funding-payer-label">${saved?'Saved transfer’s payer':'Selected devnet payer'} · fund this wallet</p><code class="wallet-address">${esc(payer)}</code>`:'<p class="notice-card">Create or select a devnet payer in Wallets first.</p>'}
 <ol><li>Copy the payer address above. Keep a backup of a device wallet.</li><li>Open Circle’s faucet. Choose <strong>USDC</strong> and <strong>Solana Devnet</strong>, paste the address, complete its verification and choose <strong>Send 20 USDC</strong>.</li><li>Return to ${esc(returnTo)} and <strong>${esc(checkLabel)}</strong>. Wait for the tokens to arrive; Guide continues when the checks pass.</li></ol>
 <div class="actions">${payer?copyControl:''}<a class="button primary" href="${CIRCLE_FAUCET}" target="_blank" rel="noopener noreferrer">Open Circle faucet ↗</a>${payer&&handoffAvailable()?`<button type="button" class="button" data-action="funding-usdc" data-id="${esc(payer)}">Open with Guide</button>`:''}${checkControl}</div>
 <p class="hint">Circle’s public allowance is 20 test USDC every 2 hours, per wallet address and blockchain. If it reports Limit Exceeded, wait before retrying. This demo sends up to 1 test USDC per transfer. Test tokens have no monetary value.</p>
 ${saved?'<p class="hint">After funding, use Continue review or the next Guide step to retry this saved transfer. Its payer and operation stay the same.</p>':''}
 </section>`;
}

export async function copyFundingPayer(address,clipboard=globalThis.navigator?.clipboard){
 const payer=walletAddress(address);
 if(!clipboard?.writeText)throw Error('Copy is unavailable. Select and copy the displayed payer address.');
 await clipboard.writeText(payer);
 return payer;
}
