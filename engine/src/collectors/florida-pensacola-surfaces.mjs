import { stableId } from '../core/text.mjs';

function stores(rows) {
  return new Map(rows.map((store) => [store.id, Object.freeze({ ...store })]));
}

export const PENSACOLA_SHOPIFY_SOURCE = Object.freeze({
  id: 'pensacola-liquors',
  chainName: 'Pensacola Liquors',
  sourceLabel: 'Pensacola Liquors Shopify exact-store pickup inventory',
  hostname: 'www.pensacolaliquors.com',
  baseUrl: 'https://www.pensacolaliquors.com',
  collectionUrl: 'https://www.pensacolaliquors.com/collections/bourbon',
});

export const PENSACOLA_SHOPIFY_STORES = stores([
  {
    id: 'pensacola-liquors:pace-blvd',
    name: 'Cost Plus Liquors Pace Blvd',
    address: '1800 North Pace Boulevard, Pensacola, FL 32505',
    city: 'Pensacola',
    zip: '32505',
  },
  {
    id: 'pensacola-liquors:pelican',
    name: 'Pelican Liquors',
    address: '1420 W 9 Mile Rd, Pensacola, FL 32534',
    city: 'Pensacola',
    zip: '32534',
  },
]);

function decodeHtml(value) {
  return String(value || '')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;|&#160;/gi, ' ');
}

function plainText(value) {
  return decodeHtml(value)
    .replace(/<br\s*\/?\s*>/gi, ', ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .trim();
}

function identityKey(value) {
  return plainText(value)
    .replace(/\bflorida\b/gi, 'FL')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function firstTagText(block, className) {
  const match = String(block || '').match(new RegExp(`<[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i'));
  return plainText(match?.[1] || '');
}

function firstElementText(block, tagName) {
  const match = String(block || '').match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return plainText(match?.[1] || '');
}

export function pensacolaProductUrl(value) {
  try {
    const url = new URL(String(value || ''), PENSACOLA_SHOPIFY_SOURCE.baseUrl);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== PENSACOLA_SHOPIFY_SOURCE.hostname) return null;
    const match = url.pathname.match(/\/products\/([a-z0-9][a-z0-9-]*)\/?$/i);
    if (!match) return null;
    return new URL(`/products/${match[1]}`, PENSACOLA_SHOPIFY_SOURCE.baseUrl).href;
  } catch {
    return null;
  }
}

export function parsePensacolaShopifyCollectionLinks(html) {
  const links = [];
  const seen = new Set();
  for (const match of String(html || '').matchAll(/href\s*=\s*(["'])([\s\S]*?)\1/gi)) {
    const productUrl = pensacolaProductUrl(decodeHtml(match[2]));
    if (!productUrl || seen.has(productUrl)) continue;
    seen.add(productUrl);
    links.push(productUrl);
  }
  return links;
}

function jsonLdProducts(html) {
  const products = [];
  for (const match of String(html || '').matchAll(/<script\b[^>]*type\s*=\s*(["'])application\/ld\+json\1[^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed;
    try { parsed = JSON.parse(decodeHtml(match[2]).trim()); } catch { continue; }
    const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (queue.length) {
      const value = queue.shift();
      if (!value || typeof value !== 'object') continue;
      if (Array.isArray(value)) {
        queue.push(...value);
        continue;
      }
      if (value['@graph']) queue.push(value['@graph']);
      const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
      if (types.some((type) => String(type).toLowerCase() === 'product')) products.push(value);
    }
  }
  return products;
}

function productIdFromHtml(html) {
  for (const match of String(html || '').matchAll(/<input\b[^>]*>/gi)) {
    const tag = match[0];
    const name = tag.match(/\bname\s*=\s*(["'])(.*?)\1/i)?.[2];
    const value = tag.match(/\bvalue\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (name === 'product-id' && /^\d{6,}$/.test(String(value || ''))) return String(value);
  }
  return null;
}

function productOffers(product) {
  if (Array.isArray(product?.offers)) return product.offers;
  return product?.offers && typeof product.offers === 'object' ? [product.offers] : [];
}

export function pensacolaVariantPickupUrl(variantId) {
  if (!/^\d{6,}$/.test(String(variantId || ''))) return null;
  const url = new URL(`/variants/${variantId}/`, PENSACOLA_SHOPIFY_SOURCE.baseUrl);
  url.searchParams.set('section_id', 'pickup-availability');
  return url.href;
}

function variantIdFromPickupUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== PENSACOLA_SHOPIFY_SOURCE.hostname) return null;
    if (url.searchParams.get('section_id') !== 'pickup-availability') return null;
    return url.pathname.match(/^\/variants\/(\d{6,})\/$/)?.[1] || null;
  } catch {
    return null;
  }
}

export function parsePensacolaShopifyVariantPickup(html, sourceUrl, expectedVariantId) {
  if (variantIdFromPickupUrl(sourceUrl) !== String(expectedVariantId || '')) return [];
  const selected = [];
  const seen = new Set();
  const pattern = /<li\b[^>]*class=["'][^"']*\bpickup-availability-list__item\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;
  for (const match of String(html || '').matchAll(pattern)) {
    if (!/\bpickup\s+available\b/i.test(plainText(match[1]))) continue;
    const title = firstElementText(match[1], 'h4');
    const address = firstTagText(match[1], 'pickup-availability-address')
      .replace(/,?\s*United States$/i, '')
      .trim();
    const store = [...PENSACOLA_SHOPIFY_STORES.values()].find((candidate) => (
      identityKey(candidate.name) === identityKey(title)
      && identityKey(candidate.address) === identityKey(address)
    ));
    if (!store || seen.has(store.id)) continue;
    seen.add(store.id);
    selected.push(store);
  }
  return selected;
}

export function parsePensacolaShopifyProductPage(html, sourceUrl) {
  const canonicalSourceUrl = pensacolaProductUrl(sourceUrl);
  if (!canonicalSourceUrl) return null;
  const productId = productIdFromHtml(html);
  if (!productId) return null;
  for (const product of jsonLdProducts(html)) {
    const rawName = plainText(product?.name || '');
    if (!rawName) continue;
    for (const offer of productOffers(product)) {
      if (!/\bInStock$/i.test(String(offer?.availability || ''))) continue;
      const offerUrl = pensacolaProductUrl(offer?.url);
      if (offerUrl !== canonicalSourceUrl) continue;
      let variantId = null;
      try { variantId = new URL(String(offer.url)).searchParams.get('variant'); } catch {}
      if (!/^\d{6,}$/.test(String(variantId || ''))) continue;
      const priceValue = Number(offer?.price);
      return {
        rawName,
        productId,
        variantId: String(variantId),
        price: Number.isFinite(priceValue) && priceValue > 0 ? priceValue : null,
      };
    }
  }
  return null;
}

export function isUsefulPensacolaShopifyFormat(rawName) {
  const text = String(rawName || '');
  const size = text.match(/\b(\d+(?:\.\d+)?)\s*(ml|l|oz)\b/i);
  const sizeUnit = size?.[2]?.toLowerCase();
  const sizeMl = size ? Number(size[1]) * (sizeUnit === 'l' ? 1_000 : sizeUnit === 'oz' ? 29.5735 : 1) : null;
  return (sizeMl == null || sizeMl > 375)
    && !/\b(?:\d+\s*[- ]?pk|\d+\s*[- ]?pack|multipack|multi-pack|pack\s+of\s+\d+|case(?:\s+of\s+\d+|\s*pack)?|\d+\s*bottle\s*case|gift\s*set|bundle|sampler|variety\s*pack|set\s+of\s+\d+)\b/i.test(text)
    && !/\b\d+\s*[x×]\s*\d+(?:\.\d+)?\s*(?:ml|l|oz)\b/i.test(text);
}

export function buildPensacolaShopifyStoreLocationSignals(observedAt) {
  return [...PENSACOLA_SHOPIFY_STORES.values()].map((store) => ({
    id: stableId(['FL', 'shopify-store-location', PENSACOLA_SHOPIFY_SOURCE.id, store.id]),
    state: 'FL',
    sourceLabel: `${PENSACOLA_SHOPIFY_SOURCE.chainName} Shopify pickup inventory registry`,
    sourceUrl: PENSACOLA_SHOPIFY_SOURCE.collectionUrl,
    sourceChain: PENSACOLA_SHOPIFY_SOURCE.id,
    merchantId: store.id,
    rawName: store.name,
    canonicalBottleId: null,
    canonicalName: null,
    confidence: 0.82,
    eventType: 'retailer_store_location',
    locationPrecision: 'store_level',
    locationName: store.name,
    storeName: store.name,
    storeId: store.id,
    storeAddress: store.address,
    city: store.city,
    stateCode: 'FL',
    postalCode: store.zip,
    zip: store.zip,
    quantity: 0,
    observedAt,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    inventorySemantics: 'The first-party Pensacola Liquors storefront identifies this reviewed pickup location. The registry row is not bottle inventory.',
    evidence: `${PENSACOLA_SHOPIFY_SOURCE.chainName} identifies ${store.name} at ${store.address}.`,
    raw: { chain: PENSACOLA_SHOPIFY_SOURCE.id, merchantId: store.id, configuredStoreIdentity: true },
  }));
}
