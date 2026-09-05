import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const collector = new URL('../engine/src/collectors/mississippi-retailer-surfaces.mjs',import.meta.url);
const evidence = JSON.parse(await readFile(new URL('../engine/data/state-expansion-evidence/MS-tupelo2go-2026-07-30.json',import.meta.url),'utf8'));

test('MS historical implementation bytes remain pinned, including policy', async () => {
  const hashes = Object.values(evidence).find(v=>v && typeof v==='object' && v['engine/src/collectors/mississippi-retailer-surfaces.mjs']);
  assert.ok(hashes);
  for (const [name, hash] of Object.entries(hashes)) {
    assert.equal(createHash('sha256').update(await readFile(new URL('../'+name,import.meta.url))).digest('hex'),hash,name);
  }
});
test('MS bundle boundary changes only registry loading; bundled policy and collector retain semantics', async () => {
  const transform = require('./build/ms-registry-boundary.cjs');
  const source = await readFile(collector,'utf8');
  const transformed = transform(source);
  const loader = "const REGISTRY = JSON.parse(readFileSync(new URL('../../data/mississippi-retailer-registry.json', import.meta.url), 'utf8'));";
  assert.equal(transformed.replace("import REGISTRY from '../../data/mississippi-retailer-registry.json' with { type: 'json' };",loader).replace("// MS registry read is bundled statically.","import { readFileSync } from 'node:fs';"),source);
  assert.throws(()=>transform(source.replace(loader,'const REGISTRY = {};')),/boundary changed/);
  const bundled = await build({entryPoints:[fileURLToPath(new URL('../engine/src/mississippi-retailer-policy.mjs',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'exact-ms-boundary',setup(b){b.onLoad({filter:/mississippi-retailer-surfaces\.mjs$/},async args=>({contents:transform(await readFile(args.path,'utf8')),resolveDir:fileURLToPath(new URL('../engine/src/collectors/',import.meta.url)),loader:'js'}));}}]});
  const actual = await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
  const original = await import('../engine/src/mississippi-retailer-policy.mjs');
  const registry = (await import(collector.href)).MISSISSIPPI_RETAILER_SOURCES;
  const {buildMississippiRetailerSignal} = await import('../engine/src/collectors/mississippi-retailer-collector.mjs');
  const store = registry.find(s=>s.permitNumber==='029254');
  const positive = buildMississippiRetailerSignal(store, {
    productId:'product-1',variantId:'option-1',title:'Buffalo Trace Bourbon 750ml',
    productUrl:`${store.baseUrl}/shop/product/buffalo-trace/product-1?option-id=option-1`,
    price:31.99,reportedQuantity:7,sourceAvailabilityVerified:true,pickupOfferVerified:true,premisesVerified:true,
  }, {observedAt:'2026-07-25T20:00:00.000Z',bottle:{id:'bb_test',canonical:'Buffalo Trace Bourbon',tier:'allocated',confidence:.94}});
  assert.equal(original.isMississippiRetailerInventory(positive),true,'positive synthetic fixture must pass original authority');
  const fixtures = [null,{},...registry.flatMap(s=>[{}, {state:'MS',permitNumber:s.permitNumber,sourceLabel:s.sourceLabel}].map(v=>({...v,rawName:'Buffalo Trace Bourbon 750ml',sourceAvailabilityVerified:true})))];
  fixtures.push(positive,{...positive,pickupOfferVerified:false},{...positive,storeId:'wrong-store'},{...positive,rawName:'Buffalo Trace Bourbon 50ml'});
  for (const fixture of fixtures) for (const key of Object.keys(original)) {
    // Both APIs may reject malformed inputs by throwing. Compare that too.
    const run = fn => { try {return {value:fn(fixture)};} catch(e){return {error:e.constructor.name};} };
    assert.deepEqual(run(actual[key]),run(original[key]),key);
  }
  const config = await readFile(new URL('../next.config.ts',import.meta.url),'utf8');
  assert.match(config,/ms-registry-boundary\.cjs/);
});
