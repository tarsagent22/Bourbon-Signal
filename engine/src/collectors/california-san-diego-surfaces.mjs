const BOURBON_NAME_RE = /\b(?:bourbon|kentucky straight|american whiskey|blanton(?:'s|s)?|buffalo trace|eagle rare|e\.?\s*h\.?\s*taylor|weller|stagg|booker(?:'s|s)?|baker(?:'s|s)?|1792|maker(?:'s|s)? mark|old forester|woodford reserve|four roses|knob creek|elijah craig|michter(?:'s|s)?|willett|wild turkey|rare breed|larceny|heaven hill|henry mckenna|old fitzgerald)\b/i;
const UNSAFE_FORMAT_RE = /\b(?:gift\s*(?:set|box)|bundle|sampler|miniatures?|variety\s*pack|multi\s*-?\s*pack|cocktail|liqueur|ready\s*to\s*drink|rtd|\d+\s*-?\s*(?:pk|pack)|pack\s+of\s+\d+|\d+\s*[- ]?bottles?)\b/i;
const SIZE_RE = /(?:^|\b)(\d+(?:\.\d+)?)\s*(ml|millilit(?:er|re)s?|l|lit(?:er|re)s?)\b/ig;

export const CALIFORNIA_SAN_DIEGO_SHOPIFY_SOURCES = Object.freeze([
  Object.freeze({
    id: 'del-mesa-liquor',
    chainName: 'Del Mesa Liquor',
    sourceLabel: 'Del Mesa Liquor Shopify San Diego orderability with pickup policy',
    host: 'www.delmesaliquor.com',
    productsUrl: 'https://www.delmesaliquor.com/products.json?limit=250',
    merchantId: 'del-mesa-liquor-shopify',
    inventoryEligible: true,
    maxPages: 3,
    fulfillmentPolicyUrl: 'https://www.delmesaliquor.com/pages/customer-service',
    fulfillmentEvidencePatterns: Object.freeze([/in-store\s+collection\s+available/i]),
    store: Object.freeze({
      id: 'del-mesa-liquor:6090-friars',
      name: 'Del Mesa Liquor',
      address: '6090 Friars Road, San Diego, CA 92108-1002',
      city: 'San Diego',
      stateCode: 'CA',
      zip: '92108-1002',
    }),
  }),
  Object.freeze({
    id: 'mission-trails-wine-spirits',
    chainName: 'Mission Trails Wine & Spirits',
    sourceLabel: 'Mission Trails Wine & Spirits Shopify San Diego orderability with pickup policy',
    host: 'missiontrailswineandspirits.com',
    productsUrl: 'https://missiontrailswineandspirits.com/products.json?limit=250',
    merchantId: 'mission-trails-wine-spirits-shopify',
    inventoryEligible: true,
    maxPages: 3,
    fulfillmentPolicyUrl: 'https://missiontrailswineandspirits.com/',
    fulfillmentEvidencePatterns: Object.freeze([/free\s+in\s+store\s+pickup/i, /reserve\s+your\s+order\s+for\s+pickup/i]),
    store: Object.freeze({
      id: 'mission-trails-wine-spirits:8181-mission-gorge',
      name: 'Mission Trails Wine & Spirits',
      address: '8181 Mission Gorge Rd, Ste A, San Diego, CA 92120',
      city: 'San Diego',
      stateCode: 'CA',
      zip: '92120',
    }),
  }),
  Object.freeze({
    id: 'chips-liquor',
    chainName: 'Chips Liquor',
    sourceLabel: 'Chips Liquor Shopify online catalog watch',
    host: 'chipsliquor.com',
    productsUrl: 'https://chipsliquor.com/products.json?limit=250',
    merchantId: 'chips-liquor-shopify',
    inventoryEligible: false,
    maxPages: 1,
    fulfillmentPolicyUrl: null,
    fulfillmentEvidencePatterns: Object.freeze([]),
    store: Object.freeze({
      id: 'chips-liquor:1926-garnet',
      name: 'Chips Liquor',
      address: '1926 Garnet Ave, San Diego, CA 92109',
      city: 'San Diego',
      stateCode: 'CA',
      zip: '92109',
    }),
  }),
]);

function parsePayload(payload) {
  if (typeof payload === 'string') {
    try { return JSON.parse(payload); } catch { return null; }
  }
  return payload && typeof payload === 'object' ? payload : null;
}

function finitePrice(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function usefulSize(text) {
  const values = [];
  for (const match of String(text || '').matchAll(SIZE_RE)) {
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) continue;
    values.push(/^l/i.test(match[2]) ? amount * 1000 : amount);
  }
  return values.length === 0 || values.every((ml) => ml > 375);
}

function normalizedTags(value) {
  if (Array.isArray(value)) return value.map(String).join(' ');
  return String(value || '');
}

export function verifyCaliforniaFulfillmentPolicy(source, html) {
  if (!source?.inventoryEligible || typeof html !== 'string' || !html.trim()) return false;
  let url;
  try { url = new URL(source.fulfillmentPolicyUrl); } catch { return false; }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== String(source.host || '').toLowerCase()) return false;
  const patterns = Array.isArray(source.fulfillmentEvidencePatterns) ? source.fulfillmentEvidencePatterns : [];
  return patterns.length > 0 && patterns.every((pattern) => pattern instanceof RegExp && pattern.test(html));
}

export function parseCaliforniaShopifyProducts(payload) {
  const parsed = parsePayload(payload);
  if (!Array.isArray(parsed?.products)) return [];
  const rows = [];
  for (const product of parsed.products) {
    if (!product || typeof product !== 'object' || !Array.isArray(product.variants)) continue;
    const title = String(product.title || '').trim();
    const productText = [title, product.handle, product.product_type, normalizedTags(product.tags)].join(' ');
    if (!title || !BOURBON_NAME_RE.test(productText) || UNSAFE_FORMAT_RE.test(productText)) continue;
    for (const variant of product.variants) {
      if (!variant || typeof variant !== 'object' || variant.available !== true) continue;
      const size = String(variant.title || '').trim() || 'Default Title';
      if (!usefulSize(`${productText} ${size}`) || UNSAFE_FORMAT_RE.test(`${productText} ${size}`)) continue;
      const productId = String(product.id || '').trim();
      const variantId = String(variant.id || '').trim();
      if (!productId || !variantId) continue;
      rows.push({
        productId,
        variantId,
        title,
        handle: String(product.handle || '').trim(),
        productType: String(product.product_type || '').trim(),
        tags: normalizedTags(product.tags),
        size,
        sku: String(variant.sku || '').trim() || null,
        price: finitePrice(variant.price),
        quantity: 0,
        sourceAvailabilityVerified: true,
        inventorySemantics: 'binary_retailer_orderable_no_exact_count',
      });
    }
  }
  return rows;
}

export function mergeCaliforniaSourceCacheSignals(liveSignals, cachedSignals, completedSourceIds = new Set()) {
  const merged = [];
  const seen = new Set();
  for (const signal of Array.isArray(liveSignals) ? liveSignals : []) {
    if (!signal?.id || seen.has(signal.id)) continue;
    seen.add(signal.id);
    merged.push(signal);
  }
  for (const signal of Array.isArray(cachedSignals) ? cachedSignals : []) {
    if (!signal?.id || seen.has(signal.id) || completedSourceIds.has(String(signal.sourceChain || ''))) continue;
    seen.add(signal.id);
    merged.push(signal);
  }
  return merged;
}

export function filterFreshCaliforniaSignals(signals, nowMs = Date.now(), maxAgeMs) {
  if (!Array.isArray(signals) || !Number.isFinite(nowMs) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) return [];
  return signals.filter((signal) => {
    const observedMs = Date.parse(signal?.observedAt || '');
    const ageMs = nowMs - observedMs;
    return Number.isFinite(observedMs) && ageMs >= 0 && ageMs <= maxAgeMs;
  });
}
