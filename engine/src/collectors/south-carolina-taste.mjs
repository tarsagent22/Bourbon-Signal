import { createHash } from 'node:crypto';
import { stableId, stripHtml } from '../core/text.mjs';
import { cityHiveSafeBottleMatch } from './safe-bottle-match.mjs';

export const TASTE_SOURCE = 'Taste Liquors Columbia public pickup availability';
export const TASTE_STORE = Object.freeze({ id: 'taste-liquors:100384', name: 'Taste Liquors', address: '2722 N Lake Dr, Columbia, SC 29212', city: 'Columbia', zip: '29212', lat: 34.0973639, lng: -81.2207862 });
const BASE = 'https://tasteliquors.com';
const normalized = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function tasteProductUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'tasteliquors.com'
      && /^\/columbia-liquor-delivery\/[a-z0-9-]+\.html$/.test(url.pathname)
      && !url.search && !url.hash && !url.username && !url.password;
  } catch { return false; }
}

export function parseTastePickupPage(html, url) {
  if (!tasteProductUrl(url) || typeof html !== 'string' || Buffer.byteLength(html) > 1024 * 1024) return null;
  const records = [];
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { records.push(JSON.parse(match[1])); } catch { return null; }
  }
  const stores = records.filter(row => row?.['@type'] === 'LiquorStore');
  const products = records.filter(row => row?.['@type'] === 'Product');
  if (stores.length !== 1 || products.length !== 1) return null;
  const store = stores[0], product = products[0], address = store.address, offer = product.offers;
  const ids = [...html.matchAll(/\bproduct_id:\s*(\d+)\b/g)].map(match => match[1]);
  const button = html.match(/<button\b[^>]*data-test=["']add-to-cart-button-available["'][^>]*>([\s\S]*?)<\/button>/i);
  const visible = stripHtml(html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' '));
  const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(match => normalized(stripHtml(match[1])));
  const price = Number(String(offer?.price || '').replace(/,/g, ''));
  if (store.name !== TASTE_STORE.name || store.url !== `${BASE}/` || store['@id'] !== `${BASE}/`
    || address?.streetAddress !== '2722 N Lake Dr' || address?.addressLocality !== 'Columbia'
    || address?.addressRegion !== 'SC' || address?.postalCode !== '29212' || address?.addressCountry !== 'US'
    || store.geo?.['@type'] !== 'GeoCoordinates' || Number(store.geo.latitude) !== TASTE_STORE.lat || Number(store.geo.longitude) !== TASTE_STORE.lng
    || offer?.['@type'] !== 'Offer' || offer.priceCurrency !== 'USD' || offer.availability !== 'https://schema.org/InStock'
    || offer.seller?.name !== TASTE_STORE.name || offer.seller?.url !== url
    || !Number.isFinite(price) || price <= 0 || price > 100000
    || !ids.length || new Set(ids).size !== 1 || !button || /\bdisabled(?:\s|=|>)|aria-disabled=["']true["']/i.test(button[0])
    || normalized(stripHtml(button[1])) !== 'add to cart'
    || !/In-Store Pickup (?:Only|Available)/i.test(visible)
    || !headings.length || headings.some(heading => heading !== normalized(product.name))
    || /gift\s*card|gift\s*basket|bundle|tasting|raffle|lottery|sample|miniature|\b(?:50|100|200)\s*ml\b|\bset\b|\bpack\b/i.test(product.name)) return null;
  return { schemaVersion: 1, pageDigest: createHash('sha256').update(html).digest('hex'), productId: ids[0], name: product.name, price, url, storeId: TASTE_STORE.id,
    storeName: store.name, street: address.streetAddress, city: address.addressLocality, state: address.addressRegion,
    zip: address.postalCode, lat: TASTE_STORE.lat, lng: TASTE_STORE.lng, availability: 'in_stock', pickupAvailable: true, cartAvailable: true };
}

export function buildTasteSignal(proof, bible, observedAt) {
  if (!proof) return null;
  const { record, match } = cityHiveSafeBottleMatch(proof.name, bible);
  if (!record) return null;
  const binding = { ...proof, canonicalBottleId: record.id, checkedAt: observedAt };
  return {
    id: stableId(['SC', 'taste-liquors', proof.productId]), state: 'SC', stateCode: 'SC', sourceLabel: TASTE_SOURCE,
    sourceUrl: proof.url, sourceChain: 'taste-liquors', productId: proof.productId, sourceProductBinding: binding,
    rawName: proof.name, canonicalBottleId: record.id, canonicalName: record.canonical,
    eventType: 'retailer_store_inventory_result', locationPrecision: 'store_level', locationName: TASTE_STORE.name,
    storeName: TASTE_STORE.name, storeId: TASTE_STORE.id, storeAddress: TASTE_STORE.address, city: TASTE_STORE.city,
    zip: TASTE_STORE.zip, postalCode: TASTE_STORE.zip, lat: TASTE_STORE.lat, lng: TASTE_STORE.lng, price: proof.price, quantity: 0, storeQty: 0,
    quantityIsExact: false, quantitySemantics: 'binary_retailer_in_stock', availabilityStatus: 'in_stock',
    availabilityLabel: 'Retailer reports availability — exact quantity unavailable', sourceAvailabilityVerified: true,
    pickupOfferVerified: true, orderabilityOfferVerified: true, observedAt, confidence: Math.max(0.8, match?.confidence || 0),
    canAlertAsInventory: true, canAlertAsWatch: true,
    inventorySemantics: 'Taste Liquors reports this bottle in stock for pickup at its Columbia store. No exact count or shelf guarantee; verify before driving.',
    evidence: `Public product offer reports ${proof.name} in stock at ${TASTE_STORE.address}, with a pickup offer and active cart control. Exact quantity is unavailable.`,
    raw: { chain: 'taste-liquors', productBinding: binding },
  };
}

export function isTasteSignal(signal) {
  let host = ''; try { host = new URL(signal?.sourceUrl || '').hostname; } catch {}
  return host === 'tasteliquors.com' || host === 'www.tasteliquors.com'
    || String(signal?.sourceLabel || '').startsWith('Taste Liquors') || String(signal?.storeId || '').startsWith('taste-liquors:')
    || signal?.sourceChain === 'taste-liquors' || signal?.raw?.chain === 'taste-liquors';
}

export function isTasteInventory(signal, nowMs = Date.now()) {
  const proof = signal?.sourceProductBinding || signal?.raw?.productBinding;
  const observedAt = Date.parse(signal?.observedAt || signal?.lastConfirmedAt || '');
  return signal?.state === 'SC' && (signal.stateCode == null || signal.stateCode === 'SC')
    && (signal.eventType || signal.type) === 'retailer_store_inventory_result' && signal.sourceLabel === TASTE_SOURCE
    && signal.sourceChain === 'taste-liquors' && signal.storeId === TASTE_STORE.id && signal.storeName === TASTE_STORE.name
    && signal.storeAddress === TASTE_STORE.address && signal.city === TASTE_STORE.city && signal.zip === TASTE_STORE.zip
    && signal.locationPrecision === 'store_level' && Boolean(signal.canonicalBottleId || signal.canonicalId)
    && (signal.raw?.chain == null || signal.raw.chain === 'taste-liquors')
    && proof?.schemaVersion === 1 && /^[a-f0-9]{64}$/.test(proof.pageDigest || '')
    && proof.checkedAt === (signal.observedAt || signal.lastConfirmedAt)
    && [proof.canonicalBottleId, stableId(['SC', TASTE_SOURCE, proof.name])].includes(signal.canonicalBottleId || signal.canonicalId)
    && proof.storeId === TASTE_STORE.id && proof.storeName === TASTE_STORE.name
    && signal.lat === TASTE_STORE.lat && signal.lng === TASTE_STORE.lng && proof.lat === TASTE_STORE.lat && proof.lng === TASTE_STORE.lng
    && proof.street === '2722 N Lake Dr' && proof.city === 'Columbia' && proof.state === 'SC' && proof.zip === '29212'
    && /^\d+$/.test(proof.productId || '') && String(signal.productId) === proof.productId
    && signal.sourceUrl === proof.url && tasteProductUrl(proof.url)
    && signal.rawName === proof.name && signal.price === proof.price && Number.isFinite(proof.price) && proof.price > 0
    && proof.availability === 'in_stock' && proof.pickupAvailable === true && proof.cartAvailable === true
    && signal.quantity === 0 && signal.storeQty === 0 && signal.quantityIsExact === false
    && signal.quantitySemantics === 'binary_retailer_in_stock' && signal.sourceAvailabilityVerified === true
    && signal.availabilityStatus === 'in_stock' && signal.stale !== true && signal.sourceStale !== true
    && Number.isFinite(observedAt) && nowMs - observedAt >= -5 * 60000 && nowMs - observedAt <= 2 * 60 * 60000;
}

export async function collectTasteLiquors(config, bible, observedAt, { fetchPage, pause, maxProducts = 12 }) {
  const signals = [], roadblocks = [];
  const home = await fetchPage(`${BASE}/`);
  if (!home.ok || home.url !== `${BASE}/`) return { signals, roadblocks: [{ state: config.id, source: TASTE_SOURCE, url: `${BASE}/`, status: home.status, error: 'Public catalog unavailable or redirected.' }] };
  const urls = [...new Set([...home.text.matchAll(/href=["']([^"']+)["']/gi)].map(match => match[1]).filter(tasteProductUrl))].slice(0, Math.min(16, Math.max(1, maxProducts)));
  for (const url of urls) {
    await pause(500);
    const page = await fetchPage(url);
    if (!page.ok || page.url !== url) {
      roadblocks.push({ state: config.id, source: TASTE_SOURCE, url, status: page.status, error: 'Public product unavailable; no inventory inferred.' });
      if ([401, 403, 429].includes(page.status)) break;
      continue;
    }
    const signal = buildTasteSignal(parseTastePickupPage(page.text, url), bible, new Date().toISOString());
    if (signal) signals.push(signal);
  }
  if (!signals.length) roadblocks.push({ state: config.id, source: TASTE_SOURCE, url: `${BASE}/`, status: 'no_verified_pickup_inventory', error: 'No exact-premise, in-stock product with current pickup proof survived filtering.' });
  else signals.unshift({ id: stableId(['SC', TASTE_STORE.id, 'location']), state: 'SC', stateCode: 'SC', eventType: 'retailer_store_location', sourceLabel: TASTE_SOURCE, sourceUrl: `${BASE}/`, sourceChain: 'taste-liquors', rawName: TASTE_STORE.name, locationPrecision: 'store_level', locationName: TASTE_STORE.name, storeName: TASTE_STORE.name, storeId: TASTE_STORE.id, storeAddress: TASTE_STORE.address, city: TASTE_STORE.city, zip: TASTE_STORE.zip, postalCode: TASTE_STORE.zip, lat: TASTE_STORE.lat, lng: TASTE_STORE.lng, observedAt, confidence: 0.95, canAlertAsInventory: false, canAlertAsWatch: false });
  return { signals, roadblocks };
}
