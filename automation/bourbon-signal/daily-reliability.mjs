#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('../../', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1'));
const REPORT_DIR = path.join(ROOT, 'automation', 'bourbon-signal', 'reports');
const SITE_OUT = path.join(ROOT, 'engine', 'out', 'site');
const ENGINE_OUT = path.join(ROOT, 'engine', 'out');
const BASE_URL = process.env.BOURBON_SIGNAL_PROD_URL || 'https://www.bourbonsignal.com';
const REQUIRED_STATES = ['NC', 'VA', 'PA', 'TX', 'TN', 'IL', 'IN'];
const REQUIRED_STATE_SIGNAL_FLOORS = {
  NC: Number(process.env.BOURBON_SIGNAL_MIN_NC_SIGNALS || 1000),
  VA: Number(process.env.BOURBON_SIGNAL_MIN_VA_SIGNALS || 2000),
  PA: Number(process.env.BOURBON_SIGNAL_MIN_PA_SIGNALS || 1000),
  IN: Number(process.env.BOURBON_SIGNAL_MIN_IN_SIGNALS || 1000),
  IL: Number(process.env.BOURBON_SIGNAL_MIN_IL_SIGNALS || 250),
  TN: Number(process.env.BOURBON_SIGNAL_MIN_TN_SIGNALS || 50),
  TX: Number(process.env.BOURBON_SIGNAL_MIN_TX_SIGNALS || 50),
};
const MAX_EXPORT_AGE_HOURS = Number(process.env.BOURBON_SIGNAL_MAX_EXPORT_AGE_HOURS || 18);
const MAX_SOURCE_HEALTH_AGE_HOURS = Number(process.env.BOURBON_SIGNAL_MAX_SOURCE_HEALTH_AGE_HOURS || 18);
const MAX_ANON_DROPS = Number(process.env.BOURBON_SIGNAL_MAX_ANON_DROPS || 7);

function nowIso() { return new Date().toISOString(); }
function hoursSince(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(+date)) return Infinity;
  return (Date.now() - +date) / 36e5;
}
function ageLabel(value) {
  const hours = hoursSince(value);
  if (!Number.isFinite(hours)) return 'unknown age';
  if (hours < 1) return `${Math.round(hours * 60)}m old`;
  if (hours < 48) return `${hours.toFixed(1)}h old`;
  return `${(hours / 24).toFixed(1)}d old`;
}
async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}
function pushIssue(issues, severity, area, message, detail = null) {
  issues.push({ severity, area, message, detail });
}
function severityRank(sev) { return ({ critical: 4, warn: 3, watch: 2, info: 1 }[sev] || 0); }
async function fetchCheck(pathname, expect) {
  const started = Date.now();
  const url = pathname.startsWith('http') ? pathname : `${BASE_URL}${pathname}`;
  try {
    const res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'BourbonSignalReliabilityCheck/1.0' } });
    const contentType = res.headers.get('content-type') || '';
    let body = '';
    if (expect?.text || expect?.json || res.status === 200) body = await res.text();
    return {
      url,
      status: res.status,
      ok: expect ? expect({ res, body, contentType }) : res.ok,
      location: res.headers.get('location'),
      ms: Date.now() - started,
      body,
      contentType,
    };
  } catch (err) {
    return { url, status: 0, ok: false, error: err.message, ms: Date.now() - started };
  }
}
function stateRows(stats) {
  return stats?.stateCoverage?.states || [];
}
function summarizeDropsForTimestampRisk(drops) {
  const rows = Array.isArray(drops?.drops) ? drops.drops : [];
  const sample = rows.slice(0, 500);
  const missingBasis = sample.filter((d) => !d.timestampBasis && !d.timestamp_basis).slice(0, 5);
  const repeatedFalseFresh = sample.filter((d) => {
    const type = String(d.type || d.event_type || '').toLowerCase();
    const basis = d.timestampBasis || d.timestamp_basis;
    const firstSeen = d.firstSeenAt || d.first_seen_at;
    const lastConfirmed = d.lastConfirmedAt || d.last_confirmed_at;
    const ts = d.displayAt || d.timestamp;
    if (!type.includes('inventory')) return false;
    if (!firstSeen || !lastConfirmed || firstSeen === lastConfirmed) return false;
    return basis === 'last_confirmed_at' || ts === lastConfirmed;
  }).slice(0, 5);
  const shipmentWithoutEvent = sample.filter((d) => {
    const type = String(d.type || d.event_type || '').toLowerCase();
    return type.includes('shipment') && !(d.eventAt || d.event_at);
  }).slice(0, 5);
  const sourceEventFuture = sample.filter((d) => {
    const eventAt = d.eventAt || d.event_at;
    const observedAt = d.observedAt || d.observed_at;
    return eventAt && observedAt && +new Date(eventAt) > +new Date(observedAt) + 60_000;
  }).slice(0, 5);
  return { checked: sample.length, missingBasis, repeatedFalseFresh, shipmentWithoutEvent, sourceEventFuture };
}
function summarizeAlertRisk(alerts) {
  const candidates = Array.isArray(alerts?.candidates) ? alerts.candidates : Array.isArray(alerts?.alerts) ? alerts.alerts : [];
  const risky = candidates.filter((a) => {
    const type = String(a.type || a.eventType || a.event_type || '').toLowerCase();
    const lane = String(a.dataLane || a.data_lane || '').toLowerCase();
    const precision = String(a.locationPrecision || a.location_precision || '').toLowerCase();
    const informationalOnly = Boolean(a.informationalOnly || a.informational_only);
    return informationalOnly || lane === 'informational' || type.includes('catalog') || type.includes('watch') || (type.includes('shipment') && precision !== 'store_level');
  }).slice(0, 10);
  return { count: candidates.length, risky };
}
function formatIssue(issue) {
  const icon = issue.severity === 'critical' ? '❌' : issue.severity === 'warn' ? '⚠️' : issue.severity === 'watch' ? '👀' : 'ℹ️';
  return `${icon} **${issue.area}:** ${issue.message}${issue.detail ? ` — ${issue.detail}` : ''}`;
}
function markdownReport(result) {
  const statusIcon = result.status === 'healthy' ? '✅' : result.status === 'watch' ? '👀' : result.status === 'warning' ? '⚠️' : '❌';
  const lines = [];
  lines.push(`# Bourbon Signal Daily Reliability — ${result.generatedAt.slice(0, 10)}`);
  lines.push('');
  lines.push(`${statusIcon} **Overall:** ${result.status.toUpperCase()}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(`- Production: ${result.production.ok}/${result.production.total} checks passed`);
  lines.push(`- Engine export: ${result.engine.generatedAt || 'unknown'} (${result.engine.generatedAge})`);
  lines.push(`- Source health: ${result.sourceHealth.status || 'unknown'} (${result.sourceHealth.generatedAge})`);
  lines.push(`- Signals/drops: ${result.engine.signalCount ?? 'n/a'} signals, ${result.engine.dropCount ?? 'n/a'} drops, ${result.alerts.count} alert candidates`);
  lines.push(`- Timestamp sample: ${result.timestamps.checked} rows checked`);
  lines.push('');
  if (result.issues.length) {
    lines.push('## Issues / watch items');
    for (const issue of result.issues.sort((a, b) => severityRank(b.severity) - severityRank(a.severity))) lines.push(`- ${formatIssue(issue)}`);
  } else {
    lines.push('## Issues / watch items');
    lines.push('- ✅ No reliability, alert safety, source health, or timestamp integrity issues detected.');
  }
  lines.push('');
  lines.push('## Production checks');
  for (const check of result.production.checks) {
    lines.push(`- ${check.ok ? '✅' : '❌'} ${check.label}: ${check.status}${check.location ? ` → ${check.location}` : ''} (${check.ms}ms)`);
  }
  lines.push('');
  lines.push('## Required state coverage');
  for (const st of result.engine.requiredStates) lines.push(`- ${st.ok ? '✅' : '❌'} ${st.state}: ${st.signalCount} signals, status ${st.status || 'missing'}`);
  lines.push('');
  lines.push('## Recommended action');
  lines.push(result.recommendation);
  lines.push('');
  return lines.join('\n');
}

async function main() {
  await mkdir(REPORT_DIR, { recursive: true });
  const generatedAt = nowIso();
  const issues = [];

  const [stats, drops, alerts, sourceHealth] = await Promise.all([
    readJson(path.join(SITE_OUT, 'stats.json'), {}),
    readJson(path.join(SITE_OUT, 'drops.json'), {}),
    readJson(path.join(SITE_OUT, 'alerts.json'), {}),
    readJson(path.join(ENGINE_OUT, 'source-health.json'), {}),
  ]);

  const productionSpecs = [
    ['homepage', '/', ({ res }) => res.status === 200],
    ['signup age gate', '/sign-up', ({ res, body }) => res.status === 200 && /21|older|Age confirmation/i.test(body)],
    ['dashboard locked', '/dashboard', ({ res }) => [301, 302, 307, 308].includes(res.status) && /sign-up/.test(res.headers.get('location') || '')],
    ['stats api', '/api/stats', ({ res, body }) => res.status === 200 && /stateCount|signalCount/.test(body)],
    ['drops preview api', '/api/drops?limit=50', ({ res, body }) => {
      if (res.status !== 200) return false;
      try { const json = JSON.parse(body); return Array.isArray(json.drops) && json.drops.length <= MAX_ANON_DROPS && json.previewLocked === true && json.requiresAccountForFullFeed === true; } catch { return false; }
    }],
    ['protected bottles api', '/api/bottles', ({ res }) => res.status === 401],
    ['terms', '/legal/terms', ({ res, body }) => res.status === 200 && /Todd Digital Ventures LLC|Bourbon Signal/.test(body)],
    ['privacy', '/legal/privacy', ({ res, body }) => res.status === 200 && /Todd Digital Ventures LLC|Privacy/.test(body)],
    ['refunds', '/legal/refunds', ({ res, body }) => res.status === 200 && /Founding member|non-refundable|Todd Digital Ventures LLC/.test(body)],
    ['disclaimer', '/legal/disclaimer', ({ res, body }) => res.status === 200 && /does not sell alcohol|21/.test(body)],
  ];
  const checks = [];
  for (const [label, pathname, expect] of productionSpecs) {
    const check = await fetchCheck(pathname, expect);
    checks.push({ label, status: check.status, ok: check.ok, location: check.location, ms: check.ms, error: check.error });
    if (!check.ok) pushIssue(issues, 'critical', 'production', `${label} check failed`, check.error || `status ${check.status}${check.location ? ` location ${check.location}` : ''}`);
  }

  const exportAge = hoursSince(stats.generatedAt);
  const sourceAge = hoursSince(sourceHealth.generatedAt);
  if (exportAge > MAX_EXPORT_AGE_HOURS) pushIssue(issues, 'warn', 'engine freshness', `site export is stale`, `${ageLabel(stats.generatedAt)}; threshold ${MAX_EXPORT_AGE_HOURS}h`);
  if (sourceAge > MAX_SOURCE_HEALTH_AGE_HOURS) pushIssue(issues, 'warn', 'source health freshness', `source health report is stale`, `${ageLabel(sourceHealth.generatedAt)}; threshold ${MAX_SOURCE_HEALTH_AGE_HOURS}h`);
  if (stats.refreshHealth?.failedStateCount > 0) pushIssue(issues, 'critical', 'engine health', `${stats.refreshHealth.failedStateCount} failed state(s)`, (stats.refreshHealth.failedStates || []).join(', '));
  if (stats.refreshHealth?.degradedStateCount > 0 || stats.refreshHealth?.staleStateCount > 0) pushIssue(issues, 'warn', 'engine health', `${stats.refreshHealth.degradedStateCount || 0} degraded / ${stats.refreshHealth.staleStateCount || 0} stale state(s)`);
  if (sourceHealth.totals?.failedStateCount > 0) pushIssue(issues, 'critical', 'source health', `${sourceHealth.totals.failedStateCount} failed state(s)`);
  if (sourceHealth.totals?.degradedStateCount > 0 || sourceHealth.totals?.staleStateCount > 0) pushIssue(issues, 'warn', 'source health', `${sourceHealth.totals.degradedStateCount || 0} degraded / ${sourceHealth.totals.staleStateCount || 0} stale state(s)`);

  const browserPreflightFailures = (sourceHealth.browserPreflight?.results || []).filter((r) => r.ok === false && !String(r.status || '').includes('non_blocking'));
  const nonBlockingBrowserFailures = (sourceHealth.browserPreflight?.results || []).filter((r) => r.ok === false);
  if (browserPreflightFailures.length) pushIssue(issues, 'warn', 'browser preflight', `${browserPreflightFailures.length} blocking browser preflight failure(s)`);
  else if (nonBlockingBrowserFailures.length) pushIssue(issues, 'watch', 'browser preflight', `${nonBlockingBrowserFailures.length} non-blocking browser preflight failure(s)`, nonBlockingBrowserFailures.map((r) => r.id).join(', '));

  const rows = stateRows(stats);
  const requiredStates = REQUIRED_STATES.map((state) => {
    const row = rows.find((r) => r.state === state);
    const signalCount = Number(row?.signalCount || 0);
    const floor = REQUIRED_STATE_SIGNAL_FLOORS[state] || 1;
    const ok = !!row && signalCount >= floor && row.status !== 'failed';
    if (!row) pushIssue(issues, 'warn', 'state coverage', `${state} missing in required coverage`);
    else if (row.status === 'failed') pushIssue(issues, 'warn', 'state coverage', `${state} failed in required coverage`);
    else if (signalCount < floor) pushIssue(issues, 'warn', 'state coverage', `${state} below signal floor`, `${signalCount} signals; expected at least ${floor}`);
    return { state, ok, signalCount, signalFloor: floor, status: row?.status || null };
  });

  for (const [state, floor] of Object.entries(REQUIRED_STATE_SIGNAL_FLOORS)) {
    const sourceRow = (sourceHealth.states || []).find((r) => r.state === state);
    const signalCount = Number(sourceRow?.signalCount || 0);
    if (sourceRow && signalCount < floor) pushIssue(issues, 'warn', 'source health regression', `${state} source health below signal floor`, `${signalCount} signals; expected at least ${floor}`);
  }

  const alertsSummary = summarizeAlertRisk(alerts);
  if (alertsSummary.risky.length) pushIssue(issues, 'warn', 'alert safety', `${alertsSummary.risky.length} risky alert candidate(s) sampled`, alertsSummary.risky.map((a) => a.bottleName || a.brand_name || a.rawName || a.id || 'unknown').slice(0, 5).join(', '));
  if (alertsSummary.count > 100) pushIssue(issues, 'watch', 'alert safety', `unusually high alert candidate count`, String(alertsSummary.count));

  const timestampSummary = summarizeDropsForTimestampRisk(drops);
  if (timestampSummary.missingBasis.length) pushIssue(issues, 'warn', 'timestamp integrity', `${timestampSummary.missingBasis.length} sampled drops missing timestamp basis`);
  if (timestampSummary.repeatedFalseFresh.length) pushIssue(issues, 'critical', 'timestamp integrity', `inventory rows may be surfacing as false-fresh`, timestampSummary.repeatedFalseFresh.map((d) => d.bottleName || d.brand_name).join(', '));
  if (timestampSummary.shipmentWithoutEvent.length) pushIssue(issues, 'warn', 'timestamp integrity', `shipment rows missing eventAt`, timestampSummary.shipmentWithoutEvent.map((d) => d.bottleName || d.brand_name).join(', '));
  if (timestampSummary.sourceEventFuture.length) pushIssue(issues, 'warn', 'timestamp integrity', `source event dates newer than observed dates`);

  const critical = issues.some((i) => i.severity === 'critical');
  const warn = issues.some((i) => i.severity === 'warn');
  const watch = issues.some((i) => i.severity === 'watch');
  const status = critical ? 'critical' : warn ? 'warning' : watch ? 'watch' : 'healthy';
  const recommendation = critical
    ? 'Investigate critical production/data trust failures before relying on alerts or inviting users.'
    : warn
      ? 'Review warning items today; fix before expanding tester usage or making product claims around affected areas.'
      : watch
        ? 'No urgent action. Keep an eye on watch items in the next pass.'
        : 'No action needed. Continue normal operation.';

  const result = {
    generatedAt,
    status,
    production: { total: checks.length, ok: checks.filter((c) => c.ok).length, checks },
    engine: {
      generatedAt: stats.generatedAt,
      generatedAge: ageLabel(stats.generatedAt),
      engineGeneratedAt: stats.engineGeneratedAt,
      stateCount: stats.stateCount,
      signalCount: stats.signalCount,
      dropCount: stats.dropCount,
      locationCount: stats.locationCount,
      requiredStates,
      refreshHealth: stats.refreshHealth,
    },
    sourceHealth: {
      generatedAt: sourceHealth.generatedAt,
      generatedAge: ageLabel(sourceHealth.generatedAt),
      status: sourceHealth.status,
      totals: sourceHealth.totals,
      browserPreflight: sourceHealth.browserPreflight?.results?.map((r) => ({ id: r.id, status: r.status, ok: r.ok })) || [],
    },
    alerts: alertsSummary,
    timestamps: timestampSummary,
    issues,
    recommendation,
  };

  const stamp = generatedAt.replace(/[:.]/g, '-');
  const jsonPath = path.join(REPORT_DIR, `daily-reliability-${stamp}.json`);
  const mdPath = path.join(REPORT_DIR, `daily-reliability-${stamp}.md`);
  const latestJson = path.join(REPORT_DIR, 'daily-reliability-latest.json');
  const latestMd = path.join(REPORT_DIR, 'daily-reliability-latest.md');
  const md = markdownReport(result);
  await Promise.all([
    writeFile(jsonPath, JSON.stringify(result, null, 2)),
    writeFile(mdPath, md),
    writeFile(latestJson, JSON.stringify(result, null, 2)),
    writeFile(latestMd, md),
  ]);

  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else console.log(md);
  process.exitCode = critical ? 2 : warn ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 2;
});
