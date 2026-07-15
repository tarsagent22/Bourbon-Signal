import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  CALIFORNIA_SAN_DIEGO_SHOPIFY_SOURCES,
  filterFreshCaliforniaSignals,
  mergeCaliforniaSourceCacheSignals,
  parseCaliforniaShopifyProducts,
  verifyCaliforniaFulfillmentPolicy,
} from '../src/collectors/california-san-diego-surfaces.mjs';
import {
  isCaliforniaRetailerInventory,
  isCaliforniaRetailerSignalIdentity,
} from '../src/california-retailer-policy.mjs';
import { hasPositiveInventoryEvidence } from '../src/operational-candidate-policy.mjs';
import { getStateLifecycle } from '../src/state-lifecycle.mjs';
import { ALL_STATE_SOURCES } from '../src/state-sources.mjs';

const EXPECTED_SOURCES = new Map([
  ['del-mesa-liquor', {
    host: 'www.delmesaliquor.com',
    storeId: 'del-mesa-liquor:6090-friars',
    address: '6090 Friars Road, San Diego, CA 92108-1002',
    inventoryEligible: true,
  }],
  ['mission-trails-wine-spirits', {
    host: 'missiontrailswineandspirits.com',
    storeId: 'mission-trails-wine-spirits:8181-mission-gorge',
    address: '8181 Mission Gorge Rd, Ste A, San Diego, CA 92120',
    inventoryEligible: true,
  }],
  ['chips-liquor', {
    host: 'chipsliquor.com',
    storeId: 'chips-liquor:1926-garnet',
    address: '1926 Garnet Ave, San Diego, CA 92109',
    inventoryEligible: false,
  }],
]);

function productFixture(overrides = {}) {
  return {
    products: [{
      id: 101,
      title: "Maker's Mark Private Selection Bourbon Whiskey 750ml",
      handle: 'makers-mark-private-selection',
      product_type: 'Bourbon',
      tags: ['Bourbon', 'Store Pick'],
      variants: [{ id: 201, title: '750 ml', available: true, price: '69.99', sku: 'MM-750' }],
      ...overrides,
    }],
  };
}

test('California Shopify registry binds exact San Diego retailer identities and pickup eligibility', () => {
  assert.equal(CALIFORNIA_SAN_DIEGO_SHOPIFY_SOURCES.length, EXPECTED_SOURCES.size);
  for (const source of CALIFORNIA_SAN_DIEGO_SHOPIFY_SOURCES) {
    const expected = EXPECTED_SOURCES.get(source.id);
    assert.ok(expected, `unexpected source ${source.id}`);
    assert.equal(source.host, expected.host);
    assert.equal(source.store.id, expected.storeId);
    assert.equal(source.store.address, expected.address);
    assert.equal(source.store.city, 'San Diego');
    assert.equal(source.store.stateCode, 'CA');
    assert.equal(source.inventoryEligible, expected.inventoryEligible);
    assert.equal(source.maxPages, source.inventoryEligible ? 3 : 1);
    assert.match(source.productsUrl, new RegExp(`^https://${source.host.replaceAll('.', '\\.')}/products\\.json`));
    if (source.inventoryEligible) {
      assert.match(source.fulfillmentPolicyUrl, new RegExp(`^https://${source.host.replaceAll('.', '\\.')}/`));
    }
  }
});

test('California fulfillment policy must prove first-party pickup before inventory promotion', () => {
  const [delMesa, missionTrails] = CALIFORNIA_SAN_DIEGO_SHOPIFY_SOURCES;
  assert.equal(verifyCaliforniaFulfillmentPolicy(delMesa, '<p>In-store collection available within 1 to 7 business days</p>'), true);
  assert.equal(verifyCaliforniaFulfillmentPolicy(missionTrails, '<h6>FREE IN STORE PICKUP</h6><span>BUY ONLINE &amp; WE WILL RESERVE YOUR ORDER FOR PICKUP</span>'), true);
  assert.equal(verifyCaliforniaFulfillmentPolicy(delMesa, '<p>Fast nationwide shipping</p>'), false);
  assert.equal(verifyCaliforniaFulfillmentPolicy({ ...delMesa, fulfillmentPolicyUrl: 'https://example.com/pickup' }, '<p>In-store collection available</p>'), false);
});

test('California Shopify parser fails closed on malformed payloads', () => {
  for (const malformed of [null, undefined, '', '{bad json', {}, { products: {} }, { products: [null] }]) {
    assert.deepEqual(parseCaliforniaShopifyProducts(malformed), []);
  }
});

test('California Shopify parser preserves binary availability without inventing quantity', () => {
  const [row] = parseCaliforniaShopifyProducts(productFixture());
  assert.equal(row.productId, '101');
  assert.equal(row.variantId, '201');
  assert.equal(row.title, "Maker's Mark Private Selection Bourbon Whiskey 750ml");
  assert.equal(row.size, '750 ml');
  assert.equal(row.price, 69.99);
  assert.equal(row.quantity, 0);
  assert.equal(row.sourceAvailabilityVerified, true);
  assert.equal(row.inventorySemantics, 'binary_retailer_orderable_no_exact_count');
});

test('California Shopify parser rejects unavailable, miniature, bundle, and non-bourbon products', () => {
  const payload = {
    products: [
      productFixture({ id: 1, variants: [{ id: 11, title: '750 ml', available: false }] }).products[0],
      productFixture({ id: 2, title: 'Buffalo Trace Bourbon 375ml', variants: [{ id: 22, title: '375 ml', available: true }] }).products[0],
      productFixture({ id: 3, title: 'Bourbon Gift Bundle 750ml', variants: [{ id: 33, title: 'Default Title', available: true }] }).products[0],
      productFixture({ id: 4, title: 'London Dry Gin 750ml', product_type: 'Gin', tags: ['Gin'], variants: [{ id: 44, title: '750 ml', available: true }] }).products[0],
      productFixture({ id: 5, title: 'Angels Envy Bourbon 750ml', handle: 'angels-envy-bourbon-3pk', tags: ['Bourbon', '3 pack'], variants: [{ id: 55, title: 'Default Title', available: true }] }).products[0],
      productFixture({ id: 6, title: 'Buffalo Trace Bourbon Multipack 750ml', variants: [{ id: 66, title: 'Default Title', available: true }] }).products[0],
      productFixture({ id: 7, title: 'Buffalo Trace Bourbon 3-pack 750ml', variants: [{ id: 77, title: 'Default Title', available: true }] }).products[0],
      productFixture({ id: 8, title: 'Buffalo Trace Bourbon 3-pk 750ml', variants: [{ id: 88, title: 'Default Title', available: true }] }).products[0],
    ],
  };
  assert.deepEqual(parseCaliforniaShopifyProducts(payload), []);
});

test('California cache freshness follows each source observation timestamp', () => {
  const now = Date.parse('2026-07-14T21:00:00.000Z');
  const rows = [
    { id: 'fresh', observedAt: '2026-07-14T20:59:30.000Z' },
    { id: 'expired', observedAt: '2026-07-14T18:00:00.000Z' },
    { id: 'bad', observedAt: 'not-a-date' },
  ];
  assert.deepEqual(filterFreshCaliforniaSignals(rows, now, 60_000).map((row) => row.id), ['fresh']);
});

test('California partial refresh replaces completed sources and retains only incomplete fresh sources', () => {
  const live = [{ id: 'live-del', sourceChain: 'del-mesa-liquor' }];
  const cached = [
    { id: 'old-del', sourceChain: 'del-mesa-liquor' },
    { id: 'cached-mission', sourceChain: 'mission-trails-wine-spirits' },
    { id: 'cached-chips', sourceChain: 'chips-liquor' },
  ];
  const merged = mergeCaliforniaSourceCacheSignals(live, cached, new Set(['del-mesa-liquor', 'chips-liquor']));
  assert.deepEqual(merged.map((row) => row.id).sort(), ['cached-mission', 'live-del']);
});

test('California collector retries transient first-party policy and product failures before falling back', async () => {
  const collectorSource = await readFile(new URL('../src/collectors/precision-probes.mjs', import.meta.url), 'utf8');
  assert.match(collectorSource, /async function retryCaliforniaFetch/);
  assert.match(collectorSource, /verifyCaliforniaFulfillmentPolicy\(source, result\.text\)/);
  assert.match(collectorSource, /retryCaliforniaFetch\(\(\) => fetchCaliforniaShopifySource\(source\)\)/);
});

test('fresh California cache reuse is not reported as a collection roadblock', async () => {
  const collectorSource = await readFile(new URL('../src/collectors/precision-probes.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(collectorSource, /source:\s*['"]California San Diego first-party Shopify cache reuse['"]/);
});

function californiaSignal(overrides = {}) {
  return {
    state: 'CA',
    stateCode: 'CA',
    sourceLabel: 'Del Mesa Liquor Shopify San Diego orderability with pickup policy',
    sourceUrl: 'https://www.delmesaliquor.com/products/makers-mark-private-selection',
    sourceChain: 'del-mesa-liquor',
    merchantId: 'del-mesa-liquor-shopify',
    productId: '101',
    variantId: '201',
    eventType: 'retailer_store_inventory_result',
    locationPrecision: 'store_level',
    storeId: 'del-mesa-liquor:6090-friars',
    storeAddress: '6090 Friars Road, San Diego, CA 92108-1002',
    city: 'San Diego',
    quantity: 0,
    availabilityStatus: 'in_stock',
    sourceAvailabilityVerified: true,
    inventorySemantics: 'binary_retailer_orderable_no_exact_count',
    canAlertAsInventory: true,
    canAlertAsWatch: true,
    raw: { fulfillmentPolicyVerified: true },
    ...overrides,
  };
}

test('California policy accepts exact pickup-bound binary orderability and projected identity', () => {
  const signal = californiaSignal();
  assert.equal(isCaliforniaRetailerSignalIdentity(signal), true);
  assert.equal(isCaliforniaRetailerInventory(signal), true);
  assert.equal(signal.quantity, 0);

  const projected = {
    ...signal,
    type: signal.eventType,
    eventType: undefined,
    source: signal.sourceLabel,
    sourceLabel: undefined,
    stateCode: undefined,
  };
  assert.equal(isCaliforniaRetailerSignalIdentity(projected), true);
  assert.equal(isCaliforniaRetailerInventory(projected), true);
});

test('California binary orderability counts as positive operational inventory without inventing quantity', () => {
  assert.equal(hasPositiveInventoryEvidence({
    sourceAvailabilityVerified: true,
    availabilityStatus: 'in_stock',
    availabilityLabel: 'Available for retailer pickup/order',
  }, 0), true);
  assert.equal(hasPositiveInventoryEvidence({
    sourceAvailabilityVerified: false,
    availabilityStatus: 'in_stock',
  }, 0), false);
  assert.equal(hasPositiveInventoryEvidence({
    sourceAvailabilityVerified: true,
    availabilityStatus: 'sold_out',
  }, 0), false);
  assert.equal(hasPositiveInventoryEvidence({}, 4), true);
});

test('California policy rejects spoofed host, store, geography, missing variant identity, invented quantity, and catalog watch', () => {
  assert.equal(isCaliforniaRetailerInventory(californiaSignal({ sourceUrl: 'https://evil.example/product' })), false);
  assert.equal(isCaliforniaRetailerInventory(californiaSignal({ storeId: 'del-mesa-liquor:unknown' })), false);
  assert.equal(isCaliforniaRetailerInventory(californiaSignal({ storeAddress: '6090 Friars Road, Phoenix, AZ 85001' })), false);
  assert.equal(isCaliforniaRetailerInventory(californiaSignal({ city: 'Los Angeles' })), false);
  assert.equal(isCaliforniaRetailerInventory(californiaSignal({ variantId: null })), false);
  assert.equal(isCaliforniaRetailerInventory(californiaSignal({ quantity: 1 })), false);
  assert.equal(isCaliforniaRetailerInventory(californiaSignal({ raw: { fulfillmentPolicyVerified: false } })), false);
  assert.equal(isCaliforniaRetailerInventory(californiaSignal({ sourceChain: 'chips-liquor', sourceLabel: 'Chips Liquor Shopify online catalog watch', sourceUrl: 'https://chipsliquor.com/products/test', merchantId: 'chips-liquor-shopify', storeId: 'chips-liquor:1926-garnet', storeAddress: '1926 Garnet Ave, San Diego, CA 92109', eventType: 'retailer_catalog_availability', canAlertAsInventory: false })), false);
});

test('California registry and lifecycle expose one truthful San Diego customer area', () => {
  const california = ALL_STATE_SOURCES.find((row) => row.id === 'CA');
  const labels = new Set(california.sources.map((source) => source.label || source.name));
  for (const label of [
    'Del Mesa Liquor Shopify San Diego pickup availability',
    'Mission Trails Wine & Spirits Shopify San Diego pickup availability',
    'Chips Liquor Shopify online catalog watch',
  ]) assert.ok(labels.has(label), `missing California source ${label}`);

  const lifecycle = getStateLifecycle('CA');
  assert.equal(lifecycle.lifecycle, 'retailer_store_inventory');
  assert.equal(lifecycle.coverageTier, 'live_store_inventory');
  assert.equal(lifecycle.refinementLevel, 'area');
  assert.deepEqual(lifecycle.areaOptions, ['San Diego']);
});

test('current inventory alert projection uses the current snapshot rather than historical rows', async () => {
  const exporter = await readFile(new URL('../src/export-site-contract.mjs', import.meta.url), 'utf8');
  assert.match(
    exporter,
    /const currentInventoryAlertCandidates = buildCurrentInventoryAlertsFromDrops\(currentDrops\);/,
    'fresh current inventory must drive baseline on-site candidates and state-quality alertability',
  );
});
