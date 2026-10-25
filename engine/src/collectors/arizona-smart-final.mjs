import { stableId } from '../core/text.mjs';

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

export function parseArizonaSmartFinalInventory(page, store, bible, { observedAt, sourceUrl } = {}) {
  if (!knownStore(store) || !store.shoppingModes?.includes('pickup') || !Number.isFinite(Date.parse(observedAt))) return [];
  const active = page?.stores?.activeStoreDetails;
  const p = page?.product;
  if (!knownStore(active) || String(page.stores.retailerStoreId) !== store.retailerStoreId
    || active.id !== store.id || active.retailerStoreId !== store.retailerStoreId
    || active.addressLine1 !== store.addressLine1 || active.city !== store.city || active.postCode !== store.postCode
    || page.shoppingModes?.selectedShoppingMode?.displayName !== 'pickup'
    || !active.shoppingModes?.includes('pickup') || p?.sku !== SKU || p.name !== 'Buffalo Trace Straight Bourbon'
    || p.brand !== 'Buffalo Trace' || p.available !== true || p.attributes?.alcohol_restricted !== true
    || !['plenty', 'low'].includes(p.attributes?.StockStatus)
    || p.unitOfSize?.size !== 750 || p.unitOfSize?.abbreviation !== 'ml'
    || sourceUrl !== `https://www.smartandfinal.com/sm/pickup/rsid/${store.retailerStoreId}/product/${slug}`) return [];
  const record = bible.match('Buffalo Trace Bourbon')?.record;
  if (record?.canonical !== 'Buffalo Trace Bourbon') return [];
  const id = store.retailerStoreId;
  const city = store.city.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  const price = Number(String(p.price || '').replace(/[$,]/g, ''));
  if (!Number.isFinite(price) || price <= 0) return [];
  return [{
    id: stableId(['AZ', 'smart-final', id, SKU]), state: 'AZ', sourceLabel: ARIZONA_SMART_FINAL_SOURCE.sourceLabel,
    sourceUrl, sourceChain: 'smart-final', merchantId: id, productId: SKU,
    rawName: 'Buffalo Trace Straight Bourbon - 750 ml', canonicalBottleId: record.id, canonicalName: record.canonical, tier: record.tier,
    sourceProductBinding: { schemaVersion: 1, source: 'smart-final-az', merchantId: id, storeUuid: active.id,
      storeAddress: `${store.addressLine1}, ${city}, AZ ${store.postCode}`, sku: SKU, sizeMl: 750,
      available: true, stockStatus: p.attributes.StockStatus, shoppingMode: 'pickup' },
    confidence: 0.86, eventType: 'retailer_store_inventory_result', locationPrecision: 'store_level',
    locationName: `Smart & Final #${id}`, storeName: `Smart & Final #${id}`, storeId: `smart-final:${id}`,
    storeAddress: `${store.addressLine1}, ${city}, AZ ${store.postCode}`, city, stateCode: 'AZ', postalCode: store.postCode, zip: store.postCode,
    lat: store.location?.latitude || null, lng: store.location?.longitude || null,
    quantity: 0, quantityIsExact: false, price, availabilityStatus: 'in_stock', availabilityLabel: 'Retailer reports available at this store',
    sourceAvailabilityVerified: true, observedAt, canAlertAsInventory: true, canAlertAsWatch: true,
    inventorySemantics: 'Smart & Final selected-store pickup page reports availability and a positive stock status. Exact shelf quantity is not published; verify before driving.',
    evidence: `Smart & Final #${id} reports Buffalo Trace 750 ml available at ${store.addressLine1}, ${city}.`,
    raw: { chain: 'smart-final', merchantId: id, product: { id: SKU, sku: SKU, name: p.name, available: p.available, stockStatus: p.attributes.StockStatus, sizeMl: 750 },
      selectedStore: { id: active.id, retailerStoreId: id, address: store.addressLine1, city: store.city, zip: store.postCode }, shoppingMode: 'pickup' },
  }];
}

export async function collectArizonaSmartFinal(config, bible, observedAt, { fetchText, sleep = async ms => new Promise(r => setTimeout(r, ms)), signal } = {}) {
  const signals = [], roadblocks = [], requests = [];
  const request = async url => {
    signal?.throwIfAborted();
    let result;
    try { result = await fetchText(url, { timeoutMs: 6_000, signal, headers: { accept: 'text/html' } }); }
    catch (error) { signal?.throwIfAborted(); result = { ok: false, status: 0, error: error.message }; }
    requests.push({ url, status: result.status || 0 });
    return result;
  };
  const discovery = await request(ARIZONA_SMART_FINAL_SOURCE.baseUrl);
  if (!discovery.ok) return { signals, roadblocks: [{ state: 'AZ', source: ARIZONA_SMART_FINAL_SOURCE.sourceLabel, status: discovery.status, url: ARIZONA_SMART_FINAL_SOURCE.baseUrl, error: 'Retailer store discovery failed.' }], metadata: { requests } };
  const state = smartFinalEmbeddedState(discovery.text);
  const candidates = state?.stores?.availablePlanningStores?.items;
  const stores = (Array.isArray(candidates) ? candidates : []).filter(knownStore);
  for (const store of stores.filter(s => s.shoppingModes?.includes('pickup')).slice(0, 7)) {
    await sleep(1200);
    const url = `https://www.smartandfinal.com/sm/pickup/rsid/${store.retailerStoreId}/product/${slug}`;
    const result = await request(url);
    if ([401, 403, 429, 435].includes(result.status)) {
      roadblocks.push({ state: 'AZ', source: ARIZONA_SMART_FINAL_SOURCE.sourceLabel, url, status: result.status, error: 'Retailer denied the selected-store request; remaining requests stopped.' });
      break;
    }
    if (!result.ok) { roadblocks.push({ state: 'AZ', source: ARIZONA_SMART_FINAL_SOURCE.sourceLabel, url, status: result.status, error: 'Selected-store product request failed.' }); continue; }
    signals.push(...parseArizonaSmartFinalInventory(smartFinalEmbeddedState(result.text), store, bible, { observedAt, sourceUrl: url }));
  }
  if (!signals.length) roadblocks.push({ state: 'AZ', source: ARIZONA_SMART_FINAL_SOURCE.sourceLabel, status: 'reachable_no_safe_inventory_rows', error: 'No bound positive selected-store inventory was returned.' });
  return { signals, roadblocks, metadata: { discoveredStores: stores.map(s => ({ storeId: `smart-final:${s.retailerStoreId}`, address: s.addressLine1, city: s.city, zip: s.postCode })), requests } };
}
