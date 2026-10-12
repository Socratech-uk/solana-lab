import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {build, verifyRuntimes, verifyMarket, MARKET_FILES} from '../tools/build.mjs';
import {serve} from '../tools/serve.mjs';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'solana-lab-standalone-'));
let server, passed = 0;
const check = (name, action) => action().then(() => {passed++;console.log('PASS ' + name);});
try {
  const output = path.join(temporary, 'site');
  await check('build works outside cApp and verifies all 11 shipped runtimes', async () => {
    assert.equal((await build(output)).sidecars, 11);
    assert.equal(await verifyRuntimes(output), 11);
    assert.equal(await verifyMarket(output),5);
    for (const file of ['index.html','style.css','assets/mark.svg','src/app.mjs','runtime/host.html','runtime/host.mjs']) assert.ok((await fs.stat(path.join(output, file))).isFile());
    await assert.rejects(fs.stat(path.join(output, 'tests')));
  });
  server = await serve({root: output, port: 0});
  const origin = `http://127.0.0.1:${server.address().port}`;
  await check('static preview serves the complete browser closure with correct module MIME types', async () => {
    const files = ['','style.css','assets/mark.svg','runtime/host.html','runtime/host.mjs','runtime/sources.json'];
    for (const name of await fs.readdir(path.join(output, 'src'))) files.push('src/' + name);
    for(const name of MARKET_FILES)files.push('sidecars/market-pulse/'+name);
    for (const item of JSON.parse(await fs.readFile(path.join(output,'runtime/sources.json'),'utf8')).components) files.push(item.file);
    for (const file of files) {
      const result = await fetch(origin + '/' + file);
      assert.equal(result.status, 200, file);
      if (/\.m?js$/.test(file)) assert.match(result.headers.get('content-type'), /javascript/);
      assert.ok((await result.text()).length > 0, file);
    }
  });
  await check('preview does not expose source tooling and refuses write requests', async () => {
    assert.equal((await fetch(origin + '/tools/serve.mjs')).status, 404);
    assert.equal((await fetch(origin + '/package.json')).status, 404);
    assert.equal((await fetch(origin + '/sidecars/market-pulse/build.mjs')).status,404);
    assert.equal((await fetch(origin + '/', {method:'POST'})).status, 405);
  });
  await check('a modified runtime fails the integrity check', async () => {
    await fs.appendFile(path.join(output,'runtime/edge.js'), '\n/* changed */');
    await assert.rejects(verifyRuntimes(output), /Sidecar changed: edge/);
  });
  await check('a modified market module fails the independent asset check',async()=>{
    await fs.appendFile(path.join(output,'sidecars/market-pulse/core.mjs'),'\n/* changed */');
    await assert.rejects(verifyMarket(output),/Market Pulse asset changed/);
  });
} finally {
  if (server) await new Promise(resolve => {server.close(resolve);server.closeAllConnections();});
  await fs.rm(temporary, {recursive:true,force:true});
}
console.log(JSON.stringify({passed, standalone:true, externalNetworkUsed:false}));
