export const INDIANA_CITYHIVE_PRIORITY_CITIES = [
  'auburn', 'fremont', 'angola', 'lagrange',
  'avon', 'plainfield', 'noblesville', 'speedway', 'westfield', 'greenfield',
  'south bend', 'mishawaka', 'elkhart', 'granger', 'goshen', 'roseland', 'huntington',
  'lafayette', 'west lafayette', 'evansville', 'muncie', 'anderson', 'kokomo', 'columbus', 'jeffersonville', 'new albany',
  'indianapolis', 'carmel', 'fishers', 'greenwood', 'brownsburg', 'mccordsville',
  'fort wayne', 'new haven', 'valparaiso', 'merrillville', 'chesterton', 'bloomington', 'terre haute', 'west terre haute',
  'martinsville', 'bedford', 'french lick', 'morgantown', 'trafalgar', 'jasper',
];

function normalizedMarket(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function indianaCityHivePriorityRank(value) {
  const market = normalizedMarket(value);
  const index = INDIANA_CITYHIVE_PRIORITY_CITIES.findIndex((city) => market.includes(city));
  return index >= 0 ? index : INDIANA_CITYHIVE_PRIORITY_CITIES.length;
}

export function isIndianaCityHivePriorityMarket(value) {
  return indianaCityHivePriorityRank(value) < INDIANA_CITYHIVE_PRIORITY_CITIES.length;
}

export const INDIANA_TARGET_STORES = new Map([
  ['1530', { slug: 'muncie', name: 'Target Muncie', address: '3601 N Barr St, Muncie, IN 47303', city: 'Muncie', zip: '47303' }],
  ['111', { slug: 'kokomo', name: 'Target Kokomo', address: '1037 S Reed Rd, Kokomo, IN 46902', city: 'Kokomo', zip: '46902' }],
  ['1911', { slug: 'columbus', name: 'Target Columbus', address: '1865 N National Rd, Columbus, IN 47201', city: 'Columbus', zip: '47201' }],
  ['139', { slug: 'new-albany', name: 'Target New Albany', address: '2209 State St, New Albany, IN 47150', city: 'New Albany', zip: '47150' }],
  ['2068', { slug: 'waterford-park', name: 'Target Waterford Park', address: '1125 Veterans Pkwy, Clarksville, IN 47129', city: 'Clarksville', zip: '47129' }],
  ['1481', { slug: 'evansville-lloyd-expressway', name: 'Target Evansville Lloyd Expressway', address: '6625 E Lloyd Expy, Evansville, IN 47715', city: 'Evansville', zip: '47715' }],
  ['108', { slug: 'evansville-north', name: 'Target Evansville North', address: '4000 1st Ave, Evansville, IN 47710', city: 'Evansville', zip: '47710' }],
  ['1762', { slug: 'lafayette', name: 'Target Lafayette', address: '3630 South Street, Lafayette, IN 47905', city: 'Lafayette', zip: '47905' }],
  ['3309', { slug: 'west-lafayette-state-street', name: 'Target West Lafayette State Street', address: '300 W State St, Ste 100, West Lafayette, IN 47906', city: 'West Lafayette', zip: '47906' }],
].map(([id, store]) => [id, { ...store, id, officialUrl: `https://www.target.com/sl/${store.slug}/${id}` }]));

export function parseIndianaTargetSearchProducts(payload) {
  let json = payload;
  if (typeof payload === 'string') {
    try { json = JSON.parse(payload); } catch { return []; }
  }
  const products = json?.data?.search?.products;
  return Array.isArray(products) ? products : [];
}

export function filterFreshIndianaTargetSignals(signals, nowMs = Date.now(), maxAgeMs) {
  if (!Array.isArray(signals) || !Number.isFinite(nowMs) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) return [];
  return signals.filter((signal) => {
    const observedMs = Date.parse(signal?.observedAt || '');
    const ageMs = nowMs - observedMs;
    return Number.isFinite(observedMs) && ageMs >= 0 && ageMs <= maxAgeMs;
  });
}

export function shouldWriteIndianaTargetCache(liveSignalCount, completedStoreIds = new Set()) {
  return Number(liveSignalCount) > 0 || completedStoreIds.size > 0;
}

export function mergeIndianaTargetCacheSignals(liveSignals, cachedSignals, { completedStoreIds = new Set() } = {}) {
  const live = Array.isArray(liveSignals) ? liveSignals : [];
  const cached = Array.isArray(cachedSignals) ? cachedSignals : [];
  const liveIds = new Set(live.map((signal) => signal?.id).filter(Boolean));
  return [
    ...live,
    ...cached.filter((signal) => {
      if (!signal || liveIds.has(signal.id)) return false;
      const merchantId = String(signal.merchantId || signal.raw?.merchantId || '');
      return !completedStoreIds.has(merchantId);
    }),
  ];
}

export function parseIndianaTargetFulfillment(payload) {
  let json = payload;
  if (typeof payload === 'string') {
    try { json = JSON.parse(payload); } catch { return []; }
  }
  const options = json?.data?.product?.fulfillment?.store_options;
  if (!Array.isArray(options)) return [];
  const rows = [];
  for (const option of options) {
    const locationId = String(option?.location_id || '');
    const store = INDIANA_TARGET_STORES.get(locationId);
    if (!store) continue;
    const pickupInStock = option?.order_pickup?.availability_status === 'IN_STOCK';
    const inStoreInStock = option?.in_store_only?.availability_status === 'IN_STOCK';
    if (!pickupInStock && !inStoreInStock) continue;
    rows.push({
      locationId,
      store,
      availabilityMode: pickupInStock ? 'order_pickup' : 'in_store_only',
      availableToPromise: Math.max(0, Number(option?.location_available_to_promise_quantity) || 0),
      orderPickup: option?.order_pickup || null,
      inStoreOnly: option?.in_store_only || null,
    });
  }
  return rows;
}
