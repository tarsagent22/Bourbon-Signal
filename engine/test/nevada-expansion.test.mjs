import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NEVADA_RETAILER_SOURCES,
  filterFreshNevadaSignals,
  mergeNevadaSourceCacheSignals,
  parseNevadaCityHiveProducts,
  parseNevadaCityHiveHtml,
  parseNevadaPos360Html,
  parseNevadaShopifyProducts,
  parseNevadaWooCommerceProducts,
  parseNevadaAlbertsonsXapi,
  verifyNevadaFulfillmentPolicy,
  verifyNevadaCityHiveStorePage,
} from '../src/collectors/nevada-retailer-surfaces.mjs';
import {
  isNevadaRetailerInventory,
  isNevadaRetailerSignalIdentity,
} from '../src/nevada-retailer-policy.mjs';
import { confidenceForSignal } from '../src/confidence-policy.mjs';
import { getStateLifecycle } from '../src/state-lifecycle.mjs';
import { ALL_STATE_SOURCES } from '../src/state-sources.mjs';

const expectedSources = new Map([
  ['liquor-world-las-vegas', { host: 'liquorworldlv.com', merchantId: '6019c2d6c8cccb3876fb022c', storeId: 'liquor-world:4795-dean-martin', city: 'Las Vegas' }],
  ['liquor-lineup-north-las-vegas', { host: 'liquorlineup.com', merchantId: '887', storeId: 'liquor-lineup:6462-losee', city: 'North Las Vegas' }],
  ['liquor-box-las-vegas', { host: 'theliquorboxlv.com', merchantId: 'liquorboxlv', storeId: 'liquor-box:7161-hualapai', city: 'Las Vegas' }],
  ['crystal-liquor-las-vegas', { host: 'crystalliquor.com', merchantId: '0cb70604-4fb0-46e9-8d69-a87ef0', storeId: 'crystal-liquor:3655-s-durango', city: 'Las Vegas' }],
  ['albertsons-las-vegas-662', { host: 'www.albertsons.com', merchantId: '662', storeId: 'albertsons:662', city: 'Las Vegas' }],
  ['vons-henderson-2511', { host: 'www.vons.com', merchantId: '2511', storeId: 'vons:2511', city: 'Henderson' }],
  ['safeway-reno-1210', { host: 'www.safeway.com', merchantId: '1210', storeId: 'safeway:1210', city: 'Reno' }],
]);

function shopifyFixture(overrides = {}) {
  return {
    products: [{
      id: 1001,
      title: "Maker's Mark Private Selection Bourbon 750ml",
      handle: 'makers-mark-private-selection-bourbon',
      product_type: 'Bourbon',
      tags: ['Bourbon', 'Store Pick'],
      variants: [{ id: 2001, title: '750 ml', available: true, price: '69.99', sku: 'MM750' }],
      ...overrides,
    }],
  };
}

function cityHiveProduct(overrides = {}) {
  return {
    id: 'prod-1',
    _id: 'prod-1',
    name: 'Buffalo Trace Kentucky Straight Bourbon 750ml',
    basic_category: 'Liquor',
    category: 'Whiskey',
    subcategory: 'Bourbon',
    size: '750ml',
    options: [{
      _id: 'option-1',
      merchant_id: '6019c2d6c8cccb3876fb022c',
      merchant_name: 'Liquor World (Multi)',
      quantity: 3,
      price: 29.99,
      address: { address1: '4795 Dean Martin Drive', city: 'Las Vegas', state: 'NV', zipcode: '89103' },
    }],
    ...overrides,
  };
}

function pos360Html(productOverrides = {}, variantOverrides = {}) {
  const product = {
    id: 'gid://pos360/Product/123',
    name: 'Elijah Craig Barrel Proof Bourbon 750mL',
    slug: 'elijah-craig-barrel-proof-bourbon',
    category: 'Bourbon',
    defaultAvailableVariant: {
      id: 'gid://pos360/ProductVariant/456',
      name: 'Elijah Craig Barrel Proof Bourbon 750mL',
      displayName: 'Elijah Craig Barrel Proof Bourbon 750mL',
      packSize: 1,
      size: 750,
      uom: 'ML',
      containerType: 'BOTTLE',
      fulfillmentOptions: [
        { type: 'PICKUP', isAvailable: true },
        { type: 'DELIVERY', isAvailable: false },
        { type: 'SHIPPING', isAvailable: false },
      ],
      price: { amount: 79.99 },
      store: { storeID: 'liquorboxlv', storeName: 'Liquor Box (Las Vegas)' },
      ...variantOverrides,
    },
    ...productOverrides,
  };
  return `<script>window.__remixContext = ${JSON.stringify({ state: { loaderData: { route: { products: [product] } } } })}</script>`;
}

function wooProduct(overrides = {}) {
  return {
    id: 77,
    name: 'Woodford Reserve Double Oaked Bourbon 750ml',
    slug: 'woodford-reserve-double-oaked-bourbon',
    type: 'simple',
    is_in_stock: true,
    is_purchasable: true,
    prices: { price: '5499', currency_minor_unit: 2 },
    attributes: [{ name: 'Size', terms: [{ name: '750ml' }] }],
    ...overrides,
  };
}

test('Nevada source registry freezes exact first-party retailer identities', () => {
  for (const source of NEVADA_RETAILER_SOURCES) {
    const expected = expectedSources.get(source.id);
    assert.ok(expected, `unexpected source ${source.id}`);
    assert.equal(source.host, expected.host);
    assert.equal(source.merchantId, expected.merchantId);
    assert.equal(source.store.id, expected.storeId);
    assert.equal(source.store.city, expected.city);
    assert.equal(source.store.stateCode, 'NV');
    assert.match(source.store.address, /, NV \d{5}$/);
    assert.equal(Object.isFrozen(source), true);
    assert.equal(Object.isFrozen(source.store), true);
  }
  assert.equal(NEVADA_RETAILER_SOURCES.length, expectedSources.size);
});

test('Nevada parsers fail closed on malformed reachable payloads', () => {
  for (const malformed of [null, undefined, '', '{bad', {}, [], { products: {} }]) {
    assert.deepEqual(parseNevadaShopifyProducts(malformed), []);
    assert.deepEqual(parseNevadaCityHiveProducts(malformed), []);
    assert.deepEqual(parseNevadaWooCommerceProducts(malformed), []);
  }
  assert.deepEqual(parseNevadaPos360Html('<html>not remix json</html>'), []);
});

test('Nevada Shopify parser preserves available variant identity as binary orderability', () => {
  const [row] = parseNevadaShopifyProducts(shopifyFixture());
  assert.deepEqual({ productId: row.productId, variantId: row.variantId, quantity: row.quantity, verified: row.sourceAvailabilityVerified, semantics: row.inventorySemantics }, {
    productId: '1001', variantId: '2001', quantity: 0, verified: true, semantics: 'binary_retailer_orderable_no_exact_count',
  });
});

test('Nevada CityHive parser binds exact merchant options and normalizes sentinels', () => {
  const exact = parseNevadaCityHiveProducts({ products: [cityHiveProduct()] }, { merchantId: '6019c2d6c8cccb3876fb022c' });
  assert.equal(exact.length, 1);
  assert.equal(exact[0].optionId, 'option-1');
  assert.equal(exact[0].quantity, 3);
  assert.equal(exact[0].inventorySemantics, 'exact_retailer_quantity');

  const sentinel = parseNevadaCityHiveProducts({ products: [cityHiveProduct({ options: [{ ...cityHiveProduct().options[0], quantity: 100 }] })] }, { merchantId: '6019c2d6c8cccb3876fb022c' });
  assert.equal(sentinel[0].quantity, 0);
  assert.equal(sentinel[0].sourceAvailabilityVerified, true);
  assert.equal(sentinel[0].inventorySemantics, 'binary_retailer_orderable_no_exact_count');
  assert.deepEqual(parseNevadaCityHiveProducts({ products: [cityHiveProduct()] }, { merchantId: 'attacker' }), []);
});

test('Nevada CityHive public page requires exact store schema and parses only InStock product offers', () => {
  const source = NEVADA_RETAILER_SOURCES.find((row) => row.id === 'liquor-world-las-vegas');
  const html = [
    `<div>${source.merchantId}</div>`,
    `<script type="application/ld+json">${JSON.stringify({ '@type': 'LiquorStore', name: 'Liquor World (Multi)', address: { streetAddress: '4795 Dean Martin Drive', addressLocality: 'Las Vegas', addressRegion: 'NV', postalCode: '89103' } })}</script>`,
    `<script type="application/ld+json">${JSON.stringify({ '@type': 'ItemList', itemListElement: [
      { '@type': 'Product', name: 'Eagle Rare 10 Year Bourbon 750ml', productID: 'option-eagle', sku: '123', url: 'https://liquorworldlv.com/shop/product/eagle-rare/null?option-id=option-eagle', offers: { availability: 'http://schema.org/InStock', price: 72.99 } },
      { '@type': 'Product', name: 'Buffalo Trace Bourbon 750ml', productID: 'option-sold', url: 'https://liquorworldlv.com/shop/product/buffalo-trace/null?option-id=option-sold', offers: { availability: 'http://schema.org/OutOfStock', price: 29.99 } },
    ] })}</script>`,
  ].join('');
  assert.equal(verifyNevadaCityHiveStorePage(source, html), true);
  const rows = parseNevadaCityHiveHtml(html);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].optionId, 'option-eagle');
  assert.equal(rows[0].quantity, 0);
  assert.equal(rows[0].inventorySemantics, 'binary_retailer_orderable_no_exact_count');
  assert.equal(verifyNevadaCityHiveStorePage(source, html.replace('4795 Dean Martin Drive', '999 Fake St')), false);
});

test('Nevada POS360 parser requires exact pickup, singleton pack, size, store, and product identity', () => {
  const [row] = parseNevadaPos360Html(pos360Html(), { merchantId: 'liquorboxlv' });
  assert.equal(row.productId, 'gid://pos360/Product/123');
  assert.equal(row.variantId, 'gid://pos360/ProductVariant/456');
  assert.equal(row.quantity, 0);
  assert.equal(row.sourceAvailabilityVerified, true);
  assert.deepEqual(parseNevadaPos360Html(pos360Html({}, { fulfillmentOptions: [{ type: 'SHIPPING', isAvailable: true }] }), { merchantId: 'liquorboxlv' }), []);
  assert.deepEqual(parseNevadaPos360Html(pos360Html({}, { packSize: 3 }), { merchantId: 'liquorboxlv' }), []);
  assert.deepEqual(parseNevadaPos360Html(pos360Html({}, { size: 375 }), { merchantId: 'liquorboxlv' }), []);
});

test('Nevada WooCommerce parser requires purchasable in-stock singleton products', () => {
  const [row] = parseNevadaWooCommerceProducts([wooProduct()]);
  assert.equal(row.productId, '77');
  assert.equal(row.quantity, 0);
  assert.equal(row.price, 54.99);
  assert.deepEqual(parseNevadaWooCommerceProducts([wooProduct({ is_in_stock: false })]), []);
  assert.deepEqual(parseNevadaWooCommerceProducts([wooProduct({ is_purchasable: false })]), []);
});

test('Nevada Albertsons XAPI parser requires positive in-store inventory and preserves exact versus binary semantics', () => {
  const payload = { response: { docs: [
    { id: 'x-1', pid: '960100', name: 'Buffalo Trace Kentucky Straight Bourbon 750ml', price: 29.99, channelInventory: { instore: '1', instoreItemQty: 4 } },
    { id: 'x-2', pid: '960200', name: 'Eagle Rare 10 Year Bourbon 750ml', price: 49.99, channelInventory: { instore: '1' } },
    { id: 'x-3', pid: '960300', name: 'Weller Bourbon 750ml', channelInventory: { instore: '0', instoreItemQty: 8 } },
  ] } };
  const rows = parseNevadaAlbertsonsXapi(payload);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].quantity, 4);
  assert.equal(rows[0].inventorySemantics, 'exact_retailer_quantity');
  assert.equal(rows[1].quantity, 0);
  assert.equal(rows[1].inventorySemantics, 'binary_retailer_orderable_no_exact_count');
  assert.deepEqual(parseNevadaAlbertsonsXapi('{bad'), []);
});

test('Nevada parsers reject unavailable, 375ml-or-smaller, bundles, and every multipack spelling', () => {
  const unsafe = ['3pk', '3-pk', '3 pack', '3-pack', 'multipack', 'multi-pack', 'pack of 3', 'gift set', 'bundle', 'sampler'];
  for (const term of unsafe) {
    assert.deepEqual(parseNevadaShopifyProducts(shopifyFixture({ title: `Buffalo Trace Bourbon ${term} 750ml` })), [], term);
    assert.deepEqual(parseNevadaWooCommerceProducts([wooProduct({ name: `Buffalo Trace Bourbon ${term} 750ml` })]), [], term);
  }
  assert.deepEqual(parseNevadaShopifyProducts(shopifyFixture({ title: 'Buffalo Trace Bourbon 375ml' })), []);
  assert.deepEqual(parseNevadaShopifyProducts(shopifyFixture({ variants: [{ id: 9, title: '200 ml', available: true }] })), []);
  assert.deepEqual(parseNevadaShopifyProducts(shopifyFixture({ variants: [{ id: 9, title: '750 ml', available: false }] })), []);
});

test('Nevada fulfillment policy requires exact first-party host and explicit pickup language', () => {
  const source = NEVADA_RETAILER_SOURCES.find((row) => row.id === 'liquor-box-las-vegas');
  assert.equal(verifyNevadaFulfillmentPolicy(source, '<p>Hassle-free in-store pickup at 7161 N Hualapai Way</p>'), true);
  assert.equal(verifyNevadaFulfillmentPolicy(source, '<p>Shipping nationwide</p>'), false);
  assert.equal(verifyNevadaFulfillmentPolicy({ ...source, fulfillmentPolicyUrl: 'https://attacker.example/pickup' }, '<p>In-Store Pickup</p>'), false);
});

test('Nevada cache freshness and partial merge preserve source observation time', () => {
  const now = Date.parse('2026-07-15T02:00:00.000Z');
  const rows = [{ id: 'fresh', observedAt: '2026-07-15T01:59:30.000Z' }, { id: 'stale', observedAt: '2026-07-14T22:00:00.000Z' }];
  assert.deepEqual(filterFreshNevadaSignals(rows, now, 60_000).map((row) => row.id), ['fresh']);
  const merged = mergeNevadaSourceCacheSignals([{ id: 'live', sourceChain: 'liquor-world-las-vegas' }], [{ id: 'old-live', sourceChain: 'liquor-world-las-vegas' }, { id: 'cached', sourceChain: 'liquor-box-las-vegas' }], new Set(['liquor-world-las-vegas']));
  assert.deepEqual(merged.map((row) => row.id).sort(), ['cached', 'live']);
});

function nevadaSignal(sourceId = 'liquor-box-las-vegas', overrides = {}) {
  const source = NEVADA_RETAILER_SOURCES.find((row) => row.id === sourceId);
  return {
    state: 'NV', stateCode: 'NV', sourceLabel: source.sourceLabel, sourceUrl: `https://${source.host}/products/test-bourbon`, sourceChain: source.id,
    merchantId: source.merchantId, productId: '1001', variantId: '2001', eventType: 'retailer_store_inventory_result', locationPrecision: 'store_level',
    storeId: source.store.id, storeAddress: source.store.address, city: source.store.city, quantity: 0, availabilityStatus: 'in_stock',
    sourceAvailabilityVerified: true, inventorySemantics: 'binary_retailer_orderable_no_exact_count', canAlertAsInventory: true, canAlertAsWatch: true,
    raw: { fulfillmentPolicyVerified: true },
    ...overrides,
  };
}

test('Nevada registry and lifecycle expose truthful first-party inventory and exact customer areas', () => {
  const nevada = ALL_STATE_SOURCES.find((row) => row.id === 'NV');
  const labels = new Set(nevada.sources.map((source) => source.label || source.name));
  for (const label of [
    'Liquor World CityHive Las Vegas store orderability',
    'Liquor Box POS360 Las Vegas pickup orderability',
    'Albertsons Nevada XAPI store inventory',
    'Vons Nevada XAPI store inventory',
    'Safeway Nevada XAPI store inventory',
  ]) assert.ok(labels.has(label), `missing Nevada source ${label}`);
  const lifecycle = getStateLifecycle('NV');
  assert.equal(lifecycle.lifecycle, 'retailer_store_inventory');
  assert.equal(lifecycle.coverageTier, 'live_store_inventory');
  assert.equal(lifecycle.refinementLevel, 'area');
  assert.deepEqual(lifecycle.areaOptions, ['Las Vegas Valley', 'Reno–Sparks']);
});

test('Nevada policy accepts exact pickup-bound inventory and central confidence promotes it', () => {
  const valid = nevadaSignal();
  assert.equal(isNevadaRetailerSignalIdentity(valid), true);
  assert.equal(isNevadaRetailerInventory(valid), true);
  assert.equal(confidenceForSignal(valid).canAlertAsInventory, true);
  const projected = { ...valid, type: valid.eventType, eventType: undefined, source: valid.sourceLabel, sourceLabel: undefined, stateCode: undefined };
  assert.equal(isNevadaRetailerInventory(projected), true);
});

test('Nevada policy accepts exact XAPI quantity only for the frozen banner and store identity', () => {
  const exact = nevadaSignal('albertsons-las-vegas-662', { quantity: 4, inventorySemantics: 'exact_retailer_quantity' });
  assert.equal(isNevadaRetailerInventory(exact), true);
  assert.equal(confidenceForSignal(exact).canAlertAsInventory, true);
  assert.equal(isNevadaRetailerInventory({ ...exact, sourceUrl: 'https://www.vons.com/shop/product-details.100.html' }), false);
  assert.equal(isNevadaRetailerInventory({ ...exact, quantity: 100 }), false);
});

test('Nevada policy rejects forged host/store/geography, missing identity, unproved pickup, and invented binary quantity', () => {
  for (const invalid of [
    nevadaSignal(undefined, { sourceUrl: 'https://attacker.example/products/test' }),
    nevadaSignal(undefined, { storeId: 'unknown' }),
    nevadaSignal(undefined, { city: 'Phoenix' }),
    nevadaSignal(undefined, { storeAddress: '6462 Losee Rd, Phoenix, AZ 85001' }),
    nevadaSignal(undefined, { variantId: null }),
    nevadaSignal(undefined, { raw: { fulfillmentPolicyVerified: false } }),
    nevadaSignal(undefined, { quantity: 1 }),
  ]) {
    assert.equal(isNevadaRetailerInventory(invalid), false);
    assert.equal(confidenceForSignal(invalid).canAlertAsInventory, false);
  }
});
