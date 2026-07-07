#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('../../', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1'));
const REPORT_DIR = path.join(ROOT, 'automation', 'bourbon-signal', 'reports', 'signal-calendar');
const SITE_OUT = path.join(ROOT, 'engine', 'out', 'site');
const RELEASE_KEYWORDS = [
  'van winkle', 'pappy', 'weller', 'stagg', 'birthday bourbon', 'old fitzgerald', 'four roses limited', 'michter', 'elmer t lee', 'russell', 'parker', 'blood oath', 'booker', 'e h taylor', 'e.h. taylor', 'blanton', 'eagle rare', 'heaven hill heritage'
];
const SEASON_HINTS = [
  { pattern: /birthday bourbon|four roses.*limited|parker|buffalo trace antique|btac|george t stagg|william larue|thomas handy|sazerac 18|eagle rare 17/i, season: 'Fall allocation window' },
  { pattern: /van winkle|pappy|old rip/i, season: 'Late fall allocation window' },
  { pattern: /old fitzgerald/i, season: 'Spring/fall decanter windows' },
  { pattern: /booker/i, season: 'Batch-based release windows' },
  { pattern: /blood oath/i, season: 'Annual pact release window' },
];
async function readJson(file, fallback = null) { try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; } }
function asString(value) { return typeof value === 'string' ? value.trim() : ''; }
function slugify(value) { return asString(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80); }
function bottleName(row) { return asString(row.bottle || row.bottleName || row.rawName || row.canonicalName) || 'Unknown bottle'; }
function seasonFor(name) { return SEASON_HINTS.find((hint) => hint.pattern.test(name))?.season || 'Watch window varies by state/source'; }
function isReleaseCandidate(name, rows) {
  const lower = name.toLowerCase();
  return RELEASE_KEYWORDS.some((keyword) => lower.includes(keyword)) || rows.length >= 6;
}
function sentenceFor(item) {
  const topStates = item.states.slice(0, 5).join(', ');
  const sourcePhrase = item.storeLevelSignals ? `${item.storeLevelSignals} store-level signal${item.storeLevelSignals === 1 ? '' : 's'}` : `${item.boardSignals} board/source signal${item.boardSignals === 1 ? '' : 's'}`;
  return `${item.name} is on the Signal Calendar because Bourbon Signal has seen ${sourcePhrase}${topStates ? ` across ${topStates}` : ''}. Treat this as field intel, not a promise of shelf availability.`;
}
async function main() {
  await mkdir(REPORT_DIR, { recursive: true });
  const [dropsPayload, alertsPayload] = await Promise.all([
    readJson(path.join(SITE_OUT, 'drops.json'), { drops: [] }),
    readJson(path.join(SITE_OUT, 'alerts.json'), { alerts: [] }),
  ]);
  const byBottle = new Map();
  for (const row of [...(dropsPayload.drops || []), ...(alertsPayload.alerts || [])]) {
    const name = bottleName(row);
    const key = slugify(name);
    if (!key) continue;
    if (!byBottle.has(key)) byBottle.set(key, { key, name, rows: [], states: new Set(), sources: new Set(), storeLevelSignals: 0, boardSignals: 0, alertCandidates: 0, latestAt: null });
    const item = byBottle.get(key);
    item.rows.push(row);
    const state = asString(row.state || row.state_code).toUpperCase();
    if (state) item.states.add(state);
    const source = asString(row.source || row.sourceLabel || row.type);
    if (source) item.sources.add(source);
    if (String(row.locationPrecision || '').toLowerCase() === 'store_level') item.storeLevelSignals += 1;
    else item.boardSignals += 1;
    if (row.eligibleForDelivery) item.alertCandidates += 1;
    const timestamp = asString(row.lastConfirmedAt || row.sourceEventAt || row.observedAt || row.displayAt || row.timestamp);
    if (timestamp && (!item.latestAt || timestamp > item.latestAt)) item.latestAt = timestamp;
  }
  const items = [...byBottle.values()]
    .filter((item) => isReleaseCandidate(item.name, item.rows))
    .map((item) => ({
      slug: item.key,
      name: item.name,
      season: seasonFor(item.name),
      signalCount: item.rows.length,
      alertCandidates: item.alertCandidates,
      storeLevelSignals: item.storeLevelSignals,
      boardSignals: item.boardSignals,
      states: [...item.states].sort(),
      sourceCount: item.sources.size,
      latestAt: item.latestAt,
      draftTitle: `${item.name} release signals, availability windows, and state-by-state watch notes`,
      draftDek: sentenceFor({ ...item, states: [...item.states].sort() }),
      contentRules: [
        'Use Bourbon Signal voice: field intel, practical, source-backed, no generic bourbon-blog filler.',
        'Never claim a bottle is currently available unless a live store-level source says so.',
        'Separate release window, recent signals, and where-to-watch sections.',
        'Include track-this-bottle CTA, but avoid spammy SEO phrasing.',
      ],
    }))
    .sort((a, b) => (b.alertCandidates * 8 + b.storeLevelSignals * 3 + b.signalCount) - (a.alertCandidates * 8 + a.storeLevelSignals * 3 + a.signalCount))
    .slice(0, 40);
  const report = { generatedAt: new Date().toISOString(), purpose: 'Signal Calendar SEO/AIO prototype plan; no pages are published by this script.', count: items.length, items };
  const lines = ['# Bourbon Signal “Signal Calendar” Prototype', '', 'This is a draft opportunity list only. It does **not** publish pages.', '', '## Top bottle/release pages', '', '| Bottle | Season | Signals | Alert candidates | States | Draft URL |', '|---|---|---:|---:|---|---|'];
  for (const item of items.slice(0, 25)) lines.push(`| ${item.name.replace(/\|/g, '/')} | ${item.season} | ${item.signalCount} | ${item.alertCandidates} | ${item.states.slice(0, 5).join(', ')} | /release-calendar/${item.slug} |`);
  lines.push('', '## Style rules', '', '- Own flavor: “Signal Calendar,” not a generic bourbon release calendar clone.', '- Field-intel tone: practical, caveated, data-backed.', '- No AI-slop filler, no fake certainty, no copied competitor structure.', '- Treat each page as a watch briefing with live-signal context and a track-this-bottle CTA.');
  await Promise.all([
    writeFile(path.join(REPORT_DIR, 'signal-calendar-latest.json'), JSON.stringify(report, null, 2)),
    writeFile(path.join(REPORT_DIR, 'signal-calendar-latest.md'), lines.join('\n')),
  ]);
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else console.log(lines.join('\n'));
}
main().catch((error) => { console.error(error); process.exit(1); });
