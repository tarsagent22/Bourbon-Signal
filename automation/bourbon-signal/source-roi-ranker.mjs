#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { findingsFromSourceRoi } from '../../scripts/lib/finding-adapters.mjs';
import { rankSourceInvestments } from './source-roi-core.mjs';

const ROOT = path.resolve(new URL('../../', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1'));
const REPORT_DIR = path.join(ROOT, 'automation', 'bourbon-signal', 'reports');
const SITE_OUT = path.join(ROOT, 'engine', 'out', 'site');
const ENGINE_OUT = path.join(ROOT, 'engine', 'out');

async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

async function main() {
  await mkdir(REPORT_DIR, { recursive: true });
  const [dropsPayload, alertsPayload, sourceHealth, demand] = await Promise.all([
    readJson(path.join(SITE_OUT, 'drops.json'), { drops: [] }),
    readJson(path.join(SITE_OUT, 'alerts.json'), { alerts: [] }),
    readJson(path.join(ENGINE_OUT, 'source-health.json'), { states: [] }),
    readJson(path.join(REPORT_DIR, 'search-demand-latest.json'), null),
  ]);
  const report = rankSourceInvestments({
    drops: dropsPayload.drops,
    alerts: alertsPayload.alerts,
    sourceHealth,
    demand,
  });
  const lines = [
    `# Bourbon Signal Source ROI Ranker — ${report.generatedAt.slice(0, 10)}`,
    '',
    `Demand weighting: **${report.demandWeighted ? 'privacy-safe aggregate applied' : 'unavailable; operational value only'}**`,
    '',
    '## Top source investments',
    '',
    '| Score | Demand | State | Source | Recommendation | Alerts | Store-level | Bottles | Cities | Roadblocks |',
    '|---:|---:|---|---|---|---:|---:|---:|---:|---:|',
  ];
  for (const row of report.top.slice(0, 25)) {
    lines.push(`| ${row.score} | ${row.demandScore} | ${row.state} | ${row.source.replace(/\|/g, '/')} | ${row.recommendation} | ${row.alerts} | ${row.storeLevel} | ${row.uniqueBottles} | ${row.uniqueCities} | ${row.roadblocks} |`);
  }
  report.findings = findingsFromSourceRoi(report);
  lines.push(
    '',
    '## How to use',
    '',
    '- Demand is accepted only from cohort-suppressed canonical bottle and active-state aggregates.',
    '- `repair_high_value_source`: fix breakage first.',
    '- `protect_and_expand`: keep guarded and add targets/markets.',
    '- `expand_target_mesh`: good inventory spine; add allocated/unicorn matching.',
    '- `demote_or_tighten_noise`: likely high-volume low-value rows with no measured demand.',
  );
  await Promise.all([
    writeFile(path.join(REPORT_DIR, 'source-roi-latest.json'), JSON.stringify(report, null, 2)),
    writeFile(path.join(REPORT_DIR, 'source-roi-latest.md'), lines.join('\n')),
  ]);
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else console.log(lines.join('\n'));
}

main().catch((error) => { console.error(error); process.exit(1); });
