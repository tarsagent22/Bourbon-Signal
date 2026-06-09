#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('../../', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1'));
const REPORT_DIR = path.join(ROOT, 'automation', 'bourbon-signal', 'reports');
const SITE_OUT = path.join(ROOT, 'engine', 'out', 'site');
const ENGINE_OUT = path.join(ROOT, 'engine', 'out');
const TESTER_STATES = ['NC', 'VA', 'TX', 'IL', 'TN', 'IN'];
const CORE_STATES = ['NC', 'VA', 'PA'];
const PRECISION_RANK = {
  unknown: 0,
  none: 0,
  statewide_catalog: 1,
  statewide: 1,
  warehouse: 2,
  board_county: 3,
  county: 3,
  city: 4,
  store_level: 5,
  exact_store: 5,
};

function nowIso() { return new Date().toISOString(); }
async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}
function stateRows(stats) { return stats?.stateCoverage?.states || []; }
function sourceStates(sourceHealth) { return sourceHealth?.states || []; }
function addCandidate(candidates, title, score, reason, recommendedAction, evidence = []) {
  candidates.push({ title, score, reason, recommendedAction, evidence: evidence.filter(Boolean) });
}
function uniq(items) { return Array.from(new Set(items.filter(Boolean))); }
function topRoadblockSummary(state) {
  return (state?.topRoadblocks || []).slice(0, 3).map((r) => `${r.source}: ${r.status} ${r.error || ''}`.trim());
}
function precisionRank(value) {
  return PRECISION_RANK[String(value || 'unknown').toLowerCase()] ?? 0;
}
function summarizeCoverage(stats, sourceHealth) {
  const rows = stateRows(stats);
  const healthRows = sourceStates(sourceHealth);
  const allStates = uniq([...rows.map((r) => r.state), ...healthRows.map((r) => r.state)]).sort();
  return allStates.map((state) => {
    const row = rows.find((r) => r.state === state) || {};
    const health = healthRows.find((r) => r.state === state) || {};
    return {
      state,
      label: row.label || health.label || state,
      signalCount: Number(row.signalCount ?? health.signalCount ?? 0),
      actionableInventorySignalCount: Number(health.actionableInventorySignalCount ?? 0),
      roadblockCount: Number(row.roadblockCount ?? health.roadblockCount ?? 0),
      status: row.status || health.status || 'unknown',
      bestLocationPrecision: row.bestLocationPrecision || health.bestLocationPrecision,
      targetLocationPrecision: row.targetLocationPrecision || health.targetLocationPrecision,
      topRoadblocks: topRoadblockSummary(health),
      testerState: TESTER_STATES.includes(state),
      coreState: CORE_STATES.includes(state),
    };
  });
}
function inspectTimestampRisks(drops) {
  const rows = Array.isArray(drops?.drops) ? drops.drops : [];
  const byType = new Map();
  const risks = [];
  for (const d of rows.slice(0, 2000)) {
    const type = String(d.type || d.event_type || 'unknown');
    byType.set(type, (byType.get(type) || 0) + 1);
    const basis = d.timestampBasis || d.timestamp_basis;
    const firstSeen = d.firstSeenAt || d.first_seen_at;
    const lastConfirmed = d.lastConfirmedAt || d.last_confirmed_at;
    const eventAt = d.eventAt || d.event_at;
    const displayAt = d.displayAt || d.timestamp;
    if (!basis) risks.push({ kind: 'missing timestampBasis', bottle: d.bottleName || d.brand_name, type, state: d.state || d.state_code });
    if (type.toLowerCase().includes('inventory') && firstSeen && lastConfirmed && firstSeen !== lastConfirmed && (basis === 'last_confirmed_at' || displayAt === lastConfirmed)) {
      risks.push({ kind: 'possible false-fresh repeated inventory', bottle: d.bottleName || d.brand_name, type, state: d.state || d.state_code });
    }
    if (type.toLowerCase().includes('shipment') && !eventAt) risks.push({ kind: 'shipment missing eventAt', bottle: d.bottleName || d.brand_name, type, state: d.state || d.state_code });
    if (risks.length >= 25) break;
  }
  return { typeCounts: Object.fromEntries([...byType.entries()].sort((a, b) => b[1] - a[1])), risks };
}
function inspectAlertCandidates(alerts) {
  const candidates = Array.isArray(alerts?.candidates) ? alerts.candidates : Array.isArray(alerts?.alerts) ? alerts.alerts : [];
  const risky = candidates.filter((a) => {
    const type = String(a.type || a.eventType || a.event_type || '').toLowerCase();
    const lane = String(a.dataLane || a.data_lane || '').toLowerCase();
    const precision = String(a.locationPrecision || a.location_precision || '').toLowerCase();
    return Boolean(a.informationalOnly || a.informational_only) || lane === 'informational' || type.includes('catalog') || type.includes('watch') || (type.includes('shipment') && precision !== 'store_level');
  });
  return { count: candidates.length, riskyCount: risky.length, riskySample: risky.slice(0, 5).map((a) => ({ state: a.state, bottle: a.bottleName || a.brand_name || a.rawName, type: a.type || a.eventType || a.event_type })) };
}
function rankCandidates({ coverage, timestamp, alerts, sourceHealth }) {
  const candidates = [];

  for (const row of coverage) {
    const base = (row.coreState ? 25 : 0) + (row.testerState ? 22 : 0);
    if (row.signalCount === 0) {
      addCandidate(candidates, `Restore ${row.state} coverage`, base + 55, `${row.label} has zero signals.`, `Inspect ${row.state} collector/source route first; do not expand features until coverage returns.`, row.topRoadblocks);
      continue;
    }
    if (row.roadblockCount >= 4) {
      addCandidate(candidates, `Reduce ${row.state} source roadblocks`, base + Math.min(35, row.roadblockCount * 4), `${row.label} has ${row.roadblockCount} roadblock(s).`, `Inspect top roadblocks and harden the most valuable failing route.`, row.topRoadblocks);
    }
    if ((row.testerState || row.coreState) && row.actionableInventorySignalCount === 0) {
      addCandidate(candidates, `Improve ${row.state} actionable inventory`, base + 34, `${row.label} has ${row.signalCount} signals but no actionable inventory signals in source-health.`, `Find/strengthen retailer-published store inventory or confirm why this state should remain informational/watch-only.`, row.topRoadblocks);
    }
    if (precisionRank(row.bestLocationPrecision) < precisionRank(row.targetLocationPrecision)) {
      addCandidate(candidates, `Improve ${row.state} location precision`, base + 18, `${row.label} best precision is ${row.bestLocationPrecision}, target is ${row.targetLocationPrecision}.`, `Tighten store/board mapping and verify public drop labels remain honest.`, row.topRoadblocks);
    }
  }

  if (timestamp.risks.length) {
    addCandidate(candidates, 'Fix timestamp/data trust risks', 95, `${timestamp.risks.length} sampled timestamp risk(s) found.`, 'Fix timestamp semantics before any coverage expansion; user trust beats more rows.', timestamp.risks.slice(0, 5).map((r) => `${r.state} ${r.type}: ${r.kind} (${r.bottle || 'unknown'})`));
  }
  if (alerts.riskyCount) {
    addCandidate(candidates, 'Harden alert candidate policy', 88, `${alerts.riskyCount} risky alert candidate(s) detected.`, 'Inspect alert lanes/caveats so non-inventory data cannot generate urgent alerts.', alerts.riskySample.map((r) => `${r.state} ${r.type}: ${r.bottle || 'unknown'}`));
  }

  const browserFailures = (sourceHealth.browserPreflight?.results || []).filter((r) => r.ok === false);
  if (browserFailures.length) {
    const blocking = browserFailures.filter((r) => !String(r.status || '').includes('non_blocking'));
    addCandidate(
      candidates,
      'Stabilize browser-assisted source preflight',
      blocking.length ? 58 : 24,
      `${browserFailures.length} browser preflight failure(s) found${blocking.length ? '' : ' (currently non-blocking)'}.`,
      'Confirm whether failures are expected local-browser availability issues or real source access regressions.',
      browserFailures.map((r) => `${r.id}: ${r.status || r.error || 'failed'}`)
    );
  }

  if (!candidates.length) {
    addCandidate(candidates, 'No urgent engine fix found; improve next tester-state coverage', 30, 'Health checks did not identify a critical source or trust issue.', 'Pick the highest-value tester state with partial coverage and improve one source contract end-to-end.', []);
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 8);
}
function markdownReport(report) {
  const lines = [];
  lines.push(`# Bourbon Signal Weekly Engine Improvement Brief — ${report.generatedAt.slice(0, 10)}`);
  lines.push('');
  lines.push('## Top recommendations');
  report.recommendations.slice(0, 5).forEach((r, i) => {
    lines.push(`${i + 1}. **${r.title}** — score ${r.score}`);
    lines.push(`   - Why: ${r.reason}`);
    lines.push(`   - Action: ${r.recommendedAction}`);
    if (r.evidence.length) lines.push(`   - Evidence: ${r.evidence.slice(0, 3).join(' | ')}`);
  });
  lines.push('');
  lines.push('## Coverage snapshot');
  for (const row of report.coverage.filter((r) => r.coreState || r.testerState)) {
    lines.push(`- ${row.state}: ${row.signalCount} signals, ${row.actionableInventorySignalCount} actionable inventory, ${row.roadblockCount} roadblocks, precision ${row.bestLocationPrecision || 'unknown'}`);
  }
  lines.push('');
  lines.push('## Alert and timestamp snapshot');
  lines.push(`- Alert candidates: ${report.alerts.count}; risky sampled: ${report.alerts.riskyCount}`);
  lines.push(`- Timestamp risks sampled: ${report.timestamp.risks.length}`);
  lines.push('');
  lines.push('## Suggested next coding loop');
  const top = report.recommendations[0];
  lines.push(`Work on **${top.title}**.`);
  lines.push('1. Inspect the source/source-health evidence.');
  lines.push('2. Define what the data honestly means: inventory, shipment, catalog, watch, or informational.');
  lines.push('3. Make the smallest engine change.');
  lines.push('4. Run engine verify/export/quality checks.');
  lines.push('5. Inspect public drops for labels, caveats, and timestamps.');
  lines.push('6. Run site build and API smoke.');
  lines.push('7. Deploy only if clean, then verify production.');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  await mkdir(REPORT_DIR, { recursive: true });
  const generatedAt = nowIso();
  const [stats, sourceHealth, drops, alerts] = await Promise.all([
    readJson(path.join(SITE_OUT, 'stats.json'), {}),
    readJson(path.join(ENGINE_OUT, 'source-health.json'), {}),
    readJson(path.join(SITE_OUT, 'drops.json'), {}),
    readJson(path.join(SITE_OUT, 'alerts.json'), {}),
  ]);
  const coverage = summarizeCoverage(stats, sourceHealth);
  const timestamp = inspectTimestampRisks(drops);
  const alertSummary = inspectAlertCandidates(alerts);
  const recommendations = rankCandidates({ coverage, timestamp, alerts: alertSummary, sourceHealth });
  const report = {
    generatedAt,
    statsGeneratedAt: stats.generatedAt,
    sourceHealthGeneratedAt: sourceHealth.generatedAt,
    coverage,
    timestamp,
    alerts: alertSummary,
    recommendations,
  };
  const stamp = generatedAt.replace(/[:.]/g, '-');
  const jsonPath = path.join(REPORT_DIR, `weekly-engine-brief-${stamp}.json`);
  const mdPath = path.join(REPORT_DIR, `weekly-engine-brief-${stamp}.md`);
  const latestJson = path.join(REPORT_DIR, 'weekly-engine-brief-latest.json');
  const latestMd = path.join(REPORT_DIR, 'weekly-engine-brief-latest.md');
  const md = markdownReport(report);
  await Promise.all([
    writeFile(jsonPath, JSON.stringify(report, null, 2)),
    writeFile(mdPath, md),
    writeFile(latestJson, JSON.stringify(report, null, 2)),
    writeFile(latestMd, md),
  ]);
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else console.log(md);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 2;
});
