import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NEW_YORK_RETAILER_SOURCES,
  COLORADO_RETAILER_SOURCES,
  normalizeMetroCityHiveQuantity,
  parseMetroCityHiveHtml,
  parseMetroShopifyProducts,
  verifyMetroShopifyFulfillmentPolicy,
} from '../src/collectors/metro-retailer-surfaces.mjs';
import {
  isMetroRetailerInventory,
  isMetroRetailerSignalIdentity,
} from '../src/metro-retailer-policy.mjs';
import { confidenceForSignal, STATE_CONFIDENCE_POLICY } from '../src/confidence-policy.mjs';
import { collectPrecisionProbes, legacyPrecisionRuntimeOptions } from '../src/collectors/precision-probes.mjs';
import { getStateLifecycle } from '../src/state-lifecycle.mjs';
import { ALL_STATE_SOURCES } from '../src/state-sources.mjs';

const nyCityHive = NEW_YORK_RETAILER_SOURCES.find((source) => source.id === 'cellar-53');
const nyShopify = NEW_YORK_RETAILER_SOURCES.find((source) => source.id === 'broadway-spirits');
const coCityHive = COLORADO_RETAILER_SOURCES.find((source) => source.id === 'bonnie-brae-liquor');

function encodedPage(payload) {
  return `<script>window.__DATA__=JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(payload))}"))</script>`;
}

function cityHivePayload(source, { quantity = 4, address, merchantId, productName = 'Buffalo Trace Bourbon 750ml' } = {}) {
  const store = source.stores[0];
  const resolvedMerchantId = merchantId || store.merchantId;
  return {
    merchant_configs: [{ merchant: { id: resolvedMerchantId, display_name: store.name, address: { full_address: address || store.address, address_properties: { city: store.city, state: store.stateCode, zip: store.zip } } } }],
    products: [{
      id: 'product-1', name: productName, basic_category: ['bourbon'], size: { quantity: '750', measure: 'ml' },
      merchants: [{ merchant_id: resolvedMerchantId, merchant_name: store.name, full_address: address || store.address, offer_types: ['pick_up'], product_options: [{
        product_id: 'product-1', option_id: 'option-1', merchant_id: resolvedMerchantId, merchant_name: store.name,
        full_address: address || store.address, quantity, price: 34.99,
        product_url: `${source.baseUrl}/shop/product/buffalo-trace-bourbon/product-1?option-id=option-1`,
        option_display_data: { name: productName, size: { quantity: '750', measure: 'ml' }, basic_category: ['bourbon'] },
      }] }],
    }],
  };
}

function signalFor(source, row, overrides = {}) {
  const store = source.stores.find((candidate) => candidate.merchantId === row.merchantId);
  return {
    id: `${source.stateCode}:${source.id}:${row.productId}:${row.variantId}`,
    state: source.stateCode,
    stateCode: source.stateCode,
    sourceLabel: source.sourceLabel,
    sourceUrl: row.productUrl,
    sourceChain: source.id,
    merchantId: row.merchantId,
    productId: row.productId,
    variantId: row.variantId,
    rawName: row.title,
    canonicalBottleId: 'buffalo-trace-bourbon',
    canonicalName: 'Buffalo Trace Bourbon',
    eventType: 'retailer_store_inventory_result',
    locationPrecision: 'store_level',
    locationName: `${store.name} — ${store.address}`,
    storeId: store.id,
    storeName: store.name,
    storeAddress: store.address,
    address: store.address,
    city: store.city,
    area: source.area,
    postalCode: store.zip,
    zip: store.zip,
    quantity: row.quantity,
    quantityIsExact: row.quantityIsExact,
    reportedQuantity: row.reportedQuantity,
    availabilityStatus: 'in_stock',
    sourceAvailabilityVerified: true,
    observedAt: new Date().toISOString(),
    inventorySemantics: row.inventorySemantics,
    raw: { chain: source.id, platform: source.platform, merchantId: row.merchantId, reportedQuantity: row.reportedQuantity },
    ...overrides,
  };
}

test('NYC and Denver registries are bounded to exact first-party retailer identities', () => {
  assert.deepEqual(NEW_YORK_RETAILER_SOURCES.map((source) => source.id), ['cellar-53', 'broadway-spirits', 'flatiron-wines']);
  assert.deepEqual(COLORADO_RETAILER_SOURCES.map((source) => source.id), ['bonnie-brae-liquor', 'mollys-spirits', 'total-beverage']);
  assert.ok(NEW_YORK_RETAILER_SOURCES.every((source) => source.stateCode === 'NY' && source.area === 'New York City'));
  assert.ok(COLORADO_RETAILER_SOURCES.every((source) => source.stateCode === 'CO' && source.area === 'Denver Metro'));
  assert.equal(new Set(NEW_YORK_RETAILER_SOURCES.flatMap((source) => source.stores.map((store) => store.address))).size, 3);
  assert.ok(new Set(COLORADO_RETAILER_SOURCES.flatMap((source) => source.stores.map((store) => store.address))).size >= 4);
  for (const source of [...NEW_YORK_RETAILER_SOURCES, ...COLORADO_RETAILER_SOURCES]) {
    assert.match(source.baseUrl, /^https:\/\//);
    assert.ok(source.inventoryEligible);
    assert.ok(source.stores.every((store) => store.id && store.name && store.address && store.city && store.zip && store.merchantId));
  }
});

test('CityHive parser requires allowlisted merchant, exact premises, pickup, positive availability, and safe format', () => {
  const [row] = parseMetroCityHiveHtml(encodedPage(cityHivePayload(coCityHive)), coCityHive);
  assert.equal(row.merchantId, coCityHive.stores[0].merchantId);
  assert.equal(row.quantity, 4);
  assert.equal(row.quantityIsExact, true);
  assert.equal(row.inventorySemantics, 'exact_retailer_reported_quantity');
  assert.equal(parseMetroCityHiveHtml(encodedPage(cityHivePayload(coCityHive, { merchantId: 'forged' })), coCityHive).length, 0);
  assert.equal(parseMetroCityHiveHtml(encodedPage(cityHivePayload(coCityHive, { address: '1 Forged Ave, Miami, FL 33101' })), coCityHive).length, 0);
  assert.equal(parseMetroCityHiveHtml(encodedPage(cityHivePayload(coCityHive, { quantity: 0 })), coCityHive).length, 0);
  assert.equal(parseMetroCityHiveHtml(encodedPage(cityHivePayload(coCityHive, { productName: 'Buffalo Trace Mini Gift Pack 12 x 50ml' })), coCityHive).length, 0);
  assert.deepEqual(normalizeMetroCityHiveQuantity(9), { reportedQuantity: 9, quantity: 9, quantityIsExact: true, binaryAvailability: false });
  assert.deepEqual(normalizeMetroCityHiveQuantity(100), { reportedQuantity: 100, quantity: 0, quantityIsExact: false, binaryAvailability: true });
});

test('Shopify parser and fulfillment verifier require same-host pickup proof and available variants', () => {
  const html = `Pickup location Broadway Spirits Free. Usually ready in 1hr. 299 Broadway New York, NY, 10007. Store Pickup.`;
  assert.equal(verifyMetroShopifyFulfillmentPolicy(nyShopify, html), true);
  assert.equal(verifyMetroShopifyFulfillmentPolicy(nyShopify, 'Shipping is available nationwide.'), false);
  const rows = parseMetroShopifyProducts({ products: [{ id: 1, title: 'Buffalo Trace Bourbon 750ml', handle: 'buffalo-trace-bourbon', product_type: 'Bourbon', variants: [{ id: 2, title: '750ml', available: true, price: '34.99' }, { id: 3, title: '750ml', available: false, price: '34.99' }] }] }, nyShopify);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, 0);
  assert.equal(rows[0].quantityIsExact, false);
  assert.equal(rows[0].inventorySemantics, 'binary_retailer_orderable_no_exact_count');
  assert.equal(parseMetroShopifyProducts({ products: [{ id: 4, title: 'Buffalo Trace Candle', handle: 'candle', variants: [{ id: 5, title: 'Default', available: true }] }] }, nyShopify).length, 0);
});

test('central identity and confidence policy fail closed on every forged dimension', () => {
  const [row] = parseMetroCityHiveHtml(encodedPage(cityHivePayload(nyCityHive)), nyCityHive);
  const valid = signalFor(nyCityHive, row);
  assert.equal(isMetroRetailerSignalIdentity(valid), true);
  assert.equal(isMetroRetailerInventory(valid), true);
  assert.equal(confidenceForSignal(valid).canAlertAsInventory, true);
  for (const forged of [
    { ...valid, sourceUrl: 'https://attacker.example/product' },
    { ...valid, merchantId: 'forged' },
    { ...valid, storeAddress: '1 Forged Ave, Miami, FL 33101', address: '1 Forged Ave, Miami, FL 33101' },
    { ...valid, city: 'Miami' },
    { ...valid, stateCode: 'FL' },
    { ...valid, sourceAvailabilityVerified: false },
    { ...valid, locationPrecision: 'statewide_catalog' },
    { ...valid, rawName: 'Buffalo Trace Mini Gift Pack 12 x 50ml' },
  ]) {
    assert.equal(isMetroRetailerInventory(forged), false, JSON.stringify(forged));
    assert.equal(confidenceForSignal(forged).canAlertAsInventory, false, JSON.stringify(forged));
  }
});

test('New York and Colorado are runner-routed metro inventory states with conservative public scope', async () => {
  for (const [state, area] of [['NY', 'New York City'], ['CO', 'Denver Metro']]) {
    const lifecycle = getStateLifecycle(state);
    assert.ok(['shadow', 'active'].includes(lifecycle?.publicStatus));
    assert.equal(lifecycle.coverageTier, 'live_store_inventory');
    assert.equal(lifecycle.refinementLevel, 'city');
    assert.deepEqual(lifecycle.areaOptions, [area]);
    assert.ok(ALL_STATE_SOURCES.some((source) => source.id === state && source.sources.length >= 3));
    assert.equal(legacyPrecisionRuntimeOptions(state).schedule, undefined);
    const result = await collectPrecisionProbes({ id: state, sources: [] }, { match: () => ({ record: null }) }, [], { sourceRunnerOptions: { run: async () => ({ signals: [], roadblocks: [] }) } });
    assert.ok(result && Array.isArray(result.signals) && Array.isArray(result.roadblocks));
  }
  assert.equal(STATE_CONFIDENCE_POLICY.NY.maxAlertMode, 'policy_only');
  assert.equal(STATE_CONFIDENCE_POLICY.CO.maxAlertMode, 'policy_only');
});
