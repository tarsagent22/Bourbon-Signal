import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyMoFirstPublication } from '../src/verify-mo-first-publication.mjs';
import { CENTRAL_CITYHIVE_PRODUCTION_COHORTS } from '../src/collectors/central-cityhive-premises.mjs';
import { CENTRAL_CITYHIVE_PRODUCTION_BUDGETS } from '../src/central-cityhive-production-config.mjs';
import { CENTRAL_CITYHIVE_PRODUCTION_SOURCES } from '../src/collectors/central-cityhive-premises.mjs';

// These rows are contract-only fixtures. They exercise the gate shape and do
// not assert that Missouri production has run or published these observations.
const nowMs = Date.parse('2026-11-14T14:28:00.000Z');
const stores = CENTRAL_CITYHIVE_PRODUCTION_SOURCES.filter(source => source.state === 'MO');
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
  return {
    state: 'MO', status: 'useful', stale: false,
    metadata: {
      allDeliveryDisabled: true,
      cityhive: {
        complete: true, cacheReused: false,
        selectedStores: stores.map(source => source.storeId),
        verifiedPremises: stores.map(source => source.storeId),
        requests, productionAlertDeliveryAllowed: false,
      },
    },
  };
}

test('Missouri first-publication gate accepts only the exact closed cohort and current production-bound rows', () => {
  const result = verifyMoFirstPublication({
    report: report(),
    partition: { state: 'MO', count: 9, drops: stores.slice(0, 9).map(row) },
    nowMs,
  });
  assert.deepEqual(result, {
    state: 'MO', currentRows: 9, positiveStores: 9, positiveCities: 6,
    hasAllocatedOrUnicorn: true, allDeliveryDisabled: true,
  });
});

test('Missouri first-publication gate refuses shadow-only rows and incomplete request profiles', () => {
  const shadowRows = stores.slice(0, 9).map(row).map(value => ({
    ...value,
    sourceRuntimeId: 'research:mo:central-cityhive:fixture',
    sourceProductBinding: { ...value.sourceProductBinding, shadowOnly: true, productionOnSiteOnly: false },
  }));
  assert.throws(() => verifyMoFirstPublication({ report: report(), partition: { state: 'MO', drops: shadowRows }, nowMs }), /first publication requires at least nine current positive stores/);
  const incomplete = report();
  incomplete.metadata.cityhive.requests = requests.slice(0, CENTRAL_CITYHIVE_PRODUCTION_BUDGETS.MO.maxRequests - 1);
  assert.throws(() => verifyMoFirstPublication({ report: incomplete, partition: { state: 'MO', drops: stores.slice(0, 9).map(row) }, nowMs }), /20 unique successful bounded requests/);
});
