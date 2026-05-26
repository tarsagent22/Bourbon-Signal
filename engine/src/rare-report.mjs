import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { STATE_SOURCES } from './state-sources.mjs';
import { BourbonBible } from './core/bible.mjs';
import { stableId } from './core/text.mjs';
import { locationValue } from './location-precision.mjs';

const OUT = path.resolve('out');
const RARE_TIERS = new Set(['allocated', 'limited', 'unicorn']);
const STATE_LABELS = new Map(STATE_SOURCES.map((s) => [s.id, s.label]));

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

function rarityScore(name, tier) {
  const n = String(name || '').toLowerCase();
  let score = tier === 'unicorn' ? 100 : tier === 'allocated' ? 80 : tier === 'limited' ? 60 : 25;
  if (/pappy|van winkle|george t|william larue|thomas h|sazerac 18|double eagle|stagg|coy hill|warehouse c|king of kentucky/.test(n)) score += 30;
  if (/weller|blanton|eagle rare|taylor|michter|old fitz|parker|blood oath|booker|baker|barrell|bardstown|penelope|yellowstone|willett|bowman/.test(n)) score += 15;
  if (/watch/.test(n)) score -= 10;
  return score;
}

function observedAt(signal) {
  return signal.raw?.date || signal.raw?.listdate || signal.fetchedAt || new Date().toISOString();
}

function normalizeCollected(signal, bible) {
  const candidates = [];
  if (signal.canonicalName) candidates.push(signal.canonicalName);
  if (signal.rawName) candidates.push(signal.rawName);
  for (const matched of signal.matchedBottles || []) candidates.push(matched.name);
  const out = [];
  for (const name of candidates) {
    const match = bible.match(name);
    const record = match?.record;
    if (!record || !RARE_TIERS.has(record.tier)) continue;
    out.push({
      id: stableId([signal.state, signal.sourceUrl, record.id, signal.id]),
      state: signal.state,
      bottle: record.canonical,
      tier: record.tier,
      producer: record.producer,
      signalType: signal.eventType,
      source: signal.sourceUrl,
      sourceLabel: signal.sourceLabel,
      observedAt: observedAt(signal),
      confidence: Math.max(signal.confidence || 0.4, match.confidence || 0.4),
      evidence: signal.rawName ? `Collected row: ${signal.rawName}` : (signal.readableSummary || '').slice(0, 500),
      mode: signal.fallback ? 'fallback-collected' : 'collected',
      locationPrecision: signal.locationPrecision || 'statewide_catalog',
      locationName: signal.locationName || signal.location || signal.storeName || signal.city || signal.county || null,
      storeName: signal.storeName || null,
      storeAddress: signal.storeAddress || null,
      city: signal.city || null,
      county: signal.county || null,
      quantity: signal.quantity ?? signal.storeQty ?? signal.raw?.storeQty ?? null,
      warehouseQty: signal.warehouseQty ?? signal.raw?.warehouseQty ?? null,
      locationValue: locationValue(signal),
      rawName: signal.rawName || null,
      score: rarityScore(record.canonical, record.tier)
    });
  }
  return out;
}

function seedSignal(state, seed, bible) {
  const match = bible.match(seed.bottle);
  const record = match?.record;
  return {
    id: stableId([state, seed.source, seed.bottle, seed.signalType]),
    state,
    bottle: record?.canonical || seed.bottle,
    tier: record?.tier || 'limited',
    producer: record?.producer || null,
    signalType: seed.signalType,
    source: seed.source,
    sourceLabel: 'official/source-index rare seed',
    observedAt: new Date().toISOString(),
    confidence: match ? Math.max(0.62, match.confidence) : 0.55,
    evidence: seed.evidence,
    mode: 'official-source-seed',
    locationPrecision: seed.locationPrecision || 'statewide_catalog',
    locationName: seed.locationName || null,
    storeName: null,
    storeAddress: null,
    city: null,
    county: null,
    quantity: null,
    warehouseQty: null,
    locationValue: locationValue({ locationPrecision: seed.locationPrecision || 'statewide_catalog' }),
    rawName: seed.bottle,
    score: rarityScore(record?.canonical || seed.bottle, record?.tier || 'limited')
  };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const bible = await BourbonBible.load(path.join(OUT, 'bourbon-bible.json'));
  const signalsJson = await readJson(path.join(OUT, 'signals.json'), { signals: [] });
  const seedsJson = await readJson(path.resolve('data/state-rare-signal-seeds.json'), { states: {} });

  const byState = new Map(STATE_SOURCES.map((s) => [s.id, []]));
  for (const signal of signalsJson.signals || []) {
    for (const rare of normalizeCollected(signal, bible)) {
      if (!byState.has(rare.state)) byState.set(rare.state, []);
      byState.get(rare.state).push(rare);
    }
  }
  for (const [state, seeds] of Object.entries(seedsJson.states || {})) {
    if (!byState.has(state)) byState.set(state, []);
    for (const seed of seeds) byState.get(state).push(seedSignal(state, seed, bible));
  }

  const states = [];
  for (const source of STATE_SOURCES) {
    const seen = new Set();
    const ranked = (byState.get(source.id) || [])
      .sort((a, b) => (b.observedAt || '').localeCompare(a.observedAt || '') || b.score - a.score)
      .filter((sig) => {
        const key = `${sig.bottle}|${sig.source}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    states.push({
      state: source.id,
      label: source.label,
      usableRareSignalCount: ranked.length,
      status: ranked.length >= 3 ? 'verified_3_rare_signals' : ranked.length > 0 ? 'partial_rare_signals' : 'blocked_no_public_bottle_level_rare_signals',
      top3: ranked.slice(0, 3),
      blocker: ranked.length >= 3 ? null : 'Could not verify three bottle-level rare/sought-after signals from public state sources. Keep as policy/source monitoring until a product list, PDF extractor, browser session, or public record feed is added.'
    });
  }

  const report = { generatedAt: new Date().toISOString(), states };
  await writeFile(path.join(OUT, 'rare-signals.json'), JSON.stringify(report, null, 2));

  const md = ['# Rare Bottle Signal Verification', '', `Generated: ${report.generatedAt}`, '', 'Signals are sorted by latest observation in this engine run, then rarity. `official-source-seed` means the public state source or official search index verified the route/bottle but raw fetch/browser extraction still needs hardening; it is not live inventory unless the signal type says inventory.', ''];
  for (const state of states) {
    md.push(`## ${state.label} (${state.state})`, '', `Status: ${state.status}`, '');
    if (state.top3.length) {
      state.top3.forEach((sig, i) => {
        md.push(`${i + 1}. **${sig.bottle}** — ${sig.tier} — ${sig.signalType}`);
        md.push(`   - Source: ${sig.source}`);
        md.push(`   - Mode: ${sig.mode}; confidence ${sig.confidence.toFixed(2)}`);
        md.push(`   - Location: ${sig.locationPrecision}${sig.locationName ? ` — ${sig.locationName}` : ''}${sig.storeAddress ? `, ${sig.storeAddress}` : ''}; value ${sig.locationValue}`);
        md.push(`   - Evidence: ${sig.evidence}`);
      });
    } else {
      md.push(`- [blocked] ${state.blocker}`);
    }
    if (state.blocker) md.push('', `Blocker: ${state.blocker}`);
    md.push('');
  }
  await writeFile(path.join(OUT, 'rare-signals.md'), md.join('\n'));
  console.log(`Rare signal report: ${states.filter((s) => s.status === 'verified_3_rare_signals').length}/${states.length} states have 3 rare signals.`);
  const blocked = states.filter((s) => s.status !== 'verified_3_rare_signals');
  if (blocked.length) console.log(`Partial/blocked: ${blocked.map((s) => `${s.state}:${s.usableRareSignalCount}`).join(', ')}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
