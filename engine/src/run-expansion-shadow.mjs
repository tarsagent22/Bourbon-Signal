#!/usr/bin/env node
import { execFile, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SHADOW_INVENTORY_MAX_AGE_MS = 2 * 60 * 60_000;
const OREGON_PREREQUISITE_TIMEOUT_MS = 3 * 60_000;

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
  return asArray(report.signals).filter((row) => row?.canAlertAsInventory === true
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
  else if (monitoredNoCurrentInventory) inventory = { required: true, ready: true, status: 'ready_no_current_inventory', reason: 'A fresh monitored source completed and reported no current inventory.', trustedSignalCount: 0 };
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

function runStateChild(state, outputFile, cwd) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['src/run-state.mjs', state], {
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

export async function runExpansionShadow({ lifecycle, states, limit = 5, outDir = path.resolve('out', 'shadow'), cwd = process.cwd(), runCollector = runStateChild, prepareCandidate = runCandidatePrerequisite } = {}) {
  const candidates = selectShadowCandidates(lifecycle, { states, limit });
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const results = [];
  for (const state of candidates) {
    const stateDir = path.join(outDir, state, runId);
    const reportFile = path.join(stateDir, 'report.json');
    await mkdir(stateDir, { recursive: true });
    const prerequisite = await prepareCandidate(state, cwd);
    const execution = await runCollector(state, reportFile, cwd);
    const parsedReport = await readJson(reportFile, null);
    const report = isValidShadowReport(state, parsedReport)
      ? parsedReport
      : { state, status: 'failed_shadow_collection', startedAt: null, finishedAt: null, signals: [], sources: [], sourceResults: [], roadblocks: [{ state, error: execution.error || 'missing_or_invalid_shadow_report' }] };
    await writeFile(reportFile, JSON.stringify(report, null, 2));
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
  }
  const summaryResults = results.map((result) => ({ state: result.state, directory: result.directory, executionOk: result.evidence.execution?.ok === true, collectorStatus: result.evidence.collector?.status || 'unknown', prerequisite: result.evidence.prerequisite, complete: result.evidence.complete, outcome: result.evidence.outcome, readiness: result.evidence.readiness, publication: result.evidence.publication, alerts: result.evidence.alerts, metrics: result.evidence.metrics }));
  const summary = {
    schemaVersion: 1,
    mode: 'shadow',
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
  const lifecycle = await readJson(path.resolve('..', 'src', 'config', 'state-lifecycle.json'), null);
  const states = String(argValue('--states') || '').split(',').map(stateId).filter(Boolean);
  const summary = await runExpansionShadow({ lifecycle, states, limit: Number(argValue('--limit') || 5) });
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
