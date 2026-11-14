import { createHash } from 'node:crypto';
import { fetchWithMeta } from '../core/fetcher.mjs';
import { stableId } from '../core/text.mjs';
import { cityHiveSafeBottleMatch } from './safe-bottle-match.mjs';
import { centralCityHiveRecordMarketTier } from './central-cityhive-market-policy.mjs';

const origin = 'https://jjliquorsdc.com';
const name = 'JJ Liquors';
const street = '1211 Brentwood Rd NE';
const address = street + ', Washington, DC 20018';
const prefix = '/washington-liquor-delivery/';
const source = 'JJ Liquors first-party DC pickup';
const storeId = 'jj-liquors:1211-brentwood-rd-ne';
const detailUrls = ['weller-special-reserve-750ml', 'blanton-single-barrel-750ml', 'bookers-noes-bourbon-750ml']
  .map(slug => origin + prefix + slug + '.html');

function matchingDoc(html, type) {
  const docs = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)]
    .flatMap(([, json]) => {
      try { return JSON.parse(json); } catch { return []; }
    })
    .filter(doc => doc?.['@type'] === type);
  return docs.length === 1 ? docs[0] : null;
}

export function parseJjLiquorsPickup(html, url, bible, observedAt) {
  if (!detailUrls.includes(url) || !Number.isFinite(Date.parse(observedAt))) return null;
  const store = matchingDoc(html, 'LiquorStore');
  const product = matchingDoc(html, 'Product');
  if (store?.['@id'] !== origin + '/' || store.name !== name || store.address?.streetAddress !== street
    || store.address?.addressLocality !== 'Washington' || store.address?.addressRegion !== 'DC'
    || store.address?.postalCode !== '20018' || !product) return null;
  const offer = product.offers;
  const price = Number(offer?.price);
  if (offer?.availability !== 'https://schema.org/InStock' || offer?.priceCurrency !== 'USD'
    || !Number.isFinite(price) || price <= 0 || offer?.seller?.name !== name || offer?.seller?.url !== url
    || !/<span\b[^>]*class=["'][^"']*\bpickup-only-label\b[^"']*["'][^>]*>\s*In-Store Pickup Available\s*<\/span>/iu.test(html)) return null;

  let detail;
  try { detail = JSON.parse(html.match(/\bconst product = (\{[^\r\n]+\});/u)?.[1]); } catch { return null; }
  if (!/^WA-[0-9]+-[A-Z0-9-]+$/u.test(detail?.id ?? '') || detail.id !== detail.internal_sku
    || detail.name !== product.name || Number(detail.price) !== price || !/[-\s]750\s*ml\s*$/iu.test(product.name)) return null;
  const { match, record } = cityHiveSafeBottleMatch(product.name, bible);
  const tier = centralCityHiveRecordMarketTier(record, 'DC');
  if (!record || match?.confidence !== 1 || !['allocated', 'limited', 'unicorn'].includes(tier)) return null;
  return {
    id: stableId(['DC', storeId, detail.id]), state: 'DC', stateCode: 'DC',
    sourceLabel: source, sourceUrl: url, sourceChain: 'jj-liquors', sourceRuntimeId: 'research:dc:jj-liquors',
    productId: detail.id, rawName: product.name, canonicalBottleId: record.id, canonicalName: record.canonical,
    tier, confidence: 1, eventType: 'retailer_store_inventory_result', dataLane: 'inventory',
    locationPrecision: 'store_level', storeId, storeName: name, storeAddress: address,
    locationName: name, city: 'Washington', postalCode: '20018', zip: '20018',
    availabilityStatus: 'in_stock', sourceAvailabilityVerified: true,
    availabilityLabel: 'Retailer reports pickup available', quantity: 0, quantityIsExact: false,
    inventorySemantics: 'Binary pickup availability observed on the retailer product page. Exact shelf quantity and a source inventory clock are unavailable.',
    price, observedAt, fetchedAt: observedAt,
    alertable: false, canAlertAsInventory: false, canAlertAsWatch: false,
    eligibleForOnSite: false, eligibleForDropFeed: false, eligibleForWatch: false,
    eligibleForDelivery: false, eligibleForEmail: false, eligibleForSms: false,
    sourceProductBinding: { shadowOnly: true, storeId, storeAddress: address, productId: detail.id, pickupOfferVerified: true },
    raw: { shadowOnly: true },
  };
}

export async function collectJjLiquorsResearch(bible, { guard, fetchText = fetchWithMeta } = {}) {
  if (process.env.BOURBON_SIGNAL_SHADOW_MODE !== '1' || guard?.persistent !== true
    || typeof guard.beforeAttempt !== 'function' || typeof guard.recordResult !== 'function') {
    throw new Error('Isolated JJ Liquors research requires a persistent source attempt guard.');
  }
  const signals = [];
  const receipts = [];
  for (const url of detailUrls) {
    const admitted = await guard.beforeAttempt({ origin, url });
    if (admitted?.allowed !== true) break;
    const response = await fetchText(url, { timeoutMs: 8000, maxBytes: 350_000, maxRedirects: 0 });
    const observedAt = new Date().toISOString();
    const receipt = {
      observedAt, url, status: response.status, bytes: response.bytes,
      retryAfterSeconds: response.retryAfterSeconds ?? 0,
      sha256: response.ok ? createHash('sha256').update(response.text).digest('hex') : null,
    };
    if (await guard.recordResult({ origin, ...receipt }) !== true) break;
    receipts.push(receipt);
    if ([401, 403, 429, 435].includes(response.status)) break;
    if (!response.ok || response.status !== 200 || response.url !== url) continue;
    const row = parseJjLiquorsPickup(response.text, url, bible, observedAt);
    if (row) signals.push(row);
  }
  return { signals, receipts, productionActivationAllowed: false, customerDeliveryAllowed: false };
}
