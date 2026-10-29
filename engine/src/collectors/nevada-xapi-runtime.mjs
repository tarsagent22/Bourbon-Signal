export { parseBoundGroceryXapiInventory as parseBoundNevadaXapiInventory } from './grocery-xapi-identity.mjs';

export const NEVADA_XAPI_RESOLVER_ZIPS = Object.freeze(['89101', '89501', '89701', '89048']);
export const NEVADA_XAPI_TERMS = Object.freeze(['bourbon', 'whiskey']);
export function nevadaRetailerCohortKey(sources) {
  return JSON.stringify(['strict-xapi-metadata-v2', ...sources.filter(source=>source.inventoryEligible)
    .map(source=>[source.id,source.platform,source.merchantId,source.store.id,source.store.address,source.store.lat??null,source.store.lng??null])]);
}
export function nevadaRetailerCacheMatchesCohort(cache, sources) {
  return cache?.cohortKey===nevadaRetailerCohortKey(sources);
}
const normalized = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// A source configuration is a candidate, never evidence that a premise exists.
export function nevadaXapiPremiseMatches(source, store) {
  const address = store?.address;
  return source?.platform === 'albertsons-xapi' && String(store?.locationId) === source.merchantId
    && normalized(store?.polarisBannerName) === source.banner
    && normalized(store?.domainName) === source.banner
    && address?.state === 'NV' && address?.country === 'US'
    && normalized(`${address.line1}, ${address.city}, NV ${address.zipcode}`) === normalized(source.store.address);
}

export async function resolveNevadaXapiPremises(sources, { request, pause = async () => {} }) {
  const stores = new Map();
  const conflicts = new Set();
  for (const zip of NEVADA_XAPI_RESOLVER_ZIPS) {
    const url = `https://www.safeway.com/abs/pub/xapi/storeresolver/v2/all?zipcode=${zip}&radius=50&size=100`;
    const result = await request(url, 'resolver');
    if (!result) break;
    if (result.ok || result.status === 206) {
      let payload; try { payload = JSON.parse(result.text); } catch { continue; }
      for (const store of Array.isArray(payload?.instore?.stores) ? payload.instore.stores : []) {
        const id = String(store?.locationId || '');
        if (!id || conflicts.has(id)) continue;
        const identity = JSON.stringify([store.polarisBannerName, store.domainName, store.address]);
        if (stores.has(id) && stores.get(id).identity !== identity) { stores.delete(id); conflicts.add(id); }
        else stores.set(id, { identity, store });
      }
    }
    await pause();
  }
  return new Map(sources.filter(source => nevadaXapiPremiseMatches(source, stores.get(source.merchantId)?.store))
    .map(source => [source.id, stores.get(source.merchantId).store]));
}
