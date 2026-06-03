import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fingerprintName, normalizeBottleName, stableId } from './core/text.mjs';
import { precisionRank } from './location-precision.mjs';
import { buildLocationBible } from './location-bible.mjs';

const OUT = path.resolve('out');
const SNAPSHOTS = path.join(OUT, 'history', 'snapshots');
const SITE_OUT = path.join(OUT, 'site');
const CONTRACT_VERSION = 'bourbon-signal-site-v0.1';
const HISTORY_DAYS = Number(process.env.BOURBON_SIGNAL_HISTORY_DAYS || 30);
const PA_STORE_INVENTORY_MAX_AGE_HOURS = Number(process.env.PA_STORE_INVENTORY_MAX_AGE_HOURS || 72);
const NC_STRICT_SIGNAL_RE = /buffalo trace|blanton|eagle rare|weller|stagg|e\.?h\.?\s*taylor|colonel\s*taylor|old fitz|fitzgerald|willett|pappy|van winkle|blood oath|old carter|elmer t|rock hill|george t|william larue|thomas h|elijah craig\s+barrel proof|four roses\s+(limited|limited edition)|michter'?s\s+10/i;

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
      const key = [signal.key || signal.id || signal.sourceSignalId, signal.observedAt || snapshot.generatedAt, signal.quantity || 0, signal.availabilityStatus || '', signal.price || 0].join('|');
      byKey.set(key, signal);
    }
  }
  for (const signal of currentSignals || []) {
    const key = [signal.key || signal.id || signal.sourceSignalId, signal.observedAt || '', signal.quantity || 0, signal.availabilityStatus || '', signal.price || 0].join('|');
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

function bibleLookup(records = []) {
  const byId = new Map();
  const byName = new Map();
  const addName = (name, record) => {
    const directKey = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const fingerprintKey = fingerprintName(name);
    const normalizedKey = normalizeBottleName(name).toLowerCase();
    for (const key of [directKey, fingerprintKey, normalizedKey]) {
      if (key) byName.set(key, record);
    }
  };
  for (const record of records) {
    if (record.id) byId.set(record.id, record);
    if (record.normalizedKey) byName.set(record.normalizedKey, record);
    for (const name of [record.canonical, ...(record.aliases || [])]) addName(name, record);
  }
  return { byId, byName };
}

function findBibleRecord(signal, bible) {
  const id = signal.bottleId || signal.canonicalBottleId;
  if (id && bible.byId.has(id)) return bible.byId.get(id);
  for (const name of [signal.canonicalName, signal.rawName]) {
    const keys = [
      String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
      fingerprintName(name),
      normalizeBottleName(name).toLowerCase()
    ];
    for (const key of keys) if (key && bible.byName.has(key)) return bible.byName.get(key);
  }
  return null;
}

function tierWeight(tier) {
  return tier === 'unicorn' ? 4 : tier === 'allocated' ? 3 : tier === 'limited' ? 2 : tier === 'core' ? 1 : 0;
}

function safeString(value, max = 500) {
  return value == null ? null : String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function publicSignal(signal, bible) {
  const bibleRecord = findBibleRecord(signal, bible);
  const preferRetailerName = signal.state === 'IN' && /^(cityhive_store_inventory|retailer_store_inventory)/i.test(String(signal.eventType || ''));
  const canonicalName = preferRetailerName ? (signal.rawName || signal.canonicalName || bibleRecord?.canonical || null) : (bibleRecord?.canonical || signal.canonicalName || signal.rawName || null);
  const canonicalId = bibleRecord?.id || bottleKey(signal);
  return {
    id: signal.key || signal.sourceSignalId,
    state: signal.state,
    bottleId: canonicalId,
    canonicalId,
    canonicalKey: bibleRecord?.normalizedKey || null,
    bottleName: canonicalName,
    canonicalName,
    rawName: signal.rawName || null,
    aliases: bibleRecord?.aliases || [],
    tier: (signal.tier && signal.tier !== 'unknown' ? signal.tier : bibleRecord?.tier) || null,
    producer: signal.producer || bibleRecord?.producer || null,
    type: signal.eventType,
    source: signal.sourceLabel,
    sourceUrl: signal.sourceUrl,
    observedAt: signal.observedAt,
    locationPrecision: signal.locationPrecision,
    locationName: signal.locationName,
    storeName: signal.storeName,
    storeId: signal.storeId,
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

function buildBottles(signals, bible, bibleRecords = []) {
  const grouped = new Map();
  for (const record of bibleRecords) {
    if (!record?.id || !record?.canonical) continue;
    grouped.set(record.id, {
      id: record.id,
      canonical_id: record.id,
      canonical_name: record.canonical,
      canonical_key: record.normalizedKey || null,
      name: record.canonical,
      aliases: record.aliases || [],
      tier: record.tier || null,
      producer: record.producer || null,
      signalCount: 0,
      stateCount: 0,
      inventorySignalCount: 0,
      watchSignalCount: 0,
      bestLocationPrecision: 'statewide_catalog',
      bestConfidence: 0,
      states: new Set(),
      latestObservedAt: null
    });
  }
  for (const signal of signals) {
    const bibleRecord = findBibleRecord(signal, bible);
    if (!bibleRecord) continue;
    const canonicalName = bibleRecord.canonical;
    const key = bibleRecord.id;
    if (!key || !canonicalName) continue;
    const cur = grouped.get(key) || {
      id: key,
      canonical_id: key,
      canonical_name: canonicalName,
      canonical_key: bibleRecord?.normalizedKey || null,
      name: canonicalName,
      aliases: bibleRecord?.aliases || [],
      tier: (signal.tier && signal.tier !== 'unknown' ? signal.tier : bibleRecord?.tier) || null,
      producer: signal.producer || bibleRecord?.producer || null,
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
    id: s.storeId ? String(s.storeId) : stableId([s.state, s.storeName || s.locationName, s.storeAddress || s.city || s.county]),
    sourceStoreId: s.storeId ? String(s.storeId) : null,
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

function dropPriority(signal) {
  const type = String(signal.eventType || '');
  if (type === 'nc_board_shipment_snapshot') return 64;
  if (signal.state === 'VA' && type === 'store_inventory_result') return 62;
  if (signal.state === 'PA' && type === 'store_inventory_result' && signal.locationPrecision === 'store_level') return 68;
  if (type === 'nc_statewide_warehouse_stock') return 58;
  if (signal.state === 'PA' && type === 'store_inventory_aggregate') return 56;
  if (signal.canAlertAsInventory) return 50;
  if (/store_delivery_snapshot|store_inventory_result|limited_supply|in_stock/i.test(type)) return 34;
  if (/release|allocated|lottery/i.test(type)) return 26;
  return 0;
}

function isSafePublicSignal(signal) {
  const type = String(signal.eventType || '');
  if (signal.state === 'IN' && /Bourbon World|Big Red/i.test(String(signal.sourceLabel || signal.source || '')) && !/retailer_allocated_raffle_item|cityhive_store_inventory_result|cityhive_store_inventory_out_of_stock|retailer_store_location/i.test(type)) return false;
  if (signal.state === 'IN' && /^(cityhive_store_inventory|retailer_store_inventory)/i.test(type) && !/bourbon|whiskey|whisky|rye|blanton|eagle rare|weller|stagg|taylor|van winkle|buffalo trace|michter|willett|old fitz|elmer|rock hill|booker|baker|blood oath|four roses|1792|russell|woodford|wild turkey|elijah craig|old forester|green river|bardstown|knob creek|bulleit|maker/i.test(String(signal.rawName || signal.canonicalName || ''))) return false;
  if (signal.state === 'PA' && type === 'store_inventory_result' && signal.locationPrecision === 'store_level') {
    if (!signal.storeId) return false;
    const observedAt = new Date(signal.observedAt || signal.fetchedAt || 0).getTime();
    const maxAgeMs = PA_STORE_INVENTORY_MAX_AGE_HOURS * 60 * 60 * 1000;
    if (!Number.isFinite(observedAt) || Date.now() - observedAt > maxAgeMs) return false;
  }
  if (signal.state === 'NC' && (type === 'nc_board_shipment_snapshot' || type === 'nc_statewide_warehouse_stock')) {
    return NC_STRICT_SIGNAL_RE.test(String(signal.rawName || signal.canonicalName || ''));
  }
  return true;
}

function buildDrops(signals, bible) {
  const seenSourceIds = new Set();
  return signals
    .filter((s) => isSafePublicSignal(s))
    .filter((s) => findBibleRecord(s, bible))
    .filter((s) => s.canAlertAsInventory || /release|allocated|lottery|tasting|store_inventory|delivery|shipment|warehouse|limited_supply|in_stock/i.test(String(s.eventType || '')))
    .sort((a, b) => dropPriority(b) - dropPriority(a) || String(b.observedAt || '').localeCompare(String(a.observedAt || '')) || Boolean(b.storeId) - Boolean(a.storeId) || (b.confidence || 0) - (a.confidence || 0) || precisionRank(b.locationPrecision) - precisionRank(a.locationPrecision))
    .filter((s) => {
      const sourceId = s.key || s.id || s.sourceSignalId;
      if (!sourceId) return true;
      if (seenSourceIds.has(sourceId)) return false;
      seenSourceIds.add(sourceId);
      return true;
    })
    .map((signal) => publicSignal(signal, bible))
    .filter((drop, index, drops) => drops.findIndex((x) => [x.state, x.type, x.canonicalId, x.sourceUrl, x.locationName, x.quantity, x.availabilityStatus, x.price].join('|') === [drop.state, drop.type, drop.canonicalId, drop.sourceUrl, drop.locationName, drop.quantity, drop.availabilityStatus, drop.price].join('|')) === index)
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

function stateCoverageTier(state) {
  const precision = state.bestLocationPrecision || state.targetLocationPrecision || 'blocked';
  const strategy = String(state.strategy || '');
  const status = String(state.status || '');
  if (/failed|blocked/i.test(status)) return 'blocked';
  if (/retailer_store_inventory/i.test(strategy) && precision === 'store_level') return 'live_store_inventory';
  if (/license_spine/i.test(strategy)) return 'store_location_watch';
  if (precision === 'store_level') return 'live_store_inventory';
  if (/shipment|warehouse|board_inventory|public_data_portal/i.test(strategy) || precision === 'board_warehouse' || precision === 'board_county') return 'shipment_drop_intelligence';
  if (/catalog|price|brand|product|wholesale_listing/i.test(strategy) || precision === 'statewide_catalog') return 'catalog_watch';
  return 'policy_source_discovery';
}

function buildStateCoverage(summary) {
  const states = (summary.states || []).map((state) => ({
    state: state.state,
    label: state.label,
    tier: state.tier,
    status: state.status,
    signalCount: state.signalCount || 0,
    roadblockCount: state.roadblockCount || 0,
    targetLocationPrecision: state.targetLocationPrecision || null,
    bestLocationPrecision: state.bestLocationPrecision || null,
    strategy: state.strategy || null,
    coverageTier: stateCoverageTier(state)
  }));
  const counts = states.reduce((acc, state) => {
    acc[state.coverageTier] = (acc[state.coverageTier] || 0) + 1;
    return acc;
  }, {});
  return { counts, states };
}

const SOUTHEAST_STATES = new Set(['NC', 'VA', 'AL', 'WV', 'TN', 'MS', 'KY', 'SC', 'GA', 'FL']);

function publicSignalSummary(signal) {
  return {
    id: signal.id || signal.key || stableId([signal.state, signal.eventType, signal.sourceUrl, signal.rawName || signal.canonicalName]),
    state: signal.state,
    type: signal.eventType || signal.signalType || 'signal',
    source: signal.sourceLabel || signal.source || null,
    sourceUrl: signal.sourceUrl || null,
    bottle: signal.canonicalName || signal.bottleName || signal.rawName || null,
    rawName: signal.rawName || null,
    locationPrecision: signal.locationPrecision || null,
    locationName: signal.locationName || signal.storeName || signal.county || signal.city || null,
    quantity: signal.quantity || signal.warehouseQty || 0,
    confidence: signal.confidence || 0,
    canAlertAsInventory: Boolean(signal.canAlertAsInventory),
    canAlertAsWatch: Boolean(signal.canAlertAsWatch),
    summary: safeString(signal.evidence || signal.readableSummary || signal.inventorySemantics || '', 420)
  };
}

function topSignals(signals, predicate, limit = 5) {
  return signals
    .filter(predicate)
    .sort((a, b) => Boolean(b.canAlertAsInventory) - Boolean(a.canAlertAsInventory) || (b.confidence || 0) - (a.confidence || 0) || (b.quantity || b.warehouseQty || 0) - (a.quantity || a.warehouseQty || 0) || String(b.observedAt || b.fetchedAt || '').localeCompare(String(a.observedAt || a.fetchedAt || '')))
    .slice(0, limit)
    .map(publicSignalSummary);
}

function buildSoutheastReadiness(summary, signals) {
  const stateCoverage = buildStateCoverage(summary).states.filter((state) => SOUTHEAST_STATES.has(state.state));
  const southeastSignals = signals.filter((signal) => SOUTHEAST_STATES.has(signal.state));
  const stateNotes = Object.fromEntries(stateCoverage.map((state) => [state.state, {
    label: state.label,
    status: state.status,
    coverageTier: state.coverageTier,
    signalCount: state.signalCount,
    bestLocationPrecision: state.bestLocationPrecision,
    testerValue: state.coverageTier === 'live_store_inventory' ? 'Live/store inventory where public source permits.'
      : state.coverageTier === 'store_location_watch' ? 'Licensed store/location coverage and retailer-watch infrastructure; useful for routing users, not bottle inventory yet.'
      : state.coverageTier === 'shipment_drop_intelligence' ? 'Shipment, warehouse, board, or release intelligence; useful leads but not exact shelf stock.'
      : state.coverageTier === 'catalog_watch' ? 'Catalog, product, price, brand, or license-document watch; useful context, not inventory.'
      : 'Policy/source-discovery only.'
  }]));

  return {
    generatedAt: new Date().toISOString(),
    focusStates: stateCoverage.map((state) => state.state),
    counts: stateCoverage.reduce((acc, state) => {
      acc[state.coverageTier] = (acc[state.coverageTier] || 0) + 1;
      return acc;
    }, {}),
    stateNotes,
    bestCurrentSignals: {
      vaStoreInventory: topSignals(southeastSignals, (s) => s.state === 'VA' && s.locationPrecision === 'store_level' && s.canAlertAsInventory, 8),
      ncShipmentAndWarehouse: topSignals(southeastSignals, (s) => s.state === 'NC' && /nc_board_shipment_snapshot|nc_statewide_warehouse_stock/i.test(String(s.eventType || '')), 8),
      alReleaseIntel: topSignals(southeastSignals, (s) => s.state === 'AL' && /release|allocated/i.test(String(s.eventType || '')), 5),
      wvBarrelPicks: topSignals(southeastSignals, (s) => s.state === 'WV' && /barrel|release|allocated/i.test(String(s.eventType || '')), 5),
      tnSourceDiscovery: topSignals(southeastSignals, (s) => s.state === 'TN' && /license|policy|document/i.test(String(s.eventType || '')), 5)
    },
    caveat: 'Southeast readiness distinguishes live inventory from shipment/release leads and catalog/license context. Non-inventory sources must not be presented as exact bottle/store availability.'
  };
}

async function main() {
  await mkdir(SITE_OUT, { recursive: true });
  const snapshot = await readJson(path.join(OUT, 'current-snapshot.json'), { signals: [] });
  const snapshots = await recentSnapshots();
  const summary = await readJson(path.join(OUT, 'summary.json'), {});
  const biblePayload = await readJson(path.join(OUT, 'bourbon-bible.json'), { records: [] });
  const bible = bibleLookup(biblePayload.records || []);
  const alerts = await readJson(path.join(OUT, 'alert-candidates.json'), { candidates: [] });
  const location = await readJson(path.join(OUT, 'location-hardening.json'), {});
  const officialLocationBible = await readJson(path.join(OUT, 'location-bible-official.json'), { locations: [], sourceReports: [] });
  const rare = await readJson(path.join(OUT, 'rare-signals.json'), {});
  const ncIntelligenceRaw = await readJson(path.join(OUT, 'nc-board-intelligence.json'), null);

  const signals = snapshot.signals || [];
  const activeStateIds = new Set((summary.states || []).map((state) => state.state));
  const activeOfficialLocations = (officialLocationBible.locations || []).filter((location) => activeStateIds.has(location.state));
  const activeOfficialSourceReports = (officialLocationBible.sourceReports || []).filter((report) => !report.state || activeStateIds.has(report.state));
  const historicalSignals = uniqueHistoricalSignals(snapshots, signals).filter((signal) => activeStateIds.has(signal.state));
  const bottles = buildBottles(signals, bible, biblePayload.records || []);
  const stores = buildStores(signals);
  const locations = buildLocationBible(signals, activeOfficialLocations);
  const drops = buildDrops(historicalSignals, bible);
  const alertCandidates = buildAlerts(alerts);
  const generatedAt = new Date().toISOString();
  const stateCoverage = buildStateCoverage(summary);
  const southeastReadiness = buildSoutheastReadiness(summary, signals);
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
    bibleRecordCount: biblePayload.count || (biblePayload.records || []).length,
    storeCount: stores.length,
    locationCount: locations.length,
    officialLocationCount: activeOfficialLocations.length,
    preloadedLocationCount: locations.filter((location) => !location.hasSignals).length,
    dropCount: drops.length,
    alertCandidateCount: alertCandidates.length,
    roadblockCount: summary.roadblockCount || 0,
    refreshHealth: {
      degradedStateCount: summary.degradedStateCount || 0,
      staleStateCount: summary.staleStateCount || 0,
      failedStateCount: summary.failedStateCount || 0,
      degradedStates: (summary.states || [])
        .filter((state) => state.stale || /^failed_/.test(String(state.status || '')))
        .map((state) => ({
          state: state.state,
          label: state.label,
          status: state.status,
          stale: Boolean(state.stale),
          staleReason: state.staleReason || null,
          previousFinishedAt: state.previousFinishedAt || null,
          staleFallbackAt: state.staleFallbackAt || null
        }))
    },
    statesAtTargetPrecision: Array.isArray(location.states) ? location.states.filter((s) => s.hardened || s.hardenedToTarget).length : null,
    rareStatesVerified: Array.isArray(rare.states) ? rare.states.filter((s) => s.status === 'verified_3_rare_signals').length : null,
    stateCoverage,
    southeastReadiness,
    ncBoardIntelligence: ncIntelligenceRaw ? {
      boardCount: ncIntelligenceRaw.coverage?.boardCount || 0,
      boardsWithWebsites: ncIntelligenceRaw.coverage?.withWebsite || 0,
      boardsWithTrackedShipments: ncIntelligenceRaw.coverage?.withTrackedShipments || 0,
      boardsWithReleasePages: ncIntelligenceRaw.coverage?.withReleasePages || 0,
      boardsWithInventoryPages: ncIntelligenceRaw.coverage?.withInventoryPages || 0,
      sourcePolicy: ncIntelligenceRaw.sourcePolicy
    } : null,
    locationBibleSources: activeOfficialSourceReports,
    sourceCaveat: 'Standalone engine export only. Candidate alerts are not sent to users until app integration and alert policy are explicitly enabled.'
  };

  const manifest = {
    contractVersion: CONTRACT_VERSION,
    generatedAt,
    files: {
      stats: 'stats.json',
      bottles: 'bottles.json',
      stores: 'stores.json',
      locations: 'locations.json',
      drops: 'drops.json',
      alerts: 'alerts.json',
      ncIntelligence: 'nc-intelligence.json'
    },
    historyDays: HISTORY_DAYS,
    snapshotCount: snapshots.length,
    schemas: {
      bottle: Object.keys(bottles[0] || {}),
      store: Object.keys(stores[0] || {}),
      location: Object.keys(locations[0] || {}),
      drop: Object.keys(drops[0] || {}),
      alert: Object.keys(alertCandidates[0] || {})
    }
  };

  await writeFile(path.join(SITE_OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await writeFile(path.join(SITE_OUT, 'stats.json'), JSON.stringify(stats, null, 2));
  await writeFile(path.join(SITE_OUT, 'bottles.json'), JSON.stringify({ contractVersion: CONTRACT_VERSION, generatedAt, count: bottles.length, bottles }, null, 2));
  await writeFile(path.join(SITE_OUT, 'stores.json'), JSON.stringify({ contractVersion: CONTRACT_VERSION, generatedAt, count: stores.length, stores }, null, 2));
  await writeFile(path.join(SITE_OUT, 'locations.json'), JSON.stringify({ contractVersion: CONTRACT_VERSION, generatedAt, count: locations.length, locations }, null, 2));
  await writeFile(path.join(SITE_OUT, 'drops.json'), JSON.stringify({ contractVersion: CONTRACT_VERSION, generatedAt, count: drops.length, drops }, null, 2));
  await writeFile(path.join(SITE_OUT, 'alerts.json'), JSON.stringify({ contractVersion: CONTRACT_VERSION, generatedAt, count: alertCandidates.length, alerts: alertCandidates }, null, 2));
  if (ncIntelligenceRaw) {
    await writeFile(path.join(SITE_OUT, 'nc-intelligence.json'), JSON.stringify({ contractVersion: CONTRACT_VERSION, generatedAt, ...ncIntelligenceRaw }, null, 2));
  }

  console.log(`Site contract export: ${bottles.length} bottles, ${stores.length} stores, ${locations.length} locations, ${drops.length} drops, ${alertCandidates.length} alert candidates -> out/site/`);
}

main().catch((error) => { console.error(error); process.exit(1); });
