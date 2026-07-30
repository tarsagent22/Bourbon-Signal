import { stableId } from '../core/text.mjs';
import { createSourceAdapter } from '../sources/source-adapter.mjs';
import { runSourceAdapters } from '../sources/source-runner.mjs';
import { summarizeSourceResult } from '../sources/source-result.mjs';
import { isMississippiRetailerInventory, isMississippiRetailerReleaseWatch } from '../mississippi-retailer-policy.mjs';
import {
  MISSISSIPPI_RETAILER_SOURCES,
  parseMississippiCityHiveHtml,
  parseMississippiGoDaddyReleaseProducts,
  parseMississippiGoToLiquorStoreProducts,
  parseMississippiMoonshineProductCards,
  parseMississippiMoonshineResponse,
} from './mississippi-retailer-surfaces.mjs';

async function boundedFetchText(url, { signal, cookie } = {}) {
  const response = await fetch(url, {
    redirect: 'error',
    signal,
    headers: {
      accept: 'text/html,*/*;q=0.1',
      'accept-language': 'en-US,en;q=0.8',
      ...(cookie ? { cookie } : {}),
      'user-agent': 'BourbonSignalSourceHealth/1.0 (+https://www.bourbonsignal.com/coverage)',
    },
  });
  const body = await response.text();
  if (Buffer.byteLength(body, 'utf8') > 8 * 1024 * 1024) throw new Error(`Mississippi retailer response from ${url} exceeded 8 MiB`);
  return { ok: response.ok, status: response.status, text: body };
}

async function boundedFetchJson(url, { body, signal, cookie } = {}) {
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'error',
    signal,
    headers: {
      accept: 'application/json, text/javascript, */*;q=0.1',
      'accept-language': 'en-US,en;q=0.8',
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      'user-agent': 'BourbonSignalSourceHealth/1.0 (+https://www.bourbonsignal.com/coverage)',
      'x-requested-with': 'XMLHttpRequest',
    },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: body || {}, id: 1 }),
  });
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > 8 * 1024 * 1024) throw new Error(`Mississippi retailer JSON response from ${url} exceeded 8 MiB`);
  const parsed = JSON.parse(text);
  return {
    ok: response.ok,
    status: response.status,
    payload: parsed?.result || parsed,
    cookie: (response.headers.getSetCookie?.() || [response.headers.get('set-cookie') || ''])
      .filter(Boolean)
      .map((value) => value.split(';', 1)[0])
      .join('; '),
  };
}

export async function readBoundedMississippiJsonResponse(response, {
  url = 'unknown',
  maxBytes = 8 * 1024 * 1024,
} = {}) {
  const contentLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`Mississippi retailer JSON response from ${url} exceeded ${maxBytes} bytes`);
  }
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error(`Mississippi retailer JSON response from ${url} exceeded ${maxBytes} bytes`);
    return JSON.parse(text);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel('response_too_large');
        throw new Error(`Mississippi retailer JSON response from ${url} exceeded ${maxBytes} bytes`);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally {
    reader.releaseLock();
  }
}

async function boundedFetchGetJson(url, { signal } = {}) {
  const response = await fetch(url, {
    redirect: 'error',
    signal,
    headers: {
      accept: 'application/json',
      'accept-language': 'en-US,en;q=0.8',
      'user-agent': 'BourbonSignalSourceHealth/1.0 (+https://www.bourbonsignal.com/coverage)',
    },
  });
  return {
    ok: response.ok,
    status: response.status,
    payload: await readBoundedMississippiJsonResponse(response, { url }),
  };
}

export function buildMississippiRetailerSignal(source, row, {
  observedAt = new Date().toISOString(),
  bottle,
} = {}) {
  return {
    id: stableId(['MS', source.permitNumber, row.productId, row.variantId || 'product']),
    state: 'MS',
    stateCode: 'MS',
    sourceLabel: source.sourceLabel,
    sourceUrl: row.productUrl,
    sourceChain: source.id,
    sourceRuntimeId: source.sourceRuntimeId,
    merchantId: source.merchantId,
    productId: row.productId,
    variantId: row.variantId || null,
    permitNumber: source.permitNumber,
    rawName: row.title,
    canonicalBottleId: bottle?.id || null,
    canonicalName: bottle?.canonical || null,
    tier: bottle?.tier || null,
    confidence: Number.isFinite(bottle?.confidence) ? bottle.confidence : 0.8,
    eventType: 'retailer_store_inventory_result',
    locationPrecision: 'store_level',
    locationName: source.name,
    storeName: source.name,
    storeId: source.id,
    storeAddress: source.address,
    city: source.city,
    storeCity: source.city,
    county: source.county,
    regionId: source.regionId,
    postalCode: source.zip,
    zip: source.zip,
    quantity: 0,
    quantityIsExact: false,
    reportedQuantity: row.reportedQuantity ?? null,
    price: row.price,
    observedAt,
    sourceAvailabilityVerified: row.sourceAvailabilityVerified === true,
    pickupOfferVerified: row.pickupOfferVerified === true,
    orderabilityOfferVerified: row.orderabilityOfferVerified === true,
    premisesVerified: row.premisesVerified === true,
    inventorySemantics: 'binary_retailer_orderable_no_exact_count',
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    alertable: false,
    baselineOnly: true,
    evidence: `${source.name} exposed a visible, exact-store-bound ${row.pickupOfferVerified === true ? 'pickup' : 'cart'} orderability control for ${row.title}. No exact bottle count is claimed.`,
    raw: {
      chain: source.id,
      platform: source.platform,
      merchantId: source.merchantId,
      controlStoreId: source.controlStoreId || null,
      displayedMerchantId: source.merchantId,
      permitNumber: source.permitNumber,
      platformStoreId: source.platformStoreId,
      sourceLabelHash: source.sourceLabelHash,
      productId: row.productId,
      variantId: row.variantId || null,
      platformProductId: row.platformProductId || null,
      reportedQuantity: row.reportedQuantity ?? null,
      quantitySemantics: 'binary_retailer_orderable_no_exact_count',
      sourceAvailabilityVerified: true,
      pickupOfferVerified: row.pickupOfferVerified === true,
      orderabilityOfferVerified: row.orderabilityOfferVerified === true,
      premisesVerified: true,
      initialObservationPolicy: source.initialObservationPolicy,
    },
  };
}

export function buildMississippiReleaseWatchSignal(source, row, {
  observedAt = new Date().toISOString(),
  bottle,
} = {}) {
  return {
    id: stableId(['MS', source.permitNumber, 'release-watch', row.productId]),
    state: 'MS',
    stateCode: 'MS',
    sourceLabel: source.sourceLabel,
    sourceUrl: row.productUrl,
    sourceChain: source.id,
    sourceRuntimeId: source.sourceRuntimeId,
    merchantId: source.merchantId,
    productId: row.productId,
    sourceProductBinding: row.productBinding,
    variantId: null,
    permitNumber: source.permitNumber,
    rawName: row.title,
    canonicalBottleId: bottle?.id || null,
    canonicalName: bottle?.canonical || null,
    tier: bottle?.tier || null,
    confidence: Number.isFinite(bottle?.confidence) ? bottle.confidence : 0.72,
    eventType: 'retailer_release_hold_watch',
    locationPrecision: 'store_level',
    locationName: source.name,
    storeName: source.name,
    storeId: source.id,
    storeAddress: source.address,
    city: source.city,
    storeCity: source.city,
    county: source.county,
    regionId: source.regionId,
    postalCode: source.zip,
    zip: source.zip,
    quantity: 0,
    quantityIsExact: false,
    reportedQuantity: null,
    price: row.price,
    observedAt,
    sourceEventAt: row.sourceUpdatedAt,
    sourceAvailabilityVerified: row.sourceAvailabilityVerified === true,
    pickupOfferVerified: false,
    deliveryOfferVerified: false,
    premisesVerified: row.premisesVerified === true,
    inventorySemantics: 'retailer_release_hold_watch_no_inventory_count',
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    alertable: false,
    baselineOnly: true,
    evidence: `${source.name} currently exposes ${row.title} on its first-party release/hold surface. This is not an exact shelf count or guaranteed hold.`,
    raw: {
      chain: source.id,
      platform: source.platform,
      merchantId: source.merchantId,
      controlStoreId: source.controlStoreId || null,
      displayedMerchantId: source.merchantId,
      permitNumber: source.permitNumber,
      platformStoreId: source.platformStoreId,
      sourceLabelHash: source.sourceLabelHash,
      productId: row.productId,
      productBinding: row.productBinding,
      sourceProductUrl: row.productUrl,
      variantId: null,
      sourceUpdatedAt: row.sourceUpdatedAt,
      quantitySemantics: 'retailer_release_hold_watch_no_inventory_count',
      sourceAvailabilityVerified: true,
      pickupOfferVerified: false,
      deliveryOfferVerified: false,
      premisesVerified: true,
      sourceRuntimeNonAlertable: true,
      initialObservationPolicy: source.initialObservationPolicy,
    },
  };
}

function parserFor(source) {
  if (source.platform === 'gotoliquorstore') return parseMississippiGoToLiquorStoreProducts;
  if (source.platform === 'cityhive') return parseMississippiCityHiveHtml;
  throw new TypeError(`Unsupported Mississippi retailer platform ${source.platform}`);
}

function payloadFromJsonResult(result) {
  return result?.payload || result?.result || result;
}

async function collectMoonshineSource(source, {
  fetchText,
  fetchJson,
  matchBottle,
  observedAt,
  signal,
}) {
  const session = await fetchJson(source.sessionUrl, {
    body: {
      formatted_address: source.platformAddress,
      moonshinems_latitude: source.platformLatitude,
      moonshinems_longitude: source.platformLongitude,
    },
    signal,
  });
  if (!session?.ok) throw new Error(`${source.sourceLabel} session HTTP ${session?.status || 0}`);
  const cookie = session.cookie || '';
  const listingResponse = await fetchJson(source.apiUrl, {
    body: { seller: source.moonshineSellerId },
    cookie,
    signal,
  });
  if (!listingResponse?.ok) throw new Error(`${source.sourceLabel} listing HTTP ${listingResponse?.status || 0}`);
  const listing = payloadFromJsonResult(listingResponse);
  const candidatesByProduct = new Map();
  for (const candidate of parseMississippiMoonshineProductCards(listing, source)) candidatesByProduct.set(candidate.productId, candidate);
  for (const shopUrl of source.shopUrls || []) {
    const shopResponse = await fetchText(shopUrl, { cookie, signal });
    if (!shopResponse?.ok) continue;
    for (const candidate of parseMississippiMoonshineProductCards({ product_store: shopResponse.text }, source)) {
      if (!candidatesByProduct.has(candidate.productId)) candidatesByProduct.set(candidate.productId, candidate);
    }
  }
  const candidates = [...candidatesByProduct.values()]
    .slice(0, Number.isInteger(source.maxProducts) ? source.maxProducts : 24);
  const rows = [];
  let detailFailures = 0;
  for (const candidate of candidates) {
    const detailResponse = await fetchJson(source.apiUrl, {
      body: { seller: source.moonshineSellerId, product_tmpl_id: Number(candidate.productId) },
      cookie: listingResponse.cookie || cookie,
      signal,
    });
    if (!detailResponse?.ok) {
      detailFailures += 1;
      continue;
    }
    const detailRows = parseMississippiMoonshineResponse(payloadFromJsonResult(detailResponse), source);
    for (const row of detailRows) {
      const bottle = await matchBottle(row.title, source, row);
      if (!bottle?.id || !bottle?.canonical) continue;
      const candidateSignal = buildMississippiRetailerSignal(source, row, { observedAt, bottle });
      if (isMississippiRetailerInventory(candidateSignal)) rows.push(candidateSignal);
    }
  }
  const roadblocks = [];
  if (!candidates.length) {
    roadblocks.push({
      state: 'MS',
      source: source.sourceLabel,
      sourceRuntimeId: source.sourceRuntimeId,
      url: source.categoryUrl,
      status: 'reachable_no_safe_orderability_rows',
      error: 'Moonshine seller response exposed no safe bourbon product cards for exact-product verification.',
      nextRoute: 'Keep the seller nonalertable and review the public seller response, bottle-size guard, and product-card bindings without treating catalog rows as inventory.',
    });
  } else if (!rows.length) {
    roadblocks.push({
      state: 'MS',
      source: source.sourceLabel,
      sourceRuntimeId: source.sourceRuntimeId,
      url: source.categoryUrl,
      status: 'reachable_no_safe_bottle_matches',
      error: `${candidates.length} safe Moonshine product cards were inspected; none produced a seller-bound orderability row that survived canonical matching.${detailFailures ? ` ${detailFailures} detail requests failed.` : ''}`,
      nextRoute: 'Keep the seller nonalertable and review product detail responses, exact seller controls, and bottle matching without weakening identity or orderability guards.',
    });
  }
  return {
    signals: rows,
    roadblocks,
    recordsInspected: candidates.length,
    metadata: {
      permitNumber: source.permitNumber,
      platform: source.platform,
      merchantId: source.merchantId,
      complete: true,
      detailFailures,
    },
  };
}

async function collectGoDaddyReleaseSource(source, {
  fetchGetJson,
  matchBottle,
  observedAt,
  signal,
}) {
  const response = await fetchGetJson(source.apiUrl, { signal });
  if (!response?.ok) throw new Error(`${source.sourceLabel} HTTP ${response?.status || 0}`);
  const parsedRows = parseMississippiGoDaddyReleaseProducts(response.payload, source, { observedAt });
  const signals = [];
  for (const row of parsedRows) {
    const bottle = await matchBottle(row.title, source, row);
    if (!bottle?.id || !bottle?.canonical) continue;
    const candidate = buildMississippiReleaseWatchSignal(source, row, { observedAt, bottle });
    if (isMississippiRetailerReleaseWatch(candidate)) signals.push(candidate);
  }
  const roadblocks = [];
  if (!parsedRows.length) {
    roadblocks.push({
      state: 'MS',
      source: source.sourceLabel,
      sourceRuntimeId: source.sourceRuntimeId,
      url: source.categoryUrl,
      status: 'reachable_no_fresh_release_watch_rows',
      error: 'The first-party release surface was reachable but exposed no fresh, available, exact-bottle bourbon rows.',
      nextRoute: 'Keep this source nonalertable; do not reinterpret stale holds, generic allocation text, or zero-dollar records as inventory.',
    });
  } else if (!signals.length) {
    roadblocks.push({
      state: 'MS',
      source: source.sourceLabel,
      sourceRuntimeId: source.sourceRuntimeId,
      url: source.categoryUrl,
      status: 'reachable_no_safe_bottle_matches',
      error: `${parsedRows.length} fresh exact-bottle release rows were inspected but none survived canonical matching.`,
      nextRoute: 'Review exact bottle aliases without weakening first-party identity, freshness, or availability guards.',
    });
  }
  return {
    signals,
    roadblocks,
    recordsInspected: Number(response.payload?.products?.length || 0),
    metadata: {
      permitNumber: source.permitNumber,
      platform: source.platform,
      merchantId: source.merchantId,
      complete: true,
      parsedReleaseRows: parsedRows.length,
    },
  };
}

async function collectSource(source, {
  fetchText,
  fetchJson,
  fetchGetJson,
  matchBottle,
  observedAt,
  signal,
}) {
  if (source.platform === 'moonshine') {
    return collectMoonshineSource(source, { fetchText, fetchJson, matchBottle, observedAt, signal });
  }
  if (source.platform === 'godaddy_release_watch') {
    return collectGoDaddyReleaseSource(source, { fetchGetJson, matchBottle, observedAt, signal });
  }
  const response = await fetchText(source.categoryUrl, { signal });
  if (!response?.ok) throw new Error(`${source.sourceLabel} HTTP ${response?.status || 0}`);
  const rows = parserFor(source)(String(response.text || ''), source);
  const signals = [];
  for (const row of rows) {
    const bottle = await matchBottle(row.title, source, row);
    if (!bottle?.id || !bottle?.canonical) continue;
    const candidate = buildMississippiRetailerSignal(source, row, { observedAt, bottle });
    if (isMississippiRetailerInventory(candidate)) signals.push(candidate);
  }
  const roadblocks = [];
  if (!rows.length) {
    roadblocks.push({
      state: 'MS',
      source: source.sourceLabel,
      sourceRuntimeId: source.sourceRuntimeId,
      url: source.categoryUrl,
      status: 'reachable_no_safe_orderability_rows',
      error: 'The source was reachable but exposed no complete exact-store-bound safe bourbon orderability rows.',
      nextRoute: 'Keep the partition nonalertable and review source markup, premises identity, safe size, pickup controls, and product URLs without weakening the guards.',
    });
  } else if (!signals.length) {
    roadblocks.push({
      state: 'MS',
      source: source.sourceLabel,
      sourceRuntimeId: source.sourceRuntimeId,
      url: source.categoryUrl,
      status: 'reachable_no_safe_bottle_matches',
      error: `${rows.length} orderable product rows were inspected but none survived the canonical bottle guard.`,
      nextRoute: 'Review source titles and the canonical bottle matcher without weakening source, premises, product, format, or pickup identity.',
    });
  }
  return {
    signals,
    roadblocks,
    recordsInspected: rows.length,
    metadata: {
      permitNumber: source.permitNumber,
      platform: source.platform,
      merchantId: source.merchantId,
      complete: true,
    },
  };
}

export async function collectMississippiRetailers(config, options = {}) {
  if (config?.id !== 'MS') throw new TypeError('Mississippi retailer collector requires the MS state config');
  const observedAt = (options.now?.() || new Date()).toISOString();
  const fetchText = options.fetchText || boundedFetchText;
  const fetchJson = options.fetchJson || boundedFetchJson;
  const fetchGetJson = options.fetchGetJson || boundedFetchGetJson;
  const matchBottle = options.matchBottle || (() => null);
  const enabledSources = MISSISSIPPI_RETAILER_SOURCES.filter((source) => source.autonomousFetchAllowed !== false);
  const blockedSources = MISSISSIPPI_RETAILER_SOURCES.filter((source) => source.autonomousFetchAllowed === false);
  const adapters = enabledSources.map((source) => createSourceAdapter({
    id: source.sourceRuntimeId,
    label: source.sourceLabel,
    url: source.categoryUrl,
    metadata: {
      stateId: 'MS',
      lane: source.platform === 'godaddy_release_watch' ? 'retailer_release_watch' : 'private_retailer_inventory',
      platform: source.platform,
      permitNumber: source.permitNumber,
    },
    collapse: { minBaseline: 4, minRatio: 0.25 },
    execute: (_context, { signal }) => collectSource(source, {
      fetchText,
      fetchJson,
      fetchGetJson,
      matchBottle,
      observedAt,
      signal,
    }),
    validate: (value) => Array.isArray(value?.signals)
      && Array.isArray(value?.roadblocks)
      && Number.isInteger(value?.recordsInspected)
      && value?.metadata?.complete === true
      ? true
      : `${source.sourceLabel} returned a malformed or incomplete retailer result`,
    recordCount: (value) => value.recordsInspected,
  }));
  const isolated = await runSourceAdapters(adapters, {}, {
    schedule: false,
    concurrency: Math.min(2, adapters.length),
    perDomain: 1,
    previousResults: options.previousResults,
    circuitBreaker: options.circuitBreaker,
    ...options.sourceRunnerOptions,
  });
  const signals = isolated.results.flatMap((result) => result.value?.signals || []);
  const roadblocks = isolated.results.flatMap((result) => result.value?.roadblocks || []);
  const blockedSourceResults = blockedSources.map((source) => ({
    sourceId: source.sourceRuntimeId,
    sourceLabel: source.sourceLabel,
    sourceUrl: source.categoryUrl,
    status: 'source_policy_blocked',
    ok: false,
    stale: false,
    quarantined: true,
    checkedAt: observedAt,
    lastGoodAt: null,
    alertable: false,
    inventoryAlertable: false,
    watchAlertable: false,
    roadblock: source.sourcePolicyReason,
  }));
  roadblocks.push(...blockedSources.map((source) => ({
    state: 'MS',
    source: source.sourceLabel,
    sourceRuntimeId: source.sourceRuntimeId,
    url: source.categoryUrl,
    status: 'source_policy_blocked',
    error: source.sourcePolicyReason,
    nextRoute: 'Keep the source health-visible and make no autonomous request until an allowed first-party endpoint or retailer-authorized route exists; do not switch HTTP clients or bypass source protection.',
  })));
  for (const result of isolated.results) {
    if (result.ok) continue;
    roadblocks.push({
      state: 'MS',
      source: result.sourceLabel,
      sourceRuntimeId: result.sourceId,
      url: result.sourceUrl,
      status: result.status,
      error: result.error?.message || 'Isolated Mississippi retailer source failed.',
      nextRoute: 'Keep healthy sibling stores independent and retain only source-scoped labeled stale context; do not infer out of stock or bypass source protection.',
    });
  }
  return {
    signals,
    roadblocks,
    sourceResults: [...isolated.results.map((result) => ({
      ...summarizeSourceResult(result),
      alertable: false,
      inventoryAlertable: false,
      watchAlertable: false,
    })), ...blockedSourceResults],
    runtime: {
      partitionCount: adapters.length,
      registeredSourceCount: MISSISSIPPI_RETAILER_SOURCES.length,
      blockedSourceCount: blockedSources.length,
      sourceRuntimeIds: adapters.map((adapter) => adapter.id),
      blockedSourceRuntimeIds: blockedSources.map((source) => source.sourceRuntimeId),
      circuitState: isolated.circuitState,
    },
  };
}
