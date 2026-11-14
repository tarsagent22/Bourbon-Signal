const BANKS = Object.freeze({
  state: 'DE',
  sourceLabel: 'Banks Wines & Spirits Ecwid first-party pickup inventory',
  sourceUrl: 'https://bankswinesandspirits.com/products/old-forester-bws-single-barrel-bourbon-barrel-strength-750ml',
  sourceChain: 'banks-wines-and-spirits',
  sourceRuntimeId: 'research:de:banks-wines:130511528',
  merchantId: '130511528',
  productId: '813956453',
  sku: '081128002664',
  rawName: 'OLD FORESTER BWS SINGLE BARREL BOURBON BARREL STRENGTH 750ML',
  storeId: 'banks-wines:130511528',
  storeName: 'Banks Wines & Spirits',
  storeAddress: '38014 Town Center Drive, Millville, DE 19967',
  city: 'Millville',
  zip: '19967',
  price: 89,
  identityName: 'Old Forester Single Barrel Barrel Strength Bourbon',
  canonicalBottleId: 'old-forester-single-barrel-barrel-proof',
  canonicalName: 'Old Forester Single Barrel Barrel Proof',
  tier: 'allocated',
  observedAt: '2026-11-14T17:23:59.2121139Z',
  premisesObservedAt: '2026-11-14T16:36:54Z',
  premiseCaptureSha256: 'ff542751cffdb8780e453e67f2463218664d3c5361dfc8de20a036511ef59307',
  productCaptureSha256: '8fcca6ff535abf1cb55d6f3ff01384f34ce5e356a64defbd2c56b04cf9fd6925',
  libraryRecordsSha256: '2f98c28c23a9f20f10e68777e158aff1539075e60a448d32700fdd574a46c0cc',
});

const DELIVERY_OFF = Object.freeze({
  canAlertAsInventory: false,
  canAlertAsWatch: false,
  alertable: false,
  eligibleForOnSite: true,
  eligibleForDropFeed: true,
  eligibleForWatch: false,
  eligibleForDelivery: false,
  eligibleForEmail: false,
  eligibleForSms: false,
  previewOnly: true,
});

function exactEvidence(evidence) {
  const source = evidence?.source;
  const premise = source?.premise;
  const product = evidence?.product;
  const mapping = product?.reviewedLibraryMapping;
  const proof = source?.evidence;
  return evidence?.schemaVersion === 1 && evidence?.researchOnly === true
    && source?.retailer === 'Banks Wines & Spirits' && source?.platform === 'Ecwid storefront'
    && source?.storeId === BANKS.merchantId
    && premise?.address === BANKS.storeAddress && premise?.city === BANKS.city && premise?.state === BANKS.state
    && premise?.premiseSourceUrl === 'https://bankswinesandspirits.com/'
    && premise?.pickupPolicy === 'Convenient In-Store and Curbside Pickup available for all orders. Shipping is unavailable due to state regulations.'
    && premise?.premiseObservedAt === BANKS.premisesObservedAt
    && product?.productId === BANKS.productId && product?.sku === BANKS.sku && product?.title === BANKS.rawName
    && product?.sizeMl === 750 && product?.priceUsd === BANKS.price
    && product?.schemaAvailability === 'https://schema.org/InStock'
    && product?.visibleAvailability === 'In stock: 22 available'
    && product?.pickupWindow === 'today, 02:30 PM–09:30 PM' && product?.addToBagVisible === true
    && mapping?.matchText === BANKS.identityName && mapping?.canonicalId === BANKS.canonicalBottleId
    && mapping?.canonicalName === BANKS.canonicalName && mapping?.tier === BANKS.tier
    && mapping?.libraryMethod === 'exact-library-identity'
    && mapping?.libraryRecordsSha256 === BANKS.libraryRecordsSha256
    && source?.productUrl === BANKS.sourceUrl && source?.productObservedAt === BANKS.observedAt
    && proof?.premiseCaptureSha256 === BANKS.premiseCaptureSha256
    && proof?.productCaptureSha256 === BANKS.productCaptureSha256;
}

export function buildDelawareBanksStaticCanarySignal(evidence, bible, { nowMs = Date.now() } = {}) {
  if (!exactEvidence(evidence)) throw new Error('Banks DE static preview evidence did not match its reviewed store and product binding.');
  const observedMs = Date.parse(BANKS.observedAt);
  if (!Number.isFinite(observedMs) || nowMs < observedMs || nowMs - observedMs > 2 * 60 * 60_000) {
    throw new Error('Banks DE static product receipt is outside the two-hour preview window.');
  }
  if (Date.parse(BANKS.premisesObservedAt) > nowMs) throw new Error('Banks DE premise receipt is future-dated.');
  const match = bible?.match?.(BANKS.identityName);
  if (match?.record?.id !== BANKS.canonicalBottleId || match.record.canonical !== BANKS.canonicalName
    || match.record.tier !== BANKS.tier || match.method !== 'exact-library-identity') {
    throw new Error('Banks DE exact reviewed identity is absent from the current full-library Bible.');
  }
  const sourceProductBinding = {
    schemaVersion: 1,
    source: 'delaware-banks-ecwid-preview',
    merchantId: BANKS.merchantId,
    storeId: BANKS.storeId,
    storeAddress: BANKS.storeAddress,
    productId: BANKS.productId,
    sku: BANKS.sku,
    rawName: BANKS.rawName,
    identityName: BANKS.identityName,
    canonicalBottleId: BANKS.canonicalBottleId,
    canonicalName: BANKS.canonicalName,
    price: BANKS.price,
    observedAt: BANKS.observedAt,
    premisesVerified: true,
    pickupOfferVerified: true,
    reportedQuantity: 22,
    quantitySemantics: 'binary_retailer_orderable_no_exact_count',
    premiseCaptureSha256: BANKS.premiseCaptureSha256,
    productCaptureSha256: BANKS.productCaptureSha256,
    libraryRecordsSha256: BANKS.libraryRecordsSha256,
  };
  return {
    id: 'DE-banks-wines-130511528-813956453',
    state: BANKS.state,
    stateCode: BANKS.state,
    source: BANKS.sourceLabel,
    sourceLabel: BANKS.sourceLabel,
    sourceUrl: BANKS.sourceUrl,
    sourceChain: BANKS.sourceChain,
    sourceRuntimeId: BANKS.sourceRuntimeId,
    merchantId: BANKS.merchantId,
    productId: BANKS.productId,
    rawName: BANKS.rawName,
    canonicalBottleId: BANKS.canonicalBottleId,
    canonicalName: BANKS.canonicalName,
    tier: BANKS.tier,
    confidence: 1,
    type: 'retailer_store_inventory_result',
    eventType: 'retailer_store_inventory_result',
    locationPrecision: 'store_level',
    locationName: BANKS.storeName,
    storeName: BANKS.storeName,
    storeId: BANKS.storeId,
    storeAddress: BANKS.storeAddress,
    city: BANKS.city,
    zip: BANKS.zip,
    quantity: 0,
    storeQty: 0,
    quantityIsExact: false,
    quantitySemantics: 'binary_retailer_orderable_no_exact_count',
    price: BANKS.price,
    observedAt: BANKS.observedAt,
    fetchedAt: BANKS.observedAt,
    availabilityStatus: 'in_stock',
    availabilityLabel: 'Retailer reports in-store pickup available',
    sourceAvailabilityVerified: true,
    ...DELIVERY_OFF,
    inventorySemantics: 'First-party product page reports positive availability and pickup at Banks Wines & Spirits in Millville. Exact customer quantity is not published; verify before driving.',
    evidence: 'Banks Wines & Spirits lists its 750 ml Old Forester BWS single barrel barrel strength product for pickup at the Millville storefront.',
    sourceProductBinding,
    raw: { source: 'delaware-banks-ecwid-preview', merchantId: BANKS.merchantId, productId: BANKS.productId,
      sku: BANKS.sku, reportedQuantity: 22, shadowOnly: true },
  };
}

// This gate is preview-only by construction. It cannot authorize a production
// row or notification, and it recognizes exactly one retained Banks capture.
export function isDelawareBanksStaticCanarySignal(input, { nowMs = Date.now() } = {}) {
  const row = input && typeof input === 'object' ? input : {};
  const proof = row.sourceProductBinding;
  const observedMs = Date.parse(row.observedAt || '');
  return row.state === BANKS.state && row.stateCode === BANKS.state && row.previewOnly === true
    && (row.type === 'retailer_store_inventory_result' || row.eventType === 'retailer_store_inventory_result')
    && row.source === BANKS.sourceLabel && row.sourceLabel === BANKS.sourceLabel
    && row.sourceUrl === BANKS.sourceUrl && row.sourceChain === BANKS.sourceChain && row.sourceRuntimeId === BANKS.sourceRuntimeId
    && row.merchantId === BANKS.merchantId && row.productId === BANKS.productId && row.rawName === BANKS.rawName
    && row.canonicalBottleId === BANKS.canonicalBottleId && row.canonicalName === BANKS.canonicalName && row.tier === BANKS.tier
    && row.locationPrecision === 'store_level' && row.storeId === BANKS.storeId && row.storeName === BANKS.storeName
    && row.locationName === BANKS.storeName && row.storeAddress === BANKS.storeAddress && row.city === BANKS.city && row.zip === BANKS.zip
    // The customer export omits `quantity: 0` for binary-only inventory; the
    // retained source binding and storeQty zero still prove no exact count.
    && (row.quantity === 0 || row.quantity === undefined) && row.storeQty === 0 && row.quantityIsExact === false
    && row.quantitySemantics === 'binary_retailer_orderable_no_exact_count'
    && row.price === BANKS.price && Number.isFinite(observedMs) && observedMs === Date.parse(BANKS.observedAt)
    && nowMs >= observedMs && nowMs - observedMs <= 2 * 60 * 60_000
    && row.availabilityStatus === 'in_stock' && row.sourceAvailabilityVerified === true
    && row.canAlertAsInventory === false && row.can_alert_as_inventory !== true
    && row.canAlertAsWatch === false && row.can_alert_as_watch !== true && row.alertable !== true
    && row.eligibleForOnSite === true && row.eligibleForDropFeed === true && row.eligibleForWatch === false
    && row.eligibleForDelivery === false && row.eligibleForEmail === false && row.eligibleForSms === false
    && row.stale !== true && row.sourceStale !== true && row.source_stale !== true
    && proof?.schemaVersion === 1 && proof.source === 'delaware-banks-ecwid-preview'
    && proof.merchantId === BANKS.merchantId && proof.storeId === BANKS.storeId && proof.storeAddress === BANKS.storeAddress
    && proof.productId === BANKS.productId && proof.sku === BANKS.sku && proof.rawName === BANKS.rawName
    && proof.identityName === BANKS.identityName && proof.canonicalBottleId === BANKS.canonicalBottleId
    && proof.canonicalName === BANKS.canonicalName && proof.price === BANKS.price && proof.observedAt === BANKS.observedAt
    && proof.premisesVerified === true && proof.pickupOfferVerified === true && proof.reportedQuantity === 22
    && proof.quantitySemantics === 'binary_retailer_orderable_no_exact_count'
    && proof.premiseCaptureSha256 === BANKS.premiseCaptureSha256 && proof.productCaptureSha256 === BANKS.productCaptureSha256
    && proof.libraryRecordsSha256 === BANKS.libraryRecordsSha256;
}
