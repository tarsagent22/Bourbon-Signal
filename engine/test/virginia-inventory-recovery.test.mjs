import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  applyVirginiaInventoryFreshness,
  evaluateVirginiaProductCoverage,
  isVirginiaRegularInventoryExpired,
  isVirginiaRetiredOriginFailure,
  mergeVirginiaProductPartitions,
  minimumVirginiaSiteLocationCount,
  planVirginiaOriginStores,
  sanitizeVirginiaInventoryCacheSignals,
  seedVirginiaInventoryCacheSignals,
  selectVirginiaProductsForRefresh,
  selectVirginiaOriginStoreRows,
  summarizeVirginiaProductErrors,
  validateVirginiaGlobalQuality,
  virginiaAbortableDelay,
  virginiaInventoryPremisesMatch,
  virginiaRefreshPlan
} from '../src/collectors/virginia-inventory-recovery.mjs';
import {
  legacyPrecisionRuntimeOptions,
  VIRGINIA_PRODUCTS,
  virginiaStoreSignals
} from '../src/collectors/precision-probes.mjs';
import { runLegacyPrecisionSource } from '../src/sources/legacy-precision-runtime.mjs';
import { confidenceForSignal } from '../src/confidence-policy.mjs';
import { targetedRunNeedsBrowserCollectors } from '../src/targeted-browser-policy.mjs';
import { evaluateVirginiaRequiredStoreProof, validateSterlingRequiredStoreIds } from '../src/verify-va.mjs';
import { bibleLookup, buildDrops, publicSignal } from '../src/export-site-contract.mjs';

const HOUR = 60 * 60_000;

test('targeted Virginia recovery skips unrelated Pennsylvania and Ohio browser collectors', () => {
  assert.equal(targetedRunNeedsBrowserCollectors('VA'), false);
  assert.equal(targetedRunNeedsBrowserCollectors('VA,TN'), false);
  assert.equal(targetedRunNeedsBrowserCollectors('VA,PA'), true);
  assert.equal(targetedRunNeedsBrowserCollectors('OH'), true);
  assert.equal(targetedRunNeedsBrowserCollectors(''), true);
});

function signal(code, storeId, observedAt, quantity = 1) {
  return {
    id: `${code}-${storeId}`,
    storeId: String(storeId),
    quantity,
    observedAt,
    canAlertAsInventory: quantity > 0,
    canAlertAsWatch: true,
    sourceStale: false,
    raw: { product: { code } }
  };
}

test('Virginia refresh scheduling prioritizes overdue regular inventory before limited watch products', () => {
  const now = Date.parse('2026-07-19T18:00:00.000Z');
  const products = [
    { code: 'regular-old', limitedCaveat: false },
    { code: 'limited-old', limitedCaveat: true },
    { code: 'regular-fresh', limitedCaveat: false }
  ];
  const cached = [
    signal('regular-old', '101', '2026-07-19T12:00:00.000Z'),
    signal('limited-old', '101', '2026-07-18T18:00:00.000Z'),
    signal('regular-fresh', '101', '2026-07-19T17:30:00.000Z')
  ];

  const selected = selectVirginiaProductsForRefresh(products, cached, now, {
    maxProducts: 2,
    regularIntervalMs: 2 * HOUR,
    limitedIntervalMs: 12 * HOUR
  });

  assert.deepEqual(selected.map((product) => product.code), ['regular-old', 'limited-old']);
});

test('Virginia cold bootstrap always includes verifier-required products', () => {
  const regular = Array.from({ length: 10 }, (_, index) => ({ code: `regular-${index}`, limitedCaveat: false }));
  const products = [
    ...regular,
    { code: 'limited-first', limitedCaveat: true },
    { code: 'limited-second', limitedCaveat: true },
    { code: 'buffalo-trace', limitedCaveat: true, bootstrapPriority: true }
  ];
  const selected = selectVirginiaProductsForRefresh(products, [], Date.now(), { maxProducts: 12 });
  assert.equal(selected.length, 12);
  assert.ok(selected.some((product) => product.code === 'buffalo-trace'));
});

test('Virginia real cold-start catalog leaves ten statewide regular partitions after Sterling targets', () => {
  const selected = selectVirginiaProductsForRefresh(VIRGINIA_PRODUCTS, [], Date.now(), { maxProducts: 15 });
  assert.equal(selected.length, 15);
  assert.deepEqual(selected.filter((product) => product.targetStoreIds).map((product) => product.code).sort(), ['016577', '018434', '022199']);
  assert.ok(selected.filter((product) => !product.limitedCaveat && !product.targetStoreIds).length >= 10);
  assert.deepEqual(virginiaRefreshPlan({
    cachedSignalCount: 17_955,
    recoveryBacklogCount: 0,
    normalLimit: 5,
    coldLimit: 15,
    requiredStoreIds: ['40', '61', '82', '362']
  }), { force: true, maxProducts: 15 });
  assert.deepEqual(virginiaRefreshPlan({ cachedSignalCount: 17_955, recoveryBacklogCount: 0 }), { force: false, maxProducts: 15 });
});

test('Virginia stale non-alerting cache metadata rotates later cohorts without starving Sterling', () => {
  const now = Date.now();
  const first = selectVirginiaProductsForRefresh(VIRGINIA_PRODUCTS, [], now, { maxProducts: 15, force: true });
  const firstCache = sanitizeVirginiaInventoryCacheSignals(first.map((product) => {
    const row = signal(product.code, '101', new Date(now).toISOString());
    row.raw.product = { ...product };
    return row;
  }));
  const second = selectVirginiaProductsForRefresh(VIRGINIA_PRODUCTS, firstCache, now + HOUR, { maxProducts: 15, force: true });
  const targets = (products) => products.filter((product) => product.targetStoreIds).map((product) => product.code).sort();
  const rotatingProducts = (products) => new Set(products
    .filter((product) => !product.targetStoreIds && product.verificationPriority !== true)
    .map((product) => product.code));
  assert.deepEqual(targets(first), ['016577', '018434', '022199']);
  assert.deepEqual(targets(second), ['016577', '018434', '022199']);
  const firstRotatingProducts = rotatingProducts(first);
  assert.ok([...rotatingProducts(second)].every((code) => !firstRotatingProducts.has(code)));
  assert.ok(firstCache.every((row) => row.canAlertAsInventory === false && row.sourceStale === true));

  const futureCache = sanitizeVirginiaInventoryCacheSignals([signal('021236', '101', new Date(now + 24 * HOUR).toISOString())]);
  assert.equal(futureCache[0].raw.virginiaSchedulingObservedAt, null);
  assert.ok(selectVirginiaProductsForRefresh([{ code: '021236', limitedCaveat: false }], futureCache, now, { maxProducts: 1 })
    .some((product) => product.code === '021236'));
});

test('Virginia site-location gate scales to the supported store universe', () => {
  assert.equal(minimumVirginiaSiteLocationCount(392), 300);
  assert.equal(minimumVirginiaSiteLocationCount(800), 600);
  assert.equal(minimumVirginiaSiteLocationCount(100), 100);
  assert.equal(minimumVirginiaSiteLocationCount(0), 300);
});

test('Virginia Store 49 is prioritized only after the official Ballston identity matches', () => {
  const stores = [
    { storeNumber: '1', name: 'ABC Store 001', address: '10 First Street', city: 'Richmond', zip: '23219' },
    { storeNumber: '49', name: 'ABC Store 049', address: '881 North Quincy Street', city: 'Arlington', zip: '22203' },
    { storeNumber: '248', name: 'ABC Store 248', address: '4709B Langston Boulevard', city: 'Arlington', zip: '22207-3406' },
  ];

  const plan = planVirginiaOriginStores(stores);
  assert.deepEqual(plan.stores.map((store) => store.storeNumber), ['49', '1', '248']);
  assert.deepEqual(plan.verifiedPriorityStoreIds, ['49']);
  assert.deepEqual(plan.rejectedPriorityStoreIds, []);
  assert.equal(new Set(plan.stores.map((store) => store.storeNumber)).size, stores.length);
});

test('Virginia Store 49 priority fails closed for unknown or forged premises without filtering statewide stores', () => {
  const stores = [
    { storeNumber: '1', name: 'ABC Store 001', address: '10 First Street', city: 'Richmond', zip: '23219' },
    { storeNumber: '49', name: 'ABC Store 049', address: '999 Forged Street', city: 'Arlington', zip: '22203' },
    { storeNumber: '248', name: 'ABC Store 248', address: '4709B Langston Boulevard', city: 'Arlington', zip: '22207-3406' },
  ];

  const plan = planVirginiaOriginStores(stores, ['49', '999']);
  assert.deepEqual(plan.stores, stores);
  assert.deepEqual(plan.verifiedPriorityStoreIds, []);
  assert.deepEqual(plan.rejectedPriorityStoreIds, ['49', '999']);
});

test('Virginia Sterling priority stores require the reviewed official premises identities', () => {
  const reviewed = [
    { storeNumber: '40', address: '22000 Dulles Retail Plaza, Unit 166', city: 'Sterling', zip: '20166' },
    { storeNumber: '61', address: '22360 S. Sterling Boulevard, Suite 101', city: 'Sterling', zip: '20164' },
    { storeNumber: '82', address: '46930 Cedar Lakes Plaza, Units100-130', city: 'Sterling', zip: '20164' },
    { storeNumber: '362', address: '100 Edds Lane', city: 'Sterling', zip: '20165' },
    { storeNumber: '1', address: '10 First Street', city: 'Richmond', zip: '23219' }
  ];

  const accepted = planVirginiaOriginStores(reviewed, ['40', '61', '82', '362']);
  assert.deepEqual(accepted.verifiedPriorityStoreIds, ['40', '61', '82', '362']);
  assert.deepEqual(accepted.rejectedPriorityStoreIds, []);
  assert.deepEqual(accepted.stores.slice(0, 4).map((store) => store.storeNumber), ['40', '61', '82', '362']);
  assert.equal(new Set(accepted.stores.map((store) => store.storeNumber)).size, reviewed.length);

  const forged = reviewed.map((store) => store.storeNumber === '82'
    ? { ...store, address: '999 Forged Plaza' }
    : store);
  const rejected = planVirginiaOriginStores(forged, ['40', '61', '82', '362']);
  assert.deepEqual(rejected.verifiedPriorityStoreIds, ['40', '61', '362']);
  assert.deepEqual(rejected.rejectedPriorityStoreIds, ['82']);
  assert.deepEqual(rejected.stores.slice(0, 3).map((store) => store.storeNumber), ['40', '61', '362']);
  assert.deepEqual(new Set(rejected.stores.map((store) => store.storeNumber)), new Set(forged.map((store) => store.storeNumber)));
});

test('Virginia Sterling expansion tracks only source-verified product and store identities', () => {
  const products = new Map(VIRGINIA_PRODUCTS.map((product) => [product.code, product]));
  assert.deepEqual(
    ['016577', '022199', '018434'].map((code) => ({ code, ...products.get(code) })),
    [
      { code: '016577', name: "Baker's High Rye Bourbon", limitedCaveat: false, bootstrapPriority: true, targetStoreIds: ['40', '61', '82', '362'], slug: 'baker-s-high-rye-bourbon' },
      { code: '022199', name: 'Wild Turkey Rare Breed Bourbon', limitedCaveat: false, bootstrapPriority: true, targetStoreIds: ['40', '61', '82', '362'], slug: 'wild-turkey-rare-breed-bourbon' },
      { code: '018434', name: 'Green River Full Proof Bourbon', limitedCaveat: false, bootstrapPriority: true, targetStoreIds: ['40', '61', '82', '362'], slug: 'green-river-full-proof-bourbon' }
    ]
  );

  const product = products.get('022199');
  const bible = {
    match: () => ({
      confidence: 1,
      record: { id: 'bb_wild_turkey_rare_breed', canonical: 'Wild Turkey Rare Breed Straight Bourbon' }
    })
  };
  const validStore40 = {
    storeId: 40,
    address: '22000 Dulles Retail Plaza Unit 166 Sterling VA 20166',
    address1: '22000 Dulles Retail Plaza',
    address2: 'Unit 166',
    city: 'Sterling', state: 'VA', zip: '20166',
    latitude: 39.00551387, longitude: -77.43714145,
    url: '/stores/40'
  };
  const payload = {
    products: [
      { productId: '022199', storeInfo: { ...validStore40, quantity: 6 } },
      { productId: '022199', storeInfo: { ...validStore40, quantity: 99, address: '999 Forged Plaza' } },
      { productId: '022199', storeInfo: { ...validStore40, quantity: 99, address: '999 Forged Plaza Sterling VA 20166', address1: '999 Forged Plaza', address2: null } },
      { productId: '022199', storeInfo: { ...validStore40, quantity: Number.POSITIVE_INFINITY } },
      { productId: '022199', storeInfo: { ...validStore40, quantity: Number.MAX_SAFE_INTEGER + 1 } },
      { productId: '022199', storeInfo: { storeId: 40, quantity: 99, state: 'VA', url: '/stores/40' } },
      { productId: '022199', storeInfo: { storeId: 999, quantity: 99, address: '999 Forged Plaza', city: 'Sterling', state: 'VA', zip: '20166' } },
      { productId: 'wrong-product', storeInfo: { storeId: 40, quantity: 99, address: '22000 Dulles Retail Plaza, Unit 166', city: 'Sterling', state: 'VA', zip: '20166' } }
    ]
  };
  const origin = { storeNumber: '40', address: '22000 Dulles Retail Plaza, Unit 166', city: 'Sterling', zip: '20166', lat: 39.00551387, lng: -77.43714145 };
  const signals = virginiaStoreSignals(product, payload, { id: 'VA' }, bible, 'https://www.abc.virginia.gov/webapi/inventory/storeNearby', new Set(['40']), origin);

  assert.equal(signals.length, 1);
  assert.equal(signals[0].storeId, '40');
  assert.equal(signals[0].quantity, 6);
  assert.equal(signals[0].canAlertAsInventory, true);
  assert.equal(signals[0].raw.originStoreId, '40');
  assert.equal(signals[0].raw.product.code, '022199');
  assert.equal(signals[0].raw.sourceQuantityReported, true);
  assert.equal(signals[0].raw.sourceAvailabilityVerified, true);
  assert.equal(signals[0].raw.premisesVerified, true);
  assert.equal(signals[0].sourcePremisesProofVersion, 1);
  assert.equal(signals[0].raw.virginiaCacheSchemaVersion, 3);
  assert.deepEqual(signals[0].raw.premisesAuthority, {
    source: 'virginia_arcgis', storeId: '40',
    directoryAddress: origin.address, directoryCity: origin.city, directoryZip: origin.zip,
    directoryLat: origin.lat, directoryLng: origin.lng,
    matchMethod: 'selected_official_directory_origin'
  });
  assert.equal(signals[0].storeAddress, origin.address);
  assert.equal(signals[0].lat, origin.lat);

  assert.equal(virginiaInventoryPremisesMatch({
    storeId: 36, address: '7953 Stonewall Shops Square Suite 220 Gainsville VA 20155', address1: '7953 Stonewall Shops Square, Suite 220', city: 'Gainsville', state: 'VA', zip: '20155',
    latitude: 38.785784, longitude: -77.649117, url: '/stores/36'
  }, {
    storeNumber: '36', address: '8038 Crescent Park Drive', city: 'Gainesville', zip: '20155',
    lat: 38.78443794, lng: -77.66371063
  }), false, 'an unreviewed moved premise never inherits exact-store trust from proximity');
  assert.equal(virginiaInventoryPremisesMatch({
    storeId: 36, address: '999 Forged Plaza Gainsville VA 20155', address1: '999 Forged Plaza', city: 'Gainsville', state: 'VA', zip: '20155',
    latitude: 37.2, longitude: -79.9, url: '/stores/36'
  }, {
    storeNumber: '36', address: '8038 Crescent Park Drive', city: 'Gainesville', zip: '20155',
    lat: 38.78443794, lng: -77.66371063
  }), false);


  const forgedPolicy = confidenceForSignal({
    state: 'VA', eventType: 'store_inventory_result', locationPrecision: 'store_level',
    productCode: '022199', storeId: '40', sourceUrl: 'https://www.abc.virginia.gov/stores/40',
    targetStoreIds: ['40', '61', '82', '362'],
    quantity: 99, confidence: 1, sourceAvailabilityVerified: true, premisesVerified: true,
    sourcePremisesProofVersion: 1, raw: { virginiaCacheSchemaVersion: 2 }
  });
  assert.equal(forgedPolicy.canAlertAsInventory, false);
  assert.equal(forgedPolicy.canAlertAsWatch, false);
  const verifiedPolicy = confidenceForSignal(signals[0]);
  assert.equal(verifiedPolicy.canAlertAsInventory, true);
});

test('Virginia required-store verifier executes the complete Sterling origin set and fails closed per store', () => {
  assert.equal(validateSterlingRequiredStoreIds('').ok, false);
  assert.equal(validateSterlingRequiredStoreIds('40,61,82').ok, false);
  assert.equal(validateSterlingRequiredStoreIds('40,61,82,82,362').ok, false);
  assert.equal(validateSterlingRequiredStoreIds('40,61,82,999').ok, false);
  assert.equal(validateSterlingRequiredStoreIds('362,82,61,40').ok, true);
  const origins = [
    { storeNumber: '40', address: '22000 Dulles Retail Plaza, Unit 166', city: 'Sterling', zip: '20166' },
    { storeNumber: '61', address: '22360 S. Sterling Boulevard, Suite 101', city: 'Sterling', zip: '20164' },
    { storeNumber: '82', address: '46930 Cedar Lakes Plaza, Units100-130', city: 'Sterling', zip: '20164' },
    { storeNumber: '362', address: '100 Edds Lane', city: 'Sterling', zip: '20165' }
  ];
  const signals = origins.map((origin) => ({
    id: `va-signal-${origin.storeNumber}`, productCode: '022199', targetStoreIds: ['40', '61', '82', '362'],
    storeId: origin.storeNumber, storeAddress: origin.address, city: origin.city, zip: origin.zip,
    sourceUrl: `https://www.abc.virginia.gov/stores/${origin.storeNumber}`,
    locationPrecision: 'store_level', quantity: 2, productLimitedCaveat: false,
    canAlertAsInventory: true, sourceAvailabilityVerified: true, premisesVerified: true, sourcePremisesProofVersion: 1,
    virginiaCacheSchemaVersion: 3
  }));
  const drops = signals.map((signal) => ({ ...signal, eligibleForOnSite: true }));
  for (const origin of origins) {
    assert.equal(evaluateVirginiaRequiredStoreProof({
      storeId: origin.storeNumber, origin, signals, drops
    }).ok, true);
  }
  assert.equal(evaluateVirginiaRequiredStoreProof({
    storeId: '82', origin: origins[2], signals, drops: drops.filter((drop) => drop.storeId !== '82')
  }).ok, false);
  assert.equal(evaluateVirginiaRequiredStoreProof({
    storeId: '82', origin: origins[2], signals: signals.map((signal) => signal.storeId === '82' ? { ...signal, quantity: 'Infinity' } : signal), drops
  }).ok, false);
  assert.equal(evaluateVirginiaRequiredStoreProof({
    storeId: '82', origin: origins[2], signals: signals.map((signal) => signal.storeId === '82' ? { ...signal, storeAddress: '999 Forged Plaza' } : signal), drops
  }).ok, false);
  assert.equal(evaluateVirginiaRequiredStoreProof({
    storeId: '82', origin: origins[2], signals,
    drops: drops.map((drop) => drop.storeId === '82' ? { ...drop, productCode: '018434' } : drop)
  }).ok, false);
  assert.equal(evaluateVirginiaRequiredStoreProof({
    storeId: '82', origin: origins[2], signals,
    drops: drops.map((drop) => drop.storeId === '82' ? { ...drop, canAlertAsInventory: false } : drop)
  }).ok, false);
  assert.equal(evaluateVirginiaRequiredStoreProof({
    storeId: '82', origin: origins[2],
    signals: signals.map((signal) => signal.storeId === '82' ? { ...signal, productCode: '018006', virginiaCacheSchemaVersion: null } : signal),
    drops
  }).ok, false);
  assert.equal(evaluateVirginiaRequiredStoreProof({
    storeId: '82', origin: origins[2],
    signals: signals.map((signal) => signal.storeId === '82' ? { ...signal, raw: { product: { code: '018006' }, virginiaCacheSchemaVersion: 3 } } : signal),
    drops
  }).ok, false);
});

test('Virginia Sterling source audit is complete and keeps source classes distinct', async () => {
  const atlas = JSON.parse(await readFile(new URL('../data/source-atlas/VA.json', import.meta.url), 'utf8'));
  const proofBytes = await readFile(new URL('./fixtures/va/sterling-inventory-proof.json', import.meta.url));
  const rawProofBytes = await readFile(new URL('./fixtures/va/sterling-inventory-raw-captures.json', import.meta.url));
  const proof = JSON.parse(proofBytes.toString('utf8'));
  const rawProof = JSON.parse(rawProofBytes.toString('utf8'));
  assert.equal(atlas.contractVersion, 'bourbon-signal-virginia-source-audit-v1');
  assert.equal(atlas.target.areaKey, 'sterling');
  assert.equal(atlas.target.knownSourceUniverseComplete, true);
  assert.equal(atlas.discoveryPasses.length, 2);
  assert.deepEqual(atlas.baseline.officialSterlingStoreIds, ['40', '61', '82', '362']);
  assert.deepEqual(atlas.inventoryExpansion.products.map((product) => product.code), ['016577', '022199', '018434']);
  assert.equal(createHash('sha256').update(proofBytes).digest('hex'), atlas.inventoryExpansion.proofFixtureSha256);
  assert.equal(createHash('sha256').update(rawProofBytes).digest('hex'), atlas.inventoryExpansion.rawProofFixtureSha256);
  assert.equal(rawProof.capturedAt, atlas.inventoryExpansion.rawProofCapturedAt);
  const latestProofObservedAt = Math.max(...proof.rows.map((row) => Date.parse(row.observedAt)));
  assert.equal(Date.parse(atlas.inventoryExpansion.proofObservedAt), latestProofObservedAt);
  assert.ok(Date.parse(atlas.generatedAt) >= latestProofObservedAt);
  assert.deepEqual(proof.rows.map((row) => `${row.productCode}:${row.storeId}`), [
    '016577:40', '016577:82', '016577:362',
    '018434:40', '018434:82', '018434:362',
    '022199:40', '022199:61', '022199:82', '022199:362'
  ]);
  assert.ok(proof.rows.every((row) => Number.isSafeInteger(row.quantity) && row.quantity > 0 && row.city === 'Sterling'));
  const reviewedStores = new Map(atlas.target.reviewedStores.map((store) => [store.storeId, store]));
  const normalizePremise = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  for (const row of proof.rows) {
    const reviewed = reviewedStores.get(row.storeId);
    assert.ok(reviewed, row.storeId);
    assert.ok(normalizePremise(row.storeAddress).startsWith(normalizePremise(reviewed.address)), row.storeId);
    assert.equal(row.city, reviewed.city);
    assert.equal(row.zip, reviewed.zip);
  }
  assert.equal(rawProof.captures.length, 12);
  const capturedRows = [];
  for (const capture of rawProof.captures) {
    const requestUrl = new URL(capture.requestUrl);
    assert.equal(requestUrl.origin, 'https://www.abc.virginia.gov');
    assert.equal(requestUrl.pathname, '/webapi/inventory/storeNearby');
    assert.equal(capture.status, 200);
    assert.match(capture.contentType, /^application\/json\b/i);
    assert.equal(createHash('sha256').update(capture.rawBody).digest('hex'), capture.bodySha256);
    const storeId = requestUrl.searchParams.get('storeNumber');
    const productCode = requestUrl.searchParams.get('productCode');
    assert.ok(['40', '61', '82', '362'].includes(storeId));
    assert.ok(['016577', '022199', '018434'].includes(productCode));
    const payload = JSON.parse(capture.rawBody);
    const selected = payload.products.find((entry) => String(entry.productId) === productCode && String(entry.storeInfo?.storeId) === storeId);
    assert.ok(selected, `${productCode}:${storeId}`);
    assert.ok(Number.isSafeInteger(Number(selected.storeInfo.quantity)) && Number(selected.storeInfo.quantity) >= 0);
    const reviewed = reviewedStores.get(storeId);
    assert.equal(selected.storeInfo.city, reviewed.city);
    assert.equal(String(selected.storeInfo.zip), reviewed.zip);
    assert.ok(normalizePremise(selected.storeInfo.address).startsWith(normalizePremise(reviewed.address)));
    if (Number(selected.storeInfo.quantity) > 0) capturedRows.push(`${productCode}:${storeId}:${selected.storeInfo.quantity}`);
  }
  assert.deepEqual(capturedRows.sort(), proof.rows.map((row) => `${row.productCode}:${row.storeId}:${row.quantity}`).sort());
  for (const product of atlas.inventoryExpansion.products) {
    assert.deepEqual(proof.rows.filter((row) => row.productCode === product.code).map((row) => row.storeId), product.positiveStoreIds);
  }
  assert.ok(atlas.inventoryExpansion.products.every((product) => new URL(product.productUrl).hostname === 'www.abc.virginia.gov'));
  assert.ok(atlas.sources.some((source) => source.sourceClass === 'first_party' && source.outcome === 'adopted'));
  assert.ok(atlas.sources.some((source) => source.sourceClass === 'official_directory' && source.outcome === 'adopted'));
  assert.ok(atlas.sources.some((source) => source.sourceClass === 'other_public' && source.outcome !== 'adopted'));
  assert.ok(atlas.sources.every((source) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.sourceId)));
  assert.equal(new Set(atlas.sources.map((source) => source.sourceId)).size, atlas.sources.length);
  assert.ok(atlas.sources.every((source) => /^https:$/.test(new URL(source.url).protocol)));
  assert.ok(atlas.sources.every((source) => /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(source.reasonCode)));
  assert.ok(atlas.sources.every((source) => ['first_party', 'delegated_marketplace', 'official_directory', 'other_public'].includes(source.sourceClass)));
  assert.ok(atlas.sources.every((source) => ['adopted', 'viable_not_adopted', 'rejected', 'blocked'].includes(source.outcome)));
});

test('Virginia cold runners seed the rolling cache from the hydrated state report', () => {
  const seeded = seedVirginiaInventoryCacheSignals({
    finishedAt: '2026-07-20T22:52:41.174Z',
    signals: [
      {
        ...signal('A', '101', '2026-07-19T20:00:00.000Z', 3),
        state: 'VA',
        sourceRuntimeId: 'precision:va',
        locationPrecision: 'store_level',
        stale: true,
        staleReason: 'retained fallback',
        alertable: false,
        canAlertAsInventory: false,
        raw: { product: { code: 'A' }, staleFallback: true, staleFallbackAt: '2026-07-20T22:52:41.174Z' }
      },
      { ...signal('B', '101', '2026-07-19T20:00:00.000Z'), state: 'NC', sourceRuntimeId: 'precision:nc', locationPrecision: 'store_level' },
      { state: 'VA', sourceRuntimeId: 'precision:va', eventType: 'policy_signal', locationPrecision: 'statewide_catalog' }
    ]
  });

  assert.equal(seeded.generatedAt, '2026-07-20T22:52:41.174Z');
  assert.equal(seeded.signals.length, 1);
  assert.equal(seeded.signals[0].canAlertAsInventory, false);
  assert.equal(seeded.signals[0].canAlertAsWatch, false);
  assert.equal(seeded.signals[0].stale, true);
  assert.equal(seeded.signals[0].sourceStale, true);
  assert.equal(seeded.signals[0].alertable, false);
  assert.equal(seeded.signals[0].raw.staleFallback, true);

  const publicContractSeed = seedVirginiaInventoryCacheSignals({
    finishedAt: '2026-07-20T22:52:41.174Z',
    signals: [{
      state: 'VA', sourceRuntimeId: 'precision:va', locationPrecision: 'store_level', storeId: '101',
      productCode: '018006', sourceUrl: 'https://www.abc.virginia.gov/stores/101'
    }]
  });
  assert.equal(publicContractSeed.signals.length, 1);
  assert.equal(publicContractSeed.signals[0].productCode, '018006');
});

test('Virginia cache makes every row revalidate live and cannot self-attest premises', () => {
  const legacyOlder = {
    id: 'legacy-old', storeId: '101', quantity: 4, observedAt: '2026-07-20T00:00:00.000Z', canAlertAsInventory: true,
    raw: { product: { code: '018006', limitedCaveat: false }, store: { quantity: 4 } }
  };
  const legacyNewer = {
    ...legacyOlder, id: 'legacy-new', quantity: 2, observedAt: '2026-07-21T00:00:00.000Z', raw: { product: { code: '018006', limitedCaveat: false }, store: { quantity: 2 } }
  };
  const verified = {
    id: 'verified', storeId: '40', storeAddress: '22000 Dulles Retail Plaza, Unit 166', city: 'Sterling', stateCode: 'VA', zip: '20166', quantity: 3,
    sourceUrl: 'https://www.abc.virginia.gov/stores/40', observedAt: '2026-07-21T00:00:00.000Z',
    canAlertAsInventory: true, sourceAvailabilityVerified: true, premisesVerified: true, sourcePremisesProofVersion: 1,
    targetStoreIds: ['40', '61', '82', '362'],
    raw: {
      product: { code: '022199', limitedCaveat: false, targetStoreIds: ['40', '61', '82', '362'] }, originStoreId: '40', sourceQuantityReported: true,
      sourceAvailabilityVerified: true, premisesVerified: true, sourcePremisesProofVersion: 1,
      premisesAuthority: {
        source: 'virginia_arcgis', storeId: '40',
        directoryAddress: '22000 Dulles Retail Plaza, Unit 166', directoryCity: 'Sterling', directoryZip: '20166',
        matchMethod: 'selected_official_directory_origin'
      },
      virginiaCacheSchemaVersion: 3
    }
  };
  const forgedSelfAttested = {
    ...verified,
    id: 'forged-self-attested',
    storeId: '61',
    sourceUrl: 'https://www.abc.virginia.gov/stores/61',
    storeAddress: '999 Forged Plaza',
    quantity: 'Infinity',
    raw: {
      ...verified.raw,
      originStoreId: '61',
      premisesAuthority: {
        source: 'virginia_arcgis', storeId: '61', directoryAddress: '999 Forged Plaza', directoryCity: 'Sterling', directoryZip: '20164',
        matchMethod: 'selected_official_directory_origin'
      }
    }
  };

  const migrated = sanitizeVirginiaInventoryCacheSignals([legacyOlder, legacyNewer, verified, forgedSelfAttested]);
  assert.equal(migrated.length, 3);
  const legacy = migrated.find((signal) => signal.storeId === '101');
  assert.equal(legacy.id, 'legacy-new');
  assert.equal(legacy.canAlertAsInventory, false);
  assert.equal(legacy.alertable, false);
  assert.equal(legacy.sourceStale, true);
  assert.equal(legacy.raw.legacyVirginiaCache, true);
  const freshnessReplayedLegacy = applyVirginiaInventoryFreshness([legacy], Date.parse('2026-07-20T01:02:00.000Z'))[0];
  assert.equal(freshnessReplayedLegacy.sourceStale, true);
  assert.equal(freshnessReplayedLegacy.canAlertAsInventory, false);
  const cachedTarget = migrated.find((signal) => signal.storeId === '40');
  assert.equal(cachedTarget.canAlertAsInventory, false);
  assert.equal(cachedTarget.sourceStale, true);
  assert.equal(cachedTarget.premisesVerified, false);
  const forged = migrated.find((signal) => signal.storeId === '61');
  assert.equal(forged.quantity, 0);
  assert.equal(forged.canAlertAsInventory, false);
  assert.equal(forged.canAlertAsWatch, false);
  assert.equal(forged.raw.legacyVirginiaCache, true);
  assert.equal(confidenceForSignal(forged).canAlertAsInventory, false);
  const migrationSelection = selectVirginiaProductsForRefresh([
    { code: 'ordinary', limitedCaveat: false },
    { code: 'bootstrap', limitedCaveat: false, bootstrapPriority: true }
  ], [{ ...legacy, raw: { ...legacy.raw, product: { code: 'ordinary' } } }], Date.now(), { maxProducts: 1 });
  assert.deepEqual(migrationSelection.map((product) => product.code), ['bootstrap']);
});

test('Virginia product partitions replace only complete successful live products', () => {
  const cached = [
    signal('A', '101', '2026-07-18T00:00:00.000Z'),
    signal('A', '102', '2026-07-18T00:00:00.000Z'),
    signal('B', '101', '2026-07-18T00:00:00.000Z')
  ];
  const liveA = [
    signal('A', '101', '2026-07-19T18:00:00.000Z', 3),
    signal('A', '102', '2026-07-19T18:00:00.000Z', 0)
  ];
  const incompleteB = [signal('B', '101', '2026-07-19T18:00:00.000Z', 2)];

  const merged = mergeVirginiaProductPartitions(cached, new Map([
    ['A', liveA],
    ['B', incompleteB]
  ]), new Set(['A']));

  assert.equal(merged.filter((row) => row.raw.product.code === 'A').length, 2);
  assert.equal(merged.find((row) => row.raw.product.code === 'A' && row.storeId === '101')?.quantity, 3);
  assert.equal(merged.find((row) => row.raw.product.code === 'B')?.observedAt, '2026-07-18T00:00:00.000Z');
});

test('Virginia repeated origin failures collapse into one bounded product summary', () => {
  const summary = summarizeVirginiaProductErrors([
    { status: 429, url: 'https://www.abc.virginia.gov/first', error: '<html> Too   Many Requests </html>' },
    { status: 429, url: 'https://www.abc.virginia.gov/second', error: 'Too Many Requests' },
    { status: 0, url: 'https://www.abc.virginia.gov/third', error: 'socket timeout' }
  ]);
  assert.deepEqual(summary, {
    status: 0,
    url: 'https://www.abc.virginia.gov/first',
    error: '3 store-origin probe failure(s) (1 HTTP transport, 2 HTTP 429); representative error: <html> Too Many Requests </html>'
  });
  assert.equal(summarizeVirginiaProductErrors([]), null);
});

test('Virginia completeness requires every supported origin store before replacing a product partition', () => {
  const rows = [
    signal('A', '101', '2026-07-19T18:00:00.000Z'),
    signal('A', '102', '2026-07-19T18:00:00.000Z')
  ];

  assert.deepEqual(evaluateVirginiaProductCoverage(rows, new Set(['101', '102'])), {
    complete: true,
    coveredStoreCount: 2,
    expectedStoreCount: 2,
    missingStoreIds: [],
    unexpectedStoreIds: []
  });
  assert.equal(evaluateVirginiaProductCoverage(rows, new Set(['101', '102', '103'])).complete, false);
  assert.equal(evaluateVirginiaProductCoverage(rows, new Set(['101']), { minimumExpectedStoreCount: 390 }).complete, false);
  assert.equal(evaluateVirginiaProductCoverage(rows, new Set(['101'])).complete, false);
});

test('Virginia inventory partitions use only the selected origin store row', () => {
  const payload = {
    products: [{
      productId: '018006',
      storeInfo: { storeId: 101, quantity: 4, city: 'Richmond' },
      nearbyStores: [
        { storeId: 102, quantity: 9, city: 'Henrico' },
        { storeId: 103, quantity: 1, city: 'Ashland' }
      ]
    }]
  };

  assert.deepEqual(selectVirginiaOriginStoreRows(payload, '101', '018006'), [{ storeId: 101, quantity: 4, city: 'Richmond' }]);
  assert.deepEqual(selectVirginiaOriginStoreRows(payload, '101', '999999'), []);
  assert.deepEqual(selectVirginiaOriginStoreRows(payload, '102', '018006'), []);
  assert.deepEqual(selectVirginiaOriginStoreRows({ products: [{ productId: '018006', nearbyStores: payload.products[0].nearbyStores }] }, '102', '018006'), []);
});

test('Virginia permanently retires only explicit no-store origin responses', () => {
  assert.equal(isVirginiaRetiredOriginFailure({ status: 400, error: 'No Store exists for store number &#39;252&#39;' }), true);
  assert.equal(isVirginiaRetiredOriginFailure({ status: 400, error: 'Value for productCode is invalid' }), false);
  assert.equal(isVirginiaRetiredOriginFailure({ status: 429, error: 'No Store exists for store number 252' }), false);
  assert.equal(isVirginiaRetiredOriginFailure({ status: 0, error: 'socket timeout' }), false);
});

test('Virginia precision runtime gives one bounded shard enough time and never duplicates it after timeout', () => {
  assert.deepEqual(legacyPrecisionRuntimeOptions('VA', {}, {}), { schedule: false, timeoutMs: 1_140_000, maxAttempts: 1 });
  assert.equal(legacyPrecisionRuntimeOptions('VA', { schedule: true }, {}).schedule, false);
});

test('an explicitly targeted state bypasses the source not-due scheduler', () => {
  assert.equal(legacyPrecisionRuntimeOptions('OH', {}, { BOURBON_SIGNAL_RUN_STATES: 'PA,VA,OH' }).schedule, false);
  assert.equal(legacyPrecisionRuntimeOptions('OH', {}, {}).schedule, undefined);
});

test('Virginia parent state watchdog stays above the bounded precision runtime', async () => {
  const runSource = await readFile(new URL('../src/run.mjs', import.meta.url), 'utf8');
  assert.match(runSource, /VA:[^\n]*1_200_000/);
});

test('Virginia retry and batch delays stop immediately when the source runtime aborts', async () => {
  const controller = new AbortController();
  const pending = virginiaAbortableDelay(10_000, controller.signal);
  controller.abort(new Error('Virginia source timeout'));
  await assert.rejects(pending, /Virginia source timeout/);
});

test('Virginia collector continuously refreshes bounded product shards instead of treating cache reuse as a roadblock', async () => {
  const collectorSource = await readFile(new URL('../src/collectors/precision-probes.mjs', import.meta.url), 'utf8');
  assert.match(collectorSource, /selectVirginiaProductsForRefresh\(/);
  assert.match(collectorSource, /planVirginiaOriginStores\(/);
  assert.match(collectorSource, /evaluateVirginiaProductCoverage\(/);
  assert.match(collectorSource, /mergeVirginiaProductPartitions\(/);
  assert.match(collectorSource, /applyVirginiaInventoryFreshness\(/);
  assert.match(collectorSource, /isVirginiaRegularInventoryExpired\(signal, Date\.now\(\), VIRGINIA_INVENTORY_MAX_AGE_MS\)/);
  assert.match(collectorSource, /collectVirginia\(config, bible, options\)/);
  assert.match(collectorSource, /fetchVirginiaInventoryOrigin\(product, origin, options\.signal/);
  assert.match(collectorSource, /selectVirginiaOriginStoreRows\(json, originStoreId, product\.code\)/);
  assert.match(collectorSource, /quantityIsExact:\s*true/);
  assert.match(collectorSource, /sourceAvailabilityVerified:\s*true/);
  assert.match(collectorSource, /storeHours:/);
  assert.match(collectorSource, /storePhone:/);
  assert.match(collectorSource, /storeUrl:/);
  assert.match(collectorSource, /VIRGINIA_COLD_START_PRODUCTS_PER_RUN/);
  assert.match(collectorSource, /virginiaRefreshPlan\(/);
  assert.match(collectorSource, /requiredTargetStoreIds/);
  assert.match(collectorSource, /process\.env\.BOURBON_SIGNAL_VA_FORCE_LIVE === '1' \|\| refreshPlan\.force/);
  assert.match(collectorSource, /missingCachedProductCodes/);
  assert.match(collectorSource, /supportedCachedSignals/);
  assert.match(collectorSource, /seedVirginiaInventoryCacheSignals\(/);
  assert.match(collectorSource, /cacheNeedsSanitization/);
  assert.match(collectorSource, /sharedRateLimitState/);
  assert.match(collectorSource, /retryAfter:\s*res\.headers\.get\('retry-after'\)/);
  assert.match(collectorSource, /writeCachedVirginiaSignals\(mergedSignals, options\.signal\)/);
  assert.match(collectorSource, /renameSync\(temporaryPath, VIRGINIA_CACHE_PATH\)/);
  assert.doesNotMatch(collectorSource, /source:\s*['"]Virginia ABC storeNearby inventory API cache reuse['"]/);
  assert.doesNotMatch(collectorSource, /if \(process\.env\.BOURBON_SIGNAL_VA_FORCE_LIVE[^]*return \{ signals: cachedSignals\.map/);
});

test('Virginia verifier blocks stale alertable rows and incomplete regular-product store coverage', async () => {
  const verifierSource = await readFile(new URL('../src/verify-va.mjs', import.meta.url), 'utf8');
  assert.match(verifierSource, /staleAlertableSignals/);
  assert.match(verifierSource, /regularProductCoverage/);
  assert.match(verifierSource, /sourceStale/);
  assert.match(verifierSource, /productLimitedCaveat/);
  assert.match(verifierSource, /supportedOriginStoreIds/);
  assert.match(verifierSource, /verifiedPriorityStoreIds\.has\('49'\)/);
  assert.match(verifierSource, /rejectedPriorityStoreIds/);
  assert.match(verifierSource, /if \(requiredTargetStoreIds\.length\)/);
  assert.match(verifierSource, /unsupportedTargetStoreIds/);
  assert.match(verifierSource, /for \(const storeId of requiredTargetStoreIds\)/);
  assert.match(verifierSource, /evaluateVirginiaRequiredStoreProof/);
  assert.match(verifierSource, /matchesSupportedOrigin/);
  assert.match(verifierSource, /hasSafePositiveQuantity/);
  assert.match(verifierSource, /sourcePremisesProofVersion/);
  assert.match(verifierSource, /signal\.stale\s*\|\|\s*signal\.sourceStale/);
  assert.match(verifierSource, /signal\.alertable\s*\|\|\s*signal\.canAlertAsInventory\s*\|\|\s*signal\.canAlertAsWatch/);
  assert.match(verifierSource, /missingSupportedStores/);
  assert.match(verifierSource, /rollingFreshnessRoadblocks/);
  assert.match(verifierSource, /expiredInventorySignals/);
});

test('production refresh isolates an explicitly stale Virginia lane without weakening targeted recovery', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/refresh-feed.yml', import.meta.url), 'utf8');
  const verifier = await readFile(new URL('../src/verify-va.mjs', import.meta.url), 'utf8');
  const verifyIndex = workflow.indexOf('npm run verify:va');
  const publishIndex = workflow.indexOf('Publish and atomically activate encrypted snapshot');
  assert.ok(verifyIndex >= 0, 'refresh workflow must run verify:va');
  assert.ok(publishIndex > verifyIndex, 'Virginia verification must precede publication');
  assert.match(workflow, /npm run verify:va -- --allow-safe-stale-fallback/);
  assert.match(workflow, /inputs\.states && contains\(inputs\.states, 'VA'\)[^]*run: npm run verify:va/);
  assert.match(workflow, /va_required_store_id:/);
  assert.match(workflow, /BOURBON_SIGNAL_VA_REQUIRED_STORE_ID:\s*\$\{\{ inputs\.va_required_store_id \|\| '' \}\}/);
  assert.match(workflow, /Validate Virginia required-store dispatch/);
  assert.match(workflow, /inputs\.va_required_store_id != ''/);
  assert.match(workflow, /states\.includes\('VA'\)/);
  assert.match(workflow, /va_required_store_id requires an explicit VA state target/);
  assert.match(verifier, /allow-safe-stale-fallback/);
  assert.match(verifier, /\^stale_/);
  assert.match(verifier, /!requiredTargetStoreIds\.length\s*&&\s*allowSafeStaleFallback/);
  assert.match(verifier, /stateAlertableSignals/);
  assert.match(verifier, /expiredAlertableDrops/);
  assert.match(verifier, /flatMap\(\(signal\) => \[signal\.sourceSignalId, signal\.key\]/);
  assert.match(verifier, /!allowSafeStaleFallback\s*&&\s*rollingFreshnessRoadblocks\.length/);
  assert.match(verifier, /evaluateVirginiaRequiredStoreProof/);
  assert.match(verifier, /supportedOrigins\.get\(storeId\)/);
  assert.match(verifier, /alertableDrops/);
  assert.match(verifier, /eligibleAlertCandidates/);
  assert.match(workflow, /uses:\s*actions\/cache\/restore@v4/);
  assert.match(workflow, /if:\s*always\(\)[^]*uses:\s*actions\/cache\/save@v4/);
  assert.match(workflow, /inventory-collector-state-/);
  assert.match(workflow, /if:\s*success\(\)[^]*inventory-published-site-/);
  const collectorRestore = workflow.match(/- name: Restore collector artifacts[\s\S]*?(?=\n      - name:)/)?.[0] || '';
  const siteRestore = workflow.match(/- name: Restore last published site contract[\s\S]*?(?=\n      - name:)/)?.[0] || '';
  assert.doesNotMatch(collectorRestore, /inventory-refresh-/);
  assert.doesNotMatch(siteRestore, /inventory-refresh-/);
});

test('operational snapshot preserves Virginia product and stale-source metadata for downstream verification', async () => {
  const operational = await readFile(new URL('../src/operational-report.mjs', import.meta.url), 'utf8');
  assert.match(operational, /productCode:/);
  assert.match(operational, /productLimitedCaveat:/);
  assert.match(operational, /sourceStale:\s*signal\.sourceStale === true \|\| virginiaInventoryExpired\(signal\)/);
  assert.match(operational, /storeHours:/);
  assert.match(operational, /storePhone:/);
  assert.match(operational, /storeUrl:/);
  assert.match(operational, /\['GA', 'VA'\]\.includes\(signal\.state\)/);
  assert.match(operational, /premisesVerified:\s*signal\.premisesVerified === true \|\| signal\.raw\?\.premisesVerified === true/);
  assert.match(operational, /sourcePremisesProofVersion:/);
});

test('Virginia supported-store identities propagate from precision collection into the state report', async () => {
  const precisionRuntime = await readFile(new URL('../src/sources/legacy-precision-runtime.mjs', import.meta.url), 'utf8');
  const stateCollector = await readFile(new URL('../src/collectors/generic-state.mjs', import.meta.url), 'utf8');
  assert.match(precisionRuntime, /const metadata = value\.metadata \|\| result\.metadata/);
  assert.match(stateCollector, /precisionMetadata:\s*precisionProbe\.metadata/);
});

test('Virginia supported-store metadata survives a retained not-due precision result', async () => {
  let calls = 0;
  const base = {
    sourceId: 'precision:va-metadata-test',
    stateId: 'VA',
    label: 'Virginia metadata test',
    url: 'https://example.test/va',
    collect: async () => {
      calls += 1;
      return { signals: [], roadblocks: [], metadata: { virginia: { supportedOriginStoreIds: ['101'], storeUniverseVerified: true } } };
    }
  };
  const first = await runLegacyPrecisionSource({
    ...base,
    sourceRunnerOptions: { now: () => '2026-07-19T12:00:00.000Z', baseCadenceMs: 60_000, minCadenceMs: 60_000, maxCadenceMs: 60_000, maxAttempts: 1 }
  });
  first.sourceResults[0].schedule.nextProbeAt = '2026-07-19T12:01:00.000Z';
  first.sourceResults[0].value = { signals: [], roadblocks: [] };
  const retained = await runLegacyPrecisionSource({
    ...base,
    previousResults: first.sourceResults,
    sourceRunnerOptions: {
      now: () => '2026-07-19T12:00:30.000Z',
      baseCadenceMs: 60_000,
      minCadenceMs: 60_000,
      maxCadenceMs: 60_000,
      maxAttempts: 1,
      sourceMetrics: { 'precision:va-metadata-test': { lastProbeAt: '2026-07-19T12:00:00.000Z' } }
    }
  });
  assert.equal(calls, 1);
  assert.deepEqual(retained.metadata, first.metadata);
});

test('site export preserves Virginia stale-source labeling instead of silently normalizing it away', async () => {
  const exporter = await readFile(new URL('../src/export-site-contract.mjs', import.meta.url), 'utf8');
  assert.match(exporter, /signal\.sourceStale === true \|\| ohioFeedStaleCaveat\(signal\)/);
  assert.match(exporter, /signal\.staleSourceCaveat \|\|/);
  assert.match(exporter, /productCode:\s*virginiaProof\.codeConflict \? null/);
  assert.match(exporter, /productLimitedCaveat:[^\n]*signal\.productLimitedCaveat/);
  assert.match(exporter, /premisesVerified:\s*virginiaProofAllowed/);
  assert.match(exporter, /sourcePremisesProofVersion:/);

  const bible = bibleLookup([{ id: 'wt-rare-breed', canonical: 'Wild Turkey Rare Breed Bourbon', aliases: [], tier: 'limited' }]);
  const unsafeInput = {
    id: 'unsafe-va-target', key: 'unsafe-va-target', state: 'VA', stateCode: 'VA', eventType: 'store_inventory_result',
    sourceLabel: 'Virginia ABC storeNearby inventory API', sourceUrl: 'https://www.abc.virginia.gov/stores/40',
    productCode: '022199', rawName: 'Wild Turkey Rare Breed Bourbon', canonicalName: 'Wild Turkey Rare Breed Bourbon',
    canonicalBottleId: 'wt-rare-breed', bottleId: 'wt-rare-breed', tier: 'limited',
    storeId: '40', storeAddress: '22000 Dulles Retail Plaza, Unit 166', city: 'Sterling', zip: '20166',
    locationPrecision: 'store_level', quantity: Number.MAX_SAFE_INTEGER + 1, reportedQuantity: Number.MAX_SAFE_INTEGER + 1,
    canAlertAsInventory: true, canAlertAsWatch: true, sourceAvailabilityVerified: true,
    premisesVerified: false, sourcePremisesProofVersion: null, targetStoreIds: ['40', '61', '82', '362'],
    productLimitedCaveat: false, observedAt: new Date().toISOString()
  };
  const unsafe = publicSignal(unsafeInput, bible);
  assert.equal(unsafe.quantity, 0);
  assert.equal(unsafe.reportedQuantity, null);
  assert.equal(unsafe.canAlertAsInventory, false);
  assert.equal(unsafe.canAlertAsWatch, false);
  assert.equal(unsafe.eligibleForOnSite, false);
  assert.equal(unsafe.eligibleForDelivery, false);
  assert.equal(unsafe.premisesVerified, false);
  assert.deepEqual(buildDrops([unsafeInput], bible, [unsafeInput]), []);

  const conflictInput = {
    ...unsafeInput,
    id: 'conflicting-va-target', key: 'conflicting-va-target', productCode: '018006', quantity: 6, reportedQuantity: 6,
    premisesVerified: true, sourcePremisesProofVersion: 1, virginiaCacheSchemaVersion: 3,
    raw: { product: { code: '022199', targetStoreIds: ['40', '61', '82', '362'] }, virginiaCacheSchemaVersion: 3 }
  };
  assert.deepEqual(buildDrops([conflictInput], bible, [conflictInput]), []);
  assert.equal(confidenceForSignal(conflictInput).canAlertAsInventory, false);

  const safeInput = {
    ...unsafeInput,
    id: 'safe-va-target', key: 'safe-va-target', quantity: 6, reportedQuantity: 6,
    premisesVerified: true, sourcePremisesProofVersion: 1, virginiaCacheSchemaVersion: 3,
    raw: { product: { code: '022199', targetStoreIds: ['40', '61', '82', '362'] }, virginiaCacheSchemaVersion: 3 }
  };
  const safeDrops = buildDrops([safeInput], bible, [safeInput]);
  assert.equal(safeDrops.length, 1);
  assert.equal(safeDrops[0].quantity, 6);
  assert.equal(safeDrops[0].canAlertAsInventory, true);
  assert.equal(safeDrops[0].eligibleForOnSite, true);
  assert.equal(safeDrops[0].eligibleForDelivery, true);
});

test('confidence policy cannot re-enable stale Virginia inventory after collector freshness gating', () => {
  const result = confidenceForSignal({
    state: 'VA',
    eventType: 'store_inventory_result',
    locationPrecision: 'store_level',
    quantity: 4,
    availabilityStatus: 'in_stock',
    confidence: 0.78,
    sourceStale: true,
    sourceAvailabilityVerified: true,
    premisesVerified: true,
    sourcePremisesProofVersion: 1,
    raw: { product: { code: 'A', limitedCaveat: false }, virginiaCacheSchemaVersion: 3 }
  });
  assert.equal(result.canAlertAsInventory, false);
  assert.equal(result.canAlertAsWatch, false);

  const expired = confidenceForSignal({
    state: 'VA',
    eventType: 'store_inventory_result',
    locationPrecision: 'store_level',
    quantity: 4,
    availabilityStatus: 'in_stock',
    confidence: 0.78,
    sourceStale: false,
    sourceAvailabilityVerified: true,
    premisesVerified: true,
    sourcePremisesProofVersion: 1,
    observedAt: new Date(Date.now() - 25 * HOUR).toISOString(),
    raw: { product: { code: 'A', limitedCaveat: false }, virginiaCacheSchemaVersion: 3 }
  });
  assert.equal(expired.canAlertAsInventory, false);
  assert.equal(expired.canAlertAsWatch, false);
});

test('stale Virginia cache remains visible but is never labeled live or alertable', () => {
  const now = Date.parse('2026-07-19T18:00:00.000Z');
  const rows = applyVirginiaInventoryFreshness([
    signal('A', '101', '2026-07-18T16:00:00.000Z', 4),
    signal('A', '102', '2026-07-19T17:00:00.000Z', 2)
  ], now, 24 * HOUR);

  const stale = rows.find((row) => row.storeId === '101');
  const fresh = rows.find((row) => row.storeId === '102');
  assert.equal(stale?.sourceStale, true);
  assert.equal(stale?.canAlertAsInventory, false);
  assert.match(stale?.staleSourceCaveat || '', /last confirmed/i);
  assert.equal(fresh?.sourceStale, false);
  assert.equal(fresh?.canAlertAsInventory, true);
});

test('Virginia targeted freshness gate ignores policy-only limited products but blocks stale regular inventory', () => {
  const now = Date.parse('2026-07-22T15:30:00.000Z');
  const observedAt = '2026-07-21T14:00:00.000Z';
  assert.equal(isVirginiaRegularInventoryExpired({ eventType: 'store_inventory_result', productLimitedCaveat: true, observedAt }, now), false);
  assert.equal(isVirginiaRegularInventoryExpired({ eventType: 'store_inventory_result', productLimitedCaveat: false, observedAt }, now), true);
  assert.equal(isVirginiaRegularInventoryExpired({ eventType: 'store_inventory_result', raw: { product: { limitedCaveat: true } }, observedAt }, now), false);
  assert.equal(isVirginiaRegularInventoryExpired({ eventType: 'store_inventory_result', raw: { product: { limitedCaveat: false } }, observedAt }, now), true);
});

test('Virginia global quality accepts the 20-row live floor and only an explicitly non-alerting stale lane', () => {
  const freshRows = Array.from({ length: 700 }, (_, index) => ({
    locationPrecision: 'store_level',
    canAlertAsInventory: index < 20,
    canAlertAsWatch: index < 20,
  }));
  assert.equal(validateVirginiaGlobalQuality({ status: 'useful', stale: false }, freshRows).ok, true);
  assert.equal(validateVirginiaGlobalQuality({ status: 'useful', stale: false }, freshRows.map((row, index) => ({ ...row, canAlertAsInventory: index < 19 }))).ok, false);

  const staleRows = freshRows.map((row) => ({ ...row, alertable: false, canAlertAsInventory: false, canAlertAsWatch: false }));
  assert.equal(validateVirginiaGlobalQuality({ status: 'stale_useful', stale: true }, staleRows).ok, true);
  assert.equal(validateVirginiaGlobalQuality({ status: 'stale_useful', stale: true }, [{ ...staleRows[0], canAlertAsWatch: true }, ...staleRows.slice(1)]).ok, false);
});
