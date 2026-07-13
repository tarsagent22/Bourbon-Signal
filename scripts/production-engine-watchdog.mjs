#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE_URL = process.env.BOURBON_SIGNAL_LIVE_BASE_URL || 'https://www.bourbonsignal.com';
const MAX_SNAPSHOT_AGE_MS = Number(process.env.BOURBON_SIGNAL_WATCHDOG_MAX_SNAPSHOT_AGE_MS || 45 * 60_000);
const ATTEMPTS = Math.max(2, Number(process.env.BOURBON_SIGNAL_WATCHDOG_ATTEMPTS || 2));
const RETRY_DELAY_MS = Math.max(0, Number(process.env.BOURBON_SIGNAL_WATCHDOG_RETRY_DELAY_MS || 15_000));
const REPORT_PATH = process.env.BOURBON_SIGNAL_WATCHDOG_REPORT || path.resolve('engine/out/production-watchdog.json');

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function activeStates() {
  const lifecycle = JSON.parse(await readFile(new URL('../src/config/state-lifecycle.json', import.meta.url), 'utf8'));
  return (lifecycle.activeStates || []).filter((state) => lifecycle.states?.[state]?.publicStatus === 'active');
}

async function getJson(route) {
  const url = new URL(route, BASE_URL);
  url.searchParams.set('_bs_watchdog', `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache', 'user-agent': 'BourbonSignalProductionWatchdog/1.0' },
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch {}
    return {
      ok: response.ok && body !== null,
      status: response.status,
      body,
      snapshotId: response.headers.get('x-engine-snapshot'),
      source: response.headers.get('x-api-source'),
      error: body ? null : `non_json_response:${text.slice(0, 80)}`,
    };
  } catch (error) {
    return { ok: false, status: 0, body: null, snapshotId: null, source: null, error: error.message };
  }
}

export function evaluateProductionHealth({ nowMs = Date.now(), activeStates: states = [], stats, stateChecks = [], opsHealth = null } = {}) {
  const failures = [];
  const warnings = [];
  const rollbackAt = opsHealth?.body?.engine?.lastRollback?.at;
  const rollbackAgeMs = nowMs - Date.parse(rollbackAt || '');
  if (Number.isFinite(rollbackAgeMs) && rollbackAgeMs >= 0 && rollbackAgeMs <= 60 * 60_000) {
    warnings.push(`Production rollback observed at ${rollbackAt}.`);
  }
  const generatedAt = stats?.body?.generatedAt || null;
  const generatedMs = Date.parse(generatedAt || '');
  const snapshotAgeMs = Number.isFinite(generatedMs) ? Math.max(0, nowMs - generatedMs) : null;
  if (!stats?.ok) failures.push(`/api/stats failed with status ${stats?.status || 'unavailable'}.`);
  if (stats?.source !== 'remote-snapshot') failures.push(`Production must serve the remote snapshot, got ${stats?.source || 'unknown source'}.`);
  if (!stats?.snapshotId) failures.push('Production snapshot identity header is missing.');
  if (snapshotAgeMs === null || snapshotAgeMs > MAX_SNAPSHOT_AGE_MS) failures.push(`Production snapshot must be no older than 45 minutes; generatedAt=${generatedAt || 'missing'}.`);
  if (Number(stats?.body?.stateCount || 0) !== states.length) failures.push(`Production state count ${stats?.body?.stateCount ?? 'missing'} does not match active state count ${states.length}.`);
  if (Number(stats?.body?.refreshHealth?.failedStateCount || 0) > 0) failures.push(`Production reports ${stats.body.refreshHealth.failedStateCount} failed state(s).`);
  const checked = new Map(stateChecks.map((row) => [row.state, row]));
  for (const state of states) {
    const row = checked.get(state);
    if (!row?.ok) failures.push(`${state}: production state partition failed with status ${row?.status || 'unavailable'}.`);
    if (row?.source !== 'remote-snapshot') failures.push(`${state}: production state partition must serve the remote snapshot, got ${row?.source || 'unknown source'}.`);
    if (stats?.snapshotId && row?.snapshotId !== stats.snapshotId) failures.push(`${state}: production state partition snapshot ${row?.snapshotId || 'missing'} does not match stats snapshot ${stats.snapshotId}.`);
  }
  return {
    ok: failures.length === 0,
    checkedAt: new Date(nowMs).toISOString(),
    snapshotId: stats?.snapshotId || null,
    generatedAt,
    snapshotAgeMinutes: snapshotAgeMs === null ? null : Math.round(snapshotAgeMs / 6_000) / 10,
    expectedStateCount: states.length,
    actualStateCount: Number(stats?.body?.stateCount || 0),
    source: stats?.source || null,
    stateChecks,
    warnings,
    failures,
  };
}

async function probe() {
  const states = await activeStates();
  const stats = await getJson('/api/stats');
  const opsHealth = await getJson('/api/ops/health');
  const stateChecks = await Promise.all(states.map(async (state) => {
    const result = await getJson(`/api/drops?state=${encodeURIComponent(state)}&limit=1`);
    return {
      state,
      ok: result.ok,
      status: result.status,
      total: Number(result.body?.total || 0),
      source: result.source,
      snapshotId: result.snapshotId,
    };
  }));
  return evaluateProductionHealth({ activeStates: states, stats, stateChecks, opsHealth });
}

export async function runProductionWatchdog() {
  let report = null;
  const attempts = [];
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    report = await probe();
    attempts.push({ attempt, checkedAt: report.checkedAt, ok: report.ok, failures: report.failures });
    if (report.ok) break;
    if (attempt < ATTEMPTS) await sleep(RETRY_DELAY_MS);
  }
  report = { ...report, attempts };
  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
  for (const warning of report.warnings || []) console.warn(`::warning title=Bourbon Signal rollback observed::${warning}`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
  return report;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) runProductionWatchdog().catch((error) => { console.error(error); process.exit(1); });
