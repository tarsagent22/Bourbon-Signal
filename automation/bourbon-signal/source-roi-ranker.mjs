#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('../../', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1'));
const REPORT_DIR = path.join(ROOT, 'automation', 'bourbon-signal', 'reports');
const SITE_OUT = path.join(ROOT, 'engine', 'out', 'site');
const ENGINE_OUT = path.join(ROOT, 'engine', 'out');

async function readJson(file, fallback = null) { try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; } }
function asString(value) { return typeof value === 'string' ? value : ''; }
function stateKey(row) { return asString(row.state || row.state_code).toUpperCase(); }
function sourceKey(row) { return asString(row.source || row.sourceLabel || row.type || 'unknown'); }
function isStoreLevel(row) { return asString(row.locationPrecision || row.location_precision).toLowerCase() === 'store_level'; }
function isAlertGrade(row) { return row.eligibleForDelivery === true || row.canAlertAsInventory === true || row.can_alert_as_inventory === true || row.alertCandidate === true; }
function valueWeight(row) {
  const text = `${row.bottle || row.bottleName || row.rawName || ''} ${row.tier || ''} ${row.priorityClass || ''}`.toLowerCase();
  let score = 1;
  if (/major|unicorn|allocated/.test(text)) score += 8;
  if (/weller|blanton|eagle rare|stagg|taylor|van winkle|old fitz|birthday|russell|four roses|elmer|booker|baker|blood oath/.test(text)) score += 5;
  if (isStoreLevel(row)) score += 3;
  return score;
}
function addSource(map, row, type) {
  const state = stateKey(row);
  const source = sourceKey(row);
  if (!state || !source) return;
  const key = `${state}|${source}`;
  if (!map.has(key)) map.set(key, { state, source, rows: 0, drops: 0, alerts: 0, storeLevel: 0, valueScore: 0, bottles: new Set(), cities: new Set(), roadblocks: 0, topIssues: [] });
  const item = map.get(key);
  item.rows += 1;
  if (type === 'drop') item.drops += 1;
  if (type === 'alert') item.alerts += 1;
  if (isStoreLevel(row)) item.storeLevel += 1;
  item.valueScore += valueWeight(row);
  const bottle = asString(row.bottle || row.bottleName || row.rawName || row.canonicalName);
  if (bottle) item.bottles.add(bottle);
  const city = asString(row.city || row.storeCity);
  if (city) item.cities.add(city);
}

async function main() {
  await mkdir(REPORT_DIR, { recursive: true });
  const [dropsPayload, alertsPayload, sourceHealth] = await Promise.all([
    readJson(path.join(SITE_OUT, 'drops.json'), { drops: [] }),
    readJson(path.join(SITE_OUT, 'alerts.json'), { alerts: [] }),
    readJson(path.join(ENGINE_OUT, 'source-health.json'), { states: [] }),
  ]);
  const map = new Map();
  for (const row of dropsPayload.drops || []) addSource(map, row, 'drop');
  for (const row of alertsPayload.alerts || []) addSource(map, row, 'alert');
  for (const state of sourceHealth.states || []) {
    for (const issue of state.topRoadblocks || state.roadblocks || []) {
      const source = asString(issue.source || issue.id || 'unknown');
      const key = `${state.state}|${source}`;
      if (!map.has(key)) map.set(key, { state: state.state, source, rows: 0, drops: 0, alerts: 0, storeLevel: 0, valueScore: 0, bottles: new Set(), cities: new Set(), roadblocks: 0, topIssues: [] });
      const item = map.get(key);
      item.roadblocks += 1;
      item.topIssues.push(`${issue.status || 'roadblock'} ${issue.error || ''}`.trim());
    }
  }
  const rows = [...map.values()].map((item) => {
    const repairPressure = item.roadblocks ? Math.min(35, item.roadblocks * 8) : 0;
    const score = Math.round(item.valueScore + item.alerts * 10 + item.storeLevel * 2 + item.bottles.size * 3 + item.cities.size + repairPressure - Math.max(0, item.rows - item.alerts - item.storeLevel) * 0.05);
    let recommendation = 'monitor';
    if (item.roadblocks && (item.alerts || item.storeLevel || item.valueScore > 30)) recommendation = 'repair_high_value_source';
    else if (item.alerts >= 10 || item.valueScore >= 80) recommendation = 'protect_and_expand';
    else if (item.storeLevel >= 20) recommendation = 'expand_target_mesh';
    else if (item.rows >= 100 && item.alerts === 0) recommendation = 'demote_or_tighten_noise';
    return {
      state: item.state,
      source: item.source,
      score,
      recommendation,
      rows: item.rows,
      drops: item.drops,
      alerts: item.alerts,
      storeLevel: item.storeLevel,
      uniqueBottles: item.bottles.size,
      uniqueCities: item.cities.size,
      roadblocks: item.roadblocks,
      topIssues: item.topIssues.slice(0, 3),
    };
  }).sort((a, b) => b.score - a.score);

  const report = { generatedAt: new Date().toISOString(), count: rows.length, top: rows.slice(0, 30), recommendations: rows.reduce((acc, row) => { acc[row.recommendation] = (acc[row.recommendation] || 0) + 1; return acc; }, {}) };
  const lines = [`# Bourbon Signal Source ROI Ranker — ${report.generatedAt.slice(0, 10)}`, '', '## Top source investments', '', '| Score | State | Source | Recommendation | Alerts | Store-level | Bottles | Cities | Roadblocks |', '|---:|---|---|---|---:|---:|---:|---:|---:|'];
  for (const row of report.top.slice(0, 25)) lines.push(`| ${row.score} | ${row.state} | ${row.source.replace(/\|/g, '/')} | ${row.recommendation} | ${row.alerts} | ${row.storeLevel} | ${row.uniqueBottles} | ${row.uniqueCities} | ${row.roadblocks} |`);
  lines.push('', '## How to use', '', '- `repair_high_value_source`: fix breakage first.', '- `protect_and_expand`: keep guarded and add targets/markets.', '- `expand_target_mesh`: good inventory spine; add allocated/unicorn matching.', '- `demote_or_tighten_noise`: likely high-volume low-value rows.');
  await Promise.all([
    writeFile(path.join(REPORT_DIR, 'source-roi-latest.json'), JSON.stringify(report, null, 2)),
    writeFile(path.join(REPORT_DIR, 'source-roi-latest.md'), lines.join('\n')),
  ]);
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else console.log(lines.join('\n'));
}

main().catch((error) => { console.error(error); process.exit(1); });
