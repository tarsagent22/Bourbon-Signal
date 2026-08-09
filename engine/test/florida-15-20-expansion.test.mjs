import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  buildFloridaExpansionStoreLocationSignals,
  collectFloridaAbcExpansionFromPayload,
  collectFloridaShipmentShopifySource,
  FLORIDA_ABC_STORES,
  FLORIDA_EXPANSION_CITYHIVE_TARGETS,
  FLORIDA_EXPANSION_STORE_TARGETS,
  FLORIDA_GOTOLIQUOR_STORES,
  FLORIDA_PRIMO_SOURCE,
  FLORIDA_PRIMO_STORES,
  FLORIDA_SHIPMENT_SHOPIFY_SOURCES,
  FLORIDA_TIVOLI_SOURCE,
  floridaExpansionRequestBudget,
  isUsefulFloridaExpansionBottleFormat,
  parseFloridaAbcSearchspringInventory,
  parseFloridaShipmentShopifyProducts,
  parsePrimoProductStock,
  parsePrimoProductsJson,
  parseTivoliSouthProduct,
} from '../src/collectors/florida-15-20-expansion.mjs';
import { isFloridaRetailerInventory } from '../src/florida-retailer-policy.mjs';
import { buildCurrentInventoryAlertsFromDrops, publicSignal } from '../src/export-site-contract.mjs';
import { curlTextFetch } from '../src/collectors/precision-probes.mjs';
import { ALL_STATE_SOURCES } from '../src/state-sources.mjs';

const observedAt = new Date().toISOString();
const immutableBaseline = JSON.parse(readFileSync(new URL('../data/florida-15-20-baseline.json', import.meta.url), 'utf8'));

function matchedBottle(name) {
  if (!/Buffalo Trace|Bulleit Bourbon|Wild Turkey Bourbon Longbranch|Eagle Rare 12 Year|Heaven Hill Grain to Glass|1792 Small Batch/i.test(name)) {
    return { match: null, record: null, unsafeReason: 'fixture_no_match' };
  }
  return {
    match: { confidence: 0.96 },
    record: { id: 'fixture-bottle', canonical: name.replace(/\s+750\s*ml\b/i, ''), tier: 'high_signal' },
    unsafeReason: null,
  };
}

function abcFixture({ mutateLocation } = {}) {
  const locations = Object.fromEntries(FLORIDA_ABC_STORES.map((store, index) => [store.storeNumber, {
    value: store.name,
    child_sku: `760505-${store.storeNumber}`,
    inventory_level: index + 1,
    id: 6000 + index,
    option_value_id: 7000 + index,
    calculated_price: 34.99 + index,
  }]));
  if (mutateLocation) mutateLocation(locations);
  return JSON.stringify({ results: [{
    name: '1792 Small Batch Bourbon 750ml',
    sku: '760505',
    url: '/1792-small-batch-bourbon/760505',
    ss_in_stock: '1',
    ss_location_availability: FLORIDA_ABC_STORES.map((store) => Number(store.storeNumber)),
    ss_locations: JSON.stringify(locations).replace(/"/g, '&quot;'),
  }] });
}

function tivoliFixture({
  address = FLORIDA_TIVOLI_SOURCE.address,
  title = 'Bulleit Bourbon 750ml',
  canonicalUrl = FLORIDA_TIVOLI_SOURCE.productUrl,
  action = `${FLORIDA_TIVOLI_SOURCE.baseUrl}/checkout/cart/add/uenc/token/product/220382/`,
  hiddenButton = false,
} = {}) {
  const [streetAddress, city, stateZip] = address.split(', ');
  const [addressRegion, postalCode] = stateZip.split(' ');
  return `
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org/',
      '@type': 'LiquorStore',
      name: FLORIDA_TIVOLI_SOURCE.name,
      url: FLORIDA_TIVOLI_SOURCE.baseUrl,
      address: { '@type': 'PostalAddress', streetAddress, addressLocality: city, addressRegion, postalCode, addressCountry: 'US' },
    })}</script>
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org/',
      '@type': 'Product',
      name: title,
      offers: {
        '@type': 'Offer',
        availability: 'https://schema.org/InStock',
        price: '33.99',
        seller: { '@type': 'Organization', name: FLORIDA_TIVOLI_SOURCE.name, url: canonicalUrl },
      },
    })}</script>
    <form action="${action}" method="post">
      <h1 data-test="product-name">${title}</h1>
      <div${hiddenButton ? ' style="display:none"' : ''}><button type="button">Add to Cart</button></div>
    </form>`;
}

test('frozen Florida expansion registry is exactly 15 unique exact-store identities with no Target entries', () => {
  assert.equal(FLORIDA_PRIMO_STORES.size, 5);
  assert.equal(FLORIDA_EXPANSION_CITYHIVE_TARGETS.length, 0);
  assert.equal(FLORIDA_SHIPMENT_SHOPIFY_SOURCES.length, 4);
  assert.equal(FLORIDA_GOTOLIQUOR_STORES.length, 0);
  assert.equal(FLORIDA_ABC_STORES.length, 5);
  assert.ok(FLORIDA_TIVOLI_SOURCE);
  assert.equal(FLORIDA_EXPANSION_STORE_TARGETS.length, 15);
  assert.equal(new Set(FLORIDA_EXPANSION_STORE_TARGETS.map((store) => store.storeId)).size, 15);
  assert.ok(FLORIDA_EXPANSION_STORE_TARGETS.every((store) => store.state === 'FL' && /, FL \d{5}(?:, USA)?$/.test(store.address)));
  assert.ok(FLORIDA_EXPANSION_STORE_TARGETS.every((store) => store.platform !== 'target' && store.sourceChain !== 'target'));
  assert.ok(!FLORIDA_EXPANSION_STORE_TARGETS.some((store) => /9720 Camberley/i.test(store.address)));

  const floridaSourceLabels = new Set(ALL_STATE_SOURCES.find((state) => state.id === 'FL').sources.map((source) => source.label || source.name));
  for (const label of new Set(FLORIDA_EXPANSION_STORE_TARGETS.map((store) => store.sourceLabel))) {
    assert.ok(floridaSourceLabels.has(label), `missing Florida source registry entry for ${label}`);
  }

  assert.deepEqual([...FLORIDA_PRIMO_STORES.values()].map(({ code, name, address }) => ({ code, name, address })), [
    { code: 'southwest-ranches', name: 'Primo Southwest Ranches', address: '4815 SW 148th Ave, Southwest Ranches, FL 33330' },
    { code: 'davie', name: 'Primo Liquors Davie', address: '5993 Stirling Rd, Davie, FL 33314' },
    { code: 'fort-lauderdale', name: 'Primo Fort Lauderdale', address: '700 S Federal Hwy, Fort Lauderdale, FL 33316' },
    { code: 'bayview-sunrise', name: 'Primo Bayview Sunrise', address: '2541 E Sunrise Blvd, Fort Lauderdale, FL 33304' },
    { code: 'southeast', name: 'Primo Southeast', address: '200 SW Davie Blvd, Fort Lauderdale, FL 33315' },
  ]);
});

test('Primo parser binds one products page to same-host product URLs and exact configured positive stock only', () => {
  const products = parsePrimoProductsJson(JSON.stringify({ products: [
    { id: 1, title: 'Buffalo Trace 750ml', handle: 'buffalo-trace-750ml', variants: [{ id: 11, title: 'Default Title', available: true, price: '29.99' }] },
    { id: 2, title: 'Buffalo Trace Candle 750ml', handle: 'buffalo-trace-candle', variants: [{ id: 22, available: true }] },
    { id: 3, title: 'Buffalo Trace 375ml', handle: 'buffalo-trace-375ml', variants: [{ id: 33, available: true }] },
    { id: 4, title: 'Buffalo Trace 3-Pack 750ml', handle: 'buffalo-trace-pack', variants: [{ id: 44, available: true }] },
    { id: 5, title: 'Buffalo Trace 750ml', handle: 'https://evil.example/products/forged', variants: [{ id: 55, available: true }] },
    { id: 6, title: 'Buffalo Trace 750ml', handle: 'buffalo-trace-unavailable', variants: [{ id: 66, available: false }] },
    { id: 7, title: 'Sazerac Rye 750ml', handle: 'sazerac-rye', variants: [{ id: 77, available: true }] },
    { id: 8, title: 'Buffalo Trace 750ml', handle: 'malformed-variants', variants: { id: 88, available: true } },
  ] }), FLORIDA_PRIMO_SOURCE);
  assert.deepEqual(products.map((product) => product.productUrl), ['https://primoliquors.com/products/buffalo-trace-750ml']);

  const objectRows = parsePrimoProductStock(`
    <script type="application/json" data-primo-product-stock>${JSON.stringify({
      'southwest-ranches': 11,
      davie: { quantity: 6, address: '5993 Stirling Rd, Davie, FL 33314' },
      weston: 8,
      'fort-lauderdale': 0,
      'bayview-sunrise': 1.5,
    })}</script>`);
  assert.deepEqual(objectRows, [
    { store: FLORIDA_PRIMO_STORES.get('southwest-ranches'), quantity: 11 },
    { store: FLORIDA_PRIMO_STORES.get('davie'), quantity: 6 },
  ]);

  const legacyRows = parsePrimoProductStock(`
    <script data-primo-product-stock type="application/json">${JSON.stringify([
      { code: 'southeast', quantity: 2, address: FLORIDA_PRIMO_STORES.get('southeast').address },
      { code: 'bayview-sunrise', quantity: 9, address: '999 Mismatched Rd, Fort Lauderdale, FL 33334' },
      { code: 'weston', quantity: 4, address: '2390 Weston Rd, Weston, FL 33326' },
    ])}</script>`);
  assert.deepEqual(legacyRows, [{ store: FLORIDA_PRIMO_STORES.get('southeast'), quantity: 2 }]);
  assert.deepEqual(parsePrimoProductStock('<script data-primo-product-stock>{bad json}</script>'), []);
});

test('single-premises Shopify shipment parsers reject unavailable, non-bottle, mini, multipack, and forged-host rows', () => {
  const source = FLORIDA_SHIPMENT_SHOPIFY_SOURCES[0];
  const json = JSON.stringify({ products: [
    { id: 1, title: 'Wild Turkey Bourbon Longbranch', handle: 'wild-turkey-longbranch', variants: [{ id: 11, title: '750ml', available: true, price: '44.99' }] },
    { id: 2, title: 'Buffalo Trace Bourbon', handle: 'buffalo-trace', variants: [{ id: 22, title: '750ml', available: false }] },
    { id: 3, title: 'Buffalo Trace Candle', handle: 'buffalo-trace-candle', variants: [{ id: 33, title: '750ml', available: true }] },
    { id: 4, title: 'Buffalo Trace Bourbon', handle: 'buffalo-trace-mini', variants: [{ id: 44, title: '375ml', available: true }] },
    { id: 5, title: 'Buffalo Trace Bourbon 2-Pack', handle: 'buffalo-trace-pack-two', variants: [{ id: 55, title: '2 x 750ml', available: true }] },
    { id: 6, title: 'Buffalo Trace Bourbon 750ml', handle: 'https://evil.example/products/forged', variants: [{ id: 66, available: true }] },
    { id: 7, title: 'Crown Royal Chocolate 750ml', handle: 'crown-royal-chocolate', variants: [{ id: 77, available: true }] },
    { id: 8, title: 'Buffalo Trace Bourbon 750ml', handle: 'malformed-variants', variants: { id: 88, available: true } },
  ] });
  assert.deepEqual(parseFloridaShipmentShopifyProducts(json, source).map((row) => ({ rawName: row.rawName, productUrl: row.productUrl, quantity: row.quantity, quantityIsExact: row.quantityIsExact })), [
    { rawName: 'Wild Turkey Bourbon Longbranch', productUrl: 'https://bottlenbrew.com/products/wild-turkey-longbranch', quantity: 0, quantityIsExact: false },
  ]);
  assert.equal(isUsefulFloridaExpansionBottleFormat('Buffalo Trace Bourbon 750ml'), true);
  assert.equal(isUsefulFloridaExpansionBottleFormat('Wild Turkey Bourbon Longbranch 750ml Gift Set with Rocks Glasses'), true, 'a single useful bottle bundled with glassware remains a bottle offer');
  for (const rejected of ['Buffalo Trace Candle 750ml', 'Buffalo Trace Bourbon 375ml', 'Buffalo Trace Bourbon 3-pack 750ml', 'Buffalo Trace Bourbon 2 x 750ml']) {
    assert.equal(isUsefulFloridaExpansionBottleFormat(rejected), false, rejected);
  }
});

test('Shopify pagination is source-bounded and a 429 stops and fails the source closed', async () => {
  const source = FLORIDA_SHIPMENT_SHOPIFY_SOURCES[0];
  const requested = [];
  const result = await collectFloridaShipmentShopifySource({
    source,
    observedAt,
    matchBottle: matchedBottle,
    sleep: async () => {},
    fetchText: async (url) => {
      requested.push(url);
      if (requested.length === 1) return {
        ok: true,
        status: 200,
        url,
        text: JSON.stringify({ products: Array.from({ length: 250 }, (_, index) => index === 0
          ? { id: 1, title: 'Wild Turkey Bourbon Longbranch', handle: 'wild-turkey-longbranch', variants: [{ id: 11, title: '750ml', available: true, price: '44.99' }] }
          : { id: index + 1, title: `Unmatched Whiskey ${index} 750ml`, handle: `unmatched-whiskey-${index}`, variants: [{ id: index + 11, title: '750ml', available: true }] }) }),
      };
      return { ok: false, status: 429, url, text: '', error: 'HTTP 429' };
    },
  });
  assert.equal(requested.length, 2);
  assert.deepEqual(result.signals, []);
  assert.equal(result.roadblocks.at(-1)?.status, 429);
  assert.match(result.roadblocks.at(-1)?.nextRoute || '', /stop|next bounded cadence|do not bypass/i);
  assert.ok(requested.length <= source.maxPages);
});

test('curl transport reports the effective URL and enforces redirect, size, method, and cookie options', async () => {
  let capturedArgs = [];
  const result = await curlTextFetch('https://retailer.example/category', {
    followRedirects: false,
    maxBytes: 65536,
    method: 'POST',
    cookieJar: 'fixture.cookies',
    execFileAsync: async (_command, args) => {
      capturedArgs = args;
      return { stdout: 'payload\n__BOURBON_SIGNAL_HTTP_STATUS__:200\n__BOURBON_SIGNAL_EFFECTIVE_URL__:https://retailer.example/category' };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.url, 'https://retailer.example/category');
  assert.equal(result.text, 'payload');
  assert.equal(capturedArgs.includes('-L'), false);
  assert.deepEqual(capturedArgs.slice(capturedArgs.indexOf('--max-filesize'), capturedArgs.indexOf('--max-filesize') + 2), ['--max-filesize', '65536']);
  assert.deepEqual(capturedArgs.slice(capturedArgs.indexOf('-X'), capturedArgs.indexOf('-X') + 2), ['-X', 'POST']);
  assert.ok(capturedArgs.includes('-c') && capturedArgs.includes('-b'));
});

test('single-premises Shopify signals keep stable IDs and shipment/orderable non-shelf-count wording', async () => {
  const source = FLORIDA_SHIPMENT_SHOPIFY_SOURCES[1];
  const collectAtPrice = (price) => collectFloridaShipmentShopifySource({
    source,
    observedAt,
    matchBottle: matchedBottle,
    sleep: async () => {},
    fetchText: async (url) => ({
      ok: true,
      status: 200,
      url,
      text: JSON.stringify({ products: [{
        id: 8658684608681,
        title: 'Eagle Rare 12 Year Bourbon',
        handle: 'eagle-rare-12-year-bourbon',
        variants: [{ id: 46116714414249, title: '750ml', available: true, price }],
      }] }),
    }),
  });
  const first = await collectAtPrice('249.99');
  const changedPrice = await collectAtPrice('259.99');
  assert.equal(first.signals.length, 1);
  assert.equal(first.signals[0].id, changedPrice.signals[0].id);
  assert.equal(first.signals[0].quantity, 0);
  assert.equal(first.signals[0].quantityIsExact, false);
  assert.match(first.signals[0].availabilityLabel, /shipment\/orderable/i);
  assert.match(first.signals[0].evidence, /not a shelf count/i);
});

test('ABC Searchspring parser binds exact store name, child SKU, integer inventory, variant, option, and product URL', () => {
  const rows = parseFloridaAbcSearchspringInventory(abcFixture(), matchedBottle);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map((row) => row.target.storeId), FLORIDA_ABC_STORES.map((store) => store.storeId));
  assert.ok(rows.every((row) => row.quantityIsExact && Number.isInteger(row.quantity) && row.quantity > 0));
  assert.ok(rows.every((row) => row.childSku === `${row.productId}-${row.storeNumber}`));
  assert.ok(rows.every((row) => row.productUrl === 'https://www.abcfws.com/1792-small-batch-bourbon/760505'));

  const wrongName = abcFixture({ mutateLocation: (locations) => { locations['3'].value = 'Forged Store'; } });
  assert.equal(parseFloridaAbcSearchspringInventory(wrongName, matchedBottle).length, 4);
  const fractional = abcFixture({ mutateLocation: (locations) => { locations['4'].inventory_level = 1.5; } });
  assert.equal(parseFloridaAbcSearchspringInventory(fractional, matchedBottle).length, 4);
  const wrongSku = abcFixture({ mutateLocation: (locations) => { locations['5'].child_sku = 'forged-5'; } });
  assert.equal(parseFloridaAbcSearchspringInventory(wrongSku, matchedBottle).length, 4);
  assert.deepEqual(parseFloridaAbcSearchspringInventory('{bad json}', matchedBottle), []);

  const signals = collectFloridaAbcExpansionFromPayload({ payload: abcFixture(), observedAt, matchBottle: matchedBottle });
  assert.equal(new Set(signals.map((signal) => signal.storeId)).size, 5);
  assert.ok(signals.every((signal) => signal.quantityIsExact && signal.reportedQuantity === signal.quantity));
  const signal = signals[0];
  assert.equal(isFloridaRetailerInventory(signal), true);
  assert.equal(isFloridaRetailerInventory({ ...signal, variantId: 'forged' }), false);
  assert.equal(isFloridaRetailerInventory({ ...signal, variantId: '0', raw: { ...signal.raw, variantId: '0' } }), false);
  assert.equal(isFloridaRetailerInventory({ ...signal, optionValueId: 'forged' }), false);
  assert.equal(isFloridaRetailerInventory({ ...signal, optionValueId: undefined }), false);
  assert.equal(isFloridaRetailerInventory({ ...signal, sourceUrl: 'https://www.abcfws.com/different-product/999999' }), false);
  assert.equal(isFloridaRetailerInventory({ ...signal, raw: { ...signal.raw, productId: '999999' } }), false);
  assert.equal(isFloridaRetailerInventory({ ...signal, raw: { ...signal.raw, variantId: '999999' } }), false);
  assert.equal(isFloridaRetailerInventory({ ...signal, raw: { ...signal.raw, childSku: 'forged', storeNumber: '999' } }), false);
});

test('Tivoli monitor requires canonical product, exact store schema/address, visible same-host POST cart form, and title', () => {
  assert.deepEqual(parseTivoliSouthProduct(tivoliFixture(), FLORIDA_TIVOLI_SOURCE.productUrl), {
    productId: '220382',
    rawName: 'Bulleit Bourbon 750ml',
    productUrl: FLORIDA_TIVOLI_SOURCE.productUrl,
    price: 33.99,
    quantity: 0,
    quantityIsExact: false,
    sourceAvailabilityVerified: true,
    premisesVerified: true,
    orderFormVerified: true,
  });
  assert.equal(parseTivoliSouthProduct(tivoliFixture({ address: '999 Forged Rd, Miami, FL 33174' }), FLORIDA_TIVOLI_SOURCE.productUrl), null);
  assert.equal(parseTivoliSouthProduct(tivoliFixture({ title: 'Bulleit Rye 750ml' }), FLORIDA_TIVOLI_SOURCE.productUrl), null);
  assert.equal(parseTivoliSouthProduct(tivoliFixture({ canonicalUrl: 'https://evil.example/product' }), FLORIDA_TIVOLI_SOURCE.productUrl), null);
  assert.equal(parseTivoliSouthProduct(tivoliFixture({ action: 'https://evil.example/checkout/cart/add/product/220382/' }), FLORIDA_TIVOLI_SOURCE.productUrl), null);
  assert.equal(parseTivoliSouthProduct(tivoliFixture({ action: `${FLORIDA_TIVOLI_SOURCE.baseUrl}/checkout/cart/add/product/999999/` }), FLORIDA_TIVOLI_SOURCE.productUrl), null);
  assert.equal(parseTivoliSouthProduct(tivoliFixture({ hiddenButton: true }), FLORIDA_TIVOLI_SOURCE.productUrl), null);
  assert.equal(parseTivoliSouthProduct(tivoliFixture().replace('<button type="button">Add to Cart</button>', '<input type="hidden" value="Add to Cart">'), FLORIDA_TIVOLI_SOURCE.productUrl), null);
  assert.equal(parseTivoliSouthProduct(tivoliFixture().replace('<button type="button">Add to Cart</button>', '<input type="text" value="Add to Cart">'), FLORIDA_TIVOLI_SOURCE.productUrl), null);
  assert.equal(parseTivoliSouthProduct(tivoliFixture().replace('<button type="button">Add to Cart</button>', '<div style="display:none"><script>const marker = "</div>";</script><button type="button">Add to Cart</button></div>'), FLORIDA_TIVOLI_SOURCE.productUrl), null);
  assert.equal(parseTivoliSouthProduct(tivoliFixture(), 'https://evil.example/miami-liquor-delivery/bulleit-bourbon-750ml.html'), null);
});

function productionSignal(target, index) {
  const sourceUrl = target.platform === 'abc-searchspring'
    ? 'https://www.abcfws.com/1792-small-batch-bourbon/760505'
    : target.platform === 'gotoliquorstore'
      ? `${target.baseUrl}/p/buffalo-trace-bourbon/${1100 + index}`
      : target.productUrl || new URL(`/products/buffalo-trace-${index}`, target.baseUrl).href;
  const exactQuantity = target.platform === 'primo' || target.platform === 'cityhive' || target.platform === 'abc-searchspring';
  const reportedQuantity = exactQuantity ? 2 : 0;
  const common = {
    id: `fl-expansion-${index}`,
    state: 'FL',
    stateCode: 'FL',
    eventType: target.platform === 'cityhive' ? 'cityhive_store_inventory_result' : 'retailer_store_inventory_result',
    sourceLabel: target.sourceLabel,
    sourceUrl,
    sourceChain: target.sourceChain,
    merchantId: target.merchantId,
    productId: `product-${index}`,
    variantId: `variant-${index}`,
    rawName: 'Buffalo Trace Bourbon 750ml',
    canonicalBottleId: 'buffalo-trace-bourbon',
    canonicalName: 'Buffalo Trace Bourbon',
    locationPrecision: 'store_level',
    storeName: target.name,
    locationName: target.name,
    storeId: target.storeId,
    storeAddress: target.address,
    city: target.city,
    postalCode: target.zip,
    zip: target.zip,
    quantity: reportedQuantity,
    quantityIsExact: exactQuantity,
    reportedQuantity,
    availabilityStatus: 'in_stock',
    sourceAvailabilityVerified: true,
    premisesVerified: true,
    canAlertAsInventory: true,
    canAlertAsWatch: true,
    observedAt,
    inventorySemantics: exactQuantity
      ? 'exact_retailer_reported_quantity'
      : target.platform === 'gotoliquorstore'
        ? 'binary_exact_premises_pickup_orderable_no_shelf_count'
        : 'binary_exact_premises_shipment_orderable_no_shelf_count',
    raw: {
      chain: target.sourceChain,
      merchantId: target.merchantId,
      reportedQuantity,
      sourceAvailabilityVerified: true,
      configuredStoreIdentity: true,
    },
  };
  if (target.platform === 'shopify') {
    common.variantAvailable = true;
    common.raw.variantAvailable = true;
  }
  if (target.platform === 'abc-searchspring') {
    common.productId = '760505';
    common.variantId = String(6000 + index);
    common.optionValueId = String(7000 + index);
    common.childSku = `760505-${target.storeNumber}`;
    common.storeNumber = target.storeNumber;
    common.controlStoreId = target.storeNumber;
    common.variantAvailable = true;
    Object.assign(common.raw, {
      variantAvailable: true,
      controlStoreId: target.storeNumber,
      optionValueId: common.optionValueId,
      childSku: common.childSku,
      storeNumber: target.storeNumber,
    });
  }
  if (target.platform === 'gotoliquorstore') {
    common.pickupOfferVerified = true;
    common.controlStoreId = target.controlStoreId;
    common.raw.controlStoreId = target.controlStoreId;
  }
  if (target.platform === 'tivoli') {
    common.productId = '220382';
    common.variantId = null;
    common.orderFormVerified = true;
    common.raw.orderFormVerified = true;
  }
  return common;
}

test('all 15 frozen identities qualify centrally and targeted verifier rejects a missing or forged cohort store', () => {
  const inventory = FLORIDA_EXPANSION_STORE_TARGETS.map(productionSignal);
  assert.ok(inventory.every(isFloridaRetailerInventory));
  const firstPrimo = inventory.find((row) => row.storeId === 'primo-liquors:southwest-ranches');
  const secondPrimo = inventory.find((row) => row.storeId === 'primo-liquors:davie');
  assert.equal(isFloridaRetailerInventory({ ...firstPrimo, merchantId: secondPrimo.merchantId, raw: { ...firstPrimo.raw, merchantId: secondPrimo.merchantId } }), false);
  assert.equal(isFloridaRetailerInventory({ ...firstPrimo, sourceUrl: firstPrimo.sourceUrl.replace('https://', 'http://') }), false);
  assert.equal(isFloridaRetailerInventory({ ...firstPrimo, quantity: 1.5, reportedQuantity: 1.5, raw: { ...firstPrimo.raw, reportedQuantity: 1.5 } }), false);

  const bibleRecord = { id: 'buffalo-trace-bourbon', canonical: 'Buffalo Trace Bourbon', tier: 'allocated', aliases: [] };
  const bible = { byId: new Map([[bibleRecord.id, bibleRecord]]), byName: new Map(), byExactName: new Map() };
  const publicDrops = inventory.map((row) => publicSignal(row, bible));
  const rejectedPublicDrops = publicDrops.filter((drop) => !isFloridaRetailerInventory(drop)).map((drop) => ({ storeId: drop.storeId, sourceLabel: drop.sourceLabel, merchantId: drop.merchantId, sourceChain: drop.sourceChain, reportedQuantity: drop.reportedQuantity, variantAvailable: drop.variantAvailable, controlStoreId: drop.controlStoreId, orderFormVerified: drop.orderFormVerified, inventorySemantics: drop.inventorySemantics }));
  assert.deepEqual(rejectedPublicDrops, [], 'public export must preserve the proof needed to replay Florida policy');
  assert.ok(publicDrops.every((drop) => buildCurrentInventoryAlertsFromDrops([drop]).length === 1), 'all expansion drops must survive current-inventory alert projection');
  const locations = buildFloridaExpansionStoreLocationSignals(observedAt);
  assert.equal(locations.length, 15);
  assert.ok(locations.every((row) => row.eventType === 'retailer_store_location' && row.canAlertAsInventory === false));

  const dir = mkdtempSync(join(tmpdir(), 'bs-fl-15-20-'));
  const statePath = join(dir, 'FL.json');
  const baselinePath = join(dir, 'FL-baseline.json');
  const verifierPath = fileURLToPath(new URL('../src/verify-fl-15-20-expansion.mjs', import.meta.url));
  const run = (signals, baselineOverrides = {}) => {
    const baselineContract = { ...immutableBaseline, ...baselineOverrides };
    writeFileSync(statePath, JSON.stringify({ state: 'FL', status: 'useful', stale: false, generatedAt: observedAt, signals }));
    writeFileSync(baselinePath, JSON.stringify(baselineContract));
    return spawnSync(process.execPath, [verifierPath], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      encoding: 'utf8',
      env: { ...process.env, BOURBON_SIGNAL_FL_15_20_VERIFY_FILE: statePath, BOURBON_SIGNAL_FL_15_20_BASELINE_FILE: baselinePath, BOURBON_SIGNAL_FL_MAX_INVENTORY_AGE_MS: String(90 * 60_000) },
    });
  };
  try {
    const success = run([...locations, ...inventory]);
    assert.equal(success.status, 0, success.stderr || success.stdout);
    assert.match(success.stdout, /"stores"\s*:\s*15/);
    assert.notEqual(run([...locations, ...inventory.slice(1)]).status, 0);
    assert.notEqual(run([...locations, ...inventory.map((row, index) => index === 0 ? { ...row, sourceUrl: 'https://evil.example/products/forged' } : row)]).status, 0);
    assert.notEqual(run([...locations, ...inventory], { inventoryStoreIds: [...immutableBaseline.inventoryStoreIds, inventory[0].storeId] }).status, 0);
    assert.notEqual(run([...locations, ...inventory], { inventoryStoreIdsSha256: '0'.repeat(64) }).status, 0);
    assert.notEqual(run([...locations, ...inventory], { inventoryStoreIds: undefined }).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('frozen request budget is explicit and bounded', () => {
  assert.deepEqual(floridaExpansionRequestBudget(), {
    primoProductsPages: 1,
    primoProductPages: 8,
    shipmentShopifyPages: 12,
    abcSearchspringPages: 1,
    tivoliProductPages: 1,
    maximumRequests: 23,
  });
});
