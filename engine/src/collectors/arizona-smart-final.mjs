import { stableId } from '../core/text.mjs';
import { cityHiveSafeBottleMatch } from './safe-bottle-match.mjs';
import { isExactLibraryTarget } from '../library-query-plan.mjs';
import { librarySourceSearchTerms, rotateLibraryProductCandidates } from '../library-search-runtime.mjs';

export const ARIZONA_SMART_FINAL_SOURCE = Object.freeze({ id: 'smart-final', sourceLabel: 'Smart & Final Arizona store inventory', baseUrl: 'https://www.smartandfinal.com/sm/planning/rsid/730/store-locations' });
export const ARIZONA_SMART_FINAL_STORE_IDS = Object.freeze(['491', '497', '499', '720', '721', '730', '826']);
const SKU = '00080244009236';
const slug = 'buffalo-trace-straight-bourbon-id-' + SKU;
const knownStore = store => store?.status === 'Active' && store.countyProvinceState === 'AZ'
  && store.country === 'United States' && ARIZONA_SMART_FINAL_STORE_IDS.includes(String(store.retailerStoreId))
  && /^\d/.test(store.addressLine1 || '') && /^[A-Za-z ]+$/.test(store.city || '') && /^\d{5}$/.test(store.postCode || '');

export function smartFinalEmbeddedState(html) {
  // Parse only JSON, never evaluate retailer JavaScript.
  const raw = String(html || '').match(/window\.__PRELOADED_STATE__\s*=\s*([\s\S]*?);\s*window\.__GROWTHBOOK_FEATURE_FLAGS__/);
  if (!raw || raw[1].length > 3_000_000) return null;
  try { return JSON.parse(raw[1]); } catch { return null; }
}

export function parseArizonaSmartFinalInventory(page, store, bible, { observedAt, sourceUrl, candidate } = {}) {
  if (!knownStore(store) || !store.shoppingModes?.includes('pickup') || !Number.isFinite(Date.parse(observedAt))) return [];
  const active = page?.stores?.activeStoreDetails;
  const p = page?.product;
  const expectedSku = candidate?.sku || SKU;
  const expectedName = candidate?.name || 'Buffalo Trace Straight Bourbon';
  const expectedUrl = candidate ? smartFinalProductUrl(store, candidate) : `https://www.smartandfinal.com/sm/pickup/rsid/${store.retailerStoreId}/product/${slug}`;
  if (candidate && (!validDiscoveryCandidate(candidate, store) || !isExactLibraryTarget(expectedName, bible))) return [];
  const sizeMl = p?.unitOfSize?.abbreviation === 'ml' ? Number(p.unitOfSize.size) : p?.unitOfSize?.abbreviation === 'l' ? Number(p.unitOfSize.size) * 1000 : null;
  if (!knownStore(active) || String(page.stores.retailerStoreId) !== store.retailerStoreId
    || active.id !== store.id || active.retailerStoreId !== store.retailerStoreId
    || active.addressLine1 !== store.addressLine1 || active.city !== store.city || active.postCode !== store.postCode
    || page.shoppingModes?.selectedShoppingMode?.displayName !== 'pickup'
    || !active.shoppingModes?.includes('pickup') || p?.sku !== expectedSku || p.name !== expectedName
    || (!candidate && p.brand !== 'Buffalo Trace') || p.available !== true || p.attributes?.alcohol_restricted !== true
    || !['plenty', 'low'].includes(p.attributes?.StockStatus)
    || !Number.isFinite(sizeMl) || sizeMl < 375 || sizeMl > 1750 || (candidate ? sizeMl !== candidate.sizeMl : sizeMl !== 750)
    || sourceUrl !== expectedUrl) return [];
  const record = candidate ? cityHiveSafeBottleMatch(p.name, bible).record : bible.match('Buffalo Trace Bourbon')?.record;
  if (!record || (!candidate && record.canonical !== 'Buffalo Trace Bourbon')) return [];
  const id = store.retailerStoreId;
  const city = store.city.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  const rawName = `${p.name} - ${sizeMl} ml`;
  const price = Number(String(p.price || '').replace(/[$,]/g, ''));
  if (!Number.isFinite(price) || price <= 0) return [];
  return [{
    id: stableId(['AZ', 'smart-final', id, expectedSku]), state: 'AZ', sourceLabel: ARIZONA_SMART_FINAL_SOURCE.sourceLabel,
    sourceUrl, sourceChain: 'smart-final', merchantId: id, productId: expectedSku,
    rawName, canonicalBottleId: record.id, canonicalName: record.canonical, tier: record.tier,
    sourceProductBinding: { schemaVersion: candidate ? 2 : 1, source: 'smart-final-az', merchantId: id, storeUuid: active.id,
      storeAddress: `${store.addressLine1}, ${city}, AZ ${store.postCode}`, sku: expectedSku, sizeMl,
      ...(candidate ? {rawName, canonicalBottleId: record.id, canonicalName:record.canonical, discoveryUrl:candidate.discoveryUrl, discoveryStoreUuid:candidate.storeUuid} : {}),
      available: true, stockStatus: p.attributes.StockStatus, shoppingMode: 'pickup' },
    confidence: 0.86, eventType: 'retailer_store_inventory_result', locationPrecision: 'store_level',
    locationName: `Smart & Final #${id}`, storeName: `Smart & Final #${id}`, storeId: `smart-final:${id}`,
    storeAddress: `${store.addressLine1}, ${city}, AZ ${store.postCode}`, city, stateCode: 'AZ', postalCode: store.postCode, zip: store.postCode,
    lat: store.location?.latitude || null, lng: store.location?.longitude || null,
    quantity: 0, quantityIsExact: false, price, availabilityStatus: 'in_stock', availabilityLabel: 'Retailer reports available at this store',
    sourceAvailabilityVerified: true, observedAt, canAlertAsInventory: true, canAlertAsWatch: true,
    inventorySemantics: 'Smart & Final selected-store pickup page reports availability and a positive stock status. Exact shelf quantity is not published; verify before driving.',
    evidence: `Smart & Final #${id} reports ${p.name} ${sizeMl} ml available at ${store.addressLine1}, ${city}.`,
    raw: { chain: 'smart-final', merchantId: id, product: { id: expectedSku, sku: expectedSku, name: p.name, available: p.available, stockStatus: p.attributes.StockStatus, sizeMl },
      selectedStore: { id: active.id, retailerStoreId: id, address: store.addressLine1, city: store.city, zip: store.postCode }, shoppingMode: 'pickup' },
  }];
}

export function smartFinalProductUrl(store, product) {
  const name = String(product.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `https://www.smartandfinal.com/sm/pickup/rsid/${store.retailerStoreId}/product/${name}-id-${product.sku}`;
}

function validDiscoveryCandidate(candidate, store) {
  if (!/^\d{14}$/.test(candidate.sku || '') || !candidate.name || candidate.storeUuid !== store.id) return false;
  try {
    const url = new URL(candidate.discoveryUrl);
    return url.origin === 'https://www.smartandfinal.com' && !url.username && !url.password
      && url.pathname === `/sm/pickup/rsid/${store.retailerStoreId}/results`
      && url.searchParams.get('q') === candidate.query;
  } catch { return false; }
}

// Search cards discover product IDs only. A fresh selected-store product page
// must independently publish both availability and a positive stock status.
export function discoverArizonaSmartFinalProducts(page, store, bible, {sourceUrl, query, pageNumber = 1} = {}) {
  const active = page?.stores?.activeStoreDetails;
  const pagination = page?.search?.pagination?.searchResults;
  if (!knownStore(store) || !knownStore(active) || active.id !== store.id
    || active.addressLine1 !== store.addressLine1 || active.city !== store.city || active.postCode !== store.postCode
    || page.stores.retailerStoreId !== store.retailerStoreId || active.retailerStoreId !== store.retailerStoreId
    || page.shoppingModes?.selectedShoppingMode?.displayName !== 'pickup'
    || !active.shoppingModes?.includes('pickup') || pagination?.failedToLoad !== false
    || pagination.searchQuery !== query || pagination.activePage !== pageNumber) return [];
  const ids = page.search.products?.searchResults;
  if (!Array.isArray(ids) || ids.length > 100) return [];
  const result = [];
  for (const sku of ids) {
    const product = page.search.productCardDictionary?.[sku];
    const sizeMl = product?.unitOfSize?.abbreviation === 'ml' ? Number(product.unitOfSize.size) : product?.unitOfSize?.abbreviation === 'l' ? Number(product.unitOfSize.size) * 1000 : null;
    const candidate = {sku, name:product?.name, sizeMl, discoveryUrl:sourceUrl, query, storeUuid:active.id};
    if (!product || product.sku !== sku || !validDiscoveryCandidate(candidate, store)
      || !Number.isFinite(sizeMl) || sizeMl < 375 || sizeMl > 1750 || !isExactLibraryTarget(product.name, bible)) continue;
    result.push(candidate);
  }
  return result;
}

export async function collectArizonaSmartFinal(config, bible, observedAt, { fetchText, sleep = async ms => new Promise(r => setTimeout(r, ms)), signal, cursorDir, now = Date.now } = {}) {
  const signals = [], roadblocks = [], requests = [], searches = [], details = [];
  const startedAt = now();
  const maxRequests = 90, maxElapsedMs = 180_000;
  const request = async url => {
    signal?.throwIfAborted();
    if (requests.length >= maxRequests || now() - startedAt >= maxElapsedMs) return {ok:false,status:0,error:'Smart & Final request/time budget exhausted.'};
    let result;
    try { result = await fetchText(url, { timeoutMs: 6_000, signal, headers: { accept: 'text/html' } }); }
    catch (error) {
      signal?.throwIfAborted();
      if (!['TypeError', 'AbortError', 'TimeoutError'].includes(error?.name)) throw error;
      result = { ok: false, status: 0, error: error.message };
    }
    requests.push({ url, status: result.status || 0 });
    return result;
  };
  const discovery = await request(ARIZONA_SMART_FINAL_SOURCE.baseUrl);
  if (!discovery.ok) return { signals, roadblocks: [{ state: 'AZ', source: ARIZONA_SMART_FINAL_SOURCE.sourceLabel, status: discovery.status, url: ARIZONA_SMART_FINAL_SOURCE.baseUrl, error: 'Retailer store discovery failed.' }], metadata: { requests } };
  const state = smartFinalEmbeddedState(discovery.text);
  const candidates = state?.stores?.availablePlanningStores?.items;
  const stores = (Array.isArray(candidates) ? candidates : []).filter(knownStore);
  let denied = false;
  storeLoop: for (const store of stores.filter(s => s.shoppingModes?.includes('pickup')).slice(0, 7)) {
    // Preserve the verified baseline before spending bounded discovery slots.
    await sleep(1200);
    const baselineUrl = `https://www.smartandfinal.com/sm/pickup/rsid/${store.retailerStoreId}/product/${slug}`;
    const seed = await request(baselineUrl);
    if ([401,403,429,435].includes(seed.status)) { denied = true; break; }
    if (seed.ok) signals.push(...parseArizonaSmartFinalInventory(smartFinalEmbeddedState(seed.text), store, bible, { observedAt, sourceUrl:baselineUrl }));
    const found = new Map();
    const terms = await librarySourceSearchTerms(bible, {sourceKey:`AZ:smart-final:${store.retailerStoreId}`, budget:3, broadTerms:['bourbon','rye'], cursorDir});
    for (const term of terms) {
      const fingerprints = new Set();
      for (let pageNumber = 1; pageNumber <= (term === 'bourbon' ? 3 : 1); pageNumber++) {
        await sleep(1200);
        const url = new URL(`https://www.smartandfinal.com/sm/pickup/rsid/${store.retailerStoreId}/results`);
        url.searchParams.set('q',term);
        if (pageNumber > 1) url.searchParams.set('page',String(pageNumber));
        const res = await request(url.href);
        searches.push({requestedAt:new Date(now()).toISOString(),storeId:`smart-final:${store.retailerStoreId}`,term,page:pageNumber,status:res.status,ok:res.ok});
        if ([401,403,429,435].includes(res.status)) {denied=true; break storeLoop;}
        if (!res.ok) break;
        const page = smartFinalEmbeddedState(res.text);
        const fingerprint = JSON.stringify(page?.search?.products?.searchResults || []);
        if (fingerprints.has(fingerprint)) {searches.at(-1).repeatedPage=true; break;}
        fingerprints.add(fingerprint);
        for (const candidate of discoverArizonaSmartFinalProducts(page,store,bible,{sourceUrl:url.href,query:term,pageNumber})) if (candidate.sku !== SKU) found.set(candidate.sku,candidate);
        const pagination = page?.search?.pagination?.searchResults;
        if (!pagination || pageNumber * pagination.itemsPerPage >= pagination.totalItems) break;
      }
    }
    // Allocate detail slots by rarity. Cards alone never create an inventory row.
    const rank = {unicorn:4,highly_allocated:4,allocated:3,limited:2,common:1};
    const products = [...found.values()].sort((a,b) => (rank[cityHiveSafeBottleMatch(b.name,bible).record?.tier] || 0) - (rank[cityHiveSafeBottleMatch(a.name,bible).record?.tier] || 0) || a.sku.localeCompare(b.sku));
    const selectedProducts = await rotateLibraryProductCandidates(products,{sourceKey:`AZ:smart-final:${store.retailerStoreId}:details`,limit:6,cursorDir});
    details.push({storeId:`smart-final:${store.retailerStoreId}`,discovered:products.map(p=>p.sku),selected:selectedProducts.map(p=>p.sku)});
    for (const candidate of selectedProducts) {
      await sleep(1200);
      const url = smartFinalProductUrl(store,candidate);
      const res = await request(url);
      if ([401,403,429,435].includes(res.status)) {denied=true; break storeLoop;}
      if (res.ok) signals.push(...parseArizonaSmartFinalInventory(smartFinalEmbeddedState(res.text),store,bible,{observedAt,sourceUrl:url,candidate}));
    }
    if (requests.length >= maxRequests || now() - startedAt >= maxElapsedMs) break;
  }
  if (denied) roadblocks.push({state:'AZ',source:ARIZONA_SMART_FINAL_SOURCE.sourceLabel,status:'source_denied',error:'Retailer denied a request; the entire remaining source pass was stopped.'});
  if (!signals.length) roadblocks.push({ state: 'AZ', source: ARIZONA_SMART_FINAL_SOURCE.sourceLabel, status: 'reachable_no_safe_inventory_rows', error: 'No bound positive selected-store inventory was returned.' });
  return { signals, roadblocks, metadata: {discoveryMode:'library_wide_selected_store_search_and_product_verification',maxRequests,maxElapsedMs,elapsedMs:now()-startedAt,exhaustiveRetrievalVerified:false, discoveredStores: stores.map(s => ({ storeId: `smart-final:${s.retailerStoreId}`, address: s.addressLine1, city: s.city, zip: s.postCode })), searches, details, requests } };
}
