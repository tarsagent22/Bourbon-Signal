const ARIZONA_RETAILER_IDENTITIES = new Map([
  ['Paradise Liquor Mini Mart Phoenix CityHive store inventory', { chain: 'paradise-liquor-phoenix', hostname: 'paradiseliquoraz.com', merchants: new Set(['6060f68f2641d516427b8bc6']) }],
  ['Liquor Vault Scottsdale CityHive store inventory', { chain: 'liquor-vault-scottsdale', hostname: 'azliquorvault.com', merchants: new Set(['6060f74f93fbc722f35ec763']) }],
  ['Skyline Liquor Arizona CityHive store inventory', { chain: 'skyline-liquor', hostname: 'skylinebroadway.com', merchants: new Set(['598100c3d05b4360e32fa9b6', '686c048672e27f25df6deeda']) }],
  ['Chandler Liquors CityHive store inventory', { chain: 'chandler-liquors', hostname: 'chandlerliquorsaz.com', merchants: new Set(['5e8e0a0778e8f16f128f7e5a']) }],
  ["Lucky's Liquor Phoenix CityHive store inventory", { chain: 'luckys-liquor-phoenix', hostname: 'luckysliquor.com', merchants: new Set(['65fe530ba854f17fbd29a744']) }],
  ['One Stop Drive Thru Liquor Phoenix CityHive store inventory', { chain: 'one-stop-drive-thru-phoenix', hostname: 'onestopdrivethruliquor.com', merchants: new Set(['6377cc75b9615e6a2b8290c1']) }],
  ['Liquor Express Tempe CityHive store inventory', { chain: 'liquor-express-tempe', hostname: 'liquorexpresstempe.store', merchants: new Set(['5f88c1ab8f687229c6c2c8a4']) }],
  ['Mesa Liquor WooCommerce store inventory', { chain: 'mesa-liquor', hostname: 'mesaliquorstore.com', merchants: new Set(['mesa-liquor-woocommerce']) }],
  ['Best Liquor Tempe WooCommerce store inventory', { chain: 'best-liquor-tempe', hostname: 'bestliquortempe.com', merchants: new Set(['best-liquor-tempe-woocommerce']) }],
  ['Flagstaff Liquor Shopify store inventory', { chain: 'flagstaff-liquor', hostname: 'flagstaffliquor.com', merchants: new Set(['flagstaff-liquor-shopify']) }],
  ['Target Arizona RedSky store fulfillment', { chain: 'target', hostname: 'target.com', merchants: new Set(['2354', '2236']) }]
]);

export function isArizonaRetailerSignalIdentity(signal) {
  const source = String(signal.sourceLabel || signal.source || '');
  const merchantId = String(signal.merchantId || signal.raw?.option?.merchant_id || signal.raw?.merchantId || '');
  const chain = String(signal.sourceChain || signal.raw?.chain || '');
  let sourceHostname = '';
  try { sourceHostname = new URL(String(signal.sourceUrl || '')).hostname.replace(/^www\./i, '').toLowerCase(); } catch {}
  if (/^(Safeway|Albertsons) Arizona XAPI store inventory$/.test(source)) {
    const expectedChain = source.startsWith('Albertsons') ? 'albertsons' : 'safeway';
    return chain === expectedChain
      && sourceHostname === `${expectedChain}.com`
      && /^\d{2,6}$/.test(merchantId)
      && String(signal.storeId || '') === `${expectedChain}:${merchantId}`;
  }
  const identity = ARIZONA_RETAILER_IDENTITIES.get(source);
  return Boolean(identity && chain === identity.chain && identity.merchants.has(merchantId) && sourceHostname === identity.hostname);
}

export function isArizonaRetailerInventory(signal) {
  return signal.state === 'AZ'
    && /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(String(signal.eventType || signal.type || ''))
    && isArizonaRetailerSignalIdentity(signal)
    && signal.locationPrecision === 'store_level'
    && (Number(signal.quantity || 0) > 0 || (signal.availabilityStatus === 'in_stock' && (signal.sourceAvailabilityVerified === true || signal.raw?.product?.is_in_stock === true || signal.raw?.variant?.available === true)))
    && Boolean(signal.storeId)
    && /,\s*AZ\s+\d{5}/i.test(String(signal.storeAddress || ''));
}
