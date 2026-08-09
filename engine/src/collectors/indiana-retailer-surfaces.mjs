export const INDIANA_CITYHIVE_PRIORITY_CITIES = [
  'auburn', 'fremont', 'angola', 'lagrange',
  'avon', 'plainfield', 'noblesville', 'speedway', 'westfield', 'greenfield',
  'south bend', 'mishawaka', 'elkhart', 'granger', 'goshen', 'roseland', 'huntington',
  'lafayette', 'west lafayette', 'evansville', 'muncie', 'anderson', 'kokomo', 'columbus', 'jeffersonville', 'new albany',
  'indianapolis', 'carmel', 'fishers', 'greenwood', 'brownsburg', 'mccordsville',
  'fort wayne', 'new haven', 'valparaiso', 'merrillville', 'chesterton', 'bloomington', 'terre haute', 'west terre haute',
  'martinsville', 'bedford', 'french lick', 'morgantown', 'trafalgar', 'jasper',
];

// Public fast-retailer inventory ages out after 12 hours. Refresh the source
// cache well before that boundary so a successful not-due state pass cannot
// retain an artifact whose customer cards have already become stale.
export const INDIANA_CITYHIVE_CACHE_MAX_AGE_MS = Math.min(
  6 * 60 * 60_000,
  Math.max(60 * 60_000, Number(process.env.BOURBON_SIGNAL_IN_CITYHIVE_CACHE_MAX_AGE_MS) || 6 * 60 * 60_000),
);

export const INDIANA_CITYHIVE_SOURCE_COHORT_SIZE = Math.min(
  3,
  Math.max(1, Number(process.env.BOURBON_SIGNAL_IN_CITYHIVE_SOURCE_COHORT_SIZE) || 3),
);

export function selectIndianaCityHiveSourceCohort(sources, observedAt, {
  cohortSize = INDIANA_CITYHIVE_SOURCE_COHORT_SIZE,
  rotationMs = 60 * 60_000,
  forceAll = false,
} = {}) {
  if (!Array.isArray(sources) || !sources.length) return [];
  if (forceAll) return [...sources];
  const size = Math.max(1, Math.min(sources.length, Number(cohortSize) || 1));
  const slot = Math.floor(Date.parse(String(observedAt || '')) / Math.max(1, Number(rotationMs) || 1));
  // Add one offset after each full source-count of time slots so lower
  // operator-selected cohort sizes cannot lock a three-hour cadence onto a
  // permanent modulo subset of the provider universe.
  const start = Number.isFinite(slot) ? (slot + Math.floor(slot / sources.length)) % sources.length : 0;
  return Array.from({ length: size }, (_, index) => sources[(start + index) % sources.length]);
}

export function selectIndianaCityHiveRequestedSources(sources, sourceIds) {
  if (!Array.isArray(sources) || !sources.length) return [];
  const requestedIds = [...new Set(String(sourceIds || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean))];
  if (!requestedIds.length) return [];
  const knownIds = new Set(sources.map((source) => String(source?.id || '')));
  const unknownIds = requestedIds.filter((id) => !knownIds.has(id));
  if (unknownIds.length) throw new Error(`Unknown Indiana CityHive source id(s): ${unknownIds.join(', ')}`);
  const requestedSet = new Set(requestedIds);
  return sources.filter((source) => requestedSet.has(String(source.id)));
}

export function isIndianaCityHiveCacheUsable(cache, nowMs = Date.now(), maxAgeMs = INDIANA_CITYHIVE_CACHE_MAX_AGE_MS) {
  const generatedMs = Date.parse(String(cache?.generatedAt || ''));
  const ageMs = nowMs - generatedMs;
  const signals = Array.isArray(cache?.signals) ? cache.signals : [];
  return Number.isFinite(nowMs)
    && Number.isFinite(maxAgeMs)
    && maxAgeMs >= 0
    && Number.isFinite(generatedMs)
    && ageMs >= 0
    && ageMs <= maxAgeMs
    && signals.some((signal) => signal?.eventType === 'cityhive_store_inventory_result');
}

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

export const INDIANA_CITYHIVE_EXPANSION_TARGETS = Object.freeze([
  { merchantId: '5e92525978e8f13c2cb1e15c', name: 'Big Red #105 - Bloomington', city: 'Bloomington', address: '1255 S College Mall Rd, Bloomington, IN 47401, USA' },
  { merchantId: '5e92525778e8f13c2cb1e158', name: 'Big Red #104 - Bloomington', city: 'Bloomington', address: '3207 E 3rd St, Bloomington, IN 47401, USA' },
  { merchantId: '5e92506878e8f13c2cb1e154', name: 'Big Red #103 - Bloomington', city: 'Bloomington', address: '1870 S Walnut St, Bloomington, IN 47401, USA' },
  { merchantId: '5e92547478e8f13c2cb1e1a8', name: 'Big Red #126 - Bloomington', city: 'Bloomington', address: '713 W 17th St, Bloomington, IN 47404, USA' },
  { merchantId: '5e92547178e8f13c2cb1e1a4', name: 'Big Red #125 - Bloomington', city: 'Bloomington', address: '2205 N Walnut St, Bloomington, IN 47404, USA' },
  { merchantId: '5e92445578e8f13c2cb1e14c', name: 'Big Red #101 - 15th and College - Bloomington', city: 'Bloomington', address: '1110 N College Ave, Bloomington, IN 47404, USA' },
  { merchantId: '5e92506478e8f13c2cb1e150', name: 'Big Red #102 - The Big Store - Bloomington', city: 'Bloomington', address: '418 N College Ave, Bloomington, IN 47404, USA' },
  { merchantId: '5e92545478e8f13c2cb1e17c', name: 'Big Red #114 - Bloomington', city: 'Bloomington', address: '2501 S Leonard Springs Rd, Bloomington, IN 47403, USA' },
  { merchantId: '5e92545778e8f13c2cb1e180', name: 'Big Red #115 - Bloomington', city: 'Bloomington', address: '2401 W 3rd St, Bloomington, IN 47404, USA' },
  { merchantId: '5e92546e78e8f13c2cb1e1a0', name: 'Big Red #124 - W. Terre Haute', city: 'West Terre Haute', address: '400 National Ave, West Terre Haute, IN 47885, USA' },
  { merchantId: '5e92546b78e8f13c2cb1e19c', name: 'Big Red #122 - Terre Haute', city: 'Terre Haute', address: '2500 Maple Ave, Terre Haute, IN 47804, USA' },
  { merchantId: '5e92544c78e8f13c2cb1e170', name: 'Big Red #110 - Terre Haute', city: 'Terre Haute', address: '1701 S 3rd St, Terre Haute, IN 47802, USA' },
  { merchantId: '5e92544e78e8f13c2cb1e174', name: 'Big Red #111 - Terre Haute', city: 'Terre Haute', address: '2655 Wabash Ave, Terre Haute, IN 47803, USA' },
  { merchantId: '5e92545178e8f13c2cb1e178', name: 'Big Red #112 - Terre Haute', city: 'Terre Haute', address: '4791 S 7th St, Terre Haute, IN 47802, USA' },
  { merchantId: '5e92546678e8f13c2cb1e194', name: 'Big Red #120 - Terre Haute', city: 'Terre Haute', address: '1011 N 3rd St, Terre Haute, IN 47807, USA' },
  { merchantId: '5e92546878e8f13c2cb1e198', name: 'Big Red #121 - Terre Haute', city: 'Terre Haute', address: '226 N 13th St, Terre Haute, IN 47807, USA' },
  { merchantId: '5e9254c478e8f13c2cb1e214', name: 'Big Red #230 - Martinsville', city: 'Martinsville', address: '1631 E Morgan St, Martinsville, IN 46151, USA' },
  { merchantId: '5e9254c178e8f13c2cb1e210', name: 'Big Red #229 - Martinsville', city: 'Martinsville', address: '2194 Burton Ln, Martinsville, IN 46151, USA' },
  { merchantId: '5e92545e78e8f13c2cb1e188', name: 'Big Red #117 - Martinsville', city: 'Martinsville', address: '490 Morton Ave, Martinsville, IN 46151, USA' },
  { merchantId: '5e92545b78e8f13c2cb1e184', name: 'Big Red #116 - Bedford', city: 'Bedford', address: '3307 16th St, Bedford, IN 47421, USA' },
].map(Object.freeze));

const INDIANA_CITYHIVE_EXPANSION_TARGET_IDS = new Set(
  INDIANA_CITYHIVE_EXPANSION_TARGETS.map((store) => store.merchantId),
);

export function selectIndianaCityHivePriorityMerchants(merchants, { baseLimit = 48 } = {}) {
  if (!Array.isArray(merchants) || !merchants.length) return [];
  const ranked = merchants
    .filter((merchant) => merchant?.id && isIndianaCityHivePriorityMarket(`${merchant.name || ''} ${merchant.city || ''} ${merchant.address || ''}`))
    .sort((a, b) => indianaCityHivePriorityRank(`${a.name || ''} ${a.city || ''} ${a.address || ''}`)
      - indianaCityHivePriorityRank(`${b.name || ''} ${b.city || ''} ${b.address || ''}`)
      || Number(a.ordinal || 0) - Number(b.ordinal || 0));
  const base = ranked.slice(0, Math.max(0, Number(baseLimit) || 0));
  const selectedIds = new Set(base.map((merchant) => String(merchant.id)));
  const expansion = ranked.filter((merchant) => INDIANA_CITYHIVE_EXPANSION_TARGET_IDS.has(String(merchant.id)) && !selectedIds.has(String(merchant.id)));
  return [...base, ...expansion];
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

export function buildIndianaTargetStoreLocationSignals(observedAt) {
  return [...INDIANA_TARGET_STORES.values()].map((store) => ({
    id: `target-indiana-store-location:${store.id}`,
    state: 'IN',
    stateCode: 'IN',
    sourceLabel: 'Target Indiana official exact-store identity',
    sourceUrl: store.officialUrl,
    sourceChain: 'target',
    merchantId: store.id,
    rawName: store.name,
    canonicalBottleId: null,
    canonicalName: null,
    confidence: 0.8,
    eventType: 'retailer_store_location',
    locationPrecision: 'store_level',
    locationName: store.name,
    storeName: store.name,
    storeId: `target:${store.id}`,
    storeAddress: store.address,
    city: store.city,
    postalCode: store.zip,
    zip: store.zip,
    quantity: 0,
    observedAt,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    inventorySemantics: 'The configured official Target store page identifies an exact Indiana premises. This directory row is not product availability or bottle inventory.',
    evidence: `Target's official store identity maps store ${store.id} to ${store.name}, ${store.address}.`,
    raw: { chain: 'target', merchantId: store.id, configuredOfficialStoreIdentity: true },
  }));
}

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
