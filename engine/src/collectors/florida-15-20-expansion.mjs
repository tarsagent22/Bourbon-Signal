import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { stableId } from '../core/text.mjs';
import { parseGoToLiquorStoreProducts } from './gotoliquorstore-surfaces.mjs';

function exactStore({ platform, sourceLabel, sourceChain, merchantId, storeId, name, address, city, zip, baseUrl, ...rest }) {
  return Object.freeze({
    platform,
    state: 'FL',
    sourceLabel,
    sourceChain,
    merchantId: String(merchantId),
    storeId,
    name,
    address,
    city,
    zip,
    baseUrl,
    ...rest,
  });
}

export const FLORIDA_PRIMO_SOURCE = Object.freeze({
  id: 'primo-liquors',
  platform: 'primo',
  chainName: 'Primo Liquors',
  sourceLabel: 'Primo Liquors exact-store stock inventory',
  sourceChain: 'primo-liquors',
  hostname: 'primoliquors.com',
  baseUrl: 'https://primoliquors.com',
  productsUrl: 'https://primoliquors.com/products.json?limit=250',
  maxProductsPages: 1,
  maxProductPages: 8,
});

export const FLORIDA_PRIMO_STORES = new Map([
  ['southwest-ranches', exactStore({
    platform: 'primo', sourceLabel: FLORIDA_PRIMO_SOURCE.sourceLabel, sourceChain: FLORIDA_PRIMO_SOURCE.sourceChain,
    merchantId: 'southwest-ranches', storeId: 'primo-liquors:southwest-ranches', name: 'Primo Southwest Ranches',
    address: '4815 SW 148th Ave, Southwest Ranches, FL 33330', city: 'Southwest Ranches', zip: '33330', baseUrl: FLORIDA_PRIMO_SOURCE.baseUrl, code: 'southwest-ranches',
  })],
  ['davie', exactStore({
    platform: 'primo', sourceLabel: FLORIDA_PRIMO_SOURCE.sourceLabel, sourceChain: FLORIDA_PRIMO_SOURCE.sourceChain,
    merchantId: 'davie', storeId: 'primo-liquors:davie', name: 'Primo Liquors Davie',
    address: '5993 Stirling Rd, Davie, FL 33314', city: 'Davie', zip: '33314', baseUrl: FLORIDA_PRIMO_SOURCE.baseUrl, code: 'davie',
  })],
  ['fort-lauderdale', exactStore({
    platform: 'primo', sourceLabel: FLORIDA_PRIMO_SOURCE.sourceLabel, sourceChain: FLORIDA_PRIMO_SOURCE.sourceChain,
    merchantId: 'fort-lauderdale', storeId: 'primo-liquors:fort-lauderdale', name: 'Primo Fort Lauderdale',
    address: '700 S Federal Hwy, Fort Lauderdale, FL 33316', city: 'Fort Lauderdale', zip: '33316', baseUrl: FLORIDA_PRIMO_SOURCE.baseUrl, code: 'fort-lauderdale',
  })],
  ['bayview-sunrise', exactStore({
    platform: 'primo', sourceLabel: FLORIDA_PRIMO_SOURCE.sourceLabel, sourceChain: FLORIDA_PRIMO_SOURCE.sourceChain,
    merchantId: 'bayview-sunrise', storeId: 'primo-liquors:bayview-sunrise', name: 'Primo Bayview Sunrise',
    address: '2541 E Sunrise Blvd, Fort Lauderdale, FL 33304', city: 'Fort Lauderdale', zip: '33304', baseUrl: FLORIDA_PRIMO_SOURCE.baseUrl, code: 'bayview-sunrise',
  })],
  ['southeast', exactStore({
    platform: 'primo', sourceLabel: FLORIDA_PRIMO_SOURCE.sourceLabel, sourceChain: FLORIDA_PRIMO_SOURCE.sourceChain,
    merchantId: 'southeast', storeId: 'primo-liquors:southeast', name: 'Primo Southeast',
    address: '200 SW Davie Blvd, Fort Lauderdale, FL 33315', city: 'Fort Lauderdale', zip: '33315', baseUrl: FLORIDA_PRIMO_SOURCE.baseUrl, code: 'southeast',
  })],
]);

export const FLORIDA_EXPANSION_CITYHIVE_TARGETS = Object.freeze([]);

function shopifySource({ id, name, address, city, zip, hostname, maxPages, storeId }) {
  const baseUrl = `https://${hostname}`;
  return exactStore({
    id,
    platform: 'shopify',
    sourceLabel: `${name} Shopify shipment orderability`,
    sourceChain: id,
    merchantId: `${id}-shopify`,
    storeId,
    name,
    address,
    city,
    zip,
    hostname,
    baseUrl,
    productsUrl: `${baseUrl}/products.json?limit=250`,
    maxPages,
  });
}

export const FLORIDA_SHIPMENT_SHOPIFY_SOURCES = Object.freeze([
  shopifySource({
    id: 'bottle-n-brew-jacksonville', name: 'Bottle N Brew', address: '5050 Sunbeam Rd Suite 1, Jacksonville, FL 32257',
    city: 'Jacksonville', zip: '32257', hostname: 'bottlenbrew.com', maxPages: 4, storeId: 'bottle-n-brew-jacksonville:sunbeam-rd',
  }),
  shopifySource({
    id: 'a1a-liquor-naples', name: 'A1A Liquor', address: '12555 Collier Blvd Unit 1, Naples, FL 34116',
    city: 'Naples', zip: '34116', hostname: 'a1aliquor.com', maxPages: 4, storeId: 'a1a-liquor-naples:collier-blvd',
  }),
  shopifySource({
    id: 'sarasota-liquor-locker', name: 'Sarasota Liquor Locker', address: '5403 Fruitville Rd, Sarasota, FL 34232',
    city: 'Sarasota', zip: '34232', hostname: 'srqliquorlocker.com', maxPages: 3, storeId: 'sarasota-liquor-locker:fruitville-rd',
  }),
  shopifySource({
    id: 'greygoose-liquors-walnut-hill', name: 'Greygoose Liquors', address: '11330 FL-97, Walnut Hill, FL 32568',
    city: 'Walnut Hill', zip: '32568', hostname: 'greygooseliquors.com', maxPages: 1, storeId: 'greygoose-liquors:walnut-hill',
  }),
]);

function goToStore({ id, chain, name, hostname, categoryUrl, merchantId, controlStoreId, address, city, zip, switchStoreUrl = null }) {
  return exactStore({
    id,
    platform: 'gotoliquorstore',
    sourceLabel: `${name} GoToLiquorStore store orderability`,
    sourceChain: chain,
    merchantId,
    storeId: `${chain}:${merchantId}`,
    name,
    address,
    city,
    zip,
    hostname,
    baseUrl: `https://${hostname}`,
    categoryUrl,
    controlStoreId: String(controlStoreId),
    switchStoreUrl,
  });
}

export const FLORIDA_GOTOLIQUOR_STORES = Object.freeze([
  goToStore({
    id: 'in-and-out-liquors', chain: 'in-and-out-liquors', name: 'In and Out Liquors', hostname: 'www.inandoutliquors.com',
    categoryUrl: 'https://www.inandoutliquors.com/c/spirits/whiskey/19', merchantId: '848869', controlStoreId: '639',
    address: '1775 N Wickham Rd, Melbourne, FL 32935', city: 'Melbourne', zip: '32935',
  }),
  goToStore({
    id: 'beneva-liquor-tobacco', chain: 'beneva-liquor-tobacco', name: 'Beneva Liquor & Tobacco', hostname: 'www.benevaliquor.com',
    categoryUrl: 'https://www.benevaliquor.com/c/spirits/whiskey/19', merchantId: '496304', controlStoreId: '1281',
    address: '1295 S Beneva Rd, Sarasota, FL 34232', city: 'Sarasota', zip: '34232',
  }),
  goToStore({
    id: 'liquor-and-more-chasers', chain: 'liquor-and-more-chasers', name: 'Liquor And More (Chasers Liquor)', hostname: 'www.liquormore.com',
    categoryUrl: 'https://www.liquormore.com/c/spirits/whiskey/19', merchantId: '708694', controlStoreId: '904',
    address: '5104 North W Street, Pensacola, FL 32505', city: 'Pensacola', zip: '32505',
  }),
  goToStore({
    id: 'paramount-liquors-pensacola', chain: 'paramount-liquors-pensacola', name: 'Paramount Liquors', hostname: 'www.paramountliquorsfl.com',
    categoryUrl: 'https://www.paramountliquorsfl.com/c/spirits/whiskey/19', merchantId: '856949', controlStoreId: '1386',
    address: '2105 E Olive Rd, Pensacola, FL 32514', city: 'Pensacola', zip: '32514',
  }),
  goToStore({
    id: 'liquor-and-more-stars-n-stripes', chain: 'liquor-and-more-stars-n-stripes', name: 'Liquor And More (Stars n Stripes Liquor & Fine Wine)', hostname: 'www.liquormore.com',
    categoryUrl: 'https://www.liquormore.com/c/spirits/whiskey/19', merchantId: '580491', controlStoreId: '910',
    address: '109 Racetrack Road Northeast, Fort Walton Beach, FL 32547', city: 'Fort Walton Beach', zip: '32547',
    switchStoreUrl: 'https://www.liquormore.com/ShoppingCart/SwitchStore?storeId=910',
  }),
]);

export const FLORIDA_TIVOLI_SOURCE = exactStore({
  id: 'tivoli-south-liquors', platform: 'tivoli', sourceLabel: 'Tivoli South Liquors targeted first-party orderability',
  sourceChain: 'tivoli-south-liquors', merchantId: 'tivoli-south-liquors-miami', storeId: 'tivoli-south-liquors:miami',
  name: 'Tivoli South Liquors', address: '244 SW 107th Ave, Miami, FL 33174', city: 'Miami', zip: '33174',
  hostname: 'tivoliliquors.com', baseUrl: 'https://tivoliliquors.com',
  productUrl: 'https://tivoliliquors.com/miami-liquor-delivery/bulleit-bourbon-750ml.html',
  expectedTitle: 'Bulleit Bourbon 750ml',
  expectedProductId: '220382',
});

export const FLORIDA_EXPANSION_STORE_TARGETS = Object.freeze([
  ...FLORIDA_PRIMO_STORES.values(),
  ...FLORIDA_EXPANSION_CITYHIVE_TARGETS,
  ...FLORIDA_SHIPMENT_SHOPIFY_SOURCES,
  ...FLORIDA_GOTOLIQUOR_STORES,
  FLORIDA_TIVOLI_SOURCE,
]);

function decodeHtml(value) {
  return String(value || '')
    .replace(/&quot;|&#34;/giu, '"')
    .replace(/&#0*39;|&apos;/giu, "'")
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&nbsp;/giu, ' ');
}

function plainText(value) {
  return decodeHtml(value).replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function attribute(tag, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return decodeHtml(tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'iu'))?.[2]
    || tag.match(new RegExp(`\\b${escaped}\\s*=\\s*([^\\s>]+)`, 'iu'))?.[1]
    || '');
}

function exactHttpsUrl(value, baseUrl, hostname) {
  try {
    const url = new URL(decodeHtml(value), baseUrl);
    return url.protocol === 'https:'
      && url.hostname.toLowerCase() === String(hostname || '').toLowerCase()
      && !url.username
      && !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}

function productUrlForHandle(handle, source) {
  const normalized = String(handle || '').trim();
  if (!/^[a-z0-9][a-z0-9-]*$/iu.test(normalized)) return null;
  return new URL(`/products/${normalized}`, source.baseUrl).href;
}

function parseJson(value) {
  try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; }
}

function canonicalShopifySource(candidate) {
  return FLORIDA_SHIPMENT_SHOPIFY_SOURCES.find((source) => source.id === candidate?.id
    && source.hostname === candidate.hostname
    && source.productsUrl === candidate.productsUrl
    && source.storeId === candidate.storeId
    && source.address === candidate.address
    && source.maxPages === candidate.maxPages) || null;
}

export function isUsefulFloridaExpansionBottleFormat(value) {
  const text = plainText(value).toLowerCase();
  if (!text) return false;
  if (/\b(?:candle|tumbler|glassware|barware|coaster|ornament|figurine|flask|shirt|tee|hoodie|hat|poster|sign|sticker|keychain|towel|tray|bag|cooler|umbrella|gift\s*card|accessor(?:y|ies))\b/iu.test(text)) return false;
  if (/\b(?:bundle|multipack|multi-pack|sampler|variety\s*pack|case\s*(?:of|pack)|pack\s+of|set\s+of|\d+\s*(?:pack|pk)|\d+\s*-\s*(?:pack|pk)|\d+\s*x\s*\d+(?:\.\d+)?\s*(?:ml|l)|\d+\s+bottle\s+case)\b/iu.test(text)) return false;
  if (/\b(?:beer|wine|seltzer|cocktail|ready\s*to\s*drink|rtd|\d+(?:\.\d+)?\s*oz\s+(?:can|cans)|can\s*$)\b/iu.test(text)) return false;
  const sizes = [...text.matchAll(/\b(\d+(?:\.\d+)?)\s*(ml|l)\b/giu)].map((match) => Number(match[1]) * (match[2].toLowerCase() === 'l' ? 1_000 : 1));
  return !sizes.length || sizes.every((size) => Number.isFinite(size) && size > 375 && size <= 2_000);
}

export function isFloridaExpansionBourbonCandidate(value) {
  return /bourbon|blanton|weller|eagle rare|buffalo trace|stagg|e\.?\s*h\.?\s*taylor|booker'?s|old fitz|michter|willett|1792|elijah craig/iu.test(plainText(value));
}

export function parsePrimoProductsJson(payload, source = FLORIDA_PRIMO_SOURCE) {
  if (source !== FLORIDA_PRIMO_SOURCE) return [];
  const products = parseJson(payload)?.products;
  if (!Array.isArray(products)) return [];
  const rows = [];
  for (const product of products.slice(0, 250)) {
    const rawName = plainText(product?.title);
    const variant = (Array.isArray(product?.variants) ? product.variants : []).find((entry) => entry?.id != null && entry?.available === true);
    const formatText = [rawName, variant?.title, variant?.option1, variant?.option2, variant?.option3].filter(Boolean).join(' ');
    const productUrl = productUrlForHandle(product?.handle, source);
    if (!rawName || !variant || !productUrl || !isFloridaExpansionBourbonCandidate(rawName) || !isUsefulFloridaExpansionBottleFormat(formatText)) continue;
    rows.push({
      productId: String(product.id || ''),
      variantId: String(variant.id),
      rawName,
      productUrl,
      price: Number(variant.price) > 0 ? Number(variant.price) : null,
    });
  }
  return rows.filter((row) => row.productId);
}

function stockEntry(code, rawValue) {
  if (Array.isArray(rawValue)) return { code: String(rawValue[0] ?? code ?? ''), quantity: rawValue[1], address: rawValue[2] };
  if (rawValue && typeof rawValue === 'object') {
    return {
      code: String(rawValue.code ?? rawValue.storeCode ?? rawValue.store_code ?? code ?? ''),
      quantity: rawValue.quantity ?? rawValue.qty ?? rawValue.stock,
      address: rawValue.address ?? rawValue.storeAddress ?? rawValue.store_address,
    };
  }
  return { code: String(code ?? ''), quantity: rawValue, address: null };
}

export function parsePrimoProductStock(html) {
  if (typeof html !== 'string' || Buffer.byteLength(html, 'utf8') > 8 * 1024 * 1024) return [];
  const candidates = [];
  for (const match of html.matchAll(/<script\b([^>]*\bdata-primo-product-stock\b[^>]*)>([\s\S]*?)<\/script>/giu)) {
    const parsed = parseJson(decodeHtml(match[2]).trim());
    if (Array.isArray(parsed)) {
      for (const value of parsed) candidates.push(stockEntry(null, value));
    } else if (parsed && typeof parsed === 'object') {
      for (const [code, value] of Object.entries(parsed)) candidates.push(stockEntry(code, value));
    }
  }
  const rows = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const store = FLORIDA_PRIMO_STORES.get(candidate.code);
    const quantity = Number(candidate.quantity);
    if (!store || seen.has(candidate.code) || !Number.isInteger(quantity) || quantity <= 0) continue;
    if (candidate.address != null && String(candidate.address) !== store.address) continue;
    seen.add(candidate.code);
    rows.push({ store, quantity });
  }
  return rows;
}

export function parseFloridaShipmentShopifyProducts(payload, candidateSource) {
  const source = canonicalShopifySource(candidateSource);
  const products = parseJson(payload)?.products;
  if (!source || !Array.isArray(products)) return [];
  const rows = [];
  for (const product of products.slice(0, 250)) {
    const rawName = plainText(product?.title);
    const productUrl = productUrlForHandle(product?.handle, source);
    if (!rawName || !productUrl || !isFloridaExpansionBourbonCandidate(rawName)) continue;
    for (const variant of Array.isArray(product?.variants) ? product.variants : []) {
      if (variant?.available !== true || variant?.id == null) continue;
      const formatText = [rawName, variant.title, variant.option1, variant.option2, variant.option3].filter(Boolean).join(' ');
      if (!isUsefulFloridaExpansionBottleFormat(formatText)) continue;
      rows.push({
        productId: String(product.id || ''),
        variantId: String(variant.id),
        rawName,
        productUrl,
        price: Number(variant.price) > 0 ? Number(variant.price) : null,
        quantity: 0,
        quantityIsExact: false,
        sourceAvailabilityVerified: true,
      });
    }
  }
  return rows.filter((row) => row.productId);
}

export function parseFloridaGoToLiquorStoreProducts(html, candidateStore) {
  const store = FLORIDA_GOTOLIQUOR_STORES.find((entry) => entry.id === candidateStore?.id
    && entry.merchantId === candidateStore.merchantId
    && entry.controlStoreId === candidateStore.controlStoreId
    && entry.hostname === candidateStore.hostname
    && entry.categoryUrl === candidateStore.categoryUrl) || null;
  if (!store) return [];
  return parseGoToLiquorStoreProducts(html, store, {
    stores: FLORIDA_GOTOLIQUOR_STORES,
    isAllowedBottleFormat: isUsefulFloridaExpansionBottleFormat,
  }).filter((row) => isFloridaExpansionBourbonCandidate(row.title)).map((row) => ({
    productId: row.productId,
    variantId: row.variantId,
    rawName: row.title,
    productUrl: row.productUrl,
    price: row.price,
    quantity: 0,
    quantityIsExact: false,
    sourceAvailabilityVerified: true,
    premisesVerified: true,
    pickupOfferVerified: true,
  }));
}

function hidden(tag) {
  return /<input\b[^>]*\btype\s*=\s*["']?hidden\b/iu.test(tag)
    || /\s(?:hidden|disabled)(?:\s|=|>)/iu.test(tag)
    || /aria-hidden\s*=\s*["']?true/iu.test(tag)
    || /style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)/iu.test(tag)
    || /class\s*=\s*["'][^"']*\b(?:hidden|d-none|sr-only|visuallyhidden)\b/iu.test(tag);
}

function hasHiddenAncestor(fragment, index) {
  const stack = [];
  const prefix = String(fragment || '').slice(0, index)
    .replace(/<!--[\s\S]*?-->/gu, (value) => ' '.repeat(value.length))
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/giu, (value) => ' '.repeat(value.length));
  for (const match of prefix.matchAll(/<\/?(div|section|fieldset|span)\b[^>]*>/giu)) {
    const tag = match[0];
    const name = match[1].toLowerCase();
    if (/^<\//u.test(tag)) {
      for (let cursor = stack.length - 1; cursor >= 0; cursor -= 1) {
        if (stack[cursor].name !== name) continue;
        stack.splice(cursor);
        break;
      }
    } else stack.push({ name, hidden: hidden(tag) || stack.some((entry) => entry.hidden) });
  }
  return stack.some((entry) => entry.hidden);
}

function jsonLdObjects(html) {
  const rows = [];
  for (const match of String(html || '').matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)) {
    const parsed = parseJson(decodeHtml(match[1]).trim());
    const queue = Array.isArray(parsed) ? [...parsed] : parsed ? [parsed] : [];
    while (queue.length) {
      const value = queue.shift();
      if (!value || typeof value !== 'object') continue;
      rows.push(value);
      if (Array.isArray(value['@graph'])) queue.push(...value['@graph']);
    }
  }
  return rows;
}

function schemaType(value, type) {
  const values = Array.isArray(value?.['@type']) ? value['@type'] : [value?.['@type']];
  return values.some((entry) => String(entry || '').toLowerCase() === type.toLowerCase());
}

export function parseTivoliSouthProduct(html, responseUrl) {
  const current = exactHttpsUrl(responseUrl, FLORIDA_TIVOLI_SOURCE.baseUrl, FLORIDA_TIVOLI_SOURCE.hostname);
  if (!current || current.href !== FLORIDA_TIVOLI_SOURCE.productUrl || typeof html !== 'string' || Buffer.byteLength(html, 'utf8') > 8 * 1024 * 1024) return null;
  const schemas = jsonLdObjects(html);
  const storeSchema = schemas.find((value) => schemaType(value, 'LiquorStore') && plainText(value.name) === FLORIDA_TIVOLI_SOURCE.name);
  const storeUrl = exactHttpsUrl(storeSchema?.url, FLORIDA_TIVOLI_SOURCE.baseUrl, FLORIDA_TIVOLI_SOURCE.hostname);
  const address = storeSchema?.address || {};
  const fullAddress = [address.streetAddress, address.addressLocality, `${address.addressRegion || ''} ${address.postalCode || ''}`.trim()].filter(Boolean).join(', ');
  if (!storeUrl || storeUrl.origin !== current.origin || fullAddress !== FLORIDA_TIVOLI_SOURCE.address) return null;

  const product = schemas.find((value) => schemaType(value, 'Product') && plainText(value.name) === FLORIDA_TIVOLI_SOURCE.expectedTitle);
  const offers = Array.isArray(product?.offers) ? product.offers : product?.offers ? [product.offers] : [];
  const offer = offers.find((value) => /\/InStock$/iu.test(String(value?.availability || '')));
  const canonical = exactHttpsUrl(offer?.seller?.url || offer?.url, FLORIDA_TIVOLI_SOURCE.baseUrl, FLORIDA_TIVOLI_SOURCE.hostname);
  if (!product || !offer || plainText(offer?.seller?.name) !== FLORIDA_TIVOLI_SOURCE.name || canonical?.href !== FLORIDA_TIVOLI_SOURCE.productUrl) return null;

  let verifiedForm = null;
  for (const match of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/giu)) {
    const tag = match[0].slice(0, match[0].indexOf('>') + 1);
    if (hidden(tag) || String(attribute(tag, 'method')).toLowerCase() !== 'post') continue;
    const action = exactHttpsUrl(attribute(tag, 'action'), FLORIDA_TIVOLI_SOURCE.baseUrl, FLORIDA_TIVOLI_SOURCE.hostname);
    if (!action || !/^\/checkout\/cart\/add\//iu.test(action.pathname)) continue;
    const formHtml = match[2];
    const visibleControl = [...formHtml.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>|<input\b[^>]*>/giu)].find((control) => {
      const controlTag = control[0].slice(0, control[0].indexOf('>') + 1);
      const isButton = /^<button\b/iu.test(controlTag);
      const controlType = String(attribute(controlTag, 'type') || '').toLowerCase();
      if (isButton ? controlType === 'reset' : !['submit', 'image', 'button'].includes(controlType)) return false;
      const label = control[1] != null ? plainText(control[1]) : plainText(attribute(controlTag, 'value'));
      return /^Add\s+to\s+Cart$/iu.test(label) && !hidden(controlTag) && !hasHiddenAncestor(formHtml, control.index);
    });
    const productId = action.pathname.match(/\/product\/(\d+)\/?$/iu)?.[1] || '';
    if (visibleControl && productId === FLORIDA_TIVOLI_SOURCE.expectedProductId) {
      verifiedForm = { productId };
      break;
    }
  }
  if (!verifiedForm) return null;
  const price = Number(offer.price);
  return {
    productId: verifiedForm.productId,
    rawName: FLORIDA_TIVOLI_SOURCE.expectedTitle,
    productUrl: FLORIDA_TIVOLI_SOURCE.productUrl,
    price: Number.isFinite(price) && price > 0 ? price : null,
    quantity: 0,
    quantityIsExact: false,
    sourceAvailabilityVerified: true,
    premisesVerified: true,
    orderFormVerified: true,
  };
}

function sourceResponseBound(response, requestedUrl, hostname) {
  const requested = exactHttpsUrl(requestedUrl, requestedUrl, hostname);
  const final = exactHttpsUrl(response?.url, requestedUrl, hostname);
  return Boolean(response?.ok === true && requested && final && final.href === requested.href);
}

function roadblock(source, url, response, fallbackStatus, nextRoute) {
  return {
    state: 'FL',
    source: source.sourceLabel,
    url,
    status: response?.status || fallbackStatus,
    error: response?.error || (response?.status ? `HTTP ${response.status}` : String(fallbackStatus)),
    nextRoute,
  };
}

function expansionInventorySignal(target, product, matched, observedAt) {
  const { match, record, unsafeReason } = matched || {};
  if (!record) return null;
  const exactQuantity = product.quantityIsExact === true;
  const sourceKind = target.platform === 'primo'
    ? 'Primo exact-store stock map'
    : target.platform === 'shopify'
      ? 'first-party Shopify shipment orderability'
      : target.platform === 'gotoliquorstore'
        ? 'visible store-bound Add to Cart control'
        : 'targeted first-party product order form';
  const signal = {
    id: stableId(['FL', 'florida-15-20-expansion', target.sourceChain, target.storeId, product.productId, product.variantId || 'product']),
    state: 'FL',
    stateCode: 'FL',
    sourceLabel: target.sourceLabel,
    sourceUrl: product.productUrl,
    sourceChain: target.sourceChain,
    merchantId: target.merchantId,
    productId: product.productId,
    variantId: product.variantId || null,
    rawName: product.rawName,
    canonicalBottleId: record.id,
    canonicalName: record.canonical,
    tier: record.tier,
    confidence: Math.max(0.82, match?.confidence || 0.5),
    eventType: 'retailer_store_inventory_result',
    locationPrecision: 'store_level',
    locationName: target.name,
    storeName: target.name,
    storeId: target.storeId,
    storeAddress: target.address,
    city: target.city,
    postalCode: target.zip,
    zip: target.zip,
    quantity: Number(product.quantity || 0),
    quantityIsExact: exactQuantity,
    reportedQuantity: exactQuantity ? Number(product.quantity) : 0,
    price: product.price ?? null,
    availabilityStatus: 'in_stock',
    availabilityLabel: exactQuantity
      ? `Retailer reports ${Number(product.quantity)} available`
      : 'Retailer reports shipment/orderable; exact shelf count is not published',
    sourceAvailabilityVerified: true,
    premisesVerified: true,
    observedAt,
    canAlertAsInventory: true,
    canAlertAsWatch: true,
    inventorySemantics: exactQuantity
      ? 'exact_retailer_reported_quantity'
      : target.platform === 'gotoliquorstore'
        ? 'binary_exact_premises_pickup_orderable_no_shelf_count'
        : 'binary_exact_premises_shipment_orderable_no_shelf_count',
    evidence: exactQuantity
      ? `${target.name} reports ${Number(product.quantity)} of ${product.rawName} at ${target.address}. Verify before driving.`
      : `${target.name} publishes ${product.rawName} as shipment/orderable from its configured premises at ${target.address}; this is not a shelf count. Verify directly with the retailer.`,
    raw: {
      source: sourceKind,
      chain: target.sourceChain,
      merchantId: target.merchantId,
      productId: product.productId,
      variantId: product.variantId || null,
      reportedQuantity: exactQuantity ? Number(product.quantity) : 0,
      sourceAvailabilityVerified: true,
      configuredStoreIdentity: true,
      matchGuard: unsafeReason,
    },
  };
  if (target.platform === 'shopify') {
    signal.variantAvailable = true;
    signal.raw.variantAvailable = true;
  }
  if (target.platform === 'gotoliquorstore') {
    signal.pickupOfferVerified = true;
    signal.controlStoreId = target.controlStoreId;
    signal.raw.controlStoreId = target.controlStoreId;
  }
  if (target.platform === 'tivoli') {
    signal.orderFormVerified = true;
    signal.raw.orderFormVerified = true;
  }
  return signal;
}

function productsPageUrl(source, page) {
  const url = new URL(source.productsUrl);
  url.searchParams.set('page', String(page));
  return url.href;
}

export async function collectFloridaShipmentShopifySource({ source: candidateSource, observedAt, matchBottle, fetchText, sleep = async () => {}, signal } = {}) {
  const source = canonicalShopifySource(candidateSource);
  if (!source || typeof matchBottle !== 'function' || typeof fetchText !== 'function') return { signals: [], roadblocks: [], requestCount: 0 };
  const signals = [];
  const roadblocks = [];
  let requestCount = 0;
  for (let page = 1; page <= source.maxPages; page += 1) {
    signal?.throwIfAborted?.();
    const url = productsPageUrl(source, page);
    const response = await fetchText(url, { headers: { accept: 'application/json,*/*' }, redirect: 'manual', maxBytes: 4 * 1024 * 1024, timeoutMs: 25_000, signal });
    requestCount += 1;
    if (!sourceResponseBound(response, url, source.hostname)) {
      roadblocks.push(roadblock(source, url, response, 'unbound_shopify_response', Number(response?.status) === 429
        ? 'Stop this source for the run and retry at the next bounded cadence; do not bypass retailer controls.'
        : 'Retry the exact first-party Shopify products page at low cadence; do not follow cross-host responses.'));
      if (Number(response?.status) === 429) return { signals: [], roadblocks, requestCount, rateLimited: true };
      break;
    }
    const parsed = parseJson(response.text);
    const pageProducts = parsed?.products;
    if (!Array.isArray(pageProducts)) {
      roadblocks.push(roadblock(source, url, response, 'unrecognized_shopify_payload', 'Inspect the first-party products payload without weakening host, identity, availability, or bottle guards.'));
      break;
    }
    if (!pageProducts.length) break;
    for (const product of parseFloridaShipmentShopifyProducts(parsed, source)) {
      const row = expansionInventorySignal(source, product, matchBottle(product.rawName), observedAt);
      if (row) signals.push(row);
    }
    if (pageProducts.length < 250) break;
    if (page < source.maxPages) await sleep(500);
  }
  if (!signals.length && !roadblocks.length) roadblocks.push(roadblock(source, source.productsUrl, null, 'reachable_no_safe_inventory_rows', 'Retry the bounded first-party Shopify feed without weakening bottle, variant availability, or exact-premises guards.'));
  return { signals, roadblocks, requestCount };
}

export async function collectFloridaShipmentShopify({ observedAt, matchBottle, fetchText, sleep, signal } = {}) {
  const signals = [];
  const roadblocks = [];
  let requestCount = 0;
  for (const source of FLORIDA_SHIPMENT_SHOPIFY_SOURCES) {
    const result = await collectFloridaShipmentShopifySource({ source, observedAt, matchBottle, fetchText, sleep, signal });
    signals.push(...result.signals);
    roadblocks.push(...result.roadblocks);
    requestCount += result.requestCount;
  }
  return { signals, roadblocks, requestCount };
}

export async function collectFloridaPrimo({ observedAt, matchBottle, fetchText, sleep = async () => {}, signal } = {}) {
  if (typeof matchBottle !== 'function' || typeof fetchText !== 'function') return { signals: [], roadblocks: [], requestCount: 0 };
  const source = FLORIDA_PRIMO_SOURCE;
  const signals = [];
  const roadblocks = [];
  let requestCount = 0;
  signal?.throwIfAborted?.();
  const productsResponse = await fetchText(source.productsUrl, { headers: { accept: 'application/json,*/*' }, redirect: 'manual', maxBytes: 4 * 1024 * 1024, timeoutMs: 25_000, signal });
  requestCount += 1;
  if (!sourceResponseBound(productsResponse, source.productsUrl, source.hostname)) {
    roadblocks.push(roadblock(source, source.productsUrl, productsResponse, 'unbound_primo_products_response', Number(productsResponse?.status) === 429
      ? 'Stop this source for the run and retry at the next bounded cadence; do not bypass retailer controls.'
      : 'Retry the single exact first-party products page without following cross-host responses.'));
    return { signals: [], roadblocks, requestCount, rateLimited: Number(productsResponse?.status) === 429 };
  }
  const candidates = [];
  for (const product of parsePrimoProductsJson(productsResponse.text)) {
    const matched = matchBottle(product.rawName);
    if (matched?.record) candidates.push({ product, matched });
    if (candidates.length >= source.maxProductPages) break;
  }
  for (const { product, matched } of candidates) {
    signal?.throwIfAborted?.();
    const response = await fetchText(product.productUrl, { headers: { accept: 'text/html,*/*' }, redirect: 'manual', maxBytes: 4 * 1024 * 1024, timeoutMs: 25_000, signal });
    requestCount += 1;
    if (!sourceResponseBound(response, product.productUrl, source.hostname)) {
      roadblocks.push(roadblock(source, product.productUrl, response, 'unbound_primo_product_response', Number(response?.status) === 429
        ? 'Stop this source for the run and retry at the next bounded cadence; do not bypass retailer controls.'
        : 'Retry only the bounded same-host matching product pages.'));
      if (Number(response?.status) === 429) return { signals: [], roadblocks, requestCount, rateLimited: true };
      continue;
    }
    for (const stock of parsePrimoProductStock(response.text)) {
      const row = expansionInventorySignal(stock.store, {
        ...product,
        quantity: stock.quantity,
        quantityIsExact: true,
        sourceAvailabilityVerified: true,
      }, matched, observedAt);
      if (row) signals.push(row);
    }
    await sleep(400);
  }
  if (!signals.length && !roadblocks.length) roadblocks.push(roadblock(source, source.productsUrl, null, 'reachable_no_safe_inventory_rows', 'Retry the single products page and bounded matching product pages without weakening exact store-code, address, stock, or bottle guards.'));
  return { signals, roadblocks, requestCount };
}

export async function collectFloridaGoToLiquorStore({ observedAt, matchBottle, fetchText, sleep = async () => {}, signal } = {}) {
  const signals = [];
  const roadblocks = [];
  let requestCount = 0;
  if (typeof matchBottle !== 'function' || typeof fetchText !== 'function') return { signals, roadblocks, requestCount };
  for (const store of FLORIDA_GOTOLIQUOR_STORES) {
    signal?.throwIfAborted?.();
    let cookieDirectory = null;
    try {
      let cookieJar = null;
      if (store.switchStoreUrl) {
        cookieDirectory = await mkdtemp(join(tmpdir(), 'bs-fl-goto-'));
        cookieJar = join(cookieDirectory, 'cookies.txt');
        const switchResponse = await fetchText(store.switchStoreUrl, {
          method: 'POST',
          cookieJar,
          headers: { accept: 'application/json,*/*', 'x-requested-with': 'XMLHttpRequest' },
          followRedirects: false,
          maxBytes: 64 * 1024,
          timeoutMs: 20_000,
          signal,
        });
        requestCount += 1;
        const switchPayload = parseJson(switchResponse?.text);
        const switchedStoreUrl = exactHttpsUrl(switchPayload?.storeUrl, store.baseUrl, store.hostname);
        if (!sourceResponseBound(switchResponse, store.switchStoreUrl, store.hostname)
          || switchPayload?.success !== true
          || switchedStoreUrl?.origin !== new URL(store.baseUrl).origin) {
          roadblocks.push(roadblock(store, store.switchStoreUrl, switchResponse, 'unbound_gotoliquorstore_switch_response', Number(switchResponse?.status) === 429
            ? 'Stop this exact source for the run and retry at the next bounded cadence; do not bypass retailer controls.'
            : 'Retry the exact first-party store switch without following redirects or accepting a cross-origin store URL.'));
          await sleep(500);
          continue;
        }
      }
      const response = await fetchText(store.categoryUrl, { cookieJar, headers: { accept: 'text/html,*/*' }, followRedirects: false, maxBytes: 8 * 1024 * 1024, timeoutMs: 30_000, signal });
      requestCount += 1;
      if (!sourceResponseBound(response, store.categoryUrl, store.hostname)) {
        roadblocks.push(roadblock(store, store.categoryUrl, response, 'unbound_gotoliquorstore_response', Number(response?.status) === 429
          ? 'Stop this exact source for the run and retry at the next bounded cadence; do not bypass retailer controls.'
          : 'Retry the exact first-party category page without search or cross-host routes.'));
        await sleep(500);
        continue;
      }
      const products = parseFloridaGoToLiquorStoreProducts(response.text, store);
      for (const product of products) {
        const row = expansionInventorySignal(store, product, matchBottle(product.rawName), observedAt);
        if (row) signals.push(row);
      }
      if (!products.length) roadblocks.push(roadblock(store, store.categoryUrl, response, 'reachable_no_store_bound_add_to_cart_rows', 'Retry the exact page without weakening displayed merchant, cart-control, host, or bottle guards.'));
      await sleep(500);
    } finally {
      if (cookieDirectory) await rm(cookieDirectory, { recursive: true, force: true });
    }
  }
  return { signals, roadblocks, requestCount };
}

export async function collectFloridaTivoli({ observedAt, matchBottle, fetchText, signal } = {}) {
  const source = FLORIDA_TIVOLI_SOURCE;
  if (typeof matchBottle !== 'function' || typeof fetchText !== 'function') return { signals: [], roadblocks: [], requestCount: 0 };
  signal?.throwIfAborted?.();
  const response = await fetchText(source.productUrl, { headers: { accept: 'text/html,*/*' }, redirect: 'manual', maxBytes: 4 * 1024 * 1024, timeoutMs: 25_000, signal });
  if (!sourceResponseBound(response, source.productUrl, source.hostname)) {
    return {
      signals: [],
      roadblocks: [roadblock(source, source.productUrl, response, 'unbound_tivoli_response', Number(response?.status) === 429
        ? 'Stop this source for the run and retry at the next bounded cadence; do not bypass retailer controls.'
        : 'Retry the exact same-host first-party product page without following cross-host responses.')],
      requestCount: 1,
      rateLimited: Number(response?.status) === 429,
    };
  }
  const product = parseTivoliSouthProduct(response.text, response.url);
  const row = product ? expansionInventorySignal(source, product, matchBottle(product.rawName), observedAt) : null;
  return row
    ? { signals: [row], roadblocks: [], requestCount: 1 }
    : { signals: [], roadblocks: [roadblock(source, source.productUrl, response, 'reachable_no_verified_order_form', 'Retry the exact product page without weakening canonical URL, product title, store schema/address, visible cart form, or host guards.')], requestCount: 1 };
}

export function buildFloridaExpansionStoreLocationSignals(observedAt) {
  return FLORIDA_EXPANSION_STORE_TARGETS.filter((store) => store.platform !== 'cityhive').map((store) => ({
    id: stableId(['FL', 'configured-store-location', store.sourceChain, store.storeId]),
    state: 'FL',
    stateCode: 'FL',
    sourceLabel: `${store.sourceLabel} registry`,
    sourceUrl: store.categoryUrl || store.productUrl || store.productsUrl || store.baseUrl,
    sourceChain: store.sourceChain,
    merchantId: store.merchantId,
    rawName: store.name,
    canonicalBottleId: null,
    canonicalName: null,
    confidence: 0.82,
    eventType: 'retailer_store_location',
    locationPrecision: 'store_level',
    locationName: store.name,
    storeName: store.name,
    storeId: store.storeId,
    storeAddress: store.address,
    city: store.city,
    postalCode: store.zip,
    zip: store.zip,
    quantity: 0,
    observedAt,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    inventorySemantics: 'Reviewed first-party Florida retailer identity only; this stable directory row is not bottle inventory.',
    evidence: `${store.name} is registered at ${store.address} for this exact first-party source.`,
    raw: { chain: store.sourceChain, merchantId: store.merchantId, configuredStoreIdentity: true, platform: store.platform },
  }));
}

export function floridaExpansionRequestBudget() {
  const primoProductsPages = FLORIDA_PRIMO_SOURCE.maxProductsPages;
  const primoProductPages = FLORIDA_PRIMO_SOURCE.maxProductPages;
  const shipmentShopifyPages = FLORIDA_SHIPMENT_SHOPIFY_SOURCES.reduce((sum, source) => sum + source.maxPages, 0);
  const goToLiquorStorePages = FLORIDA_GOTOLIQUOR_STORES.length;
  const goToLiquorStoreSwitches = FLORIDA_GOTOLIQUOR_STORES.filter((store) => store.switchStoreUrl).length;
  const tivoliProductPages = 1;
  return {
    primoProductsPages,
    primoProductPages,
    shipmentShopifyPages,
    goToLiquorStorePages,
    goToLiquorStoreSwitches,
    tivoliProductPages,
    maximumRequests: primoProductsPages + primoProductPages + shipmentShopifyPages + goToLiquorStorePages + goToLiquorStoreSwitches + tivoliProductPages,
  };
}
