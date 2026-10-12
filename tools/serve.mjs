import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ROOT, isPublicFile} from './build.mjs';
import {PREVIEW_CSP} from './build-preview.mjs';

const TYPES = {'.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.mts':'text/plain; charset=utf-8', '.md':'text/markdown; charset=utf-8'};

export async function serve({root = ROOT, port = 8095} = {}) {
  const publicRoot = await fs.realpath(root);
  const preview=JSON.parse(await fs.readFile(path.join(publicRoot,'preview-manifest.json'),'utf8').catch(e=>{if(e.code!=='ENOENT')throw e;return 'null';}));
  if(preview&&(preview.protocol!=='capp.solana-lab.preview.v1'||preview.mode!=='preview'||preview.basePath!=='/solana-lab/'))throw Error('Invalid preview manifest');
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    if(preview)res.setHeader('Content-Security-Policy',PREVIEW_CSP+"; frame-ancestors 'none'");
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, {Allow: 'GET, HEAD'});res.end('Method not allowed');return;
    }
    try {
      const url=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(url.pathname);
      let relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      if(preview){
        const mount=preview.basePath.slice(0,-1);
        if(pathname==='/'||pathname===mount+'/'||pathname===mount+'/index.html'){
          res.writeHead(308,{Location:mount+url.search});res.end();return;
        }
        if(pathname!==mount&&!pathname.startsWith(mount+'/'))throw Error('Not mounted');
        relative=pathname.slice(mount.length).replace(/^\//,'');
        if(relative.endsWith('/')&&preview.routes.includes(relative.slice(0,-1))){res.writeHead(308,{Location:mount+'/'+relative.slice(0,-1)+url.search});res.end();return;}
        if(preview.routes.includes(relative))relative='index.html';
        if(!Object.hasOwn(preview.files,relative))throw Error('Not in preview inventory');
      }
      if (relative.includes('\\') || relative.includes('\0') || relative.split('/').some(part => part.startsWith('.'))) throw Error('Invalid path');
      if (!isPublicFile(relative)) throw Error('Not public');
      const target = await fs.realpath(path.join(publicRoot, relative));
      if (!target.startsWith(publicRoot + path.sep)) throw Error('Outside public root');
      const stat = await fs.stat(target);
      if (!stat.isFile()) throw Error('Not a file');
      const bytes = await fs.readFile(target);
      res.writeHead(200, {'Content-Type': TYPES[path.extname(target)] || 'application/octet-stream', 'Content-Length': bytes.length});
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch {
      res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), index = args.indexOf('--port');
  const port = index < 0 ? 8095 : Number(args[index + 1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Use --port with an integer from 1 to 65535');
  const root = args.includes('--preview-only') ? path.join(ROOT,'dist-preview') : args.includes('--dist') ? path.join(ROOT, 'dist') : ROOT;
  const server = await serve({root, port});
  console.log(`Solana Lab: http://127.0.0.1:${server.address().port}/\nServing ${root}\nCtrl+C to stop.`);
}
