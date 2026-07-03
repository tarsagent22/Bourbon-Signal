import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { stableId, titleCase } from '../core/text.mjs';
import { isCostcoSpiritsEligibleState } from '../costco-eligibility.mjs';

const DEFAULT_WATCHLIST = path.resolve('data/costco-bourbon-watchlist.json');
const DEFAULT_OBSERVATIONS = path.resolve('data/costco-observations.json');
const COSTCO_SOURCE_URL = 'https://sameday.costco.com/store/costco/s?k=bourbon';
const POSITIVE_STATUS_RE = /\b(available|in[ _-]?stock|limited[ _-]?supply|low[ _-]?stock|on[ _-]?hand)\b/i;
const NEGATIVE_STATUS_RE = /\b(out[ _-]?of[ _-]?stock|sold[ _-]?out|not[ _-]?available|unavailable)\b/i;
const DEFAULT_MAX_OBSERVATION_AGE_HOURS = 6;

function maxObservationAgeHours() {
  const configured = Number(process.env.COSTCO_MAX_OBSERVATION_AGE_HOURS || DEFAULT_MAX_OBSERVATION_AGE_HOURS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_OBSERVATION_AGE_HOURS;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function safeString(value, max = 200) {
  return value == null ? null : String(value).replace(/\s+/g, ' ').trim().slice(0, max) || null;
}

function normalizedItemNumber(value) {
  return String(value || '').replace(/[^0-9]/g, '').trim();
}

function normalizeStatus(value, quantity) {
  const raw = String(value || '').trim();
  if (NEGATIVE_STATUS_RE.test(raw)) return 'out_of_stock';
  if (POSITIVE_STATUS_RE.test(raw)) return 'in_stock';
  if (Number(quantity || 0) > 0) return 'in_stock';
  return raw ? raw.toLowerCase().replace(/\s+/g, '_') : 'unknown';
}

function toNumber(value) {
  const num = Number(String(value ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(num) ? num : null;
}

function isFreshObservation(observedAt, generatedAt) {
  const timestamp = Date.parse(observedAt || generatedAt || '');
  if (!Number.isFinite(timestamp)) return false;
  const ageMs = Date.now() - timestamp;
  if (ageMs < -15 * 60 * 1000) return false;
  return ageMs <= maxObservationAgeHours() * 60 * 60 * 1000;
}

function sourceReliability(row) {
  const sourceSystem = String(row.sourceSystem || row.source || '').toLowerCase();
  const hasWarehouse = Boolean(row.storeNumber || row.warehouseNumber || row.locationNumber || row.storeId || row.retailerLocationId);
  const hasAppSignal = /costco_sameday|instacart|costco app|warehouse inventory/.test(sourceSystem)
    || /sameday\.costco\.com|instacart\.com/.test(String(row.sourceUrl || row.url || ''));
  if (hasAppSignal && hasWarehouse) return { level: 'app_warehouse_observation', confidenceBoost: 0.08 };
  if (hasWarehouse) return { level: 'warehouse_observation', confidenceBoost: 0.04 };
  return { level: 'unverified_observation', confidenceBoost: -0.08 };
}

function watchlistIndex(items = []) {
  const byItemNumber = new Map();
  const byName = new Map();
  for (const item of items) {
    const itemNumber = normalizedItemNumber(item.itemNumber);
    if (itemNumber) byItemNumber.set(itemNumber, item);
    for (const name of [item.canonicalName, ...(item.aliases || [])]) {
      const key = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (key) byName.set(key, item);
    }
  }
  return { byItemNumber, byName };
}

function lookupWatchItem(row, index) {
  const itemNumber = normalizedItemNumber(row.itemNumber || row.item_number || row.itemNo || row.sku);
  if (itemNumber && index.byItemNumber.has(itemNumber)) return index.byItemNumber.get(itemNumber);
  const name = String(row.bottleName || row.productName || row.name || row.description || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return index.byName.get(name) || null;
}

function matchBottle(rawName, bible, watchItem) {
  const candidates = [rawName, watchItem?.canonicalName, ...(watchItem?.aliases || [])].filter(Boolean);
  for (const candidate of candidates) {
    const match = bible.match(candidate);
    if (match?.record) return match;
  }
  return null;
}

function normalizeObservation(row, bible, index, generatedAt, targetState) {
  const itemNumber = normalizedItemNumber(row.itemNumber || row.item_number || row.itemNo || row.sku);
  const watchItem = lookupWatchItem(row, index);
  const rawName = safeString(row.bottleName || row.productName || row.name || row.description || watchItem?.canonicalName, 180);
  if (!rawName && !watchItem) return null;
  const quantity = toNumber(row.quantity ?? row.qty ?? row.stock ?? row.onHand ?? row.on_hand);
  const status = normalizeStatus(row.status || row.availability || row.availabilityStatus, quantity);
  const positive = status === 'in_stock' || quantity > 0;
  if (!positive) return null;
  const observedAt = safeString(row.observedAt || row.fetchedAt || row.updatedAt || generatedAt, 80) || generatedAt;
  if (!isFreshObservation(observedAt, generatedAt)) return null;
  const match = matchBottle(rawName, bible, watchItem);
  const state = safeString(row.state || row.stateCode || row.warehouseState, 20)?.toUpperCase();
  if (!state || !isCostcoSpiritsEligibleState(state)) return null;
  if (targetState && state !== targetState) return null;
  const city = safeString(row.city || row.warehouseCity, 120);
  const storeNumber = safeString(row.storeNumber || row.warehouseNumber || row.locationNumber || row.storeId || row.retailerLocationId, 80);
  const storeName = safeString(row.storeName || row.warehouseName || (city ? `Costco ${city}` : 'Costco warehouse'), 160);
  if (!storeName || !storeNumber) return null;
  const sourceUrl = safeString(row.sourceUrl || row.url || COSTCO_SOURCE_URL, 500);
  const canonicalName = match?.record?.canonical || watchItem?.canonicalName || titleCase(rawName || 'Costco Bourbon');
  const canonicalBottleId = match?.record?.id || null;
  const tier = match?.record?.tier || watchItem?.tier || 'allocated';
  const locationBits = [city, state].filter(Boolean).join(', ');
  const reliability = sourceReliability(row);
  const confidence = Math.min(0.86, Math.max(0.6, (match?.confidence || (watchItem ? 0.7 : 0.62)) + reliability.confidenceBoost));
  return {
    id: stableId([state, 'costco', itemNumber, canonicalName, storeNumber, storeName, city, observedAt, quantity || 0]),
    key: stableId([state, 'costco', itemNumber, canonicalName, storeNumber, storeName, city]),
    state,
    displayState: state,
    sourceUrl,
    sourceLabel: 'Costco warehouse inventory',
    eventType: 'costco_warehouse_inventory_result',
    rawName: rawName || canonicalName,
    canonicalBottleId,
    bottleId: canonicalBottleId,
    canonicalName,
    tier,
    confidence,
    sourceMatchStatus: match?.record ? 'bottle_bible_match' : watchItem ? 'costco_watchlist_match' : 'costco_name_match',
    quantity: quantity || 1,
    storeQty: quantity || 1,
    price: toNumber(row.price || row.retailPrice || row.retail_price),
    availabilityStatus: status,
    availabilityLabel: quantity ? `${quantity} reported at warehouse` : 'Warehouse availability reported',
    locationPrecision: 'store_level',
    locationName: storeName,
    storeName,
    storeId: storeNumber ? `costco-${storeNumber}` : stableId(['costco', storeName, city, state]),
    storeAddress: safeString(row.address || row.storeAddress || row.warehouseAddress, 220),
    city,
    stateCode: state,
    zip: safeString(row.zip || row.postalCode, 20),
    observedAt,
    fetchedAt: generatedAt,
    canAlertAsInventory: true,
    canAlertAsWatch: true,
    dataLane: 'inventory',
    sourceReliability: reliability.level,
    inventorySemantics: 'Costco warehouse/app availability is retailer-published availability, not a reservation or guaranteed shelf hold. Treat as a fast-moving warehouse signal and verify before driving.',
    evidence: `Costco warehouse inventory reported ${canonicalName}${itemNumber ? ` (item #${itemNumber})` : ''}${locationBits ? ` near ${locationBits}` : ''}.`,
    raw: {
      ...row,
      costcoItemNumber: itemNumber || null,
      sourceReliability: reliability.level,
      sourceMatchStatus: match?.record ? 'bottle_bible_match' : watchItem ? 'costco_watchlist_match' : 'costco_name_match'
    }
  };
}

export async function collectCostco(config, bible) {
  const startedAt = new Date().toISOString();
  const watchlistPath = process.env.COSTCO_WATCHLIST_FILE || DEFAULT_WATCHLIST;
  const observationsPath = process.env.COSTCO_OBSERVATIONS_FILE || DEFAULT_OBSERVATIONS;
  const watchlist = await readJson(watchlistPath, []);
  const observations = await readJson(observationsPath, []);
  const index = watchlistIndex(Array.isArray(watchlist) ? watchlist : []);
  const rows = Array.isArray(observations) ? observations : Array.isArray(observations?.observations) ? observations.observations : [];
  const generatedAt = safeString(observations?.generatedAt, 80) || new Date().toISOString();
  const targetState = config.id ? String(config.id).toUpperCase() : null;
  const signals = rows.map((row) => normalizeObservation(row, bible, index, generatedAt, targetState)).filter(Boolean).slice(0, 500);
  const roadblocks = [];
  if (!rows.length) {
    roadblocks.push({
      state: config.id,
      source: 'Costco warehouse observation feed',
      url: observationsPath,
      status: 'not_configured',
      error: 'No Costco observations file found yet. Costco is wired into the engine, but it will not publish alerts until a verified warehouse/app observation feed is present.',
      nextRoute: 'Populate COSTCO_OBSERVATIONS_FILE from the Costco app/warehouse inventory monitor using the item-number watchlist; keep Bourbon Signal alert copy/source semantics.'
    });
  }
  return {
    state: config.id,
    label: config.label,
    tier: config.tier,
    strategy: config.strategy,
    cadence: config.cadence,
    value: config.value,
    startedAt,
    finishedAt: new Date().toISOString(),
    sources: [
      {
        label: 'Costco allocated-bourbon item watchlist',
        url: watchlistPath,
        kind: 'json',
        ok: watchlist.length > 0,
        signalType: 'costco_item_watchlist',
        matchedBottleCount: watchlist.length
      },
      {
        label: 'Costco warehouse observations',
        url: observationsPath,
        kind: 'json',
        ok: rows.length > 0,
        signalType: rows.length ? 'costco_warehouse_inventory_result' : 'costco_observation_feed_missing',
        matchedBottleCount: signals.length
      }
    ],
    signals,
    roadblocks,
    status: signals.length ? 'signals_normalized' : 'watchlist_ready_no_current_inventory'
  };
}
