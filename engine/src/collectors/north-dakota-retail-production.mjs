import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATE_LIFECYCLE_CONFIG } from '../state-lifecycle.mjs';
import { evaluateStateControl, validateImmutablePromotionEvidence } from '../reliability-policy.mjs';
import { createSourceAdapter } from '../sources/source-adapter.mjs';
import { runSourceAdapters } from '../sources/source-runner.mjs';
import { summarizeSourceResult } from '../sources/source-result.mjs';
import { centralCityHiveAllocatedQueryFilter, centralCityHiveRecordMarketTier } from './central-cityhive-market-policy.mjs';
import { isCentralCityHiveInventory } from '../central-cityhive-policy.mjs';
import { CENTRAL_CITYHIVE_RESEARCH_SOURCES } from './central-cityhive-research-premises.mjs';
import { collectNorthDakotaGroceryObservation } from '../research-north-dakota-runtime.mjs';
import { collectNorthDakotaCityHiveProductionObservation } from '../research-cityhive-runtime.mjs';
import { isNorthDakotaGroceryResearchInventory, williston } from '../north-dakota-retail-policy.mjs';
import { metroSourceAttempts } from './metro-refresh-state.mjs';

export const NORTH_DAKOTA_CITYHIVE_RUNTIME = 'nd:rock-cityhive';
export const NORTH_DAKOTA_GROCERY_RUNTIME = 'nd:albertsons-xapi';
export const NORTH_DAKOTA_RETAIL_SOURCE_IDS = Object.freeze([
  NORTH_DAKOTA_CITYHIVE_RUNTIME,
  NORTH_DAKOTA_GROCERY_RUNTIME,
]);
export const NORTH_DAKOTA_RETAIL_MAX_AGE_MS = 2 * 60 * 60_000;
const cityHiveStore = CENTRAL_CITYHIVE_RESEARCH_SOURCES.find(source => source.state === 'ND');
const promotionManifestPath = fileURLToPath(new URL('../../data/state-integration/ND.json', import.meta.url));
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const canonicalUrl = value => { const url = new URL(value); url.searchParams.sort(); return url.href; };
const silent = row => ({ ...row, alertable: false, canAlertAsInventory: false, canAlertAsWatch: false,
  eligibleForOnSite: true, eligibleForDropFeed: true, eligibleForWatch: false, eligibleForDelivery: false,
  eligibleForEmail: false, eligibleForSms: false, deliveryEligible: false });

export const NORTH_DAKOTA_RETAIL_CONFIG = Object.freeze({ id: 'ND', label: 'North Dakota reviewed exact-store retail inventory',
  tier: 'B', strategy: 'retailer_store_inventory', cadence: '30-60m' });

export const NORTH_DAKOTA_RETAIL_COHORT_SHA256 = sha({
  schemaVersion: 1,
  cityHive: cityHiveStore,
  grocery: williston,
  sourceIds: NORTH_DAKOTA_RETAIL_SOURCE_IDS,
  semantics: 'store-bound-orderable-on-site-only-no-alerts-v1',
});

export function northDakotaRetailSourceConfigHash(manifest) {
  if (manifest?.state !== 'ND') throw new Error('North Dakota promotion manifest is required');
  return sha(Object.fromEntries(['lifecycle', 'collector', 'storeIdentity', 'sourceSemantics', 'customerPaths']
    .map(key => [key, manifest[key]])));
}

export function northDakotaRetailProductionAllowed(lifecycleConfig = STATE_LIFECYCLE_CONFIG, {
  promotionManifest, env = process.env,
} = {}) {
  const entry = lifecycleConfig?.states?.ND;
  const evidence = entry?.promotionEvidence;
  const immutable = evidence?.immutableEvidence;
  const policy = { ...lifecycleConfig?.reliabilityPolicy?.promotionPolicy,
    minShadowRuns: Math.max(3, Number(lifecycleConfig?.reliabilityPolicy?.promotionPolicy?.minShadowRuns) || 3),
    minCanaryRuns: Math.max(2, Number(lifecycleConfig?.reliabilityPolicy?.promotionPolicy?.minCanaryRuns) || 2) };
  const manifest = promotionManifest;
  const control = evaluateStateControl('ND', env);
  return Boolean(lifecycleConfig?.activeStates?.includes('ND') && entry?.publicStatus === 'active'
    && entry.promotionStage === 'active' && entry.inventoryAlertable === false && entry.watchAlertable === false
    && control.collect && control.publishCandidate
    && manifest?.state === 'ND' && manifest.lifecycle?.publicStatus === 'active' && manifest.lifecycle.refinementLevel === 'store'
    && manifest.collector?.cohortSha256 === NORTH_DAKOTA_RETAIL_COHORT_SHA256
    && JSON.stringify(manifest.collector.sourceIds) === JSON.stringify(NORTH_DAKOTA_RETAIL_SOURCE_IDS)
    && manifest.sourceSemantics?.inventoryAlertable === false && manifest.sourceSemantics.watchAlertable === false
    && evidence?.verticalSliceManifest === 'engine/data/state-integration/ND.json'
    && evidence.fixtureContract === 'engine/data/state-fixtures/ND.json'
    && Number(evidence.shadowRuns) >= policy.minShadowRuns && Number(evidence.canaryRuns) >= policy.minCanaryRuns
    && Number.isFinite(Date.parse(evidence.verifiedAt))
    && validateImmutablePromotionEvidence('ND', evidence, policy)
    && immutable?.provenance?.repository === 'tarsagent22/Bourbon-Signal'
    && immutable.sourceConfigHash === northDakotaRetailSourceConfigHash(manifest)
    && JSON.stringify(immutable) === JSON.stringify(manifest.evidence?.immutablePromotionEvidence));
}

function sourceFresh(row, nowMs) {
  const observedAt = Date.parse(row?.observedAt || ''), age = nowMs - observedAt;
  return Number.isFinite(observedAt) && age >= 0 && age <= NORTH_DAKOTA_RETAIL_MAX_AGE_MS;
}

export function isNorthDakotaCityHiveProductionInventory(row, { nowMs = Date.now() } = {}) {
  const proof = row?.sourceProductBinding;
  // Central parser proof is still authoritative for the actual Bible match;
  // this predicate adds only the ND production lane and visibility boundary.
  return Boolean(row?.state === 'ND' && row.sourceRuntimeId === NORTH_DAKOTA_CITYHIVE_RUNTIME
    && row.storeId === cityHiveStore?.storeId && row.sourceLabel === cityHiveStore.sourceLabel
    && isCentralCityHiveInventory(row, { nowMs }) && sourceFresh(row, nowMs)
    && ['limited', 'allocated', 'unicorn'].includes(row.tier)
    && proof?.shadowOnly === false && proof.productionOnSiteOnly === true
    && proof.productionCohortSha256 === NORTH_DAKOTA_RETAIL_COHORT_SHA256
    && row.raw?.shadowOnly !== true && row.raw?.staleFallback !== true
    && row.previewOnly !== true && row.quarantined !== true
    && row.canAlertAsInventory === false && row.canAlertAsWatch === false && row.alertable === false
    && row.eligibleForOnSite === true && row.eligibleForDropFeed === true && row.eligibleForWatch === false
    && row.eligibleForDelivery === false && row.deliveryEligible === false
    && row.eligibleForEmail === false && row.eligibleForSms === false);
}

export function isNorthDakotaAlbertsonsProductionInventory(row, { nowMs = Date.now() } = {}) {
  const proof = row?.sourceProductBinding;
  const item = proof?.productSnapshot;
  const quantity = item?.channelInventory?.instoreItemQty ?? item?.channelInventory?.inStoreItemQty;
  const reviewedResearchShape = { ...row, sourceRuntimeId: 'research:nd:albertsons-xapi', eligibleForOnSite: false,
    eligibleForDropFeed: false, sourceProductBinding: { ...proof, shadowOnly: true } };
  return Boolean(row?.sourceRuntimeId === NORTH_DAKOTA_GROCERY_RUNTIME && sourceFresh(row, nowMs)
    && isNorthDakotaGroceryResearchInventory(reviewedResearchShape)
    && proof?.shadowOnly === false && proof.productionOnSiteOnly === true
    && proof.productionCohortSha256 === NORTH_DAKOTA_RETAIL_COHORT_SHA256
    && String(item?.storeId) === williston.merchantId && String(item?.id) === row.productId
    && String(item?.pid) === row.variantId && item?.channelEligibility?.inStore === true
    && String(item?.channelInventory?.instore ?? item?.channelInventory?.inStore) === '1'
    && (quantity == null || Number(quantity) > 0)
    && row.previewOnly !== true && row.quarantined !== true && row.stale !== true && row.sourceStale !== true
    && row.canAlertAsInventory === false && row.canAlertAsWatch === false && row.alertable === false
    && row.eligibleForOnSite === true && row.eligibleForDropFeed === true && row.eligibleForWatch === false
    && row.eligibleForDelivery === false && row.deliveryEligible === false
    && row.eligibleForEmail === false && row.eligibleForSms === false);
}

function productionCityHiveRows(report, bible, nowMs) {
  const metadata = report?.metadata, requests = metadata?.requests, receipts = metadata?.receipts;
  const queryFilter = centralCityHiveAllocatedQueryFilter(bible, 'ND');
  const requestTerms = (requests || []).map(request => {
    let url;
    try { url = new URL(request.url); } catch { return null; }
    return url.origin === cityHiveStore.baseUrl && url.pathname === '/shop/'
      && url.searchParams.get('merchant-id') === cityHiveStore.merchantId && url.searchParams.size === 2
      && url.searchParams.has('ch-query') ? url.searchParams.get('ch-query') : null;
  });
  if (metadata?.complete !== true || JSON.stringify(metadata.selectedStores) !== JSON.stringify([cityHiveStore.storeId])
    || !metadata.verifiedPremises?.includes(cityHiveStore.storeId)
    || !Array.isArray(requests) || requests.length !== 2 || !Array.isArray(receipts) || receipts.length !== 2
    || requests.some((request, index) => request.sourceId !== cityHiveStore.id || request.ok !== true || request.status !== 200
      || request.url !== receipts[index]?.url || receipts[index].status !== 200
      || canonicalUrl(receipts[index].finalUrl) !== canonicalUrl(request.url)
      || !Number.isSafeInteger(receipts[index].bytes) || receipts[index].bytes < 1 || receipts[index].bytes > 2 * 1024 * 1024
      || !/^[a-f0-9]{64}$/.test(receipts[index].sha256 || '') || !Number.isFinite(Date.parse(receipts[index].observedAt)))
    || !requestTerms.includes('bourbon') || requestTerms.some(term => term !== 'bourbon' && (!term || !queryFilter(term)))
    || new Set(requestTerms).size !== 2
    || report.signals?.some(row => !isCentralCityHiveInventory(row, { nowMs }))) {
    throw new Error('Grand Forks CityHive observation lacks complete exact-premise current inventory proof');
  }
  return report.signals.flatMap(row => {
    const record = (bible.records || []).find(value => value.id === row.canonicalBottleId);
    const tier = centralCityHiveRecordMarketTier(record, 'ND');
    if (!['limited', 'allocated', 'unicorn'].includes(tier)) return [];
    const value = silent({ ...row, tier, sourceRuntimeId: NORTH_DAKOTA_CITYHIVE_RUNTIME,
      sourceProductBinding: { ...row.sourceProductBinding, shadowOnly: false, productionOnSiteOnly: true,
        productionCohortSha256: NORTH_DAKOTA_RETAIL_COHORT_SHA256 },
      raw: { ...row.raw, shadowOnly: false } });
    if (!isNorthDakotaCityHiveProductionInventory(value, { nowMs })) throw new Error('Grand Forks production row lost exact source proof');
    return [value];
  });
}

function productionGroceryRows(observation, nowMs) {
  const exactSearch = (receipt, term) => {
    let url;
    try { url = new URL(receipt?.url); } catch { return false; }
    return receipt.status === 200 && canonicalUrl(receipt.finalUrl) === canonicalUrl(receipt.url) && receipt.storeId === williston.storeId
      && receipt.term === term && Number.isFinite(Date.parse(receipt.observedAt))
      && url.origin === 'https://www.albertsons.com' && url.pathname === '/abs/pub/xapi/search/substitute'
      && url.searchParams.get('storeid') === williston.merchantId && url.searchParams.get('q') === term
      && url.searchParams.get('channel') === 'instore' && url.searchParams.get('banner') === 'albertsons'
      && url.searchParams.get('start') === '0' && url.searchParams.get('rows') === '100';
  };
  if (!Array.isArray(observation?.receipts) || observation.receipts.length !== 3
    || observation.receipts[0].status !== 200 || observation.receipts[0].finalUrl !== williston.locator
    || observation.receipts[0].url !== williston.locator || observation.receipts[0].storeId !== williston.storeId
    || observation.plan?.terms?.length !== 1 || observation.unconfirmedQueries?.length !== 0
    || !exactSearch(observation.receipts[1], 'bourbon')
    || !exactSearch(observation.receipts[2], observation.plan.terms[0].toLowerCase())) {
    throw new Error('Williston observation lacks its complete locator and indexed in-store search set');
  }
  return observation.signals.map(row => {
    if (!isNorthDakotaGroceryResearchInventory(row) || !sourceFresh(row, nowMs)) {
      throw new Error('Williston production row lacks exact in-store source proof');
    }
    const value = silent({ ...row, sourceRuntimeId: NORTH_DAKOTA_GROCERY_RUNTIME,
      sourceProductBinding: { ...row.sourceProductBinding, shadowOnly: false, productionOnSiteOnly: true,
        productionCohortSha256: NORTH_DAKOTA_RETAIL_COHORT_SHA256 },
      raw: { ...(row.raw || {}), shadowOnly: false } });
    if (!isNorthDakotaAlbertsonsProductionInventory(value, { nowMs })) throw new Error('Williston production row lost exact in-store proof');
    return value;
  });
}

async function readAttemptState(file, sources) {
  try { return metroSourceAttempts(JSON.parse(await readFile(file, 'utf8')), sources); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}

async function writeAttemptState(file, state, attempts, sources) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify({ schemaVersion: 1, state,
      sourceAttempts: metroSourceAttempts({ sourceAttempts: attempts }, sources) }, null, 2));
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
}

async function readPromotionManifest(file = promotionManifestPath) {
  try {
    const value = JSON.parse(await readFile(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('North Dakota promotion manifest must be a JSON object');
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function minReceiptClock(receipts) {
  const times = (receipts || []).map(receipt => Date.parse(receipt.observedAt)).filter(Number.isFinite);
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
}

export async function collectNorthDakotaRetailProductionState(config = NORTH_DAKOTA_RETAIL_CONFIG, bible, options = {}) {
  const lifecycleConfig = options.lifecycleConfig || STATE_LIFECYCLE_CONFIG;
  const promotionManifest = options.promotionManifest || await readPromotionManifest(options.promotionManifestPath);
  const env = options.env || process.env;
  const startedAt = new Date().toISOString();
  if (!northDakotaRetailProductionAllowed(lifecycleConfig, { promotionManifest, env })) {
    return { state: 'ND', label: config.label, tier: config.tier, strategy: config.strategy, cadence: config.cadence,
      startedAt, finishedAt: new Date().toISOString(), lastGoodAt: null, stale: false, status: 'not_promoted',
      signals: [], sources: [], sourceResults: [], roadblocks: [], metadata: { blockedByPromotion: true, requestCount: 0,
        allDeliveryDisabled: true } };
  }

  const incidentDirectory = options.incidentDirectory || path.resolve('out/source-incidents/north-dakota');
  const attemptsFile = options.attemptsFile || path.join(incidentDirectory, 'grand-forks-cityhive-attempts.json');
  const collectCityHive = options.collectCityHiveObservation || (sourceOptions =>
    collectNorthDakotaCityHiveProductionObservation(bible, sourceOptions));
  const collectGrocery = options.collectGroceryObservation || (sourceOptions =>
    collectNorthDakotaGroceryObservation(bible, sourceOptions));
  const cityHiveAdapter = createSourceAdapter({
    id: NORTH_DAKOTA_CITYHIVE_RUNTIME,
    label: cityHiveStore.sourceLabel,
    url: cityHiveStore.baseUrl,
    domain: cityHiveStore.hostname,
    metadata: { stateId: 'ND', lane: 'promoted_cityhive_onsite', storeId: cityHiveStore.storeId },
    async execute(_context, { signal }) {
      const observed = await collectCityHive({
        ...options.cityHiveSourceOptions,
        productionAuthorized: true, signal,
        reportDirectory: null,
        incidentFile: options.cityHiveSourceOptions?.incidentFile || path.join(incidentDirectory, 'grand-forks-cityhive.json'),
        readAttempts: (_state, sources) => readAttemptState(attemptsFile, sources),
        writeAttempts: (_state, attempts, sources) => writeAttemptState(attemptsFile, 'ND', attempts, sources),
      });
      const nowMs = options.nowMs || Date.now();
      const signals = productionCityHiveRows(observed, bible, nowMs);
      const receipts = observed.metadata?.receipts || [];
      return { signals, metadata: { complete: true, source: 'cityhive', requests: observed.metadata.requests,
        verifiedPremises: observed.metadata.verifiedPremises, receipts }, observedAt: minReceiptClock(receipts) };
    },
    validate: value => value?.metadata?.complete === true && Array.isArray(value.signals)
      ? true : 'Grand Forks CityHive observation was incomplete',
    recordCount: value => value.signals.length,
  });
  const groceryAdapter = createSourceAdapter({
    id: NORTH_DAKOTA_GROCERY_RUNTIME,
    label: williston.sourceLabel,
    url: 'https://www.albertsons.com/abs/pub/xapi/search/substitute',
    domain: 'www.albertsons.com',
    metadata: { stateId: 'ND', lane: 'promoted_grocery_onsite', storeId: williston.storeId },
    async execute(_context, { signal }) {
      const observed = await collectGrocery({
        signal, reportDirectory: null,
        incidentFile: options.grocerySourceOptions?.incidentFile || path.join(incidentDirectory, 'williston-albertsons.json'),
        ...options.grocerySourceOptions,
      });
      const nowMs = options.nowMs || Date.now();
      const signals = productionGroceryRows(observed, nowMs);
      return { signals, metadata: { complete: true, source: 'albertsons', receipts: observed.receipts,
        plan: observed.plan, unconfirmedQueries: observed.unconfirmedQueries }, observedAt: minReceiptClock(observed.receipts) };
    },
    validate: value => value?.metadata?.complete === true && Array.isArray(value.signals)
      ? true : 'Williston Albertsons observation was incomplete',
    recordCount: value => value.signals.length,
  });
  const runner = await runSourceAdapters([cityHiveAdapter, groceryAdapter], {}, {
    ...options.sourceRunnerOptions,
    previousResults: options.previousSourceResults,
    circuitBreaker: options.sourceCircuitBreaker,
    concurrency: 2, perDomain: 1, schedule: false, maxAttempts: 1,
    timeoutMs: Math.min(Number(options.timeoutMs) || 120_000, 120_000),
  });
  const results = runner.results;
  const successful = results.filter(result => result.ok);
  const signals = results.flatMap(result => result.value?.signals || []);
  const allHealthy = successful.length === NORTH_DAKOTA_RETAIL_SOURCE_IDS.length;
  const currentClocks = successful.map(result => result.value?.observedAt).filter(value => Number.isFinite(Date.parse(value || '')));
  const lastGoodAt = allHealthy && currentClocks.length === NORTH_DAKOTA_RETAIL_SOURCE_IDS.length
    ? new Date(Math.min(...currentClocks.map(Date.parse))).toISOString() : null;
  const finishedAt = new Date().toISOString();
  const sourceRows = results.map(result => ({ sourceRuntimeId: result.sourceId, label: result.sourceLabel, url: result.sourceUrl,
    ok: result.ok, status: result.error?.status ?? (result.ok ? 200 : result.status),
    matchedBottleCount: result.value?.signals?.length ?? 0, stale: result.stale, error: result.error?.message ?? null }));
  const sourceResults = results.map(result => ({ ...summarizeSourceResult(result), alertable: false,
    lastGoodAt: result.lastGoodAt || result.value?.observedAt || null }));
  const roadblocks = results.filter(result => !result.ok).map(result => ({ state: 'ND', sourceRuntimeId: result.sourceId,
    source: result.sourceLabel, url: result.sourceUrl, status: result.error?.status ?? result.status,
    error: result.error?.message || `Source ${result.sourceId} failed` }));
  const retained = results.some(result => result.stale && result.value?.signals?.length);
  return { state: 'ND', label: config.label, tier: config.tier, strategy: config.strategy, cadence: config.cadence,
    startedAt, finishedAt, lastGoodAt, stale: !allHealthy && retained,
    status: allHealthy ? signals.length ? 'useful' : 'monitored_no_current_inventory'
      : successful.length ? 'partial_useful' : retained ? 'stale' : 'blocked',
    signals, sources: sourceRows, sourceResults, sourceCircuitState: runner.circuitState, roadblocks,
    metadata: { complete: allHealthy, productionActivationAllowed: false, customerDeliveryAllowed: false,
      allDeliveryDisabled: true, requestCount: successful.reduce((total, result) => total + Number(result.value?.metadata?.requests?.length
        ?? result.value?.metadata?.receipts?.length ?? 0), 0),
      sourceClocks: Object.fromEntries(results.map(result => [result.sourceId, result.value?.observedAt || result.lastGoodAt || null])),
      sourceObservations: Object.fromEntries(successful.map(result => [result.sourceId, result.value.metadata])),
      sourceHealth: sourceRows.map(row => ({ sourceRuntimeId: row.sourceRuntimeId, ok: row.ok, stale: row.stale,
        status: row.status, matchedBottleCount: row.matchedBottleCount })) } };
}
