#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('../../', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1'));
const REPORT_DIR = path.join(ROOT, 'automation', 'bourbon-signal', 'reports');
const SINCE = process.argv.find((arg) => arg.startsWith('--since='))?.slice('--since='.length) || '24h';
const TARGET = process.argv.find((arg) => arg.startsWith('--target='))?.slice('--target='.length) || 'https://www.bourbonsignal.com';

function parseEvents(logText) {
  const events = [];
  for (const line of logText.split(/\r?\n/)) {
    const marker = 'BS_SEARCH_EVENT ';
    const index = line.indexOf(marker);
    if (index === -1) continue;
    const jsonText = line.slice(index + marker.length).trim();
    try {
      events.push(JSON.parse(jsonText));
    } catch {
      // Ignore malformed/truncated log lines.
    }
  }
  return events;
}
function keyFor(event) {
  return [event.surface, event.mode || '', event.state || '', String(event.query || '').toLowerCase(), event.matchedBottleName || '', event.outcome || ''].join('|');
}
function summarize(events) {
  const grouped = new Map();
  for (const event of events) {
    const key = keyFor(event);
    const existing = grouped.get(key) || { ...event, count: 0, firstSeen: event.capturedAt, lastSeen: event.capturedAt };
    existing.count += 1;
    if (event.capturedAt && (!existing.firstSeen || event.capturedAt < existing.firstSeen)) existing.firstSeen = event.capturedAt;
    if (event.capturedAt && (!existing.lastSeen || event.capturedAt > existing.lastSeen)) existing.lastSeen = event.capturedAt;
    grouped.set(key, existing);
  }
  return Array.from(grouped.values()).sort((a, b) => (b.count - a.count) || String(b.lastSeen || '').localeCompare(String(a.lastSeen || '')));
}
function markdown(events, grouped) {
  const lines = [];
  lines.push(`# Bourbon Signal Search Events — last ${SINCE}`);
  lines.push('');
  lines.push(`Total captured events: **${events.length}**`);
  lines.push('');
  if (!grouped.length) {
    lines.push('No Bottle Check or Finder search events found in the requested Vercel log window.');
    return lines.join('\n');
  }
  lines.push('| Count | Surface | Mode | State | Query | Outcome | Match | Score |');
  lines.push('|---:|---|---|---|---|---|---|---|');
  for (const event of grouped.slice(0, 80)) {
    lines.push(`| ${event.count} | ${event.surface || ''} | ${event.mode || ''} | ${event.state || ''} | ${String(event.query || '').replace(/\|/g, '/')} | ${event.outcome || ''} | ${String(event.matchedBottleName || '').replace(/\|/g, '/')} | ${event.localScore ?? event.scoreStatus ?? ''} |`);
  }
  return lines.join('\n');
}

await mkdir(REPORT_DIR, { recursive: true });
const result = spawnSync('vercel', ['logs', TARGET, '--since', SINCE], { cwd: ROOT, encoding: 'utf8', shell: true, maxBuffer: 8 * 1024 * 1024 });
const combined = `${result.stdout || ''}\n${result.stderr || ''}`;
if (result.error) throw result.error;
const events = parseEvents(combined);
const grouped = summarize(events);
const report = { generatedAt: new Date().toISOString(), since: SINCE, target: TARGET, events, grouped };
const stamp = report.generatedAt.replace(/[:.]/g, '-');
const md = markdown(events, grouped);
await Promise.all([
  writeFile(path.join(REPORT_DIR, `search-events-${stamp}.json`), JSON.stringify(report, null, 2)),
  writeFile(path.join(REPORT_DIR, `search-events-${stamp}.md`), md),
  writeFile(path.join(REPORT_DIR, 'search-events-latest.json'), JSON.stringify(report, null, 2)),
  writeFile(path.join(REPORT_DIR, 'search-events-latest.md'), md),
]);
console.log(md);
