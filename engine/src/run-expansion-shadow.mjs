#!/usr/bin/env node
import {isNewEnglandResearchInventory} from './new-england-policy.mjs';
import {isLouisianaAlaskaGroceryShadowInventory} from './research-louisiana-alaska-grocery-runtime.mjs';
import {verifyLouisianaAlaskaPositiveCaptures,verifiedLouisianaAlaskaPositiveReport} from './louisiana-alaska-grocery-positive-proof.mjs';
import { execFile, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { withResearchLifecycle, researchSourceForState, collectResearchStateReport } from './research-state-registry.mjs';
import {selectActiveResearchRenewals, suppressActiveRenewalReport, isActiveRenewalResearchInventory,
  validateActiveRenewalMaintenance, ACTIVE_RENEWAL_PRODUCTION_STATUSES, ACTIVE_RENEWAL_REPOSITORY} from './active-research-renewal.mjs';
import {westernGroceryPromotionAllowed} from './collectors/western-grocery-production.mjs';
import {centralCityHiveProductionAllowed} from './collectors/central-cityhive-production.mjs';
import {WESTERN_GROCERY_EXPANSION_SOURCES} from './collectors/western-grocery-premises.mjs';
import {CENTRAL_CITYHIVE_EXPANSION_SOURCES} from './collectors/central-cityhive-premises.mjs';
import {fetchReviewedFirstPartyText, readCityHiveIncidentJournal, validateCityHiveIncidentJournal,
  persistCityHiveIncidentJournal, CITYHIVE_DENIAL_STATUSES} from './collectors/central-cityhive-transport.mjs';
import {sourceErrorForHttp} from './sources/source-error.mjs';
import {BourbonBible} from './core/bible.mjs';
import {randomUUID} from 'node:crypto';
import {readBoundedCollectionBody} from './core/collection-http.mjs';
import {isCentralCityHiveResearchInventory} from './central-cityhive-policy.mjs';
import {verifyActiveRenewalRawCaptures,isVerifiedActiveRenewalNegativeReport} from './active-renewal-capture-proof.mjs';
import {isNjMiResearchSourceInventory} from './nj-mi-research-policy.mjs';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SHADOW_INVENTORY_MAX_AGE_MS = 2 * 60 * 60_000;
const OREGON_PREREQUISITE_TIMEOUT_MS = 3 * 60_000;
const verifiedMaintenance = new WeakSet();

function stateId(value) { return String(value || '').trim().toUpperCase(); }
function asArray(value) { return Array.isArray(value) ? value : []; }

export function selectShadowCandidates(lifecycle, { states = [], limit = 5 } = {}) {
  const active = new Set(asArray(lifecycle?.activeStates).map(stateId));
  const requested = new Set(asArray(states).map(stateId).filter(Boolean));
  return Object.entries(lifecycle?.states || {})
    .filter(([state, entry]) => !active.has(state) && entry?.publicStatus !== 'active' && entry?.shadowEligible === true)
    .map(([state]) => state)
    .filter((state) => requested.size === 0 || requested.has(state))
    .sort()
    .slice(0, Math.max(0, Number(limit) || 0));
}

export function validateShadowRunRequest(lifecycle, { requestedStates = [], candidates = [] } = {}) {
  if (!lifecycle || typeof lifecycle !== 'object' || !Array.isArray(lifecycle.activeStates) || !lifecycle.states || typeof lifecycle.states !== 'object') {
    throw new Error('Shadow collection requires a valid state lifecycle configuration.');
  }
  if (!Array.isArray(candidates) || candidates.length === 0) throw new Error('Shadow collection selected no eligible candidates.');
  const requested = new Set(asArray(requestedStates).map(stateId).filter(Boolean));
  const selected = new Set(candidates.map(stateId));
  for (const state of requested) {
    if (!selected.has(state)) throw new Error(`Requested shadow state ${state} is not eligible or was not selected.`);
  }
  return true;
}

function validTime(value) { return Number.isFinite(Date.parse(String(value || ''))); }

function inventoryRequired(report = {}) {
  return /inventory|locator|retailer/i.test(String(report.strategy || ''))
    || /needs_deeper_parser/i.test(String(report.status || ''))
    || asArray(report.signals).some((row) => row?.canAlertAsInventory === true);
}

function trustedCurrentInventorySignals(report = {}, { now = new Date().toISOString(), maximumAgeMs = SHADOW_INVENTORY_MAX_AGE_MS } = {}) {
  if (report?.stale === true) return [];
  const nowMs = Date.parse(String(now || ''));
  return asArray(report.signals).filter((row) => (row?.canAlertAsInventory === true
    || (report.metadata?.complete===true||verifiedLouisianaAlaskaPositiveReport(report))&&report.metadata.shadowOnly===true&&report.metadata.productionActivationAllowed===false
      &&report.metadata.customerDeliveryAllowed===false&&(isActiveRenewalResearchInventory(row,report,{nowMs})||isNewEnglandResearchInventory(row,{nowMs})||isLouisianaAlaskaGroceryShadowInventory(row)||isCentralCityHiveResearchInventory(row,{nowMs})||isNjMiResearchSourceInventory(row,{nowMs})))
    && row?.stale !== true
    && row?.locationPrecision === 'store_level'
    && String(row?.storeId ?? '').trim()
    && String(row?.storeAddress ?? '').trim()
    && (() => {
      const observedAt = Date.parse(String(row?.observedAt || row?.lastConfirmedAt || row?.eventAt || ''));
      const ageMs = nowMs - observedAt;
      return Number.isFinite(nowMs) && Number.isFinite(observedAt) && ageMs >= 0 && ageMs <= maximumAgeMs;
    })());
}

export function classifyShadowReadiness(report = {}, options = {}) {
  const signals = asArray(report.signals);
  const sources = asArray(report.sources);
  const sourceResults = asArray(report.sourceResults);
  const roadblocks = asArray(report.roadblocks);
  const discoverySucceeded = signals.length > 0 || sources.some((source) => source?.ok === true);
  const trustedInventory = trustedCurrentInventorySignals(report, options);
  const monitoredNoCurrentInventory = sources.some((source) => source?.ok === true
    && source?.zeroOutputExpected === true
    && source?.signalType === 'costco_warehouse_no_current_inventory');
  const verifiedRenewalNegative=isVerifiedActiveRenewalNegativeReport(report);
  const requiresInventory = inventoryRequired(report);
  const deeperParser = /needs_deeper_parser/i.test(String(report.status || ''));
  const prerequisite = roadblocks.find((roadblock) => /not_configured|missing|ENOENT|stale|invalid_(?:timestamp|observation)|dependency_unavailable/i.test(
    `${roadblock?.status || ''} ${roadblock?.error || ''}`,
  ));
  const discoveryFailures = roadblocks.filter((roadblock) => roadblock !== prerequisite
    && (Number(roadblock?.status) >= 400 || /timeout|failed|blocked|interstitial/i.test(String(roadblock?.error || ''))));
  const sourceFailures = [...sources, ...sourceResults].filter((source) => source?.ok === false
    || Number(source?.status) >= 400
    || /timeout|failed|blocked|interstitial/i.test(String(source?.error || '')));

  let inventory;
  if (!requiresInventory) inventory = { required: false, ready: true, status: 'not_required', reason: null, trustedSignalCount: 0 };
  else if (trustedInventory.length) inventory = { required: true, ready: true, status: 'ready', reason: null, trustedSignalCount: trustedInventory.length };
  else if (monitoredNoCurrentInventory||verifiedRenewalNegative) inventory = { required: true, ready: true, status: 'ready_no_current_inventory', reason: 'A fresh monitored source completed and reported no current inventory.', trustedSignalCount: 0 };
  else if (deeperParser) inventory = { required: true, ready: false, status: 'needs_deeper_parser', reason: 'Reachable discovery evidence has not produced trusted current store inventory.', trustedSignalCount: 0 };
  else if (prerequisite) inventory = {
    required: true,
    ready: false,
    status: 'blocked_prerequisite',
    reason: `${prerequisite.source || 'Required inventory source'}: ${prerequisite.error || prerequisite.status}. ${prerequisite.nextRoute || ''}`.trim(),
    trustedSignalCount: 0,
  };
  else inventory = { required: true, ready: false, status: 'no_trusted_inventory', reason: 'No trusted current store-level inventory evidence was produced.', trustedSignalCount: 0 };

  return {
    discovery: {
      succeeded: discoverySucceeded,
      status: discoverySucceeded ? (discoveryFailures.length || sourceFailures.length ? 'partial' : 'succeeded') : 'failed',
      signalCount: signals.length,
      reachableSourceCount: sources.filter((source) => source?.ok === true).length,
    },
    inventory,
  };
}

export function isValidShadowReport(state, report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return false;
  if (stateId(report.state) !== stateId(state) || !String(report.status || '').trim()) return false;
  if (!validTime(report.startedAt) || !validTime(report.finishedAt) || Date.parse(report.finishedAt) < Date.parse(report.startedAt)) return false;
  return Array.isArray(report.signals) && Array.isArray(report.sources) && Array.isArray(report.sourceResults);
}

export function buildShadowEvidence(state, report, { now = new Date().toISOString() } = {}) {
  const signals = asArray(report?.signals);
  const sources = asArray(report?.sources);
  const exactStore = signals.filter((row) => row?.storeId && row?.storeAddress);
  const nowMs = Date.parse(String(now || ''));
  const fresh = signals.filter((row) => {
    const observedAt = Date.parse(String(row?.observedAt || row?.lastConfirmedAt || row?.eventAt || ''));
    const ageMs = nowMs - observedAt;
    return Number.isFinite(nowMs) && Number.isFinite(observedAt) && ageMs >= 0 && ageMs <= SHADOW_INVENTORY_MAX_AGE_MS && row?.stale !== true;
  });
  const readiness = classifyShadowReadiness(report, { now });
  const complete = readiness.discovery.status === 'succeeded' && readiness.inventory.ready === true;
  return {
    schemaVersion: 1,
    state: stateId(state),
    mode: 'shadow',
    generatedAt: now,
    complete,
    sourceObservationProfile:verifiedLouisianaAlaskaPositiveReport(report),
    outcome: complete ? 'complete' : readiness.discovery.status !== 'succeeded'
      ? `incomplete_discovery_${readiness.discovery.status}`
      : readiness.inventory.status === 'blocked_prerequisite'
      ? 'incomplete_inventory_prerequisite'
      : `incomplete_${readiness.inventory.status}`,
    readiness,
    collector: {
      status: report?.status || 'unknown',
      startedAt: report?.startedAt || null,
      finishedAt: report?.finishedAt || null,
      runtimeMs: Number.isFinite(Date.parse(report?.finishedAt || '')) && Number.isFinite(Date.parse(report?.startedAt || ''))
        ? Date.parse(report.finishedAt) - Date.parse(report.startedAt) : null,
    },
    metrics: {
      signalCount: signals.length,
      sourceCount: sources.length,
      reachableSourceCount: sources.filter((source) => source?.ok === true).length,
      exactStoreCount: exactStore.length,
      exactStoreRatio: signals.length ? exactStore.length / signals.length : 0,
      addressCompleteCount: signals.filter((row) => row?.storeAddress).length,
      freshSignalCount: fresh.length,
      trustedCurrentInventorySignalCount: readiness.inventory.trustedSignalCount,
      alertCandidateCount: signals.filter((row) => row?.canAlertAsInventory === true || row?.canAlertAsWatch === true).length,
      falsePositiveFixtureStatus: 'not_run',
      customerVisibleExportPreviewCount: 0,
    },
    sourceHealth: sources.map((source) => ({ id: source?.id || source?.source || null, ok: source?.ok === true, status: source?.status || null })).slice(0, 200),
    roadblocks: asArray(report?.roadblocks).slice(0, 100),
    publication: { allowed: false, target: 'shadow_artifact_only', productionSnapshotTouched: false },
    alerts: { disabled: true, deliveryAttempted: false, candidateRowsExported: false },
  };
}

function runStateChild(state, outputFile, cwd, {renewal = false} = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, renewal
      ? ['src/run-expansion-shadow.mjs', `--collect-active-renewal-state=${state}`]
      : ['src/run-state.mjs', state], {
      cwd,
      env: {
        ...process.env,
        BOURBON_SIGNAL_STATE_OUT_FILE: outputFile,
        BOURBON_SIGNAL_PREVIOUS_STATE_FILE: outputFile,
        BOURBON_SIGNAL_AUTO_DEPLOY: '0',
        BOURBON_SIGNAL_SHADOW_MODE: '1',
        BOURBON_SIGNAL_ALERT_QUEUE_MODE: 'shadow',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => resolve({ ok: false, stdout, stderr, error: error.message }));
    child.on('close', (code) => resolve({ ok: code === 0, stdout, stderr, error: code === 0 ? null : `collector exited ${code}` }));
  });
}

async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

export async function verifyActiveRenewalMaintenance({env = process.env, requestJson} = {}) {
  if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_ACTIONS !== 'true'
    || env.GITHUB_REPOSITORY !== ACTIVE_RENEWAL_REPOSITORY || !/^\d+$/.test(env.GITHUB_RUN_ID || ''))
    throw Error('Active renewal maintenance requires an actual manual repository workflow');
  const request = requestJson || (async route => {
    if (!env.GITHUB_TOKEN) throw Error('Read-only GitHub workflow authority token is required');
    const response = await fetch(`https://api.github.com/repos/${ACTIVE_RENEWAL_REPOSITORY}/actions/${route}`, {
      redirect: 'error', signal: AbortSignal.timeout(10_000), headers: {accept: 'application/vnd.github+json',
        authorization: `Bearer ${env.GITHUB_TOKEN}`, 'x-github-api-version': '2022-11-28',
        'user-agent': 'BourbonSignalEngine/0.1 (+https://bourbonsignal.com; research prototype)'}});
    if (!response.ok) throw Error(`GitHub maintenance authority read failed: HTTP ${response.status}`);
    return JSON.parse((await readBoundedCollectionBody(response, {maxBytes: 2 * 1024 * 1024})).toString('utf8'));
  });
  const workflow = await request('workflows/refresh-feed.yml');
  if (workflow?.state !== 'disabled_manually' || workflow.path !== '.github/workflows/refresh-feed.yml'
    || !Number.isSafeInteger(workflow.id) || workflow.id < 1)
    throw Error('Production refresh must be disabled_manually before active research renewal');
  const queues = {};
  for (const status of ACTIVE_RENEWAL_PRODUCTION_STATUSES)
    queues[status] = await request(`workflows/${workflow.id}/runs?status=${status}&per_page=1`);
  const recent = await request(`workflows/${workflow.id}/runs?per_page=20`);
  const proof = validateActiveRenewalMaintenance({workflow, queues, recent, checkedAt: new Date().toISOString(), workflowRunId: env.GITHUB_RUN_ID});
  verifiedMaintenance.add(proof);
  return proof;
}

const renewalGrocery = state => ['WA', 'NM'].includes(state);
function renewalSources(state) {
  return renewalGrocery(state)
    ? [...new Set(['www.safeway.com', ...WESTERN_GROCERY_EXPANSION_SOURCES.filter(source => source.stateCode === state).map(source => source.host)])]
      .map(hostname => ({state, hostname}))
    : CENTRAL_CITYHIVE_EXPANSION_SOURCES.filter(source => source.state === state);
}

// Research renewal never clears a production or research hold. ENOENT alone
// means cold; malformed/unreadable journals stop the whole batch before HTTP.
export async function assertActiveRenewalIncidentSafety(state, {out = path.resolve('out')} = {}) {
  const sources = renewalSources(state), grocery = renewalGrocery(state);
  if (!sources.length) throw Error('Unreviewed active renewal incident state');
  const files = grocery
    ? [path.join(out, 'source-incidents/western-grocery', `${state}-grocery-production-incidents.json`),
      path.join(out, 'research-source-attempts', `grocery-${state}.json`),
      path.join(out, 'research-source-attempts/active-renewal-journals', `${state}.json`)]
    : [path.join(out, 'source-incidents/central-cityhive', `${state}.json`),
      path.join(out, 'research-source-attempts/central-cityhive-journals', `${state}.json`),
      path.join(out, 'research-source-attempts', `${state}.json`)];
  for (const file of files) {
    let value;
    try { value = JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Existing renewal incident journal is malformed');
    if (Object.hasOwn(value, 'hosts') || Object.hasOwn(value, 'inFlight')) {
      const journal = validateCityHiveIncidentJournal(value, state, sources);
      if (journal.inFlight || Object.keys(journal.hosts).length) throw Error(`Active renewal has an unresolved incident/review hold: ${state}`);
      continue;
    }
    const attempts = !grocery ? value.sourceAttempts : value;
    if (!attempts || typeof attempts !== 'object' || Array.isArray(attempts)
      || (!grocery && (value.schemaVersion !== 1 || value.state !== state))) throw Error('Legacy renewal attempts are malformed');
    const ids = new Set(grocery ? WESTERN_GROCERY_EXPANSION_SOURCES.filter(source => source.stateCode === state).map(source => source.id)
      : sources.map(source => source.id));
    for (const [key, entry] of Object.entries(attempts)) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)
        || !(ids.has(key) || grocery && key.startsWith('host:') && sources.some(source => source.hostname === key.slice(5))))
        throw Error('Legacy renewal attempt contains an unreviewed source');
      if (CITYHIVE_DENIAL_STATUSES.has(Number(entry.httpStatus)) || /denied|rate_limited|permanent_error/i.test(String(entry.status || '')))
        throw Error(`Active renewal has a prior source denial requiring review: ${state}`);
    }
  }
}

export async function createActiveRenewalFetch(state, {out = path.resolve('out'), maintenance,
  fetchText = fetchReviewedFirstPartyText, persistJournal = persistCityHiveIncidentJournal} = {}) {
  if (!verifiedMaintenance.has(maintenance) || Date.now() - Date.parse(maintenance.checkedAt) > 60_000)
    throw Error('A just-verified manual production-maintenance observation is required before renewal transport');
  if (!['WA','NM','WI','OK'].includes(state)) throw Error('Only the reviewed active four may use renewal transport');
  await assertActiveRenewalIncidentSafety(state, {out});
  const sources = renewalSources(state), file = path.join(out, 'research-source-attempts/active-renewal-journals', `${state}.json`);
  let journal = await readCityHiveIncidentJournal(file, state, sources);
  if (journal.inFlight || Object.keys(journal.hosts).length) throw Error('Unresolved renewal request or prior denial requires review');
  return async (url, options = {}) => {
    const host = new URL(url).hostname;
    if (!sources.some(source => source.hostname === host) || journal.inFlight || journal.hosts[host])
      throw Error('Unreviewed or held active renewal host');
    options.signal?.throwIfAborted();
    journal = {...journal, inFlight: {attemptId: randomUUID(), startedAt: new Date().toISOString()}};
    await persistJournal(file, journal);
    let denial = null;
    try {
      const response = await fetchText(url, {...options, maxTimeoutMs: renewalGrocery(state) ? 15_000 : 10_000,
        isAllowedUrl: value => !value.port && sources.some(source => source.hostname === value.hostname)
          && (renewalGrocery(state) ? ['/abs/pub/xapi/storeresolver/v2/all', '/abs/pub/xapi/search/substitute'].includes(value.pathname) : value.pathname === '/shop/'),
        onResponse: async metadata => {
          if (!CITYHIVE_DENIAL_STATUSES.has(Number(metadata.status))) return;
          denial = metadata; const at = Date.now(), retry = Math.max(0, Number(metadata.retryAfterSeconds) || 0);
          const next = {...journal, inFlight: null, hosts: {...journal.hosts, [host]: {httpStatus: Number(metadata.status),
            lastAttemptAt: new Date(at).toISOString(), nextAllowedAt: new Date(Math.min(8_640_000_000_000_000,
              Math.max(at + 86_400_000, at + retry * 1000))).toISOString()}}};
          try { await persistJournal(file, next); journal = next; await options.onResponse?.(metadata); }
          catch (error) { throw sourceErrorForHttp(Number(metadata.status), 'Renewal denial write failed; unresolved pre-request latch remains',
            {cause: error, details: {incidentWriteFailed: true, retryAfterSeconds: retry, unresolvedAttempt: true}}); }
        }});
      if (!denial) { journal = {...journal, inFlight: null}; await persistJournal(file, journal); }
      return response;
    } catch (error) {
      if (!denial) { journal = {...journal, inFlight: null}; await persistJournal(file, journal); }
      if (denial && !error.status) throw sourceErrorForHttp(Number(denial.status), 'Renewal denial preceded a later failure',
        {cause: error, details: {retryAfterSeconds: denial.retryAfterSeconds}});
      throw error;
    }
  };
}

async function collectActiveResearchRenewalChild(state, lifecycle) {
  selectActiveResearchRenewals({lifecycle, states: [state], renewActiveStates: [state],
    eventName: process.env.GITHUB_EVENT_NAME, researchSourceForState,
    productionAllowed: (id, config) => (renewalGrocery(id) ? westernGroceryPromotionAllowed : centralCityHiveProductionAllowed)(id, config)});
  if (process.env.BOURBON_SIGNAL_SHADOW_MODE !== '1' || !process.env.BOURBON_SIGNAL_STATE_OUT_FILE)
    throw Error('Active renewal child requires the isolated shadow output and disabled delivery environment');
  await assertActiveRenewalIncidentSafety(state);
  const maintenance = await verifyActiveRenewalMaintenance();
  const output = process.env.BOURBON_SIGNAL_STATE_OUT_FILE;
  const report = await collectResearchStateReport(researchSourceForState(state), await BourbonBible.load(), {
    reportDirectory: path.dirname(output), fetchText: await createActiveRenewalFetch(state, {maintenance})});
  const suppressed = suppressActiveRenewalReport(state, report);
  suppressed.metadata.manualActiveRenewal.maintenance = maintenance;
  await writeFile(output, JSON.stringify(suppressed, null, 2));
}

function reportHasAccessDenial(report){
  const metadata=report?.metadata||{};
  const nested=Object.values(metadata).filter(value=>value&&typeof value==='object'&&!Array.isArray(value));
  const rows=[...asArray(report?.roadblocks),...asArray(report?.sources),...asArray(report?.sourceResults),
    ...asArray(metadata.receipts),...asArray(metadata.requests),
    ...nested.flatMap(value=>[...asArray(value.receipts),...asArray(value.requests)])];
  return rows.some(row=>[row?.status,row?.httpStatus,row?.error?.status,row?.details?.status]
    .some(status=>CITYHIVE_DENIAL_STATUSES.has(Number(status))));
}

export async function runExpansionShadow({ lifecycle, states = [], renewActiveStates = [], env = process.env,
  limit = 5, outDir = path.resolve('out', 'shadow'), cwd = process.cwd(), maintenanceRequestJson,
  runCollector = runStateChild, prepareCandidate = runCandidatePrerequisite } = {}) {
  const renewals = selectActiveResearchRenewals({lifecycle, states, renewActiveStates, eventName: env.GITHUB_EVENT_NAME,
    researchSourceForState, productionAllowed: (state, config) => (['WA','NM'].includes(state)
      ? westernGroceryPromotionAllowed : centralCityHiveProductionAllowed)(state, config, {env})});
  if (!Number.isInteger(limit) || limit < 1 || limit > (renewals.length ? 9 : 5))
    throw Error('Shadow limit must be 1..5, or 1..9 for an explicit manual active renewal');
  const candidates = [...new Set([...selectShadowCandidates(lifecycle, { states, limit }), ...renewals])].sort().slice(0, limit);
  // Validate the entire explicit batch before a sibling prerequisite or HTTP.
  validateShadowRunRequest(lifecycle, {requestedStates: states, candidates});
  for (const state of renewals) await assertActiveRenewalIncidentSafety(state, {out: path.join(cwd, 'out')});
  const maintenance = renewals.length ? await verifyActiveRenewalMaintenance({env, requestJson: maintenanceRequestJson}) : null;
  if (maintenance) {
    await mkdir(outDir, {recursive: true});
    await writeFile(path.join(outDir, 'active-renewal-maintenance.json'), JSON.stringify(maintenance, null, 2));
  }
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const results = [];
  for (const state of candidates) {
    const stateDir = path.join(outDir, state, runId);
    const reportFile = path.join(stateDir, 'report.json');
    await mkdir(stateDir, { recursive: true });
    const prerequisite = await prepareCandidate(state, cwd);
    const execution = await runCollector(state, reportFile, cwd, {renewal: renewals.includes(state)});
    const parsedReport = await readJson(reportFile, null);
    let report = isValidShadowReport(state, parsedReport)
      ? parsedReport
      : { state, status: 'failed_shadow_collection', startedAt: null, finishedAt: null, signals: [], sources: [], sourceResults: [], roadblocks: [{ state, error: execution.error || 'missing_or_invalid_shadow_report' }] };
    if (renewals.includes(state) && isValidShadowReport(state, report)) report = suppressActiveRenewalReport(state, report);
    if (renewals.includes(state) && report.metadata?.manualActiveRenewal) report.metadata.manualActiveRenewal.batchMaintenance = maintenance;
    await writeFile(reportFile, JSON.stringify(report, null, 2));
    if(renewals.includes(state)&&report.metadata?.manualActiveRenewal?.maintenance){
      await verifyActiveRenewalRawCaptures({state,report,reportDirectory:stateDir,lifecycle,
        bible:await BourbonBible.load(path.join(cwd,'out/bourbon-bible.json'))});
    }
    if(report.metadata?.profileScope==='POSITIVE_EVIDENCE_ONLY')await verifyLouisianaAlaskaPositiveCaptures({state,report,reportDirectory:stateDir,bible:await BourbonBible.load(path.join(cwd,'out/bourbon-bible.json'))});
    const evidence = buildShadowEvidence(state, report);
    evidence.prerequisite = {
      ok: prerequisite.ok,
      status: prerequisite.status,
      error: prerequisite.error,
      stdout: prerequisite.stdout?.slice(-4000) || '',
      stderr: prerequisite.stderr?.slice(-4000) || '',
    };
    if (!prerequisite.ok) {
      evidence.complete = false;
      evidence.outcome = 'incomplete_prerequisite_execution';
      evidence.readiness.inventory = {
        ...evidence.readiness.inventory,
        ready: false,
        status: 'prerequisite_execution_failed',
        reason: prerequisite.error || 'Required candidate prerequisite failed.',
      };
    }
    evidence.execution = { ok: execution.ok, error: execution.error, stdout: execution.stdout?.slice(-4000) || '', stderr: execution.stderr?.slice(-4000) || '' };
    await writeFile(path.join(stateDir, 'evidence.json'), JSON.stringify(evidence, null, 2));
    results.push({ state, directory: stateDir, evidence });
    // A denied/unresolved renewal halts the batch before a sibling can reuse
    // a shared host. Preserve the actual report and incident before stopping.
    for (const renewed of renewals) await assertActiveRenewalIncidentSafety(renewed, {out: path.join(cwd, 'out')});
    // Any family may share a first-party host with an active sibling. A new
    // denial or unknown child failure must stop this maintenance batch before
    // another source can run, even when its incident file uses another family.
    if(renewals.length&&(!execution.ok||reportHasAccessDenial(report)))
      throw Error('Manual active-renewal batch stopped after '+state+': '+(!execution.ok?'source execution failed':'source access denial')+'; report and incident evidence were preserved');
  }
  const summaryResults = results.map((result) => ({ state: result.state, directory: result.directory, executionOk: result.evidence.execution?.ok === true, collectorStatus: result.evidence.collector?.status || 'unknown', prerequisite: result.evidence.prerequisite, complete: result.evidence.complete, sourceObservationProfile:result.evidence.sourceObservationProfile, outcome: result.evidence.outcome, readiness: result.evidence.readiness, publication: result.evidence.publication, alerts: result.evidence.alerts, metrics: result.evidence.metrics }));
  const summary = {
    schemaVersion: 1,
    mode: 'shadow',
    manualActiveRenewalStates: renewals,
    maintenance,
    runId,
    generatedAt: new Date().toISOString(),
    candidates,
    complete: summaryResults.every((result) => result.executionOk && result.complete),
    outcome: summaryResults.every((result) => result.executionOk && result.complete) ? 'complete' : 'incomplete',
    results: summaryResults,
  };
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, `run-${runId}.json`), JSON.stringify(summary, null, 2));
  return summary;
}

function argValue(flag) {
  const inline = process.argv.find((value) => value.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const lifecycle = withResearchLifecycle(await readJson(path.resolve('..', 'src', 'config', 'state-lifecycle.json'), null));
  const directRenewal = argValue('--collect-active-renewal-state');
  if (directRenewal) return collectActiveResearchRenewalChild(stateId(directRenewal), lifecycle);
  const states = String(argValue('--states') || '').split(',').map(stateId).filter(Boolean);
  const renewActiveStates = String(argValue('--renew-active-states') || '').split(',').map(stateId).filter(Boolean);
  const summary = await runExpansionShadow({ lifecycle, states, renewActiveStates, limit: Number(argValue('--limit') || 5) });
  validateShadowRunRequest(lifecycle, { requestedStates: states, candidates: summary.candidates });
  console.log(JSON.stringify({ mode: summary.mode, candidates: summary.candidates, runId: summary.runId, productionSnapshotTouched: false, alertsDisabled: true }, null, 2));
  if (!summary.complete) {
    const failures = summary.results
      .filter((result) => result.executionOk !== true || result.complete !== true)
      .map((result) => `${result.state}:${result.executionOk !== true ? 'execution_failed' : result.readiness?.inventory?.status || result.collectorStatus}`);
    throw new Error(`Shadow collection incomplete for ${failures.join(', ')}; evidence was preserved.`);
  }
}

export async function terminateSubprocessTree(child, {
  platform = process.platform,
  execFileImpl = execFileAsync,
  processKillImpl = process.kill.bind(process),
} = {}) {
  const pid = Number(child?.pid);
  if (!Number.isInteger(pid) || pid <= 0) return { method: 'unavailable', pid: null };
  if (platform === 'win32') {
    await execFileImpl('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true, timeout: 10_000 });
    return { method: 'taskkill', pid };
  }
  processKillImpl(-pid, 'SIGKILL');
  return { method: 'process_group_sigkill', pid };
}

export function runCandidatePrerequisite(state, cwd, {
  env = process.env,
  timeoutMs = Number(env.BOURBON_SIGNAL_OR_BROWSER_PREREQUISITE_TIMEOUT_MS || OREGON_PREREQUISITE_TIMEOUT_MS),
  spawnImpl = spawn,
  terminateTree = terminateSubprocessTree,
  platform = process.platform,
} = {}) {
  if (state !== 'OR') return Promise.resolve({ ok: true, status: 'not_required', stdout: '', stderr: '', error: null });
  if (env.BOURBON_SIGNAL_SKIP_BROWSER_COLLECTORS === '1') {
    return Promise.resolve({ ok: true, status: 'skipped', stdout: '', stderr: '', error: null });
  }
  return new Promise((resolve) => {
    const child = spawnImpl(process.execPath, ['src/or-browser-collector.mjs'], {
      cwd,
      env: { ...env, BOURBON_SIGNAL_AUTO_DEPLOY: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: platform !== 'win32',
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const boundedTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : OREGON_PREREQUISITE_TIMEOUT_MS;
    const timer = setTimeout(async () => {
      if (settled) return;
      settled = true;
      let termination = null;
      try { termination = await terminateTree(child, { platform }); }
      catch (error) { termination = { method: 'failed', error: error instanceof Error ? error.message : String(error) }; }
      resolve({ ok: false, status: 'timeout', stdout, stderr, error: `Oregon browser prerequisite timed out after ${boundedTimeoutMs}ms`, termination });
    }, boundedTimeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => finish({ ok: false, status: 'failed', stdout, stderr, error: error.message }));
    child.on('close', (code) => finish({ ok: code === 0, status: code === 0 ? 'generated' : 'failed', stdout, stderr, error: code === 0 ? null : `Oregon browser prerequisite exited ${code}` }));
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
