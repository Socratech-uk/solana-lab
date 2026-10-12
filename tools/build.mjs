import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {PROFILE} from '../src/catalog.mjs';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const PUBLIC_FILES = ['index.html', 'style.css'];
export const PUBLIC_DIRECTORIES = ['src', 'assets', 'runtime'];
export const MARKET_FILES = ['core.mjs','chart.mjs','panel.mjs','runtime.js','sidecar.json','assets.json'];
export const isPublicFile = relative => PUBLIC_FILES.includes(relative) || PUBLIC_DIRECTORIES.some(dir=>relative.startsWith(dir+'/')) || MARKET_FILES.some(file=>relative==='sidecars/market-pulse/'+file);

export async function verifyGuide(root=ROOT){
  const directory=path.join(root,'runtime/guide'),ledger=JSON.parse(await fs.readFile(path.join(directory,'sources.json'),'utf8'));
  const expected=['ftue-agent.js','ftue-shell.js','ftue-shell.css'];
  if(ledger.files?.length!==expected.length)throw Error('Incomplete Guide asset ledger');
  for(const file of expected){const row=ledger.files.filter(r=>r.file===file);if(row.length!==1||row[0].sha256!==createHash('sha256').update(await fs.readFile(path.join(directory,file))).digest('hex'))throw Error('Guide runtime changed: '+file+'. Refresh with tools/vendor-guide.mjs.');}
}

export async function verifyQr(root=ROOT){
  const ledger=JSON.parse(await fs.readFile(path.join(root,'assets/qr-code.json'),'utf8'));
  const expected=['src/qr-code.mjs','assets/QR_CODE_LICENSE.txt'];
  if(ledger.package!=='qrcode-generator'||ledger.version!=='2.0.4'||ledger.files?.length!==expected.length)throw Error('Invalid QR encoder source ledger');
  for(const file of expected){const records=ledger.files.filter(r=>r.file===file);if(records.length!==1||records[0].sha256!==createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex'))throw Error('QR encoder asset changed: '+file+'. Refresh with tools/vendor-qr.mjs.');}
}

export async function verifyMarket(root=ROOT){
  const folder=path.join(root,'sidecars/market-pulse'),ledger=JSON.parse(await fs.readFile(path.join(folder,'assets.json'),'utf8'));
  const expected=MARKET_FILES.filter(file=>file!=='assets.json');
  if(ledger.protocol!=='capp.market-assets.v1'||ledger.files?.length!==expected.length)throw Error('Incomplete Market Pulse asset ledger');
  for(const file of expected){const rows=ledger.files.filter(row=>row.file===file);if(rows.length!==1||rows[0].sha256!==createHash('sha256').update(await fs.readFile(path.join(folder,file))).digest('hex'))throw Error('Market Pulse asset changed: '+file+'. Run npm run build:market after intentional edits.');}
  return expected.length;
}

export async function verifyRuntimes(root = ROOT) {
  const ledger = JSON.parse(await fs.readFile(path.join(root, 'runtime/sources.json'), 'utf8'));
  const expected = PROFILE.library.selected.map(item => item.id.replace('uk.capp.sidecar.solana-', ''));
  if (ledger.components?.length !== expected.length) throw Error('Incomplete Sidecar source ledger');
  for (const name of expected) {
    const matches = ledger.components.filter(item => item.component === name);
    if (matches.length !== 1 || matches[0].file !== `runtime/${name}.js`) throw Error(`Invalid source record: ${name}`);
    const bytes = await fs.readFile(path.join(root, matches[0].file));
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== matches[0].sha256) throw Error(`Sidecar changed: ${name}. Refresh it explicitly with tools/vendor-sidecars.mjs.`);
  }
  const developer=JSON.parse(await fs.readFile(path.join(root,'runtime/developer-assets.json'),'utf8'));
  const shared=['src/architecture.js','src/architecture.css','src/solana-client.mjs','src/solana-client.d.mts','src/solana-payments.mjs','src/solana-payments.d.mts','assets/SOLANA_DEVELOPER_GUIDE.md','assets/SOLANA_ASSET_PAYMENTS.md'];
  if(developer.protocol!=='capp.solana-lab.developer-assets.v1'||developer.files?.length!==shared.length)throw Error('Incomplete shared developer asset ledger');
  for(const file of shared){const rows=developer.files.filter(r=>r.file===file);if(rows.length!==1||rows[0].sha256!==createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex'))throw Error('Shared developer asset changed: '+file+'. Refresh explicitly with tools/vendor-sidecars.mjs.');}
  return ledger.components.length;
}

export async function build(output = path.join(ROOT, 'dist')) {
  const count = await verifyRuntimes();
  await verifyGuide();
  await verifyMarket();
  await verifyQr();
  if (path.resolve(output) === path.resolve(ROOT)) throw Error('Build output cannot be the source folder');
  await fs.rm(output, {recursive: true, force: true});
  await fs.mkdir(output, {recursive: true});
  for (const name of PUBLIC_FILES) await fs.copyFile(path.join(ROOT, name), path.join(output, name));
  for (const name of PUBLIC_DIRECTORIES) await fs.cp(path.join(ROOT, name), path.join(output, name), {recursive: true});
  await fs.mkdir(path.join(output,'sidecars/market-pulse'),{recursive:true});
  for(const file of MARKET_FILES)await fs.copyFile(path.join(ROOT,'sidecars/market-pulse',file),path.join(output,'sidecars/market-pulse',file));
  return {output, sidecars: count, marketSidecars:1};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await build();
  console.log(`Built ${result.output}\n${result.sidecars} Solana runtimes + Market Pulse verified. Ready for static hosting.`);
}
