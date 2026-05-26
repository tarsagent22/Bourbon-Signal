import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { STATE_SOURCES } from './state-sources.mjs';
import { LOCATION_PROFILES, bestPrecision, precisionRank } from './location-precision.mjs';

const OUT = path.resolve('out');
async function readJson(file, fallback) { try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; } }
function topLocationSignals(signals) {
  return [...signals]
    .filter((s) => s.locationPrecision)
    .sort((a, b) => precisionRank(b.locationPrecision) - precisionRank(a.locationPrecision) || Number(b.quantity || b.storeQty || 0) - Number(a.quantity || a.storeQty || 0))
    .slice(0, 8);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const states = [];
  for (const source of STATE_SOURCES) {
    const report = await readJson(path.join(OUT, 'states', `${source.id}.json`), null);
    const signals = report?.signals || [];
    const profile = LOCATION_PROFILES[source.id] || { target: 'unknown', note: '' };
    const best = bestPrecision(signals);
    states.push({
      state: source.id,
      label: source.label,
      targetLocationPrecision: profile.target,
      bestLocationPrecision: best,
      hardened: precisionRank(best) >= precisionRank(profile.target),
      note: profile.note,
      topSignals: topLocationSignals(signals).map((s) => ({
        eventType: s.eventType,
        bottle: s.canonicalName || s.rawName || null,
        locationPrecision: s.locationPrecision,
        locationName: s.locationName || s.location || s.storeName || null,
        address: s.storeAddress || null,
        city: s.city || null,
        county: s.county || null,
        quantity: s.quantity ?? s.storeQty ?? s.raw?.storeQty ?? null,
        warehouseQty: s.warehouseQty ?? s.raw?.warehouseQty ?? null,
        source: s.sourceUrl,
        evidence: s.evidence || s.readableSummary || null
      }))
    });
  }
  const json = { generatedAt: new Date().toISOString(), states };
  await writeFile(path.join(OUT, 'location-hardening.json'), JSON.stringify(json, null, 2));
  const md = ['# Location Precision Hardening Report', '', `Generated: ${json.generatedAt}`, '', 'Goal: extract the most precise public location layer per state: store-level when exposed, board/county/warehouse where that is the public ceiling, statewide catalog/policy only when nothing more specific is public.', ''];
  for (const s of states) {
    md.push(`## ${s.label} (${s.state})`, '', `- Target precision: ${s.targetLocationPrecision}`, `- Best extracted now: ${s.bestLocationPrecision}`, `- Hardened to target: ${s.hardened ? 'yes' : 'no'}`, `- Notes: ${s.note}`, '', 'Best location signals:');
    if (!s.topSignals.length) md.push('- [blocked] No location-aware signals extracted yet.');
    for (const sig of s.topSignals.slice(0, 5)) {
      md.push(`- ${sig.locationPrecision}: ${sig.bottle || sig.eventType}${sig.locationName ? ` — ${sig.locationName}` : ''}${sig.address ? `, ${sig.address}` : ''}${sig.quantity !== null ? ` — qty ${sig.quantity}` : ''}`);
      md.push(`  - Source: ${sig.source}`);
      if (sig.evidence) md.push(`  - Evidence: ${String(sig.evidence).replace(/\s+/g, ' ').slice(0, 240)}`);
    }
    md.push('');
  }
  await writeFile(path.join(OUT, 'location-hardening.md'), md.join('\n'));
  const hardened = states.filter((s) => s.hardened).length;
  console.log(`Location hardening report: ${hardened}/${states.length} states at target public precision; outputs written to out/location-hardening.*`);
}
main().catch((error) => { console.error(error); process.exit(1); });
