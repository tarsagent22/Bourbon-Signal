import { stableId } from '../core/text.mjs';
import { isAllowedTennesseeBottleFormat, isTennesseeRetailerInventory, tennesseeReviewedBottleMatch } from '../tennessee-retailer-policy.mjs';
import { tennesseeStoresForSource } from './tennessee-retailer-surfaces.mjs';

const API = 'https://backend-prod.grabbl.io';
const SEARCH_TERMS = ['bourbon', 'buffalo trace', 'rare breed', 'elijah craig'];
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const BOTTLE_SIZE = /^(?:(?:700|750|1000|1750)\s*ml|1(?:\.75)?\s*l)$/i;

export const TENNESSEE_REGIONAL_GRABBL_SOURCES = Object.freeze([
  { id: '109-liquor-lebanon', appId: 'b7430310-fc8e-4b3c-accc-611cf5295241', address: '443 hwy 109 north', suite: '106' },
  { id: 'liquor-planet-murfreesboro', appId: '66aa799f-5321-4920-9d0b-b0fae9908cc3', address: '3508 Shelbyville Highway', suite: '' },
  { id: 'r-and-b-liquors-nolensville', appId: 'bb58c646-cfb8-45cb-a034-35acd797513e', address: '7175 Nolensville Road', suite: '' },
  { id: 'warrior-wine-murfreesboro', appId: 'f0d15527-0ec2-48cf-9a5f-49de62b4beda', address: '1433 Warrior Drive', suite: '' },
]);

function text(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function verifiedGrabblPremise(data, source, store) {
  if (data?.whiteLabelAppId !== source.appId || !Array.isArray(data.stores) || data.stores.length !== 1) return null;
  const [branch] = data.stores;
  if (branch?.storeId !== store.merchantId || text(branch.addressLine1) !== text(source.address)
    || text(branch.addressLine2) !== text(source.suite) || text(branch.city) !== text(store.city)
    || branch.state !== 'TN' || branch.postalCode !== store.zip) return null;
  const lat = Number(branch.latitude);
  const lng = Number(branch.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 34.9 && lat <= 36.8 && lng >= -90.5 && lng <= -81.5 ? { lat, lng } : null;
}

export function tennesseeGrabblProductRows(products, store, coordinates, bible, observedAt) {
  const rows = [];
  for (const product of products) {
    if (!UUID.test(product?.productId || '') || !BOTTLE_SIZE.test(String(product?.size || '').trim())) continue;
    const rawName = `${product.productName || ''} ${product.size}`.trim();
    if (!isAllowedTennesseeBottleFormat(rawName)) continue;
    const { record, match } = tennesseeReviewedBottleMatch(rawName, bible);
    if (!record || !Array.isArray(product.storeProduct)) continue;
    const offers = product.storeProduct.filter((offer) => offer?.storeId === store.merchantId);
    if (offers.length !== 1) continue;
    const [offer] = offers;
    const price = Number(offer.productPrice);
    if (!UUID.test(offer.storeProductId || '') || offer.isInStock !== true || !Number.isFinite(price) || price <= 0) continue;
    const row = {
      id: stableId(['TN', store.storeId, offer.storeProductId]),
      state: 'TN', stateCode: 'TN', eventType: 'retailer_store_inventory_result',
      storeId: store.storeId, storeName: store.name, locationName: store.name,
      storeAddress: store.address, city: store.city, zip: store.zip, postalCode: store.zip,
      sourceLabel: store.sourceLabel, sourceChain: store.sourceId, merchantId: store.merchantId,
      productId: product.productId, variantId: offer.storeProductId,
      sourceUrl: `https://${store.hostname}/products/${offer.storeProductId}`,
      rawName, canonicalName: record.canonical, canonicalBottleId: record.id,
      locationPrecision: 'store_level', observedAt, ...coordinates,
      confidence: Math.max(0.8, match.confidence), price,
      quantity: 0, reportedQuantity: 1, quantityIsExact: false,
      availabilityStatus: 'binary_retailer_in_stock', availabilityLabel: 'In stock',
      inventorySemantics: 'binary_retailer_orderable_no_exact_count', sourceAvailabilityVerified: true,
      premisesVerified: true, canAlertAsInventory: true, canAlertAsWatch: true,
      evidence: `${store.name} reports ${rawName} in stock at ${store.address}.`,
    };
    if (isTennesseeRetailerInventory(row)) rows.push(row);
  }
  return rows;
}

export async function collectTennesseeRegionalGrabbl(bible, { fetchText, sleep, signal, observedAt }) {
  const inventory = new Map();
  const roadblocks = [];
  for (const source of TENNESSEE_REGIONAL_GRABBL_SOURCES) {
    const [store] = tennesseeStoresForSource(source.id);
    const request = async (url) => {
      const response = await fetchText(url, { signal, timeoutMs: 5_000, maxBytes: 512 * 1024, maxRedirects: 0,
        headers: { accept: 'application/json', 'x-app-id': source.appId, 'x-store-id': store.merchantId } });
      if (response.ok && response.url === url) {
        try { return { data: JSON.parse(response.text)?.data }; } catch { /* report the malformed body below */ }
      }
      roadblocks.push({ state: 'TN', source: store.sourceLabel, url, status: response.ok ? 'unverified_response' : response.status,
        error: response.error || 'The reviewed Grabbl endpoint did not return a verified response.' });
      return { stop: [403, 429].includes(response.status) };
    };
    const storeUrl = `${API}/white-label-app/${source.appId}/store`;
    const premise = await request(storeUrl);
    if (premise.stop) return { signals: [...inventory.values()], roadblocks };
    if (!premise.data) continue;
    const coordinates = verifiedGrabblPremise(premise.data, source, store);
    if (!coordinates) {
      roadblocks.push({ state: 'TN', source: store.sourceLabel, url: storeUrl, status: 'unverified_premises',
        error: 'The current app and branch no longer match the reviewed exact store.' });
      continue;
    }
    for (const term of SEARCH_TERMS) {
      await sleep(600, signal);
      const url = new URL(`/product-web/store/${store.merchantId}/search`, API);
      url.search = new URLSearchParams({ page: '1', limit: '30', search: term });
      const result = await request(url.href);
      if (result.stop) return { signals: [...inventory.values()], roadblocks };
      if (!Array.isArray(result.data?.data)) continue;
      for (const row of tennesseeGrabblProductRows(result.data.data, store, coordinates, bible, observedAt)) {
        inventory.set(row.id, row);
      }
    }
  }
  return { signals: [...inventory.values()], roadblocks };
}
