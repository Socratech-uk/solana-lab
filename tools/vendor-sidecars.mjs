// Optional maintainer command. Normal builds use the shipped, verified runtimes.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT} from './build.mjs';
import {PROFILE} from '../src/catalog.mjs';

if (process.argv.length !== 3) throw Error('Usage: node tools/vendor-sidecars.mjs /path/to/capp-source');
const sourceRoot = await fs.realpath(process.argv[2]);
const files = [], records = [];
for (const item of PROFILE.library.selected) {
  const component = item.id.replace('uk.capp.sidecar.solana-', '');
  const packageRoot = await fs.realpath(path.join(sourceRoot, 'sidecars', 'solana-' + component));
  const manifest = JSON.parse(await fs.readFile(path.join(packageRoot, 'sidecar.json'), 'utf8'));
  const source = await fs.realpath(path.resolve(packageRoot, manifest.compile.shellEntry));
  if (!source.startsWith(packageRoot + path.sep) || path.extname(source) !== '.js') throw Error('Invalid runtime entry: ' + component);
  const bytes = await fs.readFile(source);
  const file = `runtime/${component}.js`;
  files.push({file, bytes});
  records.push({component, version: manifest.version, source: path.relative(sourceRoot, source).split(path.sep).join('/'), file, sha256: createHash('sha256').update(bytes).digest('hex')});
}
const notices=await fs.readFile(path.join(sourceRoot,'tools/solana-client/THIRD_PARTY_NOTICES.md'));
files.push({file:'runtime/THIRD_PARTY_NOTICES.md',bytes:notices});
// Shared developer experience and SDK are versioned with the source, not fetched at runtime.
const shared=[
 ['src/js/18-solana-architecture.generated.js','src/architecture.js'],
 ['sidecars/solana-edge/docs/experience/map.css','src/architecture.css'],
 ['sidecars/runtime/solana-client.mjs','src/solana-client.mjs'],
 ['sidecars/runtime/solana-client.d.mts','src/solana-client.d.mts'],
 ['sidecars/runtime/solana-payments.mjs','src/solana-payments.mjs'],
 ['sidecars/runtime/solana-payments.d.mts','src/solana-payments.d.mts'],
 ['docs/features/SOLANA_ASSET_PAYMENTS.md','assets/SOLANA_ASSET_PAYMENTS.md'],
 ['docs/features/SOLANA_DEVELOPER_GUIDE.md','assets/SOLANA_DEVELOPER_GUIDE.md'],
];
const sharedRecords=[];
for(const [source,file] of shared){const bytes=await fs.readFile(path.join(sourceRoot,source));files.push({file,bytes});sharedRecords.push({source,file,sha256:createHash('sha256').update(bytes).digest('hex')});}
files.push({file:'runtime/developer-assets.json',bytes:JSON.stringify({protocol:'capp.solana-lab.developer-assets.v1',files:sharedRecords},null,2)+'\n'});
// Read and validate every input before replacing any vendored source.
for (const {file, bytes} of files) await fs.writeFile(path.join(ROOT, file), bytes);
await fs.writeFile(path.join(ROOT, 'runtime/sources.json'), JSON.stringify({protocol:'capp.solana-lab.runtime-sources.v1', components:records}, null, 2) + '\n');
console.log('Refreshed 11 Sidecar runtimes. Run the app tests before building.');
