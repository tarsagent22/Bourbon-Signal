import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  FLORIDA_TAMPA_TARGET_STORE_IDS,
  parseLightspeedCatalogEntries,
  parseLightspeedProductInventory,
  parseLuekensPickupAvailability,
  parseSquarespaceInventoryItems,
  isUsefulBourbonSize,
  isAllowedHttpsHost,
} from '../src/collectors/florida-tampa-surfaces.mjs';
import { isFloridaRetailerInventory, isFloridaRetailerSignalIdentity } from '../src/florida-retailer-policy.mjs';
import { normalizeCityHiveReportedQuantity } from '../src/collectors/cityhive-hardening.mjs';
import { getStateLifecycle } from '../src/state-lifecycle.mjs';
import { ALL_STATE_SOURCES } from '../src/state-sources.mjs';

const baseSignal = {
  state: 'FL',
  eventType: 'retailer_store_inventory_result',
  locationPrecision: 'store_level',
  quantity: 0,
  availabilityStatus: 'in_stock',
  sourceAvailabilityVerified: true,
  canAlertAsInventory: true,
  confidence: 0.84,
};

test('Luekens pickup parser returns only explicitly available named stores', () => {
  const html = `
    <li class="pickup-availability-list__item">
      <h3>Luekens Kennedy (Tampa)</h3>
      <p class="alert alert--success">Pickup available, usually ready in 1 hour</p>
      <address><p>4643 West Kennedy Boulevard<br>Tampa FL 33609<br>United States</p></address>
    </li>
    <li class="pickup-availability-list__item">
      <h3>Luekens Midtown (Tampa)</h3>
      <p class="alert alert--error">Pickup currently unavailable</p>
      <address><p>236 North Dale Mabry Highway<br>Tampa FL 33609<br>United States</p></address>
    </li>`;
  assert.deepEqual(parseLuekensPickupAvailability(html).map((row) => row.id), ['luekens:kennedy-tampa']);
});

test('Lightspeed parsers preserve exact first-party stock and reject unavailable products', () => {
  const catalog = '<div class="product-block" data-json="https://gaspars.example/e-h-taylor.html?format=json"><img alt="E H Taylor Small Batch Bourbon"></div>';
  assert.deepEqual(parseLightspeedCatalogEntries(catalog), [{ title: 'E H Taylor Small Batch Bourbon', jsonUrl: 'https://gaspars.example/e-h-taylor.html?format=json' }]);
  const available = parseLightspeedProductInventory({ product: { id: 42, fulltitle: 'E H Taylor Small Batch Bourbon | 750ml', url: 'e-h-taylor.html', price: { price: 79.99 }, stock: { available: true, on_stock: true, level: 3 } } });
  assert.equal(available.quantity, 3);
  assert.equal(available.price, 79.99);
  assert.equal(parseLightspeedProductInventory({ product: { stock: { available: false, level: 3 } } }), null);
  assert.equal(parseLightspeedProductInventory({ product: { fulltitle: 'Missing ID Bourbon 750ml', stock: { available: true, on_stock: true, level: 3 } } }), null);
  assert.equal(parseLightspeedProductInventory({ product: { id: 43, stock: { available: true, on_stock: true, level: 3 } } }), null);
  assert.equal(isAllowedHttpsHost('https://www.gasparsliquorshoppe.com/product.json', 'gasparsliquorshoppe.com'), true);
  assert.equal(isAllowedHttpsHost('https://example.com/product.json', 'gasparsliquorshoppe.com'), false);
});

test('Squarespace parser exposes chain-level quantity without inventing a physical store and fails closed', () => {
  const html = '&quot;items&quot;:[{&quot;id&quot;:&quot;p1&quot;,&quot;title&quot;:&quot;Elijah Craig Single Barrel&quot;,&quot;fullUrl&quot;:&quot;/shop-picks/p/elijah&quot;,&quot;published&quot;:true,&quot;soldOut&quot;:false,&quot;variants&quot;:[{&quot;id&quot;:&quot;v1&quot;,&quot;sku&quot;:&quot;SQ1&quot;,&quot;price&quot;:{&quot;value&quot;:&quot;59.99&quot;},&quot;qtyInStock&quot;:6,&quot;soldOut&quot;:false}]}],&quot;pagination&quot;:{}';
  assert.deepEqual(parseSquarespaceInventoryItems(html).map((row) => ({ title: row.title, quantity: row.quantity })), [{ title: 'Elijah Craig Single Barrel', quantity: 6 }]);
  assert.deepEqual(parseSquarespaceInventoryItems('&quot;items&quot;:{&quot;not&quot;:&quot;an array&quot;}'), []);
  assert.deepEqual(parseSquarespaceInventoryItems('&quot;items&quot;:[{&quot;title&quot;:&quot;Bad&quot;,&quot;variants&quot;:{}}]'), []);
  assert.equal(parseLightspeedProductInventory({ product: { stock: { available: true, on_stock: true, level: Infinity } } }), null);
});

test('Florida bottle-size guard rejects 375ml and smaller variants consistently', () => {
  assert.equal(isUsefulBourbonSize('375ml'), false);
  assert.equal(isUsefulBourbonSize('50 ml'), false);
  assert.equal(isUsefulBourbonSize('750ml'), true);
  assert.equal(isUsefulBourbonSize('1.75L'), true);
  assert.equal(isUsefulBourbonSize('Default Title'), true);
});

test('Florida collectors apply size and origin guards before remote detail or watch promotion', () => {
  const source = readFileSync(new URL('../src/collectors/precision-probes.mjs', import.meta.url), 'utf8');
  assert.match(source, /const rawName = htmlToText\(product\?\.title \|\| ''\);\s+if \(!isUsefulBourbonSize\(rawName\)\) continue;/);
  assert.match(source, /for \(const item of parseSquarespaceInventoryItems\(res\.text\)\) \{\s+if \(!isUsefulBourbonSize\(item\.title\)\) continue;/);
  assert.match(source, /if \(!isAllowedHttpsHost\(entry\.jsonUrl, 'gasparsliquorshoppe\.com'\)\)/);
  assert.match(source, /redirect: 'manual'/);
  assert.match(source, /row\?\.option2, row\?\.option3/);
});

test('CityHive high sentinel quantities remain binary availability rather than fake shelf counts', () => {
  assert.deepEqual(normalizeCityHiveReportedQuantity(100), { reportedQuantity: 100, binaryAvailability: true, quantity: 1 });
  assert.deepEqual(normalizeCityHiveReportedQuantity(999), { reportedQuantity: 999, binaryAvailability: true, quantity: 1 });
});

test('Tampa Target cohort includes verified metro store IDs', () => {
  for (const id of ['2289', '2040', '798', '655', '656', '1051', '1820', '654', '1131', '1023', '2064', '812', '2235', '1382', '2919', '2118']) {
    assert.ok(FLORIDA_TAMPA_TARGET_STORE_IDS.has(id), `Missing Tampa Target store ${id}`);
  }
});

test('Florida policy accepts only the new exact first-party Tampa identities', () => {
  const luekens = {
    ...baseSignal,
    sourceLabel: 'Luekens Wine & Spirits Shopify store pickup inventory',
    sourceUrl: 'https://www.luekensliquors.com/products/e-h-taylor',
    sourceChain: 'luekens', merchantId: 'luekens-shopify',
    storeId: 'luekens:kennedy-tampa', storeAddress: '4643 West Kennedy Boulevard, Tampa, FL 33609', city: 'Tampa', stateCode: 'FL',
  };
  const gaspars = {
    ...baseSignal,
    quantity: 3,
    sourceLabel: "Gaspar's Liquor Shoppe Lightspeed store inventory",
    sourceUrl: 'https://www.gasparsliquorshoppe.com/e-h-taylor.html',
    sourceChain: 'gaspars-liquor-shoppe', merchantId: 'lightspeed:640576',
    storeId: 'gaspars-liquor-shoppe:tampa-56th', storeAddress: '8448 N 56th St, Tampa, FL 33617', city: 'Tampa', stateCode: 'FL',
  };
  const balm = {
    ...baseSignal,
    quantity: 3,
    eventType: 'cityhive_store_inventory_result',
    sourceLabel: 'Balm Liquor Riverview CityHive store inventory',
    sourceUrl: 'https://balmliquor.com/shop/product/test',
    sourceChain: 'balm-liquor', merchantId: '690be4c9ff35540f65da977b',
    storeId: 'balm-liquor:690be4c9ff35540f65da977b', storeAddress: '12302 Balm Riverview Rd, Riverview, FL 33569, USA', city: 'Riverview', stateCode: 'FL',
  };
  for (const signal of [luekens, gaspars, balm]) {
    assert.equal(isFloridaRetailerSignalIdentity(signal), true);
    assert.equal(isFloridaRetailerInventory(signal), true);
  }
  assert.equal(isFloridaRetailerSignalIdentity({ ...gaspars, merchantId: 'spoofed' }), false);
  assert.equal(isFloridaRetailerSignalIdentity({ ...luekens, storeId: 'luekens:unknown' }), false);
});

test('Liquor Depot chain-level quantity watch is identity-bound and never inventory-alertable', () => {
  const watch = {
    state: 'FL', eventType: 'retailer_catalog_availability', sourceLabel: 'Liquor Depot Tampa online quantity watch',
    sourceUrl: 'https://www.liquordepottampa.com/shop-picks/p/elijah', sourceChain: 'liquor-depot-tampa',
    merchantId: 'squarespace:63cf346e2314cb29f072d816', locationPrecision: 'store_aggregate',
    quantity: 0, canAlertAsInventory: false, canAlertAsWatch: true,
  };
  assert.equal(isFloridaRetailerSignalIdentity(watch), true);
  assert.equal(isFloridaRetailerInventory(watch), false);
  assert.equal(isFloridaRetailerSignalIdentity({ ...watch, sourceUrl: 'https://example.com/spoof' }), false);
});

test('Florida discovery seeds never pre-label unobserved Target directory rows as live inventory', () => {
  const seeds = JSON.parse(readFileSync(new URL('../data/store-discovery-seeds/FL.json', import.meta.url), 'utf8'));
  const targets = seeds.directorySeeds.filter((row) => row.name.startsWith('Target '));
  assert.ok(targets.length >= 16);
  assert.ok(targets.every((row) => row.inventoryStatus === 'storefront-probeable'));
});

test('Florida registry and customer area filters expose the Tampa expansion', () => {
  const florida = ALL_STATE_SOURCES.find((row) => row.id === 'FL');
  const labels = new Set(florida.sources.map((source) => source.label || source.name));
  for (const label of [
    'Balm Liquor Riverview CityHive store inventory',
    'Sunshine Food & Spirits Clearwater CityHive store inventory',
    "Gaspar's Liquor Shoppe Lightspeed store inventory",
    'Luekens Wine & Spirits Shopify store pickup inventory',
    'Liquor Depot Tampa online quantity watch',
  ]) assert.ok(labels.has(label), `Missing source registry label: ${label}`);
  const lifecycle = getStateLifecycle('FL');
  for (const area of ['Tampa', 'Clearwater', 'Largo', 'Saint Petersburg', 'Pinellas Park', 'Brandon', 'Riverview', 'Wesley Chapel', 'Lutz']) {
    assert.ok(lifecycle.areaOptions.includes(area), `Missing Florida area option: ${area}`);
  }
});
