import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchReviewedFirstPartyText } from './central-cityhive-transport.mjs';

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
export const PEARSONS_DC_RESEARCH_CONFIG = Object.freeze({
  id: 'DC', label: 'District of Columbia first-party retailer research', tier: 'B', active: false,
  strategy: 'retailer_store_inventory', cadence: 'shadow-only',
});
export const PEARSONS_DC_BUDGETS = Object.freeze({ requestTimeoutMs: 12_000, maxBodyBytes: 512 * 1024,
  sourceCadenceMs: 30 * 60_000, denialCooldownMs: 24 * 60 * 60_000, maxAgeMs: 2 * 60 * 60_000 });

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
    id: 'pearsons-wine-dc:00963', state: 'DC', stateCode: 'DC', eventType: 'retailer_store_inventory_result',
    locationPrecision: 'store_level', storeId: PEARSONS_DC_SOURCE.storeId, storeName: PEARSONS_DC_SOURCE.storeName,
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

const DENIAL_STATUSES = new Set([401, 403, 429, 435]);
function validateAttempt(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.schemaVersion !== 1 || value.state !== 'DC'
    || Object.keys(value).some(key => !['schemaVersion', 'state', 'lastAttemptAt', 'lastGoodAt', 'nextAllowedAt', 'lastStatus', 'lastOutcome', 'inFlight', 'lastSignal'].includes(key))) {
    throw new Error('Pearson DC attempt ledger is malformed');
  }
  for (const key of ['lastAttemptAt', 'lastGoodAt', 'nextAllowedAt']) if (value[key] != null && !Number.isFinite(Date.parse(value[key]))) throw new Error('Pearson DC attempt clock is invalid');
  if (value.lastOutcome != null && !['in_flight', 'success', 'denied', 'failed'].includes(value.lastOutcome)) throw new Error('Pearson DC attempt outcome is invalid');
  if (value.inFlight && (!/^[a-f0-9-]{36}$/u.test(value.inFlight.id || '') || !Number.isFinite(Date.parse(value.inFlight.startedAt || '')))) {
    throw new Error('Pearson DC has an unresolved source attempt');
  }
  if (value.lastSignal && (!isPearsonsDcResearchInventory(value.lastSignal, { nowMs: Date.parse(value.lastSignal.observedAt) + 1000 })
    || Date.parse(value.lastSignal.observedAt) > Date.parse(value.lastAttemptAt || ''))) throw new Error('Pearson DC cached signal does not match its source clock');
  return value;
}
async function readAttempt(file) {
  try { return validateAttempt(JSON.parse(await readFile(file, 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return { schemaVersion: 1, state: 'DC', inFlight: null }; throw error; }
}
async function writeAttempt(file, value) {
  const next = validateAttempt(value), temp = `${file}.${randomUUID()}.tmp`;
  await mkdir(path.dirname(file), { recursive: true });
  try { await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`); await rename(temp, file); }
  finally { await rm(temp, { force: true }); }
}

export function isPearsonsDcResearchInventory(row, { nowMs = Date.now() } = {}) {
  const binding = row?.sourceProductBinding;
  const age = nowMs - Date.parse(row?.observedAt || '');
  return row?.state === 'DC' && row?.storeId === PEARSONS_DC_SOURCE.storeId
    && row?.storeAddress === PEARSONS_DC_SOURCE.storeAddress
    && row?.merchantId === PEARSONS_DC_SOURCE.merchantId
    && row?.productId === PEARSONS_DC_SOURCE.productId && row?.variantId === PEARSONS_DC_SOURCE.variantId
    && row?.canonicalName === PEARSONS_DC_SOURCE.canonicalName && row?.tier === 'allocated'
    && row?.availabilityStatus === 'in_stock' && row?.sourceAvailabilityVerified === true
    && row?.pickupOfferVerified === true && row?.quantityIsExact === false
    && row?.canAlertAsInventory === false && row?.canAlertAsWatch === false && row?.eligibleForDelivery === false
    && binding?.source === 'pearsons-shopify-retained-page' && SHA256.test(binding?.sourcePageSha256 || '')
    && binding?.variantId === PEARSONS_DC_SOURCE.variantId && Number.isFinite(age) && age >= 0 && age <= PEARSONS_DC_BUDGETS.maxAgeMs;
}

/** Bounded research-only one-page collector. One request maximum, 30-minute
 * success cadence, and a persisted 24-hour permission/rate-denial cooldown. */
export async function collectPearsonsDcResearchReport(config, bible, options = {}) {
  const env = options.env || process.env;
  if (config?.id !== 'DC' || config?.active !== false || config?.cadence !== 'shadow-only'
    || env.BOURBON_SIGNAL_SHADOW_MODE !== '1' || options.lifecycle?.publicStatus === 'active'
    || options.production === true) throw new Error('Pearson DC collection is restricted to isolated research shadow mode');
  if (typeof bible?.match !== 'function') throw new Error('Pearson DC requires the canonical Bottle Bible');
  const now = options.now || (() => new Date());
  const nowDate = now(), nowMs = nowDate.getTime(), startedAt = nowDate.toISOString();
  const attemptFile = options.attemptFile || path.resolve('out', 'research-source-attempts', 'pearsons-dc.json');
  const attempt = await (options.readAttempt || readAttempt)(attemptFile);
  if (attempt.inFlight) throw Object.assign(new Error('Pearson DC source has an unresolved prior attempt'), { code: 'PEARSONS_UNRESOLVED_ATTEMPT' });
  const nextAllowed = Date.parse(attempt.nextAllowedAt || '');
  const source = PEARSONS_DC_SOURCE;
  if (Number.isFinite(nextAllowed) && nextAllowed > nowMs) {
    const signals = attempt.lastOutcome === 'success' && attempt.lastSignal
      && isPearsonsDcResearchInventory(attempt.lastSignal, { nowMs }) ? [attempt.lastSignal] : [];
    const blocked = attempt.lastOutcome !== 'success', status = Number(attempt.lastStatus) || 0;
    const error = blocked ? DENIAL_STATUSES.has(status)
      ? `Pearson DC HTTP ${status} denial remains in persisted cooldown.`
      : `Pearson DC remains in source cooldown after status ${status}.` : null;
    const sourceReport = { sourceRuntimeId: 'research:dc:pearsons-shopify', label: source.sourceLabel,
      url: source.productUrl, ok: !blocked, status, checkedAt: attempt.lastAttemptAt || null,
      error, signalType: 'retailer_store_inventory_result', matchedBottleCount: signals.length, cadenceStatus: 'not_due' };
    const finishedAt = now().toISOString();
    return { state: 'DC', label: PEARSONS_DC_RESEARCH_CONFIG.label, tier: 'B', strategy: 'retailer_store_inventory', cadence: 'shadow-only',
      startedAt, finishedAt, lastGoodAt: attempt.lastGoodAt || null, status: signals.length ? 'useful' : 'no_trusted_inventory',
      stale: false, signals, sources: [{...sourceReport,lastGoodAt:attempt.lastGoodAt||null}], sourceResults: [{ sourceId: sourceReport.sourceRuntimeId,
        sourceLabel: sourceReport.label, sourceUrl: source.productUrl, ok: !blocked, status: blocked?'source_blocked':'not_due', checkedAt: finishedAt,
        alertable: false, inventoryAlertable: false, watchAlertable: false }], roadblocks: blocked?[{state:'DC',source:source.sourceLabel,status,error}]:[],
      metadata: { complete: !blocked, requestCount:0, sourceClock: 'per-source-cadence', nextDueAt: attempt.nextAllowedAt,
        shadowOnly: true, productionActivationAllowed: false, customerDeliveryAllowed: false,
        sourceAttempts: { 'pearsons-wine-dc': { lastAttemptAt: attempt.lastAttemptAt, status: blocked?'source_blocked':'success',
          httpStatus: status, nextAllowedAt: attempt.nextAllowedAt } },
        ...(blocked?{roadblockStatus:status}: {}) } };
  }

  const fetchText = options.fetchText || ((url, requestOptions = {}) => fetchReviewedFirstPartyText(url, {
    ...requestOptions, timeoutMs: PEARSONS_DC_BUDGETS.requestTimeoutMs, maxTimeoutMs: PEARSONS_DC_BUDGETS.requestTimeoutMs,
    maxBytes: PEARSONS_DC_BUDGETS.maxBodyBytes,
    isAllowedUrl: candidate => candidate.origin === source.baseUrl && candidate.pathname === '/products/blantons-single-barrel-bourbon-750ml'
      && !candidate.search && !candidate.hash,
  }));
  const beforeRequest = { schemaVersion: 1, state: 'DC', lastAttemptAt: startedAt,
    nextAllowedAt: new Date(nowMs + PEARSONS_DC_BUDGETS.sourceCadenceMs).toISOString(), lastStatus: 0, lastOutcome: 'in_flight',
    inFlight: { id: randomUUID(), startedAt }, ...(attempt.lastSignal ? { lastSignal: attempt.lastSignal } : {}) };
  await (options.writeAttempt || writeAttempt)(attemptFile, beforeRequest);
  let response, signal = null, responseAt = now().toISOString(), sha256 = null, collectionError = null;
  try {
    response = await fetchText(source.productUrl, { timeoutMs: PEARSONS_DC_BUDGETS.requestTimeoutMs,
      maxBytes: PEARSONS_DC_BUDGETS.maxBodyBytes, maxRedirects: 0 });
    responseAt = now().toISOString();
    if (response?.url !== source.productUrl) throw new Error('Pearson DC product response URL does not exactly match the reviewed page');
    if (DENIAL_STATUSES.has(Number(response.status))) {
      throw Object.assign(new Error(`Pearson DC denied with HTTP ${response.status}; persisted cooldown is active`), { status: Number(response.status), code: 'PEARSONS_DENIED' });
    }
    if (!response?.ok || Number(response.status) !== 200 || typeof response.text !== 'string') {
      throw Object.assign(new Error(`Pearson DC returned non-success status ${Number(response?.status) || 0}`), { status: Number(response?.status) || 0, code: 'PEARSONS_SOURCE_FAILED' });
    }
    const body = Buffer.from(response.text, 'utf8');
    if (body.length > PEARSONS_DC_BUDGETS.maxBodyBytes) throw new Error('Pearson DC response exceeded the body bound');
    sha256 = createHash('sha256').update(body).digest('hex');
    const headers = typeof response.headersText === 'string' ? response.headersText : `HTTP/1.1 200 OK\r\nDate: ${responseAt}\r\n`;
    signal = parsePearsonsDcCapture(body, { url: source.productUrl, headers, bible, expectedSha256: sha256 });
    if (!signal) throw new Error('Pearson DC page failed exact premise, product, offer, pickup or Bottle Bible validation');
    signal = { ...signal, sourceRuntimeId: 'research:dc:pearsons-shopify', researchOnly: true,
      alertable: false, eligibleForOnSite: false, eligibleForDropFeed: false, eligibleForWatch: false,
      eligibleForEmail: false, eligibleForSms: false, eligibleForDelivery: false,
      sourceProductBinding: { ...signal.sourceProductBinding, shadowOnly: true } };
  } catch (error) {
    const status = Number(error?.status) || Number(response?.status) || 0;
    const denial = DENIAL_STATUSES.has(status);
    const failedAt = now().toISOString();
    const failed = { ...beforeRequest, lastAttemptAt: failedAt, lastStatus: status, lastOutcome: denial?'denied':'failed',
      nextAllowedAt: denial ? new Date(Math.max(now().getTime() + PEARSONS_DC_BUDGETS.denialCooldownMs,
        now().getTime() + Math.max(0, Number(response?.retryAfterSeconds) || 0) * 1000,
        Date.parse(attempt.nextAllowedAt || '') || 0)).toISOString()
        : new Date(now().getTime() + PEARSONS_DC_BUDGETS.sourceCadenceMs).toISOString(), inFlight: null };
    if (!denial && attempt.lastSignal) failed.lastSignal = attempt.lastSignal;
    try { await (options.writeAttempt || writeAttempt)(attemptFile, failed); }
    catch (persistError) { throw Object.assign(new Error('Pearson DC result journal could not be closed; further requests are blocked'), { cause: persistError, code: 'PEARSONS_JOURNAL_WRITE_FAILED' }); }
    collectionError = error;
  }

  if (collectionError) {
    const status = Number(collectionError?.status) || Number(response?.status) || 0;
    const finishedAt = now().toISOString(), errorText = String(collectionError?.message || 'Pearson source failed');
    return { state: 'DC', label: PEARSONS_DC_RESEARCH_CONFIG.label, tier: 'B', strategy: 'retailer_store_inventory', cadence: 'shadow-only',
      startedAt, finishedAt, lastGoodAt: null, status: 'partial_useful', stale: false, signals: [],
      sources: [{ sourceRuntimeId: 'research:dc:pearsons-shopify', label: source.sourceLabel, url: source.productUrl,
        ok: false, status, checkedAt: responseAt, lastGoodAt: null, error: errorText,
        signalType: 'retailer_store_inventory_result', matchedBottleCount: 0 }],
      sourceResults: [{ sourceId: 'research:dc:pearsons-shopify', sourceLabel: source.sourceLabel,
        sourceUrl: source.productUrl, ok: false, status: status || 'failed', checkedAt: responseAt,
        alertable: false, inventoryAlertable: false, watchAlertable: false }],
      roadblocks: [{ state: 'DC', source: source.sourceLabel, status, error: errorText }],
      metadata: { complete: false, requestCount:1, sourceClock: 'per-source-cadence', nextDueAt: new Date(Date.parse(responseAt)
        + (DENIAL_STATUSES.has(status) ? PEARSONS_DC_BUDGETS.denialCooldownMs : PEARSONS_DC_BUDGETS.sourceCadenceMs)).toISOString(),
        shadowOnly: true, productionActivationAllowed: false, customerDeliveryAllowed: false,
        sourceAttempts: { 'pearsons-wine-dc': { lastAttemptAt: responseAt, status: DENIAL_STATUSES.has(status) ? 'denied' : 'failed',
          httpStatus: status, nextAllowedAt: new Date(Date.parse(responseAt)
            + (DENIAL_STATUSES.has(status) ? PEARSONS_DC_BUDGETS.denialCooldownMs : PEARSONS_DC_BUDGETS.sourceCadenceMs)).toISOString() } } } };
  }

  const capture = { url: source.productUrl, finalUrl: response.url, status: 200, observedAt: responseAt,
    sha256, bytes: Buffer.byteLength(response.text, 'utf8') };
  if (options.captureRoot) {
    await mkdir(options.captureRoot, { recursive: true });
    const fileName = `pearsons-${sha256.slice(0, 12)}.html`, file = path.join(options.captureRoot, fileName);
    await writeFile(file, response.text);
    capture.file = file; capture.artifactPath = `source-captures/${fileName}`;
  }
  const completed = { ...beforeRequest, lastAttemptAt: responseAt, lastGoodAt: responseAt, lastOutcome: 'success',
    nextAllowedAt: new Date(Date.parse(responseAt) + PEARSONS_DC_BUDGETS.sourceCadenceMs).toISOString(),
    lastStatus: 200, inFlight: null, lastSignal: signal };
  await (options.writeAttempt || writeAttempt)(attemptFile, completed);
  const finishedAt = now().toISOString();
  return { state: 'DC', label: PEARSONS_DC_RESEARCH_CONFIG.label, tier: 'B', strategy: 'retailer_store_inventory', cadence: 'shadow-only',
    startedAt, finishedAt, lastGoodAt: responseAt, status: 'useful', stale: false, signals: [signal],
    sources: [{ sourceRuntimeId: signal.sourceRuntimeId, label: source.sourceLabel, url: source.productUrl,
      ok: true, status: 200, checkedAt: responseAt, lastGoodAt: responseAt, error: null,
      signalType: 'retailer_store_inventory_result', matchedBottleCount: 1 }],
    sourceResults: [{ sourceId: signal.sourceRuntimeId, sourceLabel: source.sourceLabel, sourceUrl: source.productUrl,
      ok: true, status: 'success', checkedAt: responseAt, lastGoodAt: responseAt,
      alertable: false, inventoryAlertable: false, watchAlertable: false }], roadblocks: [],
    metadata: { complete: true, requestCount:1, sourceClock: 'per-source-cadence', nextDueAt: completed.nextAllowedAt,
      receipts: [capture], sourceAttempts: { 'pearsons-wine-dc': { lastAttemptAt: responseAt,
        status: 'success', httpStatus: 200, nextAllowedAt: completed.nextAllowedAt } },
      shadowOnly: true, productionActivationAllowed: false, customerDeliveryAllowed: false } };
}
