import {qrcode} from './qr-code.mjs';

const base58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function walletAddress(address){
  if(typeof address!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address))throw Error('Invalid wallet address.');
  let n=0n;for(const char of address)n=n*58n+BigInt(base58.indexOf(char));
  let length=0;while(n){length++;n>>=8n;}
  length+=(address.match(/^1*/)?.[0].length||0);
  if(length!==32)throw Error('Invalid wallet address.');
  return address;
}

// A plain public address: no amount, transaction request, secret or network URL.
export function receiveMatrix(address){
  const code=qrcode(0,'M');code.addData(walletAddress(address),'Byte');code.make();
  return Array.from({length:code.getModuleCount()},(_,y)=>Array.from({length:code.getModuleCount()},(_,x)=>code.isDark(y,x)));
}
export function receiveSvg(address){
  const cells=receiveMatrix(address),size=cells.length+8,paths=[];
  cells.forEach((row,y)=>row.forEach((dark,x)=>{if(dark)paths.push(`M${x+4} ${y+4}h1v1h-1z`);}));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="Wallet receive address QR code" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="white"/><path d="${paths.join('')}" fill="black"/></svg>`;
}

export function walletPayments(payments,wallet){
  return payments.filter(p=>p.scope==='main'&&p.network===wallet.network&&(p.walletPubkey===wallet.walletPubkey||p.recipient===wallet.walletPubkey))
    .slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
}

// Compare a user-selected file to the exported recovery material. Display names,
// export dates and object key order do not change that material. This does not
// decrypt the file or assert that a restore/password has been tested.
export async function backupFingerprint(backup,wallet){
  const row=backup?.wallet;
  if(backup?.protocol!=='capp.solana-wallet-backup.v1'||!row||row.id!==wallet.walletId||row.network!==wallet.network||row.walletPubkey!==wallet.walletPubkey)throw Error('Choose the backup downloaded for this wallet.');
  let material;
  if(row.network==='devnet'&&row.protection==='device-plaintext'&&typeof row.secret==='string')material={secret:row.secret};
  else if(row.network==='mainnet-beta'&&row.protection==='password-aes-gcm'&&row.encrypted){
    const e=row.encrypted;material={algorithm:e.algorithm,iterations:e.iterations,salt:e.salt,iv:e.iv,ciphertext:e.ciphertext};
  }else throw Error('This file is not a supported wallet backup.');
  const bytes=new TextEncoder().encode(JSON.stringify([row.id,row.network,row.walletPubkey,row.protection,material]));
  try{return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');}
  finally{bytes.fill(0);}
}
