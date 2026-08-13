import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const square = await import('../src/collectors/south-carolina-discount-square.mjs');
const precision = await import('../src/collectors/precision-probes.mjs');
const scPolicy = await import('../src/south-carolina-retailer-policy.mjs');
const exportSite = await import('../src/export-site-contract.mjs');
const collector = readFileSync(new URL('../src/collectors/precision-probes.mjs', import.meta.url), 'utf8');
const sources = readFileSync(new URL('../src/state-sources.mjs', import.meta.url), 'utf8');
const exportContract = readFileSync(new URL('../src/export-site-contract.mjs', import.meta.url), 'utf8');
const refreshWorkflow = readFileSync(new URL('../../.github/workflows/refresh-feed.yml', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const storeUniverse = JSON.parse(readFileSync(new URL('../data/store-universe/SC.json', import.meta.url), 'utf8'));

test('Discount Liquor is registered as an exact-store Square inventory source', () => {
  assert.match(collector, /from '\.\/south-carolina-discount-square\.mjs'/);
  assert.match(sources, /discountliquorfm\.square\.site\/s\/shop/);
  const store = storeUniverse.stores.find((row) => row.id === 'discount-liquor-fort-mill:LEG9F5YDP0ZS2');
  assert.ok(store, 'missing Discount Liquor exact store identity');
  assert.equal(store.name, 'Discount Liquor');
  assert.equal(store.address, '400 N Dobys Bridge Rd, Fort Mill, SC 29715');
  assert.equal(store.inventoryStatus, 'live-inventory');
  assert.equal(store.ecommercePlatform, 'square-online');
});

function validLocationPayload() {
  return {
    data: [{
      id: 'LEG9F5YDP0ZS2',
      owner_id: '151282621',
      site_id: '741520739911976347',
      display_name: 'DISCOUNT LIQUOR',
      pickup_timezone: 'America/New_York',
      pickup_enabled: true,
      delivery_enabled: false,
      square_id: 'LEG9F5YDP0ZS2',
      address: { data: {
        is_primary: true,
        is_valid: true,
        business_name: 'DISCOUNT LIQUOR',
        street: '400 N Dobys Bridge Rd',
        street2: '',
        postal_code: '29715',
        city: 'Fort Mill',
        region_code: 'SC',
        country_code: 'US',
        latitude: 35.006664,
        longitude: -80.931076,
      } },
    }],
    meta: { pagination: { total: 1, count: 1, per_page: 100, current_page: 1, total_pages: 1 } },
  };
}

test('Discount Liquor location proof accepts only the reviewed one-store pickup premise', () => {
  assert.equal(typeof square.parseDiscountLiquorLocation, 'function');
  assert.deepEqual(square.parseDiscountLiquorLocation(validLocationPayload()), square.DISCOUNT_LIQUOR_SOURCE.store);
  for (const payload of [
    null,
    { data: [] },
    { ...validLocationPayload(), data: [...validLocationPayload().data, validLocationPayload().data[0]] },
    { ...validLocationPayload(), meta: { pagination: { total: 2, count: 1, current_page: 1, total_pages: 2 } } },
    { ...validLocationPayload(), data: [{ ...validLocationPayload().data[0], id: 'forged' }] },
    { ...validLocationPayload(), data: [{ ...validLocationPayload().data[0], owner_id: 'forged' }] },
    { ...validLocationPayload(), data: [{ ...validLocationPayload().data[0], site_id: 'forged' }] },
    { ...validLocationPayload(), data: [{ ...validLocationPayload().data[0], pickup_enabled: false }] },
    { ...validLocationPayload(), data: [{ ...validLocationPayload().data[0], address: { data: { ...validLocationPayload().data[0].address.data, street: '999 Other Rd' } } }] },
  ]) assert.equal(square.parseDiscountLiquorLocation(payload), null);
});

function validCatalogProduct(overrides = {}) {
  return {
    id: 'HLFF7E35EROYOBUG4I5TJERF',
    square_id: 'HLFF7E35EROYOBUG4I5TJERF',
    owner_id: '151282621',
    merchant_id: 'ML2FQ6NA8B53W',
    site_id: '741520739911976347',
    site_product_id: '11',
    visibility: 'visible',
    name: 'FOUR ROSES OBSV SINGLE BARREL 100P 750ML',
    product_type: 'physical',
    fulfillable: true,
    absolute_site_link: 'https://discountliquorfm.square.site/product/four-roses-obsv-single-barrel-100p-750ml/11',
    categoryIds: ['4FQJPWZXRPCDSABLO3WBCNT5'],
    badges: { out_of_stock: false, low_stock: false, on_sale: false },
    inventory: {
      total: 7,
      all_inventory_total: 7,
      lowest: 7,
      all_variations_sold_out: false,
      marked_sold_out_at_all_existing_locations: false,
      marked_sold_out_skus_count: 0,
      has_location_not_tracking: false,
    },
    price: { low: 54.99, high: 54.99 },
    ...overrides,
  };
}

function validCatalogPayload(products = [validCatalogProduct()]) {
  return {
    data: products,
    meta: { pagination: { total: products.length, count: products.length, per_page: 100, current_page: 1, total_pages: 1 } },
  };
}

test('Discount Liquor catalog parser preserves only exact positive tracked inventory', () => {
  assert.equal(typeof square.parseDiscountLiquorCatalogPage, 'function');
  const parsed = square.parseDiscountLiquorCatalogPage(validCatalogPayload(), { expectedPage: 1, maxPages: 7 });
  assert.equal(parsed.totalPages, 1);
  assert.equal(parsed.rejectedCount, 0);
  assert.deepEqual(parsed.products, [{
    productId: 'HLFF7E35EROYOBUG4I5TJERF',
    siteProductId: '11',
    rawName: 'FOUR ROSES OBSV SINGLE BARREL 100P 750ML',
    sourceUrl: 'https://discountliquorfm.square.site/product/four-roses-obsv-single-barrel-100p-750ml/11',
    quantity: 7,
    price: 54.99,
    lowStock: false,
  }]);

  const invalidProducts = [
    validCatalogProduct({ merchant_id: 'forged' }),
    validCatalogProduct({ owner_id: 'forged' }),
    validCatalogProduct({ site_id: 'forged' }),
    validCatalogProduct({ square_id: 'other' }),
    validCatalogProduct({ categoryIds: ['other'] }),
    validCatalogProduct({ visibility: 'hidden' }),
    validCatalogProduct({ product_type: 'digital' }),
    validCatalogProduct({ fulfillable: false }),
    validCatalogProduct({ absolute_site_link: 'https://evil.example/product/11' }),
    validCatalogProduct({ badges: { out_of_stock: true, low_stock: false } }),
    validCatalogProduct({ inventory: { ...validCatalogProduct().inventory, total: 0, all_inventory_total: 0, lowest: 0, all_variations_sold_out: true } }),
    validCatalogProduct({ inventory: { ...validCatalogProduct().inventory, total: 1.5, all_inventory_total: 1.5 } }),
    validCatalogProduct({ inventory: { ...validCatalogProduct().inventory, total: 7, all_inventory_total: 8 } }),
    validCatalogProduct({ inventory: { ...validCatalogProduct().inventory, has_location_not_tracking: true } }),
    validCatalogProduct({ price: { low: 54.99, high: 64.99 } }),
    validCatalogProduct({ name: 'BULLEIT 90 375ML' }),
  ];
  const filtered = square.parseDiscountLiquorCatalogPage(validCatalogPayload(invalidProducts), { expectedPage: 1, maxPages: 7 });
  assert.deepEqual(filtered.products, []);
  assert.equal(filtered.rejectedCount, invalidProducts.length);

  for (const malformed of [
    null,
    { data: {} },
    { ...validCatalogPayload(), meta: { pagination: { total: 701, count: 1, per_page: 100, current_page: 1, total_pages: 8 } } },
    { ...validCatalogPayload(), meta: { pagination: { total: 1, count: 1, per_page: 100, current_page: 2, total_pages: 2 } } },
    { ...validCatalogPayload(), meta: { pagination: { total: 1, count: 2, per_page: 100, current_page: 1, total_pages: 1 } } },
    { ...validCatalogPayload(), meta: { pagination: { total: 200, count: 1, per_page: 100, current_page: 1, total_pages: 1 } } },
  ]) assert.equal(square.parseDiscountLiquorCatalogPage(malformed, { expectedPage: 1, maxPages: 7 }), null);
});

function validSkuPayload(product, overrides = {}) {
  return {
    data: [{
      id: 'SHDI4Y2QG7SWOANPFTWNIRUT',
      owner_id: '151282621',
      merchant_id: 'ML2FQ6NA8B53W',
      site_id: '741520739911976347',
      site_product_id: product.siteProductId,
      site_product_sku_id: 'SHDI4Y2QG7SWOANPFTWNIRUT',
      product_square_id: product.productId,
      square_id: 'SHDI4Y2QG7SWOANPFTWNIRUT',
      name: 'Regular',
      sku: '994238',
      product_type: 'physical',
      price: { current: product.price, high: product.price, regular: product.price, sale: null },
      fulfillment: { methods: { pickup: true }, methods_at_any_location: { pickup: true } },
      fulfillable: true,
      inventory_tracking_enabled: true,
      sold_out: false,
      inventory: product.quantity,
      total_inventory: product.quantity,
      stockable: true,
      sellable: true,
      ...overrides,
    }],
    meta: { pagination: { total: 1, count: 1, per_page: 100, current_page: 1, total_pages: 1, links: [] } },
  };
}

test('Discount Liquor SKU parser requires one tracked pickup variation with matching exact quantity', () => {
  assert.equal(typeof square.parseDiscountLiquorSkuPayload, 'function');
  const product = square.parseDiscountLiquorCatalogPage(validCatalogPayload(), { expectedPage: 1, maxPages: 7 }).products[0];
  const tracked = square.parseDiscountLiquorSkuPayload(validSkuPayload(product), product);
  assert.equal(tracked.variationId, 'SHDI4Y2QG7SWOANPFTWNIRUT');
  assert.equal(tracked.sku, '994238');
  assert.equal(tracked.quantity, 7);

  const invalidPayloads = [
    validSkuPayload(product, { inventory_tracking_enabled: false }),
    validSkuPayload(product, { product_square_id: 'FORGEDPRODUCT00000000' }),
    validSkuPayload(product, { inventory: 6, total_inventory: 6 }),
    validSkuPayload(product, { fulfillment: { methods: { pickup: false }, methods_at_any_location: { pickup: true } } }),
    validSkuPayload(product, { sold_out: true }),
    validSkuPayload(product, { sellable: false }),
    { ...validSkuPayload(product), data: [...validSkuPayload(product).data, { ...validSkuPayload(product).data[0], id: 'ANOTHERVARIATION00000000' }] },
    { ...validSkuPayload(product), meta: { pagination: { total: 2, count: 1, per_page: 100, current_page: 1, total_pages: 2, links: [] } } },
  ];
  for (const payload of invalidPayloads) assert.equal(square.parseDiscountLiquorSkuPayload(payload, product), null);
});

test('Discount Liquor accepts Square variations without an optional merchant SKU', () => {
  const product = square.parseDiscountLiquorCatalogPage(validCatalogPayload(), { expectedPage: 1, maxPages: 3 }).products[0];
  const parsed = square.parseDiscountLiquorSkuPayload(validSkuPayload(product, { sku: null }), product);
  assert.ok(parsed);
  assert.equal(parsed.sku, null);
});

test('Discount Liquor signal and policy bind exact Square stock to the reviewed premise', () => {
  assert.equal(typeof square.buildDiscountLiquorSignal, 'function');
  assert.equal(typeof scPolicy.isSouthCarolinaDiscountLiquorInventory, 'function');
  const candidate = square.parseDiscountLiquorCatalogPage(validCatalogPayload(), { expectedPage: 1, maxPages: 7 }).products[0];
  const product = square.parseDiscountLiquorSkuPayload(validSkuPayload(candidate), candidate);
  const observedAt = '2026-08-08T15:00:00.000Z';
  const signal = square.buildDiscountLiquorSignal(
    { id: 'SC' },
    product,
    { match: { confidence: 0.96 }, record: { id: 'four-roses-single-barrel-obsv', canonical: 'Four Roses OBSV Single Barrel', tier: 'limited' } },
    observedAt,
  );
  assert.equal(signal.quantity, 7);
  assert.equal(signal.storeQty, 7);
  assert.equal(signal.quantityIsExact, true);
  assert.equal(signal.quantitySemantics, 'exact_square_single_location_inventory');
  assert.equal(signal.storeId, 'discount-liquor-fort-mill:LEG9F5YDP0ZS2');
  assert.equal(signal.orderabilityOfferVerified, true);
  assert.equal(signal.raw.square.product.id, product.productId);
  assert.equal(signal.variationId, product.variationId);
  assert.equal(signal.sku, product.sku);
  assert.equal(signal.raw.square.variation.id, product.variationId);
  assert.equal(signal.raw.square.variation.inventoryTrackingEnabled, true);
  assert.equal(scPolicy.isSouthCarolinaDiscountLiquorInventory(signal, Date.parse(observedAt) + 60_000), true);
  assert.equal(square.buildDiscountLiquorSignal(
    { id: 'SC' },
    candidate,
    { match: { confidence: 0.96 }, record: { id: 'four-roses-single-barrel-obsv', canonical: 'Four Roses OBSV Single Barrel', tier: 'limited' } },
    observedAt,
  ), null, 'aggregate-only category rows must not become inventory signals');
  assert.equal(square.buildDiscountLiquorSignal({ id: 'SC' }, product, { match: null, record: null }, observedAt), null);
  assert.equal(square.buildDiscountLiquorSignal(
    { id: 'SC' },
    { ...product, rawName: 'BULLEIT 10YR 750ML' },
    { match: { confidence: 0.9 }, record: { id: 'bulleit', canonical: 'Bulleit Bourbon', tier: 'standard' } },
    observedAt,
  ), null, 'age-stated raw products must not collapse into a generic canonical bottle');

  for (const forged of [
    { sourceLabel: 'Generic Square inventory' },
    { sourceChain: 'forged' },
    { sourceUrl: 'https://evil.example/product/11' },
    { productId: 'forged' },
    { sourceProductProofId: 'forged' },
    { merchantId: 'forged' },
    { locationId: 'forged' },
    { storeId: 'forged' },
    { storeAddress: '999 Other Rd' },
    { city: 'Myrtle Beach' },
    { zip: '29577' },
    { quantity: 8 },
    { variationId: 'FORGEDVARIATION00000000' },
    { storeQty: 8 },
    { quantityIsExact: false },
    { sourceAvailabilityVerified: false },
    { orderabilityOfferVerified: false },
    { raw: { ...signal.raw, square: { ...signal.raw.square, merchantId: 'forged' } } },
    { raw: { ...signal.raw, square: { ...signal.raw.square, variation: { ...signal.raw.square.variation, id: 'FORGEDVARIATION00000000' } } } },
  ]) assert.equal(scPolicy.isSouthCarolinaDiscountLiquorInventory({ ...signal, ...forged }, Date.parse(observedAt) + 60_000), false);
  assert.equal(scPolicy.isSouthCarolinaDiscountLiquorInventory(signal, Date.parse(observedAt) + 2 * 60 * 60_000 + 1), false);
});

test('Discount Liquor normalized event aliases cannot bypass exact Square export policy', () => {
  const candidate = square.parseDiscountLiquorCatalogPage(validCatalogPayload(), { expectedPage: 1, maxPages: 7 }).products[0];
  const product = square.parseDiscountLiquorSkuPayload(validSkuPayload(candidate), candidate);
  const observedAt = new Date().toISOString();
  const signal = square.buildDiscountLiquorSignal(
    { id: 'SC' },
    product,
    { match: { confidence: 0.96 }, record: { id: 'four-roses-single-barrel-obsv', canonical: 'Four Roses OBSV Single Barrel', tier: 'limited' } },
    observedAt,
  );
  const emptyBible = { byId: new Map(), byName: new Map(), byNormalized: new Map() };
  const valid = exportSite.publicSignal(signal, emptyBible);
  assert.equal(valid.canAlertAsInventory, true);
  const forgedAlias = exportSite.publicSignal({ ...signal, eventType: 'store_inventory_result', raw: { chain: 'discount-liquor-fort-mill' } }, emptyBible);
  assert.equal(forgedAlias.canAlertAsInventory, false);
  assert.equal(forgedAlias.canAlertAsWatch, false);
});

test('Discount Liquor transport cancels streamed and declared oversized JSON before buffering', async () => {
  assert.equal(typeof precision.readBoundedPrecisionResponse, 'function');
  let cancelled = false;
  const response = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('123456'));
      controller.enqueue(new TextEncoder().encode('789012'));
    },
    cancel() { cancelled = true; },
  }));
  await assert.rejects(() => precision.readBoundedPrecisionResponse(response, { url: 'https://cdn5.editmysite.com/test', maxBytes: 8 }), /exceeded 8 bytes/);
  assert.equal(cancelled, true);

  const declared = new Response('x', { headers: { 'content-length': '99' } });
  await assert.rejects(() => precision.readBoundedPrecisionResponse(declared, { url: 'https://cdn5.editmysite.com/test', maxBytes: 8 }), /declared 99 bytes/);
});

test('Discount Liquor collector verifies location then walks only bounded advertised catalog pages', async () => {
  assert.equal(typeof square.collectDiscountLiquorInventory, 'function');
  const second = validCatalogProduct({
    id: 'BBBBBBBBBBBBBBBB',
    square_id: 'BBBBBBBBBBBBBBBB',
    site_product_id: '12',
    name: 'EAGLE RARE 10 YEAR BOURBON 750ML',
    absolute_site_link: 'https://discountliquorfm.square.site/product/eagle-rare-10-year-bourbon-750ml/12',
    inventory: { ...validCatalogProduct().inventory, total: 2, all_inventory_total: 2, lowest: 2 },
    price: { low: 44.99, high: 44.99 },
    badges: { out_of_stock: false, low_stock: true, on_sale: false },
  });
  const requests = [];
  const rejectedFillers = Array.from({ length: 99 }, (_value, index) => {
    const siteProductId = String(1000 + index);
    const productId = `FILLER${String(index).padStart(10, '0')}`;
    return validCatalogProduct({
      id: productId,
      square_id: productId,
      site_product_id: siteProductId,
      name: `NON INVENTORY FILLER ${index} 750ML`,
      absolute_site_link: `https://discountliquorfm.square.site/product/non-inventory-filler-${index}-750ml/${siteProductId}`,
      badges: { out_of_stock: true, low_stock: false, on_sale: false },
    });
  });
  const fetchJson = async (url) => {
    requests.push(url);
    if (url.includes('/store-locations?')) return { ok: true, status: 200, payload: validLocationPayload() };
    if (url.includes('/products/11/skus')) {
      const candidate = square.parseDiscountLiquorCatalogPage(validCatalogPayload(), { expectedPage: 1, maxPages: 7 }).products[0];
      return { ok: true, status: 200, payload: validSkuPayload(candidate) };
    }
    if (url.includes('/products/12/skus')) {
      const candidate = square.parseDiscountLiquorCatalogPage({ data: [second], meta: { pagination: { total: 1, count: 1, per_page: 100, current_page: 1, total_pages: 1 } } }, { expectedPage: 1, maxPages: 7 }).products[0];
      return { ok: true, status: 200, payload: validSkuPayload(candidate, { id: 'TTTTTTTTTTTTTTTT', site_product_sku_id: 'TTTTTTTTTTTTTTTT', square_id: 'TTTTTTTTTTTTTTTT', sku: '123456' }) };
    }
    const page = new URL(url).searchParams.get('page');
    if (page === '1') return { ok: true, status: 200, payload: {
      data: [validCatalogProduct(), ...rejectedFillers],
      meta: { pagination: { total: 101, count: 100, per_page: 100, current_page: 1, total_pages: 2 } },
    } };
    if (page === '2') return { ok: true, status: 200, payload: {
      data: [second],
      meta: { pagination: { total: 101, count: 1, per_page: 100, current_page: 2, total_pages: 2 } },
    } };
    throw new Error(`unexpected URL ${url}`);
  };
  const result = await square.collectDiscountLiquorInventory({ id: 'SC' }, {}, '2026-08-08T15:00:00.000Z', {
    fetchJson,
    sleepFn: async () => {},
    matchBottle: (name) => ({ match: { confidence: 0.92 }, record: { id: name.includes('EAGLE') ? 'eagle-rare-10' : 'four-roses-obsv', canonical: name, tier: 'allocated' } }),
  });
  assert.equal(requests.length, 5);
  assert.match(requests[1], /per_page=100/);
  assert.match(requests[3], /\/products\/11\/skus\?/);
  assert.match(requests[4], /\/products\/12\/skus\?/);
  const inventory = result.signals.filter((row) => row.eventType === 'retailer_store_inventory_result');
  assert.equal(inventory.length, 2);
  assert.ok(inventory.every((row) => row.variationId && row.raw.square.variation.inventoryTrackingEnabled));
  assert.equal(result.signals.filter((row) => row.eventType === 'retailer_store_location').length, 1);
  assert.equal(result.signals.find((row) => row.rawName.includes('EAGLE'))?.quantity, 2);
  assert.deepEqual(result.roadblocks, []);

  const blockedRequests = [];
  const blocked = await square.collectDiscountLiquorInventory({ id: 'SC' }, {}, '2026-08-08T15:00:00.000Z', {
    fetchJson: async (url) => {
      blockedRequests.push(url);
      return { ok: true, status: 200, payload: { ...validLocationPayload(), data: [{ ...validLocationPayload().data[0], id: 'forged' }] } };
    },
    sleepFn: async () => {},
    matchBottle: () => ({ record: { id: 'should-not-run' } }),
  });
  assert.equal(blockedRequests.length, 1);
  assert.deepEqual(blocked.signals, []);
  assert.equal(blocked.roadblocks[0].status, 'identity_mismatch');
});

test('Discount Liquor collector publishes no partial inventory when a later catalog page is malformed', async () => {
  const first = validCatalogProduct();
  const fillers = Array.from({ length: 99 }, (_value, index) => {
    const siteProductId = String(2000 + index);
    const productId = `REJECT${String(index).padStart(10, '0')}`;
    return validCatalogProduct({
      id: productId,
      square_id: productId,
      site_product_id: siteProductId,
      name: `REJECTED FILLER ${index} 750ML`,
      absolute_site_link: `https://discountliquorfm.square.site/product/rejected-filler-${index}-750ml/${siteProductId}`,
      badges: { out_of_stock: true, low_stock: false, on_sale: false },
    });
  });
  const requests = [];
  const fetchJson = async (url) => {
    requests.push(url);
    if (url.includes('/store-locations?')) return { ok: true, status: 200, payload: validLocationPayload() };
    if (url.includes('/skus')) return { ok: true, status: 200, payload: validSkuPayload(square.parseDiscountLiquorCatalogPage(validCatalogPayload([first]), { expectedPage: 1, maxPages: 7 }).products[0]) };
    const page = new URL(url).searchParams.get('page');
    if (page === '1') return { ok: true, status: 200, payload: { data: [first, ...fillers], meta: { pagination: { total: 101, count: 100, per_page: 100, current_page: 1, total_pages: 2 } } } };
    return { ok: true, status: 200, payload: { data: [validCatalogProduct({ site_product_id: '12', absolute_site_link: 'https://discountliquorfm.square.site/product/second/12' })], meta: { pagination: { total: 101, count: 2, per_page: 100, current_page: 2, total_pages: 2 } } } };
  };
  const result = await square.collectDiscountLiquorInventory(
    { id: 'SC' },
    {},
    '2026-08-08T15:00:00.000Z',
    { fetchJson, sleepFn: async () => {}, matchBottle: () => ({ match: { confidence: 0.95 }, record: { id: 'four-roses-obsv', canonical: 'Four Roses OBSV Single Barrel', tier: 'limited' } }) },
  );
  assert.equal(result.signals.filter((row) => row.eventType === 'retailer_store_inventory_result').length, 0);
  assert.equal(requests.some((url) => url.includes('/skus')), false);
  assert.ok(result.roadblocks.some((row) => row.status === 'malformed_catalog'));
});

test('Discount Liquor is isolated, fresh, forced live for targeted SC, and policy-gated on export', () => {
  assert.match(collector, /collectDiscountLiquorInventory/);
  assert.match(collector, /name: 'discount-liquor-fort-mill', domain: 'editmysite\.com'/);
  assert.match(collector, /SC_DISCOUNT_LIQUOR_CACHE_MAX_AGE_MS[\s\S]*2 \* 60 \* 60_000/);
  assert.match(collector, /BOURBON_SIGNAL_SC_FORCE_DISCOUNT_LIQUOR_LIVE/);
  assert.match(refreshWorkflow, /BOURBON_SIGNAL_SC_FORCE_DISCOUNT_LIQUOR_LIVE:[^\n]*contains\(inputs\.states, 'SC'\)[^\n]*'1'/);
  assert.match(exportContract, /isSouthCarolinaDiscountLiquorInventory/);
  assert.match(exportContract, /if \(isSouthCarolinaDiscountLiquorSignal\(signal\)\) return isSouthCarolinaDiscountLiquorInventory\(signal\)/);
  assert.match(packageJson.scripts['test:sc'], /sc-discount-liquor-square\.test\.mjs/);
});
