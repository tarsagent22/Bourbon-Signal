import { createHash } from 'node:crypto';

export const PEARSONS_DC_SOURCE = Object.freeze({
  id: 'pearsons-wine-dc', state: 'DC', stateCode: 'DC', platform: 'shopify',
  chain: 'pearsons-wine-and-spirits', merchantId: 'https://pearsonswine.com/#store',
  sourceLabel: "Pearson's Wine & Spirits DC first-party storefront pickup offer",
  baseUrl: 'https://pearsonswine.com',
  productUrl: 'https://pearsonswine.com/products/blantons-single-barrel-bourbon-750ml',
  storeId: 'pearsonswine.com:#store', storeName: "Pearson's Wine & Spirits",
  storeAddress: '2436 Wisconsin Avenue NW, Washington, DC 20007', city: 'Washington', zip: '20007',
  lat: 38.9218933, lng: -77.0727601,
  productId: 'https://pearsonswine.com/products/blantons-single-barrel-bourbon-750ml#product',
  sku: '00963', variantId: '45949567795418', canonicalName: "Blanton's Original Single Barrel",
});

const SHA256 = /^[a-f0-9]{64}$/u;
const flatten = value => Array.isArray(value) ? value.flatMap(flatten)
  : value && typeof value === 'object' ? [value, ...Object.values(value).flatMap(flatten)] : [];
const plain = value => String(value || '').replace(/<[^>]*>/gu, ' ').replace(/&(?:#x27|#39|apos);/giu, "'")
  .replace(/&quot;/giu, '"').replace(/&amp;/giu, '&').replace(/&nbsp;/giu, ' ').replace(/\s+/gu, ' ').trim();
const typeIs = (value, type) => value?.['@type'] === type || Array.isArray(value?.['@type']) && value['@type'].includes(type);

function documents(html) {
  const result = [];
  for (const match of String(html).matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)) {
    try { result.push(JSON.parse(match[1])); } catch { /* malformed unrelated script is not evidence */ }
  }
  return result.flatMap(flatten);
}

/** Parse one retained Pearson's product page. This proves a storefront order/pickup
 * offer at the page's selected store; it does not claim on-shelf quantity. */
export function parsePearsonsDcCapture(input, { url, headers, bible, expectedSha256 } = {}) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(String(input ?? ''), 'utf8');
  const html = bytes.toString('utf8');
  let page;
  try { page = new URL(url); } catch { return null; }
  if (page.href !== PEARSONS_DC_SOURCE.productUrl || page.origin !== PEARSONS_DC_SOURCE.baseUrl || page.search || page.hash) return null;
  const statusMatch = String(headers || '').match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})\b/mu);
  const dateMatch = String(headers || '').match(/^Date:\s*(.+?)\s*$/imu);
  const status = Number(statusMatch?.[1]);
  const parsedCaptureDate = dateMatch ? Date.parse(dateMatch[1]) : NaN;
  const capturedAt = Number.isFinite(parsedCaptureDate) ? new Date(parsedCaptureDate).toISOString() : null;
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (status !== 200 || !capturedAt || !SHA256.test(sha256) || (expectedSha256 && sha256 !== expectedSha256)) return null;

  const docs = documents(html);
  const store = docs.find(row => typeIs(row, 'LiquorStore') && row['@id'] === PEARSONS_DC_SOURCE.merchantId);
  const product = docs.find(row => typeIs(row, 'Product') && row['@id'] === PEARSONS_DC_SOURCE.productId);
  if (!store || !product || store.name !== PEARSONS_DC_SOURCE.storeName
    || store.address?.streetAddress !== '2436 Wisconsin Avenue NW'
    || store.address?.addressLocality !== 'Washington' || store.address?.addressRegion !== 'DC'
    || store.address?.postalCode !== PEARSONS_DC_SOURCE.zip
    || Number(store.geo?.latitude) !== PEARSONS_DC_SOURCE.lat || Number(store.geo?.longitude) !== PEARSONS_DC_SOURCE.lng
    || product.name !== "Blanton's Single Barrel Bourbon" || product.sku !== PEARSONS_DC_SOURCE.sku) return null;

  const offer = (Array.isArray(product.offers) ? product.offers : [product.offers]).find(row => row?.sku === PEARSONS_DC_SOURCE.sku);
  let offerUrl;
  try { offerUrl = new URL(String(offer?.url || '')); } catch { return null; }
  const properties = new Map((product.additionalProperty || []).map(row => [row.name, row.value]));
  if (!offer || offer.availability !== 'https://schema.org/InStock' || offer.priceCurrency !== 'USD'
    || Number(offer.price) !== 99.99 || offer.seller?.['@id'] !== PEARSONS_DC_SOURCE.merchantId
    || !(offer.availableDeliveryMethod || []).includes('http://purl.org/goodrelations/v1#DeliveryModePickUp')
    || offerUrl.origin !== PEARSONS_DC_SOURCE.baseUrl || offerUrl.pathname !== page.pathname
    || offerUrl.searchParams.get('variant') !== PEARSONS_DC_SOURCE.variantId
    || properties.get('Alcohol by volume') !== 46.5 || properties.get('Size') !== '750ml') return null;

  const form = [...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/giu)].map(row => row[1])
    .find(body => /name=["']variantId["']\s+value=["']45949567795418["']/u.test(body)
      && /Add Blanton(?:&#x27;|')s Single Barrel Bourbon to cart/u.test(body));
  const pickupText = plain(html);
  if (!form || !/Pick up at Wisconsin Ave NW/u.test(pickupText)
    || !/Ready within 30 minutes/u.test(pickupText)
    || !/2436 Wisconsin Avenue NW, Washington, DC 20007/u.test(pickupText)
    || !/750ML\s+in stock/iu.test(pickupText)) return null;

  // The storefront title omits "Original"; resolve only the exact curated
  // library identity after the page's exact SKU/variant/store checks above.
  const match = bible?.match?.(PEARSONS_DC_SOURCE.canonicalName);
  if (!match?.record || match.confidence !== 1 || match.record.canonical !== PEARSONS_DC_SOURCE.canonicalName) return null;
  return {
    state: 'DC', stateCode: 'DC', storeId: PEARSONS_DC_SOURCE.storeId, storeName: PEARSONS_DC_SOURCE.storeName,
    storeAddress: PEARSONS_DC_SOURCE.storeAddress, city: PEARSONS_DC_SOURCE.city, zip: PEARSONS_DC_SOURCE.zip,
    lat: PEARSONS_DC_SOURCE.lat, lng: PEARSONS_DC_SOURCE.lng, sourceChain: PEARSONS_DC_SOURCE.chain,
    merchantId: PEARSONS_DC_SOURCE.merchantId, sourceLabel: PEARSONS_DC_SOURCE.sourceLabel,
    sourceUrl: page.href, productId: PEARSONS_DC_SOURCE.productId, variantId: PEARSONS_DC_SOURCE.variantId,
    rawName: product.name, canonicalBottleId: match.record.id, canonicalName: match.record.canonical,
    tier: match.record.tier, size: '750 ml', price: 99.99, observedAt: capturedAt,
    availabilityStatus: 'in_stock', sourceAvailabilityVerified: true, pickupOfferVerified: true,
    quantity: 0, quantityIsExact: false, inventorySemantics: 'storefront_orderable_pickup_offer_no_shelf_count',
    researchOnly: true, canAlertAsInventory: false, canAlertAsWatch: false, eligibleForDelivery: false,
    sourceProductBinding: {
      schemaVersion: 1, source: 'pearsons-shopify-retained-page', sourcePageSha256: sha256,
      capturedAt, httpStatus: status, storeGraphId: PEARSONS_DC_SOURCE.merchantId,
      storeAddress: PEARSONS_DC_SOURCE.storeAddress, storeLat: PEARSONS_DC_SOURCE.lat, storeLng: PEARSONS_DC_SOURCE.lng,
      productGraphId: PEARSONS_DC_SOURCE.productId, sku: PEARSONS_DC_SOURCE.sku,
      variantId: PEARSONS_DC_SOURCE.variantId, offerPrice: 99.99, currency: 'USD',
      offerAvailability: 'InStock', pickupMethod: 'DeliveryModePickUp', pickupLocation: 'Wisconsin Ave NW',
      pickupReadyText: 'Ready within 30 minutes', libraryTitleMapping: 'Exact SKU 00963 and variant 45949567795418 identify the reviewed Blantons Original Single Barrel expression; raw storefront title omits the word Original.',
    },
    caveat: 'The storefront reports an orderable pickup offer at its selected Wisconsin Ave NW store; it publishes no exact shelf quantity.',
  };
}
