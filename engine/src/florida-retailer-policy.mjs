import { FLORIDA_LUEKENS_STORES, FLORIDA_TAMPA_TARGET_STORE_IDS } from './collectors/florida-tampa-surfaces.mjs';
import { FLORIDA_CITYHIVE_SOURCES } from './collectors/florida-retailer-surfaces.mjs';
import { pensacolaProductUrl, pensacolaVariantPickupUrl, PENSACOLA_SHOPIFY_SOURCE, PENSACOLA_SHOPIFY_STORES } from './collectors/florida-pensacola-surfaces.mjs';

const TARGET_FLORIDA_STORE_IDS = new Set(['649', '650', '1518', '1760', '2376', ...FLORIDA_TAMPA_TARGET_STORE_IDS]);

const FLORIDA_CITYHIVE_IDENTITIES = new Map(FLORIDA_CITYHIVE_SOURCES.map((source) => [
  source.sourceLabel,
  {
    chain: source.id,
    hostname: new URL(source.baseUrl).hostname.replace(/^www\./i, '').toLowerCase(),
    stores: source.merchants,
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

export function isFloridaRetailerSignalIdentity(signal) {
  const source = String(signal.sourceLabel || signal.source || '');
  const merchantId = String(signal.merchantId || signal.raw?.merchantId || '');
  const chain = String(signal.sourceChain || signal.raw?.chain || '');
  const storeId = String(signal.storeId || '');
  let sourceHostname = '';
  try { sourceHostname = new URL(String(signal.sourceUrl || '')).hostname.replace(/^www\./i, '').toLowerCase(); } catch {}

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
      && String(signal.storeAddress || '') === store.address);
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
    )));
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
