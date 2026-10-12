import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import {backupFingerprint,receiveSvg,walletPayments} from '../src/wallet-tools.mjs';
import {fixture} from './devnet-fixture.mjs';
import {JSDOM} from 'jsdom';
const dom=new JSDOM();globalThis.HTMLElement=dom.window.HTMLElement;globalThis.customElements=dom.window.customElements;
const {WalletManager}=await import('../src/wallets.mjs');

let passed=0;
const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
const f=fixture({walletMode:'device-wallet'}),api=f.api.latch;
const wallet=await api.walletCreate({network:'devnet',label:'QR and backup fixture'});
await test('an independent decoder reads exactly the public address from the rendered receive QR',async()=>{
  const another=await api.walletCreate({network:'devnet',label:'Second QR fixture'});
  for(const address of ['11111111111111111111111111111111',wallet.walletPubkey,another.walletPubkey]){
    const svg=receiveSvg(address),cells=Number(svg.match(/viewBox="0 0 (\d+)/)[1]),scale=6,size=cells*scale,pixels=new Uint8ClampedArray(size*size*4).fill(255);
    for(const [,x,y] of svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g))for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){
      const offset=((Number(y)*scale+dy)*size+Number(x)*scale+dx)*4;pixels[offset]=pixels[offset+1]=pixels[offset+2]=0;
    }
    assert.equal(jsQR(pixels,size,size)?.data,address);
    assert.doesNotMatch(svg,/<script|https?:\/\/(?!www.w3.org)|foreignObject|onload/);
  }
  for(const address of ['<svg onload=alert(1)>','0'.repeat(32),'1'.repeat(44),'1'.repeat(31)])assert.throws(()=>receiveSvg(address),/Invalid wallet address/);
});
await test('wallet activity separates network, sender, recipient and recovery records without mutating history',async()=>{
  const p={scope:'main',network:'devnet',walletPubkey:wallet.walletPubkey,recipient:'elsewhere',createdAt:1};
  const rows=[{...p,id:'outgoing'},{...p,id:'incoming',createdAt:4,walletPubkey:'other',recipient:wallet.walletPubkey},{...p,id:'self',createdAt:3,recipient:wallet.walletPubkey},{...p,id:'different-network',network:'mainnet-beta'},{...p,id:'recovery',scope:'recovery'},{...p,id:'unrelated',walletPubkey:'another'}];
  const before=JSON.stringify(rows);
  assert.deepEqual(walletPayments(rows,wallet).map(p=>p.id),['incoming','self','outgoing']);assert.equal(JSON.stringify(rows),before);
  assert.deepEqual(walletPayments(rows,{...wallet,network:'mainnet-beta'}).map(p=>p.id),['different-network']);
});
await test('backup file comparison rejects changed key material and wrong wallet identity',async()=>{
  const backup=await api.walletExport({walletId:wallet.walletId,format:'backup'}),expected=await backupFingerprint(backup,wallet);
  assert.equal(await backupFingerprint({...backup,exportedAt:1,wallet:{...backup.wallet,label:'Renamed'}},wallet),expected);
  assert.notEqual(await backupFingerprint({...backup,wallet:{...backup.wallet,secret:'changed'}},wallet),expected);
  await assert.rejects(backupFingerprint({...backup,wallet:{...backup.wallet,network:'mainnet-beta'}},wallet),/this wallet/);
  await assert.rejects(backupFingerprint({...backup,protocol:'not-a-backup'},wallet),/this wallet/);
  const mainnet=await api.walletCreate({network:'mainnet-beta',label:'Encrypted backup fixture',password:'fixture-only-password',acknowledgeMainnetLoss:true});
  const encrypted=await api.walletExport({walletId:mainnet.walletId,format:'backup'}),hash=await backupFingerprint(encrypted,mainnet);
  encrypted.wallet.encrypted.iv='tampered';assert.notEqual(await backupFingerprint(encrypted,mainnet),hash);
});
await test('healthy mainnet backup restores the same address across runtime restart and rejects a wrong password',async()=>{
  const original=(await api.walletList()).wallets.find(w=>w.network==='mainnet-beta'),backup=await api.walletExport({walletId:original.walletId,format:'backup'});
  await api.walletRemove({walletId:original.walletId,confirmAddress:original.walletPubkey});
  let current=fixture({storage:f.storage,walletMode:'device-wallet'}).api.latch;
  await assert.rejects(current.walletImport({network:'mainnet-beta',backup,label:'Restored fixture',password:'wrong-fixture-password',acknowledgeMainnetLoss:true}),/Incorrect password/);
  assert.equal((await current.walletList()).wallets.some(w=>w.walletPubkey===original.walletPubkey),false);
  await current.walletImport({network:'mainnet-beta',backup,label:'Restored fixture',password:'fixture-only-password',acknowledgeMainnetLoss:true});
  current=fixture({storage:f.storage,walletMode:'device-wallet'}).api.latch;
  const restored=(await current.walletList()).wallets.find(w=>w.network==='mainnet-beta');assert.equal(restored.walletPubkey,original.walletPubkey);assert.equal(restored.locked,true);
});
await test('failed wallet refresh clears stale action controls and explains storage recovery accurately',async()=>{
  let broken=false;const manager=new WalletManager({call:async()=>{if(broken)throw Object.assign(Error('Storage damaged'),{code:'CAPP_SOLANA_LATCH_WALLET_STORAGE'});return api.walletList();}});
  await manager.refresh();assert.match(manager.html(),/data-wallet-card/);
  broken=true;await manager.refresh();const html=manager.html();assert.equal(manager.snapshot,null);assert.match(html,/Saved wallets need recovery/);assert.doesNotMatch(html,/data-wallet-form="(?:import|create|remove)"|data-wallet-card/);
});
await test('hosted wallet preview never reads storage or renders operational QR and backup controls',async()=>{
  const manager=new WalletManager({preview:true,call:()=>{throw Error('Preview invoked a runtime');},payments:()=>{throw Error('Preview read history');}});
  await manager.refresh();assert.match(manager.html(),/public preview does not create/);assert.doesNotMatch(manager.html(),/wallet-qr|data-wallet-form|wallet-history/);
});
console.log(JSON.stringify({passed,rpc:'fixture',nativeAcceptance:false}));
dom.window.close();
