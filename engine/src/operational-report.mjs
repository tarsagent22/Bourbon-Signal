import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stableId } from './core/text.mjs';
import { BourbonBible } from './core/bible.mjs';
import { confidenceForSignal, STATE_CONFIDENCE_POLICY } from './confidence-policy.mjs';
import { locationValue, precisionRank } from './location-precision.mjs';

const OUT = path.resolve('out');
const HISTORY = path.join(OUT, 'history');
const SNAPSHOTS = path.join(HISTORY, 'snapshots');

async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

async function latestSnapshot() {
  try {
    const files = (await readdir(SNAPSHOTS)).filter((f) => f.endsWith('.json')).sort();
    if (!files.length) return null;
    const file = path.join(SNAPSHOTS, files[files.length - 1]);
    return { file, snapshot: await readJson(file) };
  } catch { return null; }
}

function tsSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function observedAt(signal) {
  return signal.observedAt || signal.fetchedAt || signal.raw?.date || signal.raw?.listdate || null;
}

function qty(signal) {
  const n = Number(signal.quantity ?? signal.storeQty ?? signal.raw?.storeQty ?? signal.raw?.quantity ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function price(signal) {
  const n = Number(signal.price ?? signal.raw?.price ?? signal.raw?.bottlePrice ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function optionalNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function canonicalizeSignal(signal, bible) {
  const name = signal.canonicalName || signal.rawName || signal.matchedBottles?.[0]?.name || null;
  const match = name ? bible.match(name) : null;
  const record = match?.record || null;
  const canonicalName = record?.canonical || name;
  const bottleId = record?.id || signal.canonicalBottleId || null;
  const locationName = signal.storeName || signal.locationName || signal.location || signal.city || signal.county || null;
  const locationPrecision = signal.locationPrecision || 'statewide_catalog';
  const key = [signal.state, bottleId || canonicalName || 'unknown', signal.eventType, signal.sourceLabel, locationPrecision, locationName || 'statewide'].join('|').toLowerCase();
  const policy = confidenceForSignal(signal);
  return {
    key: stableId([key]),
    sourceSignalId: signal.id,
    state: signal.state,
    bottleId,
    canonicalName,
    tier: record?.tier || null,
    producer: record?.producer || null,
    eventType: signal.eventType,
    sourceLabel: signal.sourceLabel,
    sourceUrl: signal.sourceUrl,
    observedAt: observedAt(signal),
    locationPrecision,
    locationName,
    storeName: signal.storeName || null,
    storeAddress: signal.storeAddress || null,
    city: signal.city || null,
    county: signal.county || null,
    zip: signal.zip || signal.storeZip || signal.raw?.zip || signal.raw?.Zip || null,
    lat: optionalNumber(signal.lat, signal.latitude, signal.raw?.lat, signal.raw?.latitude, signal.raw?.Latitude),
    lng: optionalNumber(signal.lng, signal.lon, signal.longitude, signal.raw?.lng, signal.raw?.lon, signal.raw?.longitude, signal.raw?.Longitude),
    quantity: qty(signal),
    availabilityStatus: signal.availabilityStatus || signal.raw?.availability?.status || null,
    availabilityLabel: signal.availabilityLabel || signal.raw?.availability?.label || null,
    availabilityValue: signal.availabilityValue ?? signal.raw?.availability?.value ?? null,
    warehouseQty: Number(signal.warehouseQty ?? signal.raw?.warehouseQty ?? 0) || 0,
    price: price(signal),
    evidence: signal.evidence || signal.readableSummary || signal.rawName || null,
    baseConfidence: Number(signal.confidence || 0.35) || 0.35,
    confidence: policy.confidence,
    policyMode: policy.policyMode,
    inventorySemantics: policy.inventorySemantics,
    locationValue: policy.locationValue,
    canAlertAsInventory: policy.canAlertAsInventory,
    canAlertAsWatch: policy.canAlertAsWatch,
    sampleOnly: Boolean(signal.raw?.sampleOnly),
    rawName: signal.rawName || null
  };
}

function signalSort(a, b) {
  return b.confidence - a.confidence
    || precisionRank(b.locationPrecision) - precisionRank(a.locationPrecision)
    || (b.quantity || 0) - (a.quantity || 0)
    || String(b.observedAt || '').localeCompare(String(a.observedAt || ''));
}

function diffSnapshots(prev, current) {
  const previous = new Map((prev?.signals || []).map((s) => [s.key, s]));
  const currentMap = new Map((current.signals || []).map((s) => [s.key, s]));
  const changes = [];

  for (const cur of currentMap.values()) {
    const old = previous.get(cur.key);
    if (!old) {
      changes.push({ type: 'new_signal', key: cur.key, before: null, after: cur });
      continue;
    }
    const fields = [];
    for (const field of ['quantity', 'availabilityStatus', 'warehouseQty', 'price', 'locationPrecision', 'locationName', 'confidence']) {
      if ((old[field] ?? null) !== (cur[field] ?? null)) fields.push({ field, before: old[field] ?? null, after: cur[field] ?? null });
    }
    if (fields.length) changes.push({ type: 'changed_signal', key: cur.key, fields, before: old, after: cur });
  }
  for (const old of previous.values()) {
    if (!currentMap.has(old.key)) changes.push({ type: 'missing_signal', key: old.key, before: old, after: null });
  }
  return changes;
}

function changeScore(change) {
  const sig = change.after || change.before;
  if (!sig) return 0;
  let score = sig.confidence * 100;
  score += precisionRank(sig.locationPrecision) * 10;
  if (sig.tier === 'unicorn') score += 35;
  else if (sig.tier === 'allocated') score += 25;
  else if (sig.tier === 'limited') score += 15;
  if (change.type === 'new_signal') score += 25;
  if (change.type === 'changed_signal') {
    for (const f of change.fields || []) {
      if (f.field === 'quantity' && Number(f.after) > Number(f.before)) score += 20;
      if (f.field === 'warehouseQty' && Number(f.after) > Number(f.before)) score += 10;
      if (f.field === 'locationPrecision' && precisionRank(f.after) > precisionRank(f.before)) score += 20;
    }
  }
  if (change.type === 'missing_signal') score -= 20;
  return Math.round(score);
}

function candidateFromChange(change, bootstrap = false) {
  const sig = change.after || change.before;
  const score = changeScore(change);
  const action = sig.canAlertAsInventory ? 'inventory_alert_candidate' : sig.canAlertAsWatch ? 'watch_alert_candidate' : 'do_not_alert_context_only';
  return {
    id: stableId([change.type, sig.key, JSON.stringify(change.fields || [])]),
    changeType: change.type,
    action,
    score,
    state: sig.state,
    bottle: sig.canonicalName,
    tier: sig.tier,
    eventType: sig.eventType,
    sourceLabel: sig.sourceLabel,
    sourceUrl: sig.sourceUrl,
    locationPrecision: sig.locationPrecision,
    locationName: sig.locationName,
    storeName: sig.storeName,
    storeAddress: sig.storeAddress,
    quantity: sig.quantity,
    availabilityStatus: sig.availabilityStatus,
    availabilityLabel: sig.availabilityLabel,
    availabilityValue: sig.availabilityValue,
    warehouseQty: sig.warehouseQty,
    price: sig.price,
    confidence: sig.confidence,
    sampleOnly: Boolean(sig.sampleOnly),
    policyMode: sig.policyMode,
    inventorySemantics: sig.inventorySemantics,
    locationValue: locationValue(sig),
    bootstrap,
    reason: describeChange(change, sig),
    evidence: sig.evidence
  };
}

function diversifyCandidates(candidates, limit = 250, perStateBottleLimit = 10) {
  const selected = [];
  const counts = new Map();
  for (const candidate of candidates) {
    const key = [candidate.state, candidate.bottle || 'unknown'].join('|').toLowerCase();
    const count = counts.get(key) || 0;
    if (count >= perStateBottleLimit) continue;
    counts.set(key, count + 1);
    selected.push(candidate);
    if (selected.length >= limit) break;
  }
  return selected;
}

function describeChange(change, sig) {
  if (change.type === 'new_signal') return `New ${sig.locationPrecision} ${sig.eventType} signal for ${sig.canonicalName || 'unknown bottle'} in ${sig.state}.`;
  if (change.type === 'missing_signal') return `Previously seen signal for ${sig.canonicalName || 'unknown bottle'} in ${sig.state} is absent from current run.`;
  const bits = (change.fields || []).map((f) => `${f.field}: ${f.before ?? 'null'} → ${f.after ?? 'null'}`);
  return `Changed signal for ${sig.canonicalName || 'unknown bottle'} in ${sig.state}: ${bits.join('; ')}.`;
}

async function main() {
  await mkdir(SNAPSHOTS, { recursive: true });
  const bible = await BourbonBible.load(path.join(OUT, 'bourbon-bible.json'));
  const signalsJson = await readJson(path.join(OUT, 'signals.json'), { signals: [] });
  const previous = await latestSnapshot();
  const generatedAt = new Date().toISOString();

  const signals = (signalsJson.signals || [])
    .map((s) => canonicalizeSignal(s, bible))
    .filter((s) => s.canonicalName || s.eventType || s.sourceUrl)
    .sort(signalSort);

  const current = {
    generatedAt,
    signalCount: signals.length,
    signals
  };

  const changes = diffSnapshots(previous?.snapshot, current).sort((a, b) => changeScore(b) - changeScore(a));
  const bootstrap = !previous?.snapshot;
  const alertCandidates = diversifyCandidates((bootstrap
    ? signals.slice(0, 150).map((sig) => candidateFromChange({ type: 'new_signal', key: sig.key, before: null, after: sig }, true))
    : changes.map((change) => candidateFromChange(change, false)))
    .filter((c) => !c.sampleOnly)
    .filter((c) => c.action !== 'do_not_alert_context_only' || c.score >= 65)
    .sort((a, b) => b.score - a.score));

  const snapshotFile = path.join(SNAPSHOTS, `${tsSlug(new Date(generatedAt))}.json`);
  await writeFile(snapshotFile, JSON.stringify(current, null, 2));
  await writeFile(path.join(OUT, 'current-snapshot.json'), JSON.stringify(current, null, 2));
  await writeFile(path.join(OUT, 'diff.json'), JSON.stringify({ generatedAt, previousSnapshot: previous?.file || null, currentSnapshot: snapshotFile, bootstrap, changeCount: changes.length, changes }, null, 2));
  await writeFile(path.join(OUT, 'alert-candidates.json'), JSON.stringify({ generatedAt, previousSnapshot: previous?.file || null, bootstrap, candidateCount: alertCandidates.length, candidates: alertCandidates }, null, 2));
  await writeFile(path.join(OUT, 'confidence-policy.json'), JSON.stringify({ generatedAt, policies: STATE_CONFIDENCE_POLICY }, null, 2));

  const diffMd = ['# Bourbon Signal Run Diff', '', `Generated: ${generatedAt}`, `Previous snapshot: ${previous?.file || '[none: bootstrap run]'}`, `Changes: ${changes.length}`, ''];
  for (const change of changes.slice(0, 100)) {
    const sig = change.after || change.before;
    diffMd.push(`- **${change.type}** ${sig.state} ${sig.canonicalName || sig.eventType || 'unknown'} — ${describeChange(change, sig)}`);
  }
  if (!changes.length) diffMd.push('No signal-level changes detected against the previous snapshot.');
  await writeFile(path.join(OUT, 'diff.md'), diffMd.join('\n'));

  const alertsMd = ['# Bourbon Signal Alert Candidates', '', `Generated: ${generatedAt}`, `Bootstrap mode: ${bootstrap}`, '', 'These are candidate alerts/watch items only. State confidence policy decides whether a signal is inventory-grade, watch-grade, or context-only.', ''];
  for (const c of alertCandidates.slice(0, 100)) {
    alertsMd.push(`## ${c.state} — ${c.bottle || c.eventType}`);
    alertsMd.push(`- Action: ${c.action}; score ${c.score}; confidence ${c.confidence.toFixed(2)}`);
    alertsMd.push(`- Location: ${c.locationPrecision}${c.locationName ? ` — ${c.locationName}` : ''}${c.storeAddress ? `, ${c.storeAddress}` : ''}`);
    if (c.quantity || c.warehouseQty || c.price) alertsMd.push(`- Quantity/price: qty=${c.quantity || 0}, warehouse=${c.warehouseQty || 0}, price=${c.price || 0}`);
    alertsMd.push(`- Reason: ${c.reason}`);
    alertsMd.push(`- Policy: ${c.inventorySemantics}`);
    alertsMd.push(`- Source: ${c.sourceUrl}`);
    if (c.evidence) alertsMd.push(`- Evidence: ${String(c.evidence).replace(/\s+/g, ' ').slice(0, 500)}`);
    alertsMd.push('');
  }
  if (!alertCandidates.length) alertsMd.push('No alert candidates for this run.');
  await writeFile(path.join(OUT, 'alert-candidates.md'), alertsMd.join('\n'));

  console.log(`Operational report: ${signals.length} normalized operational signals, ${changes.length} changes, ${alertCandidates.length} alert candidates. Bootstrap=${bootstrap}.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
