import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile as readRawFile } from 'node:fs/promises';
import {normalizeNineStateAdmissionMetadata} from '../engine/src/verification/nine-state-admission-metadata.mjs';
// These existing mutation cases exercise their original historical stage.
// The separate nine-state suite covers actual admitted/renewed metadata first.
async function readFile(file,encoding){const name=String(file).replaceAll('\\','/');for(const target of ['src/config/state-lifecycle.json','src/config/stateLifecycle.ts'])if(name.endsWith(target)){const bytes=normalizeNineStateAdmissionMetadata(target,await readRawFile(file));return encoding?bytes.toString(encoding):bytes;}return readRawFile(file,encoding);}
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { reverseLouisianaAlaskaHistoricalAdditions, normalizeHistoricalImplementationBytes, newEnglandTypedSemanticsBoundary, libraryAlertPolicyBoundary, originalLibraryAlertPolicyBoundary, arizonaMetroTierImport, arizonaMetroTierBoundary, originalArizonaMetroTierBoundary, groceryExpansionTierImport, groceryExpansionProofImport, groceryExpansionSemanticsBoundary, westernGroceryAlertBoundary, originalWesternGroceryAlertBoundary, centralCityHiveTierImport, texasShopifyPickupTierImport, reviewedExpansionTierBoundary, newYorkVariantSemanticsBoundary, originalNewYorkVariantSemanticsBoundary, centralProductionOnSiteImport, centralProductionOnSiteBoundary } from '../engine/src/verification/historical-implementation.mjs';
const require = createRequire(import.meta.url);
const collector = new URL('../engine/src/collectors/mississippi-retailer-surfaces.mjs',import.meta.url);
const evidence = JSON.parse(await readFile(new URL('../engine/data/state-expansion-evidence/MS-tupelo2go-2026-07-30.json',import.meta.url),'utf8'));
const sharedBaseline = JSON.parse(await readFile(new URL('../engine/data/source-evidence/metro-depth-20261022/shared-metadata-baseline.json',import.meta.url),'utf8'));
const sharedFiles = new Set(['engine/src/state-sources.mjs', 'src/config/state-lifecycle.json', 'src/config/stateLifecycle.ts']);
const actualAdmission = JSON.parse(await readFile(new URL('../engine/data/source-evidence/four-state-admission-20261029/shared-metadata-baseline.json', import.meta.url), 'utf8'));
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

test('measured forecast reversal accepts only the complete reviewed map and preserves original MS hashes', async () => {
  const baseline = JSON.parse(await readFile(new URL('../engine/data/source-evidence/refresh-capacity-20261029/forecast-metadata-ms-boundary.json', import.meta.url), 'utf8'));
  assert.equal(baseline.contractVersion, 'bourbon-signal/measured-runtime-forecast-ms-boundary@1');
  for (const [name, { reviewed, original }] of Object.entries(baseline.files)) {
    const current = await readFile(new URL('../' + name, import.meta.url), 'utf8');
    assert.equal(digest(normalizeHistoricalImplementationBytes(name, Buffer.from(current))), evidence.implementationFilesSha256[name]);
    for (const mutation of [current.replace(reviewed, original), current.replace(reviewed, ''), current + '\n' + reviewed,
      ...reviewed.split('\n').slice(1, -1).map(line => current.replace(line, line.replace(/\d+/, value => String(Number(value) + 1)))),
    ]) assert.throws(() => normalizeHistoricalImplementationBytes(name, Buffer.from(mutation)), /measured runtime forecast .*exact historical verification hook/);
    const outside = current.replace('"refreshSafetyMarginMs": 300000', '"refreshSafetyMarginMs": 0');
    assert.notEqual(digest(normalizeHistoricalImplementationBytes(name, Buffer.from(outside))), evidence.implementationFilesSha256[name], 'the map exception cannot hide a reduced refresh reserve');
  }
});

test('actual four-state admission reverses only the exact active list and issued-proof false-alert entries', async () => {
  assert.equal(actualAdmission.contractVersion, 'bourbon-signal/four-state-actual-admission-ms-boundary@1');
  for (const [name, entries] of Object.entries(actualAdmission.files)) {
    const current = await readFile(new URL('../' + name, import.meta.url), 'utf8');
    assert.equal(digest(normalizeHistoricalImplementationBytes(name, Buffer.from(current))), evidence.implementationFilesSha256[name]);
    for (const [key, { reviewed, original }] of Object.entries(entries)) {
      const changed = key === 'activeStates' ? reviewed.replace('"WA"', '"NJ"')
        : reviewed.replace('"inventoryAlertable": false', '"inventoryAlertable": true');
      for (const mutation of [current.replace(reviewed, original), current.replace(reviewed, changed), current + '\n' + reviewed]) {
        assert.throws(() => normalizeHistoricalImplementationBytes(name, Buffer.from(mutation)), /four-state admission .*exact historical verification hook/);
      }
      if (key !== 'activeStates') for (const changed of [
        reviewed.replace('"watchAlertable": false', '"watchAlertable": true'),
        reviewed.replace('"canaryRuns": 2', '"canaryRuns": 0'),
        reviewed.replace('"publicStatus": "active"', '"publicStatus": "research_only"'),
        reviewed.replace('"artifactDigest": "', '"artifactDigest": "changed'),
      ]) assert.throws(() => normalizeHistoricalImplementationBytes(name, Buffer.from(current.replace(reviewed, changed))), /four-state admission .*exact historical verification hook/);
    }
    const outside = current.replace('"customerLabel": "Mississippi"', '"customerLabel": "Unreviewed Mississippi"');
    assert.notEqual(digest(normalizeHistoricalImplementationBytes(name, Buffer.from(outside))), evidence.implementationFilesSha256[name], 'other-state bytes remain pinned');
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
  assert.equal(normalized.toString(), reverseLouisianaAlaskaHistoricalAdditions(name, current).replace(addition, originalBoundary).replace(indianaAddition, '')
    .replace(libraryAlertPolicyBoundary, originalLibraryAlertPolicyBoundary)
    .replace(groceryExpansionProofImport, groceryExpansionTierImport)
    .replace(groceryExpansionSemanticsBoundary, newYorkVariantSemanticsBoundary)
    .replace(westernGroceryAlertBoundary, originalWesternGroceryAlertBoundary)
    .replace(groceryExpansionTierImport, '').replace(centralCityHiveTierImport, '').replace(texasShopifyPickupTierImport, '')
    .replace("import {isNjMiProductionOnSiteSignal} from './nj-mi-research-policy.mjs';\n", '').replace("    ...(isNjMiProductionOnSiteSignal(signal)?{\n      canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,\n      eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,\n      eligibleForDelivery:false,deliveryEligible:false,eligibleForEmail:false,eligibleForSms:false,\n    }:{}),\n", '')
    .replace("import {isNewEnglandProductionOnSiteSignal,isNewEnglandInventory} from './new-england-policy.mjs';\n",'').replace("    ...(isNewEnglandProductionOnSiteSignal(signal)?{\n      canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,\n      eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,\n      eligibleForDelivery:false,deliveryEligible:false,eligibleForEmail:false,eligibleForSms:false,\n    }:{}),\n",'')
    .replace("import {newEnglandLibraryTier} from './collectors/new-england-production-inventory.mjs';\n",'').replace("    ...(newEnglandLibraryTier(signal,bible)!==null?{tier:newEnglandLibraryTier(signal,bible)}:{}),\n",'')
    .replace(newEnglandTypedSemanticsBoundary, '')
    .replace(centralProductionOnSiteImport, '').replace(centralProductionOnSiteBoundary, '')
    .replace(reviewedExpansionTierBoundary, arizonaMetroTierBoundary)
    .replace(newYorkVariantSemanticsBoundary, originalNewYorkVariantSemanticsBoundary)
    .replace(arizonaMetroTierImport, '').replace(arizonaMetroTierBoundary, originalArizonaMetroTierBoundary)
    .replace("    raw: signal.state === 'SC' && signal.sourceChain === 'liquor-library' ? { chain: signal.raw?.chain, square: signal.raw?.square } : signal.state === 'MS' ? {\n", "    raw: signal.state === 'MS' ? {\n"));
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
    current.replace(groceryExpansionProofImport, ''),
    current.replace(centralCityHiveTierImport, ''),
    current.replace(texasShopifyPickupTierImport, ''),
    current.replace(centralProductionOnSiteImport, ''),
    current + '\n' + centralProductionOnSiteImport,
    current.replace(centralProductionOnSiteBoundary, ''),
    current + '\n' + centralProductionOnSiteBoundary,
    current.replace(centralProductionOnSiteBoundary, centralProductionOnSiteBoundary.replace('canAlertAsInventory:false', 'canAlertAsInventory:true')),
    current.replace(centralProductionOnSiteBoundary, centralProductionOnSiteBoundary.replace('isCentralCityHiveProductionOnSiteSignal(signal)', "isCentralCityHiveProductionOnSiteSignal({...signal,state:'MS'})")),
    current.replace(texasShopifyPickupTierImport, texasShopifyPickupTierImport.replace('./collectors/texas-shopify-pickup.mjs', './collectors/unreviewed-pickup.mjs')),
    current + '\n' + groceryExpansionTierImport,
    current + '\n' + centralCityHiveTierImport,
    current + '\n' + texasShopifyPickupTierImport,
    current.replace(reviewedExpansionTierBoundary, arizonaMetroTierBoundary),
    current + '\n' + reviewedExpansionTierBoundary,
    current.replace(reviewedExpansionTierBoundary, reviewedExpansionTierBoundary.replace('?? centralCityHiveLibraryTier(signal,bible)', '?? true')),
    current.replace(reviewedExpansionTierBoundary, reviewedExpansionTierBoundary.replace('groceryExpansionLibraryTier(signal,bible)', "groceryExpansionLibraryTier({...signal,state:'MS'},bible)")),
    current.replace(reviewedExpansionTierBoundary, reviewedExpansionTierBoundary.replace('texasShopifyPickupLibraryTier(signal,bible) ?? ', '')),
    current.replace(reviewedExpansionTierBoundary, reviewedExpansionTierBoundary.replace('texasShopifyPickupLibraryTier(signal,bible)', "texasShopifyPickupLibraryTier({...signal,state:'MS'},bible)")),
    current.replace(reviewedExpansionTierBoundary, reviewedExpansionTierBoundary.replace('texasShopifyPickupLibraryTier(signal,bible)', 'true')),
    current.replace(groceryExpansionSemanticsBoundary, newYorkVariantSemanticsBoundary),
    current + '\n' + newYorkVariantSemanticsBoundary,
    current.replace(groceryExpansionSemanticsBoundary, groceryExpansionSemanticsBoundary.replace("signal.state === 'NY'", "signal.state === 'MS'")),
    current.replace(groceryExpansionSemanticsBoundary, groceryExpansionSemanticsBoundary.replace("signal.sourceProductBinding?.productIdentityMode === 'shopify_variant_pickup'", 'true')),
    current + '\n' + indianaAddition,
    current.replace(indianaAddition, indianaAddition.replace("sig.state === 'IN'", "sig.state === 'MS'")),
    current.replace(indianaAddition, indianaAddition.replace('sig.sourceProductBinding || null', 'sig.raw || null')),
    current.replace(libraryAlertPolicyBoundary, originalLibraryAlertPolicyBoundary),
    current + '\n' + libraryAlertPolicyBoundary,
    current.replace(libraryAlertPolicyBoundary, libraryAlertPolicyBoundary.replace('libraryAlertEligible === false', 'libraryAlertEligible !== false')),
    current.replace(libraryAlertPolicyBoundary, libraryAlertPolicyBoundary.replace('canAlertAsInventory = false', 'canAlertAsInventory = true')),
    current.replace(" : signal.state === 'MS' ? {", " : signal.state === 'AL' ? {"),
  ]) {
    assert.notEqual(altered, current);
    assert.throws(() => normalizeHistoricalImplementationBytes(name, Buffer.from(altered)), /exact historical verification hook/);
  }
  for (const altered of [
    '// changed top level\n' + current,
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

test('WA/NM metadata reversal requires every literal inactive registration and budget boundary', async () => {
  const baseline = JSON.parse(await readFile(new URL('../engine/data/source-evidence/western-grocery-production-20261029/shared-metadata-baseline.json', import.meta.url), 'utf8'));
  assert.equal(baseline.baseCommit, '6deae85aaa1b78900cb5eafab03570613c95a8d7');
  for (const name of sharedFiles) {
    const current = await readFile(new URL('../' + name, import.meta.url), 'utf8');
    const originalHash = evidence.implementationFilesSha256[name];
    assert.equal(digest(normalizeHistoricalImplementationBytes(name, Buffer.from(current))), originalHash);
    for (const [key, { reviewed: priorReviewed, original }] of Object.entries(baseline.files[name])) {
      const reviewed = actualAdmission.files[name]?.[key]?.reviewed || (key === 'budgets' ? priorReviewed.replace('"WA": 720000', '"WA": 360000').replace('"NM": 300000\n', '"NM": 120000,\n') : priorReviewed);
      assert.equal(current.split(reviewed).length - 1, 1, `${name}: ${key}`);
      const changed = name.endsWith('.mjs')
        ? reviewed.replace('WESTERN_GROCERY_PRODUCTION_', 'UNREVIEWED_GROCERY_')
        : key === 'budgets' ? reviewed.replace('360000', '600000')
          : reviewed.replace('"publicStatus": "active"', '"publicStatus": "research_only"');
      assert.notEqual(changed, reviewed);
      for (const mutation of [current.replace(reviewed, original), current.replace(reviewed, changed), current + '\n' + reviewed]) {
        assert.throws(() => normalizeHistoricalImplementationBytes(name, Buffer.from(mutation)), /(?:four-state admission|WA\/NM reviewed|Central inactive|measured runtime forecast|LA\/AK inactive) .*exact historical verification hook/);
      }
      if (!name.endsWith('.mjs') && ['WA', 'NM'].includes(key)) {
        for (const mutation of [
          reviewed.replace('"inventoryAlertable": false', '"inventoryAlertable": true'),
          reviewed.replace('"watchAlertable": false', '"watchAlertable": true'),
          reviewed.replace('"refinementLevel": "store"', '"refinementLevel": "state"'),
        ]) assert.throws(() => normalizeHistoricalImplementationBytes(name, Buffer.from(current.replace(reviewed, mutation))), /(?:four-state admission|WA\/NM reviewed|Central inactive|LA\/AK inactive) .*exact historical verification hook/);
      }
    }
    const outside = current.replace(name.endsWith('.mjs') ? "id: 'MS'" : '"MS": {', name.endsWith('.mjs') ? "id: 'MS_CHANGED'" : '"MS_CHANGED": {');
    assert.notEqual(digest(normalizeHistoricalImplementationBytes(name, Buffer.from(outside))), originalHash, 'MS bytes retain the original anchor');
  }
});

test('WI/OK inactive metadata permits only exact store-level false-alert entries and watchdog budgets',async()=>{
  const baseline=JSON.parse(await readFile(new URL('../engine/data/source-evidence/central-cityhive-production-20261029/shared-metadata-baseline.json',import.meta.url),'utf8'));
  for(const[name,entries]of Object.entries(baseline.files)){
    const current=await readFile(new URL('../'+name,import.meta.url),'utf8');
    assert.equal(digest(normalizeHistoricalImplementationBytes(name,Buffer.from(current))),evidence.implementationFilesSha256[name]);
    for(const[key,{reviewed:priorReviewed,original}]of Object.entries(entries)){
      const reviewed=actualAdmission.files[name]?.[key]?.reviewed || (key==='budgets'?priorReviewed.replace('"WI": 150000','"WI": 30000').replace('"OK": 240000','"OK": 30000'):priorReviewed);
      assert.equal(current.split(reviewed).length-1,1);
      const altered=key==='budgets'?reviewed.replace('30000','90000'):reviewed.replace('"publicStatus": "active"','"publicStatus": "research_only"');
      for(const mutation of [current.replace(reviewed,original),current+'\n'+reviewed,current.replace(reviewed,altered)])
        assert.throws(()=>normalizeHistoricalImplementationBytes(name,Buffer.from(mutation)),/(?:four-state admission|Central inactive|measured runtime forecast) .*exact historical verification hook/);
      if(key!=='budgets')for(const replacement of [['"inventoryAlertable": false','"inventoryAlertable": true'],['"watchAlertable": false','"watchAlertable": true'],['"refinementLevel": "store"','"refinementLevel": "state"']])
        assert.throws(()=>normalizeHistoricalImplementationBytes(name,Buffer.from(current.replace(reviewed,reviewed.replace(...replacement)))) ,/(?:four-state admission|Central inactive) .*exact historical verification hook/);
    }
  }
});

test('NJ/MI historical reversal rejects activation, altered registration and notification-enabling mutations',async()=>{
  const baseline=JSON.parse(await readFile(new URL('../engine/data/source-evidence/nj-mi-production-20261029/shared-metadata-baseline.json',import.meta.url),'utf8'));
  for(const[name,entries]of Object.entries(baseline.files)){
    const current=await readFile(new URL('../'+name,import.meta.url),'utf8');
    assert.equal(digest(normalizeHistoricalImplementationBytes(name,Buffer.from(current))),evidence.implementationFilesSha256[name]);
    for(const[key,{reviewed,original}]of Object.entries(entries)){
      assert.equal(current.split(reviewed).length-1,1);
      const changed=name.endsWith('.mjs')?reviewed.replace('NJ_MI','UNREVIEWED')
        :key==='budgets'?reviewed.replace('120000','90000'):reviewed.replace('"publicStatus": "research_only"','"publicStatus": "active"');
      assert.notEqual(changed,reviewed);
      for(const mutation of[current.replace(reviewed,original),current.replace(reviewed,changed),current+'\n'+reviewed]){
        assert.throws(()=>normalizeHistoricalImplementationBytes(name,Buffer.from(mutation)),/(?:NJ\/MI reviewed|measured runtime forecast) .*exact historical verification hook/,key);
      }
    }
  }
  const name='engine/src/operational-report.mjs',current=await readFile(new URL('../'+name,import.meta.url),'utf8');
  for(const replacement of ['true','signal.canAlertAsInventory']){
    const altered=current.replace('...(isNjMiProductionOnSiteSignal(signal)?{\n      canAlertAsInventory:false','...(isNjMiProductionOnSiteSignal(signal)?{\n      canAlertAsInventory:'+replacement);
    assert.throws(()=>normalizeHistoricalImplementationBytes(name,Buffer.from(altered)),/NJ\/MI false-alert on-site proof/);
  }
});

test('New England reverses only its exact inactive source registration and source-checked tier/false-alert hooks',async()=>{
  const baseline=JSON.parse(await readFile(new URL('../engine/data/source-evidence/new-england-production-20261029/shared-metadata-baseline.json',import.meta.url),'utf8'));
  for(const[name,entries]of Object.entries(baseline.files)){
    const current=await readFile(new URL('../'+name,import.meta.url),'utf8');
    assert.equal(digest(normalizeHistoricalImplementationBytes(name,Buffer.from(current))),evidence.implementationFilesSha256[name]);
    for(const {reviewed,original}of Object.values(entries))for(const mutation of[current.replace(reviewed,original),current+'\n'+reviewed,current.replace(reviewed,reviewed.replace('NEW_ENGLAND','UNREVIEWED'))])
      assert.throws(()=>normalizeHistoricalImplementationBytes(name,Buffer.from(mutation)),/New England reviewed .*exact historical verification hook/);
  }
  const name='engine/src/operational-report.mjs',current=await readFile(new URL('../'+name,import.meta.url),'utf8');
  for(const replacement of[
    ['...(isNewEnglandProductionOnSiteSignal(signal)?{','...(true?{'],
    ['...(isNewEnglandInventory(signal)?{inventorySemantics:signal.sourceProductBinding.quantitySemantics}:{})','...(true?{inventorySemantics:signal.quantitySemantics}:{})'],
    ['...(isNewEnglandInventory(signal)?{inventorySemantics:signal.sourceProductBinding.quantitySemantics}:{})','...(isNewEnglandInventory(signal)?{inventorySemantics:signal.quantitySemantics}:{})'],
    [newEnglandTypedSemanticsBoundary,''],
    [newEnglandTypedSemanticsBoundary,newEnglandTypedSemanticsBoundary+newEnglandTypedSemanticsBoundary],
    ['...(newEnglandLibraryTier(signal,bible)!==null?{tier:newEnglandLibraryTier(signal,bible)}:{})','...({tier:"allocated"})'],
  ])assert.throws(()=>normalizeHistoricalImplementationBytes(name,Buffer.from(current.replace(...replacement))),/New England .*exact historical verification hook/);
});

test('grocery proof and on-site suppression reverse into the existing NY then AZ hooks only', async () => {
  const name = 'engine/src/operational-report.mjs';
  const current = await readFile(new URL('../' + name, import.meta.url), 'utf8');
  assert.equal(digest(normalizeHistoricalImplementationBytes(name, Buffer.from(current))), evidence.implementationFilesSha256[name]);
  for (const [hook, original, mutations] of [
    [groceryExpansionProofImport, groceryExpansionTierImport, [groceryExpansionProofImport.replace('isGroceryExpansionInventory', 'unreviewedInventory'), groceryExpansionProofImport.replace('grocery-xapi-policy.mjs', 'unreviewed-policy.mjs')]],
    [groceryExpansionSemanticsBoundary, newYorkVariantSemanticsBoundary, [
      groceryExpansionSemanticsBoundary.replace('isGroceryExpansionInventory(signal)', 'true'),
      groceryExpansionSemanticsBoundary.replace('isGroceryExpansionInventory(signal)', "signal.state === 'MS'"),
      groceryExpansionSemanticsBoundary.replace('signal.sourceProductBinding.inventorySemantics', 'signal.inventorySemantics'),
      groceryExpansionSemanticsBoundary.replace("signal.state === 'NY'", "signal.state === 'MS'"),
    ]],
    [westernGroceryAlertBoundary, originalWesternGroceryAlertBoundary, [
      westernGroceryAlertBoundary.replace("['WA', 'NM']", "['WA', 'NM', 'MS']"),
      westernGroceryAlertBoundary.replace('? false :', '? true :'),
      westernGroceryAlertBoundary.replace('policy.canAlertAsWatch', 'true'),
    ]],
  ]) {
    for (const changed of [current.replace(hook, original), current + '\n' + hook, ...mutations.map(mutation => current.replace(hook, mutation))]) {
      assert.notEqual(changed, current);
      assert.throws(() => normalizeHistoricalImplementationBytes(name, Buffer.from(changed)), /exact historical verification hook/);
    }
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


test('LA/AK inactive preparation permits only exact closed hooks and leaves all original Mississippi anchors pinned',async()=>{
  const baseline=JSON.parse(await readFile(new URL('../engine/data/source-evidence/louisiana-alaska-grocery-production-20261029/shared-metadata-baseline.json',import.meta.url),'utf8'));
  for(const[name,entries]of Object.entries(baseline.files)){
    const current=await readFile(new URL('../'+name,import.meta.url),'utf8');
    assert.equal(digest(normalizeHistoricalImplementationBytes(name,Buffer.from(current))),evidence.implementationFilesSha256[name]);
    for(const[key,{reviewed,original}]of Object.entries(entries)){
      assert.equal(current.split(reviewed).length-1,1,name+': '+key);
      const changed=reviewed.replace(/louisianaAlaska|LOUISIANA_ALASKA|Louisiana|Alaska|360000/g,'UNREVIEWED');
      assert.notEqual(changed,reviewed);
      for(const mutation of [current.replace(reviewed,original),current+'\n'+reviewed,current.replace(reviewed,changed)])
        assert.throws(()=>normalizeHistoricalImplementationBytes(name,Buffer.from(mutation)),/LA\/AK inactive .*exact historical verification hook/);
      if(['LA','AK'].includes(key))for(const pair of [['"publicStatus": "research_only"','"publicStatus": "active"'],['"inventoryAlertable": false','"inventoryAlertable": true'],['"watchAlertable": false','"watchAlertable": true']])
        assert.throws(()=>normalizeHistoricalImplementationBytes(name,Buffer.from(current.replace(reviewed,reviewed.replace(...pair)))) ,/LA\/AK inactive .*exact historical verification hook/);
    }
    const outside=current.replace(name.endsWith('.mjs')?(name.endsWith('operational-report.mjs')?"const policy = confidenceForSignal(signal);":"id: 'MS'"):'"MS": {',name.endsWith('.mjs')?'UNREVIEWED_MS':'"MS_UNREVIEWED": {');
    assert.notEqual(outside,current);
    assert.notEqual(digest(normalizeHistoricalImplementationBytes(name,Buffer.from(outside))),evidence.implementationFilesSha256[name]);
  }
});
