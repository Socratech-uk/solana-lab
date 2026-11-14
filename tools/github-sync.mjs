import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync,spawn} from 'node:child_process';
import readline from 'node:readline';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(fs.readFileSync(path.join(root,'.github-sync.json'),'utf8'));
const args=process.argv.slice(2);
let check=false,useStaged=false,message='';
for(let i=0;i<args.length;i++){
  if(args[i]==='--check')check=true;
  else if(args[i]==='--staged')useStaged=true;
  else if(args[i]==='--message'&&args[i+1])message=args[++i];
  else throw new Error('Usage: sync-github.ps1 [-Check] [-Message "description"]');
}
if(!/^[A-Za-z0-9-]+$/.test(config.owner)||!(/^[A-Za-z0-9_.-]+$/).test(config.repository)||!['private','public'].includes(config.visibility))throw new Error('Invalid repository configuration.');
const expectedUrl=`https://github.com/${config.owner}/${config.repository}.git`;
const gitEnv={...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'};
let gitDirectory='';
function git(params,options={}){
  const r=spawnSync('git',['-C',root,...params],{encoding:options.buffer?null:'utf8',input:options.input,maxBuffer:192*1024*1024,timeout:120000,windowsHide:true,env:gitEnv});
  if(r.status!==0&&!options.allowFailure)throw new Error(`Git ${params[0]} failed: ${String(r.stderr||r.error||'').slice(0,1800)}`);
  return r;
}
function lines(params){return String(git(params).stdout).trim().split(/\r?\n/).filter(Boolean);}
function nul(params){return String(git(params).stdout).split('\0').filter(Boolean);}
const head=()=>String(git(['rev-parse','--verify','HEAD'],{allowFailure:true}).stdout||'').trim();
function scanText(text,name){
  const allowed=new Set(config.allowedTestSecretHashes||[]);
  const rules=[
    ['GitHub token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{60,})\b/g],
    ['OpenAI-style secret',/\bsk-(?:(?:proj|svcacct)-)?[A-Za-z0-9_-]{24,}\b/g],
    ['AWS access key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
    ['private key',/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]{80,}?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g],
  ];
  for(const [kind,pattern]of rules){for(const found of text.matchAll(pattern)){
    if(kind==='AWS access key'&&found[0].endsWith('EXAMPLE'))continue;
    const hash=crypto.createHash('sha256').update(found[0]).digest('hex');
    if(!allowed.has(hash))throw new Error(`Potential ${kind} in ${name}. Secret value was not printed. Review before syncing.`);
  }}
  if(/\.json$/i.test(name)){
    try{const value=JSON.parse(text);if(Array.isArray(value)&&value.length===64&&value.every(n=>Number.isInteger(n)&&n>=0&&n<=255))throw new Error('WALLET_KEYPAIR');}catch(e){if(e.message==='WALLET_KEYPAIR')throw new Error(`Possible wallet keypair in ${name}. Keep it outside Git.`);}
  }
}
function checkName(name){
  const base=path.basename(name).toLowerCase();
  if((base==='.env'||base.startsWith('.env.'))&&!['.env.example','.env.sample','.env.template','.env.public'].includes(base))throw new Error(`Local environment file is tracked: ${name}. Untrack it without deleting the local file.`);
  if(/\.(?:zip|7z|rar|tar|tgz|safetensors|gguf|ckpt|pth|pt|pfx|p12|keystore|jks)$/i.test(base))throw new Error(`Local archive, model or credential file is tracked: ${name}. Keep generated downloads outside the source sync.`);
}
function scanBuffer(buffer,name){if(buffer.subarray(0,8192).includes(0))return;scanText(buffer.toString('utf8'),name);}
async function scanIndex(names){
  if(!names.length)return;
  for(const name of names){checkName(name);if(/[\r\n]/.test(name))throw new Error('Source filenames cannot contain line breaks.');}
  const child=spawn('git',['-C',root,'cat-file','--batch'],{windowsHide:true,env:gitEnv,stdio:['pipe','pipe','pipe']});
  let errorText='',buffer=Buffer.alloc(0),state='header',remaining=0,size=0,parts=[],index=0;
  child.stderr.on('data',chunk=>{errorText=(errorText+chunk).slice(-2000);});
  const completed=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('Staged source check failed: '+errorText)));});
  child.stdin.end(names.map(name=>':'+name).join('\n')+'\n');
  try{
    for await(const chunk of child.stdout){
      buffer=Buffer.concat([buffer,chunk]);
      while(buffer.length){
        if(state==='header'){
          const end=buffer.indexOf(10);if(end<0)break;
          const fields=buffer.subarray(0,end).toString('utf8').split(' ');buffer=buffer.subarray(end+1);
          if(fields[1]!=='blob'||!/^\d+$/.test(fields[2]))throw new Error('Could not read staged source: '+names[index]);
          size=remaining=Number(fields[2]);parts=[];state='body';
        }else if(state==='body'){
          const take=Math.min(remaining,buffer.length);if(size<=12*1024*1024)parts.push(buffer.subarray(0,take));
          buffer=buffer.subarray(take);remaining-=take;if(!remaining)state='separator';
        }else{
          if(buffer[0]!==10)throw new Error('Invalid staged-object separator.');buffer=buffer.subarray(1);
          if(size<=12*1024*1024)scanBuffer(Buffer.concat(parts,size),names[index]);index++;state='header';
        }
      }
    }
    await completed;if(index!==names.length||state!=='header')throw new Error('Staged source check was incomplete.');
  }catch(error){child.kill();await completed.catch(()=>{});throw error;}
}
function checkWorkingTree(){
  const names=[...new Set(nul(['ls-files','--cached','--others','--exclude-standard','-z']))].filter(name=>fs.existsSync(path.join(root,name))&&fs.statSync(path.join(root,name)).isFile());
  const attributeData=String(git(['check-attr','-z','--stdin','filter'],{input:names.join('\0')+'\0'}).stdout).split('\0');
  const lfs=new Set();for(let i=0;i+2<attributeData.length;i+=3)if(attributeData[i+2]==='lfs')lfs.add(attributeData[i]);
  let bytes=0,lfsBytes=0;
  for(const name of names){
    checkName(name);const file=path.join(root,name),real=fs.realpathSync(file);
    if(!real.toLowerCase().startsWith(root.toLowerCase()+path.sep))throw new Error(`Source link points outside this repository: ${name}`);
    const stat=fs.statSync(file);bytes+=stat.size;
    if(lfs.has(name)){lfsBytes+=stat.size;continue;}
    if(stat.size>95*1024*1024)throw new Error(`File needs Git LFS or exclusion: ${name}`);
    if(stat.size<=12*1024*1024)scanBuffer(fs.readFileSync(file),name);
  }
  return {files:names.length,sourceBytes:bytes-lfsBytes,lfsBytes};
}
let token='';
async function api(endpoint,method='GET',body){
  if(!token){
    const response=spawnSync('git',['credential','fill'],{input:`protocol=https\nhost=github.com\nusername=${config.owner}\n\n`,encoding:'utf8',env:gitEnv,windowsHide:true,timeout:30000});
    if(response.status!==0)throw new Error('GitHub sign-in is unavailable. Sign in through Git Credential Manager and retry.');
    const values=Object.fromEntries(response.stdout.trim().split(/\r?\n/).map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)];}));
    token=values.password;if(!token)throw new Error('Git returned no GitHub credential.');
  }
  const response=await fetch('https://api.github.com'+endpoint,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'cApp-Repository-Sync',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(30000)});
  if(response.status===404)return null;
  if(!response.ok)throw new Error(`GitHub ${method} request failed: HTTP ${response.status}.`);
  return response.status===204?{}:response.json();
}
async function remoteState(){
  const refs=String(git(['ls-remote','--heads','origin',`refs/heads/${config.branch}`]).stdout).trim();
  if(!refs)return null;
  git(['fetch','--no-tags','origin',`refs/heads/${config.branch}:refs/remotes/origin/${config.branch}`]);
  return refs.split(/\s+/)[0];
}
async function checkHistory(remote){
  if(!head())return;
  const range=remote?`${remote}..HEAD`:'HEAD';
  const objects=String(git(['rev-list','--objects',range]).stdout).trim();
  if(objects){
    const objectPaths=new Map(objects.split(/\r?\n/).map(line=>{const split=line.indexOf(' ');return split<0?[line,'']:[line.slice(0,split),line.slice(split+1)];}));
    const checked=String(git(['cat-file','--batch-check=%(objectname) %(objecttype) %(objectsize)'],{input:[...objectPaths.keys()].join('\n')+'\n'}).stdout);
    for(const line of checked.trim().split(/\r?\n/)){const [id,type,size]=line.split(' ');if(type==='blob'&&Number(size)>100*1024*1024)throw new Error(`An outgoing historical Git blob exceeds GitHub's limit: ${objectPaths.get(id)||id}. No history was rewritten.`);}
  }
  const child=spawn('git',['-C',root,'log','--format=','--no-ext-diff','--unified=0','-p',range],{windowsHide:true,env:gitEnv,stdio:['ignore','pipe','pipe']});
  let errorText='',overlap='';
  child.stderr.on('data',chunk=>{errorText=(errorText+chunk).slice(-2000);});
  const completed=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('Historical source check failed: '+errorText)));});
  try{
    const reader=readline.createInterface({input:child.stdout,crlfDelay:Infinity});
    for await(const line of reader){if(line.startsWith('+')&&!line.startsWith('+++')){const addition=overlap+line.slice(1)+'\n';scanText(addition,'outgoing commit history');overlap=addition.slice(-8192);}}
    await completed;
  }catch(error){child.kill();await completed.catch(()=>{});throw error;}
}
async function push(){
  await new Promise((resolve,reject)=>{
    const child=spawn('git',['-C',root,'push','--set-upstream','origin',`HEAD:refs/heads/${config.branch}`],{windowsHide:true,env:{...gitEnv,GIT_LFS_PROGRESS:path.join(gitDirectory,'github-sync-lfs-progress.log'),GIT_LFS_FORCE_PROGRESS:'1'},stdio:['ignore','pipe','pipe']});
    let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output=(output+chunk).slice(-12000);});
    child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('Git push failed: '+output)));
  });
}
async function main(){
  if(!fs.existsSync(path.join(root,'.git')))throw new Error('This source root needs its own Git repository.');
  if(path.resolve(String(git(['rev-parse','--show-toplevel']).stdout).trim()).toLowerCase()!==root.toLowerCase())throw new Error('Git repository root differs from the app root.');
  gitDirectory=String(git(['rev-parse','--absolute-git-dir']).stdout).trim();
  const branch=String(git(['branch','--show-current']).stdout).trim();if(branch!==config.branch)throw new Error(`Expected branch ${config.branch}; current branch is ${branch}. Switch deliberately before syncing.`);
  if(nul(['diff','--name-only','--diff-filter=U','-z']).length)throw new Error('Resolve existing merge conflicts before syncing.');
  const url=String(git(['remote','get-url','origin']).stdout).trim();
  const equivalent=url===expectedUrl||url===`git@github.com:${config.owner}/${config.repository}.git`;
  if(!equivalent)throw new Error('Origin differs from the configured GitHub repository. No remote was replaced.');
  console.log(`Checking ${config.owner}/${config.repository}...`);
  const source=checkWorkingTree();
  const account=await api('/user');if(account.login.toLowerCase()!==config.owner.toLowerCase())throw new Error('The Git sign-in belongs to a different GitHub account.');
  let repo=await api(`/repos/${config.owner}/${config.repository}`);
  if(!repo){
    if(check){console.log(JSON.stringify({check:true,wouldCreate:config.visibility,repository:`${config.owner}/${config.repository}`,...source}));return;}
    repo=await api('/user/repos','POST',{name:config.repository,private:config.visibility==='private',description:config.description||'',auto_init:false});
    repo=await api(`/repos/${config.owner}/${config.repository}`);
  }
  if(repo.owner.login.toLowerCase()!==config.owner.toLowerCase()||!repo.permissions?.push)throw new Error('Repository ownership/write access does not match.');
  if(config.requirePrivate&&!repo.private){
    if(check)throw new Error('Privacy guard: this source repository must be private.');
    repo=await api(`/repos/${config.owner}/${config.repository}`,'PATCH',{private:true});
    if(!repo.private)throw new Error('Could not verify private visibility. Nothing was pushed.');
  }
  const remote=await remoteState();const current=head();
  if(remote&&current){
    if(git(['merge-base','--is-ancestor',remote,current],{allowFailure:true}).status!==0)throw new Error('GitHub has commits missing locally. Fetch/merge them deliberately; sync never force-pushes or overwrites remote work.');
  }else if(remote&&!current)throw new Error('GitHub is nonempty but this local repository has no history. Clone or merge it deliberately.');
  await checkHistory(remote);
  if(check){console.log(JSON.stringify({check:true,repository:repo.html_url,private:repo.private,localHead:current,remoteHead:remote,...source}));return;}
  if(!useStaged)git(['add','--all']);
  const staged=nul(['diff','--cached','--name-only','--diff-filter=ACMR','-z']);
  await scanIndex(staged);
  if(git(['diff','--cached','--quiet'],{allowFailure:true}).status!==0){
    git(['commit','-m',message||`Sync source and reusable GitHub sync (${new Date().toISOString().slice(0,10)})`]);
  }
  await checkHistory(remote);
  const privacy=await api(`/repos/${config.owner}/${config.repository}`);if(config.requirePrivate&&!privacy.private)throw new Error('Privacy changed before push. Nothing was pushed.');
  console.log(`Uploading ${config.repository}${source.lfsBytes?' (including Git LFS assets)':''}...`);
  await push();
  const pushed=head();const result={repository:repo.html_url,private:privacy.private,branch:config.branch,commit:pushed,remainingLocalChanges:nul(['status','--porcelain=v1','-z']).length,...source};
  fs.writeFileSync(path.join(gitDirectory,'github-sync-last.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
