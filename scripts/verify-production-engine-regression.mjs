#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { selectVerificationStates } from './production-verification-scope.mjs';

const ROOT = process.cwd();
const BASE_URL = process.env.BOURBON_SIGNAL_LIVE_BASE_URL || 'https://www.bourbonsignal.com';
const MIN_RATIO = Number(process.env.BOURBON_SIGNAL_REGRESSION_MIN_DROP_RATIO || 0.4);
const MIN_STATE_COUNT_RATIO = Number(process.env.BOURBON_SIGNAL_REGRESSION_MIN_STATE_COUNT_RATIO || 0.9);
const ABS_DROP_FLOOR = Number(process.env.BOURBON_SIGNAL_REGRESSION_ABS_DROP_FLOOR || 3);
const PRODUCTION_VERIFY_ATTEMPTS = Number(process.env.BOURBON_SIGNAL_PRODUCTION_VERIFY_ATTEMPTS || 6);
const PRODUCTION_VERIFY_DELAY_MS = Number(process.env.BOURBON_SIGNAL_PRODUCTION_VERIFY_DELAY_MS || 10_000);
const failures = [];
const warnings = [];

function readJson(relPath, fallback = null) {
  try { return JSON.parse(readFileSync(path.join(ROOT, relPath), 'utf8')); } catch { return fallback; }
}
async function getJson(route) {
  const url = new URL(route, BASE_URL);
  url.searchParams.set('_bs_verify', `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const res = await fetch(url, {
    headers: { 'user-agent': 'BourbonSignalRegressionGuard/1.0', 'cache-control': 'no-cache' },
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, json, text: json ? undefined : text.slice(0, 300), url: url.toString() };
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function fail(message) { failures.push(message); }
function warn(message) { warnings.push(message); }
function activeStates() {
  const cfg = readJson('src/config/state-lifecycle.json', {});
  return (cfg.activeStates || []).filter((state) => cfg.states?.[state]?.publicStatus === 'active');
}
function localDropsByState() {
  const payload = readJson('engine/out/site/drops.json', { drops: [] });
  const map = new Map();
  for (const drop of payload.drops || []) {
    const state = String(drop.state || '').toUpperCase();
    if (!state) continue;
    map.set(state, (map.get(state) || 0) + 1);
  }
  return map;
}

async function main() {
  const localStats = readJson('engine/out/site/stats.json', {});
  const localDropMap = localDropsByState();
  const allStates = activeStates();
  const states = selectVerificationStates(allStates, process.env.BOURBON_SIGNAL_VERIFY_STATES || '');
  let liveStatsRes = null;
  for (let attempt = 1; attempt <= PRODUCTION_VERIFY_ATTEMPTS; attempt += 1) {
    liveStatsRes = await getJson('/api/stats');
    const candidate = liveStatsRes.json || {};
    const stateCountMatches = Number(candidate.stateCount || 0) === Number(localStats.stateCount || states.length || 0);
    const generationMatches = !localStats.generatedAt || candidate.generatedAt === localStats.generatedAt;
    if (liveStatsRes.ok && stateCountMatches && generationMatches) break;
    if (attempt < PRODUCTION_VERIFY_ATTEMPTS) await sleep(PRODUCTION_VERIFY_DELAY_MS);
  }
  if (!liveStatsRes?.ok || !liveStatsRes.json) fail(`/api/stats failed: status ${liveStatsRes?.status || 'unavailable'}`);
  const liveStats = liveStatsRes?.json || {};
  const localStateCount = Number(localStats.stateCount || states.length || 0);
  const liveStateCount = Number(liveStats.stateCount || 0);
  if (localStateCount && liveStateCount !== localStateCount) {
    fail(`Live stateCount ${liveStateCount} does not match local ${localStateCount}.`);
  }
  if (localStats.generatedAt && liveStats.generatedAt !== localStats.generatedAt) {
    fail(`Live generatedAt ${liveStats.generatedAt || '(missing)'} does not match local ${localStats.generatedAt}.`);
  }
  if (Number(liveStats.alertCandidateCount || 0) === 0 && Number(localStats.alertCandidateCount || 0) > 0) {
    fail(`Live alertCandidateCount is 0 while local has ${localStats.alertCandidateCount}.`);
  }
  if (liveStats.refreshHealth?.failedStateCount > 0) fail(`Live refreshHealth has failedStateCount=${liveStats.refreshHealth.failedStateCount}.`);
  if (liveStats.refreshHealth?.staleStateCount > 0) warn(`Live refreshHealth has staleStateCount=${liveStats.refreshHealth.staleStateCount}.`);

  const checkedStates = [];
  for (const state of states) {
    const localTotal = localDropMap.get(state) || 0;
    const res = await getJson(`/api/drops?state=${encodeURIComponent(state)}&limit=1`);
    const liveTotal = Number(res.json?.total || 0);
    checkedStates.push({ state, localTotal, liveTotal, status: res.status });
    if (!res.ok || !res.json) {
      fail(`${state}: /api/drops failed with status ${res.status}.`);
      continue;
    }
    if (localTotal >= ABS_DROP_FLOOR && liveTotal === 0) fail(`${state}: live drops collapsed to 0 from local ${localTotal}.`);
    else if (localTotal >= 20 && liveTotal < Math.floor(localTotal * MIN_RATIO)) {
      fail(`${state}: live drops ${liveTotal} below ${Math.floor(localTotal * MIN_RATIO)} (${Math.round(MIN_RATIO * 100)}% of local ${localTotal}).`);
    }
  }

  const payload = {
    ok: failures.length === 0,
    checkedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    thresholds: { minDropRatio: MIN_RATIO, minStateCountRatio: MIN_STATE_COUNT_RATIO, absDropFloor: ABS_DROP_FLOOR },
    local: { generatedAt: localStats.generatedAt, stateCount: localStats.stateCount, alertCandidateCount: localStats.alertCandidateCount, dropCount: localStats.dropCount },
    live: { generatedAt: liveStats.generatedAt, stateCount: liveStats.stateCount, alertCandidateCount: liveStats.alertCandidateCount, dropCount: liveStats.dropCount, refreshHealth: liveStats.refreshHealth },
    checkedStates,
    warnings,
    failures,
  };
  if (process.argv.includes('--json')) console.log(JSON.stringify(payload, null, 2));
  else {
    console.log(`Production engine regression guard: ${payload.ok ? 'passed' : 'failed'} (${checkedStates.length} active states checked)`);
    for (const warning of warnings) console.warn(`warning: ${warning}`);
    for (const failure of failures) console.error(`failure: ${failure}`);
  }
  if (failures.length) process.exit(1);
}

main().catch((error) => { console.error(error); process.exit(1); });
