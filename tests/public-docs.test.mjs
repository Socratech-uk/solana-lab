import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
// Render-only test: register component classes without constructing a browser DOM.
globalThis.HTMLElement=class {};
const components=new Map();
globalThis.customElements={get:name=>components.get(name),define:(name,component)=>components.set(name,component)};
const {PUBLIC_DOCS_BASE,publicDocumentationUrl,docsView,landing}=await import('../src/showcase-ui.mjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const topics={start:'solana/',sdk:'sdk/solana-client/',dependencies:'solana/composition/',lifecycle:'solana/first-payment/',recipes:'solana/lab/',receipts:'solana/payment-verification/',recovery:'solana/recovery/',security:'help/security/',providers:'solana/providers/',assets:'solana/payment-verification/','asset-payments':'solana/payment-verification/','expired-review':'solana/recovery/'};
test('old docs topics map to the central, public reference',()=>{
 assert.equal(PUBLIC_DOCS_BASE,'https://c-app.uk/developer-docs/');
 for(const topic of globalThis.CappSolanaDocs.topics)assert.ok(Object.hasOwn(topics,topic.id),topic.id);
 for(const [topic,slug] of Object.entries(topics)){
  assert.equal(publicDocumentationUrl(topic),PUBLIC_DOCS_BASE+slug);
  const html=docsView(topic);assert.ok(html.includes(`href="${PUBLIC_DOCS_BASE+slug}"`));
  assert.ok(html.includes('Build beyond the Lab.'));assert.ok(html.includes('requires a connection'));
 }
});
test('unknown/untrusted topic values cannot inject HTML or redirect destinations',()=>{
 for(const topic of ['__proto__','constructor','toString','//evil.example','<img src=x onerror=alert(1)>','../../memory.md']){
  assert.equal(publicDocumentationUrl(topic),PUBLIC_DOCS_BASE+'solana/');
  assert.ok(!docsView(topic).includes(topic));
 }
});
test('handoff retains local context and safe new-tab links',()=>{
 const html=docsView('recovery');
 for(const local of ['#/components','#/receipts','#/service'])assert.ok(html.includes(`href="${local}"`));
 for(const tag of html.matchAll(/<a\b[^>]*>/g)){
  if(tag[0].includes('https://')){assert.ok(tag[0].includes(PUBLIC_DOCS_BASE));assert.ok(tag[0].includes('target="_blank"'));assert.ok(tag[0].includes('rel="noopener noreferrer"'));}
 }
 assert.ok(!/<script|<iframe|onload=|onclick=/.test(html));
});
test('Lab landing and navigation discover the shared documentation',()=>{
 const html=landing([],{preview:true});assert.ok(html.includes(PUBLIC_DOCS_BASE+'solana/'));
 assert.ok(html.includes(`href="${PUBLIC_DOCS_BASE}"`));
 const app=fs.readFileSync(path.join(root,'src/app.mjs'),'utf8');assert.ok(app.includes('cApp developer docs'));
 assert.ok(app.includes('docsView'));
});
test('every fixed public target exists in the shared cApp inventory',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'../capp/docs/public/site.json'),'utf8'));
 const routes=new Set(manifest.pages.map(p=>PUBLIC_DOCS_BASE+(p.slug?p.slug+'/':'')));
 const html=docsView('start')+landing([],{preview:true});
 for(const [topic] of Object.entries(topics))assert.ok(routes.has(publicDocumentationUrl(topic)));
 for(const m of html.matchAll(/href="(https:\/\/c-app\.uk\/developer-docs\/[^"#?]*)"/g))assert.ok(routes.has(m[1]),m[1]);
});
