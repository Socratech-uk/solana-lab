// One-time, offline merge into the existing cApp project. Close cApp first so
// a running editor cannot write its older in-memory selection over this file.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {PROFILE,DEMO_PROFILE} from '../src/catalog.mjs';

const KEY='capp.sidecar-library.selections.v1';
const NETWORKS=['compass','sentinel','latch','dispatch','witness'];
export function demoSettings(state) {
  const next=structuredClone(state);
  if(next.protocol!=='capp.project-state.v1'||next.projectId!=='solana-lab')throw Error('This is not a Solana Lab cApp project state.');
  const raw=next.browserStorage?.[KEY];
  if(typeof raw!=='string')throw Error('The project has no saved Sidecar selection. Open Solana Lab in cApp and select its eleven Solana Sidecars first.');
  const library=JSON.parse(raw);
  if(library.protocol!==KEY)throw Error('Unsupported saved Sidecar format; nothing changed.');
  const app=library.apps?.['app:solana-lab'];
  const selected=app?.selected;
  if(!selected||typeof selected!=='object'||Array.isArray(selected))throw Error('Solana Lab has no saved app selection.');
  for(const item of DEMO_PROFILE.library.selected) {
    const found=selected[item.id],name=item.id.replace('uk.capp.sidecar.solana-','');
    if(!found||found.id!==item.id)throw Error(`Select ${name} in cApp Library first; nothing changed.`);
    // Preserve all Conduit settings. Its separate, explicitly requested read
    // connection is not used for the simulated payment or position path.
    if(name!=='conduit'&&(found.config?.providerMode||item.config.providerMode)!==item.config.providerMode)
      throw Error(`${name} uses a different provider. Review it in cApp Library before applying the demo settings; nothing changed.`);
  }
  const changes=[];
  for(const name of NETWORKS) {
    const item=selected['uk.capp.sidecar.solana-'+name];
    if(item.config?.network==='demo')continue;
    changes.push({component:name,from:item.config?.network||'default',to:'demo'});
    item.config={...item.config,network:'demo'};
  }
  if(changes.length){next.browserStorage[KEY]=JSON.stringify(library);next.updatedAt=new Date().toISOString();}
  return {state:next,changes};
}

export function devnetSettings(state) {
  const next=structuredClone(state);
  if(next.protocol!=='capp.project-state.v1'||next.projectId!=='solana-lab')throw Error('Choose the Solana Lab project state.');
  const library=JSON.parse(next.browserStorage?.[KEY]||'null');
  if(library?.protocol!==KEY)throw Error('Open Solana Lab in cApp and save its Sidecar selection first.');
  const selected=library.apps?.['app:solana-lab']?.selected;
  if(!selected||Array.isArray(selected))throw Error('Solana Lab has no saved app selection.');
  const changes=[];
  for(const desired of PROFILE.library.selected){
    const item=selected[desired.id];if(!item)throw Error(`Select ${desired.id} in cApp Library first.`);
    const config={...item.config,...desired.config};
    // Keep the selected endpoint/adapter and external wallet provider. No token is printed.
    if(desired.id.endsWith('solana-conduit')){
      if(item.config?.rpcUrl&&!/^https:\/\/api\.devnet\.solana\.com\/?$/.test(item.config.rpcUrl))config.rpcUrl=item.config.rpcUrl;
      for(const key of ['rpcToken','readRpcUrl','readRpcToken','readRpcNetwork'])if(item.config?.[key])config[key]=item.config[key];
      if(item.config?.providerMode==='external-adapter')config.providerMode='external-adapter';
    }
    if(desired.id.endsWith('solana-latch')&&['external-adapter','native-mwa'].includes(item.config?.providerMode))config.providerMode=item.config.providerMode;
    const keys=Object.keys(config).filter(key=>JSON.stringify(config[key])!==JSON.stringify(item.config?.[key]));
    if(keys.length){changes.push({component:desired.id.replace('uk.capp.sidecar.solana-',''),settings:keys,provider:config.providerMode});item.config=config;}
  }
  if(changes.length){next.browserStorage[KEY]=JSON.stringify(library);next.updatedAt=new Date().toISOString();}
  return {state:next,changes};
}

export async function configureProject(projectDirectory,{check=false}={}) {
  const root=path.resolve(projectDirectory),file=path.join(root,'state.json');
  const project=JSON.parse(await fs.readFile(path.join(root,'project.json'),'utf8'));
  if((project.projectId||project.id)!=='solana-lab')throw Error('Choose the cApp/projects/solana-lab workspace, not the web source folder.');
  if(!(await fs.lstat(file)).isFile())throw Error('The project state must be a regular file.');
  const before=await fs.readFile(file),result=devnetSettings(JSON.parse(before));
  if(check||!result.changes.length)return {project:root,changes:result.changes,written:false};
  const digest=createHash('sha256').update(before).digest('hex');
  const backup=path.join(root,'Library','backups',`state-before-devnet-${digest}.json`);
  await fs.mkdir(path.dirname(backup),{recursive:true});
  try{await fs.writeFile(backup,before,{flag:'wx'});}
  catch(error){if(error.code!=='EEXIST'||!(await fs.readFile(backup)).equals(before))throw error;}
  const temporary=path.join(root,`.solana-lab-state-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary,JSON.stringify(result.state,null,2)+'\n',{flag:'wx'});
    if(!(await fs.readFile(file)).equals(before))throw Error('The project changed while preparing the update. Close cApp and retry; the current state was preserved.');
    await fs.rename(temporary,file);
  }finally{await fs.rm(temporary,{force:true});}
  return {project:root,changes:result.changes,written:true,backup};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args=process.argv.slice(2),check=args.includes('--check');
    const locations=args.filter(x=>x!=='--check');
    if(locations.length>1||locations.some(x=>x.startsWith('--')))throw Error('Usage: node tools/configure-capp.mjs [cApp project folder] [--check]');
    const result=await configureProject(locations[0]||path.join(os.homedir(),'cApp','projects','solana-lab'),{check});
    console.log(JSON.stringify(result,null,2));
    console.log(result.written?'Devnet profile updated. Reopen the project in cApp, compile the updated web source, and rebuild the installer.':result.changes.length?'Check only: close cApp and run without --check to apply.':'The devnet profile is already configured.');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
