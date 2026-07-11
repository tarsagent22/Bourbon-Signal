const ARIZONA_RETAILER_IDENTITIES = new Map([
  ['Paradise Liquor Mini Mart Phoenix CityHive store inventory', { chain: 'paradise-liquor-phoenix', hostname: 'paradiseliquoraz.com', merchants: new Set(['6060f68f2641d516427b8bc6']) }],
  ['Liquor Vault Scottsdale CityHive store inventory', { chain: 'liquor-vault-scottsdale', hostname: 'azliquorvault.com', merchants: new Set(['6060f74f93fbc722f35ec763']) }],
  ['Skyline Liquor Arizona CityHive store inventory', { chain: 'skyline-liquor', hostname: 'skylinebroadway.com', merchants: new Set(['598100c3d05b4360e32fa9b6', '686c048672e27f25df6deeda']) }],
  ['Chandler Liquors CityHive store inventory', { chain: 'chandler-liquors', hostname: 'chandlerliquorsaz.com', merchants: new Set(['5e8e0a0778e8f16f128f7e5a']) }]
]);

export function isArizonaRetailerSignalIdentity(signal) {
  const identity = ARIZONA_RETAILER_IDENTITIES.get(String(signal.sourceLabel || signal.source || ''));
  const merchantId = String(signal.raw?.option?.merchant_id || '');
  let sourceHostname = '';
  try { sourceHostname = new URL(String(signal.sourceUrl || '')).hostname.replace(/^www\./i, '').toLowerCase(); } catch {}
  return Boolean(identity && signal.raw?.chain === identity.chain && identity.merchants.has(merchantId) && sourceHostname === identity.hostname);
}

export function isArizonaRetailerInventory(signal) {
  return signal.state === 'AZ'
    && /^cityhive_store_inventory_result$/i.test(String(signal.eventType || signal.type || ''))
    && isArizonaRetailerSignalIdentity(signal)
    && signal.locationPrecision === 'store_level'
    && Number(signal.quantity || 0) > 0
    && Boolean(signal.storeId)
    && /,\s*AZ\s+\d{5}/i.test(String(signal.storeAddress || ''));
}
