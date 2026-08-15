import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as expansion from '../src/collectors/florida-15-20-expansion.mjs';
import { isFloridaRetailerInventory } from '../src/florida-retailer-policy.mjs';

const observedAt = new Date().toISOString();
const immutableBaseline = JSON.parse(readFileSync(new URL('../data/florida-15-20-baseline.json', import.meta.url), 'utf8'));

function matchedBottle(name) {
  return {
    match: { confidence: 0.96 },
    record: { id: 'fixture-bottle', canonical: name, tier: 'high_signal' },
    unsafeReason: null,
  };
}

function directoryRow(store) {
  return {
    store_code: Number(store.storeNumber),
    name: store.name,
    address: store.officialAddress,
    city: store.city,
    state: store.state,
    zip: store.zip,
    latitude: store.officialLatitude,
    longitude: store.officialLongitude,
    is_active: store.active,
  };
}

function directoryResponses(stores = expansion.FLORIDA_ABC_STORES) {
  const slices = [stores.slice(0, 50), stores.slice(50, 100), stores.slice(100, 122), stores.slice(122)];
  return expansion.FLORIDA_ABC_DIRECTORY_QUERIES.map((query, index) => ({
    query,
    payload: JSON.stringify({ retailLocations: slices[index].map(directoryRow) }),
  }));
}

function inventoryPayload({ mutateLocations, mutateAvailability } = {}) {
  const locations = Object.fromEntries(expansion.FLORIDA_ABC_STORES.map((store, index) => [store.storeNumber, {
    value: store.name,
    child_sku: `599102-${store.storeNumber}`,
    inventory_level: (index % 98) + 1,
    id: 6000 + index,
    option_value_id: 7000 + index,
    calculated_price: 34.99,
  }]));
  const availability = expansion.FLORIDA_ABC_STORES.map((store) => Number(store.storeNumber));
  mutateLocations?.(locations);
  mutateAvailability?.(availability);
  return JSON.stringify({ results: [{
    name: "Maker's Mark Bourbon 750ml",
    sku: '599102',
    url: '/makers-mark-bourbon/599102',
    ss_in_stock: '1',
    ss_location_availability: availability,
    ss_locations: JSON.stringify(locations).replace(/"/g, '&quot;'),
  }] });
}

test('reviewed immutable ABC registry contains exactly 126 active identities and 136 total Florida expansion targets', () => {
  assert.equal(expansion.FLORIDA_ABC_STORE_REGISTRY_SHA256, 'd56369e11b4883b59d7dcadd4de48f4388bbc489b2549b8c3016744ab717e1cc');
  assert.equal(expansion.FLORIDA_ABC_STORES.length, 126);
  assert.equal(expansion.FLORIDA_EXPANSION_STORE_TARGETS.length, 136);
  assert.equal(new Set(expansion.FLORIDA_ABC_STORES.map((store) => store.storeNumber)).size, 126);
  assert.ok(Object.isFrozen(expansion.FLORIDA_ABC_STORES));
  assert.ok(expansion.FLORIDA_ABC_STORES.every((store) => Object.isFrozen(store)
    && store.active === true
    && store.state === 'FL'
    && store.officialAddress
    && Number.isFinite(store.lat)
    && Number.isFinite(store.lng)));
  assert.deepEqual(expansion.floridaExpansionRequestBudget(), {
    primoProductsPages: 1,
    primoProductPages: 8,
    shipmentShopifyPages: 12,
    abcDirectoryQueries: 4,
    abcSearchspringPages: 1,
    tivoliProductPages: 1,
    maximumRequests: 27,
  });
});

test('official directory validation uses exactly four pinned queries and fails closed on universe or identity drift', () => {
  assert.deepEqual(expansion.FLORIDA_ABC_DIRECTORY_QUERIES, ['Pensacola', 'West Palm Beach', 'Gainesville', 'Tampa']);
  assert.deepEqual(expansion.FLORIDA_ABC_DIRECTORY_URLS, expansion.FLORIDA_ABC_DIRECTORY_QUERIES.map((query) => `https://abc.irishtitan.cloud/api/retail-locations?search=${encodeURIComponent(query)}&radius=1000`));
  assert.deepEqual(expansion.validateFloridaAbcDirectoryResponses(directoryResponses()), expansion.FLORIDA_ABC_STORES);
  const overlapping = directoryResponses();
  overlapping[1] = { ...overlapping[1], payload: JSON.stringify({ retailLocations: [directoryRow(expansion.FLORIDA_ABC_STORES[0]), ...expansion.FLORIDA_ABC_STORES.slice(50, 100).map(directoryRow)] }) };
  assert.deepEqual(expansion.validateFloridaAbcDirectoryResponses(overlapping), expansion.FLORIDA_ABC_STORES);

  assert.throws(() => expansion.validateFloridaAbcDirectoryResponses(directoryResponses(expansion.FLORIDA_ABC_STORES.slice(1))), /missing|126|universe/i);
  const inactive = directoryResponses();
  inactive[0] = { ...inactive[0], payload: JSON.stringify({ retailLocations: [{ ...directoryRow(expansion.FLORIDA_ABC_STORES[0]), is_active: false }, ...expansion.FLORIDA_ABC_STORES.slice(1, 50).map(directoryRow)] }) };
  assert.throws(() => expansion.validateFloridaAbcDirectoryResponses(inactive), /inactive/i);
  const mismatch = directoryResponses();
  mismatch[0] = { ...mismatch[0], payload: JSON.stringify({ retailLocations: [{ ...directoryRow(expansion.FLORIDA_ABC_STORES[0]), zip: '00000' }, ...expansion.FLORIDA_ABC_STORES.slice(1, 50).map(directoryRow)] }) };
  assert.throws(() => expansion.validateFloridaAbcDirectoryResponses(mismatch), /identity|mismatch/i);
  const duplicate = directoryResponses();
  duplicate[0] = { ...duplicate[0], payload: JSON.stringify({ retailLocations: [directoryRow(expansion.FLORIDA_ABC_STORES[0]), directoryRow(expansion.FLORIDA_ABC_STORES[0]), ...expansion.FLORIDA_ABC_STORES.slice(1, 50).map(directoryRow)] }) };
  assert.throws(() => expansion.validateFloridaAbcDirectoryResponses(duplicate), /duplicate/i);
});

test('one Searchspring payload intersects the exact 126-store universe and emits identity-bound positive rows', () => {
  const rows = expansion.parseFloridaAbcSearchspringInventory(inventoryPayload(), matchedBottle);
  assert.equal(rows.length, 126);
  assert.deepEqual(rows.map((row) => row.target.storeNumber), expansion.FLORIDA_ABC_STORES.map((store) => store.storeNumber));
  assert.ok(rows.every((row) => Number.isInteger(row.quantity) && row.quantity > 0 && row.childSku === `${row.productId}-${row.storeNumber}`));

  assert.deepEqual(expansion.parseFloridaAbcSearchspringInventory(inventoryPayload({ mutateLocations: (locations) => { delete locations['3']; } }), matchedBottle), []);
  assert.deepEqual(expansion.parseFloridaAbcSearchspringInventory(inventoryPayload({ mutateLocations: (locations) => { locations['999'] = { ...locations['3'], value: 'Forged' }; } }), matchedBottle), []);
  assert.deepEqual(expansion.parseFloridaAbcSearchspringInventory(inventoryPayload({ mutateLocations: (locations) => { locations['3'].value = 'Forged'; } }), matchedBottle), []);
  assert.deepEqual(expansion.parseFloridaAbcSearchspringInventory(inventoryPayload({ mutateAvailability: (availability) => { availability.push(availability[0]); } }), matchedBottle), []);

  const signals = expansion.collectFloridaAbcExpansionFromPayload({ payload: inventoryPayload(), observedAt, matchBottle: matchedBottle });
  assert.equal(new Set(signals.map((signal) => signal.storeId)).size, 126);
  assert.ok(signals.every((signal) => signal.quantityIsExact
    && signal.quantity === signal.reportedQuantity
    && Number.isFinite(signal.lat)
    && Number.isFinite(signal.lng)
    && signal.raw.officialAddress
    && signal.raw.officialLatitude
    && signal.raw.officialLongitude));
  assert.ok(signals.every(isFloridaRetailerInventory));
  assert.equal(isFloridaRetailerInventory({ ...signals[0], lat: signals[0].lat + 0.001 }), false);
  assert.equal(isFloridaRetailerInventory({ ...signals[0], raw: { ...signals[0].raw, officialAddress: 'FORGED' } }), false);
});

test('live ABC lane makes four directory requests then one inventory request and stops before inventory on directory drift', async () => {
  const responseByUrl = new Map(directoryResponses().map(({ query, payload }) => [
    `https://abc.irishtitan.cloud/api/retail-locations?search=${encodeURIComponent(query)}&radius=1000`, payload,
  ]));
  responseByUrl.set(expansion.FLORIDA_ABC_SEARCHSPRING_URL, inventoryPayload());
  const calls = [];
  const result = await expansion.collectFloridaAbcExpansion({
    observedAt,
    matchBottle: matchedBottle,
    fetchText: async (url) => {
      calls.push(url);
      return { ok: true, status: 200, url, text: responseByUrl.get(url) };
    },
  });
  assert.deepEqual(calls, [...expansion.FLORIDA_ABC_DIRECTORY_URLS, expansion.FLORIDA_ABC_SEARCHSPRING_URL]);
  assert.equal(result.roadblocks.length, 0);
  assert.equal(new Set(result.signals.map((signal) => signal.storeId)).size, 126);

  const partialByUrl = new Map(responseByUrl);
  const partial = directoryResponses(expansion.FLORIDA_ABC_STORES.slice(1));
  partialByUrl.set(expansion.FLORIDA_ABC_DIRECTORY_URLS[0], partial[0].payload);
  const partialCalls = [];
  const failed = await expansion.collectFloridaAbcExpansion({
    observedAt,
    matchBottle: matchedBottle,
    fetchText: async (url) => {
      partialCalls.push(url);
      return { ok: true, status: 200, url, text: partialByUrl.get(url) };
    },
  });
  assert.deepEqual(failed.signals, []);
  assert.ok(failed.roadblocks.length > 0);
  assert.equal(partialCalls.includes(expansion.FLORIDA_ABC_SEARCHSPRING_URL), false);
});

function verifierSignal(target, index) {
  const exactQuantity = target.platform === 'primo' || target.platform === 'abc-searchspring';
  const signal = {
    id: `fl-full-store-${index}`,
    state: 'FL',
    stateCode: 'FL',
    eventType: 'retailer_store_inventory_result',
    sourceLabel: target.sourceLabel,
    sourceUrl: target.platform === 'abc-searchspring'
      ? 'https://www.abcfws.com/makers-mark-bourbon/599102'
      : target.productUrl || new URL(`/products/fixture-${index}`, target.baseUrl).href,
    sourceChain: target.sourceChain,
    merchantId: target.merchantId,
    productId: `product-${index}`,
    variantId: `variant-${index}`,
    rawName: "Maker's Mark Bourbon 750ml",
    canonicalBottleId: 'makers-mark-bourbon',
    canonicalName: "Maker's Mark Bourbon",
    locationPrecision: 'store_level',
    storeName: target.name,
    locationName: target.name,
    storeId: target.storeId,
    storeAddress: target.address,
    city: target.city,
    postalCode: target.zip,
    zip: target.zip,
    quantity: exactQuantity ? 2 : 0,
    quantityIsExact: exactQuantity,
    reportedQuantity: exactQuantity ? 2 : 0,
    availabilityStatus: 'in_stock',
    sourceAvailabilityVerified: true,
    premisesVerified: true,
    canAlertAsInventory: true,
    canAlertAsWatch: true,
    observedAt,
    inventorySemantics: exactQuantity ? 'exact_retailer_reported_quantity' : 'binary_exact_premises_shipment_orderable_no_shelf_count',
    raw: {
      chain: target.sourceChain,
      merchantId: target.merchantId,
      reportedQuantity: exactQuantity ? 2 : 0,
      sourceAvailabilityVerified: true,
      configuredStoreIdentity: true,
    },
  };
  if (target.platform === 'shopify') {
    signal.variantAvailable = true;
    signal.raw.variantAvailable = true;
  }
  if (target.platform === 'abc-searchspring') {
    signal.productId = '599102';
    signal.variantId = String(6000 + index);
    signal.optionValueId = String(7000 + index);
    signal.childSku = `599102-${target.storeNumber}`;
    signal.storeNumber = target.storeNumber;
    signal.controlStoreId = target.storeNumber;
    signal.variantAvailable = true;
    signal.lat = target.lat;
    signal.lng = target.lng;
    Object.assign(signal.raw, {
      productId: signal.productId,
      variantId: signal.variantId,
      optionValueId: signal.optionValueId,
      childSku: signal.childSku,
      storeNumber: target.storeNumber,
      controlStoreId: target.storeNumber,
      variantAvailable: true,
      officialAddress: target.officialAddress,
      officialCity: target.city,
      officialZip: target.zip,
      officialLatitude: target.officialLatitude,
      officialLongitude: target.officialLongitude,
    });
  }
  if (target.platform === 'tivoli') {
    signal.productId = target.expectedProductId;
    signal.variantId = null;
    signal.orderFormVerified = true;
    signal.raw.orderFormVerified = true;
  }
  return signal;
}

test('immutable verifier requires current policy-qualified rows for all 126 ABC and 10 non-ABC targets', async () => {
  const { verifyFloridaExpansionArtifact } = await import('../src/verification/florida-expansion-verifier.mjs');
  const inventory = expansion.FLORIDA_EXPANSION_STORE_TARGETS.map(verifierSignal);
  assert.equal(inventory.length, 136);
  assert.ok(inventory.every(isFloridaRetailerInventory));
  const state = { state: 'FL', status: 'useful', stale: false, generatedAt: observedAt, signals: inventory };
  const summary = verifyFloridaExpansionArtifact({ state, baseline: immutableBaseline, now: Date.now() });
  assert.equal(summary.stores, 136);
  assert.equal(summary.abcStores, 126);
  assert.equal(summary.nonAbcStores, 10);

  const primoIndex = inventory.findIndex((signal) => signal.storeId === 'primo-liquors:southeast');
  const exactZero = {
    ...inventory[primoIndex],
    quantity: 0,
    reportedQuantity: 0,
    availabilityStatus: 'out_of_stock',
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    raw: { ...inventory[primoIndex].raw, reportedQuantity: 0 },
  };
  const observed = inventory.with(primoIndex, exactZero);
  assert.equal(observed.filter(isFloridaRetailerInventory).length, 135);
  const observedSummary = verifyFloridaExpansionArtifact({ state: { ...state, signals: observed }, baseline: immutableBaseline, now: Date.now() });
  assert.equal(observedSummary.stores, 136);
  assert.equal(observedSummary.inventorySignals, 135);
  assert.equal(observedSummary.netNewLiveStores, 135);
  assert.throws(() => verifyFloridaExpansionArtifact({ state: { ...state, signals: inventory.slice(1) }, baseline: immutableBaseline, now: Date.now() }), /136|missing/i);
  assert.throws(() => verifyFloridaExpansionArtifact({ state: { ...state, signals: observed.with(primoIndex, { ...exactZero, observedAt: '2026-08-01T00:00:00.000Z' }) }, baseline: immutableBaseline, now: Date.now() }), /136|missing/i);
  assert.throws(() => verifyFloridaExpansionArtifact({ state: { ...state, signals: observed.with(primoIndex, { ...exactZero, reportedQuantity: 1, raw: { ...exactZero.raw, reportedQuantity: 1 } }) }, baseline: immutableBaseline, now: Date.now() }), /136|missing/i);
  assert.throws(() => verifyFloridaExpansionArtifact({ state: { ...state, signals: inventory.map((row, index) => index === 10 ? { ...row, lat: row.lat + 0.001 } : row) }, baseline: immutableBaseline, now: Date.now() }), /136|missing|identity/i);
});

test('scheduled Florida immutable verification isolates its partition while targeted recovery stays strict', async () => {
  const verifier = await import('../src/verification/florida-expansion-verifier.mjs');
  assert.equal(typeof verifier.verifyFloridaExpansionArtifact, 'function');
  const workflow = readFileSync(new URL('../../.github/workflows/refresh-feed.yml', import.meta.url), 'utf8');
  const scheduled = workflow.match(/- name: Verify Florida scheduled immutable full-store expansion or isolate its partition[\s\S]*?(?=\n      - name:)/)?.[0] || '';
  const targeted = workflow.match(/- name: Verify Florida targeted immutable full-store expansion strictly[\s\S]*?(?=\n      - name:)/)?.[0] || '';
  assert.match(scheduled, /if:\s*\$\{\{ !inputs\.states \}\}[\s\S]*scheduled-state-verification\.mjs verify --state=FL -- npm run verify:fl:15-20/);
  assert.match(targeted, /if:\s*\$\{\{ inputs\.states && contains\(inputs\.states, 'FL'\) \}\}[\s\S]*run: npm run verify:fl:15-20/);
});
