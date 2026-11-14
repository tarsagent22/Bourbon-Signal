import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { STATE_LIFECYCLE_CONFIG } from '../state-lifecycle.mjs';
import { evaluateStateControl, validateImmutablePromotionEvidence } from '../reliability-policy.mjs';
import { isWithinCustomerFreshnessWindow } from '../customer-drop-freshness.mjs';
import { fetchReviewedFirstPartyText } from './central-cityhive-transport.mjs';
import sdManifest from '../../data/state-integration/SD.json' with {type:'json'};
import { reviewSouthDakotaPickup } from '../research-south-dakota-retailer.mjs';
import { fullAddress, origin, sources, southDakotaRetailerRequest, storeId } from '../south-dakota-pickup-policy.mjs';

const DAY = 86_400_000;
const DENIALS = new Set([401, 403, 429, 435]);
const hash = value => createHash('sha256').update(value).digest('hex');
export const southDakotaProductionRuntimeId = 'sd:mr-liquor-sante';
export const SOUTH_DAKOTA_PRODUCTION_COHORT_SHA256 = hash(JSON.stringify(sources));
export const SOUTH_DAKOTA_PRODUCTION_REQUEST_LIMIT = sources.reduce((sum, source) => sum + source.terms.length, 0);

const silent = row => ({...row, sourceRuntimeId: southDakotaProductionRuntimeId,
  sourceProductBinding: {...row.sourceProductBinding, shadowOnly: false, productionOnSiteOnly: true,
    productionCohortSha256: SOUTH_DAKOTA_PRODUCTION_COHORT_SHA256}, raw: {productionOnSiteOnly: true},
  canAlertAsInventory: false, canAlertAsWatch: false, alertable: false,
  eligibleForOnSite: true, eligibleForDropFeed: true, eligibleForWatch: false, eligibleForDelivery: false,
  eligibleForEmail: false, eligibleForSms: false});

const emptyJournal = () => ({schemaVersion: 1, hosts: {}, nextAllowedAt: null, lastAttemptAt: null, inFlight: null});
function strictJournal(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1
    || !value.hosts || typeof value.hosts !== 'object' || Array.isArray(value.hosts)
    || (value.nextAllowedAt != null && !Number.isFinite(Date.parse(value.nextAllowedAt)))
    || (value.lastAttemptAt != null && !Number.isFinite(Date.parse(value.lastAttemptAt)))
    || Object.entries(value.hosts).some(([host, item]) => !/^[a-z0-9.-]{1,253}$/i.test(host)
      || !item || !DENIALS.has(Number(item.httpStatus)) || !Number.isFinite(Date.parse(item.lastAttemptAt || ''))
      || !Number.isFinite(Date.parse(item.nextAllowedAt || ''))
      || Date.parse(item.nextAllowedAt) - Date.parse(item.lastAttemptAt) < DAY)) {
    throw Error('South Dakota production incident journal is invalid.');
  }
  return value;
}

async function readJournal(file) {
  try { return strictJournal(JSON.parse(await readFile(file, 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return emptyJournal(); throw error; }
}

async function writeJournal(file, value) {
  await mkdir(path.dirname(file), {recursive: true});
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, JSON.stringify(value)); await rename(temporary, file); }
  finally { await rm(temporary, {force: true}); }
}

export function southDakotaProductionConfigHash() {
  return hash(JSON.stringify({runtimeId: southDakotaProductionRuntimeId, cohort: SOUTH_DAKOTA_PRODUCTION_COHORT_SHA256,
    inventoryAlertable: false, watchAlertable: false, requestLimit: SOUTH_DAKOTA_PRODUCTION_REQUEST_LIMIT}));
}

export function southDakotaProductionAllowed({lifecycleConfig = STATE_LIFECYCLE_CONFIG, manifest, env = process.env} = {}) {
  const state = lifecycleConfig?.states?.SD, evidence = state?.promotionEvidence;
  const policy = {...lifecycleConfig?.reliabilityPolicy?.promotionPolicy,
    minShadowRuns: Math.max(3, Number(lifecycleConfig?.reliabilityPolicy?.promotionPolicy?.minShadowRuns) || 3),
    minCanaryRuns: Math.max(2, Number(lifecycleConfig?.reliabilityPolicy?.promotionPolicy?.minCanaryRuns) || 2)};
  return Boolean(lifecycleConfig?.activeStates?.includes('SD') && state?.publicStatus === 'active'
    && state.inventoryAlertable === false && state.watchAlertable === false
    && manifest?.state === 'SD' && manifest.lifecycle?.publicStatus === 'active'
    && manifest.lifecycle?.refinementLevel === 'store'
    && manifest.collector?.sourceIds?.length === 1
    && manifest.collector.sourceIds[0] === southDakotaProductionRuntimeId
    && manifest.collector.cohortSha256 === SOUTH_DAKOTA_PRODUCTION_COHORT_SHA256
    && manifest.collector.sourceConfigHash === southDakotaProductionConfigHash()
    && manifest.storeIdentity?.mode === 'exact_reviewed_store_pickup' && manifest.storeIdentity.expectedKnownStores === sources.length
    && JSON.stringify(manifest.storeIdentity?.storeIds) === JSON.stringify(sources.map(storeId))
    && manifest.sourceSemantics?.inventoryAlertable === false && manifest.sourceSemantics?.watchAlertable === false
    && Number(evidence?.shadowRuns) >= policy.minShadowRuns && Number(evidence?.canaryRuns) >= policy.minCanaryRuns
    && evidence.verticalSliceManifest === 'engine/data/state-integration/SD.json'
    && evidence.fixtureContract === 'engine/data/state-fixtures/SD.json'
    && validateImmutablePromotionEvidence('SD', evidence, policy)
    && evidence.immutableEvidence.sourceConfigHash === southDakotaProductionConfigHash()
    && JSON.stringify(manifest.evidence?.immutablePromotionEvidence) === JSON.stringify(evidence.immutableEvidence)
    && evaluateStateControl('SD', env).collect && evaluateStateControl('SD', env).publishCandidate);
}

function validProductionRow(row, nowMs) {
  const source = sources.find(item => storeId(item) === row?.storeId);
  const proof = row?.sourceProductBinding;
  return Boolean(source && row.state === 'SD' && row.city === 'Rapid City' && row.storeAddress === fullAddress(source)
    && row.sourceRuntimeId === southDakotaProductionRuntimeId && proof?.source === 'mr-liquor-sante'
    && proof.productionOnSiteOnly === true && proof.productionCohortSha256 === SOUTH_DAKOTA_PRODUCTION_COHORT_SHA256
    && proof.shadowOnly === false && proof.storeId === row.storeId && proof.storeAddress === row.storeAddress
    && proof.premiseVerified === true && proof.pickupOfferVerified === true
    && proof.observedAt === row.observedAt && proof.canonicalBottleId === row.canonicalBottleId
    && proof.availableToOrder > 0 && row.sourceAvailabilityVerified === true && row.availabilityStatus === 'in_stock'
    && row.quantity === 0 && row.quantityIsExact === false && row.canAlertAsInventory === false && row.canAlertAsWatch === false
    && row.alertable === false && row.eligibleForDelivery === false && row.eligibleForEmail === false && row.eligibleForSms === false
    && isWithinCustomerFreshnessWindow(row, nowMs, {currentInventory: true}));
}

export async function collectSouthDakotaProductionState(config, bible, {
  lifecycleConfig = STATE_LIFECYCLE_CONFIG, promotionManifest = sdManifest, env = process.env,
  fetchText = fetchReviewedFirstPartyText, nowMs = Date.now(), signal,
  incidentFile = path.resolve('out/source-incidents/south-dakota/state.json'),
} = {}) {
  const label = 'South Dakota reviewed first-party pickup availability';
  const allowed = southDakotaProductionAllowed({lifecycleConfig, manifest: promotionManifest, env});
  if (!allowed) return {state: 'SD', label, tier: 'B', strategy: 'retailer_store_inventory', cadence: '30m',
    startedAt: new Date(nowMs).toISOString(), finishedAt: new Date(nowMs).toISOString(), lastGoodAt: null,
    status: 'not_promoted', stale: false, signals: [], sources: [], sourceResults: [], roadblocks: [],
    metadata: {blockedByPromotion: true, requestCount: 0, allDeliveryDisabled: true}};

  const host = new URL(origin).hostname;
  let journal = await readJournal(incidentFile);
  if (journal.inFlight) throw Error('South Dakota has an unresolved prior production attempt.');
  const denied = journal.hosts[host];
  if (denied && Date.parse(denied.nextAllowedAt) > nowMs) throw Error(`South Dakota source host is denied until ${denied.nextAllowedAt}.`);
  if (journal.nextAllowedAt && Date.parse(journal.nextAllowedAt) > nowMs) throw Error(`South Dakota source cadence is not due until ${journal.nextAllowedAt}.`);
  journal = {...journal, lastAttemptAt: new Date(nowMs).toISOString(), nextAllowedAt: new Date(nowMs + 30 * 60_000).toISOString(),
    inFlight: {attemptId: randomUUID(), startedAt: new Date(nowMs).toISOString()}};
  await writeJournal(incidentFile, journal);

  const requests = [], signals = new Map(), roadblocks = [];
  try {
    for (const source of sources) for (const term of source.terms) {
      signal?.throwIfAborted();
      if (requests.length) await new Promise(resolve => setTimeout(resolve, 1000));
      const url = southDakotaRetailerRequest(term), observedAt = new Date().toISOString();
      const response = await fetchText(url, {signal, timeoutMs: 9000, maxBytes: 2 * 1024 * 1024,
        headers: {accept: 'application/json', cookie: 'childStorePublicId=' + source.publicId}, isAllowedUrl: target => target.href === url,
        onResponse: async result => {
          if (!DENIALS.has(Number(result.status))) return;
          const at = Date.now(), retry = Math.max(0, Number(result.retryAfterSeconds) || 0);
          journal = {...journal, inFlight: null, hosts: {...journal.hosts, [host]: {httpStatus: Number(result.status),
            lastAttemptAt: new Date(at).toISOString(), retryAfterSeconds: retry,
            nextAllowedAt: new Date(Math.min(8_640_000_000_000_000, Math.max(at + DAY, at + retry * 1000))).toISOString()}}};
          await writeJournal(incidentFile, journal);
        }});
      const seenAt = new Date().toISOString();
      const checked = response.status === 200 && response.url === url
        ? reviewSouthDakotaPickup(JSON.parse(response.text), source.id, bible, seenAt, url) : null;
      if (!checked) throw Object.assign(Error(`South Dakota exact pickup verification failed (${response.status}).`), {status: response.status});
      requests.push({storeId: storeId(source), query: term, url, status: response.status, ok: true, observedAt: seenAt,
        sha256: hash(response.text)});
      for (const row of checked.signals) {
        const candidate = silent(row);
        if (!validProductionRow(candidate, Date.now())) continue;
        signals.set(candidate.id, candidate);
      }
    }
    journal = {...journal, inFlight: null}; await writeJournal(incidentFile, journal);
  } catch (error) {
    if (!Object.values(journal.hosts).some(item => Date.parse(item.nextAllowedAt) > Date.now())) {
      journal = {...journal, inFlight: null}; await writeJournal(incidentFile, journal);
    }
    throw error;
  }
  const rows = [...signals.values()], finishedAt = new Date().toISOString();
  const sourceReport = {sourceRuntimeId: southDakotaProductionRuntimeId, label, url: origin, ok: true, status: 200,
    signalType: 'retailer_store_inventory_result', matchedBottleCount: rows.length, inventoryAlertable: false, watchAlertable: false};
  return {state: 'SD', label, tier: 'B', strategy: 'retailer_store_inventory', cadence: '30m',
    startedAt: new Date(nowMs).toISOString(), finishedAt, lastGoodAt: rows.length ? requests.at(-1)?.observedAt : null,
    status: rows.length ? 'useful' : 'monitored_no_current_inventory', stale: false, signals: rows,
    sources: [sourceReport], sourceResults: [{...sourceReport,lastGoodAt:requests.at(-1)?.observedAt||null,alertable:false}], roadblocks,
    metadata: {southDakota: {complete: true, selectedStores: sources.map(storeId),
      verifiedPremises: sources.map(storeId), requests, sourceObservedAt: requests.at(-1)?.observedAt || null,
      cohortSha256: SOUTH_DAKOTA_PRODUCTION_COHORT_SHA256, productionAlertDeliveryAllowed: false},
      allDeliveryDisabled: true, requestCount: requests.length}};
}
