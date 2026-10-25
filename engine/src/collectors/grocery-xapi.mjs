import { parseNevadaAlbertsonsXapi } from './nevada-retailer-surfaces.mjs';
import { reviewedArizonaXapiBottleMatch } from './arizona-xapi-matching.mjs';

// Pure collection preparation: no registry, network, clock, cache or publication.
const STATES = new Set(['NV', 'CA', 'AZ']);
function isoTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value;
}
function decimalVolume(value) {
  if (typeof value === 'string' && /^[0-9]+(?:\.[0-9]+)?$/.test(value)) return Number(value);
  return typeof value === 'number' && Number.isFinite(value) ? value : NaN;
}
export function validGroceryXapiSource(source) {
  const p = source?.premise;
  return STATES.has(source?.state) && p?.state === source.state
    && typeof source.merchantId === 'string' && /^\d{2,6}$/.test(source.merchantId)
    && ['albertsons', 'safeway', 'vons'].includes(source.banner)
    && source.host === `www.${source.banner}.com`
    && p.storeId === `${source.banner}:${source.merchantId}`
    && ['name', 'address', 'city'].every(key => typeof p[key] === 'string' && p[key].trim())
    && typeof p.zip === 'string' && /^\d{5}$/.test(p.zip);
}

export function groceryXapiRequest(source, requestId) {
  if (!validGroceryXapiSource(source) || !Number.isSafeInteger(requestId) || requestId < 0) throw new TypeError('Invalid XAPI configuration');
  const host = `https://${source.host}`;
  const params = new URLSearchParams({ 'request-id': String(requestId), url: host, pageurl: host,
    pagename: 'search', rows: '100', start: '0', 'search-type': 'keyword', storeid: source.merchantId,
    featured: 'true', 'search-uid': '', q: 'bourbon', channel: 'instore', banner: source.banner });
  return { url: `${host}/abs/pub/xapi/search/substitute?${params}`, maxPages: 1, retries: 0 };
}

// Hooks must explicitly admit both the frozen source and each canonical candidate.
// Output remains candidates; normal signal mapping and public policy are caller-owned.
export function collectGroceryXapiCapture({ source, payload, bible, observedAt, policies = {} }) {
  if (!validGroceryXapiSource(source) || !isoTimestamp(observedAt)) return [];
  const policy = policies[source.state];
  if (typeof policy?.admitSource !== 'function' || typeof policy?.admitBottle !== 'function'
    || policy.admitSource(source) !== true) return [];
  const products = payload?.response?.docs;
  if (!Array.isArray(products)) return [];
  const representations = new Map(), conflicts = new Set();
  for (const product of products) {
    const id = String(product?.id || product?.pid || product?.upc || '');
    if (!id) continue;
    const representation = JSON.stringify(product);
    if (representations.has(id) && representations.get(id) !== representation) conflicts.add(id);
    else representations.set(id, representation);
  }
  const candidates = [], seen = new Set();
  for (const product of products) {
    // Per-object guard avoids a duplicate SKU borrowing another object's valid stock.
    const [inventory] = parseNevadaAlbertsonsXapi({ response: { docs: [product] } }, { merchantId: source.merchantId });
    if (!inventory || conflicts.has(inventory.productId) || seen.has(inventory.productId)) continue;
    // Captured cohort is single bottles; unsupported packaging is never inferred.
    const volumeMl = decimalVolume(product.dispItemSizeQty);
    if (product.containsAlcohol !== true || ![1, '1'].includes(product.dispItemPackageQty)
      || !Number.isFinite(volumeMl) || volumeMl < 375 || volumeMl > 1750
      || String(product.dispUnitOfMeasure).toLowerCase() !== 'ml'
      || String(product.unitOfMeasure).toLowerCase() !== 'ml') continue;
    const namedVolumes = [...String(product.name || '').matchAll(/\b(\d+(?:\.\d+)?)\s*(ml|l)\b/ig)]
      .map(match => Number(match[1]) * (match[2].toLowerCase() === 'l' ? 1000 : 1));
    if (namedVolumes.some(value => value !== volumeMl)) continue;
    const { record, match } = reviewedArizonaXapiBottleMatch(product, bible, { storeId: source.merchantId });
    if (!record || policy.admitBottle(record, source, product) !== true) continue;
    seen.add(inventory.productId);
    candidates.push({ ...inventory, state: source.state, merchantId: source.merchantId,
      storeId: source.premise.storeId, canonicalBottleId: record.id, canonicalName: record.canonical,
      matchMethod: match?.method, record, match, product, volumeMl, packageCount: 1, observedAt,
      sourceUrl: `https://${source.host}/shop/product-details.${inventory.productId}.html` });
  }
  return candidates;
}

// Caller supplies bounded transport (size/time/redirect limits and credentials).
// No default transport: importing or testing cannot trigger a request.
export async function collectGroceryXapiSources({ sources, bible, policies, fetchText, pace, clock, serialize, signal }) {
  if (![fetchText, pace, clock, serialize].every(fn => typeof fn === 'function')) throw new TypeError('Explicit collection dependencies required');
  if (!Array.isArray(sources) || sources.length > 6) throw new TypeError('At most six sources required');
  const admittedSources = structuredClone(sources);
  for (const source of admittedSources) { if (source?.premise) Object.freeze(source.premise); Object.freeze(source); }
  Object.freeze(admittedSources);
  signal?.throwIfAborted();
  const signals = [], outcomes = [];
  const seen = new Set();
  for (const source of admittedSources) {
    if (!validGroceryXapiSource(source) || seen.has(`${source.state}:${source.premise.storeId}`)
      || typeof policies?.[source.state]?.admitBottle !== 'function'
      || policies?.[source.state]?.admitSource?.(source) !== true) throw new TypeError('Unadmitted or duplicate source');
    seen.add(`${source.state}:${source.premise.storeId}`);
  }
  for (const source of admittedSources) {
    signal?.throwIfAborted();
    const request = groceryXapiRequest(source, clock());
    let response;
    try { response = await fetchText(request.url, { maxBytes: 2097152, timeoutMs: 12000, maxRedirects: 0, retries: 0, signal }); }
    catch { signal?.throwIfAborted(); outcomes.push({ storeId: source.premise.storeId, status: 'transport_error' }); break; }
    signal?.throwIfAborted();
    outcomes.push({ storeId: source.premise.storeId, status: response.status });
    // A denial stops the cohort; no alternate host, route, retry or egress.
    if ([401, 403, 429].includes(response.status)) break;
    if (response.ok && response.status === 200) {
      let payload;
      try { payload = JSON.parse(response.text); } catch { payload = null; }
      const observedAt = new Date(clock()).toISOString();
      for (const candidate of collectGroceryXapiCapture({ source, payload, bible, observedAt, policies })) {
        const signal = serialize(candidate, source);
        if (signal) signals.push(signal);
      }
    }
    await pace({ signal });
    signal?.throwIfAborted();
  }
  return { signals, outcomes };
}
