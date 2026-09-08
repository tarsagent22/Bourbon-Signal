import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { BourbonBible } from '../src/core/bible.mjs';
import { buildSouthCarolinaAllAmericanSignal, isSouthCarolinaAllAmericanCacheUsable } from '../src/collectors/precision-probes.mjs';
import { confidenceForSignal } from '../src/confidence-policy.mjs';
import { buildAlerts, buildCurrentInventoryAlertsFromDrops, buildDrops } from '../src/export-site-contract.mjs';
import { candidateFromChange, canonicalizeSignal } from '../src/operational-report.mjs';
import { verifyAllAmericanAlertProjection } from '../src/verify-sc-all-american-alert-projection.mjs';
import {
  hasSouthCarolinaAllAmericanRawSourceProof,
  hasSouthCarolinaPositiveInventoryEvidence,
  isSouthCarolinaAllAmericanInventory,
  isSouthCarolinaAllAmericanLocation,
  isSouthCarolinaAllAmericanSignal,
  isSouthCarolinaAllAmericanStoreExport,
} from '../src/south-carolina-retailer-policy.mjs';

const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));
const allAmericanVerifierSource = readFileSync(new URL('../src/verify-sc-all-american.mjs', import.meta.url), 'utf8');
const allAmericanPreviewCapture = JSON.parse(readFileSync(new URL('./fixtures/sc/all-american-preview-live.json', import.meta.url), 'utf8'));

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

test('All American remains catalog-only while its live storefront is preview-only', () => {
  const row = signal();
  assert.ok(row);
  assert.equal(row.rawName, "Booker's Bourbon - 750ml");
  assert.equal(row.quantity, 0);
  assert.equal(row.storeQty, 0);
  assert.equal(row.quantityIsExact, false);
  assert.equal(row.quantitySemantics, 'binary_retailer_in_stock');
  assert.equal(row.eventType, 'retailer_catalog_result');
  assert.equal(row.sourceAvailabilityVerified, false);
  assert.equal(row.availabilityStatus, 'catalog_listed');
  assert.equal(row.orderabilityOfferVerified, false);
  assert.equal(row.storeId, 'all-american-liquor:all-american-liquor-mauldin');
  assert.equal(row.storeAddress, '121 W Butler Rd, Mauldin, SC 29662');
  assert.equal(row.productId, 1216);
  assert.equal(row.sku, '080686011408');
  assert.equal(row.canAlertAsInventory, false);
  assert.equal(row.canAlertAsWatch, false);
  assert.equal(isSouthCarolinaAllAmericanInventory(row), false);
  assert.equal(hasSouthCarolinaPositiveInventoryEvidence(row), false);
});

test('All American raw and rawless rows fail normalization, cache, public-drop, and alert paths', () => {
  const row = signal();
  const normalized = canonicalizeSignal(row, bible);
  assert.equal(isSouthCarolinaAllAmericanInventory(row), false);
  assert.equal(isSouthCarolinaAllAmericanInventory(normalized), false);
  assert.equal(confidenceForSignal(normalized).canAlertAsInventory, false);
  assert.equal(isSouthCarolinaAllAmericanCacheUsable([row], row.observedAt, Date.parse(row.observedAt)), false);

  const record = { id: normalized.canonicalBottleId, canonical: normalized.canonicalName, tier: 'allocated', aliases: [] };
  const lookup = { byId: new Map([[record.id, record]]), byName: new Map() };
  assert.deepEqual(buildDrops([normalized], lookup, [normalized]), []);

  const rawless = structuredClone(normalized);
  delete rawless.raw;
  rawless.eventType = 'retailer_store_inventory_result';
  rawless.canAlertAsInventory = true;
  rawless.sourceAvailabilityVerified = true;
  rawless.availabilityStatus = 'in_stock';
  assert.equal(isSouthCarolinaAllAmericanInventory(rawless), false);
  assert.equal(confidenceForSignal(rawless).canAlertAsInventory, false);
  assert.deepEqual(buildDrops([rawless], lookup, [rawless]), []);
  assert.deepEqual(buildCurrentInventoryAlertsFromDrops([{ ...rawless, tier: 'allocated', type: rawless.eventType }]), []);
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
    changeType: 'new_signal',
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
  assert.throws(
    () => verifyAllAmericanAlertProjection({
      sourceDrops: [{ ...drop, productId: null }],
      sourceAlerts: [{ ...current, productId: null }],
    }),
    /missing or duplicate projection identities/,
  );
  assert.throws(
    () => verifyAllAmericanAlertProjection({
      sourceDrops: [drop],
      sourceAlerts: [current, { ...firstRunChange, changeType: 'missing_signal' }],
    }),
    /additional change projections/,
  );
});

test('All American production verifier accepts healthy exact source rows suppressed by the customer relevance layer', () => {
  const suppressedSourceRow = {
    canonicalBottleId: 'regular-bottle',
    storeId: 'all-american-liquor:all-american-liquor-mauldin',
    productId: 1216,
    sku: '080686011408',
  };
  assert.deepEqual(verifyAllAmericanAlertProjection({
    sourceDrops: [],
    sourceAlerts: [],
    sourceInventoryRows: [suppressedSourceRow],
    expectedAdditionalChangeRows: [],
  }), { currentInventoryAlerts: [], additionalChangeAlerts: 0 });
  assert.doesNotMatch(allAmericanVerifierSource, /if \(!sourceDrops\.length\) throw/);
});

test('All American production verifier accepts safe source changes collapsed from customer cards', () => {
  const customerDrop = {
    canonicalBottleId: 'bottle-1',
    storeId: 'all-american-liquor:all-american-liquor-mauldin',
    productId: 1216,
    sku: '080686011408',
  };
  const collapsedSourceRow = {
    ...customerDrop,
    productId: 1241,
    sku: '088004025731',
  };
  const current = {
    ...customerDrop,
    changeType: 'current_inventory_signal',
    gates: ['current_public_drop', 'store_level', 'verified_binary_in_store_availability'],
  };
  const safeCollapsedChange = {
    ...collapsedSourceRow,
    changeType: 'changed_signal',
    gates: ['store_level', 'verified_binary_in_store_availability'],
  };

  assert.deepEqual(
    verifyAllAmericanAlertProjection({
      sourceDrops: [customerDrop],
      sourceAlerts: [current, safeCollapsedChange],
      sourceInventoryRows: [customerDrop, collapsedSourceRow],
      expectedAdditionalChangeRows: [safeCollapsedChange],
    }),
    { currentInventoryAlerts: [current], additionalChangeAlerts: 1 },
  );
  assert.throws(
    () => verifyAllAmericanAlertProjection({
      sourceDrops: [customerDrop],
      sourceAlerts: [current, safeCollapsedChange],
      sourceInventoryRows: [customerDrop],
      expectedAdditionalChangeRows: [safeCollapsedChange],
    }),
    /unrelated to current source inventory/,
  );
  assert.throws(
    () => verifyAllAmericanAlertProjection({
      sourceDrops: [customerDrop],
      sourceAlerts: [current],
      sourceInventoryRows: [customerDrop, collapsedSourceRow],
      expectedAdditionalChangeRows: [safeCollapsedChange],
    }),
    /additional change projections/,
  );
  assert.throws(
    () => verifyAllAmericanAlertProjection({
      sourceDrops: [customerDrop],
      sourceAlerts: [current, safeCollapsedChange],
      sourceInventoryRows: [customerDrop, collapsedSourceRow],
      expectedAdditionalChangeRows: [{ ...safeCollapsedChange, changeType: 'new_signal' }],
    }),
    /additional change projections/,
  );
  assert.throws(
    () => verifyAllAmericanAlertProjection({
      sourceDrops: [{ ...customerDrop, canonicalId: 'conflicting-bottle' }],
      sourceAlerts: [{ ...current, canonicalId: 'conflicting-bottle' }],
      sourceInventoryRows: [customerDrop, collapsedSourceRow],
    }),
    /missing or duplicate projection identities/,
  );
});

test('All American production source proof requires the raw product binding', () => {
  const row = signal();
  assert.equal(hasSouthCarolinaAllAmericanRawSourceProof(row), true);
  for (const mutate of [
    (copy) => { delete copy.raw; },
    (copy) => { delete copy.raw.product; },
    (copy) => { copy.raw.chain = 'forged'; },
    (copy) => { copy.raw.product.id = 9999; },
    (copy) => { copy.raw.product.sku = 'forged'; },
    (copy) => { copy.raw.product.is_in_stock = false; },
    (copy) => { copy.raw.product.is_on_backorder = true; },
  ]) {
    const forged = structuredClone(row);
    mutate(forged);
    assert.equal(hasSouthCarolinaAllAmericanRawSourceProof(forged), false);
  }
});

test('All American broad classifier catches malformed final-output identities', () => {
  for (const mutate of [
    (copy) => { copy.state = 'NC'; copy.stateCode = 'NC'; },
    (copy) => { copy.sourceLabel = 'forged source'; },
    (copy) => { copy.sourceChain = 'forged'; },
  ]) {
    const forged = signal();
    mutate(forged);
    assert.equal(isSouthCarolinaAllAmericanSignal(forged), true);
    assert.equal(isSouthCarolinaAllAmericanInventory(forged), false);
  }
});

test('All American location and exported store require the complete exact premise', () => {
  const row = signal();
  const location = {
    ...row,
    eventType: 'retailer_store_location',
    sourceUrl: 'https://www.aalmauldin.com',
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    raw: {
      chain: 'all-american-liquor',
      store: {
        id: 'all-american-liquor-mauldin',
        name: 'All American Liquor',
        address: '121 W Butler Rd, Mauldin, SC 29662',
        city: 'Mauldin',
        zip: '29662',
      },
    },
  };
  const store = {
    id: row.storeId,
    sourceStoreId: row.storeId,
    state: 'SC',
    name: row.storeName,
    address: row.storeAddress,
    city: row.city,
    zip: row.zip,
    source: row.sourceLabel,
    signalCount: 1,
    hasSignals: true,
    collectorAttached: true,
    sourceAvailabilityVerified: true,
  };
  assert.equal(isSouthCarolinaAllAmericanLocation(location), true);
  assert.equal(isSouthCarolinaAllAmericanStoreExport(store), true);
  for (const mutate of [
    (copy) => { copy.state = 'NC'; },
    (copy) => { copy.name = 'Forged Store'; },
    (copy) => { copy.city = 'Greenville'; },
    (copy) => { copy.zip = '99999'; },
    (copy) => { copy.source = 'forged source'; },
    (copy) => { copy.signalCount = 0; copy.hasSignals = false; },
  ]) {
    const forged = structuredClone(store);
    mutate(forged);
    assert.equal(isSouthCarolinaAllAmericanSignal(forged), true);
    assert.equal(isSouthCarolinaAllAmericanStoreExport(forged), false);
  }
});

test('All American catalog rows cannot enter the exported alert contract', () => {
  const normalized = canonicalizeSignal(signal(), bible);
  const candidate = candidateFromChange({ type: 'new_signal', key: normalized.key, before: null, after: normalized });
  assert.notEqual(candidate.eligibleForEmail, true);
  assert.notEqual(candidate.eligibleForSms, true);
  assert.notEqual(candidate.eligibleForDelivery, true);
  assert.equal(candidate.canonicalBottleId, normalized.canonicalBottleId);
  assert.equal(candidate.productId, normalized.productId);
  assert.equal(candidate.sku, normalized.sku);

  assert.deepEqual(buildAlerts({ candidates: [candidate] }), []);
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

test('All American forged identity cannot create exact-store rows, customer cards, alert evidence, or outbound alerts', () => {
  const normalized = canonicalizeSignal(signal(), bible);
  const record = { id: normalized.canonicalBottleId, canonical: normalized.canonicalName, tier: 'allocated', aliases: [] };
  const lookup = { byId: new Map([[record.id, record]]), byName: new Map() };
  const mutations = [
    (copy) => { copy.sourceLabel = 'All American Liquor forged source'; },
    (copy) => { copy.sourceChain = 'forged'; copy.raw.chain = 'forged'; },
    (copy) => { copy.storeId = 'all-american-liquor:forged'; },
    (copy) => { copy.storeAddress = '125 W Butler Rd, Mauldin, SC 29662'; },
    (copy) => { copy.city = 'Greenville'; },
    (copy) => { copy.postalCode = '29601'; copy.zip = '29601'; },
    (copy) => { copy.productId = 9999; },
    (copy) => { copy.sku = 'forged'; },
    (copy) => { copy.sourceProductProofId = '9999'; },
    (copy) => { copy.sourceProductProofSku = 'forged'; },
  ];

  for (const mutate of mutations) {
    const forged = structuredClone(normalized);
    mutate(forged);
    assert.equal(isSouthCarolinaAllAmericanInventory(forged), false);
    assert.equal(confidenceForSignal(forged).canAlertAsInventory, false);
    assert.deepEqual(buildDrops([forged], lookup, [forged]), []);

    const candidate = candidateFromChange({ type: 'new_signal', key: forged.key, before: null, after: forged });
    assert.equal(candidate.eligibleForDelivery, false);
    assert.deepEqual(buildAlerts({ candidates: [candidate] }), []);
  }
});

test('All American parser fails closed for unavailable, backordered, unsafe-format, and ambiguous products', () => {
  for (const malformed of [null, {}, [], 'denied', { name: {} }, product({ name: null }), product({ permalink: 'denied' })]) {
    assert.doesNotThrow(() => buildSouthCarolinaAllAmericanSignal({ id: 'SC' }, malformed, bible, new Date().toISOString()));
    assert.equal(buildSouthCarolinaAllAmericanSignal({ id: 'SC' }, malformed, bible, new Date().toISOString()), null);
  }
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

test('captured All American private-sync preview is not current stock despite WooCommerce is_in_stock', () => {
  assert.equal(allAmericanPreviewCapture.status, 200);
  assert.equal(allAmericanPreviewCapture.xWpTotal, 1);
  assert.match(allAmericanPreviewCapture.rawSha256, /^[a-f0-9]{64}$/);
  const [preview] = allAmericanPreviewCapture.products;
  assert.equal(preview.is_in_stock, true);
  assert.equal(preview.is_on_backorder, false);
  assert.match(preview.short_description, /private sync preview/i);
  assert.match(preview.description, /ask us for current availability/i);
  assert.equal(buildSouthCarolinaAllAmericanSignal({ id: 'SC' }, preview, bible, allAmericanPreviewCapture.capturedAt), null);
});

test('All American cache rejects legacy inventory rows without the reviewed proof schema', () => {
  const nowMs = Date.parse('2026-08-04T21:00:00.000Z');
  const generatedAt = '2026-08-04T20:30:00.000Z';
  const row = buildSouthCarolinaAllAmericanSignal({ id: 'SC' }, product(), bible, generatedAt);
  assert.equal(isSouthCarolinaAllAmericanCacheUsable([row], generatedAt, nowMs), false);
  assert.equal(isSouthCarolinaAllAmericanCacheUsable([], generatedAt, nowMs), false);
  assert.equal(isSouthCarolinaAllAmericanCacheUsable(null, generatedAt, nowMs), false);
  assert.equal(isSouthCarolinaAllAmericanCacheUsable('HTTP 403 denied', generatedAt, nowMs), false);
  assert.equal(isSouthCarolinaAllAmericanCacheUsable([{ status: 403, error: 'source denied' }], generatedAt, nowMs), false);
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
