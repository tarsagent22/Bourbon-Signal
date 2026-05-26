import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stableId } from './core/text.mjs';
import { precisionRank } from './location-precision.mjs';

const OUT = path.resolve('out');
const SNAPSHOTS = path.join(OUT, 'history', 'snapshots');
const SITE_OUT = path.join(OUT, 'site');
const CONTRACT_VERSION = 'bourbon-signal-site-v0.1';
const HISTORY_DAYS = Number(process.env.BOURBON_SIGNAL_HISTORY_DAYS || 30);

async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

async function exists(file) {
  try { await stat(file); return true; } catch { return false; }
}

async function recentSnapshots(days = HISTORY_DAYS) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  if (!(await exists(SNAPSHOTS))) return [];

  const files = (await readdir(SNAPSHOTS)).filter((f) => f.endsWith('.json')).sort();
  const snapshots = [];
  for (const file of files) {
    const fullPath = path.join(SNAPSHOTS, file);
    const data = await readJson(fullPath);
    const ts = new Date(data?.generatedAt || '').getTime();
    if (!Number.isFinite(ts)) continue;
    if (ts < cutoff) {
      // Keep the engine's on-disk operational history bounded to the same history window the site exposes.
      await rm(fullPath, { force: true });
      continue;
    }
    snapshots.push(data);
  }
  return snapshots;
}

function uniqueHistoricalSignals(snapshots, currentSignals) {
  const byKey = new Map();
  for (const snapshot of snapshots) {
    for (const signal of snapshot.signals || []) {
      const key = [signal.key, signal.observedAt || snapshot.generatedAt, signal.quantity || 0, signal.availabilityStatus || '', signal.price || 0].join('|');
      byKey.set(key, signal);
    }
  }
  for (const signal of currentSignals || []) {
    const key = [signal.key, signal.observedAt || '', signal.quantity || 0, signal.availabilityStatus || '', signal.price || 0].join('|');
    byKey.set(key, signal);
  }
  return [...byKey.values()];
}

function uniqueBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key || map.has(key)) continue;
    map.set(key, item);
  }
  return [...map.values()];
}

function bottleKey(signal) {
  return signal.bottleId || stableId([signal.canonicalName || signal.rawName || 'unknown']);
}

function tierWeight(tier) {
  return tier === 'unicorn' ? 4 : tier === 'allocated' ? 3 : tier === 'limited' ? 2 : tier === 'core' ? 1 : 0;
}

function safeString(value, max = 500) {
  return value == null ? null : String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function publicSignal(signal) {
  return {
    id: signal.key || signal.sourceSignalId,
    state: signal.state,
    bottleId: bottleKey(signal),
    bottleName: signal.canonicalName || signal.rawName || null,
    tier: signal.tier || null,
    type: signal.eventType,
    source: signal.sourceLabel,
    sourceUrl: signal.sourceUrl,
    observedAt: signal.observedAt,
    locationPrecision: signal.locationPrecision,
    locationName: signal.locationName,
    storeName: signal.storeName,
    storeAddress: signal.storeAddress,
    city: signal.city,
    county: signal.county,
    zip: signal.zip,
    lat: signal.lat,
    lng: signal.lng,
    quantity: signal.quantity || 0,
    availabilityStatus: signal.availabilityStatus,
    availabilityLabel: signal.availabilityLabel,
    warehouseQty: signal.warehouseQty || 0,
    price: signal.price || 0,
    confidence: signal.confidence,
    policyMode: signal.policyMode,
    canAlertAsInventory: Boolean(signal.canAlertAsInventory),
    canAlertAsWatch: Boolean(signal.canAlertAsWatch),
    inventorySemantics: safeString(signal.inventorySemantics, 700),
    evidence: safeString(signal.evidence, 700)
  };
}

function buildBottles(signals) {
  const grouped = new Map();
  for (const signal of signals) {
    if (!signal.bottleId || !signal.canonicalName) continue;
    const key = bottleKey(signal);
    const cur = grouped.get(key) || {
      id: key,
      name: signal.canonicalName || signal.rawName,
      tier: signal.tier || null,
      producer: signal.producer || null,
      signalCount: 0,
      stateCount: 0,
      inventorySignalCount: 0,
      watchSignalCount: 0,
      bestLocationPrecision: 'statewide_catalog',
      bestConfidence: 0,
      states: new Set(),
      latestObservedAt: null
    };
    cur.signalCount += 1;
    cur.states.add(signal.state);
    if (signal.canAlertAsInventory) cur.inventorySignalCount += 1;
    if (signal.canAlertAsWatch) cur.watchSignalCount += 1;
    if (precisionRank(signal.locationPrecision) > precisionRank(cur.bestLocationPrecision)) cur.bestLocationPrecision = signal.locationPrecision;
    cur.bestConfidence = Math.max(cur.bestConfidence, signal.confidence || 0);
    if (signal.observedAt && (!cur.latestObservedAt || String(signal.observedAt) > String(cur.latestObservedAt))) cur.latestObservedAt = signal.observedAt;
    grouped.set(key, cur);
  }
  return [...grouped.values()]
    .map((b) => ({ ...b, states: [...b.states].sort(), stateCount: b.states.size }))
    .sort((a, b) => tierWeight(b.tier) - tierWeight(a.tier) || b.inventorySignalCount - a.inventorySignalCount || b.bestConfidence - a.bestConfidence || a.name.localeCompare(b.name));
}

function buildStores(signals) {
  const storeSignals = signals.filter((s) => s.locationPrecision === 'store_level' && (s.storeName || s.locationName || s.storeAddress));
  const stores = uniqueBy(storeSignals.map((s) => ({
    id: stableId([s.state, s.storeName || s.locationName, s.storeAddress || s.city || s.county]),
    state: s.state,
    name: s.storeName || s.locationName,
    address: s.storeAddress || null,
    city: s.city || null,
    county: s.county || null,
    zip: s.zip || null,
    lat: s.lat,
    lng: s.lng,
    source: s.sourceLabel,
    signalCount: storeSignals.filter((x) => x.state === s.state && (x.storeName || x.locationName) === (s.storeName || s.locationName) && (x.storeAddress || '') === (s.storeAddress || '')).length
  })), (s) => s.id);
  return stores.sort((a, b) => a.state.localeCompare(b.state) || String(a.name).localeCompare(String(b.name)));
}

function buildDrops(signals) {
  return signals
    .filter((s) => s.bottleId && s.canonicalName)
    .filter((s) => s.canAlertAsInventory || /release|allocated|lottery|store_inventory|delivery|limited_supply|in_stock/i.test(String(s.eventType || '')))
    .map(publicSignal)
    .sort((a, b) => String(b.observedAt || '').localeCompare(String(a.observedAt || '')) || (Number(b.canAlertAsInventory) - Number(a.canAlertAsInventory)) || (b.confidence || 0) - (a.confidence || 0) || precisionRank(b.locationPrecision) - precisionRank(a.locationPrecision))
    .slice(0, 10000);
}

function buildAlerts(alerts) {
  return (alerts.candidates || []).map((c) => ({
    id: c.id,
    action: c.action,
    score: c.score,
    state: c.state,
    bottle: c.bottle,
    tier: c.tier,
    eventType: c.eventType,
    source: c.sourceLabel,
    sourceUrl: c.sourceUrl,
    locationPrecision: c.locationPrecision,
    locationName: c.locationName,
    storeName: c.storeName,
    storeAddress: c.storeAddress,
    quantity: c.quantity || 0,
    availabilityStatus: c.availabilityStatus,
    availabilityLabel: c.availabilityLabel,
    warehouseQty: c.warehouseQty || 0,
    price: c.price || 0,
    confidence: c.confidence,
    policyMode: c.policyMode,
    inventorySemantics: safeString(c.inventorySemantics, 700),
    reason: safeString(c.reason, 700),
    evidence: safeString(c.evidence, 700)
  }));
}

async function main() {
  await mkdir(SITE_OUT, { recursive: true });
  const snapshot = await readJson(path.join(OUT, 'current-snapshot.json'), { signals: [] });
  const snapshots = await recentSnapshots();
  const summary = await readJson(path.join(OUT, 'summary.json'), {});
  const bible = await readJson(path.join(OUT, 'bourbon-bible.json'), { records: [] });
  const alerts = await readJson(path.join(OUT, 'alert-candidates.json'), { candidates: [] });
  const location = await readJson(path.join(OUT, 'location-hardening.json'), {});
  const rare = await readJson(path.join(OUT, 'rare-signals.json'), {});

  const signals = snapshot.signals || [];
  const historicalSignals = uniqueHistoricalSignals(snapshots, signals);
  const bottles = buildBottles(signals);
  const stores = buildStores(signals);
  const drops = buildDrops(historicalSignals);
  const alertCandidates = buildAlerts(alerts);
  const generatedAt = new Date().toISOString();
  const stats = {
    contractVersion: CONTRACT_VERSION,
    generatedAt,
    engineGeneratedAt: summary.generatedAt || snapshot.generatedAt || null,
    stateCount: summary.stateCount || 0,
    signalCount: signals.length,
    historicalSignalCount: historicalSignals.length,
    historyDays: HISTORY_DAYS,
    snapshotCount: snapshots.length,
    bottleCount: bottles.length,
    bibleRecordCount: bible.count || (bible.records || []).length,
    storeCount: stores.length,
    dropCount: drops.length,
    alertCandidateCount: alertCandidates.length,
    roadblockCount: summary.roadblockCount || 0,
    statesAtTargetPrecision: Array.isArray(location.states) ? location.states.filter((s) => s.hardened || s.hardenedToTarget).length : null,
    rareStatesVerified: Array.isArray(rare.states) ? rare.states.filter((s) => s.status === 'verified_3_rare_signals').length : null,
    sourceCaveat: 'Standalone engine export only. Candidate alerts are not sent to users until app integration and alert policy are explicitly enabled.'
  };

  const manifest = {
    contractVersion: CONTRACT_VERSION,
    generatedAt,
    files: {
      stats: 'stats.json',
      bottles: 'bottles.json',
      stores: 'stores.json',
      drops: 'drops.json',
      alerts: 'alerts.json'
    },
    historyDays: HISTORY_DAYS,
    snapshotCount: snapshots.length,
    schemas: {
      bottle: Object.keys(bottles[0] || {}),
      store: Object.keys(stores[0] || {}),
      drop: Object.keys(drops[0] || {}),
      alert: Object.keys(alertCandidates[0] || {})
    }
  };

  await writeFile(path.join(SITE_OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await writeFile(path.join(SITE_OUT, 'stats.json'), JSON.stringify(stats, null, 2));
  await writeFile(path.join(SITE_OUT, 'bottles.json'), JSON.stringify({ contractVersion: CONTRACT_VERSION, generatedAt, count: bottles.length, bottles }, null, 2));
  await writeFile(path.join(SITE_OUT, 'stores.json'), JSON.stringify({ contractVersion: CONTRACT_VERSION, generatedAt, count: stores.length, stores }, null, 2));
  await writeFile(path.join(SITE_OUT, 'drops.json'), JSON.stringify({ contractVersion: CONTRACT_VERSION, generatedAt, count: drops.length, drops }, null, 2));
  await writeFile(path.join(SITE_OUT, 'alerts.json'), JSON.stringify({ contractVersion: CONTRACT_VERSION, generatedAt, count: alertCandidates.length, alerts: alertCandidates }, null, 2));

  console.log(`Site contract export: ${bottles.length} bottles, ${stores.length} stores, ${drops.length} drops, ${alertCandidates.length} alert candidates -> out/site/`);
}

main().catch((error) => { console.error(error); process.exit(1); });
