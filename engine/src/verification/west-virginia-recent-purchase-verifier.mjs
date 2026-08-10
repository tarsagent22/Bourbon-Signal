const SOURCE_RUNTIME_ID = 'wv:configured:wv-abca-recent-purchases';
const EVENT_TYPE = 'wv_abca_retailer_recent_purchase_window';
const MINIMUM_PURCHASE_SIGNALS = 20;
const MINIMUM_PURCHASE_STORES = 20;
const MINIMUM_CANARY_STORES = 20;
const MAXIMUM_REQUESTS = 9;
const EXPECTED_PRODUCTS = new Set([827, 10150, 734]);
const DIRECTORY_STORE_COUNT = 180;
const BARREL_SELECTION_COUNT = 6;

function invariant(condition, message) {
  if (!condition) throw new Error(`West Virginia recent-purchase artifact: ${message}`);
}

function recentPurchaseSignal(signal) {
  return signal?.state === 'WV'
    && signal?.sourceRuntimeId === SOURCE_RUNTIME_ID
    && signal?.eventType === EVENT_TYPE;
}

function validPurchaseSignal(signal) {
  return recentPurchaseSignal(signal)
    && Boolean(signal.id)
    && Boolean(signal.canonicalBottleId)
    && signal.locationPrecision === 'store_level'
    && signal.locationProjectionDisabled === true
    && /^wvabca-store-\d+$/u.test(String(signal.storeId || ''))
    && /^\d+$/u.test(String(signal.storeNumber || ''))
    && Boolean(signal.storeName)
    && /,\s*WV$/iu.test(String(signal.storeAddress || ''))
    && signal.premisesVerified === true
    && signal.availabilityStatus === 'recent_purchase_window'
    && signal.sourceAvailabilityVerified === false
    && Number(signal.quantity || 0) === 0
    && signal.quantityIsExact === false
    && signal.canAlertAsInventory === false
    && signal.canAlertAsWatch === false
    && signal.raw?.officialStoreNumber === Number(signal.storeNumber)
    && Number.isInteger(Number(signal.raw?.officialProductId))
    && Number(signal.raw?.officialBottleSizeMl) === 750
    && signal.raw?.purchaseWindowDays === 90
    && signal.raw?.noPurchaseDate === true
    && signal.raw?.noReportedQuantity === true
    && signal.raw?.noLiveInventory === true
    && signal.raw?.sourceRuntimeNonAlertable === true
    && signal.raw?.premisesVerified === true;
}

export function verifyWestVirginiaRecentPurchaseArtifact(state) {
  invariant(state?.state === 'WV', 'state report must be WV.');
  invariant(state?.stale !== true && !String(state?.status || '').startsWith('stale_'), 'state report is stale.');
  invariant(!String(state?.status || '').startsWith('failed_'), 'state report failed.');

  const source = (state.sources || []).find((row) => row?.sourceRuntimeId === SOURCE_RUNTIME_ID);
  invariant(source, 'required source report is missing.');
  invariant(source.ok === true && Number(source.status) === 200 && !source.error, 'source report is not a successful HTTP 200 result.');
  invariant(source.signalType === EVENT_TYPE, 'source report signal type drifted.');
  invariant(Number(source.requestCount) <= MAXIMUM_REQUESTS, 'source request budget exceeded.');
  invariant(Number(source.maximumRequests) === MAXIMUM_REQUESTS, 'source maximum request contract drifted.');
  invariant(Number(source.canaryStoreCount) >= MINIMUM_CANARY_STORES, 'source canary store count collapsed.');
  invariant(source.purchaseWindowDays === 90, 'source purchase window drifted.');
  invariant(source.sourceAvailabilityVerified === false, 'source report overclaims live inventory.');
  invariant(source.canAlertAsInventory === false && source.canAlertAsWatch === false, 'source report overclaims alert eligibility.');

  const signals = (state.signals || []).filter(recentPurchaseSignal);
  invariant(signals.length >= MINIMUM_PURCHASE_SIGNALS, `only ${signals.length} recent-purchase signals were produced.`);
  invariant(signals.every(validPurchaseSignal), 'one or more purchase signals violate exact-premise or non-inventory semantics.');
  invariant(new Set(signals.map((signal) => signal.id)).size === signals.length, 'purchase signal IDs are not unique.');

  const productResults = Array.isArray(source.productResults) ? source.productResults : [];
  invariant(productResults.length === EXPECTED_PRODUCTS.size, 'watched product result count drifted.');
  for (const productId of EXPECTED_PRODUCTS) {
    const result = productResults.find((row) => Number(row?.productId) === productId && Number(row?.bottleSize) === 750);
    invariant(result && Number(result.storeCount) > 0 && Number(result.signalCount) === Number(result.storeCount), `watched product ${productId} is empty or partially rejected.`);
    const artifactCount = signals.filter((signal) => Number(signal?.raw?.officialProductId) === productId).length;
    invariant(artifactCount === Number(result.signalCount), `watched product ${productId} signal count does not match the artifact.`);
  }
  invariant(productResults.reduce((sum, row) => sum + Number(row?.signalCount || 0), 0) === signals.length, 'watched product totals do not match the artifact.');

  const stores = new Set(signals.map((signal) => signal.storeId));
  const bottles = new Set(signals.map((signal) => signal.canonicalBottleId));
  invariant(stores.size >= MINIMUM_PURCHASE_STORES, `only ${stores.size} recent-purchase stores were produced.`);
  invariant(bottles.size === EXPECTED_PRODUCTS.size, 'artifact does not contain every watched bottle identity.');
  invariant(Number(source.recentPurchaseSignalCount) === signals.length, 'source signal count does not match the artifact.');
  invariant(Number(source.locationCount) === stores.size, 'source location count does not match the artifact.');
  invariant(Number(source.matchedBottleCount) === bottles.size, 'source bottle count does not match the artifact.');

  const directoryStoreCount = (state.signals || []).filter((signal) => signal?.state === 'WV'
    && signal?.sourceRuntimeId === 'official-directory:wv-abca-active-retail-liquor-stores'
    && signal?.eventType === 'retailer_store_location').length;
  const barrelSelectionCount = (state.signals || []).filter((signal) => signal?.state === 'WV'
    && signal?.sourceRuntimeId === 'wv:configured:wv-abca-barrel-selections'
    && signal?.eventType === 'barrel_pick_signal').length;
  invariant(directoryStoreCount === DIRECTORY_STORE_COUNT, `expected ${DIRECTORY_STORE_COUNT} directory premises, found ${directoryStoreCount}.`);
  invariant(barrelSelectionCount >= BARREL_SELECTION_COUNT, `expected at least ${BARREL_SELECTION_COUNT} barrel-selection signals, found ${barrelSelectionCount}.`);
  invariant(!(state.roadblocks || []).some((row) => row?.sourceRuntimeId === SOURCE_RUNTIME_ID), 'source roadblock is present.');

  return {
    state: 'WV',
    recentPurchaseSignalCount: signals.length,
    recentPurchaseStoreCount: stores.size,
    matchedBottleCount: bottles.size,
    directoryStoreCount,
    barrelSelectionCount,
    requestCount: Number(source.requestCount),
    canaryStoreCount: Number(source.canaryStoreCount),
  };
}
