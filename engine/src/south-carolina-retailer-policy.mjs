const SOUTHERN_SPIRITS_SOURCE = 'Southern Spirits Shopify products feed';
const SOUTHERN_SPIRITS_STORE_ID = 'southern-spirits:southern-spirits-indian-land';
const SOUTHERN_SPIRITS_ADDRESS = '9989 charlotte hwy indian land sc 29707';
const SOUTHERN_SPIRITS_MAX_AGE_MS = 2 * 60 * 60_000;
const ALL_AMERICAN_SOURCE = 'All American Liquor Mauldin WooCommerce in-store availability';
const ALL_AMERICAN_STORE_ID = 'all-american-liquor:all-american-liquor-mauldin';
const ALL_AMERICAN_ADDRESS = '121 w butler rd mauldin sc 29662';
const ALL_AMERICAN_MAX_AGE_MS = 2 * 60 * 60_000;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;
const SC_CITYHIVE_MAX_AGE_MS = 6 * 60 * 60_000;
const LIQUOR_LIBRARY_SOURCE = 'Liquor Library North Myrtle Beach Square exact-store inventory';
const LIQUOR_LIBRARY_STORE_ID = 'liquor-library:45SNB155S1XMP';
const LIQUOR_LIBRARY_MAX_AGE_MS = 2 * 60 * 60_000;
const LIQUOR_LIBRARY_ADDRESS = '270 hwy 17 n north myrtle beach sc 29582';
const SC_CITYHIVE_MERCHANTS = new Map([
  ...['61dc4ab6a1d5721307e9c20e', '61e1d04c823936166693c7f3', '61dc62fca1d5721d92e837cf', '61dc583152bc522be69a8b9e', '61b7517362f55f727e469da5'].map((id) => [id, { chain: 'greens-beverage', label: "Green's Beverage South Carolina CityHive store inventory", hosts: ['greensbeb2c6efe1.sites.cityhive.app', 'greensbeverages.com', 'www.greensbeverages.com'] }]),
  ...['69930e7bed5bdd2a34c085c3', '699754a7b0035e3df3e7f3a4', '69977a118f10a026bd985189'].map((id) => [id, { chain: 'wine-bourbon-barn', label: 'Wine & Bourbon Barn CityHive store inventory', hosts: ['winebarnsc.com', 'www.winebarnsc.com'] }]),
  ...['607f9d38b73eb4091ef97ff7', '607af19a07c9e57bbd8de002', '6060f7262c63853de749dda2'].map((id) => [id, { chain: 'odarbys-liquor-barn', label: "O'Darby's Liquor Barn South Carolina CityHive store inventory", hosts: ['odarbysliquorbarn.com', 'www.odarbysliquorbarn.com'] }]),
  ['607f9bdbb73eb4091ef976e7', { chain: 'odarbys-liquor-barn', label: "O'Darby's Liquor Barn South Carolina CityHive store inventory", hosts: ['odarbysliquorbarn.com', 'www.odarbysliquorbarn.com'], premise: { name: "O'Darby's Heckle", address: '1740 Heckle Blvd, Rock Hill, SC 29732, USA', city: 'Rock Hill', zip: '29732' } }],
  ['607f1c35f568f15818499db8', { chain: 'odarbys-liquor-barn', label: "O'Darby's Liquor Barn South Carolina CityHive store inventory", hosts: ['odarbysliquorbarn.com', 'www.odarbysliquorbarn.com'], premise: { name: "O'Darby's Riverchase", address: '1421 Riverchase Blvd, Rock Hill, SC 29732, USA', city: 'Rock Hill', zip: '29732' } }],
  ['6144e1c2085a5f20a622a15f', { chain: 'beach-discount-beverages', label: 'Beach Discount Beverages South Carolina CityHive store inventory', hosts: ['beachdis0402bdcd.sites.cityhive.app', 'beachdiscountbeverages.com', 'www.beachdiscountbeverages.com'] }],
  ['6a0b27396d36df004b28a7ab', { chain: 'surf-beverage', label: 'Surf Beverage South Carolina CityHive store inventory', hosts: ['surfbeverages.com', 'www.surfbeverages.com', 'murrellsinletliquorstore.com', 'www.murrellsinletliquorstore.com'], premise: { name: 'Surf Beverage', address: '3140 US-17, Myrtle Beach, SC 29577, USA', city: 'Myrtle Beach', zip: '29577' } }],
  ['66c9e5c12556e329502b0e5e', { chain: 'palmetto-liquor', label: 'Palmetto Liquor South Carolina CityHive store inventory', hosts: ['palmettoliquor.com', 'www.palmettoliquor.com'] }],
  ['620164924a3ea84d57c21d6f', { chain: 'dev-liquors', label: 'DEV Liquors South Carolina CityHive store inventory', hosts: ['devliquors.com', 'www.devliquors.com'] }],
  ['67cf72208b17425acbba9e10', { chain: 'moss-creek-village-spirits', label: 'Moss Creek Village Spirits & Wine South Carolina CityHive store inventory', hosts: ['mosscreekvillagespiritsandwine.com', 'www.mosscreekvillagespiritsandwine.com'] }],
  ['5ea832d3b62f75270c45a976', { chain: 'rollers-wine-and-spirits', label: 'Rollers Wine & Spirits South Carolina CityHive store inventory', hosts: ['rollerswineandspirits.com', 'www.rollerswineandspirits.com'] }],
]);

function normalizedIdentity(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function exactLiquorLibraryProductUrl(signal) {
  try {
    const url = new URL(String(signal?.sourceUrl || ''));
    return url.protocol === 'https:'
      && url.hostname === 'www.yourliquorlibrary.com'
      && new RegExp(`^/product/[a-z0-9-]+/${String(signal?.siteProductId || '')}$`).test(url.pathname)
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

export function isSouthCarolinaLiquorLibraryInventory(signal, nowMs = Date.now()) {
  const square = signal?.raw?.square;
  const product = square?.product;
  const variation = square?.variation;
  const observedAt = Date.parse(String(signal?.observedAt || signal?.lastConfirmedAt || ''));
  const ageMs = nowMs - observedAt;
  const quantity = Number(signal?.quantity);
  const productId = typeof signal?.productId === 'string' ? signal.productId.trim() : '';
  const siteProductId = typeof signal?.siteProductId === 'string' ? signal.siteProductId.trim() : '';
  const variationId = typeof signal?.variationId === 'string' ? signal.variationId.trim() : '';
  const sku = typeof signal?.sku === 'string' ? signal.sku.trim() : '';
  return signal?.state === 'SC'
    && signal?.stateCode === 'SC'
    && signal?.eventType === 'retailer_store_inventory_result'
    && signal?.sourceLabel === LIQUOR_LIBRARY_SOURCE
    && signal?.sourceChain === 'liquor-library'
    && signal?.locationPrecision === 'store_level'
    && signal?.storeId === LIQUOR_LIBRARY_STORE_ID
    && signal?.storeName === 'Liquor Library'
    && signal?.locationName === 'Liquor Library'
    && normalizedIdentity(signal?.storeAddress) === LIQUOR_LIBRARY_ADDRESS
    && signal?.city === 'North Myrtle Beach'
    && String(signal?.postalCode || '') === '29582'
    && String(signal?.zip || '') === '29582'
    && signal?.ownerId === '137158697'
    && signal?.siteId === '561680787436279681'
    && signal?.merchantId === 'X9C89EYCA4KCD'
    && signal?.locationId === '45SNB155S1XMP'
    && signal?.categoryId === 'MGSXQOL6DSLH2PEGGDELCZO2'
    && /^[A-Z0-9]{10,40}$/.test(productId)
    && /^\d{1,12}$/.test(siteProductId)
    && /^[A-Z0-9]{10,40}$/.test(variationId)
    && Boolean(sku)
    && sku.length <= 64
    && signal?.sourceProductProofId === productId
    && Boolean(String(signal?.canonicalBottleId || '').trim())
    && Boolean(String(signal?.rawName || '').trim())
    && exactLiquorLibraryProductUrl(signal)
    && Number.isInteger(quantity)
    && quantity > 0
    && quantity <= 10_000
    && signal?.storeQty === quantity
    && signal?.quantityIsExact === true
    && signal?.quantitySemantics === 'exact_square_single_location_inventory'
    && Number.isFinite(Number(signal?.price))
    && Number(signal.price) > 0
    && signal?.availabilityStatus === 'in_stock'
    && signal?.sourceAvailabilityVerified === true
    && signal?.orderabilityOfferVerified === true
    && signal?.canAlertAsInventory === true
    && signal?.canAlertAsWatch === true
    && signal?.stale !== true
    && signal?.sourceStale !== true
    && signal?.raw?.chain === 'liquor-library'
    && square?.ownerId === signal.ownerId
    && square?.siteId === signal.siteId
    && square?.merchantId === signal.merchantId
    && square?.locationId === signal.locationId
    && square?.categoryId === signal.categoryId
    && product?.id === productId
    && product?.siteProductId === siteProductId
    && product?.quantity === quantity
    && product?.price === signal.price
    && product?.sourceUrl === signal.sourceUrl
    && variation?.id === variationId
    && variation?.sku === sku
    && variation?.productId === productId
    && variation?.siteProductId === siteProductId
    && variation?.quantity === quantity
    && variation?.price === signal.price
    && variation?.inventoryTrackingEnabled === true
    && variation?.pickupEnabled === true
    && Number.isFinite(observedAt)
    && ageMs >= -MAX_FUTURE_SKEW_MS
    && ageMs <= LIQUOR_LIBRARY_MAX_AGE_MS;
}

export function isSouthCarolinaLiquorLibrarySignal(signal) {
  let host = '';
  try { host = new URL(String(signal?.sourceUrl || '')).hostname.toLowerCase(); } catch {}
  return signal?.sourceLabel === LIQUOR_LIBRARY_SOURCE
    || signal?.sourceChain === 'liquor-library'
    || signal?.raw?.chain === 'liquor-library'
    || signal?.storeId === LIQUOR_LIBRARY_STORE_ID
    || host === 'www.yourliquorlibrary.com';
}

function exactProductUrl(signal, handle) {
  try {
    const url = new URL(String(signal?.sourceUrl || ''));
    return url.protocol === 'https:'
      && url.hostname === 'southernspirits.com'
      && url.pathname === `/products/${handle}`
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

function exactAllAmericanProductUrl(signal) {
  try {
    const url = new URL(String(signal?.sourceUrl || ''));
    return url.protocol === 'https:'
      && url.hostname === 'www.aalmauldin.com'
      && /^\/product\/[a-z0-9-]+\/$/.test(url.pathname)
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

export function isSouthCarolinaAllAmericanInventory(signal, nowMs = Date.now()) {
  const eventType = String(signal?.eventType || signal?.type || '');
  const sourceChain = String(signal?.sourceChain || '');
  const productId = String(signal?.productId || '').trim();
  const sku = String(signal?.sku || '').trim();
  const rawProduct = signal?.raw?.product;
  const observedAt = Date.parse(String(signal?.observedAt || signal?.lastConfirmedAt || signal?.firstSeenAt || ''));
  const ageMs = nowMs - observedAt;
  return signal?.state === 'SC'
    && signal?.stateCode === 'SC'
    && eventType === 'retailer_store_inventory_result'
    && signal?.sourceLabel === ALL_AMERICAN_SOURCE
    && sourceChain === 'all-american-liquor'
    && (signal?.raw == null || signal.raw.chain === 'all-american-liquor')
    && signal?.locationPrecision === 'store_level'
    && signal?.storeId === ALL_AMERICAN_STORE_ID
    && signal?.storeName === 'All American Liquor'
    && signal?.city === 'Mauldin'
    && String(signal?.postalCode || signal?.zip || '') === '29662'
    && normalizedIdentity(signal?.storeAddress) === ALL_AMERICAN_ADDRESS
    && Boolean(signal?.canonicalBottleId || signal?.canonicalId)
    && Boolean(String(signal?.rawName || signal?.bottleName || signal?.canonicalName || '').trim())
    && productId.length > 0
    && sku.length > 0
    && signal?.sourceProductProofId === productId
    && signal?.sourceProductProofSku === sku
    && signal?.sourceProductInStock === true
    && signal?.sourceProductBackordered === false
    && (rawProduct == null || (String(rawProduct.id ?? '') === productId
      && String(rawProduct.sku ?? '') === sku
      && rawProduct.is_in_stock === true
      && rawProduct.is_on_backorder === false))
    && exactAllAmericanProductUrl(signal)
    && signal?.quantity === 0
    && signal?.storeQty === 0
    && signal?.quantityIsExact === false
    && signal?.quantitySemantics === 'binary_retailer_in_stock'
    && signal?.sourceAvailabilityVerified === true
    && signal?.availabilityStatus === 'in_stock'
    && signal?.orderabilityOfferVerified === false
    && signal?.stale !== true
    && signal?.sourceStale !== true
    && Number.isFinite(observedAt)
    && ageMs >= -MAX_FUTURE_SKEW_MS
    && ageMs <= ALL_AMERICAN_MAX_AGE_MS;
}

export function isSouthCarolinaAllAmericanSignal(signal) {
  let sourceHost = '';
  try { sourceHost = new URL(String(signal?.sourceUrl || '')).hostname.toLowerCase(); } catch {}
  const sourceLabel = String(signal?.sourceLabel || signal?.source || '');
  const sourceChain = String(signal?.sourceChain || '');
  const rawChain = String(signal?.raw?.chain || '');
  const storeId = String(signal?.storeId || signal?.sourceStoreId || signal?.id || '');
  return sourceLabel === ALL_AMERICAN_SOURCE
    || sourceLabel.toLowerCase().startsWith('all american liquor')
    || sourceChain.startsWith('all-american-liquor')
    || rawChain.startsWith('all-american-liquor')
    || sourceHost === 'aalmauldin.com'
    || sourceHost === 'www.aalmauldin.com'
    || storeId === ALL_AMERICAN_STORE_ID
    || storeId.startsWith('all-american-liquor:');
}

export function hasSouthCarolinaAllAmericanRawSourceProof(signal) {
  const productId = String(signal?.productId || '').trim();
  const sku = String(signal?.sku || '').trim();
  return signal?.raw?.chain === 'all-american-liquor'
    && String(signal?.raw?.product?.id ?? '') === productId
    && String(signal?.raw?.product?.sku ?? '') === sku
    && signal?.raw?.product?.is_in_stock === true
    && signal?.raw?.product?.is_on_backorder === false;
}

export function isSouthCarolinaAllAmericanLocation(signal) {
  const observedAt = Date.parse(String(signal?.observedAt || ''));
  const ageMs = Date.now() - observedAt;
  return signal?.state === 'SC'
    && signal?.stateCode === 'SC'
    && signal?.eventType === 'retailer_store_location'
    && signal?.sourceLabel === ALL_AMERICAN_SOURCE
    && signal?.sourceUrl === 'https://www.aalmauldin.com'
    && signal?.locationPrecision === 'store_level'
    && signal?.storeId === ALL_AMERICAN_STORE_ID
    && signal?.storeName === 'All American Liquor'
    && normalizedIdentity(signal?.storeAddress) === ALL_AMERICAN_ADDRESS
    && signal?.city === 'Mauldin'
    && String(signal?.postalCode || signal?.zip || '') === '29662'
    && signal?.canAlertAsInventory === false
    && signal?.canAlertAsWatch === false
    && signal?.raw?.chain === 'all-american-liquor'
    && signal?.raw?.store?.id === 'all-american-liquor-mauldin'
    && signal?.raw?.store?.name === 'All American Liquor'
    && normalizedIdentity(signal?.raw?.store?.address) === ALL_AMERICAN_ADDRESS
    && signal?.raw?.store?.city === 'Mauldin'
    && String(signal?.raw?.store?.zip || '') === '29662'
    && Number.isFinite(observedAt)
    && ageMs >= -MAX_FUTURE_SKEW_MS
    && ageMs <= ALL_AMERICAN_MAX_AGE_MS;
}

export function isSouthCarolinaAllAmericanStoreExport(store) {
  return store?.id === ALL_AMERICAN_STORE_ID
    && store?.sourceStoreId === ALL_AMERICAN_STORE_ID
    && store?.state === 'SC'
    && store?.name === 'All American Liquor'
    && normalizedIdentity(store?.address) === ALL_AMERICAN_ADDRESS
    && store?.city === 'Mauldin'
    && String(store?.zip || '') === '29662'
    && store?.source === ALL_AMERICAN_SOURCE
    && Number(store?.signalCount || 0) > 0
    && store?.hasSignals === true
    && store?.collectorAttached === true
    && store?.sourceAvailabilityVerified === true;
}

export function isSouthCarolinaSouthernSpiritsInventory(signal, nowMs = Date.now()) {
  const eventType = String(signal?.eventType || signal?.type || '');
  const sourceChain = String(signal?.sourceChain || signal?.raw?.chain || '');
  const productId = String(signal?.productId || signal?.raw?.product?.id || '').trim();
  const productHandle = String(signal?.productHandle || signal?.raw?.product?.handle || '').trim();
  const variantId = String(signal?.variantId || signal?.raw?.variant?.id || '').trim();
  const variantAvailable = signal?.variantAvailable ?? signal?.raw?.variant?.available;
  const quantity = Number(signal?.quantity || 0);
  const storeQty = Number(signal?.storeQty || 0);
  const observedAt = Date.parse(String(signal?.observedAt || signal?.lastConfirmedAt || signal?.firstSeenAt || ''));
  const ageMs = nowMs - observedAt;
  return signal?.state === 'SC'
    && (signal?.stateCode == null || signal.stateCode === 'SC')
    && eventType === 'retailer_store_inventory_result'
    && signal?.sourceLabel === SOUTHERN_SPIRITS_SOURCE
    && sourceChain === 'southern-spirits'
    && signal?.locationPrecision === 'store_level'
    && signal?.storeId === SOUTHERN_SPIRITS_STORE_ID
    && signal?.storeName === 'Southern Spirits'
    && signal?.city === 'Indian Land'
    && String(signal?.postalCode || signal?.zip || '') === '29707'
    && normalizedIdentity(signal?.storeAddress) === SOUTHERN_SPIRITS_ADDRESS
    && Boolean(signal?.canonicalBottleId || signal?.canonicalId)
    && Boolean(String(signal?.rawName || signal?.bottleName || signal?.canonicalName || '').trim())
    && productId.length > 0
    && productHandle.length > 0
    && variantId.length > 0
    && (signal?.raw?.product?.id == null || String(signal.raw.product.id) === productId)
    && (signal?.raw?.product?.handle == null || String(signal.raw.product.handle) === productHandle)
    && (signal?.raw?.variant?.id == null || String(signal.raw.variant.id) === variantId)
    && variantAvailable === true
    && exactProductUrl(signal, productHandle)
    && quantity === 0
    && storeQty === 0
    && signal?.quantityIsExact === false
    && signal?.quantitySemantics === 'binary_retailer_in_stock'
    && signal?.sourceAvailabilityVerified === true
    && signal?.availabilityStatus === 'in_stock'
    && signal?.stale !== true
    && signal?.sourceStale !== true
    && Number.isFinite(observedAt)
    && ageMs >= -MAX_FUTURE_SKEW_MS
    && ageMs <= SOUTHERN_SPIRITS_MAX_AGE_MS;
}

export function isSouthCarolinaSouthernSpiritsSignal(signal) {
  let sourceHost = '';
  try { sourceHost = new URL(String(signal?.sourceUrl || '')).hostname.toLowerCase(); } catch {}
  const sourceLabel = String(signal?.sourceLabel || signal?.source || '');
  const sourceChain = String(signal?.sourceChain || '');
  const rawChain = String(signal?.raw?.chain || '');
  const storeId = String(signal?.storeId || '');
  return sourceLabel === SOUTHERN_SPIRITS_SOURCE
    || sourceLabel.toLowerCase().startsWith('southern spirits')
    || sourceChain.startsWith('southern-spirits')
    || rawChain.startsWith('southern-spirits')
    || sourceHost === 'southernspirits.com'
    || sourceHost === 'www.southernspirits.com'
    || storeId === SOUTHERN_SPIRITS_STORE_ID
    || storeId.startsWith('southern-spirits:');
}

function exactIdentityString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedPremiseValue(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim();
}

function normalizedPremiseAddress(value) {
  return normalizedPremiseValue(value).replace(/\s+usa$/u, '');
}

function matchesReviewedCityHivePremise(signal, source) {
  if (!source?.premise) return true;
  for (const field of ['storeName', 'locationName', 'city', 'postalCode', 'zip']) {
    if (Object.prototype.hasOwnProperty.call(signal || {}, field) && signal[field] != null && typeof signal[field] !== 'string') return false;
  }
  const storeName = signal?.storeName ?? signal?.locationName;
  const postalCode = signal?.postalCode ?? signal?.zip;
  if (typeof storeName !== 'string' || typeof signal?.city !== 'string' || typeof postalCode !== 'string') return false;
  for (const field of ['storeName', 'locationName']) {
    if (typeof signal?.[field] === 'string' && normalizedPremiseValue(signal[field]) !== normalizedPremiseValue(source.premise.name)) return false;
  }
  for (const field of ['postalCode', 'zip']) {
    if (typeof signal?.[field] === 'string' && signal[field].trim() !== source.premise.zip) return false;
  }
  return normalizedPremiseValue(storeName) === normalizedPremiseValue(source.premise.name)
    && normalizedPremiseAddress(signal?.storeAddress) === normalizedPremiseAddress(source.premise.address)
    && normalizedPremiseValue(signal.city) === normalizedPremiseValue(source.premise.city)
    && postalCode.trim() === source.premise.zip;
}

export function isSouthCarolinaCityHiveInventory(signal, nowMs = Date.now()) {
  const rawEventType = signal?.eventType ?? signal?.type;
  const eventType = exactIdentityString(rawEventType);
  const canonicalBottleId = exactIdentityString(signal?.canonicalBottleId ?? signal?.canonicalId);
  const merchantId = exactIdentityString(signal?.merchantId);
  const source = SC_CITYHIVE_MERCHANTS.get(merchantId);
  const productId = exactIdentityString(signal?.productId);
  const optionId = exactIdentityString(signal?.optionId ?? signal?.variantId);
  const aliasesMatch = (fields, expected) => fields.every((field) => !Object.prototype.hasOwnProperty.call(signal || {}, field)
    || signal[field] == null
    || (typeof signal[field] === 'string' && exactIdentityString(signal[field]) === expected));
  const identityAliasesValid = aliasesMatch(['eventType', 'type'], eventType)
    && aliasesMatch(['canonicalBottleId', 'canonicalId'], canonicalBottleId)
    && aliasesMatch(['optionId', 'variantId'], optionId)
    && aliasesMatch(['productId', 'sourceProductProofId'], productId);
  const observedAt = Date.parse(String(signal?.observedAt || signal?.lastConfirmedAt || ''));
  const ageMs = nowMs - observedAt;
  let sourceHost = '';
  try {
    const url = new URL(String(signal?.sourceUrl || ''));
    if (url.protocol !== 'https:') return false;
    sourceHost = url.hostname.toLowerCase();
  } catch {
    return false;
  }
  const rawContainer = signal?.raw;
  const rawOptionPresent = rawContainer && typeof rawContainer === 'object' && !Array.isArray(rawContainer)
    && Object.prototype.hasOwnProperty.call(rawContainer, 'option');
  const rawOption = rawContainer?.option;
  const exactSourceBinding = rawOptionPresent
    ? Boolean(rawOption && typeof rawOption === 'object' && !Array.isArray(rawOption)
      && exactIdentityString(rawOption.merchant_id) === merchantId
      && exactIdentityString(rawOption.product_id) === productId
      && exactIdentityString(rawOption.option_id) === optionId)
    : exactIdentityString(signal?.sourceProductProofId) === productId
      && exactIdentityString(signal?.variantId) === optionId;
  const exactQuantity = signal?.quantityIsExact === true
    && typeof signal?.quantity === 'number'
    && Number.isInteger(signal.quantity)
    && signal.quantity > 0
    && signal.quantity < 100
    && signal?.availabilityStatus === 'in_stock';
  const binaryAvailability = signal?.quantityIsExact === false
    && signal?.quantity === 0
    && signal?.availabilityStatus === 'binary_retailer_in_stock';
  const rawQuantity = rawOption?.quantity;
  const rawQuantityValid = typeof rawQuantity === 'number'
    && Number.isInteger(rawQuantity)
    && rawQuantity > 0
    && rawQuantity <= 999;
  const rawBinaryAvailability = rawQuantityValid && rawQuantity >= 100;
  const rawPremiseValid = !rawOptionPresent || Boolean(
    typeof rawOption?.full_address === 'string'
    && normalizedPremiseAddress(rawOption.full_address) === normalizedPremiseAddress(signal?.storeAddress)
    && (!source?.premise || (typeof rawOption?.merchant_name === 'string'
      && normalizedPremiseValue(rawOption.merchant_name) === normalizedPremiseValue(source.premise.name)))
    && (!source?.premise || normalizedPremiseAddress(rawOption.full_address) === normalizedPremiseAddress(source.premise.address)));
  const rawQuantityBinding = !rawOptionPresent || Boolean(rawQuantityValid
    && rawContainer.reportedQuantity === rawQuantity
    && rawContainer.binaryAvailability === rawBinaryAvailability
    && (rawBinaryAvailability
      ? binaryAvailability
      : exactQuantity && signal.quantity === rawQuantity));
  return Boolean(source)
    && identityAliasesValid
    && signal?.state === 'SC'
    && (signal?.stateCode == null || signal.stateCode === 'SC')
    && eventType === 'cityhive_store_inventory_result'
    && signal?.sourceLabel === source.label
    && signal?.sourceChain === source.chain
    && (signal?.raw == null || signal.raw.chain === source.chain)
    && source.hosts.includes(sourceHost)
    && signal?.locationPrecision === 'store_level'
    && signal?.storeId === `${source.chain}:${merchantId}`
    && typeof signal?.storeAddress === 'string'
    && matchesReviewedCityHivePremise(signal, source)
    && /,\s*SC\s+\d{5}/i.test(signal.storeAddress)
    && typeof canonicalBottleId === 'string' && Boolean(canonicalBottleId.trim())
    && productId.length > 0
    && optionId.length > 0
    && exactSourceBinding
    && rawPremiseValid
    && rawQuantityBinding
    && signal?.sourceAvailabilityVerified === true
    && (exactQuantity || binaryAvailability)
    && signal?.stale !== true
    && signal?.sourceStale !== true
    && Number.isFinite(observedAt)
    && ageMs >= -MAX_FUTURE_SKEW_MS
    && ageMs <= SC_CITYHIVE_MAX_AGE_MS;
}

export function hasSouthCarolinaPositiveInventoryEvidence(signal) {
  if (isSouthCarolinaAllAmericanSignal(signal)) return isSouthCarolinaAllAmericanInventory(signal);
  if (isSouthCarolinaSouthernSpiritsSignal(signal)) return isSouthCarolinaSouthernSpiritsInventory(signal);
  if (signal?.eventType === 'cityhive_store_inventory_result' || /CityHive/i.test(String(signal?.sourceLabel || signal?.source || ''))) {
    return isSouthCarolinaCityHiveInventory(signal);
  }
  return Number(signal?.quantity || 0) > 0;
}
