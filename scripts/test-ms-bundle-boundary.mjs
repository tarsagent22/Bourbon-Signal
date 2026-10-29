import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { normalizeHistoricalImplementationBytes, libraryAlertPolicyBoundary, originalLibraryAlertPolicyBoundary, arizonaMetroTierImport, arizonaMetroTierBoundary, originalArizonaMetroTierBoundary, groceryExpansionTierImport, centralCityHiveTierImport, reviewedExpansionTierBoundary, newYorkVariantSemanticsBoundary, originalNewYorkVariantSemanticsBoundary } from '../engine/src/verification/historical-implementation.mjs';
const require = createRequire(import.meta.url);
const collector = new URL('../engine/src/collectors/mississippi-retailer-surfaces.mjs',import.meta.url);
const evidence = JSON.parse(await readFile(new URL('../engine/data/state-expansion-evidence/MS-tupelo2go-2026-07-30.json',import.meta.url),'utf8'));
const sharedBaseline = JSON.parse(await readFile(new URL('../engine/data/source-evidence/metro-depth-20261022/shared-metadata-baseline.json',import.meta.url),'utf8'));
const sharedFiles = new Set(['engine/src/state-sources.mjs', 'src/config/state-lifecycle.json', 'src/config/stateLifecycle.ts']);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test('MS historical implementation bytes remain pinned, including policy', async () => {
  const hashes = Object.values(evidence).find(v=>v && typeof v==='object' && v['engine/src/collectors/mississippi-retailer-surfaces.mjs']);
  assert.ok(hashes);
  for (const [name, hash] of Object.entries(hashes)) {
    // Only reviewed NY/CO/AZ metadata, area expectations, the verifier's hooks and
    // the exact FL/IN proof additions and shared alert suppression may differ.
    // Original digests pin all other bytes.
    assert.equal(digest(normalizeHistoricalImplementationBytes(name, await readFile(new URL('../'+name,import.meta.url)))),hash,name);
  }
});

test('FL and IN proof normalization reverse exact additions while preserving the original MS anchor', async () => {
  const name = 'engine/src/operational-report.mjs';
  const current = await readFile(new URL('../' + name, import.meta.url), 'utf8');
  const originalHash = evidence.implementationFilesSha256[name];
  const originalBoundary = '    } : undefined\n  };\n}\n\nfunction signalSort(a, b) {\n';
  const indianaAddition = "    ...(sig.state === 'IN' ? { sourceProductBinding: sig.sourceProductBinding || null } : {}),\n";
  const addition = `    } : undefined,
    ...(signal.state === 'FL' ? {
      optionValueId: signal.optionValueId ?? signal.raw?.optionValueId ?? null,
      childSku: signal.childSku ?? signal.raw?.childSku ?? null,
      storeNumber: signal.storeNumber ?? signal.raw?.storeNumber ?? null,
      controlStoreId: signal.controlStoreId ?? signal.raw?.controlStoreId ?? null,
      reportedQuantity: signal.reportedQuantity ?? signal.raw?.reportedQuantity ?? null,
      variantAvailable: signal.variantAvailable ?? signal.raw?.variantAvailable ?? signal.raw?.variant?.available ?? null,
      sourceInventorySemantics: signal.sourceInventorySemantics ?? signal.inventorySemantics ?? null,
      raw: signal.raw ? Object.fromEntries([
        'chain', 'merchantId', 'productId', 'variantId', 'optionValueId', 'childSku',
        'storeNumber', 'controlStoreId', 'reportedQuantity', 'variantAvailable',
        'officialAddress', 'officialCity', 'officialZip', 'officialLatitude', 'officialLongitude',
      ].filter((field) => Object.hasOwn(signal.raw, field)).map((field) => [field, signal.raw[field]])) : undefined,
    } : {}),
  };
}

function signalSort(a, b) {
`;
  assert.equal(current.split(addition).length - 1, 1);
  assert.equal(current.split(indianaAddition).length - 1, 1);
  const normalized = normalizeHistoricalImplementationBytes(name, Buffer.from(current));
  assert.equal(digest(normalized), originalHash);
  assert.equal(normalized.toString().split(originalBoundary).length - 1, 1);
  assert.equal(normalized.toString(), current.replace(addition, originalBoundary).replace(indianaAddition, '')
    .replace(libraryAlertPolicyBoundary, originalLibraryAlertPolicyBoundary)
    .replace(groceryExpansionTierImport, '').replace(centralCityHiveTierImport, '')
    .replace(reviewedExpansionTierBoundary, arizonaMetroTierBoundary)
    .replace(newYorkVariantSemanticsBoundary, originalNewYorkVariantSemanticsBoundary)
    .replace(arizonaMetroTierImport, '').replace(arizonaMetroTierBoundary, originalArizonaMetroTierBoundary));
  for (const altered of [
    current.replace(addition, originalBoundary),
    current + '\n' + addition,
    current.replace(addition, addition.replace("signal.state === 'FL'", "signal.state === 'MS'")),
    current.replace(addition, addition.replace("'officialLatitude'", "'unreviewedProof'")),
    current.replace(addition, addition.replace('Object.hasOwn(signal.raw, field)', 'true')),
    current.replace(addition, addition.replace('function signalSort(a, b)', 'function signalSort(a, ignored)')),
    current.replace(indianaAddition, ''),
    current.replace(arizonaMetroTierImport, ''),
    current.replace(reviewedExpansionTierBoundary, reviewedExpansionTierBoundary.replace("signal.state === 'AZ'", "signal.state === 'MS'")),
    current.replace(reviewedExpansionTierBoundary, reviewedExpansionTierBoundary.replace("signal.state === 'AZ'", 'true')),
    current.replace(groceryExpansionTierImport, ''),
    current.replace(centralCityHiveTierImport, ''),
    current + '\n' + groceryExpansionTierImport,
    current + '\n' + centralCityHiveTierImport,
    current.replace(reviewedExpansionTierBoundary, arizonaMetroTierBoundary),
    current + '\n' + reviewedExpansionTierBoundary,
    current.replace(reviewedExpansionTierBoundary, reviewedExpansionTierBoundary.replace('?? centralCityHiveLibraryTier(signal,bible)', '?? true')),
    current.replace(reviewedExpansionTierBoundary, reviewedExpansionTierBoundary.replace('groceryExpansionLibraryTier(signal,bible)', "groceryExpansionLibraryTier({...signal,state:'MS'},bible)")),
    current.replace(newYorkVariantSemanticsBoundary, originalNewYorkVariantSemanticsBoundary),
    current + '\n' + newYorkVariantSemanticsBoundary,
    current.replace(newYorkVariantSemanticsBoundary, newYorkVariantSemanticsBoundary.replace("signal.state === 'NY'", "signal.state === 'MS'")),
    current.replace(newYorkVariantSemanticsBoundary, newYorkVariantSemanticsBoundary.replace("signal.sourceProductBinding?.productIdentityMode === 'shopify_variant_pickup'", 'true')),
    current + '\n' + indianaAddition,
    current.replace(indianaAddition, indianaAddition.replace("sig.state === 'IN'", "sig.state === 'MS'")),
    current.replace(indianaAddition, indianaAddition.replace('sig.sourceProductBinding || null', 'sig.raw || null')),
    current.replace(libraryAlertPolicyBoundary, originalLibraryAlertPolicyBoundary),
    current + '\n' + libraryAlertPolicyBoundary,
    current.replace(libraryAlertPolicyBoundary, libraryAlertPolicyBoundary.replace('libraryAlertEligible === false', 'libraryAlertEligible !== false')),
    current.replace(libraryAlertPolicyBoundary, libraryAlertPolicyBoundary.replace('canAlertAsInventory = false', 'canAlertAsInventory = true')),
  ]) {
    assert.notEqual(altered, current);
    assert.throws(() => normalizeHistoricalImplementationBytes(name, Buffer.from(altered)), /exact historical verification hook/);
  }
  for (const altered of [
    '// changed top level\n' + current,
    current.replace("raw: signal.state === 'MS'", "raw: signal.state === 'AL'"),
    current.replace('const policy = confidenceForSignal(signal);', 'const policy = {};'),
  ]) {
    assert.notEqual(altered, current);
    assert.notEqual(digest(normalizeHistoricalImplementationBytes(name, Buffer.from(altered))), originalHash);
  }
});
test('NY/CO metadata allowance cannot hide changes outside either exact state block', async () => {
  for (const name of sharedFiles) {
    const current = await readFile(new URL('../'+name,import.meta.url));
    const normalized = normalizeHistoricalImplementationBytes(name, current);
    const originalHash = evidence.implementationFilesSha256[name];
    assert.equal(digest(normalized), originalHash);
    for (const state of ['MS', 'AL']) {
      const marker = name.endsWith('.mjs') ? `id: '${state}'` : `"${state}": {`;
      const changed = current.toString().replace(marker, `${marker} /* unreviewed */`);
      assert.notEqual(changed, current.toString());
      assert.notEqual(digest(normalizeHistoricalImplementationBytes(name, Buffer.from(changed))), originalHash, `${name}: ${state} remains pinned`);
    }
    assert.notEqual(digest(normalizeHistoricalImplementationBytes(name, Buffer.concat([Buffer.from('// changed top level\n'), current]))), originalHash);
    const ny = name.endsWith('.mjs') ? "id: 'NY'" : '"NY": {';
    assert.throws(() => normalizeHistoricalImplementationBytes(name, Buffer.from(current.toString().replace(ny, 'missing-NY-boundary'))), /exact metadata boundary/);
    assert.throws(() => normalizeHistoricalImplementationBytes(name, Buffer.from(current.toString() + '\n' + sharedBaseline.files[name].NY)), /exact metadata boundary/);
  }
});

test('AZ metadata reversal accepts only its exact reviewed block and keeps original MS digests', async () => {
  const az = JSON.parse(await readFile(new URL('../engine/data/source-evidence/arizona-expansion-20261022/shared-metadata-baseline.json', import.meta.url), 'utf8'));
  for (const name of sharedFiles) {
    const current = await readFile(new URL('../' + name, import.meta.url), 'utf8');
    const { original, reviewed } = az.files[name];
    assert.notEqual(original, reviewed);
    assert.equal(digest(normalizeHistoricalImplementationBytes(name, Buffer.from(current))), evidence.implementationFilesSha256[name]);
    for (const changed of [
      current.replace(reviewed, original),
      current.replace(reviewed, reviewed.replace('Arizona', 'Unreviewed geography')),
      current + '\n' + reviewed,
    ]) assert.throws(() => normalizeHistoricalImplementationBytes(name, Buffer.from(changed)), /AZ reviewed metadata/);
    const outside = current.replace(name.endsWith('.mjs') ? "id: 'VA'" : '"VA": {', name.endsWith('.mjs') ? "id: 'VA_UNREVIEWED'" : '"VA_UNREVIEWED": {');
    assert.notEqual(digest(normalizeHistoricalImplementationBytes(name, Buffer.from(outside))), evidence.implementationFilesSha256[name]);
  }
});

test('nationwide reversal accepts only exact reviewed CA metadata and inactive central source wiring', async () => {
  const baseline = JSON.parse(await readFile(new URL('../engine/data/source-evidence/nationwide-expansion-20261029/shared-metadata-baseline.json', import.meta.url), 'utf8'));
  for (const name of sharedFiles) {
    const current = await readFile(new URL('../' + name, import.meta.url), 'utf8');
    const entry = baseline.files[name];
    const reversals = name.endsWith('.mjs') ? [entry.import, entry.registration] : [entry];
    assert.equal(digest(normalizeHistoricalImplementationBytes(name, Buffer.from(current))), evidence.implementationFilesSha256[name]);
    for (const { reviewed, original } of reversals) {
      assert.notEqual(reviewed, original);
      const changed = reviewed.replace(name.endsWith('.mjs') ? 'CENTRAL_CITYHIVE_STATE_CONFIGS' : 'California', 'UNREVIEWED_METADATA');
      assert.notEqual(changed, reviewed);
      for (const mutation of [current.replace(reviewed, original), current.replace(reviewed, changed), current + '\n' + reviewed]) {
        assert.throws(() => normalizeHistoricalImplementationBytes(name, Buffer.from(mutation)), /exact historical verification hook/);
      }
    }
    if (!name.endsWith('.mjs')) {
      const activeMutation = current.replace(entry.reviewed, entry.reviewed.replace('"publicStatus": "active"', '"publicStatus": "research_only"'));
      assert.notEqual(activeMutation, current);
      assert.throws(() => normalizeHistoricalImplementationBytes(name, Buffer.from(activeMutation)), /CA reviewed metadata/);
    }
    const outside = current.replace(name.endsWith('.mjs') ? "id: 'MS'" : '"MS": {', name.endsWith('.mjs') ? "id: 'MS_UNREVIEWED'" : '"MS_UNREVIEWED": {');
    assert.notEqual(digest(normalizeHistoricalImplementationBytes(name, Buffer.from(outside))), evidence.implementationFilesSha256[name]);
  }
});

test('MS verifier allowance preserves every byte outside its two exact helper hooks', async () => {
  const name = 'engine/src/verify-ms.mjs';
  const current = await readFile(new URL('../' + name, import.meta.url), 'utf8');
  const originalHash = evidence.implementationFilesSha256[name];
  assert.equal(digest(normalizeHistoricalImplementationBytes(name, Buffer.from(current))), originalHash);
  const importHook = "import { normalizeHistoricalImplementationBytes } from './verification/historical-implementation.mjs';\n";
  const readHook = 'normalizeHistoricalImplementationBytes(file, readFileSync(path.join(repositoryRoot, file)))';
  for (const hook of [importHook, readHook]) {
    assert.ok(current.includes(hook));
    assert.throws(() => normalizeHistoricalImplementationBytes(name, Buffer.from(current.replace(hook, 'changed-hook'))), /exact historical verification hook/);
    assert.throws(() => normalizeHistoricalImplementationBytes(name, Buffer.from(current + '\n' + hook)), /exact historical verification hook/);
  }
  for (const changed of [
    current.replace('for (const [file, expected]', 'for (const [file, unchecked]'),
    current.replace('assert.equal(implementationDigest, extensionEvidence.implementationDigest);', 'assert.ok(true);'),
    current.replace("lifecycle.inventoryAlertable, false", "lifecycle.inventoryAlertable, true"),
    '// changed top level\n' + current,
  ]) {
    assert.notEqual(changed, current);
    assert.notEqual(digest(normalizeHistoricalImplementationBytes(name, Buffer.from(changed))), originalHash);
  }
  const unknownFile = Buffer.from('unregistered file bytes');
  assert.equal(normalizeHistoricalImplementationBytes('engine/src/mississippi-retailer-policy.mjs', unknownFile), unknownFile);
});

test('coverage test allowance preserves MS assertions and every other test byte', async () => {
  const name = 'scripts/test-coverage-contract.mts';
  const current = await readFile(new URL('../' + name, import.meta.url), 'utf8');
  const originalHash = evidence.implementationFilesSha256[name];
  assert.equal(digest(normalizeHistoricalImplementationBytes(name, Buffer.from(current))), originalHash);
  for (const line of [
    '  ["NY", ["Buffalo", "Hudson Valley", "Lake George", "Nassau County", "New York City", "Rochester Metro", "Suffolk County"]],\n',
    '  ["CO", ["Boulder County", "Colorado Springs", "Denver Metro"]],\n',
  ]) {
    assert.ok(current.includes(line));
    assert.throws(() => normalizeHistoricalImplementationBytes(name, Buffer.from(current.replace(line, 'changed-area-expectation\n'))), /exact historical verification hook/);
    assert.throws(() => normalizeHistoricalImplementationBytes(name, Buffer.from(current + '\n' + line)), /exact historical verification hook/);
  }
  for (const changed of [
    current.replace('assert.equal(mississippi.freshness.currentInventoryStores, 0,', 'assert.equal(mississippi.freshness.currentInventoryStores, 1,'),
    current.replace('assert.equal(mississippiKnownStoresPayload.stores?.length, 690);', 'assert.equal(mississippiKnownStoresPayload.stores?.length, 1);'),
    current.replace('assert.deepEqual(metro.areas, areas);', 'assert.ok(true);'),
    '// changed top level\n' + current,
  ]) {
    assert.notEqual(changed, current);
    assert.notEqual(digest(normalizeHistoricalImplementationBytes(name, Buffer.from(changed))), originalHash);
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
