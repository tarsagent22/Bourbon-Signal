import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fingerprintName, normalizeBottleName, stableId } from './core/text.mjs';
import { precisionRank } from './location-precision.mjs';
import { buildLocationBible } from './location-bible.mjs';
import { CUSTOMER_ACTIVE_STATE_IDS } from './state-sources.mjs';

const OUT = path.resolve('out');
const SNAPSHOTS = path.join(OUT, 'history', 'snapshots');
const SITE_OUT = path.join(OUT, 'site');
const CONTRACT_VERSION = 'bourbon-signal-site-v0.1';
const HISTORY_DAYS = Number(process.env.BOURBON_SIGNAL_HISTORY_DAYS || 30);
const HISTORY_SNAPSHOT_LIMIT = Number(process.env.BOURBON_SIGNAL_HISTORY_SNAPSHOT_LIMIT || 40);
const PA_STORE_INVENTORY_MAX_AGE_HOURS = Number(process.env.PA_STORE_INVENTORY_MAX_AGE_HOURS || 72);
const NC_STRICT_SIGNAL_RE = /buffalo trace|blanton|eagle rare|weller|stagg|e\.?h\.?\s*taylor|colonel\s*taylor|old fitz|fitzgerald|willett|pappy|van winkle|blood oath|old carter|elmer t|rock hill|george t|william larue|thomas h|elijah craig\s+barrel proof|four roses\s+(limited|limited edition)|michter'?s\s+10/i;
const NC_GREENSBORO_STORE_SIGNAL_RE = /buffalo trace|blanton|eagle rare|weller|stagg|old fitz|fitzgerald|willett|pappy|van winkle|baker'?s?|e\.?h\.?\s*taylor|colonel\s+taylor|elijah craig[^\n]{0,40}barrel proof|michter'?s[^\n]{0,40}(bourbon|10\s*year)/i;
const NC_GREENSBORO_STORE_EXCLUDE_RE = /john\s+d\s+taylor|old\s+taylor|taylor\s+port|falernum|cream|white\s+dog|rye|elijah\s+craig\s+small\s+batch(?![^\n]{0,40}barrel\s+proof)|tequila|corazon|expresiones|reposado|a[ñn]ejo|vodka|gin|rum|liqueur|cordial|beer|wine|cocktail/i;
const SITE_ACTIVE_STATE_IDS = CUSTOMER_ACTIVE_STATE_IDS;

async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

async function exists(file) {
  try { await stat(file); return true; } catch { return false; }
}

async function recentSnapshots(days = HISTORY_DAYS) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  if (!(await exists(SNAPSHOTS))) return [];

  const files = (await readdir(SNAPSHOTS)).filter((f) => f.endsWith('.json')).sort().reverse();
  const snapshots = [];
  for (const file of files) {
    const fullPath = path.join(SNAPSHOTS, file);
    if (HISTORY_SNAPSHOT_LIMIT > 0 && snapshots.length >= HISTORY_SNAPSHOT_LIMIT) break;
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

function isTennesseeCityHiveInventory(signal) {
  return signal.state === 'TN'
    && /^cityhive_store_inventory_result/i.test(String(signal.eventType || signal.type || ''))
    && /CityHive/i.test(String(signal.sourceLabel || signal.source || ''))
    && signal.locationPrecision === 'store_level'
    && Number(signal.quantity || 0) > 0
    && Boolean(signal.storeId)
    && Boolean(signal.storeAddress);
}

function isTennesseeRetailerInventory(signal) {
  return signal.state === 'TN'
    && /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(String(signal.eventType || signal.type || ''))
    && signal.locationPrecision === 'store_level'
    && Number(signal.quantity || 0) > 0
    && Boolean(signal.storeId)
    && Boolean(signal.storeAddress);
}

function publicSignal(signal, bible) {
  const bibleRecord = findBibleRecord(signal, bible);
  const preferRetailerName = ['IN', 'IL', 'TN'].includes(signal.state) && /^(cityhive_store_inventory|retailer_store_inventory)/i.test(String(signal.eventType || ''));
  const preferOfficialSourceName = preferRetailerName || (signal.state === 'NC' && /High Point ABC public Power BI/i.test(String(signal.sourceLabel || signal.source || '')));
  const canonicalName = preferOfficialSourceName ? (signal.rawName || signal.canonicalName || bibleRecord?.canonical || null) : (bibleRecord?.canonical || signal.canonicalName || signal.rawName || null);
  const canonicalId = preferOfficialSourceName ? stableId([signal.state, signal.sourceLabel || signal.sourceUrl, signal.rawName || signal.canonicalName || 'unknown']) : (bibleRecord?.id || bottleKey(signal));
  const isTnCityHiveInventory = isTennesseeCityHiveInventory(signal);
  const isTnRetailerInventory = isTennesseeRetailerInventory(signal);
  const inventorySemantics = isTnRetailerInventory
    ? 'Tennessee is a private retail market. Retailer e-commerce pages can expose store-level bottle quantity and price for pickup/order-capable branches; alert as retailer-published availability with a verify-before-driving caveat.'
    : signal.inventorySemantics;
  return {
    id: signal.key || signal.sourceSignalId,
    state: signal.state,
    bottleId: canonicalId,
    canonicalId,
    canonicalKey: preferOfficialSourceName ? null : (bibleRecord?.normalizedKey || null),
    bottleName: canonicalName,
    canonicalName,
    rawName: signal.rawName || null,
    aliases: preferOfficialSourceName ? [] : (bibleRecord?.aliases || []),
    tier: preferOfficialSourceName ? null : ((signal.tier && signal.tier !== 'unknown' ? signal.tier : bibleRecord?.tier) || null),
    producer: preferOfficialSourceName ? null : (signal.producer || bibleRecord?.producer || null),
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
    policyMode: isTnRetailerInventory ? 'alert_retailer_store_inventory_caveat' : signal.policyMode,
    canAlertAsInventory: Boolean(signal.canAlertAsInventory) || isTnRetailerInventory,
    canAlertAsWatch: Boolean(signal.canAlertAsWatch) || isTnRetailerInventory,
    inventorySemantics: safeString(inventorySemantics, 700),
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

function signalCanAlertAsInventory(signal) {
  return Boolean(signal.canAlertAsInventory) || isTennesseeRetailerInventory(signal);
}

function signalCanAlertAsWatch(signal) {
  return Boolean(signal.canAlertAsWatch) || isTennesseeRetailerInventory(signal);
}

function dropPriority(signal) {
  const type = String(signal.eventType || '');
  if (signal.state === 'NC' && signalCanAlertAsInventory(signal) && signal.locationPrecision === 'store_level') return 78;
  if (type === 'nc_board_shipment_snapshot') return 64;
  if (signal.state === 'VA' && type === 'store_inventory_result') return 62;
  if (signal.state === 'PA' && type === 'store_inventory_result' && signal.locationPrecision === 'store_level') return 68;
  if (type === 'nc_statewide_warehouse_stock') return 58;
  if (signal.state === 'PA' && type === 'store_inventory_aggregate') return 56;
  if (signalCanAlertAsInventory(signal)) return 50;
  if (/store_delivery_snapshot|store_inventory_result|limited_supply|in_stock/i.test(type)) return 34;
  if (/release|allocated|lottery/i.test(type)) return 26;
  return 0;
}

function isSafePublicSignal(signal) {
  const type = String(signal.eventType || '');
  if (signal.state === 'IN' && /Bourbon World|Big Red/i.test(String(signal.sourceLabel || signal.source || '')) && !/retailer_allocated_raffle_item|cityhive_store_inventory_result|cityhive_store_inventory_out_of_stock|retailer_store_location/i.test(type)) return false;
  if (signal.state === 'IN' && /^(cityhive_store_inventory|retailer_store_inventory)/i.test(type) && !/bourbon|whiskey|whisky|rye|blanton|eagle rare|weller|stagg|taylor|van winkle|buffalo trace|michter|willett|old fitz|elmer|rock hill|booker|baker|blood oath|four roses|1792|russell|woodford|wild turkey|elijah craig|old forester|green river|bardstown|knob creek|bulleit|maker/i.test(String(signal.rawName || signal.canonicalName || ''))) return false;
  if (signal.state === 'IL' && /^(retailer_store_inventory)/i.test(type) && !/bourbon|whiskey|whisky|rye|blanton|eagle rare|weller|stagg|taylor|van winkle|buffalo trace|michter|willett|old fitz|elmer|rock hill|booker|baker|blood oath|four roses|1792|russell|woodford|wild turkey|elijah craig|old forester|heaven hill|knob creek|maker|pappy/i.test(String(signal.rawName || signal.canonicalName || ''))) return false;
  if (signal.state === 'PA' && type === 'store_inventory_result' && signal.locationPrecision === 'store_level') {
    if (!signal.storeId) return false;
    const observedAt = new Date(signal.observedAt || signal.fetchedAt || 0).getTime();
    const maxAgeMs = PA_STORE_INVENTORY_MAX_AGE_HOURS * 60 * 60 * 1000;
    if (!Number.isFinite(observedAt) || Date.now() - observedAt > maxAgeMs) return false;
  }
  if (signal.state === 'NC' && /Greensboro ABC SuiteCommerce/i.test(String(signal.sourceLabel || signal.source || ''))) {
    const name = String(signal.rawName || signal.canonicalName || '');
    return NC_GREENSBORO_STORE_SIGNAL_RE.test(name) && !NC_GREENSBORO_STORE_EXCLUDE_RE.test(name);
  }
  if (signal.state === 'NC' && /Wake County ABC store inventory search/i.test(String(signal.sourceLabel || signal.source || ''))) {
    const name = String(signal.rawName || signal.canonicalName || '').replace(/\s+/g, ' ').trim();
    if (/^BAKER'?S$/i.test(name) || String(signal.ncCode || '').trim() === '27006') return false;
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
    .filter((s) => findBibleRecord(s, bible) || (s.state === 'NC' && signalCanAlertAsInventory(s) && s.locationPrecision === 'store_level' && /High Point ABC public Power BI/i.test(String(s.sourceLabel || s.source || ''))))
    .filter((s) => signalCanAlertAsInventory(s) || /release|allocated|lottery|tasting|store_inventory|delivery|shipment|warehouse|limited_supply|in_stock/i.test(String(s.eventType || '')))
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

function eventCategory(signal) {
  const type = String(signal.eventType || signal.type || '').toLowerCase();
  const source = String(signal.sourceLabel || signal.source || '').toLowerCase();
  const hay = `${type} ${source} ${signal.availabilityStatus || ''} ${signal.availabilityLabel || ''}`;
  if (/tasting/.test(hay)) return 'tasting';
  if (/lottery|raffle/.test(hay)) return 'lottery';
  if (/barrel|single barrel|pick/.test(hay)) return 'barrel_pick';
  if (/scheduled_release|limited_release_store_drop|release calendar|calendar/.test(hay)) return 'scheduled_release';
  if (/allocated|allocation|release|drop|bourbon blast|specialty/.test(hay)) return 'release_watch';
  if (/policy|program/.test(hay)) return 'policy_or_program';
  return 'release_watch';
}

function isEventSignal(signal) {
  const type = String(signal.eventType || '').toLowerCase();
  const hay = `${type} ${signal.sourceLabel || ''} ${signal.availabilityStatus || ''} ${signal.availabilityLabel || ''} ${signal.evidence || ''}`.toLowerCase();
  if (!type) return false;
  if (/out_of_stock|store_inventory_out_of_stock|warehouse_out_of_stock/.test(type)) return false;
  if (/store_inventory_result|store_inventory_aggregate|warehouse_stock|shipment_snapshot/.test(type) && !/tasting|lottery|raffle|barrel|release|allocated/.test(hay)) return false;
  if (/release|allocated|lottery|raffle|tasting|barrel|bourbon blast|calendar|policy|program|event/.test(hay)) return true;
  return false;
}

function eventPriority(event) {
  const cat = event.category;
  if (cat === 'scheduled_release') return 70;
  if (cat === 'lottery') return 64;
  if (cat === 'barrel_pick') return 58;
  if (cat === 'tasting') return 52;
  if (cat === 'release_watch') return 48;
  return 30;
}

function eventSourceType(signal, category) {
  const hay = `${signal.eventType || ''} ${signal.sourceLabel || ''} ${signal.source || ''} ${signal.sourceUrl || ''}`.toLowerCase();
  if (/abc|abca|alcoholic beverage|liquor control|fine wine|fwgs|ohlq|virginia abc|nc board|county abc/.test(hay)) {
    if (category === 'lottery') return 'official_lottery';
    if (category === 'scheduled_release') return 'official_schedule';
    return 'official_board_page';
  }
  if (/eventbrite|calendar|events|tasting/.test(hay)) return 'retailer_event';
  if (/cityhive|shop|store|liquor|spirits|package/.test(hay)) return 'retailer_page';
  return category === 'tasting' ? 'retailer_event' : 'release_watch';
}

function eventSourceLabel(sourceType) {
  return {
    official_lottery: 'Official lottery page',
    official_schedule: 'Official release schedule',
    official_board_page: 'Official ABC / control-board page',
    retailer_event: 'Retailer event page',
    retailer_page: 'Retailer release page',
    release_watch: 'Release-watch source'
  }[sourceType] || 'Release-watch source';
}

function eventStatus(value) {
  if (!value) return 'watch_page';
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return 'watch_page';
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  if (ts < now - day) return 'recent_or_past';
  if (ts <= now + 30 * day) return 'upcoming';
  return 'scheduled_future';
}

function isPastEventStatus(status) {
  return status === 'recent_or_past' || status === 'archived';
}

function normalizeEventDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function inferEventDate(signal) {
  const explicit = normalizeEventDate(signal.releaseDate || signal.eventDate || signal.raw?.releaseDate || signal.raw?.eventDate);
  if (explicit) return explicit;
  const hay = `${signal.availabilityLabel || ''} ${signal.evidence || ''} ${signal.inventorySemantics || ''} ${signal.raw?.title || ''} ${signal.sourceUrl || ''}`;
  const numeric = hay.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (numeric) return normalizeEventDate(`${numeric[1]}/${numeric[2]}/${numeric[3]}`);
  const urlShort = String(signal.sourceUrl || '').match(/(?:^|[^\d])(\d{1,2})[-_/](\d{1,2})[-_/](\d{2})(?:[^\d]|$)/);
  if (urlShort) {
    const yy = Number(urlShort[3]);
    const year = yy >= 70 ? 1900 + yy : 2000 + yy;
    return normalizeEventDate(`${urlShort[1]}/${urlShort[2]}/${year}`);
  }
  const named = hay.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan\.?|Feb\.?|Mar\.?|Apr\.?|Jun\.?|Jul\.?|Aug\.?|Sep\.?|Sept\.?|Oct\.?|Nov\.?|Dec\.?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,)?\s+20\d{2}\b/i);
  if (named) return normalizeEventDate(named[0].replace(/(\d{1,2})(st|nd|rd|th)/i, '$1'));
  const slugText = String(signal.sourceUrl || '').replace(/[-_/%]+/g, ' ');
  const slugNamed = slugText.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan\.?|Feb\.?|Mar\.?|Apr\.?|Jun\.?|Jul\.?|Aug\.?|Sep\.?|Sept\.?|Oct\.?|Nov\.?|Dec\.?)\s+\d{1,2}(?:st|nd|rd|th)?\s+20\d{2}\b/i);
  if (slugNamed) return normalizeEventDate(slugNamed[0].replace(/(\d{1,2})(st|nd|rd|th)/i, '$1'));
  return null;
}

function eventFreshnessScore(signal, eventDate) {
  const observed = Date.parse(signal.observedAt || signal.fetchedAt || 0);
  const ageHours = Number.isFinite(observed) ? Math.max(0, (Date.now() - observed) / (60 * 60 * 1000)) : 9999;
  let score = ageHours <= 24 ? 20 : ageHours <= 72 ? 14 : ageHours <= 168 ? 8 : 2;
  const status = eventStatus(eventDate);
  if (status === 'upcoming') score += 18;
  if (status === 'scheduled_future') score += 10;
  if (status === 'watch_page') score += 6;
  return score;
}

const WATCH_PRODUCT_PATTERNS = [
  ['Blanton', /\bblanton'?s?\b/i],
  ['Weller', /\bweller\b/i],
  ['Stagg', /\bstagg\b/i],
  ['Eagle Rare', /\beagle rare\b/i],
  ['Buffalo Trace', /\bbuffalo trace\b/i],
  ['E.H. Taylor', /\b(e\.?h\.?\s*)?taylor\b/i],
  ['Van Winkle', /\b(van winkle|pappy)\b/i],
  ['Old Fitzgerald', /\bold fitzgerald\b/i],
  ['Michter', /\bmichter'?s?\b/i],
  ['Willett', /\bwillett\b/i],
  ['Four Roses Limited Edition', /\bfour roses.*limited|limited.*four roses\b/i],
  ['BTAC', /\b(btac|george t\.? stagg|william larue|thomas handy|sazerac 18|eagle rare 17)\b/i]
];

function detectedEventProducts(signal, drop) {
  const hay = `${drop.bottleName || ''} ${drop.rawName || ''} ${signal.evidence || ''} ${signal.inventorySemantics || ''} ${signal.availabilityLabel || ''} ${signal.raw?.title || ''}`;
  const detected = WATCH_PRODUCT_PATTERNS.filter(([, re]) => re.test(hay)).map(([name]) => name);
  const looksLikeActualBottle = Boolean(drop.canonicalKey || drop.tier || drop.producer || /\b(bourbon|rye|whiskey|whisky|single barrel|barrel proof|limited edition|proof)\b/i.test(String(drop.bottleName || '')) && !/\b(board|lottery|raffle|page|calendar|program|policy|official)\b/i.test(String(drop.bottleName || '')));
  if (looksLikeActualBottle && drop.bottleName && !detected.includes(drop.bottleName)) detected.unshift(drop.bottleName);
  return [...new Set(detected)].slice(0, 8);
}

function eventActionability({ category, eventDate, sourceUrl, canAlertAsWatch, sourceType }) {
  const status = eventStatus(eventDate);
  if (isPastEventStatus(status)) return 'watch';
  const url = String(sourceUrl || '').toLowerCase();
  const specificWatchUrl = /lottery|raffle|allocated|allocation|release|barrel|pick|tasting|event|specialty|limited/.test(url);
  let score = eventPriority({ category });
  if (sourceUrl) score += 10;
  if (eventDate) score += 14;
  if (canAlertAsWatch) score += 6;
  if (/official/.test(sourceType)) score += 10;
  if (status === 'upcoming') score += 14;
  if (status === 'recent_or_past') score -= 18;
  if (!eventDate) return category === 'lottery' && /official/.test(sourceType) && canAlertAsWatch && specificWatchUrl ? 'medium' : 'watch';
  return score >= 88 ? 'high' : score >= 70 ? 'medium' : 'watch';
}

function publicEventBottleName(drop, category) {
  const name = drop.bottleName || drop.rawName || '';
  if (!name) return null;
  const isPageTitle = /\b(board|lottery|raffle|page|calendar|program|policy|official)\b/i.test(name) && !/\b(bourbon|rye|whiskey|whisky|single barrel|barrel proof)\b/i.test(name);
  if (isPageTitle) return category === 'lottery' ? 'Official lottery / raffle page' : 'Release watch source';
  return name;
}

function publicEvent(signal, bible) {
  const drop = publicSignal(signal, bible);
  const category = eventCategory(signal);
  const eventDate = inferEventDate(signal);
  const sourceType = eventSourceType(signal, category);
  const sourceTypeLabel = eventSourceLabel(sourceType);
  const products = detectedEventProducts(signal, drop);
  const titleParts = [];
  const displayBottleName = publicEventBottleName(drop, category);
  if (displayBottleName) titleParts.push(displayBottleName);
  if (category === 'scheduled_release') titleParts.push('scheduled release');
  else if (category === 'lottery') titleParts.push('lottery / raffle');
  else if (category === 'barrel_pick') titleParts.push('barrel pick');
  else if (category === 'tasting') titleParts.push('tasting event');
  else titleParts.push('release watch');
  const title = titleParts.join(' — ');
  return {
    ...drop,
    bottleName: displayBottleName || drop.bottleName,
    canonicalName: displayBottleName || drop.canonicalName,
    eventId: drop.id || stableId([drop.state, drop.type, drop.sourceUrl, drop.bottleName, drop.locationName, drop.observedAt]),
    title,
    category,
    eventType: drop.type,
    eventDate,
    eventTime: signal.releaseTime || signal.eventTime || signal.raw?.releaseTime || null,
    sourceType,
    sourceTypeLabel,
    eventStatus: eventStatus(eventDate),
    actionability: eventActionability({ category, eventDate, sourceUrl: drop.sourceUrl, canAlertAsWatch: drop.canAlertAsWatch, sourceType }),
    detectedProducts: products,
    contentSignature: stableId([drop.state, drop.type, drop.sourceUrl, drop.bottleName, drop.rawName, drop.locationName, signal.evidence, signal.inventorySemantics]),
    eventKey: stableId([drop.state, category, drop.sourceUrl, eventDate, products.join('|') || displayBottleName || title, drop.storeId || drop.locationName]),
    actionLabel: category === 'scheduled_release' ? 'Verify release rules before driving'
      : category === 'lottery' ? 'Check entry rules at source'
      : category === 'tasting' ? 'Check event details at source'
      : 'Monitor source for release details',
    inventoryCaveat: drop.canAlertAsInventory ? 'May indicate retailer/store inventory; verify before driving.' : 'Release/event intelligence only; not live shelf inventory.',
    sortScore: eventPriority({ category }) + eventFreshnessScore(signal, eventDate) + (drop.locationPrecision === 'store_level' ? 6 : 0) + (drop.canAlertAsWatch ? 4 : 0) + (/official/.test(sourceType) ? 8 : 0) + (drop.confidence || 0)
  };
}

function buildEvents(signals, bible) {
  const seen = new Set();
  return signals
    .filter((signal) => isSafePublicSignal(signal))
    .filter((signal) => isEventSignal(signal))
    .filter((signal) => findBibleRecord(signal, bible) || /calendar|policy|program|source_reachable|release_surface|lottery_surface|barrel_pick_surface|inventory_surface/i.test(String(signal.eventType || '')))
    .map((signal) => publicEvent(signal, bible))
    .filter((event) => {
      const key = event.eventKey || [event.state, event.category, event.canonicalId || event.rawName || event.title, event.sourceUrl, event.locationName, event.eventDate, event.price].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.sortScore - a.sortScore || String(b.observedAt || '').localeCompare(String(a.observedAt || '')))
    .slice(0, 5000);
}

function buildAlerts(alerts) {
  return (alerts.candidates || [])
    .filter((c) => Boolean(c.eligibleForDelivery))
    .map((c) => ({
    id: c.id,
    action: c.action,
    score: c.score,
    reliabilityScore: c.reliabilityScore ?? null,
    eligibleForDelivery: Boolean(c.eligibleForDelivery),
    priorityClass: c.priorityClass || 'hold',
    deliveryChannel: c.deliveryChannel || 'review_only',
    sendRecommendation: c.sendRecommendation || 'review_before_send',
    freshnessHours: c.freshnessHours ?? null,
    dedupeKey: c.dedupeKey || stableId([c.state, c.bottle, c.eventType, c.locationPrecision, c.storeId || c.storeName || c.locationName || 'regional', c.availabilityStatus || '', c.quantity || 0, c.warehouseQty || 0]),
    matchKey: c.matchKey || stableId([c.state, c.bottle, c.locationPrecision, c.storeId || c.storeName || c.locationName || 'regional']),
    gates: Array.isArray(c.gates) ? c.gates : [],
    blockers: Array.isArray(c.blockers) ? c.blockers : [],
    cautions: Array.isArray(c.cautions) ? c.cautions : [],
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
  }))
    .sort((a, b) => Number(b.eligibleForDelivery) - Number(a.eligibleForDelivery) || (b.reliabilityScore || 0) - (a.reliabilityScore || 0) || (b.score || 0) - (a.score || 0));
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

function buildStateCoverage(summary, options = {}) {
  const stateFilter = options.stateFilter || null;
  const states = (summary.states || [])
    .filter((state) => !stateFilter || stateFilter.has(state.state))
    .map((state) => ({
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
  const stateCoverage = buildStateCoverage(summary, { stateFilter: SITE_ACTIVE_STATE_IDS }).states.filter((state) => SOUTHEAST_STATES.has(state.state));
  const southeastSignals = signals.filter((signal) => SITE_ACTIVE_STATE_IDS.has(signal.state) && SOUTHEAST_STATES.has(signal.state));
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
      tnStoreInventory: topSignals(southeastSignals, (s) => s.state === 'TN' && s.locationPrecision === 'store_level' && s.canAlertAsInventory, 8),
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

  const signals = (snapshot.signals || []).filter((signal) => SITE_ACTIVE_STATE_IDS.has(signal.state));
  const activeStateIds = new Set((summary.states || []).map((state) => state.state).filter((state) => SITE_ACTIVE_STATE_IDS.has(state)));
  const activeOfficialLocations = (officialLocationBible.locations || []).filter((location) => activeStateIds.has(location.state));
  const activeOfficialSourceReports = (officialLocationBible.sourceReports || []).filter((report) => !report.state || activeStateIds.has(report.state));
  const historicalSignals = uniqueHistoricalSignals(snapshots, signals).filter((signal) => activeStateIds.has(signal.state));
  const bottles = buildBottles(signals, bible, biblePayload.records || []);
  const stores = buildStores(signals);
  const locations = buildLocationBible(signals, activeOfficialLocations);
  const drops = buildDrops(historicalSignals, bible);
  const events = buildEvents(historicalSignals, bible);
  const alertCandidates = buildAlerts({ candidates: (alerts.candidates || []).filter((candidate) => activeStateIds.has(candidate.state)) });
  const generatedAt = new Date().toISOString();
  const stateCoverage = buildStateCoverage(summary, { stateFilter: activeStateIds });
  const southeastReadiness = buildSoutheastReadiness(summary, signals);
  const activeSummaryStates = (summary.states || []).filter((state) => activeStateIds.has(state.state));
  const stats = {
    contractVersion: CONTRACT_VERSION,
    generatedAt,
    engineGeneratedAt: summary.generatedAt || snapshot.generatedAt || null,
    stateCount: activeSummaryStates.length,
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
    eventCount: events.length,
    alertCandidateCount: alertCandidates.length,
    roadblockCount: summary.roadblockCount || 0,
    refreshHealth: {
      degradedStateCount: summary.degradedStateCount || 0,
      staleStateCount: summary.staleStateCount || 0,
      failedStateCount: summary.failedStateCount || 0,
      degradedStates: activeSummaryStates
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
      events: 'events.json',
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
      event: Object.keys(events[0] || {}),
      alert: Object.keys(alertCandidates[0] || {})
    }
  };

  await writeFile(path.join(SITE_OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await writeFile(path.join(SITE_OUT, 'stats.json'), JSON.stringify(stats, null, 2));
  await writeFile(path.join(SITE_OUT, 'bottles.json'), JSON.stringify({ contractVersion: CONTRACT_VERSION, generatedAt, count: bottles.length, bottles }, null, 2));
  await writeFile(path.join(SITE_OUT, 'stores.json'), JSON.stringify({ contractVersion: CONTRACT_VERSION, generatedAt, count: stores.length, stores }, null, 2));
  await writeFile(path.join(SITE_OUT, 'locations.json'), JSON.stringify({ contractVersion: CONTRACT_VERSION, generatedAt, count: locations.length, locations }, null, 2));
  await writeFile(path.join(SITE_OUT, 'drops.json'), JSON.stringify({ contractVersion: CONTRACT_VERSION, generatedAt, count: drops.length, drops }, null, 2));
  await writeFile(path.join(SITE_OUT, 'events.json'), JSON.stringify({ contractVersion: CONTRACT_VERSION, generatedAt, count: events.length, events }, null, 2));
  await writeFile(path.join(SITE_OUT, 'alerts.json'), JSON.stringify({ contractVersion: CONTRACT_VERSION, generatedAt, count: alertCandidates.length, alerts: alertCandidates }, null, 2));
  if (ncIntelligenceRaw) {
    await writeFile(path.join(SITE_OUT, 'nc-intelligence.json'), JSON.stringify({ contractVersion: CONTRACT_VERSION, generatedAt, ...ncIntelligenceRaw }, null, 2));
  }

  console.log(`Site contract export: ${bottles.length} bottles, ${stores.length} stores, ${locations.length} locations, ${drops.length} drops, ${events.length} events, ${alertCandidates.length} alert candidates -> out/site/`);
}

main().catch((error) => { console.error(error); process.exit(1); });
