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
const sharedBaseline = JSON.parse(await readFile(new URL('../engine/data/source-evidence/metro-depth-20261022/shared-metadata-baseline.json',import.meta.url),'utf8'));
const sharedFiles = new Set(['engine/src/state-sources.mjs', 'src/config/state-lifecycle.json', 'src/config/stateLifecycle.ts']);
function normalizeReviewedMetroMetadata(name, bytes) {
  if (!sharedFiles.has(name)) return bytes;
  assert.equal(sharedBaseline.contractVersion, 'bourbon-signal/ny-co-shared-metadata-baseline@1');
  let text = bytes.toString('utf8');
  for (const state of ['NY', 'CO']) {
    const pattern = name.endsWith('.mjs')
      ? new RegExp(`^  \\{\\n    id: '${state}',[\\s\\S]*?^  \\},\\n`, 'gmu')
      : new RegExp(`^    "${state}": \\{[\\s\\S]*?^    \\}(?:,)?`, 'gmu');
    assert.equal([...text.matchAll(pattern)].length, 1, `${name}: ${state} must have one exact metadata boundary`);
    const original = sharedBaseline.files[name]?.[state];
    assert.equal(typeof original, 'string');
    text = text.replace(pattern, () => original);
  }
  return Buffer.from(text);
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test('MS historical implementation bytes remain pinned, including policy', async () => {
  const hashes = Object.values(evidence).find(v=>v && typeof v==='object' && v['engine/src/collectors/mississippi-retailer-surfaces.mjs']);
  assert.ok(hashes);
  for (const [name, hash] of Object.entries(hashes)) {
    // Only reviewed NY/CO metadata may differ. The unchanged historical full-file
    // digest still pins Mississippi, every other state, imports and shared logic.
    assert.equal(digest(normalizeReviewedMetroMetadata(name, await readFile(new URL('../'+name,import.meta.url)))),hash,name);
  }
});
test('NY/CO metadata allowance cannot hide changes outside either exact state block', async () => {
  for (const name of sharedFiles) {
    const current = await readFile(new URL('../'+name,import.meta.url));
    const normalized = normalizeReviewedMetroMetadata(name, current);
    const originalHash = evidence.implementationFilesSha256[name];
    assert.equal(digest(normalized), originalHash);
    for (const state of ['MS', 'AL']) {
      const marker = name.endsWith('.mjs') ? `id: '${state}'` : `"${state}": {`;
      const changed = current.toString().replace(marker, `${marker} /* unreviewed */`);
      assert.notEqual(changed, current.toString());
      assert.notEqual(digest(normalizeReviewedMetroMetadata(name, Buffer.from(changed))), originalHash, `${name}: ${state} remains pinned`);
    }
    assert.notEqual(digest(normalizeReviewedMetroMetadata(name, Buffer.concat([Buffer.from('// changed top level\n'), current]))), originalHash);
    const ny = name.endsWith('.mjs') ? "id: 'NY'" : '"NY": {';
    assert.throws(() => normalizeReviewedMetroMetadata(name, Buffer.from(current.toString().replace(ny, 'missing-NY-boundary'))), /exact metadata boundary/);
    assert.throws(() => normalizeReviewedMetroMetadata(name, Buffer.from(current.toString() + '\n' + sharedBaseline.files[name].NY)), /exact metadata boundary/);
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
