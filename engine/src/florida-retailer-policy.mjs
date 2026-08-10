import { FLORIDA_LUEKENS_STORES, FLORIDA_TAMPA_TARGET_STORE_IDS } from './collectors/florida-tampa-surfaces.mjs';
import { FLORIDA_CITYHIVE_SOURCES } from './collectors/florida-retailer-surfaces.mjs';
import { pensacolaProductUrl, pensacolaVariantPickupUrl, PENSACOLA_SHOPIFY_SOURCE, PENSACOLA_SHOPIFY_STORES } from './collectors/florida-pensacola-surfaces.mjs';
import { FLORIDA_EXPANSION_STORE_TARGETS } from './collectors/florida-15-20-expansion.mjs';

const TARGET_FLORIDA_STORE_IDS = new Set(['649', '650', '1518', '1760', '2376', ...FLORIDA_TAMPA_TARGET_STORE_IDS]);

const FLORIDA_CITYHIVE_IDENTITIES = new Map(FLORIDA_CITYHIVE_SOURCES.map((source) => [
  source.sourceLabel,
  {
    chain: source.id,
    hostname: new URL(source.baseUrl).hostname.replace(/^www\./i, '').toLowerCase(),
    origin: new URL(source.baseUrl).origin,
    stores: source.merchants,
    strictInventoryContract: source.strictInventoryContract === true,
  },
]));

const FLORIDA_WATCH_IDENTITIES = new Map([
  ['Liquor Depot Tampa online quantity watch', {
    chain: 'liquor-depot-tampa',
    hostname: 'liquordepottampa.com',
    merchant: 'squarespace:63cf346e2314cb29f072d816',
    locationPrecision: 'store_aggregate',
  }],
]);

const FLORIDA_RETAILER_IDENTITIES = new Map([
  ['MDP Liquor Kissimmee Shopify store inventory', {
    chain: 'mdp-liquor-kissimmee',
    hostname: 'mdpliquorfl.com',
    merchants: new Set(['mdp-liquor-kissimmee-shopify']),
    stores: new Set(['mdp-liquor-kissimmee:4636-w-irlo-bronson']),
  }],
  ["Jensen's Liquors Miami Shopify pickup inventory", {
    chain: 'jensens-liquors',
    hostname: 'jensensliquors.com',
    merchants: new Set(['jensens-miami-shopify']),
    stores: new Set(['jensens-liquors:1646-sw-27th']),
  }],
  ['Luekens Wine & Spirits Shopify store pickup inventory', {
    chain: 'luekens',
    hostname: 'luekensliquors.com',
    merchants: new Set(['luekens-shopify']),
    stores: new Set(FLORIDA_LUEKENS_STORES.map((store) => store.id)),
  }],
  [PENSACOLA_SHOPIFY_SOURCE.sourceLabel, {
    chain: PENSACOLA_SHOPIFY_SOURCE.id,
    hostname: PENSACOLA_SHOPIFY_SOURCE.hostname.replace(/^www\./i, ''),
    merchants: new Set(PENSACOLA_SHOPIFY_STORES.keys()),
    stores: new Set(PENSACOLA_SHOPIFY_STORES.keys()),
    storeAddresses: new Map([...PENSACOLA_SHOPIFY_STORES].map(([id, store]) => [id, store.address])),
    requiresBinaryNoExactCount: true,
    requiresProductPage: true,
    requiresProductIdentity: true,
    requiresPickupProof: true,
  }],
  ["Gaspar's Liquor Shoppe Lightspeed store inventory", {
    chain: 'gaspars-liquor-shoppe',
    hostname: 'gasparsliquorshoppe.com',
    merchants: new Set(['lightspeed:640576']),
    stores: new Set(['gaspars-liquor-shoppe:tampa-56th']),
  }],
]);

for (const target of FLORIDA_EXPANSION_STORE_TARGETS.filter((store) => store.platform !== 'cityhive')) {
  const hostname = new URL(target.baseUrl).hostname.toLowerCase();
  const identity = FLORIDA_RETAILER_IDENTITIES.get(target.sourceLabel) || {
    chain: target.sourceChain,
    hostname: hostname.replace(/^www\./i, ''),
    strictHostname: hostname,
    merchants: new Set(),
    stores: new Set(),
    storeAddresses: new Map(),
    expansionStores: new Map(),
  };
  identity.merchants.add(target.merchantId);
  identity.stores.add(target.storeId);
  identity.storeAddresses.set(target.storeId, target.address);
  identity.expansionStores.set(target.storeId, target);
  FLORIDA_RETAILER_IDENTITIES.set(target.sourceLabel, identity);
}

function floridaExpansionIdentityIsValid(identity, signal, sourceStrictHostname) {
  const target = identity?.expansionStores?.get(String(signal.storeId || ''));
  if (!target || sourceStrictHostname !== identity.strictHostname) return false;
  let sourceUrl = null;
  try { sourceUrl = new URL(String(signal.sourceUrl || '')); } catch { return false; }
  const merchantId = String(signal.merchantId || signal.raw?.merchantId || '');
  const chain = String(signal.sourceChain || signal.raw?.chain || '');
  const postalCode = String(signal.postalCode || signal.zip || '');
  if (sourceUrl.protocol !== 'https:'
    || merchantId !== target.merchantId
    || chain !== target.sourceChain
    || String(signal.storeName || signal.locationName || '') !== target.name
    || String(signal.storeAddress || '') !== target.address
    || String(signal.city || '') !== target.city
    || postalCode !== target.zip) return false;

  const quantity = Number(signal.quantity ?? 0);
  const reportedValue = signal.reportedQuantity ?? signal.raw?.reportedQuantity;
  const reportedQuantity = reportedValue == null ? null : Number(reportedValue);
  const sourceInventorySemantics = String(signal.sourceInventorySemantics || signal.inventorySemantics || '');
  if (target.platform === 'primo' || target.platform === 'abc-searchspring') {
    const exactQuantityValid = Number.isInteger(quantity)
      && quantity > 0
      && (target.platform !== 'abc-searchspring' || quantity < 100)
      && signal.quantityIsExact === true
      && Number.isInteger(reportedQuantity)
      && reportedQuantity === quantity
      && sourceInventorySemantics === 'exact_retailer_reported_quantity';
    if (!exactQuantityValid) return false;
    if (target.platform === 'primo') return /^\/products\/[a-z0-9][a-z0-9-]*$/i.test(sourceUrl.pathname);
    const productPath = sourceUrl.pathname.match(/^\/[a-z0-9][a-z0-9-]*\/(\d+)\/?$/i);
    const productId = String(signal.productId || '');
    const variantId = String(signal.variantId || '');
    const optionValueId = String(signal.optionValueId || '');
    const childSku = String(signal.childSku || '');
    const storeNumber = String(signal.storeNumber || '');
    const controlStoreId = String(signal.controlStoreId || '');
    const rawProductId = signal.raw?.productId == null ? productId : String(signal.raw.productId);
    const rawVariantId = signal.raw?.variantId == null ? variantId : String(signal.raw.variantId);
    const rawOptionValueId = signal.raw?.optionValueId == null ? optionValueId : String(signal.raw.optionValueId);
    const rawChildSku = signal.raw?.childSku == null ? childSku : String(signal.raw.childSku);
    const rawStoreNumber = signal.raw?.storeNumber == null ? storeNumber : String(signal.raw.storeNumber);
    const rawControlStoreId = signal.raw?.controlStoreId == null ? controlStoreId : String(signal.raw.controlStoreId);
    const latitude = Number(signal.lat);
    const longitude = Number(signal.lng);
    const rawOfficialIdentityPresent = signal.raw && ['officialAddress', 'officialCity', 'officialZip', 'officialLatitude', 'officialLongitude']
      .some((field) => Object.hasOwn(signal.raw, field));
    const rawOfficialIdentityValid = !rawOfficialIdentityPresent || (
      String(signal.raw.officialAddress || '') === target.officialAddress
      && String(signal.raw.officialCity || '') === target.city
      && String(signal.raw.officialZip || '') === target.zip
      && String(signal.raw.officialLatitude || '') === target.officialLatitude
      && String(signal.raw.officialLongitude || '') === target.officialLongitude
    );
    return Boolean(productPath)
      && /^\d+$/.test(productId) && Number(productId) > 0
      && productPath[1] === productId
      && rawProductId === productId
      && /^\d+$/.test(variantId) && Number(variantId) > 0
      && /^\d+$/.test(optionValueId) && Number(optionValueId) > 0
      && rawVariantId === variantId
      && rawOptionValueId === optionValueId
      && controlStoreId === target.storeNumber
      && rawControlStoreId === controlStoreId
      && storeNumber === target.storeNumber
      && rawStoreNumber === storeNumber
      && childSku === `${productId}-${target.storeNumber}`
      && rawChildSku === childSku
      && Number.isFinite(latitude) && latitude === target.lat
      && Number.isFinite(longitude) && longitude === target.lng
      && rawOfficialIdentityValid
      && (signal.variantAvailable === true || signal.raw?.variantAvailable === true);
  }
  if (quantity !== 0
    || signal.quantityIsExact !== false
    || (reportedQuantity !== null && reportedQuantity !== 0)) return false;
  if (target.platform === 'shopify') {
    return /^\/products\/[a-z0-9][a-z0-9-]*$/i.test(sourceUrl.pathname)
      && Boolean(signal.productId)
      && Boolean(signal.variantId)
      && (signal.variantAvailable === true || signal.raw?.variantAvailable === true)
      && sourceInventorySemantics === 'binary_exact_premises_shipment_orderable_no_shelf_count';
  }
  if (target.platform === 'gotoliquorstore') {
    return /^\/p\/[^/]+\/\d+\/?$/i.test(sourceUrl.pathname)
      && signal.pickupOfferVerified === true
      && signal.premisesVerified === true
      && String(signal.controlStoreId || signal.raw?.controlStoreId || '') === target.controlStoreId
      && sourceInventorySemantics === 'binary_exact_premises_pickup_orderable_no_shelf_count';
  }
  if (target.platform === 'tivoli') {
    return sourceUrl.href === target.productUrl
      && String(signal.productId || '') !== ''
      && signal.premisesVerified === true
      && (signal.orderFormVerified === true || signal.raw?.orderFormVerified === true)
      && sourceInventorySemantics === 'binary_exact_premises_shipment_orderable_no_shelf_count';
  }
  return false;
}

function strictCityHiveInventoryIsValid(signal, identity, store, sourceHostname) {
  if (!identity.strictInventoryContract) return true;
  let sourceUrl = null;
  try { sourceUrl = new URL(String(signal.sourceUrl || '')); } catch { return false; }
  const merchantId = String(signal.merchantId || signal.raw?.merchantId || '');
  const productId = String(signal.productId || '');
  const variantId = String(signal.variantId || '');
  const reportedQuantity = Number(signal.reportedQuantity ?? signal.raw?.reportedQuantity ?? 0);
  const quantity = Number(signal.quantity || 0);
  const option = signal.raw?.option;
  const semantics = String(signal.inventorySemantics || '');
  const pathSegments = sourceUrl.pathname.split('/').filter(Boolean);
  const sourceProductId = pathSegments.at(-1) || '';
  const sourceQueryEntries = [...sourceUrl.searchParams.entries()];
  const binaryAvailability = reportedQuantity >= 100;
  const quantityContractValid = Number.isInteger(reportedQuantity)
    && reportedQuantity > 0
    && (binaryAvailability
      ? quantity === 1 && signal.quantityIsExact === false && semantics === 'binary_retailer_orderable_no_exact_count'
      : quantity === reportedQuantity && signal.quantityIsExact === true && semantics === 'exact_retailer_reported_quantity');
  return sourceUrl.protocol === 'https:'
    && sourceHostname === identity.hostname
    && sourceUrl.origin === identity.origin
    && sourceUrl.username === ''
    && sourceUrl.password === ''
    && /^\/shop\/product\/[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*\/?$/i.test(sourceUrl.pathname)
    && Boolean(productId && variantId)
    && /^[a-z0-9][a-z0-9-]*$/i.test(productId)
    && /^[a-z0-9][a-z0-9-]*$/i.test(variantId)
    && sourceProductId === productId
    && sourceQueryEntries.length === 1
    && sourceQueryEntries[0][0] === 'option-id'
    && sourceQueryEntries[0][1] === variantId
    && sourceUrl.search === `?option-id=${encodeURIComponent(variantId)}`
    && quantityContractValid
    && String(signal.raw?.chain || '') === identity.chain
    && String(signal.raw?.merchantId || '') === merchantId
    && Boolean(String(signal.raw?.product?.id || ''))
    && String(option?.merchant_id || '') === merchantId
    && String(option?.product_id || '') === productId
    && String(option?.option_id || '') === variantId
    && String(option?.full_address || '') === store.address
    && Number(option?.quantity) === reportedQuantity
    && String(option?.product_url || '') === sourceUrl.href;
}

export function isFloridaRetailerSignalIdentity(signal) {
  const source = String(signal.sourceLabel || signal.source || '');
  const merchantId = String(signal.merchantId || signal.raw?.merchantId || '');
  const chain = String(signal.sourceChain || signal.raw?.chain || '');
  const storeId = String(signal.storeId || '');
  let sourceHostname = '';
  let sourceStrictHostname = '';
  try {
    sourceStrictHostname = new URL(String(signal.sourceUrl || '')).hostname.toLowerCase();
    sourceHostname = sourceStrictHostname.replace(/^www\./i, '');
  } catch {}

  if (source === 'Target Florida RedSky store fulfillment') {
    return chain === 'target'
      && sourceHostname === 'target.com'
      && TARGET_FLORIDA_STORE_IDS.has(merchantId)
      && storeId === `target:${merchantId}`;
  }

  const watchIdentity = FLORIDA_WATCH_IDENTITIES.get(source);
  if (watchIdentity) {
    return chain === watchIdentity.chain
      && sourceHostname === watchIdentity.hostname
      && merchantId === watchIdentity.merchant
      && signal.locationPrecision === watchIdentity.locationPrecision
      && signal.canAlertAsInventory !== true
      && !storeId;
  }

  const cityHiveIdentity = FLORIDA_CITYHIVE_IDENTITIES.get(source);
  if (cityHiveIdentity) {
    const store = cityHiveIdentity.stores.get(merchantId);
    return Boolean(store
      && chain === cityHiveIdentity.chain
      && sourceHostname === cityHiveIdentity.hostname
      && storeId === `${chain}:${merchantId}`
      && String(signal.storeAddress || '') === store.address
      && strictCityHiveInventoryIsValid(signal, cityHiveIdentity, store, sourceHostname));
  }

  const identity = FLORIDA_RETAILER_IDENTITIES.get(source);
  return Boolean(identity
    && chain === identity.chain
    && sourceHostname === identity.hostname
    && identity.merchants.has(merchantId)
    && identity.stores.has(storeId)
    && (!identity.storeAddresses || identity.storeAddresses.get(storeId) === String(signal.storeAddress || ''))
    && (!identity.requiresBinaryNoExactCount || (Number(signal.quantity || 0) === 0 && signal.quantityIsExact === false))
    && (!identity.requiresProductPage || pensacolaProductUrl(signal.sourceUrl) === signal.sourceUrl)
    && (!identity.requiresProductIdentity || (
      String(signal.productId || '')
      && String(signal.variantId || '')
      && (signal.raw == null || (
        String(signal.raw?.productId || '') === String(signal.productId)
        && String(signal.raw?.variantId || '') === String(signal.variantId)
      ))
    ))
    && (!identity.requiresPickupProof || (
      signal.pickupOfferVerified === true
      && signal.premisesVerified === true
      && signal.sourceProductBinding === pensacolaVariantPickupUrl(signal.variantId)
    ))
    && (!identity.expansionStores || floridaExpansionIdentityIsValid(identity, signal, sourceStrictHostname)));
}

export function isFloridaRetailerInventory(signal) {
  return signal.state === 'FL'
    && /^(retailer_store_inventory_result|cityhive_store_inventory_result)$/i.test(String(signal.eventType || signal.type || ''))
    && isFloridaRetailerSignalIdentity(signal)
    && signal.locationPrecision === 'store_level'
    && signal.canAlertAsInventory === true
    && signal.sourceAvailabilityVerified === true
    && signal.availabilityStatus === 'in_stock'
    && Boolean(signal.storeId)
    && /,\s*FL\s+\d{5}/i.test(String(signal.storeAddress || ''));
}

export { TARGET_FLORIDA_STORE_IDS };
