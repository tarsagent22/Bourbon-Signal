import { parseCityHiveProducts } from './cityhive-surfaces.mjs';

export const MA_JULIOS_SOURCE = Object.freeze({
  id: 'julios-westborough', platform: 'cityhive', merchantId: '5defe30f3916d12203336bcf',
  baseUrl: 'https://juliosliquors.com', hostname: 'juliosliquors.com',
  categoryUrl: 'https://juliosliquors.com/shop/?subtype=whiskey',
  address: '140 Turnpike Road, Westborough, MA 01581, USA',
  storeId: 'ma-julios-westborough', storeName: "Julio's Liquors", city: 'Westborough',
  county: 'Worcester', state: 'MA', lat: 42.2844027, lng: -71.609948,
});

export const MA_JULIOS_PROBE_URLS = Object.freeze(['Elijah Craig', 'Wild Turkey'].map(brand => {
  const url = new URL(MA_JULIOS_SOURCE.categoryUrl);
  url.searchParams.set('merchant-id', MA_JULIOS_SOURCE.merchantId);
  url.searchParams.set('brands', brand);
  return url.href;
}));

const EXCLUDED = /\b(?:cream|liqueur|cordial|cocktail|honey|apple|pineapple|peach|scotch|nip|nips|50ml|50\s*ml|pack|bundle|gift|pre[ -]?order|back[ -]?order)\b/i;

// Keep the shared merchant/premises/product/variant/pickup proof and add stricter
// option-level preorder and fulfillment checks for this reviewed merchant.
export function parseMassachusettsJulios(html) {
  if (typeof html !== 'string' || Buffer.byteLength(html) > 2_000_000) return [];
  const allowed = new Map();
  let visited = 0;
  function walk(value) {
    if (++visited > 25_000 || !value || typeof value !== 'object') return;
    if (Array.isArray(value.products)) {
      for (const product of value.products) for (const merchant of product.merchants || []) {
        if (merchant.merchant_id !== MA_JULIOS_SOURCE.merchantId) continue;
        for (const option of merchant.product_options || []) {
          const key = `${option.product_id || product.id}:${option.option_id}`;
          const offers = option.allowed_offer_types;
          const safe = Object.hasOwn(option, 'preorder_details') && option.preorder_details === null
            && Object.hasOwn(option, 'allowed_offer_types')
            && (offers === null || Array.isArray(offers) && offers.includes('pick_up'))
            && !/\b(?:pre[ -]?order|back[ -]?order)\b/i.test(JSON.stringify([
              product.name, option.store_specific_description, option.description,
            ]));
          allowed.set(key, allowed.get(key) !== false && safe);
        }
      }
    }
    for (const child of Object.values(value)) if (child && typeof child === 'object') walk(child);
  }
  for (const match of html.matchAll(/decodeURIComponent\(\s*(["'`])([\s\S]*?)\1\s*\)/g)) {
    try { walk(JSON.parse(decodeURIComponent(match[2]))); } catch { /* no executable source */ }
  }
  return parseCityHiveProducts(html, MA_JULIOS_SOURCE, {
    sources: [MA_JULIOS_SOURCE],
  }).filter(row => !EXCLUDED.test(row.title) && allowed.get(`${row.productId}:${row.variantId}`) === true
    && Number.isFinite(row.price) && row.price > 0);
}
