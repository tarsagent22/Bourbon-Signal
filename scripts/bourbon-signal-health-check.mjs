import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const PROJECT_ROOT = process.cwd();
const OUT_DIR = path.join(PROJECT_ROOT, '.hermes', 'bourbon-signal', 'health');
const OUT_FILE = path.join(OUT_DIR, 'latest-health.json');
const MAX_FRESHNESS_HOURS = Number(process.env.BOURBON_SIGNAL_HEALTH_MAX_FRESHNESS_HOURS || 8);
const LIVE_BASE_URL = process.env.BOURBON_SIGNAL_LIVE_BASE_URL || 'https://www.bourbonsignal.com';
const PREVIEW_BASE_URL = process.env.BOURBON_SIGNAL_PREVIEW_BASE_URL || 'https://bourbonsignal-git-launch-membership-pricing-stripe-tarsagent22s-projects.vercel.app';

function nowIso() {
  return new Date().toISOString();
}

function hoursSince(value) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return null;
  return Math.round(((Date.now() - parsed) / 36_000) ) / 100;
}

function isVercelProtection(status, text, headers) {
  const location = headers?.get?.('location') || null;
  const server = headers?.get?.('server') || '';
  return status === 401 || status === 403 || /vercel authentication|deployment protection|vercel sso|authentication required/i.test(text || '') || /vercel/i.test(server) && /login|_vercel|sso/i.test(location || '');
}

async function fetchText(baseUrl, route, timeoutMs = 12_000, maxTextChars = 1000) {
  const url = new URL(route, baseUrl).toString();
  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { 'user-agent': 'BourbonSignalHealth/1.0' },
      signal: AbortSignal.timeout(timeoutMs)
    });
    const text = await res.text().catch(() => '');
    return {
      ok: res.ok,
      status: res.status,
      location: res.headers.get('location'),
      ms: Date.now() - started,
      protectedByVercel: isVercelProtection(res.status, text, res.headers),
      text: maxTextChars === null ? text : text.slice(0, maxTextChars)
    };
  } catch (error) {
    return { ok: false, status: null, location: null, ms: Date.now() - started, protectedByVercel: false, error: error.message, text: '' };
  }
}

async function fetchJson(baseUrl, route, timeoutMs = 15_000) {
  const result = await fetchText(baseUrl, route, timeoutMs, null);
  let json = null;
  if (result.text) {
    try { json = JSON.parse(result.text); } catch {}
  }
  return { ...result, json, text: undefined };
}

async function checkDeployment(name, baseUrl) {
  const pages = {
    '/': await fetchText(baseUrl, '/'),
    '/pricing': await fetchText(baseUrl, '/pricing')
  };
  const apis = {
    '/api/stats': await fetchJson(baseUrl, '/api/stats'),
    '/api/drops?limit=1': await fetchJson(baseUrl, '/api/drops?limit=1')
  };

  for (const page of Object.values(pages)) {
    page.hasExpectedShell = /Bourbon Signal|Never miss a drop|Live Drop Feed/i.test(page.text || '');
    delete page.text;
  }

  const stats = apis['/api/stats'].json || {};
  const drops = apis['/api/drops?limit=1'].json || {};
  const engineGeneratedAt = stats.engineGeneratedAt || stats.generatedAt || null;
  const dropsLastUpdated = drops.lastUpdated || drops.generatedAt || null;
  const engineFreshnessHours = hoursSince(engineGeneratedAt);
  const dropsFreshnessHours = hoursSince(dropsLastUpdated);
  const refreshHealth = stats.refreshHealth || null;
  const staleStates = refreshHealth?.degradedStates || [];

  return {
    name,
    baseUrl,
    checkedAt: nowIso(),
    ok: Boolean(apis['/api/stats'].ok && pages['/'].ok),
    pages,
    apis,
    freshness: {
      engineGeneratedAt,
      dropsLastUpdated,
      engineFreshnessHours,
      dropsFreshnessHours,
      maxFreshnessHours: MAX_FRESHNESS_HOURS,
      fresh: engineFreshnessHours !== null && engineFreshnessHours <= MAX_FRESHNESS_HOURS
    },
    counts: {
      stateCount: stats.stateCount ?? null,
      signalCount: stats.signalCount ?? null,
      dropCount: stats.dropCount ?? null,
      alertCandidateCount: stats.alertCandidateCount ?? null
    },
    refreshHealth,
    protectedByVercel: Object.values(pages).some((page) => page.protectedByVercel) || Object.values(apis).some((api) => api.protectedByVercel),
    warnings: [
      ...(engineFreshnessHours !== null && engineFreshnessHours > MAX_FRESHNESS_HOURS ? [`engine_stale_${engineFreshnessHours}h`] : []),
      ...(staleStates.length ? [`degraded_states_${staleStates.map((s) => s.state || s).join(',')}`] : [])
    ]
  };
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const startedAt = nowIso();
    const child = spawn(command, args, {
      cwd: options.cwd || PROJECT_ROOT,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(payload);
    };
    const timeout = setTimeout(() => {
      try { child.kill(); } catch {}
      finish({ ok: false, code: 'timeout', startedAt, finishedAt: nowIso(), stdout: stdout.slice(-2000), stderr: `${stderr}\nTimed out`.slice(-2000) });
    }, options.timeoutMs || 20_000);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      finish({ ok: false, code: 'error', startedAt, finishedAt: nowIso(), stdout: stdout.slice(-2000), stderr: `${stderr}\n${error.message}`.slice(-2000) });
    });
    child.on('close', (code) => {
      finish({ ok: code === 0, code, startedAt, finishedAt: nowIso(), stdout: stdout.slice(-4000), stderr: stderr.slice(-4000) });
    });
  });
}

async function readLocalJson(file) {
  try { return JSON.parse(await readFile(path.join(PROJECT_ROOT, file), 'utf8')); } catch { return null; }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const [live, preview, gitStatus, localRefreshStatus, localStats] = await Promise.all([
    checkDeployment('live', LIVE_BASE_URL),
    checkDeployment('launch-preview', PREVIEW_BASE_URL),
    runCommand('git', ['status', '--short', '--branch'], { timeoutMs: 10_000 }),
    readLocalJson('engine/out/site-refresh-status.json'),
    readLocalJson('engine/out/site/stats.json')
  ]);

  const localStatsGeneratedMs = localStats?.engineGeneratedAt ? new Date(localStats.engineGeneratedAt).getTime() : NaN;
  const localRefreshFinishedMs = localRefreshStatus?.finishedAt ? new Date(localRefreshStatus.finishedAt).getTime() : NaN;
  const localRefreshFailureSuperseded = Number.isFinite(localStatsGeneratedMs)
    && Number.isFinite(localRefreshFinishedMs)
    && localStatsGeneratedMs > localRefreshFinishedMs;
  const warnings = [
    ...live.warnings.map((warning) => `live:${warning}`),
    ...(preview.protectedByVercel ? ['preview:protected_by_vercel'] : []),
    ...(localRefreshStatus?.ok === false && !localRefreshFailureSuperseded ? [`local-refresh:${localRefreshStatus.error || 'failed'}`] : [])
  ];

  const payload = {
    checkedAt: nowIso(),
    maxFreshnessHours: MAX_FRESHNESS_HOURS,
    results: [live, preview],
    local: {
      gitStatus: gitStatus.stdout.trim(),
      refreshStatus: localRefreshStatus ? {
        ok: localRefreshStatus.ok,
        startedAt: localRefreshStatus.startedAt || null,
        finishedAt: localRefreshStatus.finishedAt || null,
        error: localRefreshStatus.error || null,
        warnings: localRefreshStatus.warnings || []
      } : null,
      stats: localStats ? {
        generatedAt: localStats.generatedAt || null,
        engineGeneratedAt: localStats.engineGeneratedAt || null,
        stateCount: localStats.stateCount || null,
        signalCount: localStats.signalCount || null,
        dropCount: localStats.dropCount || null,
        alertCandidateCount: localStats.alertCandidateCount || null,
        refreshHealth: localStats.refreshHealth || null
      } : null
    },
    warnings,
    ok: live.ok && live.freshness.fresh && !warnings.some((warning) => warning.startsWith('live:'))
  };

  await writeFile(OUT_FILE, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ ok: payload.ok, checkedAt: payload.checkedAt, live: live.counts, freshness: live.freshness, warnings }, null, 2));
}

main().catch(async (error) => {
  await mkdir(OUT_DIR, { recursive: true });
  const payload = { checkedAt: nowIso(), ok: false, error: error.message, stack: error.stack };
  await writeFile(OUT_FILE, JSON.stringify(payload, null, 2));
  console.error(error);
  process.exit(1);
});
