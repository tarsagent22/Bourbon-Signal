const PLATFORM_FINGERPRINTS = [
  ['shopify', /(?:cdn\.shopify(?:cdn)?\.com|shopify(?:\.com|_))/i],
  ['cityhive', /(?:cityhive|sites\.cityhive\.app)/i],
  ['woocommerce', /(?:wp-json\/wc|woocommerce)/i],
  ['square', /(?:square\.site|squareup\.com|square-online)/i],
  ['lightspeed', /(?:lightspeedhq|lightspeed(?: commerce)?)/i],
  ['bottlecapps', /bottlecapps/i],
  ['bottlepos', /bottlepos/i],
  ['grabbl', /grabbl/i],
  ['pos360_remix', /(?:pos360|remix)/i],
  ['official_source', /(?:alcohol(?:ic)? beverage control|liquor control|liquor enforcement|control board|state (?:of )?.{0,40}(?:liquor|spirits)|\.gov\b)/i],
];

export const PLATFORM_ADAPTERS = Object.freeze({
  shopify: { id: 'shopify', publicProbePaths: ['/products.json?limit=50', '/collections/bourbon/products.json?limit=50'] },
  cityhive: { id: 'cityhive', publicProbePaths: ['/shop/?subtype=bourbon', '/accessibility'] },
  woocommerce: { id: 'woocommerce', publicProbePaths: ['/wp-json/wc/store/v1/products?search=bourbon&per_page=20'] },
  square: { id: 'square', publicProbePaths: [] },
  lightspeed: { id: 'lightspeed', publicProbePaths: [] },
  bottlecapps: { id: 'bottlecapps', publicProbePaths: [] },
  bottlepos: { id: 'bottlepos', publicProbePaths: [] },
  grabbl: { id: 'grabbl', publicProbePaths: [] },
  pos360_remix: { id: 'pos360_remix', publicProbePaths: [] },
  official_source: { id: 'official_source', publicProbePaths: [] },
});

export function detectPlatformFingerprints(value) {
  const text = Array.isArray(value) ? value.join('\n') : String(value || '');
  return PLATFORM_FINGERPRINTS.filter(([, pattern]) => pattern.test(text)).map(([id]) => id);
}

export function fingerprintSource({ url = '', title = '', description = '' } = {}) {
  return detectPlatformFingerprints(`${url}\n${title}\n${description}`);
}

export function adaptersForFingerprintIds(ids) {
  return (ids || []).map((id) => PLATFORM_ADAPTERS[id]).filter(Boolean);
}
