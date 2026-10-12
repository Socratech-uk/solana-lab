import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {ROOT,verifyRuntimes,verifyMarket,verifyQr} from './build.mjs';
import {CAPABILITY_DEMOS} from '../src/capability-content.mjs';
import {COMPONENTS,DEMOS,GUIDE} from '../src/catalog.mjs';

export const PREVIEW_PROTOCOL='capp.solana-lab.preview.v1';
export const PREVIEW_CSP="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'";
// Explicit publication inventory: no provider config, runtime bundles, saved
// work, executable plans, project tools or environment files enter this build.
export const PREVIEW_FILES=[
  'index.html','style.css','src/architecture.css','src/architecture.js',
  'src/guided-transactions.mjs','src/guided.mjs','src/guided-actions.mjs','src/guided-content.mjs','src/app.mjs','src/assistant.mjs','src/lab.mjs','src/workflows.mjs',
  'src/wallets.mjs','src/wallets.css','src/wallet-tools.mjs','src/qr-code.mjs',
  'src/showcase-ui.mjs','src/experience.mjs','src/experience-content.mjs','src/experience.css','src/visuals.mjs','src/runtime.mjs','src/preview.mjs',
  'src/market-metadata.mjs','src/guide-docset.js',
  'src/guide-catalog.mjs','src/setup-readiness.mjs','src/demo-defaults.mjs','src/demo-token.mjs','src/token-funding.mjs','src/request-payer.mjs',
  'src/funded-wallet.mjs','src/funding-handoff.mjs','src/guided-wallet.mjs','src/demo-wallets.mjs',
  'src/capability-guided.mjs','src/capability-lab.mjs','src/capability-ui.mjs','src/capability-content.mjs','src/asset-format.mjs','src/payment-proof.mjs',
  'src/solana-payments.mjs','src/solana-payments.d.mts','assets/SOLANA_ASSET_PAYMENTS.md',
  'src/solana-client.mjs','src/solana-client.d.mts',
  'assets/mark.svg','assets/SOLANA_DEVELOPER_GUIDE.md','assets/QR_CODE_LICENSE.txt','assets/qr-code.json',
];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function previewRoutes(){
  return ['','wallets','guided',...['service','batch','proof'],...DEMOS.map(d=>d.id),...CAPABILITY_DEMOS.map(d=>d.id),'components','receipts','docs',...globalThis.CappSolanaDocs.topics.map(t=>'docs/'+t.id)];
}

async function safeOutput(output){
  const target=path.resolve(output),source=await fs.realpath(ROOT);
  const fromTarget=path.relative(target,source),fromSource=path.relative(source,target);
  const outside=relative=>relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative);
  if(!fromTarget||!outside(fromTarget))throw Error('Preview output must not contain the source folder');
  if(!outside(fromSource)&&!['dist','dist-preview'].includes(fromSource.split(path.sep)[0]))throw Error('Use dist-preview, dist or a separate folder for preview output');
  // Reject symlinks in the output path before any cleanup or writes.
  for(let p=target;;p=path.dirname(p)){
    const stat=await fs.lstat(p).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
    if(stat?.isSymbolicLink())throw Error('Preview output cannot traverse a symbolic link');
    if(p===path.dirname(p))break;
  }
  const exists=await fs.stat(target).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
  if(exists){
    if(!exists.isDirectory())throw Error('Preview output is not a directory');
    const entries=await fs.readdir(target);
    const previous=JSON.parse(await fs.readFile(path.join(target,'preview-manifest.json'),'utf8').catch(()=> 'null'));
    if(entries.length&&previous?.protocol!==PREVIEW_PROTOCOL)throw Error('Refusing to replace a folder without a Solana Lab preview manifest');
  }
  return target;
}

export async function buildPreview(output=path.join(ROOT,'dist-preview'),{basePath='/solana-lab/'}={}){
  if(!/^\/[a-z0-9-]+\/$/.test(basePath))throw Error('Use one absolute mount path, for example /solana-lab/');
  await verifyRuntimes();await verifyMarket();await verifyQr();
  const target=await safeOutput(output),source=await fs.realpath(ROOT),payload=new Map();
  for(const file of PREVIEW_FILES){
    const real=await fs.realpath(path.join(source,file));
    if(real!==path.join(source,file))throw Error('Preview source cannot traverse symbolic links: '+file);
    payload.set(file,await fs.readFile(real));
  }
  // Preserve descriptive metadata, excluding every build-selected provider and
  // client credential. An inert adapter satisfies the UI's static imports.
  payload.set('src/catalog.mjs',Buffer.from(
    `export const COMPONENTS=${JSON.stringify(COMPONENTS)};\nexport const DEMOS=${JSON.stringify(DEMOS)};\nexport const GUIDE=${JSON.stringify(GUIDE)};\nexport const PROFILE={library:{selected:[]}};\nexport const DEMO_PROFILE=PROFILE;\n`));
  payload.set('src/market.mjs',Buffer.from(
    `export {MARKET_COMPONENT} from './market-metadata.mjs';\nconst locked=()=>{throw Object.assign(new Error('Live pricing requires the installed app.'),{code:'LAB_PREVIEW_ONLY'});};\nexport const connectMarket=locked;\nexport const mountLabMarket=locked;\nexport const watchMarketRuntime=()=>()=>{};\n`));
  let html=payload.get('index.html').toString();
  html=html.replace('<head>',`<head>\n  <base href="${basePath}">\n  <meta name="solana-lab-mode" content="preview">\n  <meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`)
    .replace('<title>Solana Lab · cApp</title>','<title>Solana Lab · Web preview · cApp</title>')
    .replace('Twelve working recipes, an interactive architecture and developer docs.','Explore twelve recipe previews, an interactive architecture and developer docs. Execution requires the installed app.')
    .replace('Connecting the components…','Opening the web preview…')
    .replace('This app needs JavaScript to load and run its Sidecar workflows.','Enable JavaScript to explore this preview. Running workflows requires the installed app.');
  payload.set('index.html',Buffer.from(html));
  const manifest={protocol:PREVIEW_PROTOCOL,mode:'preview',basePath,routes:previewRoutes(),files:Object.fromEntries([...payload].sort(([a],[b])=>a.localeCompare(b,'en')).map(([file,bytes])=>[file,{sha256:hash(bytes),bytes:bytes.length}]))};
  // All source reads and validation finish before touching the output.
  await fs.rm(target,{recursive:true,force:true});
  for(const [file,bytes] of payload){await fs.mkdir(path.dirname(path.join(target,file)),{recursive:true});await fs.writeFile(path.join(target,file),bytes);}
  await fs.writeFile(path.join(target,'preview-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return {output:target,mode:'preview',routes:manifest.routes.length,files:payload.size,manifest};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2);
  if(args.length&&!(args.length===2&&args[0]==='--output'&&args[1]))throw Error('Usage: node tools/build-preview.mjs [--output PATH]');
  const result=await buildPreview(args[1]);
  console.log(`Built web preview: ${result.output}\n${result.routes} routes; runtime actions locked.`);
}
