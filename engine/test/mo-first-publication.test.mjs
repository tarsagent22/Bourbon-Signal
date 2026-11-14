import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyMoFirstPublication } from '../src/verify-mo-first-publication.mjs';
import { CENTRAL_CITYHIVE_PRODUCTION_COHORTS } from '../src/collectors/central-cityhive-premises.mjs';
import { CENTRAL_CITYHIVE_PRODUCTION_BUDGETS } from '../src/central-cityhive-production-config.mjs';
import { CENTRAL_CITYHIVE_PRODUCTION_SOURCES } from '../src/collectors/central-cityhive-premises.mjs';
import { buildLocationBible } from '../src/location-bible.mjs';

// These rows are contract-only fixtures. They exercise the gate shape and do
// not assert that Missouri production has run or published these observations.
const nowMs = Date.parse('2026-11-14T14:28:00.000Z');
const stores = CENTRAL_CITYHIVE_PRODUCTION_SOURCES.filter(source => source.state === 'MO');
const bible = {records: [{canonical: "Blanton's Gold", libraryIdentities: [{id: 'blantons-gold',
  canonicalName: "Blanton's Gold", aliases: [], nationalTier: 'unicorn', stateOverrides: []}]}]};
const requests = stores.flatMap(source => ['barrel proof', "Blanton's Gold"].map(term => ({
  sourceId: source.id,
  url: `${source.baseUrl}/shop/?ch-query=${encodeURIComponent(term)}&merchant-id=${source.merchantId}`,
  status: 200,
  ok: true,
})));
function row(source, index) {
  const observedAt = new Date(nowMs - 1_000).toISOString();
  const productId = `fixture-product-${index}`;
  const optionId = `fixture-option-${index}`;
  const rawName = 'Fixture Reviewed Bourbon';
  const canonicalName = 'Fixture Reviewed Bourbon';
  const canonicalBottleId = `bb_fixture_${index}`;
  const sourceProductBinding = {
    schemaVersion: 1, source: 'central-cityhive', merchantId: source.merchantId,
    storeId: source.storeId, storeAddress: source.address, productId, optionId, rawName,
    canonicalBottleId, canonicalName, price: 49.99, observedAt, premisesVerified: true,
    pickupOfferVerified: true, reportedQuantity: 1,
    quantitySemantics: 'binary_retailer_orderable_no_exact_count',
    latitude: source.lat, longitude: source.lng, coordinatesVerified: true,
    productionOnSiteOnly: true, productionCohortSha256: CENTRAL_CITYHIVE_PRODUCTION_COHORTS.MO,
  };
  return {
    id: `fixture-${index}`, state: 'MO', stateCode: 'MO', sourceLabel: source.sourceLabel,
    source: source.sourceLabel, sourceChain: source.chainId || source.id,
    eventType: 'retailer_store_inventory_result',
    sourceUrl: `${source.baseUrl}/shop/product/fixture-bourbon/${productId}?option-id=${optionId}`,
    merchantId: source.merchantId, storeId: source.storeId, storeName: source.name,
    storeAddress: source.address, city: source.city, zip: source.zip, locationPrecision: 'store_level',
    productId, optionId, variantId: optionId, rawName, canonicalName, canonicalBottleId,
    tier: index === 0 ? 'unicorn' : 'limited', price: 49.99, observedAt,
    availabilityStatus: 'in_stock', sourceAvailabilityVerified: true, quantity: 0,
    quantityIsExact: false, quantitySemantics: 'binary_retailer_orderable_no_exact_count',
    sourceProductBinding, sourceRuntimeId: 'mo:central-cityhive',
    canAlertAsInventory: false, canAlertAsWatch: false, alertable: false,
    eligibleForOnSite: true, eligibleForDropFeed: true, eligibleForWatch: false,
    eligibleForDelivery: false, eligibleForEmail: false, eligibleForSms: false,
  };
}
function report() {
  const sourceObservedAt = new Date(nowMs - 5_000).toISOString();
  const signals = stores.slice(0, 9).map(row);
  for (const signal of signals) { signal.observedAt = sourceObservedAt; signal.sourceProductBinding.observedAt = sourceObservedAt; }
  return {
    state: 'MO', status: 'useful', stale: false,
    startedAt: new Date(nowMs - 10_000).toISOString(), finishedAt: new Date(nowMs - 1_000).toISOString(),
    lastGoodAt: sourceObservedAt, signals,
    metadata: {
      allDeliveryDisabled: true,
      cityhive: {
        complete: true, cacheReused: false,
        selectedStores: stores.map(source => source.storeId),
        verifiedPremises: stores.map(source => source.storeId),
        requests, productionAlertDeliveryAllowed: false,
        sourceObservedAt,
      },
    },
  };
}

test('Missouri first-publication gate accepts only the exact closed cohort and current production-bound rows', () => {
  const value = report();
  const result = verifyMoFirstPublication({
    report: value,
    partition: { state: 'MO', count: 9, drops: value.signals },
    workflowRunId: '43699999999',
    bible, nowMs,
  });
  assert.deepEqual(result, {
    state: 'MO', currentRows: 9, positiveStores: 9, positiveCities: 6,
    hasAllocatedOrUnicorn: true, allocatedRows: 1, allocatedSearchStores: stores.length, allDeliveryDisabled: true,
  });
});

test('Missouri Finder retains reviewed storefronts when searches have no current rows', () => {
  const locations = buildLocationBible(report().signals).filter(location => location.state === 'MO' && location.type === 'store');
  assert.deepEqual(locations.map(({id, address}) => [id, address]).sort(),
    stores.map(({storeId, address}) => [storeId, address]).sort());
  assert.equal(locations.filter(location => location.hasSignals).length, 9);
});

test('Missouri receipt binds exact report and partition bytes and oldest source clock', () => {
  const value = report();
  const partition = { state: 'MO', count: 9, drops: value.signals };
  const reportBytes = Buffer.from(JSON.stringify(value));
  const partitionBytes = Buffer.from(JSON.stringify(partition));
  const checked = verifyMoFirstPublication({ report: value, partition, reportBytes, partitionBytes, bible, workflowRunId: '43699999999', nowMs });
  assert.equal(checked.receipt.workflowRunId, '43699999999');
  assert.equal(checked.receipt.reportSha256, createHash('sha256').update(reportBytes).digest('hex'));
  assert.equal(checked.receipt.partitionSha256, createHash('sha256').update(partitionBytes).digest('hex'));
  assert.equal(checked.receipt.oldestInCohortSourceObservedAt, value.metadata.cityhive.sourceObservedAt);
  assert.throws(() => verifyMoFirstPublication({ report: value, partition, workflowRunId: '', nowMs }), /hosted refresh workflow run id/);
  assert.throws(() => verifyMoFirstPublication({ report: value, partition: { ...partition, count: 8 }, workflowRunId: '43699999999', nowMs }), /public partition/);
  const stale = structuredClone(value);
  stale.metadata.cityhive.sourceObservedAt = new Date(nowMs - 600_000).toISOString();
  assert.throws(() => verifyMoFirstPublication({ report: stale, partition, nowMs }), /oldest in-cohort source clock/);
});

test('Missouri first-publication gate refuses shadow-only rows and incomplete request profiles', () => {
  const shadowRows = stores.slice(0, 9).map(row).map(value => ({
    ...value,
    sourceRuntimeId: 'research:mo:central-cityhive:fixture',
    sourceProductBinding: { ...value.sourceProductBinding, shadowOnly: true, productionOnSiteOnly: false },
  }));
  assert.throws(() => verifyMoFirstPublication({ report: report(), partition: { state: 'MO', count:9, drops: shadowRows }, nowMs }), /first publication requires at least nine current positive stores/);
  const incomplete = report();
  incomplete.metadata.cityhive.requests = requests.slice(0, CENTRAL_CITYHIVE_PRODUCTION_BUDGETS.MO.maxRequests - 1);
  assert.throws(() => verifyMoFirstPublication({ report: incomplete, partition: { state: 'MO', drops: stores.slice(0, 9).map(row) }, nowMs }), /20 unique successful bounded requests/);
});


test('verified allocated searches keep the nine-store publication useful when all observed bottles are limited', () => {
  const value = report();
  value.signals[0].tier = 'limited';
  const partition = { state: 'MO', count: 9, drops: value.signals };
  const inputs = {report: value, partition, bible, workflowRunId: '43699999999', nowMs};
  const verified = verifyMoFirstPublication(inputs);
  assert.equal(verified.allocatedSearchStores, stores.length);
  assert.equal(verified.allocatedRows, 0);
  assert.equal(verified.hasAllocatedOrUnicorn, false);
  assert.throws(() => verifyMoFirstPublication({...inputs, bible: {records: []}}), /indexed allocated searches/);
  const unreviewed = structuredClone(value);
  unreviewed.metadata.cityhive.requests[1].url = unreviewed.metadata.cityhive.requests[1].url.replace("Blanton's%20Gold", 'Ordinary%20Bourbon');
  assert.throws(() => verifyMoFirstPublication({...inputs, report: unreviewed}), /indexed allocated searches/);
  const forged = structuredClone(partition);
  forged.drops[0].tier = 'unicorn';
  assert.throws(() => verifyMoFirstPublication({...inputs, partition: forged}), /absent from the current source report/);
});
