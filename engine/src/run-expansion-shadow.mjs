#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

function validTime(value) { return Number.isFinite(Date.parse(String(value || ''))); }

export function buildShadowEvidence(state, report, { now = new Date().toISOString() } = {}) {
  const signals = asArray(report?.signals);
  const sources = asArray(report?.sources);
  const exactStore = signals.filter((row) => row?.storeId && row?.storeAddress);
  const fresh = signals.filter((row) => validTime(row?.observedAt || row?.lastConfirmedAt || row?.eventAt));
  return {
    schemaVersion: 1,
    state: stateId(state),
    mode: 'shadow',
    generatedAt: now,
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

export async function runExpansionShadow({ lifecycle, states, limit = 5, outDir = path.resolve('out', 'shadow'), cwd = process.cwd(), runCollector = runStateChild } = {}) {
  const candidates = selectShadowCandidates(lifecycle, { states, limit });
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const results = [];
  for (const state of candidates) {
    const stateDir = path.join(outDir, state, runId);
    const reportFile = path.join(stateDir, 'report.json');
    await mkdir(stateDir, { recursive: true });
    const execution = await runCollector(state, reportFile, cwd);
    const report = await readJson(reportFile, { state, status: 'failed_shadow_collection', signals: [], sources: [], roadblocks: [{ state, error: execution.error }] });
    await writeFile(reportFile, JSON.stringify(report, null, 2));
    const evidence = buildShadowEvidence(state, report);
    evidence.execution = { ok: execution.ok, error: execution.error, stdout: execution.stdout?.slice(-4000) || '', stderr: execution.stderr?.slice(-4000) || '' };
    await writeFile(path.join(stateDir, 'evidence.json'), JSON.stringify(evidence, null, 2));
    results.push({ state, directory: stateDir, evidence });
  }
  const summary = { schemaVersion: 1, mode: 'shadow', runId, generatedAt: new Date().toISOString(), candidates, results: results.map((result) => ({ state: result.state, directory: result.directory, executionOk: result.evidence.execution?.ok === true, collectorStatus: result.evidence.collector?.status || 'unknown', publication: result.evidence.publication, alerts: result.evidence.alerts, metrics: result.evidence.metrics })) };
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
  const lifecycle = await readJson(path.resolve('..', 'src', 'config', 'state-lifecycle.json'), {});
  const states = String(argValue('--states') || '').split(',').map(stateId).filter(Boolean);
  const summary = await runExpansionShadow({ lifecycle, states, limit: Number(argValue('--limit') || 5) });
  console.log(JSON.stringify({ mode: summary.mode, candidates: summary.candidates, runId: summary.runId, productionSnapshotTouched: false, alertsDisabled: true }, null, 2));
  if (summary.results.some((result) => result.executionOk !== true)) {
    throw new Error(`Shadow collection failed for ${summary.results.filter((result) => result.executionOk !== true).map((result) => result.state).join(', ')}.`);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
