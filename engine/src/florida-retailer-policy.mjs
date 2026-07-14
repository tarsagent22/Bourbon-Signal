import { FLORIDA_LUEKENS_STORES, FLORIDA_TAMPA_TARGET_STORE_IDS } from './collectors/florida-tampa-surfaces.mjs';

const TARGET_FLORIDA_STORE_IDS = new Set(['649', '650', '1518', '1760', '2376', ...FLORIDA_TAMPA_TARGET_STORE_IDS]);

const FLORIDA_CITYHIVE_IDENTITIES = new Map([
  ['1001 Liquors / My Florida Liquors CityHive store inventory', { chain: 'my-florida-liquors', hostname: 'myfloridaliquors.com' }],
  ['Paradise / Fubar Liquors Florida CityHive store inventory', { chain: 'paradise-fubar-liquors', hostname: 'shopparadiseliquor.com' }],
  ['Balm Liquor Riverview CityHive store inventory', { chain: 'balm-liquor', hostname: 'balmliquor.com' }],
  ['Sunshine Food & Spirits Clearwater CityHive store inventory', { chain: 'sunshine-food-spirits', hostname: 'sunshineliquorsclearwater.com' }],
]);

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
    return chain === cityHiveIdentity.chain
      && sourceHostname === cityHiveIdentity.hostname
      && /^[0-9a-f]{24}$/i.test(merchantId)
      && storeId === `${chain}:${merchantId}`;
  }

  const identity = FLORIDA_RETAILER_IDENTITIES.get(source);
  return Boolean(identity
    && chain === identity.chain
    && sourceHostname === identity.hostname
    && identity.merchants.has(merchantId)
    && identity.stores.has(storeId));
}

export function isFloridaRetailerInventory(signal) {
  return signal.state === 'FL'
    && /^(retailer_store_inventory_result|cityhive_store_inventory_result)$/i.test(String(signal.eventType || signal.type || ''))
    && isFloridaRetailerSignalIdentity(signal)
    && signal.locationPrecision === 'store_level'
    && (Number(signal.quantity || 0) > 0 || (signal.availabilityStatus === 'in_stock' && (signal.sourceAvailabilityVerified === true || signal.raw?.variant?.available === true || signal.raw?.sourceAvailabilityVerified === true)))
    && Boolean(signal.storeId)
    && /,\s*FL\s+\d{5}/i.test(String(signal.storeAddress || ''));
}

export { TARGET_FLORIDA_STORE_IDS };
