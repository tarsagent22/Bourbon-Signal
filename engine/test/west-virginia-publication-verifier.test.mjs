import test from 'node:test';
import assert from 'node:assert/strict';

import { verifyWestVirginiaRecentPurchaseArtifact } from '../src/verification/west-virginia-recent-purchase-verifier.mjs';

function purchaseSignal(index, overrides = {}) {
  return {
    id: `purchase-${index}`,
    state: 'WV',
    sourceRuntimeId: 'wv:configured:wv-abca-recent-purchases',
    eventType: 'wv_abca_retailer_recent_purchase_window',
    canonicalBottleId: 'buffalo-trace',
    canonicalName: 'Buffalo Trace',
    locationPrecision: 'store_level',
    locationProjectionDisabled: true,
    storeId: `wvabca-store-${500 + index}`,
    storeNumber: String(500 + index),
    storeName: `Store ${index}`,
    storeAddress: `${index} Main St, Charleston, WV`,
    premisesVerified: true,
    availabilityStatus: 'recent_purchase_window',
    sourceAvailabilityVerified: false,
    quantity: 0,
    quantityIsExact: false,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    raw: {
      officialStoreNumber: 500 + index,
      officialProductId: 827,
      officialBottleSizeMl: 750,
      purchaseWindowDays: 90,
      noPurchaseDate: true,
      noReportedQuantity: true,
      noLiveInventory: true,
      sourceRuntimeNonAlertable: true,
      premisesVerified: true,
    },
    ...overrides,
  };
}

function validArtifact() {
  const purchaseSignals = Array.from({ length: 20 }, (_, index) => purchaseSignal(index));
  const productGroups = [
    { productId: 827, count: 10 },
    { productId: 10150, count: 5 },
    { productId: 734, count: 5 },
  ];
  let offset = 0;
  for (const group of productGroups) {
    for (const signal of purchaseSignals.slice(offset, offset + group.count)) {
      signal.raw.officialProductId = group.productId;
      signal.canonicalBottleId = `bottle-${group.productId}`;
      signal.canonicalName = `Bottle ${group.productId}`;
    }
    offset += group.count;
  }
  return {
    state: 'WV',
    status: 'useful',
    stale: false,
    signals: [
      ...purchaseSignals,
      ...Array.from({ length: 180 }, (_, index) => ({ id: `directory-${index}`, state: 'WV', eventType: 'retailer_store_location', sourceRuntimeId: 'official-directory:wv-abca-active-retail-liquor-stores' })),
      ...Array.from({ length: 6 }, (_, index) => ({ id: `barrel-${index}`, state: 'WV', eventType: 'barrel_pick_signal', sourceRuntimeId: 'wv:configured:wv-abca-barrel-selections' })),
    ],
    sources: [{
      sourceRuntimeId: 'wv:configured:wv-abca-recent-purchases',
      ok: true,
      status: 200,
      signalType: 'wv_abca_retailer_recent_purchase_window',
      matchedBottleCount: 3,
      locationCount: 20,
      recentPurchaseSignalCount: 20,
      productResults: [
        { productId: 827, bottleSize: 750, storeCount: 10, signalCount: 10 },
        { productId: 10150, bottleSize: 750, storeCount: 5, signalCount: 5 },
        { productId: 734, bottleSize: 750, storeCount: 5, signalCount: 5 },
      ],
      requestCount: 9,
      maximumRequests: 9,
      canaryStoreCount: 155,
      purchaseWindowDays: 90,
      sourceAvailabilityVerified: false,
      canAlertAsInventory: false,
      canAlertAsWatch: false,
      error: null,
    }],
    roadblocks: [],
  };
}

test('WV publication verifier accepts a current exact-store non-inventory purchase artifact', () => {
  const result = verifyWestVirginiaRecentPurchaseArtifact(validArtifact());
  assert.deepEqual(result, {
    state: 'WV',
    recentPurchaseSignalCount: 20,
    recentPurchaseStoreCount: 20,
    matchedBottleCount: 3,
    directoryStoreCount: 180,
    barrelSelectionCount: 6,
    requestCount: 9,
    canaryStoreCount: 155,
  });
});

test('WV publication verifier rejects missing source output and silent canary collapse', () => {
  const missing = validArtifact();
  missing.sources = [];
  assert.throws(() => verifyWestVirginiaRecentPurchaseArtifact(missing), /source report/i);

  const collapsed = validArtifact();
  collapsed.sources[0].canaryStoreCount = 0;
  assert.throws(() => verifyWestVirginiaRecentPurchaseArtifact(collapsed), /canary/i);

  const partialProduct = validArtifact();
  partialProduct.sources[0].productResults[1].storeCount = 0;
  partialProduct.sources[0].productResults[1].signalCount = 0;
  assert.throws(() => verifyWestVirginiaRecentPurchaseArtifact(partialProduct), /watched product/i);
});

test('WV publication verifier rejects any live-inventory, quantity, alert, or premise-identity overclaim', () => {
  for (const mutation of [
    (signal) => { signal.sourceAvailabilityVerified = true; },
    (signal) => { signal.quantity = 3; },
    (signal) => { signal.quantityIsExact = true; },
    (signal) => { signal.canAlertAsInventory = true; },
    (signal) => { signal.canAlertAsWatch = true; },
    (signal) => { signal.premisesVerified = false; },
    (signal) => { signal.raw.noLiveInventory = false; },
  ]) {
    const artifact = validArtifact();
    mutation(artifact.signals[0]);
    assert.throws(() => verifyWestVirginiaRecentPurchaseArtifact(artifact), /purchase signal/i);
  }
});
