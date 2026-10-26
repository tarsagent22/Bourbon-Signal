import { stableId, stripHtml } from '../core/text.mjs';
import { reviewedArizonaXapiBottleMatch } from './arizona-xapi-matching.mjs';

// Production premises from the October 22 baseline. Discovery must still prove
// their current Arizona address; this list never manufactures a resolver row.
export const ARIZONA_XAPI_BASELINE_STORE_IDS = Object.freeze([
  '209', '216', '245', '247', '255', '267', '274', '752', '961',
  '1487', '1491', '1684', '1819', '1983', '2032', '2060', '2083',
  '2951', '2955', '2988', '3173', '3203', '3204', '3931',
]);
export const ARIZONA_XAPI_OCT22_STORE_IDS = Object.freeze([
  ...ARIZONA_XAPI_BASELINE_STORE_IDS,
  '1604', '1225', '1534', '3151', '1841', '1997', '3926', '3941',
]);
// Exact selected cohort in published run d8f638dd54b1231d. Resolver evidence
// must still bind every premise; a historical ID never manufactures inventory.
export const ARIZONA_XAPI_PASS1_STORE_IDS = Object.freeze([
  ...ARIZONA_XAPI_OCT22_STORE_IDS,
  '236', '2054', '2709', '1055', '370', '2835', '1747', '1521',
  '253', '1732', '261', '2075', '1639', '1275', '2052', '1584',
  '1207', '1474', '2809', '1229', '248', '2044', '2651', '1748',
  '1717', '2997', '1662', '1535', '2618', '977', '1510', '2028',
  '1637', '23', '174', '1605', '1511', '1971', '48', '270',
  '2821', '966', '2716', '980', '981', '343', '2699', '991',
]);
// Selected premises in production run 645ddec3ca79f1d2 (2026-10-25).
// New-store counts compare against this full released cohort.
export const ARIZONA_XAPI_PREVIOUS_STORE_IDS = Object.freeze([
  ...ARIZONA_XAPI_PASS1_STORE_IDS,
  '1536', '2076', '1733', '3187', '249', '2017', '2069', '2648', '3189', '272', '1291', '1543', '1771', '1887', '1654', '1948', '1566', '197', '72', '1591', '958', '1221', '1750', '2799', '2952', '1002', '1549', '2042', '2644', '1849', '1515', '1874', '3989', '1663', '1201', '963', '2922', '1253', '240', '250', '1988', '1979', '1255', '2097', '960', '1980', '413', '1984',
]);
export const ARIZONA_XAPI_DEFAULT_STORES = 134;
export const ARIZONA_XAPI_SEARCH_LIMIT = 150;
export const ARIZONA_XAPI_SEARCH_ROWS = 120;
export const ARIZONA_XAPI_RARE_QUERY_LIMIT = 16;
// Both premises passed resolver and store-specific bourbon proofs. Prefer them
// among equally unrepresented cities; they still require fresh resolver rows.
const REVIEWED_ADDITIONAL_STORE_IDS = new Set(['1604', '1225']);

const identityText = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const distanceOf = (store) => store.distance !== '' && store.distance != null && Number.isFinite(Number(store.distance)) && Number(store.distance) >= 0 ? Number(store.distance) : Infinity;
const storeOrder = (a, b) => distanceOf(a) - distanceOf(b) || String(a.locationId).localeCompare(String(b.locationId), 'en', { numeric: true });

export function arizonaXapiBanner(store) {
  const banner = identityText(store?.polarisBannerName || store?.domainName);
  const domain = identityText(store?.domainName);
  return (banner === 'safeway' || banner === 'albertsons') && (!domain || domain === banner) ? banner : null;
}

export function isArizonaXapiStore(store) {
  const address = store?.address;
  return Boolean(store && /^\d{2,6}$/.test(String(store.locationId || ''))
    && arizonaXapiBanner(store)
    && String(address?.state || '').toUpperCase() === 'AZ'
    && (!address?.country || String(address.country).toUpperCase() === 'US')
    && typeof address?.line1 === 'string' && /\d/.test(address.line1)
    && typeof address?.city === 'string' && address.city.trim()
    && /^\d{5}(?:-\d{4})?$/.test(String(address?.zipcode || '')));
}

function premisesKey(store) {
  return [arizonaXapiBanner(store), identityText(store.address.line1), identityText(store.address.city), store.address.zipcode].join('|');
}

export function mergeArizonaXapiStores(stores, payload, conflicts = new Set()) {
  for (const lane of ['instore', 'pickup', 'delivery']) {
    const value = payload?.[lane]?.stores;
    for (const store of Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : []) {
      if (!isArizonaXapiStore(store)) continue;
      const id = String(store.locationId);
      if (conflicts.has(id)) continue;
      const previous = stores.get(id);
      if (previous && premisesKey(previous) !== premisesKey(store)) {
        stores.delete(id);
        conflicts.add(id);
        continue;
      }
      const preferred = previous && storeOrder(previous, store) <= 0 ? previous : store;
      stores.set(id, { ...preferred, locationId: id, lanes: new Set([...(previous?.lanes || []), lane]) });
    }
  }
  return stores;
}

export function selectArizonaXapiStores(input, { maxStores = ARIZONA_XAPI_DEFAULT_STORES } = {}) {
  const limit = Math.max(1, Math.min(ARIZONA_XAPI_DEFAULT_STORES, Math.floor(Number(maxStores) || ARIZONA_XAPI_DEFAULT_STORES)));
  const stores = new Map();
  const conflicts = new Set();
  mergeArizonaXapiStores(stores, { instore: { stores: [...input] } }, conflicts);
  const candidates = [...stores.values()].sort(storeOrder);
  const protectedIds = new Set(ARIZONA_XAPI_BASELINE_STORE_IDS);
  const selected = candidates.filter((store) => protectedIds.has(store.locationId)).slice(0, limit);
  const selectedIds = new Set(selected.map((store) => store.locationId));
  for (const store of candidates.filter((row) => ARIZONA_XAPI_PREVIOUS_STORE_IDS.includes(row.locationId))) {
    if (selected.length >= limit) break;
    if (selectedIds.has(store.locationId)) continue;
    selected.push(store);
    selectedIds.add(store.locationId);
  }
  // Keep the former 24-store lane intact before adding geographical breadth.
  for (const store of candidates) {
    if (selected.length >= Math.min(24, limit)) break;
    if (selectedIds.has(store.locationId)) continue;
    selected.push(store);
    selectedIds.add(store.locationId);
  }
  const cityCounts = new Map();
  for (const store of selected) {
    const city = identityText(store.address.city);
    cityCounts.set(city, (cityCounts.get(city) || 0) + 1);
  }
  while (selected.length < limit) {
    const next = candidates.filter((store) => !selectedIds.has(store.locationId))
      .sort((a, b) => (cityCounts.get(identityText(a.address.city)) || 0) - (cityCounts.get(identityText(b.address.city)) || 0)
        || Number(REVIEWED_ADDITIONAL_STORE_IDS.has(b.locationId)) - Number(REVIEWED_ADDITIONAL_STORE_IDS.has(a.locationId))
        || storeOrder(a, b))[0];
    if (!next) break;
    selected.push(next);
    selectedIds.add(next.locationId);
    const city = identityText(next.address.city);
    cityCounts.set(city, (cityCounts.get(city) || 0) + 1);
  }
  return selected;
}

// Shift the store assignment after each complete query-pool cycle. Advancing
// store and query positions in lockstep strands pairs whenever their sizes share
// a factor (134 stores and 350 terms previously visited only half the pairs).
export function arizonaXapiLibraryQueryAssignments(storeCount, { terms = [], poolSize, invocation } = {}) {
  if (!Number.isInteger(storeCount) || storeCount < 1 || storeCount > ARIZONA_XAPI_DEFAULT_STORES
    || !Number.isSafeInteger(poolSize) || poolSize < terms.length || poolSize > Number.MAX_SAFE_INTEGER / storeCount
    || !Number.isSafeInteger(invocation) || invocation < 0
    || !terms.length || terms.length > Math.min(ARIZONA_XAPI_RARE_QUERY_LIMIT, storeCount)
    || terms.some(term => typeof term !== 'string' || !term.trim()) || new Set(terms).size !== terms.length) {
    throw new Error('Invalid Arizona library query assignment');
  }
  const start = invocation * terms.length;
  if (!Number.isSafeInteger(start + terms.length)) throw new Error('Arizona library query position exceeds safe integer range');
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  let stride = poolSize;
  while (gcd(stride, storeCount) !== 1) stride += 1;
  return terms.map((term, offset) => {
    const position = start + offset;
    const cycle = Math.floor(position / poolSize) % storeCount;
    return { term, storeIndex: (cycle * stride + position % poolSize) % storeCount };
  });
}

export function arizonaXapiRequestPlan(input, { maxStores = ARIZONA_XAPI_DEFAULT_STORES, terms = [], nowMs = Date.now(), rotationIndex = null, queryPoolSize = null } = {}) {
  const selected = selectArizonaXapiStores(input, { maxStores });
  const rareTerms = [...new Set(terms.map((term) => String(term).trim()).filter((term) => term && term !== 'bourbon'))];
  const usesInvocation = Number.isSafeInteger(rotationIndex) && rotationIndex >= 0;
  if (usesInvocation && queryPoolSize !== null && rareTerms.length && selected.length) {
    const supplemental = Array.from({ length: selected.length }, () => []);
    for (const { term, storeIndex } of arizonaXapiLibraryQueryAssignments(selected.length, { terms: rareTerms, poolSize: queryPoolSize, invocation: rotationIndex })) {
      supplemental[storeIndex].push(term);
    }
    return selected.map((store, index) => ({ store, terms: ['bourbon', ...supplemental[index]] }));
  }
  const dayBucket = usesInvocation ? rotationIndex : Math.floor(nowMs / 86_400_000);
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  let termStride = Math.max(1, selected.length);
  while (rareTerms.length && gcd(termStride, rareTerms.length) !== 1) termStride += 1;
  const rareCount = rareTerms.length ? Math.min(ARIZONA_XAPI_RARE_QUERY_LIMIT, ARIZONA_XAPI_SEARCH_LIMIT - selected.length, selected.length) : 0;
  // Advance each store's term on its own visits, independent of which day
  // selects its cohort. Day parity otherwise traps a 32/16 split on two terms.
  const rareVisits = new Map(Array.from({ length: rareCount }, (_, offset) => {
    const slot = dayBucket * rareCount + offset;
    return [slot % selected.length, Math.floor(slot / selected.length)];
  }));
  const visitTerms = new Map(Array.from(rareVisits.keys()).map((index, offset) => [index, !usesInvocation ? rareTerms[(rareVisits.get(index) * termStride + index) % rareTerms.length] : rareTerms[offset % rareTerms.length]]));
  return selected.map((store, index) => ({
    store,
    terms: ['bourbon', ...(rareVisits.has(index) ? [visitTerms.get(index)] : [])],
  }));
}

export function parseArizonaXapiInventory(payload, store, bible, { observedAt, queryTerm = 'bourbon', matchProduct = reviewedArizonaXapiBottleMatch } = {}) {
  if (!isArizonaXapiStore(store) || !Number.isFinite(Date.parse(observedAt))) return [];
  const banner = arizonaXapiBanner(store);
  const host = `https://www.${banner}.com`;
  const address = store.address;
  const signals = [];
  const seen = new Set();
  for (const product of Array.isArray(payload?.response?.docs) ? payload.response.docs : []) {
    const rawName = stripHtml(String(product?.name || '')).trim();
    const productId = String(product?.id || product?.pid || product?.upc || '');
    if (!/^\d+$/.test(productId) || String(product?.storeId || '') !== String(store.locationId) || seen.has(productId)) continue;
    const size = rawName.match(/\b(\d+(?:\.\d+)?)\s*(ml|l|liter)\b/i);
    const sizeMl = size ? Number(size[1]) * (/^l/i.test(size[2]) ? 1000 : 1) : null;
    if (sizeMl != null && sizeMl < 375) continue;
    const { match, record } = matchProduct(product, bible, { storeId: String(store.locationId) });
    if (!record || product?.containsAlcohol === false) continue;
    // The expanded path requires exact library identity. Previously excluded
    // brands must not enter via legacy family containment (e.g. an unnamed
    // Heritage whiskey resolving to a specific toasted release).
    if (!/bourbon|blanton|weller|eagle rare|buffalo trace|stagg|heaven hill|e\.?\s*h\.?\s*taylor|booker'?s/i.test(rawName)
      && match?.method !== 'exact-library-identity') continue;
    const inventory = product.channelInventory || {};
    if (String(inventory.instore ?? inventory.inStore ?? '') !== '1') continue;
    const rawQuantity = inventory.instoreItemQty ?? inventory.inStoreItemQty;
    const exactQty = Number(rawQuantity);
    if (rawQuantity != null && (rawQuantity === '' || !Number.isFinite(exactQty) || exactQty <= 0)) continue;
    const quantity = rawQuantity != null ? exactQty : 0;
    const sourceLabel = `${banner === 'albertsons' ? 'Albertsons' : 'Safeway'} Arizona XAPI store inventory`;
    seen.add(productId);
    signals.push({
      id: stableId(['AZ', 'albertsons-xapi', store.locationId, productId]), state: 'AZ',
      sourceLabel, sourceUrl: `${host}/shop/product-details.${productId}.html`, sourceChain: banner, merchantId: String(store.locationId),
      rawName, canonicalBottleId: record.id, canonicalName: record.canonical, tier: record.tier,
      confidence: quantity > 0 ? 0.86 : Math.max(0.8, match?.confidence || 0.5), eventType: 'retailer_store_inventory_result', locationPrecision: 'store_level',
      locationName: `${store.domainName || banner} #${store.locationId}`, storeName: `${store.domainName || banner} #${store.locationId}`, storeId: `${banner}:${store.locationId}`,
      storeAddress: `${address.line1}, ${address.city}, AZ ${address.zipcode}`, city: address.city, stateCode: 'AZ', postalCode: address.zipcode, zip: address.zipcode,
      lat: Number(store.latitude ?? store.lat) || null, lng: Number(store.longitude ?? store.lng) || null,
      quantity, price: Number(product.price) || null, availabilityStatus: 'in_stock', availabilityLabel: quantity > 0 ? `Retailer reports ${quantity} available` : 'Retailer reports in-store inventory', sourceAvailabilityVerified: true, observedAt,
      canAlertAsInventory: true, canAlertAsWatch: true,
      inventorySemantics: quantity > 0 ? 'Albertsons Companies XAPI reports positive store/channel inventory and an item quantity.' : 'Albertsons Companies XAPI reports positive in-store inventory but no exact item quantity; verify before driving.',
      evidence: `${sourceLabel} reports ${rawName} available at ${address.line1}, ${address.city}${quantity > 0 ? ` with quantity ${quantity}` : ''}.`,
      raw: { chain: banner, merchantId: String(store.locationId), queryTerm, product: { id: product.id, pid: product.pid, upc: product.upc, inventoryAvailable: product.inventoryAvailable }, channelInventory: inventory, channelEligibility: product.channelEligibility },
    });
  }
  return signals;
}
