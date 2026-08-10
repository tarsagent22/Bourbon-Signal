import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { stableId } from '../core/text.mjs';
import { MalformedSourceError, TransientSourceError } from '../sources/source-error.mjs';

const DIRECTORY_SOURCE_URL = 'https://www.wvabca.com/licensesearch.aspx';
const BARREL_SOURCE_URL = 'https://abca.wv.gov/spirits/wv-bourbon-whiskey-barrel-picks';
const LIQUOR_SEARCH_SOURCE_URL = 'https://www.wvabca.com/liquorsearch.aspx';
const LIQUOR_SEARCH_API_BASE_URL = 'https://api.wvabca.com/API.svc';
const LIQUOR_SEARCH_SOURCE_RUNTIME_ID = 'wv:configured:wv-abca-recent-purchases';
const LIQUOR_SEARCH_MAX_BYTES = 4 * 1024 * 1024;
const LIQUOR_SEARCH_DEFAULT_DELAY_MS = 500;
export const WEST_VIRGINIA_CA_BUNDLE_SHA256 = '1696cf3547c5d0c74aa8bd1067c83b0fbbf805e9f5b7224a49a5780c09873d58';
const WEST_VIRGINIA_CA_BUNDLE_PATH = fileURLToPath(new URL('../../data/certificates/wvabca-rapidssl-chain.pem', import.meta.url));
export function digestWestVirginiaCaBundle(value) {
  const canonical = String(Buffer.isBuffer(value) ? value.toString('utf8') : value || '')
    .replaceAll(String.fromCharCode(13, 10), String.fromCharCode(10));
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
const westVirginiaCaBundleDigest = digestWestVirginiaCaBundle(readFileSync(WEST_VIRGINIA_CA_BUNDLE_PATH));
if (westVirginiaCaBundleDigest !== WEST_VIRGINIA_CA_BUNDLE_SHA256) {
  throw new Error('West Virginia ABCA source-scoped CA bundle failed its pinned digest contract.');
}
export const WEST_VIRGINIA_RECENT_PURCHASE_WATCHLIST = Object.freeze([
  Object.freeze({ query: 'Buffalo Trace Kentucky Straight Bourbon Whiskey', expectedProductId: 827, bottleSize: 750 }),
  Object.freeze({ query: "Blanton's Gold Bourbon", expectedProductId: 10150, bottleSize: 750 }),
  Object.freeze({ query: "Booker's Bourbon", expectedProductId: 734, bottleSize: 750 }),
]);
const directory = JSON.parse(readFileSync(new URL('../../data/store-universe/WV.json', import.meta.url), 'utf8'));
const DIRECTORY_FRESHNESS_MS = 24 * 60 * 60_000;
const directoryStoreDigest = createHash('sha256').update(JSON.stringify(directory.stores)).digest('hex');
if (directoryStoreDigest !== directory.source?.storeDigest) {
  throw new Error('West Virginia ABCA directory snapshot failed its normalized-store digest contract.');
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function htmlText(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ')
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<\/(?:p|li|h[1-6]|div|section|ul|ol)>/giu, '\n')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&ndash;|&#8211;/giu, '–')
    .replace(/&mdash;|&#8212;/giu, '—')
    .replace(/&nbsp;|&#160;/giu, ' ')
    .replace(/[ \t]+/gu, ' ')
    .replace(/\n\s+/gu, '\n')
    .trim();
}

function firstCookie(value) {
  return String(value || '').split(';', 1)[0].trim();
}

function assertLiquorSearchUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !['www.wvabca.com', 'api.wvabca.com'].includes(url.hostname)) {
    throw new MalformedSourceError(`West Virginia ABCA request host is not allowlisted: ${url.hostname}`);
  }
  return url.href;
}

const WEST_VIRGINIA_CURL_STATUS_MARKER = `${String.fromCharCode(10)}__BOURBON_SIGNAL_WV_HTTP_STATUS__:`;

export function parseWestVirginiaCurlResponse(value) {
  const raw = String(value || '');
  const markerAt = raw.lastIndexOf(WEST_VIRGINIA_CURL_STATUS_MARKER);
  const markerStatus = Number(markerAt >= 0
    ? raw.slice(markerAt + WEST_VIRGINIA_CURL_STATUS_MARKER.length).trim()
    : 0) || 0;
  const response = markerAt >= 0 ? raw.slice(0, markerAt) : raw;
  const responseLines = response.replaceAll(String.fromCharCode(13), '').split(String.fromCharCode(10));
  const statusLines = responseLines.map((line) => {
    const match = /^HTTP\/\S+\s+(\d{3})/iu.exec(line);
    return match && !/\bconnection\s+established\b/iu.test(line)
      ? { line, status: Number(match[1]) }
      : null;
  }).filter(Boolean);
  const finalStatusLine = statusLines.at(-1) || null;
  const status = markerStatus || finalStatusLine?.status || 0;
  const headerStart = finalStatusLine ? response.lastIndexOf(finalStatusLine.line) : 0;
  const crlfSeparator = String.fromCharCode(13, 10, 13, 10);
  const lfSeparator = String.fromCharCode(10, 10);
  const crlfEnd = response.indexOf(crlfSeparator, headerStart);
  const lfEnd = response.indexOf(lfSeparator, headerStart);
  const usesCrlf = crlfEnd >= 0 && (lfEnd < 0 || crlfEnd <= lfEnd);
  const separator = usesCrlf ? crlfSeparator : lfSeparator;
  const headerEnd = usesCrlf ? crlfEnd : lfEnd;
  const headerText = headerEnd >= 0 ? response.slice(headerStart, headerEnd) : '';
  const text = headerEnd >= 0 ? response.slice(headerEnd + separator.length) : response;
  const setCookie = headerText.replaceAll(String.fromCharCode(13), '').split(String.fromCharCode(10))
    .filter((line) => /^set-cookie:/iu.test(line))
    .map((line) => firstCookie(line.replace(/^set-cookie:\s*/iu, '')))
    .filter(Boolean)
    .join('; ');
  return { status, text, setCookie };
}

async function defaultWestVirginiaLiquorSearchRequest(url, options = {}) {
  const safeUrl = assertLiquorSearchUrl(url);
  const marker = WEST_VIRGINIA_CURL_STATUS_MARKER;
  const args = [
    '--proto', '=https',
    '--tlsv1.2',
    '--cacert', WEST_VIRGINIA_CA_BUNDLE_PATH,
    '--max-time', '25',
    '--max-filesize', String(LIQUOR_SEARCH_MAX_BYTES),
    '-sS',
    '-D', '-',
    '-A', 'BourbonSignalSourceHealth/1.0 (+https://www.bourbonsignal.com/coverage)',
  ];
  const method = String(options.method || 'GET').toUpperCase();
  if (method !== 'GET') args.push('-X', method);
  const headers = {
    accept: method === 'POST' ? 'application/json, text/javascript, */*;q=0.1' : 'text/html,*/*;q=0.1',
    'accept-language': 'en-US,en;q=0.8',
    expect: '',
    ...(options.headers || {}),
  };
  for (const [name, value] of Object.entries(headers)) args.push('-H', `${name}: ${value}`);
  if (options.body != null) args.push('--data-binary', '@-');
  args.push('-w', `${marker}%{http_code}`, safeUrl);

  return new Promise((resolve, reject) => {
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let settled = false;
    const child = spawn('curl', args, { windowsHide: true, signal: options.signal });
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    child.on('error', (error) => fail(new TransientSourceError(`West Virginia ABCA curl request failed: ${error.message}`)));
    child.stdout.on('data', (chunk) => {
      stdout = Buffer.concat([stdout, chunk]);
      if (stdout.length > LIQUOR_SEARCH_MAX_BYTES + 128 * 1024) {
        child.kill();
        fail(new MalformedSourceError(`West Virginia ABCA response from ${safeUrl} exceeded ${LIQUOR_SEARCH_MAX_BYTES} bytes`));
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr = Buffer.concat([stderr, chunk]);
      if (stderr.length > 64 * 1024) stderr = stderr.subarray(stderr.length - 64 * 1024);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      const parsed = parseWestVirginiaCurlResponse(stdout.toString('utf8'));
      const { status, text, setCookie } = parsed;
      if (code !== 0 && !status) {
        const message = stderr.toString('utf8').trim().slice(0, 500) || `curl exited ${code}`;
        resolve({ ok: false, status: 0, text, setCookie, error: message });
        return;
      }
      resolve({ ok: status >= 200 && status < 300, status, text, setCookie });
    });
    if (options.body != null) child.stdin.end(String(options.body));
    else child.stdin.end();
  });
}

export function parseWestVirginiaLiquorSearchApiKey(html) {
  const match = /\bvar\s+APIKey\s*=\s*(['"])([^'"\s]{4,512})\1\s*;/u.exec(String(html || ''));
  return match?.[2] || null;
}

function parseApiArray(response, label) {
  if (!response?.ok) {
    const status = Number(response?.status || 0);
    const message = `${label} returned HTTP ${status}`;
    if (!status || status === 408 || status === 425 || status === 429 || status >= 500) throw new TransientSourceError(message, { status });
    throw new MalformedSourceError(message, { status });
  }
  let payload;
  try { payload = JSON.parse(String(response.text || '')); } catch {
    throw new MalformedSourceError(`${label} returned malformed JSON`, { status: response.status });
  }
  if (!Array.isArray(payload)) throw new MalformedSourceError(`${label} did not return an array`, { status: response.status });
  return payload;
}

function bottleSizes(value) {
  return String(value || '').split(',').map((size) => Number(String(size).trim())).filter(Number.isFinite);
}

function productForWatch(rows, watch) {
  const expectedProductId = Number(watch.expectedProductId);
  const bottleSize = Number(watch.bottleSize || 750);
  return rows.find((row) => Number(row?.ProductID) === expectedProductId && bottleSizes(row?.BottleSize).includes(bottleSize)) || null;
}

function matchedBottle(bible, productName) {
  return (bible?.scanText?.(cleanText(productName)) || [])[0] || null;
}

export function westVirginiaRecentPurchaseSignal(row, {
  observedAt = new Date().toISOString(),
  bottle,
} = {}) {
  const storeNumber = Number(row?.StoreNumber);
  const productId = Number(row?.ProductID);
  const bottleSize = Number(row?.BottleSize);
  const storeName = cleanText(row?.StoreName);
  const street = cleanText(row?.StreetAddress1);
  const city = cleanText(row?.City).replace(/\s*,?\s*WV\s*$/iu, '').trim();
  const productName = cleanText(row?.ProductName);
  if (!Number.isInteger(storeNumber) || storeNumber <= 0
    || !Number.isInteger(productId) || productId <= 0
    || !Number.isFinite(bottleSize) || bottleSize <= 0
    || !storeName || !street || !city || !productName || !bottle?.id || !bottle?.canonical) return null;
  const storeId = `wvabca-store-${storeNumber}`;
  return {
    id: stableId(['WV', LIQUOR_SEARCH_SOURCE_RUNTIME_ID, storeNumber, productId, bottleSize]),
    state: 'WV',
    stateCode: 'WV',
    sourceUrl: LIQUOR_SEARCH_SOURCE_URL,
    sourceLabel: 'West Virginia ABCA recent retailer purchases',
    sourceRuntimeId: LIQUOR_SEARCH_SOURCE_RUNTIME_ID,
    eventType: 'wv_abca_retailer_recent_purchase_window',
    rawName: productName,
    canonicalBottleId: bottle.id,
    canonicalName: bottle.canonical,
    tier: bottle.tier || null,
    confidence: Math.min(0.9, Number(bottle.confidence || 0.82)),
    productId: String(productId),
    storeId,
    storeNumber: String(storeNumber),
    storeName,
    locationName: storeName,
    locationPrecision: 'store_level',
    locationProjectionDisabled: true,
    storeAddress: `${street}, ${city}, WV`,
    city,
    storeCity: city,
    storePhone: cleanText(row?.PhoneNumber) || null,
    premisesVerified: true,
    quantity: 0,
    storeQty: 0,
    quantityIsExact: false,
    reportedQuantity: null,
    availabilityStatus: 'recent_purchase_window',
    availabilityLabel: 'Purchased from WVABCA within the last three months — call store',
    sourceAvailabilityVerified: false,
    inventorySemantics: 'WVABCA reports that this retailer purchased the bottle within the last three months; this is a call-first purchase lead, not live shelf inventory.',
    signalCategory: 'shipment_lead',
    signalLabel: 'Recent WVABCA retailer purchase',
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    alertable: false,
    baselineOnly: true,
    observedAt,
    fetchedAt: observedAt,
    stale: false,
    readableSummary: `${storeName} purchased ${productName} from West Virginia ABCA within the last three months. Availability and quantity are not confirmed; call the store before driving.`,
    raw: {
      officialStoreNumber: storeNumber,
      officialProductId: productId,
      officialBottleSizeMl: bottleSize,
      purchaseWindowDays: 90,
      noPurchaseDate: true,
      noReportedQuantity: true,
      noLiveInventory: true,
      sourceRuntimeNonAlertable: true,
      premisesVerified: true,
    },
  };
}

export async function collectWestVirginiaRecentPurchases(bible, {
  observedAt = new Date().toISOString(),
  request = defaultWestVirginiaLiquorSearchRequest,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  delayMs = LIQUOR_SEARCH_DEFAULT_DELAY_MS,
  watchlist = WEST_VIRGINIA_RECENT_PURCHASE_WATCHLIST,
  minimumCanaryStores = 20,
  signal,
} = {}) {
  const watches = [...(watchlist || [])].slice(0, 8);
  if (!watches.length) throw new MalformedSourceError('West Virginia ABCA recent-purchase watchlist is empty');
  const canary = watches[0];
  if (!Number.isInteger(Number(canary.expectedProductId)) || !Number.isFinite(Number(canary.bottleSize))) {
    throw new MalformedSourceError('West Virginia ABCA canary requires an expected product ID and bottle size');
  }
  let requestCount = 0;
  let cookie = '';
  const page = await request(LIQUOR_SEARCH_SOURCE_URL, { signal });
  requestCount += 1;
  if (!page?.ok) throw new TransientSourceError(`West Virginia ABCA Liquor Search returned HTTP ${Number(page?.status || 0)}`, { status: Number(page?.status || 0) });
  cookie = firstCookie(page.setCookie);
  const apiKey = parseWestVirginiaLiquorSearchApiKey(page.text);
  if (!apiKey) throw new MalformedSourceError('West Virginia ABCA Liquor Search did not expose its public runtime key', { status: page.status });

  const apiPost = async (method, payload) => {
    if (requestCount >= 2 * watches.length + 3) throw new MalformedSourceError('West Virginia ABCA recent-purchase request budget exceeded');
    signal?.throwIfAborted?.();
    await sleep(Math.max(0, Number(delayMs) || 0));
    const response = await request(`${LIQUOR_SEARCH_API_BASE_URL}/${method}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        ...(cookie ? { cookie } : {}),
        origin: 'https://www.wvabca.com',
        referer: LIQUOR_SEARCH_SOURCE_URL,
        'x-requested-with': 'XMLHttpRequest',
      },
      body: JSON.stringify({ APIKey: apiKey, ...payload }),
      signal,
    });
    requestCount += 1;
    if (response?.setCookie) cookie = [cookie, firstCookie(response.setCookie)].filter(Boolean).join('; ');
    return parseApiArray(response, `West Virginia ABCA ${method}`);
  };

  const search = async (watch) => productForWatch(await apiPost('GetProductNameSearch', {
    ProductName: watch.query,
    NewProduct: false,
  }), watch);
  const stores = async (product, watch) => apiPost('GetStoresWithProduct', {
    productID: Number(product.ProductID),
    bottleSize: Number(watch.bottleSize),
  });

  const startingProduct = await search(canary);
  if (!startingProduct) throw new MalformedSourceError('West Virginia ABCA starting canary catalog result was empty; possible silent throttle');
  const startingCanaryStores = await stores(startingProduct, canary);
  if (startingCanaryStores.length < Number(minimumCanaryStores)) {
    throw new MalformedSourceError(`West Virginia ABCA starting canary store count ${startingCanaryStores.length} was below ${minimumCanaryStores}; possible silent throttle`);
  }

  const signals = [];
  const productResults = [];
  const addRows = (rows, product) => {
    const bottle = matchedBottle(bible, product.ProductName);
    if (!bottle) return 0;
    let added = 0;
    for (const row of rows) {
      if (Number(row?.ProductID) !== Number(product.ProductID) || Number(row?.BottleSize) !== Number(product.bottleSize)) continue;
      const candidate = westVirginiaRecentPurchaseSignal(row, { observedAt, bottle });
      if (!candidate) continue;
      signals.push(candidate);
      added += 1;
    }
    return added;
  };
  const canaryWithSize = { ...startingProduct, bottleSize: Number(canary.bottleSize) };
  const canarySignalCount = addRows(startingCanaryStores, canaryWithSize);
  if (canarySignalCount !== startingCanaryStores.length || canarySignalCount === 0) {
    throw new MalformedSourceError(`West Virginia ABCA canary produced ${canarySignalCount} valid signals from ${startingCanaryStores.length} retailer rows`);
  }
  productResults.push({ productId: Number(startingProduct.ProductID), bottleSize: Number(canary.bottleSize), storeCount: startingCanaryStores.length, signalCount: canarySignalCount });

  for (const watch of watches.slice(1)) {
    const product = await search(watch);
    if (!product) throw new MalformedSourceError(`West Virginia ABCA known product ${watch.expectedProductId} returned an empty catalog result; possible silent throttle`);
    const productStores = await stores(product, watch);
    if (!productStores.length) {
      throw new MalformedSourceError(`West Virginia ABCA known product ${watch.expectedProductId} returned an empty retailer result; possible silent throttle`);
    }
    const signalCount = addRows(productStores, { ...product, bottleSize: Number(watch.bottleSize) });
    if (signalCount !== productStores.length || signalCount === 0) {
      throw new MalformedSourceError(`West Virginia ABCA known product ${watch.expectedProductId} produced ${signalCount} valid signals from ${productStores.length} retailer rows`);
    }
    productResults.push({
      productId: Number(product.ProductID),
      bottleSize: Number(watch.bottleSize),
      storeCount: productStores.length,
      signalCount,
    });
  }

  const endingProduct = await search(canary);
  if (!endingProduct) throw new MalformedSourceError('West Virginia ABCA ending canary catalog result was empty; possible silent throttle');
  const endingCanaryStores = await stores(endingProduct, canary);
  if (endingCanaryStores.length < Number(minimumCanaryStores)) {
    throw new MalformedSourceError(`West Virginia ABCA ending canary store count ${endingCanaryStores.length} was below ${minimumCanaryStores}; possible silent throttle`);
  }
  const minimumStableCanary = Math.ceil(startingCanaryStores.length * 0.8);
  if (endingCanaryStores.length < minimumStableCanary) {
    throw new MalformedSourceError(`West Virginia ABCA ending canary collapsed from ${startingCanaryStores.length} to ${endingCanaryStores.length}; possible silent throttle`);
  }

  const dedupedSignals = [...new Map(signals.map((row) => [row.id, row])).values()];
  return {
    signals: dedupedSignals,
    roadblocks: [],
    sourceReport: {
      sourceRuntimeId: LIQUOR_SEARCH_SOURCE_RUNTIME_ID,
      label: 'West Virginia ABCA exact-store recent purchase window',
      url: LIQUOR_SEARCH_SOURCE_URL,
      ok: true,
      status: 200,
      contentType: 'official-json-api',
      bytes: 0,
      elapsedMs: 0,
      signalType: 'wv_abca_retailer_recent_purchase_window',
      matchedBottleCount: new Set(dedupedSignals.map((row) => row.canonicalBottleId)).size,
      locationCount: new Set(dedupedSignals.map((row) => row.storeId)).size,
      recentPurchaseSignalCount: dedupedSignals.length,
      requestCount,
      maximumRequests: 2 * watches.length + 3,
      canaryStoreCount: endingCanaryStores.length,
      productResults,
      purchaseWindowDays: 90,
      sourceAvailabilityVerified: false,
      canAlertAsInventory: false,
      canAlertAsWatch: false,
      pdfLinkCount: 0,
      documentLinkCount: 0,
      error: null,
    },
  };
}

export function parseWestVirginiaBarrelSelections(html, {
  observedAt = new Date().toISOString(),
  currentYear = new Date(observedAt).getUTCFullYear(),
} = {}) {
  const rawHtml = String(html || '');
  const hasCompleteSectionEnd = /Ask your local retailer or call the Spirits Department for more information![\s\S]{0,300}<h[1-6][^>]*>\s*Corazon Single Barrel[\s\S]*?<\/h[1-6]>/iu.test(rawHtml);
  if (!hasCompleteSectionEnd) return [];
  const text = htmlText(html);
  const heading = /New\s+(\d{4})\s+discounts?\s+for\s+limited\s+barrel\s+selections?/iu.exec(text);
  if (!heading || Number(heading[1]) !== Number(currentYear)) return [];

  const start = heading.index + heading[0].length;
  const tail = text.slice(start);
  const boundary = /Ask your local retailer or call the Spirits Department for more information!/iu.exec(tail);
  if (!boundary) return [];
  const section = tail.slice(0, boundary.index);
  const rows = [];
  let sectionStockRows = 0;

  for (const line of section.split(/\n+/u)) {
    const match = /^\s*(\d{5})\s*-\s*(.+?)(?:\s*-\s*\$([\d,.]+))?\s*$/u.exec(line);
    if (!match) continue;
    sectionStockRows += 1;
    const productName = cleanText(match[2]).split(/\s*:\s*/u, 1)[0];
    if (!productName
      || /\b(?:rum|tequila|vodka|gin|cream|liqueur|ready[ -]to[ -]drink|rtd|cocktail|wine|beer|multipack|multi-pack|pack of \d+)\b/iu.test(productName)
      || /\b(?:50|100|200|375)\s*ml\b/iu.test(productName)
      || /\b\d+\s*(?:pk|pack)\b/iu.test(productName)) continue;
    const stockNumber = match[1];
    const price = match[3] ? Number(match[3].replace(/,/gu, '')) : null;
    rows.push({
      id: stableId(['WV', BARREL_SOURCE_URL, heading[1], stockNumber, productName]),
      state: 'WV',
      sourceUrl: BARREL_SOURCE_URL,
      sourceLabel: 'West Virginia ABCA current barrel selections',
      sourceRuntimeId: 'official:wv-abca-barrel-selections',
      eventType: 'barrel_pick_signal',
      stockNumber,
      productName,
      price: Number.isFinite(price) ? price : null,
      quantity: null,
      canonicalBottleId: null,
      canonicalName: null,
      matchedBottleCount: 0,
      matchedBottles: [],
      locationPrecision: 'statewide_catalog',
      locationName: 'West Virginia',
      sourceAvailabilityVerified: false,
      availabilityStatus: 'official_retailer_ordering_intelligence',
      availabilityLabel: 'Official barrel selection — not live shelf inventory',
      signalCategory: 'release_watch',
      signalLabel: 'Official barrel selection',
      inventorySemantics: 'Official retailer ordering intelligence; not live shelf inventory.',
      canAlertAsInventory: false,
      canAlertAsWatch: false,
      observedAt,
      fetchedAt: observedAt,
      stale: false,
      readableSummary: `${productName} is listed by West Virginia ABCA as a current barrel selection. Retailers may be able to order it; this does not confirm shelf stock at any store.`,
      raw: {
        officialStockNumber: stockNumber,
        officialSelectionYear: Number(heading[1]),
        officialPrice: Number.isFinite(price) ? price : null,
        notLiveInventory: true,
        sourceRuntimeNonAlertable: true,
      },
    });
  }

  const uniqueRows = [...new Map(rows.map((row) => [row.stockNumber, row])).values()];
  return sectionStockRows >= 7 && uniqueRows.length >= 6 ? uniqueRows : [];
}

export function enrichWestVirginiaBarrelSelections(rows, bible) {
  return rows.map((row) => {
    const matches = bible?.scanText?.(row.productName) || [];
    return {
      ...row,
      canonicalBottleId: matches[0]?.id || null,
      canonicalName: matches[0]?.canonical || null,
      tier: matches[0]?.tier || null,
      matchedBottleCount: matches.length,
      matchedBottles: matches.slice(0, 20).map((bottle) => ({
        id: bottle.id,
        name: bottle.canonical,
        tier: bottle.tier,
      })),
    };
  });
}

export function westVirginiaDirectorySignals({ nowAt = new Date().toISOString() } = {}) {
  const capturedAt = directory.source.capturedAt;
  const ageMs = Date.parse(nowAt) - Date.parse(capturedAt);
  const stale = !Number.isFinite(ageMs) || ageMs < 0 || ageMs > DIRECTORY_FRESHNESS_MS;
  return directory.stores.map((store) => ({
    id: stableId(['WV', store.id, 'retailer_store_location']),
    state: 'WV',
    sourceUrl: DIRECTORY_SOURCE_URL,
    sourceLabel: 'West Virginia ABCA licensed-store directory',
    sourceRuntimeId: 'official-directory:wv-abca-active-retail-liquor-stores',
    eventType: 'retailer_store_location',
    canonicalBottleId: null,
    canonicalName: null,
    matchedBottleCount: 0,
    matchedBottles: [],
    locationPrecision: 'store_level',
    locationName: store.name,
    storeId: store.id,
    storeName: store.name,
    storeAddress: store.address,
    storeCity: store.city,
    storeState: 'WV',
    inventoryCapability: 'directory_only',
    sourceAvailabilityVerified: false,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    observedAt: capturedAt,
    fetchedAt: capturedAt,
    stale,
    readableSummary: `${store.name} appeared in the West Virginia ABCA active-license directory captured ${capturedAt.slice(0, 10)}. Store information does not confirm current bottle availability.`,
    raw: {
      officialLicenseNumber: store.licenseNumber,
      directoryOnly: true,
      searchable: true,
      sourceRuntimeNonAlertable: true,
      snapshotCapturedAt: capturedAt,
      sourceDigest: directory.source.sourceDigest,
      storeDigest: directory.source.storeDigest,
    },
  }));
}

export function westVirginiaDirectorySourceReport(signals) {
  return {
    sourceRuntimeId: 'official-directory:wv-abca-active-retail-liquor-stores',
    label: 'West Virginia ABCA active Retail Liquor Stores directory',
    url: DIRECTORY_SOURCE_URL,
    ok: signals.length === directory.storeCount && signals.length > 0,
    status: null,
    contentType: 'reviewed-official-directory-snapshot',
    bytes: JSON.stringify(directory).length,
    elapsedMs: 0,
    signalType: 'retailer_store_location',
    matchedBottleCount: 0,
    locationCount: signals.length,
    pdfLinkCount: 0,
    documentLinkCount: 0,
    error: null,
    directoryOnly: true,
    snapshotCapturedAt: directory.source.capturedAt,
    stale: signals.some((signal) => signal.stale === true),
    staticSnapshot: true,
  };
}

export const WEST_VIRGINIA_DIRECTORY_STORE_COUNT = directory.storeCount;
