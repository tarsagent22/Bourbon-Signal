import assert from 'node:assert/strict';
import test from 'node:test';

import { BourbonBible } from '../src/core/bible.mjs';
import { buildSouthCarolinaAllAmericanSignal, isSouthCarolinaAllAmericanCacheUsable } from '../src/collectors/precision-probes.mjs';
import { confidenceForSignal } from '../src/confidence-policy.mjs';
import { buildCurrentInventoryAlertsFromDrops, buildDrops } from '../src/export-site-contract.mjs';
import { canonicalizeSignal } from '../src/operational-report.mjs';
import { verifyAllAmericanAlertProjection } from '../src/verify-sc-all-american-alert-projection.mjs';
import {
  hasSouthCarolinaPositiveInventoryEvidence,
  isSouthCarolinaAllAmericanInventory,
} from '../src/south-carolina-retailer-policy.mjs';

const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));

function product(overrides = {}) {
  return {
    id: 1216,
    name: "Booker&#8217;s Bourbon &#8211; 750ml",
    permalink: 'https://www.aalmauldin.com/product/bookers-bourbon-750ml/',
    sku: '080686011408',
    is_in_stock: true,
    is_purchasable: false,
    is_on_backorder: false,
    prices: {
      price: '9898',
      currency_minor_unit: 2,
    },
    add_to_cart: { text: 'Read more' },
    ...overrides,
  };
}

function signal(overrides = {}) {
  return buildSouthCarolinaAllAmericanSignal(
    { id: 'SC' },
    product(),
    bible,
    new Date().toISOString(),
    overrides,
  );
}

test('All American binary stock becomes exact-store inventory without inventing quantity or orderability', () => {
  const row = signal();
  assert.ok(row);
  assert.equal(row.rawName, "Booker's Bourbon - 750ml");
  assert.equal(row.quantity, 0);
  assert.equal(row.storeQty, 0);
  assert.equal(row.quantityIsExact, false);
  assert.equal(row.quantitySemantics, 'binary_retailer_in_stock');
  assert.equal(row.sourceAvailabilityVerified, true);
  assert.equal(row.availabilityStatus, 'in_stock');
  assert.equal(row.orderabilityOfferVerified, false);
  assert.equal(row.storeId, 'all-american-liquor:all-american-liquor-mauldin');
  assert.equal(row.storeAddress, '121 W Butler Rd, Mauldin, SC 29662');
  assert.equal(row.productId, 1216);
  assert.equal(row.sku, '080686011408');
  assert.equal(isSouthCarolinaAllAmericanInventory(row), true);
  assert.equal(hasSouthCarolinaPositiveInventoryEvidence(row), true);
});

test('All American identity survives normalization and reaches on-site cards without baseline outbound delivery', () => {
  const row = signal();
  const normalized = canonicalizeSignal(row, bible);
  assert.equal(isSouthCarolinaAllAmericanInventory(normalized), true);
  assert.equal(confidenceForSignal(normalized).canAlertAsInventory, true);

  const record = { id: normalized.canonicalBottleId, canonical: normalized.canonicalName, tier: 'allocated', aliases: [] };
  const lookup = { byId: new Map([[record.id, record]]), byName: new Map() };
  const [drop] = buildDrops([normalized], lookup, [normalized]);
  assert.ok(drop);
  assert.equal(drop.canAlertAsInventory, true);
  assert.equal(drop.quantitySemantics, 'binary_retailer_in_stock');

  const [alert] = buildCurrentInventoryAlertsFromDrops([{ ...drop, tier: 'allocated', type: normalized.eventType }]);
  assert.ok(alert);
  assert.equal(alert.eligibleForOnSite, true);
  assert.equal(alert.eligibleForEmail, false);
  assert.equal(alert.eligibleForSms, false);
  assert.ok(alert.gates.includes('verified_binary_in_store_availability'));
  assert.equal(alert.gates.includes('verified_binary_orderability'), false);
  assert.match(alert.reason, /in-store availability/i);
  assert.match(alert.reason, /online orderability.*not published/i);
});

test('All American production verifier accepts separate first-run change and current on-site projections', () => {
  const drop = {
    canonicalBottleId: 'bottle-1',
    storeId: 'all-american-liquor:all-american-liquor-mauldin',
    productId: 1216,
    sku: '080686011408',
  };
  const current = {
    ...drop,
    changeType: 'current_inventory_signal',
    gates: ['current_public_drop', 'store_level', 'verified_binary_in_store_availability'],
  };
  const firstRunChange = {
    ...drop,
    changeType: 'availability_increase',
    gates: ['verified_binary_in_store_availability'],
  };

  assert.deepEqual(
    verifyAllAmericanAlertProjection({ sourceDrops: [drop], sourceAlerts: [current, firstRunChange] }),
    { currentInventoryAlerts: [current], additionalChangeAlerts: 1 },
  );
  assert.throws(
    () => verifyAllAmericanAlertProjection({ sourceDrops: [drop], sourceAlerts: [firstRunChange] }),
    /current on-site projection mismatch/,
  );
  assert.throws(
    () => verifyAllAmericanAlertProjection({ sourceDrops: [drop], sourceAlerts: [current, current] }),
    /current on-site projection mismatch/,
  );
  assert.throws(
    () => verifyAllAmericanAlertProjection({
      sourceDrops: [drop],
      sourceAlerts: [{ ...current, productId: 1234, sku: 'forged' }],
    }),
    /current on-site projection mismatch/,
  );
});

test('All American exact identity rejects forged source, premise, product, stock, and freshness bindings', () => {
  const row = signal();
  for (const mutate of [
    (copy) => { copy.state = 'NC'; copy.stateCode = 'NC'; },
    (copy) => { copy.sourceLabel = 'All American Liquor forged source'; },
    (copy) => { copy.sourceChain = 'forged'; },
    (copy) => { copy.sourceUrl = 'https://example.com/product/bookers-bourbon-750ml/'; },
    (copy) => { copy.storeId = 'all-american-liquor:other'; },
    (copy) => { copy.storeAddress = '125 W Butler Rd, Mauldin, SC 29662'; },
    (copy) => { copy.city = 'Greenville'; },
    (copy) => { copy.productId = 9999; },
    (copy) => { copy.sku = 'forged'; },
    (copy) => { copy.raw.product.id = 9999; },
    (copy) => { copy.raw.product.sku = 'forged'; },
    (copy) => { delete copy.raw.product.id; },
    (copy) => { delete copy.raw.product.sku; },
    (copy) => { delete copy.raw.chain; },
    (copy) => { copy.raw.product.is_in_stock = false; },
    (copy) => { copy.raw.product.is_on_backorder = true; },
    (copy) => { copy.sourceProductInStock = false; },
    (copy) => { copy.sourceProductBackordered = true; },
    (copy) => { copy.quantity = 1; copy.storeQty = 1; },
    (copy) => { delete copy.quantity; },
    (copy) => { delete copy.storeQty; },
    (copy) => { copy.quantityIsExact = true; },
    (copy) => { copy.quantitySemantics = 'exact_retailer_quantity'; },
    (copy) => { copy.sourceAvailabilityVerified = false; },
    (copy) => { copy.availabilityStatus = 'out_of_stock'; },
    (copy) => { copy.observedAt = new Date(Date.now() - 3 * 60 * 60_000).toISOString(); },
    (copy) => { copy.observedAt = new Date(Date.now() + 10 * 60_000).toISOString(); },
  ]) {
    const forged = structuredClone(row);
    mutate(forged);
    assert.equal(isSouthCarolinaAllAmericanInventory(forged), false);
    assert.equal(confidenceForSignal(forged).canAlertAsInventory, false);
  }
});

test('All American parser fails closed for unavailable, backordered, unsafe-format, and ambiguous products', () => {
  assert.equal(buildSouthCarolinaAllAmericanSignal({ id: 'SC' }, product({ is_in_stock: false }), bible, new Date().toISOString()), null);
  assert.equal(buildSouthCarolinaAllAmericanSignal({ id: 'SC' }, product({ is_on_backorder: true }), bible, new Date().toISOString()), null);
  assert.equal(buildSouthCarolinaAllAmericanSignal({ id: 'SC' }, product({ is_on_backorder: undefined }), bible, new Date().toISOString()), null);
  assert.equal(buildSouthCarolinaAllAmericanSignal({ id: 'SC' }, product({ name: 'Bookers Bourbon 375ml' }), bible, new Date().toISOString()), null);
  assert.equal(buildSouthCarolinaAllAmericanSignal({ id: 'SC' }, product({ name: 'Bookers Bourbon 187ml' }), bible, new Date().toISOString()), null);
  assert.equal(buildSouthCarolinaAllAmericanSignal({ id: 'SC' }, product({ name: 'Bookers Bourbon 2pk 750ml' }), bible, new Date().toISOString()), null);
  assert.equal(buildSouthCarolinaAllAmericanSignal({ id: 'SC' }, product({ name: 'Bookers Bourbon 2 x 750 ml' }), bible, new Date().toISOString()), null);
  assert.equal(buildSouthCarolinaAllAmericanSignal({ id: 'SC' }, product({ name: 'Bookers Bourbon pack of 2 750ml' }), bible, new Date().toISOString()), null);
  assert.equal(buildSouthCarolinaAllAmericanSignal({ id: 'SC' }, product({ name: 'Bookers Bourbon 3-pack 750ml' }), bible, new Date().toISOString()), null);
  assert.equal(buildSouthCarolinaAllAmericanSignal({ id: 'SC' }, product({ name: 'Bookers Cabernet Wine 750ml' }), bible, new Date().toISOString()), null);
  assert.equal(buildSouthCarolinaAllAmericanSignal({ id: 'SC' }, product({ id: null }), bible, new Date().toISOString()), null);
  assert.equal(buildSouthCarolinaAllAmericanSignal({ id: 'SC' }, product({ sku: '' }), bible, new Date().toISOString()), null);
});

test('All American cache rejects legacy inventory rows without the reviewed proof schema', () => {
  const nowMs = Date.parse('2026-08-04T21:00:00.000Z');
  const generatedAt = '2026-08-04T20:30:00.000Z';
  const row = buildSouthCarolinaAllAmericanSignal({ id: 'SC' }, product(), bible, generatedAt);
  assert.equal(isSouthCarolinaAllAmericanCacheUsable([row], generatedAt, nowMs), true);
  assert.equal(isSouthCarolinaAllAmericanCacheUsable([], generatedAt, nowMs), false);
  assert.equal(isSouthCarolinaAllAmericanCacheUsable([row], '2026-08-04T21:06:00.000Z', nowMs), false);
  assert.equal(isSouthCarolinaAllAmericanCacheUsable([row], '2026-08-04T18:59:59.999Z', nowMs), false);
  for (const mutate of [
    (copy) => { delete copy.productId; },
    (copy) => { delete copy.sku; },
    (copy) => { delete copy.sourceProductProofId; },
    (copy) => { delete copy.sourceProductProofSku; },
    (copy) => { delete copy.quantityIsExact; },
    (copy) => { delete copy.orderabilityOfferVerified; },
    (copy) => { delete copy.sourceProductInStock; },
    (copy) => { delete copy.sourceProductBackordered; },
    (copy) => { delete copy.raw.product.id; },
    (copy) => { delete copy.raw.product.sku; },
    (copy) => { delete copy.raw.product; },
    (copy) => { copy.storeId = 'all-american-liquor:forged'; },
    (copy) => { copy.sourceUrl = 'https://example.com/product/bookers-bourbon-750ml/'; },
  ]) {
    const legacy = structuredClone(row);
    mutate(legacy);
    assert.equal(isSouthCarolinaAllAmericanCacheUsable([legacy], generatedAt, nowMs), false);
  }
});
