import { centralCityHiveRecordMarketTier } from './central-cityhive-market-policy.mjs';
import { metroBottleMatch } from './arizona-metro-retailer-proof.mjs';
import { stableId, stripHtml } from '../core/text.mjs';

const baseUrl = 'https://showermanswinespirits.com';
export const showermans = Object.freeze({
  state: 'MI', hostname: new URL(baseUrl).hostname, baseUrl, sourceId: 'research:mi:showermans-livonia',
  storeId: 'showermans:livonia-15333-merriman', merchantId: 'showermans-woocommerce',
  storeName: "Showerman's Fine Wine & Liquor", street: '15333 Merriman Rd', city: 'Livonia', zip: '48154',
  address: '15333 Merriman Rd, Livonia, MI 48154',
  pickupUrl: `${baseUrl}/ordering-pickup/`, categoryUrl: `${baseUrl}/product-category/spirits/allocated/`,
});
const eligibleTiers = new Set(['allocated', 'limited', 'unicorn']);
const text = value => stripHtml(String(value ?? '')).replace(/&#0*39;|&#8217;|&rsquo;|&apos;|’/g, "'")
  .replace(/&#0*38;|&amp;/g, '&').replace(/&#0*36;/g, '$').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();

function sourceUrl(value) {
  try {
    const url = new URL(text(value), showermans.baseUrl);
    if (url.origin === showermans.baseUrl && !url.username && !url.password && !url.hash) return url;
  } catch { /* Not a link on the reviewed storefront. */ }
  return null;
}

function localAddress(address) {
  return address?.streetAddress === showermans.street && address?.addressLocality === showermans.city
    && address?.addressRegion === showermans.state && address?.postalCode === showermans.zip && address?.addressCountry === 'US';
}

export function matchesShowermansPickup(html) {
  const schema = String(html).match(/<script type="application\/ld\+json" class="rank-math-schema">([\s\S]*?)<\/script>/i)?.[1];
  if (!schema) return false;
  try {
    const graph = JSON.parse(schema)['@graph'];
    const place = graph?.find(row => row['@id'] === `${showermans.baseUrl}/#place`);
    const store = graph?.find(row => row['@id'] === `${showermans.baseUrl}/#organization`);
    const copy = text(html);
    return localAddress(place?.address) && localAddress(store?.address) && store?.location?.['@id'] === place['@id']
      && text(store?.name) === showermans.storeName
      && Array.isArray(store['@type']) && store['@type'].includes('LiquorStore')
      && /at checkout,\s*(?:choose|select)[^.]{0,45}pickup/i.test(copy)
      && /bring your order out to your car/i.test(copy);
  } catch { return false; }
}

export function parseShowermansInventory(html, bible, { observedAt, requestUrl, pickupVerified }) {
  const requested = sourceUrl(requestUrl);
  if (pickupVerified !== true || !requested || !isShowermansInventoryRequest(requested) || !Number.isFinite(Date.parse(observedAt))) return [];
  const entries = [];
  const seen = new Set();
  for (const [, className, productId, card] of String(html).matchAll(/<li class="(product type-product post-(\d+)\b[^\"]*)">([\s\S]*?)<\/li>/gi)) {
    const classes = className.split(' ');
    if (!classes.includes('instock') || !classes.includes('purchasable') || !classes.includes('product-type-simple')
      || !classes.includes('product_cat-allocated') || seen.has(productId)) continue;
    const heading = card.match(/<h3 class="woocommerce-loop-product__title">\s*<a href="([^"]+)">([\s\S]*?)<\/a>\s*<\/h3>/i);
    const name = text(heading?.[2]);
    const product = sourceUrl(heading?.[1]);
    const cart = card.match(/<a href="([^"]+)"[^<>]*class="[^"]*\badd_to_cart_button\b[^"]*"[^<>]*data-product_id="(\d+)"[^<>]*data-product_sku="(\d+)"[^<>]*>/i);
    const cartUrl = sourceUrl(cart?.[1]);
    const size = card.match(/<a class="product-size-item"[^>]*>\s*(\d+)\s*ML\s*<\/a>/i)?.[1];
    const prices = [...card.matchAll(/<bdi>\s*<span class="woocommerce-Price-currencySymbol"[^>]*>([^<]+)<\/span>\s*([\d,]+\.\d{2})\s*<\/bdi>/gi)];
    const price = prices.length === 1 && text(prices[0][1]) === '$' ? Number(prices[0][2].replace(/,/g, '')) : NaN;
    if (!product || !/^\/product\/[a-z0-9-]+\/$/.test(product.pathname) || product.search
      || cart?.[2] !== productId || cartUrl?.searchParams.get('add-to-cart') !== productId
      || size !== '750' || !Number.isFinite(price) || price <= 0
      || !/<span class="inventory_status">\s*<span[^>]*>Availability:<\/span>\s*In Stock\s*<\/span>/i.test(card)
      || /\b(?:rye|liqueur|gift|pack|bundle|miniature)\b/i.test(name)) continue;
    const record = metroBottleMatch(name, bible);
    const tier = centralCityHiveRecordMarketTier(record, showermans.state);
    if (!eligibleTiers.has(tier)) continue;
    seen.add(productId);
    entries.push({
      id: stableId([showermans.state, showermans.sourceId, productId]), state: showermans.state, stateCode: showermans.state,
      sourceRuntimeId: showermans.sourceId, sourceLabel: `${showermans.storeName} pickup inventory`, sourceChain: 'showermans',
      storeId: showermans.storeId, merchantId: showermans.merchantId, storeName: showermans.storeName,
      storeAddress: showermans.address, city: showermans.city, zip: showermans.zip, locationPrecision: 'store_level',
      eventType: 'retailer_store_inventory_result', sourceUrl: product.href, productId, variantId: productId, rawName: name,
      canonicalBottleId: record.id, canonicalName: record.canonical, tier, price, observedAt, fetchedAt: observedAt,
      availabilityStatus: 'in_stock', sourceAvailabilityVerified: true, quantity: 0, quantityIsExact: false,
      inventorySemantics: 'binary_retailer_orderable_no_exact_count',
      alertable: false, canAlertAsInventory: false, canAlertAsWatch: false, eligibleForOnSite: false, eligibleForDropFeed: false,
      eligibleForWatch: false, eligibleForDelivery: false, eligibleForEmail: false, eligibleForSms: false,
      sourceProductBinding: { schemaVersion: 1, source: 'showermans-woocommerce', shadowOnly: true, storeId: showermans.storeId,
        merchantId: showermans.merchantId, productId, sku: cart[3], sizeMl: 750, observedAt, price,
        pickupTermsUrl: showermans.pickupUrl, productListUrl: requested.href, storeAddress: showermans.address,
        purchasable: true, stockVerified: true, binaryQuantity: true },
    });
  }
  return entries;
}

function isShowermansInventoryRequest(url) {
  return url.href === showermans.categoryUrl || (url.pathname === '/' && url.searchParams.get('post_type') === 'product'
    && (url.searchParams.get('s')?.length ?? 0) > 0 && [...url.searchParams].length === 2);
}

export function isShowermansResearchInventory(row, { nowMs = Date.now() } = {}) {
  const proof = row?.sourceProductBinding, product = sourceUrl(row?.sourceUrl), search = sourceUrl(proof?.productListUrl);
  const age = nowMs - Date.parse(row?.observedAt);
  return row?.state === showermans.state && row.sourceRuntimeId === showermans.sourceId
    && row.storeId === showermans.storeId && row.merchantId === showermans.merchantId
    && row.storeAddress === showermans.address && row.locationPrecision === 'store_level'
    && !!product && /^\/product\/[a-z0-9-]+\/$/.test(product.pathname) && !product.search
    && !!search && isShowermansInventoryRequest(search) && age >= 0 && age <= 2 * 60 * 60_000
    && row.availabilityStatus === 'in_stock' && row.sourceAvailabilityVerified === true && row.quantity === 0
    && row.quantityIsExact === false && row.stale !== true && eligibleTiers.has(row.tier) && !!row.canonicalBottleId
    && Number.isFinite(row.price) && row.price > 0 && /^\d+$/.test(row.productId) && row.variantId === row.productId
    && proof?.schemaVersion === 1 && proof.source === 'showermans-woocommerce' && proof.shadowOnly === true
    && proof.storeId === row.storeId && proof.merchantId === row.merchantId && proof.storeAddress === row.storeAddress
    && proof.productId === row.productId && proof.price === row.price && proof.observedAt === row.observedAt
    && /^\d+$/.test(proof.sku) && proof.sizeMl === 750 && proof.pickupTermsUrl === showermans.pickupUrl
    && proof.purchasable === true && proof.stockVerified === true && proof.binaryQuantity === true
    && ['alertable','canAlertAsInventory','canAlertAsWatch','eligibleForOnSite','eligibleForDropFeed','eligibleForDelivery',
      'eligibleForWatch','eligibleForEmail','eligibleForSms'].every(key => row[key] === false);
}