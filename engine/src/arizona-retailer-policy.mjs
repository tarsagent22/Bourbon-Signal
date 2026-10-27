const TARGET_ARIZONA_STORE_IDS = new Set(['233','251','319','363','639','700','825','851','854','855','884','909','935','936','950','1141','1209','1242','1316','1327','1335','1360','1361','1386','1429','1432','1439','1838','1863','1905','1959','1960','2083','2140','2149','2176','2227','2236','2341','2354','2365','2368','2400','2747','2915','2920','2944','2953','3261']);

import { isMetroRetailerProof } from './collectors/arizona-metro-retailer-proof.mjs';
const SMART_FINAL_IDS = new Set(['491', '497', '499', '720', '721', '730', '826']);
const ARIZONA_RETAILER_IDENTITIES = new Map([
  ['A1 Liquor Phoenix CityHive store inventory', { chain: 'a1-liquor-phoenix', hostname: 'a1liquorstore.com', merchants: new Set(['68dd5e50f9a9491455c941be']) }],
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
  if (['mesa-liquor','best-liquor-tempe','liquor-wheel-2-phoenix'].includes(chain)) return isMetroRetailerProof(signal);
  if (/^(Safeway|Albertsons) Arizona XAPI store inventory$/.test(source)) {
    const expectedChain = source.startsWith('Albertsons') ? 'albertsons' : 'safeway';
    return chain === expectedChain
      && sourceHostname === `${expectedChain}.com`
      && /^\d{2,6}$/.test(merchantId)
      && String(signal.storeId || '') === `${expectedChain}:${merchantId}`;
  }
  if (source === 'Target Arizona RedSky store fulfillment') {
    return chain === 'target'
      && sourceHostname === 'target.com'
      && /^\d{2,5}$/.test(merchantId)
      && TARGET_ARIZONA_STORE_IDS.has(merchantId)
      && String(signal.storeId || '') === `target:${merchantId}`;
  }
  if (source === 'Smart & Final Arizona store inventory') {
    const proof = signal.sourceProductBinding;
    return chain === 'smart-final' && sourceHostname === 'smartandfinal.com' && SMART_FINAL_IDS.has(merchantId)
      && signal.storeId === `smart-final:${merchantId}`
      && proof?.source === 'smart-final-az' && proof.merchantId === merchantId
      && (proof.schemaVersion === 1
        ? signal.sourceUrl === `https://www.smartandfinal.com/sm/pickup/rsid/${merchantId}/product/buffalo-trace-straight-bourbon-id-00080244009236` && proof.sku === '00080244009236' && proof.sizeMl === 750
        : proof.schemaVersion === 2 && /^\d{14}$/.test(proof.sku || '') && signal.productId === proof.sku
          && (proof.canonicalName === signal.canonicalName || proof.rawName === signal.canonicalName)
          && (proof.rawName === signal.canonicalName || proof.canonicalBottleId === signal.canonicalBottleId)
          && proof.rawName === signal.rawName && Boolean(proof.canonicalBottleId)
          && signal.sourceUrl.startsWith(`https://www.smartandfinal.com/sm/pickup/rsid/${merchantId}/product/`)
          && signal.sourceUrl.endsWith(`-id-${proof.sku}`)
          && proof.discoveryUrl?.startsWith(`https://www.smartandfinal.com/sm/pickup/rsid/${merchantId}/results?q=`)
          && proof.discoveryStoreUuid === proof.storeUuid && Number(proof.sizeMl) >= 375 && Number(proof.sizeMl) <= 1750)
      && proof.available === true
      && ['plenty', 'low'].includes(proof.stockStatus) && proof.shoppingMode === 'pickup'
      && proof.storeAddress === signal.storeAddress && /^[a-f0-9-]{36}$/.test(proof.storeUuid || '')
      && Number(signal.quantity || 0) === 0 && signal.quantityIsExact === false;
  }
  const identity = ARIZONA_RETAILER_IDENTITIES.get(source);
  return Boolean(identity && chain === identity.chain && identity.merchants.has(merchantId) && sourceHostname === identity.hostname
    && (chain !== 'a1-liquor-phoenix' || (signal.storeId === `a1-liquor-phoenix:${merchantId}`
      && signal.storeAddress === '901 E Indian School Rd, Phoenix, AZ 85014, USA')));
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
