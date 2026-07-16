#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildPrivacySafeSearchDemand } from './search-demand-core.mjs';

const ROOT = path.resolve(new URL('../../', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1'));
const REPORT_DIR = path.join(ROOT, 'automation', 'bourbon-signal', 'reports');
const SINCE = process.argv.find((arg) => arg.startsWith('--since='))?.slice('--since='.length) || '24h';
const TARGET = process.argv.find((arg) => arg.startsWith('--target='))?.slice('--target='.length) || 'https://www.bourbonsignal.com';

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

function parseEvents(logText) {
  const events = [];
  for (const line of logText.split(/\r?\n/)) {
    const marker = 'BS_SEARCH_EVENT ';
    const index = line.indexOf(marker);
    if (index === -1) continue;
    try {
      events.push(JSON.parse(line.slice(index + marker.length).trim()));
    } catch {
      // Malformed and truncated lines never enter an aggregate.
    }
  }
  return events;
}

function markdown(report) {
  const lines = [
    `# Bourbon Signal Privacy-safe Search Demand — last ${SINCE}`,
    '',
    `Accepted bounded events: **${report.acceptedEvents}**`,
    `Sensitive-shaped legacy events rejected before aggregation: **${report.rejectedSensitiveEvents}**`,
    '',
    'Only catalog-resolved bottles and active state codes meeting the minimum event threshold are shown. Counts are searches, not distinct people. Raw queries and event history are never written.',
    '',
    '## Canonical bottle demand',
    '',
    '| Searches | Weight | Bottle | Canonical ID |',
    '|---:|---:|---|---|',
  ];
  for (const item of report.bottles) {
    lines.push(`| ${item.eventCount} | ${item.weightedDemand} | ${item.canonicalBottleName.replace(/\|/g, '/')} | ${item.canonicalBottleId} |`);
  }
  if (!report.bottles.length) lines.push('| — | — | No event bucket met the threshold | — |');
  lines.push('', '## Approved geography demand', '', '| Searches | Weight | State |', '|---:|---:|---|');
  for (const item of report.geographies) lines.push(`| ${item.eventCount} | ${item.weightedDemand} | ${item.state} |`);
  if (!report.geographies.length) lines.push('| — | — | No event bucket met the threshold |');
  lines.push('', `Suppressed event buckets: ${report.suppressed.bottleBuckets} bottle · ${report.suppressed.geographyBuckets} geography.`);
  return lines.join('\n');
}

await mkdir(REPORT_DIR, { recursive: true });
const result = spawnSync('vercel', ['logs', TARGET, '--since', SINCE], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
  maxBuffer: 8 * 1024 * 1024,
});
const combined = `${result.stdout || ''}\n${result.stderr || ''}`;
if (result.error) throw result.error;
const [bottlePayload, stateConfig] = await Promise.all([
  readJson(path.join(ROOT, 'engine', 'out', 'site', 'bottles.json'), { bottles: [] }),
  readJson(path.join(ROOT, 'src', 'config', 'state-lifecycle.json'), { activeStates: [] }),
]);
const demand = buildPrivacySafeSearchDemand(parseEvents(combined), {
  catalog: bottlePayload.bottles,
  approvedStateCodes: stateConfig.activeStates,
});
const report = { generatedAt: new Date().toISOString(), since: SINCE, ...demand };
const md = markdown(report);
await Promise.all([
  writeFile(path.join(REPORT_DIR, 'search-events-latest.json'), JSON.stringify(report, null, 2)),
  writeFile(path.join(REPORT_DIR, 'search-events-latest.md'), md),
  writeFile(path.join(REPORT_DIR, 'search-demand-latest.json'), JSON.stringify(report, null, 2)),
]);
console.log(md);
