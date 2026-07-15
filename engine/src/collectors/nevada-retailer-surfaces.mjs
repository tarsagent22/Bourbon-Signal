const BOURBON_NAME_RE = /\b(?:bourbon|kentucky straight|american whiskey|blanton(?:'s|s)?|buffalo trace|eagle rare|e\.?\s*h\.?\s*taylor|weller|stagg|booker(?:'s|s)?|baker(?:'s|s)?|1792|maker(?:'s|s)? mark|old forester|woodford reserve|four roses|knob creek|elijah craig|michter(?:'s|s)?|willett|wild turkey|rare breed|larceny|heaven hill|henry mckenna|old fitzgerald|smoke wagon|casey jones|new riff|bardstown bourbon|green river|yellowstone)\b/i;
const UNSAFE_FORMAT_RE = /\b(?:gift\s*(?:set|box)|bundle|sampler|miniatures?|variety\s*pack|multi\s*-?\s*pack|cocktail|liqueur|ready\s*to\s*drink|rtd|\d+\s*-?\s*(?:pk|pack)|pack\s+of\s+\d+|\d+\s*[- ]?bottles?)\b/i;
const SIZE_RE = /(?:^|\b)(\d+(?:\.\d+)?)\s*(ml|millilit(?:er|re)s?|l|lit(?:er|re)s?)\b/ig;

export const NEVADA_RETAILER_SOURCES = Object.freeze([
  Object.freeze({
    id: 'liquor-world-las-vegas',
    chainName: 'Liquor World',
    sourceLabel: 'Liquor World CityHive Las Vegas store orderability',
    platform: 'cityhive',
    host: 'liquorworldlv.com',
    productsUrl: 'https://liquorworldlv.com/shop/?subtype=Bourbon',
    fulfillmentPolicyUrl: 'https://liquorworldlv.com/shop/?subtype=Bourbon',
    merchantId: '6019c2d6c8cccb3876fb022c',
    inventoryEligible: true,
    store: Object.freeze({ id: 'liquor-world:4795-dean-martin', name: 'Liquor World', address: '4795 Dean Martin Drive, Las Vegas, NV 89103', city: 'Las Vegas', area: 'Las Vegas Valley', stateCode: 'NV', zip: '89103' }),
  }),
  Object.freeze({
    id: 'liquor-lineup-north-las-vegas',
    chainName: 'Liquor Lineup',
    sourceLabel: 'Liquor Lineup Shopify Nevada catalog watch',
    platform: 'shopify',
    host: 'liquorlineup.com',
    productsUrl: 'https://liquorlineup.com/products.json?limit=250',
    fulfillmentPolicyUrl: 'https://liquorlineup.com/',
    fulfillmentEvidencePatterns: Object.freeze([/Las\s+Vegas\s+Area\s+Delivery\s+or\s+In-Store\s+Pickup/i]),
    merchantId: '887',
    inventoryEligible: false,
    store: Object.freeze({ id: 'liquor-lineup:6462-losee', name: 'Liquor Lineup', address: '6462 Losee Rd, North Las Vegas, NV 89030', city: 'North Las Vegas', area: 'Las Vegas Valley', stateCode: 'NV', zip: '89030' }),
  }),
  Object.freeze({
    id: 'liquor-box-las-vegas',
    chainName: 'Liquor Box',
    sourceLabel: 'Liquor Box POS360 Las Vegas pickup orderability',
    platform: 'pos360',
    host: 'theliquorboxlv.com',
    productsUrl: 'https://theliquorboxlv.com/collections/1000-plus-whiskey-varieties',
    fulfillmentPolicyUrl: 'https://theliquorboxlv.com/',
    fulfillmentEvidencePatterns: Object.freeze([/in-store\s+pickup/i, /7161\s+N\s+Hualapai\s+Way/i]),
    merchantId: 'liquorboxlv',
    inventoryEligible: true,
    maxPages: 19,
    store: Object.freeze({ id: 'liquor-box:7161-hualapai', name: 'Liquor Box', address: '7161 N Hualapai Way, Las Vegas, NV 89166', city: 'Las Vegas', area: 'Las Vegas Valley', stateCode: 'NV', zip: '89166' }),
  }),
  Object.freeze({
    id: 'crystal-liquor-las-vegas',
    chainName: 'Crystal Liquor',
    sourceLabel: 'Crystal Liquor WooCommerce Nevada catalog watch',
    platform: 'woocommerce',
    host: 'crystalliquor.com',
    productsUrl: 'https://crystalliquor.com/wp-json/wc/store/v1/products?search=bourbon&per_page=100',
    fulfillmentPolicyUrl: 'https://crystalliquor.com/',
    merchantId: '0cb70604-4fb0-46e9-8d69-a87ef0',
    inventoryEligible: false,
    store: Object.freeze({ id: 'crystal-liquor:3655-s-durango', name: 'Crystal Liquor', address: '3655 S Durango Dr, Suite 21, Las Vegas, NV 89147', city: 'Las Vegas', area: 'Las Vegas Valley', stateCode: 'NV', zip: '89147' }),
  }),
  Object.freeze({
    id: 'albertsons-las-vegas-662', chainName: 'Albertsons', sourceLabel: 'Albertsons Nevada XAPI store inventory', platform: 'albertsons-xapi', banner: 'albertsons',
    host: 'www.albertsons.com', productsUrl: 'https://www.albertsons.com/abs/pub/xapi/search/substitute', fulfillmentPolicyUrl: 'https://local.albertsons.com/nv/las-vegas/2885-e-desert-inn-rd/Beer-Wine-Liquor.html',
    merchantId: '662', inventoryEligible: true,
    store: Object.freeze({ id: 'albertsons:662', name: 'Albertsons #662', address: '2885 E Desert Inn Rd, Las Vegas, NV 89121', city: 'Las Vegas', area: 'Las Vegas Valley', stateCode: 'NV', zip: '89121' }),
  }),
  Object.freeze({
    id: 'vons-henderson-2511', chainName: 'Vons', sourceLabel: 'Vons Nevada XAPI store inventory', platform: 'albertsons-xapi', banner: 'vons',
    host: 'www.vons.com', productsUrl: 'https://www.vons.com/abs/pub/xapi/search/substitute', fulfillmentPolicyUrl: 'https://local.vons.com/nv/henderson/2667-e-windmill-pkwy/Beer-Wine-Liquor.html',
    merchantId: '2511', inventoryEligible: true,
    store: Object.freeze({ id: 'vons:2511', name: 'Vons #2511 Anthem Village', address: '2667 E Windmill Pkwy, Henderson, NV 89052', city: 'Henderson', area: 'Las Vegas Valley', stateCode: 'NV', zip: '89052' }),
  }),
  Object.freeze({
    id: 'safeway-reno-1210', chainName: 'Safeway', sourceLabel: 'Safeway Nevada XAPI store inventory', platform: 'albertsons-xapi', banner: 'safeway',
    host: 'www.safeway.com', productsUrl: 'https://www.safeway.com/abs/pub/xapi/search/substitute', fulfillmentPolicyUrl: 'https://local.safeway.com/safeway/nv/reno/5150-mae-anne-ave/Beer-Wine-Liquor.html',
    merchantId: '1210', inventoryEligible: true,
    store: Object.freeze({ id: 'safeway:1210', name: 'Safeway #1210', address: '5150 Mae Anne Ave, Reno, NV 89523', city: 'Reno', area: 'Reno–Sparks', stateCode: 'NV', zip: '89523' }),
  }),
]);

function parsePayload(payload) {
  if (typeof payload === 'string') {
    try { return JSON.parse(payload); } catch { return null; }
  }
  return payload && typeof payload === 'object' ? payload : null;
}

function normalizedText(value) {
  if (Array.isArray(value)) return value.map(normalizedText).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(normalizedText).join(' ');
  return String(value || '');
}

function finitePrice(value, divisor = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed / divisor : null;
}

function sizeValues(text) {
  const values = [];
  for (const match of String(text || '').matchAll(SIZE_RE)) {
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) continue;
    values.push(/^l/i.test(match[2]) ? amount * 1000 : amount);
  }
  return values;
}

function usefulBottle(text, explicitSize = null, explicitUnit = null, packSize = null, containerType = null) {
  const normalized = String(text || '');
  if (!BOURBON_NAME_RE.test(normalized) || UNSAFE_FORMAT_RE.test(normalized)) return false;
  const sizes = sizeValues(normalized);
  if (explicitSize != null && explicitSize !== '' && Number.isFinite(Number(explicitSize))) {
    const ml = /^l/i.test(String(explicitUnit || '')) ? Number(explicitSize) * 1000 : Number(explicitSize);
    sizes.push(ml);
  }
  if (sizes.some((ml) => ml <= 375)) return false;
  if (packSize != null && Number(packSize) !== 1) return false;
  if (containerType && !/^bottle$/i.test(String(containerType))) return false;
  return true;
}

export function verifyNevadaFulfillmentPolicy(source, html) {
  if (!source?.inventoryEligible || typeof html !== 'string' || !html.trim()) return false;
  let url;
  try { url = new URL(source.fulfillmentPolicyUrl); } catch { return false; }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== String(source.host || '').toLowerCase()) return false;
  const patterns = Array.isArray(source.fulfillmentEvidencePatterns) ? source.fulfillmentEvidencePatterns : [];
  return patterns.length > 0 && patterns.every((pattern) => pattern instanceof RegExp && pattern.test(html));
}

export function parseNevadaShopifyProducts(payload) {
  const parsed = parsePayload(payload);
  if (!Array.isArray(parsed?.products)) return [];
  const rows = [];
  for (const product of parsed.products) {
    if (!product || typeof product !== 'object' || !Array.isArray(product.variants)) continue;
    const title = String(product.title || '').trim();
    const productText = [title, product.handle, product.product_type, normalizedText(product.tags), product.body_html].join(' ');
    if (!usefulBottle(productText)) continue;
    for (const variant of product.variants) {
      if (!variant || typeof variant !== 'object' || variant.available !== true) continue;
      const size = String(variant.title || '').trim() || 'Default Title';
      if (!usefulBottle(`${productText} ${size}`)) continue;
      const productId = String(product.id || '').trim();
      const variantId = String(variant.id || '').trim();
      if (!productId || !variantId) continue;
      rows.push({ productId, variantId, title, handle: String(product.handle || '').trim(), size, sku: String(variant.sku || '').trim() || null, price: finitePrice(variant.price), quantity: 0, sourceAvailabilityVerified: true, inventorySemantics: 'binary_retailer_orderable_no_exact_count' });
    }
  }
  return rows;
}

function cityHiveProducts(payload) {
  const parsed = parsePayload(payload);
  if (Array.isArray(parsed?.products)) return parsed.products;
  if (Array.isArray(parsed)) return parsed;
  return [];
}

export function parseNevadaCityHiveProducts(payload, { merchantId } = {}) {
  if (!String(merchantId || '').trim()) return [];
  const rows = [];
  for (const product of cityHiveProducts(payload)) {
    if (!product || typeof product !== 'object') continue;
    const title = String(product.name || product.title || '').trim();
    const productText = [title, product.basic_category, product.category, product.subcategory, product.size, product.description].join(' ');
    if (!usefulBottle(productText)) continue;
    const productId = String(product.id || product._id || product.productID || '').trim();
    if (!productId) continue;
    for (const option of Array.isArray(product.options) ? product.options : []) {
      const optionMerchant = String(option?.merchant_id || option?.merchantId || '').trim();
      const optionId = String(option?._id || option?.id || option?.option_id || '').trim();
      const reportedQuantity = Number(option?.quantity);
      if (!optionId || optionMerchant !== String(merchantId) || !Number.isFinite(reportedQuantity) || reportedQuantity <= 0) continue;
      const binarySentinel = reportedQuantity >= 100;
      rows.push({ productId, optionId, title, size: String(product.size || '').trim() || null, price: finitePrice(option.price), quantity: binarySentinel ? 0 : Math.floor(reportedQuantity), reportedQuantity, sourceAvailabilityVerified: true, inventorySemantics: binarySentinel ? 'binary_retailer_orderable_no_exact_count' : 'exact_retailer_quantity' });
    }
  }
  return rows;
}

function jsonLdObjects(html) {
  if (typeof html !== 'string') return [];
  const values = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/ig;
  for (const match of html.matchAll(re)) {
    try { values.push(JSON.parse(match[1])); } catch { /* reachable malformed structured data fails closed */ }
  }
  return values;
}

export function verifyNevadaCityHiveStorePage(source, html) {
  if (source?.platform !== 'cityhive' || !source?.inventoryEligible || typeof html !== 'string') return false;
  if (!html.includes(source.merchantId)) return false;
  for (const value of jsonLdObjects(html)) {
    if (value?.['@type'] !== 'LiquorStore') continue;
    const address = value.address || {};
    if (String(address.streetAddress || '').trim() !== '4795 Dean Martin Drive') continue;
    if (String(address.addressLocality || '').trim().toLowerCase() !== source.store.city.toLowerCase()) continue;
    if (String(address.addressRegion || '').trim().toUpperCase() !== 'NV') continue;
    if (String(address.postalCode || '').trim() !== source.store.zip) continue;
    if (!String(value.name || '').includes(source.chainName)) continue;
    return true;
  }
  return false;
}

export function parseNevadaCityHiveHtml(html) {
  const rows = [];
  for (const value of jsonLdObjects(html)) {
    if (value?.['@type'] !== 'ItemList' || !Array.isArray(value.itemListElement)) continue;
    for (const product of value.itemListElement) {
      if (!product || product['@type'] !== 'Product') continue;
      const title = String(product.name || '').replace(/&(?:#39|apos);/gi, "'").replace(/&amp;/gi, '&').trim();
      const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
      if (!offer || !/\bInStock$/i.test(String(offer.availability || '')) || !usefulBottle(`${title} ${product.description || ''}`)) continue;
      const optionId = String(product.productID || product.sku || '').trim();
      const url = String(product.url || offer.url || '').trim();
      if (!optionId || !url) continue;
      rows.push({ productId: optionId, optionId, variantId: optionId, title, handle: url, size: null, price: finitePrice(offer.price), quantity: 0, reportedQuantity: null, sourceAvailabilityVerified: true, inventorySemantics: 'binary_retailer_orderable_no_exact_count' });
    }
  }
  return rows;
}

function extractRemixContext(html) {
  if (typeof html !== 'string') return null;
  const marker = 'window.__remixContext = ';
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const payloadStart = start + marker.length;
  const candidates = [html.indexOf(';__remixContext.p', payloadStart), html.indexOf('</script>', payloadStart)].filter((value) => value > payloadStart);
  if (!candidates.length) return null;
  let raw = html.slice(payloadStart, Math.min(...candidates)).trim();
  if (raw.endsWith(';')) raw = raw.slice(0, -1);
  try { return JSON.parse(raw); } catch { return null; }
}

function embeddedPos360Products(root) {
  const products = [];
  const seen = new Set();
  const walk = (value) => {
    if (Array.isArray(value)) { for (const item of value) walk(item); return; }
    if (!value || typeof value !== 'object') return;
    if (value.defaultAvailableVariant && (value.id || value.slug)) {
      const key = String(value.id || value.slug);
      if (!seen.has(key)) { seen.add(key); products.push(value); }
    }
    for (const child of Object.values(value)) walk(child);
  };
  walk(root);
  return products;
}

export function parseNevadaPos360Html(html, { merchantId } = {}) {
  const context = extractRemixContext(html);
  if (!context || !String(merchantId || '').trim()) return [];
  const rows = [];
  for (const product of embeddedPos360Products(context)) {
    const variant = product.defaultAvailableVariant;
    if (!variant || typeof variant !== 'object') continue;
    const title = String(product.name || variant.displayName || variant.name || '').trim();
    const productText = [title, product.slug, normalizedText(product.category), product.description, variant.name, variant.displayName, variant.containerType].join(' ');
    const pickup = (Array.isArray(variant.fulfillmentOptions) ? variant.fulfillmentOptions : []).some((option) => String(option?.type || '').toUpperCase() === 'PICKUP' && option?.isAvailable === true);
    const storeId = String(variant?.store?.storeID || '').trim();
    if (!pickup || storeId !== String(merchantId) || !usefulBottle(productText, variant.size, variant.uom, variant.packSize, variant.containerType)) continue;
    const productId = String(product.id || '').trim();
    const variantId = String(variant.id || '').trim();
    if (!productId || !variantId) continue;
    rows.push({ productId, variantId, title, handle: String(product.slug || '').trim(), size: `${variant.size || ''}${variant.uom || ''}`.trim() || null, sku: String(variant.sku || '').trim() || null, price: finitePrice(variant?.price?.amount ?? variant.price), quantity: 0, sourceAvailabilityVerified: true, inventorySemantics: 'binary_retailer_orderable_no_exact_count' });
  }
  return rows;
}

export function parseNevadaWooCommerceProducts(payload) {
  const parsed = parsePayload(payload);
  const products = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.products) ? parsed.products : []);
  const rows = [];
  for (const product of products) {
    if (!product || typeof product !== 'object' || product.is_in_stock !== true || product.is_purchasable === false || String(product.type || 'simple') === 'grouped') continue;
    const title = String(product.name || '').trim();
    const text = [title, product.slug, normalizedText(product.categories), normalizedText(product.tags), normalizedText(product.attributes), product.short_description, product.description].join(' ');
    if (!usefulBottle(text)) continue;
    const productId = String(product.id || '').trim();
    if (!productId) continue;
    const minor = Number(product?.prices?.currency_minor_unit);
    rows.push({ productId, variantId: productId, title, handle: String(product.slug || '').trim(), size: normalizedText(product.attributes) || null, price: finitePrice(product?.prices?.price, Number.isFinite(minor) ? 10 ** minor : 1), quantity: 0, sourceAvailabilityVerified: true, inventorySemantics: 'binary_retailer_orderable_no_exact_count' });
  }
  return rows;
}

export function parseNevadaAlbertsonsXapi(payload) {
  const parsed = parsePayload(payload);
  if (!Array.isArray(parsed?.response?.docs)) return [];
  const rows = [];
  for (const product of parsed.response.docs) {
    if (!product || typeof product !== 'object') continue;
    const title = String(product.name || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!usefulBottle(`${title} ${product.size || ''} ${normalizedText(product.categories)}`)) continue;
    if (String(product?.restrictedValue || '').toLowerCase() === 'true' && product?.containsAlcohol === false) continue;
    const inventory = product.channelInventory || {};
    if (String(inventory.instore ?? inventory.inStore ?? '') !== '1') continue;
    const productId = String(product.id || product.pid || product.upc || '').trim();
    if (!productId) continue;
    const reportedQuantity = Number(inventory.instoreItemQty ?? inventory.inStoreItemQty);
    const exact = Number.isFinite(reportedQuantity) && reportedQuantity > 0 && reportedQuantity < 100;
    rows.push({ productId, variantId: String(product.pid || product.id || product.upc || '').trim(), title, handle: String(product.pid || product.id || product.upc || '').trim(), size: String(product.size || '').trim() || null, price: finitePrice(product.price), quantity: exact ? Math.floor(reportedQuantity) : 0, reportedQuantity: Number.isFinite(reportedQuantity) ? reportedQuantity : null, sourceAvailabilityVerified: true, inventorySemantics: exact ? 'exact_retailer_quantity' : 'binary_retailer_orderable_no_exact_count' });
  }
  return rows;
}

export function mergeNevadaSourceCacheSignals(liveSignals, cachedSignals, completedSourceIds = new Set()) {
  const merged = [];
  const seen = new Set();
  for (const signal of Array.isArray(liveSignals) ? liveSignals : []) {
    if (!signal?.id || seen.has(signal.id)) continue;
    seen.add(signal.id); merged.push(signal);
  }
  for (const signal of Array.isArray(cachedSignals) ? cachedSignals : []) {
    if (!signal?.id || seen.has(signal.id) || completedSourceIds.has(String(signal.sourceChain || ''))) continue;
    seen.add(signal.id); merged.push(signal);
  }
  return merged;
}

export function filterFreshNevadaSignals(signals, nowMs = Date.now(), maxAgeMs) {
  if (!Array.isArray(signals) || !Number.isFinite(nowMs) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) return [];
  return signals.filter((signal) => {
    const observedMs = Date.parse(signal?.observedAt || '');
    const ageMs = nowMs - observedMs;
    return Number.isFinite(observedMs) && ageMs >= 0 && ageMs <= maxAgeMs;
  });
}
