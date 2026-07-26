import { stableId } from '../core/text.mjs';
import { createSourceAdapter } from '../sources/source-adapter.mjs';
import { runSourceAdapters } from '../sources/source-runner.mjs';
import { summarizeSourceResult } from '../sources/source-result.mjs';
import { isMississippiRetailerInventory } from '../mississippi-retailer-policy.mjs';
import {
  MISSISSIPPI_RETAILER_SOURCES,
  parseMississippiCityHiveHtml,
  parseMississippiGoToLiquorStoreProducts,
} from './mississippi-retailer-surfaces.mjs';

async function boundedFetchText(url, { signal } = {}) {
  const response = await fetch(url, {
    redirect: 'error',
    signal,
    headers: {
      accept: 'text/html,*/*;q=0.1',
      'accept-language': 'en-US,en;q=0.8',
      'user-agent': 'BourbonSignalSourceHealth/1.0 (+https://www.bourbonsignal.com/coverage)',
    },
  });
  const body = await response.text();
  if (Buffer.byteLength(body, 'utf8') > 8 * 1024 * 1024) throw new Error(`Mississippi retailer response from ${url} exceeded 8 MiB`);
  return { ok: response.ok, status: response.status, text: body };
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
    premisesVerified: row.premisesVerified === true,
    inventorySemantics: 'binary_retailer_orderable_no_exact_count',
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    alertable: false,
    baselineOnly: true,
    evidence: `${source.name} exposed a visible, exact-store-bound pickup/orderability control for ${row.title}. No exact bottle count is claimed.`,
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
      reportedQuantity: row.reportedQuantity ?? null,
      quantitySemantics: 'binary_retailer_orderable_no_exact_count',
      sourceAvailabilityVerified: true,
      pickupOfferVerified: true,
      premisesVerified: true,
      initialObservationPolicy: source.initialObservationPolicy,
    },
  };
}

function parserFor(source) {
  if (source.platform === 'gotoliquorstore') return parseMississippiGoToLiquorStoreProducts;
  if (source.platform === 'cityhive') return parseMississippiCityHiveHtml;
  throw new TypeError(`Unsupported Mississippi retailer platform ${source.platform}`);
}

async function collectSource(source, {
  fetchText,
  matchBottle,
  observedAt,
  signal,
}) {
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
  const matchBottle = options.matchBottle || (() => null);
  const enabledSources = MISSISSIPPI_RETAILER_SOURCES.filter((source) => source.autonomousFetchAllowed !== false);
  const blockedSources = MISSISSIPPI_RETAILER_SOURCES.filter((source) => source.autonomousFetchAllowed === false);
  const adapters = enabledSources.map((source) => createSourceAdapter({
    id: source.sourceRuntimeId,
    label: source.sourceLabel,
    url: source.categoryUrl,
    metadata: {
      stateId: 'MS',
      lane: 'private_retailer_inventory',
      platform: source.platform,
      permitNumber: source.permitNumber,
    },
    collapse: { minBaseline: 4, minRatio: 0.25 },
    execute: (_context, { signal }) => collectSource(source, {
      fetchText,
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
