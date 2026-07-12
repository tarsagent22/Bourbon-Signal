const TARGET_FLORIDA_STORE_IDS = new Set(['649', '650', '1518', '1760', '2376']);

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
    && (Number(signal.quantity || 0) > 0 || (signal.availabilityStatus === 'in_stock' && (signal.sourceAvailabilityVerified === true || signal.raw?.variant?.available === true)))
    && Boolean(signal.storeId)
    && /,\s*FL\s+\d{5}/i.test(String(signal.storeAddress || ''));
}

export { TARGET_FLORIDA_STORE_IDS };
