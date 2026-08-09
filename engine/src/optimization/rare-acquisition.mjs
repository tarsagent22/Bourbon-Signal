import { open, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

export const RARE_ACQUISITION_CONTRACT_VERSION = 'bourbon-signal-rare-acquisition-v1';
export const RARE_ACQUISITION_LEDGER_VERSION = 'bourbon-signal-rare-acquisition-ledger-v1';
export const RARE_ACQUISITION_REPORT_VERSION = 'bourbon-signal-rare-acquisition-report-v1';

const freezeFamilies = (families) => Object.freeze(families.map((family) => Object.freeze({
  ...family,
  terms: Object.freeze([...family.terms]),
})));

export const RARE_PRODUCT_FAMILIES = freezeFamilies([
  { id: 'btac', demandWeight: 10, terms: ['George T. Stagg', 'William Larue Weller', 'Thomas H. Handy', 'Sazerac 18'] },
  { id: 'van-winkle', demandWeight: 10, terms: ['Van Winkle', 'Pappy'] },
  { id: 'weller', demandWeight: 9, terms: ['Weller'] },
  { id: 'stagg', demandWeight: 9, terms: ['Stagg'] },
  { id: 'eh-taylor', demandWeight: 8, terms: ['E.H. Taylor'] },
  { id: 'blantons', demandWeight: 8, terms: ["Blanton's"] },
  { id: 'old-fitzgerald', demandWeight: 8, terms: ['Old Fitzgerald'] },
  { id: 'four-roses-le', demandWeight: 7, terms: ['Four Roses Limited'] },
  { id: 'michters-age-stated', demandWeight: 8, terms: ["Michter's 10", "Michter's 20", "Michter's 25"] },
  { id: 'parkers-heritage', demandWeight: 7, terms: ["Parker's Heritage"] },
  { id: 'russells-age-stated', demandWeight: 7, terms: ["Russell's 13", "Russell's 15"] },
  { id: 'king-of-kentucky', demandWeight: 9, terms: ['King of Kentucky'] },
  { id: 'heaven-hill-heritage', demandWeight: 7, terms: ['Heaven Hill Heritage'] },
]);

const FAMILY_BY_ID = new Map(RARE_PRODUCT_FAMILIES.map((family) => [family.id, family]));

export const PLATFORM_RARE_CAPABILITIES = Object.freeze({
  cityhive: Object.freeze({ discovery: 'brand_facet', monitoring: 'exact_product_option_page', activation: 'exact_store_policy_required' }),
  shopify: Object.freeze({ discovery: 'bounded_collection_or_products_json', monitoring: 'exact_variant_pickup', activation: 'shadow_only_without_exact_pickup' }),
  woocommerce: Object.freeze({ discovery: 'store_api_search', monitoring: 'exact_product_store_api', activation: 'shadow_only_without_exact_store_fulfillment' }),
  lightspeed: Object.freeze({ discovery: 'bounded_category', monitoring: 'exact_product_json', activation: 'exact_single_store_policy_required' }),
  gotoliquorstore: Object.freeze({ discovery: 'bounded_store_category', monitoring: 'exact_product_page', activation: 'visible_store_bound_orderability_required' }),
  'control-state': Object.freeze({ discovery: 'official_product_shards', monitoring: 'official_store_inventory', activation: 'official_exact_store_policy_required' }),
});

const source = (state, sourceId, maxTasksPerRun, familyIds, options = {}) => Object.freeze({
  state,
  sourceId,
  platform: options.platform || 'cityhive',
  mode: options.mode || 'shadow',
  allowedHosts: Object.freeze((options.allowedHosts || []).map((host) => String(host).toLowerCase())),
  maxTasksPerRun,
  familyIds: Object.freeze([...familyIds]),
});

export const RARE_SOURCE_REGISTRY = Object.freeze([
  source('GA', '74-package', 3, ['weller', 'old-fitzgerald', 'blantons'], { allowedHosts: ['74package.com'] }),
  source('FL', 'bourbon-barn-gainesville', 2, ['weller', 'blantons', 'stagg', 'old-fitzgerald'], { allowedHosts: ['bourbonbarnfl.com'] }),
  source('FL', 'big-daddys-liquors', 2, ['weller', 'blantons', 'stagg', 'eh-taylor'], { allowedHosts: ['bigdaddysliquors.com'] }),
  source('FL', 'golden-ox-liquors', 1, ['weller', 'blantons', 'stagg'], { allowedHosts: ['goldenoxliquors.com'] }),
  source('TN', 'happy-ours-wine-and-spirits', 2, ['weller', 'blantons', 'stagg', 'eh-taylor'], { allowedHosts: ['happyour0c3f6e1f.sites.cityhive.app'] }),
  source('TN', 'corkdorks', 1, ['weller', 'blantons', 'stagg'], { allowedHosts: ['corkdorkswine.com'] }),
  source('TN', 'frugal-macdoogal', 1, ['weller', 'blantons', 'stagg'], { allowedHosts: ['www.frugalmacdoogal.com'] }),
  source('IN', 'cap-n-cork', 2, ['weller', 'blantons', 'stagg', 'eh-taylor'], { allowedHosts: ['capncork.com'] }),
  source('IN', 'big-red', 2, ['weller', 'blantons', 'stagg', 'old-fitzgerald'], { allowedHosts: ['bigredliquors.com'] }),
  source('NV', 'liquor-world-las-vegas', 2, ['weller', 'blantons', 'stagg', 'michters-age-stated'], { allowedHosts: ['liquorworldlv.com'] }),
]);

const SOURCE_BY_KEY = new Map(RARE_SOURCE_REGISTRY.map((entry) => [`${entry.state}|${entry.sourceId}`, entry]));

function stateId(value) {
  return String(value || '').trim().toUpperCase();
}

function text(value) {
  return String(value || '').trim();
}

function finiteTime(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function simpleHash(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function timeSlot(at, hours = 6) {
  const parsed = finiteTime(at);
  return parsed == null ? 0 : Math.floor(parsed / (hours * 60 * 60_000));
}

function ledgerEntryKey({ state, sourceId, merchantId, familyId }) {
  return [stateId(state), text(sourceId), text(merchantId), text(familyId)].join('|');
}

function productKey(product) {
  return `${text(product?.productId)}|${text(product?.variantId || product?.optionId)}`;
}

function copyLedger(value) {
  return value?.contractVersion === RARE_ACQUISITION_LEDGER_VERSION
    ? structuredClone(value)
    : { contractVersion: RARE_ACQUISITION_LEDGER_VERSION, generatedAt: null, entries: {} };
}

function eligibleAt(entry, at) {
  const next = finiteTime(entry?.nextEligibleAt);
  const now = finiteTime(at);
  return next == null || now == null || next <= now;
}

function registrySource(candidate) {
  const state = stateId(candidate?.state);
  const sourceId = text(candidate?.sourceId);
  const approved = SOURCE_BY_KEY.get(`${state}|${sourceId}`);
  if (!approved || approved.platform !== text(candidate?.platform || 'cityhive')) return null;
  return approved;
}

function candidateIdentity(candidate) {
  return `${stateId(candidate.state)}|${text(candidate.sourceId)}|${text(candidate.merchantId)}|${text(candidate.categoryUrl)}`;
}

function validateCandidate(candidate) {
  const approved = registrySource(candidate);
  if (!approved || !text(candidate.merchantId) || !text(candidate.categoryUrl)) return null;
  let url;
  try { url = new URL(candidate.categoryUrl); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
  if (!approved.allowedHosts.includes(url.hostname.toLowerCase())) return null;
  return { ...candidate, state: stateId(candidate.state), sourceId: text(candidate.sourceId), merchantId: text(candidate.merchantId), categoryUrl: url.href, approved };
}

function knownProductTasks(candidate, familyId, entry, at) {
  if (!eligibleAt(entry, at)) return [];
  return Object.values(entry?.knownProducts || {})
    .filter((product) => text(product.productId) && text(product.variantId) && text(product.productUrl))
    .sort((left, right) => {
      const availability = Number(right.availability === 'available') - Number(left.availability === 'available');
      return availability || String(left.lastCheckedAt || '').localeCompare(String(right.lastCheckedAt || '')) || productKey(left).localeCompare(productKey(right));
    })
    .map((product) => ({
      state: candidate.state,
      sourceId: candidate.sourceId,
      platform: candidate.approved.platform,
      merchantId: candidate.merchantId,
      familyId,
      mode: 'monitor',
      term: FAMILY_BY_ID.get(familyId)?.terms[0] || familyId,
      productId: product.productId,
      variantId: product.variantId,
      productUrl: product.productUrl,
      categoryUrl: candidate.categoryUrl,
      score: 10_000 + Number(FAMILY_BY_ID.get(familyId)?.demandWeight || 1) * 100,
    }));
}

function discoveryTask(candidate, familyId, entry, at) {
  if (!eligibleAt(entry, at)) return null;
  const family = FAMILY_BY_ID.get(familyId);
  if (!family) return null;
  const rotation = simpleHash(`${candidateIdentity(candidate)}|${familyId}|${timeSlot(at)}`) % family.terms.length;
  const positive = Number(entry?.positiveObservationCount || 0);
  const empty = Number(entry?.consecutiveEmptyChecks || 0);
  return {
    state: candidate.state,
    sourceId: candidate.sourceId,
    platform: candidate.approved.platform,
    merchantId: candidate.merchantId,
    familyId,
    mode: 'discovery',
    term: family.terms[rotation],
    productId: null,
    variantId: null,
    productUrl: null,
    categoryUrl: candidate.categoryUrl,
    score: family.demandWeight * 100 + positive * 50 - empty * 20,
  };
}

export function buildRareAcquisitionPlan({ state, candidates = [], ledger = null, at = new Date().toISOString(), stateRequestBudget = 8 } = {}) {
  const selectedState = stateId(state);
  const budget = Math.max(0, Math.min(50, Math.floor(Number(stateRequestBudget) || 0)));
  const sourceCounts = new Map();
  const merchantCounts = new Map();
  const prepared = [];
  for (const raw of candidates) {
    const candidate = validateCandidate(raw);
    if (!candidate || candidate.state !== selectedState) continue;
    for (const familyId of candidate.approved.familyIds) {
      const entry = ledger?.entries?.[ledgerEntryKey({ ...candidate, familyId })] || null;
      const monitors = knownProductTasks(candidate, familyId, entry, at);
      if (monitors.length) prepared.push(...monitors);
      else {
        const discovery = discoveryTask(candidate, familyId, entry, at);
        if (discovery) prepared.push(discovery);
      }
    }
  }
  prepared.sort((left, right) => right.score - left.score
    || simpleHash(`${candidateIdentity(left)}|${left.familyId}|${timeSlot(at)}`) - simpleHash(`${candidateIdentity(right)}|${right.familyId}|${timeSlot(at)}`)
    || candidateIdentity(left).localeCompare(candidateIdentity(right))
    || left.familyId.localeCompare(right.familyId));

  const tasks = [];
  const seen = new Set();
  for (const candidate of prepared) {
    if (tasks.length >= budget) break;
    const approved = SOURCE_BY_KEY.get(`${candidate.state}|${candidate.sourceId}`);
    const sourceKey = `${candidate.state}|${candidate.sourceId}`;
    const merchantKey = `${sourceKey}|${candidate.merchantId}`;
    if (Number(sourceCounts.get(sourceKey) || 0) >= approved.maxTasksPerRun) continue;
    if (Number(merchantCounts.get(merchantKey) || 0) >= approved.maxTasksPerRun) continue;
    const identity = `${merchantKey}|${candidate.familyId}|${candidate.mode}|${candidate.productId || candidate.term}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    sourceCounts.set(sourceKey, Number(sourceCounts.get(sourceKey) || 0) + 1);
    merchantCounts.set(merchantKey, Number(merchantCounts.get(merchantKey) || 0) + 1);
    tasks.push({
      ...candidate,
      id: `rare:${simpleHash(`${identity}|${at}`).toString(16).padStart(8, '0')}`,
    });
  }
  return {
    contractVersion: RARE_ACQUISITION_CONTRACT_VERSION,
    state: selectedState,
    generatedAt: at,
    requestBudget: budget,
    candidateCount: candidates.length,
    tasks,
  };
}

export function buildCityHiveRareAcquisitionUrls(candidate, tasks = []) {
  const approved = registrySource(candidate);
  if (!approved || approved.platform !== 'cityhive') return [];
  const reviewed = validateCandidate(candidate);
  if (!reviewed) throw new Error('CityHive rare acquisition requires a reviewed HTTPS first-party source and exact merchant ID.');
  const baseline = new URL(reviewed.categoryUrl);
  const urls = [];
  const seen = new Set();
  for (const task of tasks) {
    if (stateId(task.state) !== stateId(candidate.state) || text(task.sourceId) !== text(candidate.sourceId) || text(task.merchantId) !== text(candidate.merchantId)) continue;
    let url;
    if (task.mode === 'monitor' && task.productUrl) {
      url = new URL(task.productUrl);
      if (url.origin !== baseline.origin) continue;
    } else {
      url = new URL(baseline.href);
      url.searchParams.set('brands', text(task.term));
    }
    if (url.protocol !== 'https:' || url.origin !== baseline.origin || url.username || url.password || url.hash) continue;
    url.searchParams.set('merchant-id', text(candidate.merchantId));
    url.searchParams.delete('skip');
    const href = url.href;
    if (!seen.has(href)) { seen.add(href); urls.push(href); }
  }
  return urls;
}

function nextBackoffAt(at, count, kind) {
  const now = finiteTime(at) ?? Date.now();
  const baseHours = kind === 'rate_limited' ? 12 : kind === 'failed' ? 2 : 6;
  const hours = Math.min(7 * 24, baseHours * (2 ** Math.max(0, Math.min(5, count - 1))));
  return new Date(now + hours * 60 * 60_000).toISOString();
}

export function updateRareAcquisitionLedger(current, { at = new Date().toISOString(), tasks = [], outcomes = [] } = {}) {
  const ledger = copyLedger(current);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  for (const outcome of outcomes) {
    const task = taskById.get(outcome.taskId);
    if (!task) continue;
    const key = ledgerEntryKey(task);
    const previous = ledger.entries[key] || {
      state: stateId(task.state), sourceId: text(task.sourceId), merchantId: text(task.merchantId), familyId: text(task.familyId),
      checks: 0, positiveObservationCount: 0, consecutiveEmptyChecks: 0, consecutiveFailures: 0, knownProducts: {}, checkEvents: {},
    };
    const previousEvents = { ...(previous.checkEvents || {}) };
    const entry = { ...previous, knownProducts: { ...(previous.knownProducts || {}) }, checkEvents: previousEvents, lastCheckedAt: at, lastStatus: outcome.status };
    const observations = Array.isArray(outcome.observations) ? outcome.observations : [];
    if (outcome.status === 'empty') {
      entry.consecutiveEmptyChecks = Number(previous.consecutiveEmptyChecks || 0) + 1;
      entry.consecutiveFailures = 0;
      entry.nextEligibleAt = nextBackoffAt(at, entry.consecutiveEmptyChecks, 'empty');
    } else if (outcome.status === 'failed' || outcome.status === 'rate_limited') {
      entry.consecutiveFailures = Number(previous.consecutiveFailures || 0) + 1;
      entry.nextEligibleAt = nextBackoffAt(at, entry.consecutiveFailures, outcome.status);
    } else if (outcome.status === 'success') {
      entry.consecutiveEmptyChecks = 0;
      entry.consecutiveFailures = 0;
      entry.nextEligibleAt = new Date((finiteTime(at) ?? Date.now()) + 30 * 60_000).toISOString();
      for (const observation of observations) {
        const pKey = productKey(observation);
        if (pKey === '|') continue;
        const product = { ...(entry.knownProducts[pKey] || {}), productId: text(observation.productId), variantId: text(observation.variantId || observation.optionId), productUrl: text(observation.productUrl), lastCheckedAt: at };
        if (observation.available === true) {
          product.availability = 'available';
          product.lastInventoryConfirmedAt = at;
        } else if (observation.available === false) {
          product.availability = 'unavailable';
          product.lastUnavailableConfirmedAt = at;
        }
        if (observation.quantity != null) product.lastQuantity = observation.quantity;
        entry.knownProducts[pKey] = product;
      }
    }
    const previousEventCount = Object.keys(previousEvents).length;
    const previousEventPositives = Object.values(previousEvents)
      .reduce((total, event) => total + Math.max(0, Number(event?.positiveObservationCount) || 0), 0);
    const eventId = `${at}|${text(task.id)}|${text(outcome.status)}`;
    entry.checkEvents[eventId] = {
      checkedAt: at,
      status: text(outcome.status),
      positiveObservationCount: observations.filter((observation) => observation?.available === true).length,
    };
    const legacyCheckFloor = Math.max(0, Number(previous.checks || 0) - previousEventCount);
    const legacyPositiveFloor = Math.max(0, Number(previous.positiveObservationCount || 0) - previousEventPositives);
    entry.checks = legacyCheckFloor + Object.keys(entry.checkEvents).length;
    entry.positiveObservationCount = legacyPositiveFloor + Object.values(entry.checkEvents)
      .reduce((total, event) => total + Math.max(0, Number(event?.positiveObservationCount) || 0), 0);
    ledger.entries[key] = entry;
  }
  ledger.generatedAt = at;
  return ledger;
}

function observationIdentity(observation) {
  return [observation?.sourceId, observation?.merchantId, observation?.productId, observation?.variantId || observation?.optionId].map(text).join('|');
}

export async function executeRareAcquisitionPlan(plan, probe) {
  if (plan?.contractVersion !== RARE_ACQUISITION_CONTRACT_VERSION || !Array.isArray(plan.tasks)) throw new TypeError('A valid rare acquisition plan is required.');
  if (typeof probe !== 'function') throw new TypeError('A rare acquisition probe function is required.');
  const blockedSources = new Set();
  const outcomes = [];
  const observations = [];
  const seen = new Set();
  let deduplicatedObservationCount = 0;
  let requestCount = 0;
  for (const task of plan.tasks) {
    if (blockedSources.has(task.sourceId)) continue;
    requestCount += 1;
    try {
      const response = await probe(task);
      const statusCode = Number(response?.status || 0);
      const rows = Array.isArray(response?.observations) ? response.observations : [];
      const status = statusCode === 429 ? 'rate_limited' : statusCode >= 200 && statusCode < 300 ? (rows.length ? 'success' : 'empty') : 'failed';
      if (status === 'rate_limited') blockedSources.add(task.sourceId);
      outcomes.push({ taskId: task.id, status, statusCode, observations: rows });
      for (const row of rows) {
        const key = observationIdentity(row);
        if (!key.replaceAll('|', '')) continue;
        if (seen.has(key)) { deduplicatedObservationCount += 1; continue; }
        seen.add(key); observations.push(row);
      }
    } catch (error) {
      outcomes.push({ taskId: task.id, status: 'failed', statusCode: 0, observations: [], error: error instanceof Error ? error.message : String(error) });
    }
  }
  return {
    contractVersion: RARE_ACQUISITION_CONTRACT_VERSION,
    outcomes,
    observations,
    metrics: {
      requestCount,
      successfulRequestCount: outcomes.filter((outcome) => outcome.status === 'success').length,
      emptyRequestCount: outcomes.filter((outcome) => outcome.status === 'empty').length,
      failedRequestCount: outcomes.filter((outcome) => outcome.status === 'failed').length,
      rateLimitedSourceCount: blockedSources.size,
      deduplicatedObservationCount,
    },
  };
}

export function normalizeRareAcquisitionQuantity(value, { explicitlyAvailable = false, anomalyThreshold = 100 } = {}) {
  const parsed = value == null || value === '' ? null : Number(value);
  if (parsed != null && Number.isFinite(parsed) && parsed <= 0) return { available: false, quantity: 0, quantityIsExact: true, anomalous: false };
  if (parsed != null && Number.isFinite(parsed) && parsed > 0 && parsed < anomalyThreshold) return { available: true, quantity: Math.floor(parsed), quantityIsExact: true, anomalous: false };
  if (parsed != null && Number.isFinite(parsed) && parsed >= anomalyThreshold) return { available: true, quantity: 0, quantityIsExact: false, anomalous: true };
  return { available: explicitlyAvailable === true, quantity: 0, quantityIsExact: false, anomalous: false };
}

export function buildRareAcquisitionReport({ state, at = new Date().toISOString(), candidateSourceCount = 0, plan = {}, execution = {}, acceptedSignals = [] } = {}) {
  const requests = Number(execution?.metrics?.requestCount ?? execution?.outcomes?.length ?? 0);
  const accepted = Array.isArray(acceptedSignals) ? acceptedSignals : [];
  const rare = accepted.filter((signal) => ['limited', 'allocated', 'unicorn'].includes(String(signal?.tier || '').toLowerCase()));
  const observations = Array.isArray(execution?.observations) ? execution.observations : [];
  return {
    contractVersion: RARE_ACQUISITION_REPORT_VERSION,
    state: stateId(state),
    generatedAt: at,
    funnel: {
      eligibleSources: Math.max(0, Number(candidateSourceCount) || 0),
      tasksPlanned: Array.isArray(plan?.tasks) ? plan.tasks.length : 0,
      requestsAttempted: requests,
      requestsSuccessful: (execution?.outcomes || []).filter((outcome) => outcome.status === 'success').length,
      requestsEmpty: (execution?.outcomes || []).filter((outcome) => outcome.status === 'empty').length,
      requestsFailed: (execution?.outcomes || []).filter((outcome) => outcome.status === 'failed').length,
      rateLimitedSources: Number(execution?.metrics?.rateLimitedSourceCount || 0),
      observations: observations.length,
      positiveInventoryObservations: observations.filter((observation) => observation?.available === true).length,
      deduplicatedObservations: Number(execution?.metrics?.deduplicatedObservationCount || 0),
      acceptedExactStoreSignals: accepted.filter((signal) => signal?.canAlertAsInventory === true).length,
      acceptedRareSignals: rare.length,
    },
    efficiency: {
      acceptedRareSignalsPerRequest: requests ? rare.length / requests : 0,
      positiveObservationsPerRequest: requests ? observations.filter((observation) => observation?.available === true).length / requests : 0,
    },
  };
}

export async function readRareAcquisitionLedger(state, { root = path.resolve('out', 'optimization', 'rare-acquisition') } = {}) {
  const filePath = path.join(root, `${stateId(state)}.json`);
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8'));
    if (parsed?.contractVersion !== RARE_ACQUISITION_LEDGER_VERSION) {
      throw new Error(`Unsupported rare-acquisition ledger contract in ${filePath}`);
    }
    return parsed;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new Error(`Unable to read rare-acquisition ledger ${filePath}: ${error?.message || error}`, { cause: error });
  }
}

function latestTimestamp(...values) {
  return values.reduce((latest, value) => Math.max(latest, finiteTime(value) || 0), 0);
}

function mergeLedgerEntries(previous, next) {
  if (!previous) return next;
  if (!next) return previous;
  const previousEvents = previous.checkEvents || {};
  const nextEvents = next.checkEvents || {};
  const checkEvents = { ...previousEvents, ...nextEvents };
  const previousPositiveEvents = Object.values(previousEvents)
    .reduce((total, event) => total + Math.max(0, Number(event?.positiveObservationCount) || 0), 0);
  const nextPositiveEvents = Object.values(nextEvents)
    .reduce((total, event) => total + Math.max(0, Number(event?.positiveObservationCount) || 0), 0);
  const legacyCheckFloor = Math.max(
    0,
    Number(previous.checks || 0) - Object.keys(previousEvents).length,
    Number(next.checks || 0) - Object.keys(nextEvents).length,
  );
  const legacyPositiveFloor = Math.max(
    0,
    Number(previous.positiveObservationCount || 0) - previousPositiveEvents,
    Number(next.positiveObservationCount || 0) - nextPositiveEvents,
  );
  const knownProducts = { ...(previous.knownProducts || {}) };
  for (const [key, product] of Object.entries(next.knownProducts || {})) {
    const current = knownProducts[key];
    if (!current || latestTimestamp(product.lastCheckedAt) >= latestTimestamp(current.lastCheckedAt)) knownProducts[key] = product;
  }
  const newer = latestTimestamp(next.lastCheckedAt) >= latestTimestamp(previous.lastCheckedAt) ? next : previous;
  return {
    ...newer,
    checkEvents,
    knownProducts,
    checks: legacyCheckFloor + Object.keys(checkEvents).length,
    positiveObservationCount: legacyPositiveFloor + Object.values(checkEvents)
      .reduce((total, event) => total + Math.max(0, Number(event?.positiveObservationCount) || 0), 0),
  };
}

function mergePersistedLedgers(current, incoming) {
  if (current?.contractVersion !== RARE_ACQUISITION_LEDGER_VERSION) return incoming;
  if (incoming?.contractVersion !== RARE_ACQUISITION_LEDGER_VERSION) return current;
  const entries = { ...(current.entries || {}) };
  for (const [key, next] of Object.entries(incoming.entries || {})) entries[key] = mergeLedgerEntries(entries[key], next);
  const generatedAtMs = latestTimestamp(current.generatedAt, incoming.generatedAt);
  return {
    contractVersion: RARE_ACQUISITION_LEDGER_VERSION,
    generatedAt: generatedAtMs ? new Date(generatedAtMs).toISOString() : null,
    entries,
  };
}

async function acquireArtifactLock(lockPath, signal) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    signal?.throwIfAborted();
    try {
      return await open(lockPath, 'wx');
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        const lockStat = await stat(lockPath);
        if (Date.now() - lockStat.mtimeMs > 30_000) {
          await unlink(lockPath);
          continue;
        }
      } catch (statError) {
        if (statError?.code !== 'ENOENT') throw statError;
      }
      await sleep(25, undefined, signal ? { signal } : undefined);
    }
  }
  throw new Error(`Timed out acquiring rare-acquisition artifact lock: ${lockPath}`);
}

async function atomicWriteJson(filePath, value, signal) {
  const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, signal ? { signal } : undefined);
    signal?.throwIfAborted();
    await rename(temporaryPath, filePath);
  } finally {
    await unlink(temporaryPath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
}

export async function writeRareAcquisitionArtifacts(state, { ledger, report }, { root = path.resolve('out', 'optimization', 'rare-acquisition'), signal } = {}) {
  const id = stateId(state);
  if (!id) throw new Error('Rare-acquisition artifact state is required.');
  await mkdir(root, { recursive: true });
  const lockPath = path.join(root, `${id}.lock`);
  const lock = await acquireArtifactLock(lockPath, signal);
  try {
    const persistedLedger = ledger ? mergePersistedLedgers(await readRareAcquisitionLedger(id, { root }), ledger) : null;
    if (persistedLedger) await atomicWriteJson(path.join(root, `${id}.json`), persistedLedger, signal);
    if (report) await atomicWriteJson(path.join(root, `${id}-report.json`), report, signal);
    return { ledger: persistedLedger, report: report || null };
  } finally {
    await lock.close();
    await unlink(lockPath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
}
