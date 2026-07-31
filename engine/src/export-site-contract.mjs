import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fingerprintName, normalizeBottleName, stableId } from './core/text.mjs';
import { precisionRank } from './location-precision.mjs';
import { buildLocationBible } from './location-bible.mjs';
import { CUSTOMER_ACTIVE_STATE_IDS } from './state-sources.mjs';
import { getStateLifecycle, lifecycleAllowsInventoryAlert, lifecycleAllowsWatchAlert } from './state-lifecycle.mjs';
import { isCostcoSpiritsEligibleState } from './costco-eligibility.mjs';
import { buildStateQualityInputs, buildStateQualityScorecard, compareStateQuality, mergePartialRefreshStateQuality, scopeStateQualityForRefresh } from './state-quality-scorecard.mjs';
import { buildStateDropPartitions, verifyStateDropPartitions } from './site-state-partitions.mjs';
import { isArizonaRetailerInventory, isArizonaRetailerSignalIdentity } from './arizona-retailer-policy.mjs';
import { isFloridaRetailerInventory, isFloridaRetailerSignalIdentity } from './florida-retailer-policy.mjs';
import { isGeorgiaRetailerInventory, isGeorgiaRetailerSignalIdentity } from './georgia-retailer-policy.mjs';
import { isIndianaRetailerInventory, isIndianaRetailerSignalIdentity } from './indiana-retailer-policy.mjs';
import { isMississippiRetailerInventory } from './mississippi-retailer-policy.mjs';
import { isMetroRetailerInventory, isMetroRetailerSignalIdentity } from './metro-retailer-policy.mjs';
import { isTennesseeRetailerInventory, isTennesseeRetailerSignalIdentity } from './tennessee-retailer-policy.mjs';
import { isSouthCarolinaDunesInventory, isSouthCarolinaDunesSignal } from './south-carolina-dunes-policy.mjs';
import { hasSouthCarolinaPositiveInventoryEvidence, isSouthCarolinaSouthernSpiritsInventory, isSouthCarolinaSouthernSpiritsSignal } from './south-carolina-retailer-policy.mjs';
import { canPublishTennesseePartialEvidenceFallback } from './tennessee-verification-policy.mjs';
import { registeredDemandMetroStores } from './demand-metro-registry.mjs';
import { demandMetroAreaLabel, demandMetroAreaMatchesFields } from './demand-metro-areas.mjs';
import { attachRunIdentity, verifyRunCoherence } from './site-run-coherence.mjs';
import { detectDropCollapseFallbacks, mergePartialRefreshDrops } from './partial-refresh-contract.mjs';
import { buildNcBoardCoverageSummary } from './nc-coverage-summary.mjs';
import { buildNcSourceLedger, enrichNcSingleStoreShipmentSignals } from './nc-source-ledger.mjs';
import { authoritativeSignalTimestamp, enforceArchivedSourceAlertPolicy } from './event-freshness.mjs';

const OUT = path.resolve('out');
const SNAPSHOTS = path.join(OUT, 'history', 'snapshots');
const SITE_OUT = path.join(OUT, 'site');
const CONTRACT_VERSION = 'bourbon-signal-site-v0.1';
const HISTORY_DAYS = Number(process.env.BOURBON_SIGNAL_HISTORY_DAYS || 30);
const HISTORY_SNAPSHOT_LIMIT = Number(process.env.BOURBON_SIGNAL_HISTORY_SNAPSHOT_LIMIT || 40);
const PA_STORE_INVENTORY_MAX_AGE_HOURS = Number(process.env.PA_STORE_INVENTORY_MAX_AGE_HOURS || 72);
const FAST_STORE_INVENTORY_MAX_AGE_HOURS = Number(process.env.FAST_STORE_INVENTORY_MAX_AGE_HOURS || 12);
// VA uses the official Virginia ABC storeNearby cache during launch because the
// live broad store scan is expensive and rate-limit sensitive. Ohio's OHLQ site
// can intermittently block browser collection behind Cloudflare; keep older OHLQ
// store-status rows visible in the feed with an explicit stale-source caveat,
// while alert export still uses CURRENT_INVENTORY_ALERT_MAX_AGE_HOURS below.
const VA_STORE_INVENTORY_MAX_AGE_HOURS = Number(process.env.VA_STORE_INVENTORY_MAX_AGE_HOURS || 72);
const OH_STORE_INVENTORY_FEED_MAX_AGE_HOURS = Number(process.env.OH_STORE_INVENTORY_FEED_MAX_AGE_HOURS || 336);
const CURRENT_INVENTORY_ALERT_MAX_AGE_HOURS = Number(process.env.CURRENT_INVENTORY_ALERT_MAX_AGE_HOURS || 2);
const NC_STRICT_SIGNAL_RE = /buffalo trace|blanton|eagle rare|weller|stagg|e\.?h\.?\s*taylor|colonel\s*taylor|old fitz|fitzgerald|willett|pappy|van winkle|blood oath|old carter|elmer t|rock hill|george t|william larue|thomas h|elijah craig\s+barrel proof|four roses\s+(limited|limited edition)|michter'?s\s+10|henry\s+mckenna\s+(?:10|single\s+barrel|bottled[ -]?in[ -]?bond|bib)/i;
const NC_STRICT_SIGNAL_EXCLUDE_RE = /cream|liqueur|cordial|cocktail|ready[ -]?to[ -]?drink|rtd|vodka|gin|rum|tequila|mezcal|cognac|brandy|wine|beer|seltzer/i;
const NC_GREENSBORO_STORE_SIGNAL_RE = /buffalo trace|blanton|eagle rare|weller|stagg|old fitz|fitzgerald|willett|pappy|van winkle|baker'?s?|e\.?h\.?\s*taylor|colonel\s+taylor|elijah craig[^\n]{0,40}barrel proof|michter'?s[^\n]{0,40}(bourbon|10\s*year)/i;
const NC_GREENSBORO_STORE_EXCLUDE_RE = /john\s+d\s+taylor|old\s+taylor|taylor\s+port|falernum|cream|white\s+dog|rye|elijah\s+craig\s+small\s+batch(?![^\n]{0,40}barrel\s+proof)|tequila|corazon|expresiones|reposado|a[ñn]ejo|vodka|gin|rum|liqueur|cordial|beer|wine|cocktail/i;
const SITE_ACTIVE_STATE_IDS = CUSTOMER_ACTIVE_STATE_IDS;
const CUSTOMER_DROP_TIERS = new Set(['unicorn', 'allocated', 'limited']);

function normalizedDropText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isKnownFalseRareMatch(drop) {
  const raw = normalizedDropText(drop.rawName || drop.bottleName || drop.canonicalName);
  if (/\bfour roses\b/.test(raw) && /\b(small batch|small batch select|single barrel)\b/.test(raw)) {
    const hasRareModifier = /\b(limited edition|limited release|le|barrel strength|cask strength|private selection|private barrel|single barrel select|oes[foqkv]|obs[foqkv])\b/.test(raw);
    if (!hasRareModifier) return true;
  }
  return false;
}

function isCustomerDropTier(drop) {
  return CUSTOMER_DROP_TIERS.has(String(drop.tier || '').toLowerCase()) && !isKnownFalseRareMatch(drop);
}

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
  const type = String(signal.eventType || signal.type || '');
  const isIowaUnmatchedDeliveryLead = signal.state === 'IA'
    && /^(store_delivery_snapshot|store_allocation_snapshot)$/i.test(type)
    && !signal.bottleId
    && !signal.canonicalBottleId;
  const isAggregateSourceNamedLead = ['MD-MONTGOMERY', 'UT'].includes(signal.state)
    && /^(county_inventory_aggregate|board_inventory_aggregate|county_product_search_match|county_product_row|county_allocated_product_row|catalog_row)$/i.test(type)
    && (!signal.bottleId || String(signal.raw?.sourceMatchStatus || '').startsWith('source_name_kept:'))
    && !signal.canonicalBottleId;
  if ((['ID', 'IA', 'MD-MONTGOMERY', 'OH', 'UT'].includes(signal.state) && String(signal.raw?.sourceMatchStatus || signal.sourceMatchStatus || '').startsWith('source_name_kept:')) || isIowaUnmatchedDeliveryLead || isAggregateSourceNamedLead) return null;
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

function exportedTier(signal, bibleRecord) {
  const signalTier = signal.tier && signal.tier !== 'unknown' ? signal.tier : null;
  return signalTier || bibleRecord?.tier || null;
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
    && isTennesseeRetailerInventory(signal)
    && Boolean(signal.storeId)
    && Boolean(signal.storeAddress);
}

function isSouthCarolinaAllowedRetailerSource(signal) {
  return /CityHive|Green's Beverage|Wine & Bourbon Barn|Da Brown Bag|Clover|Dunes Liquor|Southern Spirits|All American Liquor/i.test(String(signal.sourceLabel || signal.source || ''));
}

function isSouthCarolinaRetailerInventory(signal) {
  if (isSouthCarolinaDunesSignal(signal)) return isSouthCarolinaDunesInventory(signal);
  return signal.state === 'SC'
    && /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(String(signal.eventType || signal.type || ''))
    && isSouthCarolinaAllowedRetailerSource(signal)
    && signal.locationPrecision === 'store_level'
    && hasSouthCarolinaPositiveInventoryEvidence(signal)
    && Boolean(signal.storeId)
    && /,\s*SC\s+\d{5}/i.test(String(signal.storeAddress || ''));
}


function isCostcoWarehouseInventorySignal(signal) {
  return isCostcoSpiritsEligibleState(signal.state)
    && /^costco_warehouse_inventory_result$/i.test(String(signal.eventType || signal.type || ''));
}

function publicSignal(signal, bible, freshness = null) {
  const bibleRecord = findBibleRecord(signal, bible);
  const preferRetailerName = ['IN', 'IL', 'TN', 'SC', 'AZ', 'GA', 'NY', 'CO'].includes(signal.state) && /^(cityhive_store_inventory|retailer_store_inventory)/i.test(String(signal.eventType || ''));
  const isCostcoWarehouseInventory = isCostcoWarehouseInventorySignal(signal);
  const isKyOfficialDistillery = isKentuckyOfficialDistillerySignal(signal);
  const preferOfficialSourceName = preferRetailerName || isKentuckyOfficialDistilleryReleaseWatchSignal(signal) || (signal.state === 'NC' && /High Point ABC public Power BI/i.test(String(signal.sourceLabel || signal.source || '')));
  const canonicalName = preferOfficialSourceName ? (signal.rawName || signal.canonicalName || bibleRecord?.canonical || null) : (bibleRecord?.canonical || signal.canonicalName || signal.rawName || null);
  const canonicalId = preferOfficialSourceName ? stableId([signal.state, signal.sourceLabel || signal.sourceUrl, signal.rawName || signal.canonicalName || 'unknown']) : (bibleRecord?.id || bottleKey(signal));
  const isTnCityHiveInventory = isTennesseeCityHiveInventory(signal);
  const isTnRetailerInventory = isTennesseeRetailerInventory(signal);
  const isScRetailerInventory = isSouthCarolinaRetailerInventory(signal);
  const isScSouthernBinaryInventory = isSouthCarolinaSouthernSpiritsInventory(signal);
  const isAzRetailerInventory = isArizonaRetailerInventory(signal);
  const isFlRetailerInventory = isFloridaRetailerInventory(signal);
  const isGaRetailerInventory = isGeorgiaRetailerInventory(signal);
  const isInRetailerInventory = signal.canAlertAsInventory === true && isIndianaRetailerInventory(signal);
  const isMsSparseOnSiteInventory = isMississippiSparseOnSiteInventory(signal);
  const isMetroInventory = isMetroRetailerInventory(signal);
  const isInRetailerEvent = signal.state === 'IN'
    && /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(String(signal.eventType || signal.type || ''));
  const isGaRetailerEvent = signal.state === 'GA'
    && /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(String(signal.eventType || signal.type || ''));
  const isTnRetailerEvent = signal.state === 'TN'
    && /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(String(signal.eventType || signal.type || ''));
  const isScRetailerEvent = signal.state === 'SC'
    && /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(String(signal.eventType || signal.type || ''));
  const isMetroRetailerEvent = ['NY', 'CO'].includes(signal.state)
    && /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(String(signal.eventType || signal.type || ''));
  const inventorySemantics = isCostcoWarehouseInventory
    ? 'Costco warehouse/app availability is retailer-published availability, not a reservation or guaranteed shelf hold. Treat as a fast-moving warehouse signal and verify before driving.'
    : isTnRetailerInventory
      ? signal.inventorySemantics
      : isScRetailerInventory
        ? 'South Carolina is a private retail market. Whitelisted public retailer sources can expose store-level bottle availability; alert as retailer-published availability with a verify-before-driving caveat.'
        : isAzRetailerInventory
          ? 'Arizona is a private retail market. Whitelisted public retailer CityHive sources expose store-level bottle availability, price, and sometimes exact quantity; alert as retailer-published availability with a verify-before-driving caveat.'
          : isFlRetailerInventory
            ? 'Florida is a private retail market. Whitelisted retailer storefront and store-fulfillment sources expose store-level bottle availability; alert as retailer-published availability with a verify-before-driving caveat.'
            : isGaRetailerInventory
              ? signal.inventorySemantics
            : isMetroInventory
              ? signal.inventorySemantics
            : isMsSparseOnSiteInventory
              ? signal.inventorySemantics
            : isInRetailerInventory
              ? 'Indiana is a private retail market. Identity-bound first-party retailer inventory and verified store-orderability rows may alert with a verify-before-driving caveat; binary availability is not an exact shelf count.'
              : signal.inventorySemantics;
  const staleFallback = signal.stale === true || signal.sourceStale === true || signal.raw?.staleFallback === true;
  const exactScRetailerIdentityAllowed = (!isSouthCarolinaSouthernSpiritsSignal(signal) || isSouthCarolinaSouthernSpiritsInventory(signal))
    && (!isSouthCarolinaDunesSignal(signal) || isSouthCarolinaDunesInventory(signal));
  const policyCanAlertAsInventory = exactScRetailerIdentityAllowed && !staleFallback && (isCostcoWarehouseInventory
    ? Boolean(signal.canAlertAsInventory) && (Number(signal.quantity || signal.storeQty || 0) > 0 || (signal.sourceAvailabilityVerified === true && signal.availabilityStatus === 'in_stock'))
    : signal.state === 'AZ'
      ? isAzRetailerInventory
      : signal.state === 'FL'
        ? isFlRetailerInventory
        : signal.state === 'GA'
          ? (isGaRetailerEvent ? Boolean(signal.canAlertAsInventory) && isGaRetailerInventory : Boolean(signal.canAlertAsInventory))
        : ['NY', 'CO'].includes(signal.state)
          ? (isMetroRetailerEvent ? Boolean(signal.canAlertAsInventory) && isMetroInventory : Boolean(signal.canAlertAsInventory))
        : signal.state === 'IN'
          ? (isInRetailerEvent ? isInRetailerInventory : Boolean(signal.canAlertAsInventory))
          : signal.state === 'TN'
            ? (isTnRetailerEvent ? Boolean(signal.canAlertAsInventory) && isTnRetailerInventory : Boolean(signal.canAlertAsInventory))
            : signal.state === 'SC'
              ? (isScRetailerEvent ? Boolean(signal.canAlertAsInventory) && isScRetailerInventory : Boolean(signal.canAlertAsInventory))
              : Boolean(signal.canAlertAsInventory));
  const policyCanAlertAsWatch = exactScRetailerIdentityAllowed && !staleFallback && (isCostcoWarehouseInventory
    ? Boolean(signal.canAlertAsWatch)
    : signal.state === 'AZ'
      ? Boolean(signal.canAlertAsWatch) && isArizonaRetailerSignalIdentity(signal)
      : signal.state === 'FL'
        ? Boolean(signal.canAlertAsWatch) && isFloridaRetailerSignalIdentity(signal)
        : signal.state === 'GA'
          ? Boolean(signal.canAlertAsWatch) && (!isGaRetailerEvent || (isGeorgiaRetailerSignalIdentity(signal) && isGeorgiaRetailerInventory(signal)))
        : ['NY', 'CO'].includes(signal.state)
          ? Boolean(signal.canAlertAsWatch) && (!isMetroRetailerEvent || (isMetroRetailerSignalIdentity(signal) && isMetroInventory))
        : signal.state === 'IN'
          ? Boolean(signal.canAlertAsWatch) && (!isInRetailerEvent || isIndianaRetailerSignalIdentity(signal))
          : signal.state === 'TN'
            ? Boolean(signal.canAlertAsWatch) && (!isTnRetailerEvent || isTnRetailerInventory)
            : signal.state === 'SC'
              ? Boolean(signal.canAlertAsWatch) && (!isScRetailerEvent || isScRetailerInventory)
              : Boolean(signal.canAlertAsWatch));
  const canAlertAsInventory = lifecycleAllowsInventoryAlert(signal.state) && policyCanAlertAsInventory;
  const canAlertAsWatch = lifecycleAllowsWatchAlert(signal.state) && policyCanAlertAsWatch;
  const dataLane = isKyOfficialDistillery
    ? 'distillery_release_watch'
    : isMsSparseOnSiteInventory
      ? 'onsite_inventory'
    : canAlertAsInventory && signal.locationPrecision === 'store_level'
      ? 'actionable_inventory'
      : canAlertAsWatch
        ? 'actionable_watch'
        : 'informational';
  const eventAt = freshness?.eventAt || null;
  const firstSeenAt = freshness?.firstSeenAt || signal.observedAt || null;
  const lastConfirmedAt = freshness?.lastConfirmedAt || signal.observedAt || null;
  const displayAt = eventAt || firstSeenAt || lastConfirmedAt;
  const timestampBasis = eventAt ? 'source_event_at' : firstSeenAt ? 'first_seen_at' : 'last_confirmed_at';
  return {
    id: signal.key || signal.sourceSignalId || signal.id,
    state: signal.state,
    stateCode: signal.stateCode || signal.state,
    bottleId: canonicalId,
    canonicalBottleId: canonicalId,
    canonicalId,
    canonicalKey: preferOfficialSourceName ? null : (bibleRecord?.normalizedKey || null),
    bottleName: canonicalName,
    canonicalName,
    rawName: signal.rawName || null,
    aliases: preferOfficialSourceName ? [] : (bibleRecord?.aliases || []),
    tier: exportedTier(signal, bibleRecord),
    producer: preferOfficialSourceName ? null : (signal.producer || bibleRecord?.producer || null),
    type: signal.eventType,
    source: signal.sourceLabel,
    sourceLabel: signal.sourceLabel,
    sourceUrl: signal.sourceUrl,
    sourceChain: signal.sourceChain || signal.raw?.chain || null,
    sourceRuntimeId: signal.sourceRuntimeId || signal.raw?.sourceRuntimeId || null,
    leafSourceRuntimeId: signal.leafSourceRuntimeId || signal.raw?.leafSourceRuntimeId || null,
    merchantId: signal.merchantId || signal.raw?.merchantId || signal.raw?.option?.merchant_id || null,
    productId: signal.productId || signal.raw?.product?.id || signal.raw?.option?.product_id || null,
    sourceProductBinding: signal.sourceProductBinding || signal.raw?.productBinding || null,
    productHandle: signal.productHandle || signal.raw?.product?.handle || null,
    productCode: signal.productCode || null,
    sku: signal.sku || signal.raw?.sku || null,
    productLimitedCaveat: typeof signal.productLimitedCaveat === 'boolean' ? signal.productLimitedCaveat : null,
    variantId: signal.variantId || signal.raw?.variant?.id || signal.raw?.option?.option_id || null,
    variantAvailable: typeof signal.variantAvailable === 'boolean'
      ? signal.variantAvailable
      : typeof signal.raw?.variant?.available === 'boolean'
        ? signal.raw.variant.available
        : null,
    sourceIdentity: signal.raw?.source || null,
    observedAt: signal.observedAt,
    releaseDate: signal.releaseDate || signal.eventDate || null,
    eventDate: signal.eventDate || signal.releaseDate || null,
    eventAt,
    firstSeenAt,
    lastConfirmedAt,
    displayAt,
    timestampBasis,
    locationPrecision: signal.locationPrecision,
    locationName: signal.locationName,
    storeName: signal.storeName,
    storeId: signal.storeId,
    permitNumber: signal.permitNumber || signal.raw?.permitNumber || null,
    storeAddress: signal.storeAddress,
    storeUrl: signal.storeUrl || null,
    storePhone: signal.storePhone || null,
    storeHours: signal.storeHours || null,
    shoppingCenter: signal.shoppingCenter || null,
    city: signal.city,
    area: signal.area || (demandMetroAreaMatchesFields(signal.state, [signal.city, signal.storeAddress, signal.locationName], [demandMetroAreaLabel(signal.state)])
      ? demandMetroAreaLabel(signal.state)
      : null),
    county: signal.county,
    regionId: signal.regionId || null,
    zip: signal.zip,
    lat: signal.lat,
    lng: signal.lng,
    quantity: signal.quantity || signal.storeQty || 0,
    storeQty: Number(signal.storeQty ?? signal.quantity ?? 0) || 0,
    boardShipmentQuantity: signal.boardShipmentQuantity ?? null,
    shipmentStoreEquivalent: signal.shipmentStoreEquivalent === true,
    quantityIsExact: typeof signal.quantityIsExact === 'boolean' ? signal.quantityIsExact : null,
    quantitySemantics: signal.quantitySemantics || signal.raw?.quantitySemantics || null,
    reportedQuantity: ['GA', 'TN', 'NY', 'CO', 'VA'].includes(signal.state) && signal.reportedQuantity != null && Number.isFinite(Number(signal.reportedQuantity))
      ? Number(signal.reportedQuantity)
      : null,
    availabilityStatus: isMsSparseOnSiteInventory ? (signal.availabilityStatus || 'orderable') : signal.availabilityStatus,
    availabilityLabel: signal.availabilityLabel,
    sourceAvailabilityVerified: signal.sourceAvailabilityVerified === true,
    fulfillmentPolicyVerified: signal.fulfillmentPolicyVerified === true || signal.raw?.fulfillmentPolicyVerified === true,
    pickupOfferVerified: signal.pickupOfferVerified === true || signal.raw?.pickupOfferVerified === true,
    deliveryOfferVerified: signal.deliveryOfferVerified === true || signal.raw?.deliveryOfferVerified === true,
    orderabilityOfferVerified: signal.orderabilityOfferVerified === true || signal.raw?.orderabilityOfferVerified === true,
    premisesVerified: signal.premisesVerified === true || signal.raw?.premisesVerified === true,
    integratedCartVerified: signal.integratedCartVerified === true || signal.raw?.integratedCartVerified === true,
    runtimeStoreId: signal.runtimeStoreId || signal.raw?.runtimeStoreId || null,
    fulfillmentGuaranteed: signal.fulfillmentGuaranteed === true || signal.raw?.fulfillmentGuaranteed === true,
    warehouseQty: signal.warehouseQty || 0,
    price: signal.price || 0,
    confidence: Math.min(signal.confidence || 0, canAlertAsInventory && signal.locationPrecision === 'store_level' ? 0.86 : (signal.confidence || 0)),
    policyMode: isMsSparseOnSiteInventory ? 'onsite_retailer_store_inventory_caveat' : isCostcoWarehouseInventory ? 'alert_costco_warehouse_inventory_caveat' : isTnRetailerInventory || isScRetailerInventory || isAzRetailerInventory || isFlRetailerInventory || isGaRetailerInventory || isInRetailerInventory || isMetroInventory ? 'alert_retailer_store_inventory_caveat' : signal.policyMode,
    canAlertAsInventory,
    canAlertAsWatch,
    eligibleForOnSite: isMsSparseOnSiteInventory || canAlertAsInventory || canAlertAsWatch,
    eligibleForDropFeed: isMsSparseOnSiteInventory ? true : undefined,
    eligibleForWatch: isMsSparseOnSiteInventory ? false : undefined,
    eligibleForDelivery: isMsSparseOnSiteInventory ? false : (canAlertAsInventory || canAlertAsWatch),
    eligibleForEmail: isMsSparseOnSiteInventory || isScSouthernBinaryInventory ? false : undefined,
    eligibleForSms: isMsSparseOnSiteInventory || isScSouthernBinaryInventory ? false : undefined,
    raw: isMsSparseOnSiteInventory ? {
      chain: signal.raw?.chain || signal.sourceChain || null,
      sourceRuntimeId: signal.raw?.sourceRuntimeId || signal.sourceRuntimeId || null,
      merchantId: signal.raw?.merchantId || signal.merchantId || null,
      controlStoreId: signal.raw?.controlStoreId || null,
      displayedMerchantId: signal.raw?.displayedMerchantId || signal.merchantId || null,
      platformStoreId: signal.raw?.platformStoreId || null,
      permitNumber: signal.raw?.permitNumber || signal.permitNumber || null,
      sourceRuntimeNonAlertable: signal.raw?.sourceRuntimeNonAlertable === true,
    } : undefined,
    sourceStale: signal.sourceStale === true || ohioFeedStaleCaveat(signal),
    staleSourceCaveat: signal.staleSourceCaveat || (ohioFeedStaleCaveat(signal) ? 'OHLQ collection is currently stale/blocked. This is the latest cached OHLQ status we have; verify on OHLQ or call the store before driving.' : null),
    dataLane,
    informationalOnly: dataLane === 'informational',
    inventoryCaveat: isCostcoWarehouseInventory
      ? 'Costco warehouse signal. Fast-moving bottles can disappear quickly; verify with the warehouse/app before driving.'
      : isKentuckyDistilleryDrop(signal)
        ? 'Official distillery gift-shop availability. This is a distillery drop/pickup lead, not retailer store inventory; limits and same-day sellouts can apply.'
      : isKyOfficialDistillery
        ? 'Official distillery release-watch intelligence only; not retailer store inventory or a store shipment alert.'
      : ohioFeedStaleCaveat(signal)
        ? 'Stale OHLQ store-status signal. OHLQ collection is currently blocked/stale, so this is the latest cached status; verify on OHLQ or call the store before driving.'
        : signal.state === 'CA' && canAlertAsInventory
          ? 'First-party product orderability plus a separately fetched first-party pickup/collection policy for this single-location San Diego retailer. Exact shelf quantity is not published; verify pickup before driving.'
        : ['NY', 'CO'].includes(signal.state) && canAlertAsInventory
          ? 'Identity-bound first-party retailer availability at the exact configured premises. Binary orderability is not an exact count; verify pickup before driving.'
        : isMsSparseOnSiteInventory
          ? 'Sparse Mississippi first-party store orderability. No exact bottle count or hold is claimed; verify directly with the store before driving.'
        : canAlertAsInventory && signal.locationPrecision === 'store_level'
          ? 'Source-reported store availability. Fast-moving bottles may sell out quickly; verify directly with the store before driving.'
        : ['MD-MONTGOMERY', 'UT'].includes(signal.state)
          ? 'Aggregate availability intelligence only; not exact per-store shelf inventory.'
          : 'Informational/watch data only; not live shelf inventory.',
    inventorySemantics: safeString(inventorySemantics, 700),
    evidence: safeString(signal.evidence, 700)
  };
}

function asTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function isFastMovingStoreInventory(signal) {
  const type = String(signal.eventType || signal.type || '').toLowerCase();
  const source = String(signal.sourceLabel || signal.source || '').toLowerCase();
  if (signal.locationPrecision !== 'store_level') return false;
  if (!signalCanAlertAsInventory(signal) && !isMississippiSparseOnSiteInventory(signal)) return false;
  if (signal.state === 'NC' && source.includes('wake county abc store inventory search')) return true;
  return /store_inventory_result|cityhive_store_inventory_result|retailer_store_inventory_result|browser_assisted_store_inventory_(limited_supply|in_stock)/i.test(type);
}

function isFreshCurrentInventorySignal(signal, currentKeys) {
  if (!isFastMovingStoreInventory(signal)) return true;
  if (!currentKeys.has(signalFreshnessKey(signal))) return false;
  const observedAt = asTime(signal.observedAt || signal.fetchedAt);
  if (!observedAt) return false;
  const maxAgeHours = signal.state === 'OH' && isOhioOhlqStoreInventorySignal(signal)
    ? OH_STORE_INVENTORY_FEED_MAX_AGE_HOURS
    : signal.state === 'PA' && String(signal.eventType || signal.type || '') === 'store_inventory_result'
      ? PA_STORE_INVENTORY_MAX_AGE_HOURS
      : signal.state === 'VA' && String(signal.eventType || signal.type || '') === 'store_inventory_result'
        ? VA_STORE_INVENTORY_MAX_AGE_HOURS
        : FAST_STORE_INVENTORY_MAX_AGE_HOURS;
  const ageMs = Date.now() - observedAt;
  return ageMs >= -5 * 60_000 && ageMs <= maxAgeHours * 60 * 60 * 1000;
}

function signalFreshnessKey(signal) {
  return [
    signal.state || '',
    signal.eventType || signal.type || '',
    signal.canonicalBottleId || signal.bottleId || signal.canonicalName || signal.rawName || '',
    signal.sourceLabel || signal.source || '',
    signal.sourceUrl || '',
    signal.storeId || '',
    signal.locationName || signal.storeName || signal.county || signal.city || '',
    signal.quantity || signal.storeQty || signal.warehouseQty || 0,
    signal.availabilityStatus || '',
    signal.price || 0
  ].map((value) => String(value).toLowerCase().trim()).join('|');
}

function validSourceEventAt(value, fetchedAt = null) {
  const ts = Date.parse(value || '');
  if (!Number.isFinite(ts)) return null;
  const ceiling = Date.parse(fetchedAt || '') || Date.now();
  if (ts > ceiling + 5 * 60 * 1000) return null;
  return new Date(ts).toISOString();
}

function sourceEventAt(signal) {
  const type = String(signal.eventType || signal.type || '').toLowerCase();
  // This is a source-provided NC extract timestamp for the actual stock-shipped feed,
  // not the crawler runtime. Other inventory probes use observedAt as last-confirmed.
  if (type === 'nc_board_shipment_snapshot') return validSourceEventAt(signal.sourceEventAt || signal.observedAt, signal.fetchedAt);
  if (signal.state === 'ID' && type === 'store_inventory_result') return validSourceEventAt(signal.sourceEventAt, signal.observedAt || signal.fetchedAt);
  return null;
}

function buildFreshnessIndex(historicalSignals = [], currentSignals = []) {
  const index = new Map();
  for (const signal of [...historicalSignals, ...currentSignals]) {
    const key = signalFreshnessKey(signal);
    if (!key) continue;
    const observedAt = signal.observedAt || signal.fetchedAt || null;
    const firstSeenAt = signal.firstSeenAt || observedAt;
    const lastConfirmedAt = signal.lastConfirmedAt || observedAt;
    const cur = index.get(key) || { firstSeenAt: null, lastConfirmedAt: null, eventAt: null };
    const eventAt = sourceEventAt(signal);
    if (eventAt && (!cur.eventAt || eventAt < cur.eventAt)) cur.eventAt = eventAt;
    if (firstSeenAt && (!cur.firstSeenAt || firstSeenAt < cur.firstSeenAt)) cur.firstSeenAt = firstSeenAt;
    if (lastConfirmedAt && (!cur.lastConfirmedAt || lastConfirmedAt > cur.lastConfirmedAt)) cur.lastConfirmedAt = lastConfirmedAt;
    index.set(key, cur);
  }
  return index;
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

export function buildStores(signals) {
  const storeSignals = signals.filter((s) => s.locationPrecision === 'store_level' && (s.storeName || s.locationName || s.storeAddress));
  const inventorySignals = storeSignals.filter((signal) => signal.sourceAvailabilityVerified === true && (signalCanAlertAsInventory(signal) || isMississippiSparseOnSiteInventory(signal)));
  const sameStore = (left, right) => {
    if (left.storeId && right.storeId) return String(left.storeId) === String(right.storeId);
    return left.state === right.state
      && (left.storeName || left.locationName) === (right.storeName || right.locationName)
      && (left.storeAddress || '') === (right.storeAddress || '');
  };
  const configuredStores = registeredDemandMetroStores().map((store) => ({
    id: store.storeId,
    sourceStoreId: store.storeId,
    state: store.state,
    name: store.name,
    address: store.address,
    city: store.city,
    county: null,
    area: store.area,
    zip: store.zip,
    lat: null,
    lng: null,
    source: 'Bourbon Signal first-party exact-store registry',
    signalCount: 0,
    hasSignals: false,
    collectorAttached: true,
    inventoryCapability: 'exact_store_source_registered',
    sourceAvailabilityVerified: false,
  }));
  const signalStores = storeSignals.map((s) => {
    const matchingInventorySignals = inventorySignals.filter((candidate) => sameStore(candidate, s));
    const signalCount = matchingInventorySignals.length;
    const directoryOnly = String(s.eventType || s.type || '') === 'retailer_store_location'
      || s.raw?.configuredStoreIdentity === true;
    return {
      id: s.storeId ? String(s.storeId) : stableId([s.state, s.storeName || s.locationName, s.storeAddress || s.city || s.county]),
      sourceStoreId: s.storeId ? String(s.storeId) : null,
      state: s.state,
      name: s.storeName || s.locationName,
      address: s.storeAddress || null,
      city: s.city || null,
      county: s.county || null,
      area: s.area || (demandMetroAreaMatchesFields(s.state, [s.city, s.storeAddress, s.storeName || s.locationName], [demandMetroAreaLabel(s.state)])
        ? demandMetroAreaLabel(s.state)
        : null),
      zip: s.zip || null,
      lat: s.lat,
      lng: s.lng,
      source: s.sourceLabel,
      signalCount,
      hasSignals: signalCount > 0,
      collectorAttached: true,
      inventoryCapability: directoryOnly && signalCount === 0 ? 'exact_store_source_registered' : s.locationPrecision,
      sourceAvailabilityVerified: signalCount > 0,
    };
  });
  const stores = uniqueBy([...signalStores, ...configuredStores], (s) => s.id);
  return stores.sort((a, b) => a.state.localeCompare(b.state) || String(a.name).localeCompare(String(b.name)));
}

function isMississippiSparseOnSiteInventory(signal) {
  const lifecycle = getStateLifecycle('MS');
  return signal?.state === 'MS'
    && lifecycle?.publicStatus === 'active'
    && lifecycle?.coverageTier === 'sparse_live_store_inventory'
    && signal?.stale !== true
    && signal?.sourceStale !== true
    && signal?.raw?.staleFallback !== true
    && isMississippiRetailerInventory(signal);
}

function signalCanAlertAsInventory(signal) {
  if (signal.stale === true || signal.sourceStale === true || signal.raw?.staleFallback === true) return false;
  if (!lifecycleAllowsInventoryAlert(signal.state)) return false;
  if (signal.state === 'AZ') return isArizonaRetailerInventory(signal);
  if (signal.state === 'GA') return Boolean(signal.canAlertAsInventory) && isGeorgiaRetailerInventory(signal);
  if (signal.state === 'TN') return Boolean(signal.canAlertAsInventory) && isTennesseeRetailerInventory(signal);
  if (signal.state === 'SC') return Boolean(signal.canAlertAsInventory) && isSouthCarolinaRetailerInventory(signal);
  return Boolean(signal.canAlertAsInventory) || isTennesseeRetailerInventory(signal);
}

function signalCanAlertAsWatch(signal) {
  if (!lifecycleAllowsWatchAlert(signal.state)) return false;
  if (signal.state === 'AZ') return Boolean(signal.canAlertAsWatch) && isArizonaRetailerSignalIdentity(signal);
  if (signal.state === 'GA') return Boolean(signal.canAlertAsWatch) && isGeorgiaRetailerSignalIdentity(signal) && isGeorgiaRetailerInventory(signal);
  if (signal.state === 'TN') return Boolean(signal.canAlertAsWatch) && isTennesseeRetailerSignalIdentity(signal) && isTennesseeRetailerInventory(signal);
  if (signal.state === 'SC') return Boolean(signal.canAlertAsWatch) && isSouthCarolinaRetailerInventory(signal);
  return Boolean(signal.canAlertAsWatch) || isTennesseeRetailerInventory(signal);
}

function isKentuckyOfficialDistillerySignal(signal) {
  return signal.state === 'KY'
    && /^distillery_(gift_shop_availability|release_watch)$/i.test(String(signal.eventType || signal.type || ''))
    && String(signal.locationPrecision || '').toLowerCase() === 'distillery';
}

function isKentuckyOfficialDistilleryReleaseWatchSignal(signal) {
  return signal.state === 'KY'
    && /^distillery_release_watch$/i.test(String(signal.eventType || signal.type || ''))
    && String(signal.locationPrecision || '').toLowerCase() === 'distillery';
}

function isKentuckyDistilleryDrop(signal) {
  return signal.state === 'KY'
    && /^distillery_gift_shop_availability$/i.test(String(signal.eventType || signal.type || ''))
    && String(signal.locationPrecision || '').toLowerCase() === 'distillery'
    && /in_stock|limited_supply|available|while supplies last/i.test(`${signal.availabilityStatus || ''} ${signal.availabilityLabel || ''}`);
}

function dropPriority(signal) {
  const type = String(signal.eventType || '');
  if (signal.state === 'NC' && signalCanAlertAsInventory(signal) && signal.locationPrecision === 'store_level') return 78;
  if (type === 'nc_board_shipment_snapshot') return 64;
  if (signal.state === 'VA' && type === 'store_inventory_result') return 62;
  if (signal.state === 'PA' && type === 'store_inventory_result' && signal.locationPrecision === 'store_level') return 68;
  if (isKentuckyDistilleryDrop(signal)) return 66;
  if (type === 'nc_statewide_warehouse_stock') return 58;
  if (signal.state === 'PA' && type === 'store_inventory_aggregate') return 56;
  if (isMississippiSparseOnSiteInventory(signal)) return 49;
  if (signalCanAlertAsInventory(signal)) return 50;
  if (signal.state === 'MD-MONTGOMERY' && type === 'county_inventory_aggregate') return 32;
  if (signal.state === 'UT' && type === 'board_inventory_aggregate') return 31;
  if (isCostcoWarehouseInventorySignal(signal)) return 72;
  if (/store_delivery_snapshot|store_allocation_snapshot|store_inventory_result|limited_supply|in_stock/i.test(type)) return 34;
  if (/release|allocated|lottery/i.test(type)) return 26;
  return 0;
}

function hasPositiveAvailabilityStatus(signal) {
  return /\b(in_stock|available|limited supply|on hand)\b/i.test(`${signal.availabilityStatus || ''} ${signal.availabilityLabel || ''} ${signal.availabilityValue || ''}`);
}

function isUserFacingDropSignal(signal) {
  const type = String(signal.eventType || '').toLowerCase();
  const quantity = Number(signal.quantity || signal.storeQty || signal.warehouseQty || 0) || 0;
  const precision = String(signal.locationPrecision || '').toLowerCase();
  const canAlert = signalCanAlertAsInventory(signal);

  if (!type) return false;
  if (isSouthCarolinaDunesSignal(signal)) return isSouthCarolinaDunesInventory(signal);
  if (isSouthCarolinaSouthernSpiritsSignal(signal)) return isSouthCarolinaSouthernSpiritsInventory(signal);
  if (type.includes('out_of_stock') || type.includes('out-of-stock')) return false;
  if (type.includes('lottery') || type.includes('raffle') || type.includes('tasting')) return false;
  if (type.includes('policy') || type.includes('program') || type.includes('catalog') || type.includes('surface')) return false;
  if (type.includes('allocated_release') || type.includes('county_allocated')) return false;

  if (type === 'alabc_limited_release_store_drop') return precision === 'store_level';
  if (type === 'nc_board_shipment_snapshot') return Number(signal.boardShipmentQuantity || quantity) > 0;
  if (type === 'nc_statewide_warehouse_stock') return quantity > 0;
  if (type === 'store_delivery_snapshot') return quantity > 0;
  if (type === 'store_allocation_snapshot') return signal.state === 'IA' && precision === 'store_level' && quantity > 0;
  if (type === 'county_inventory_aggregate') return signal.state === 'MD-MONTGOMERY' && precision === 'store_aggregate' && quantity > 0;
  if (type === 'board_inventory_aggregate') return signal.state === 'UT' && precision === 'board_warehouse' && quantity > 0;
  if (type === 'store_inventory_aggregate') return quantity > 0;
  if (type === 'store_inventory_result') {
    if (signal.state === 'ID') return precision === 'store_level' && Boolean(signal.storeId) && hasPositiveAvailabilityStatus(signal);
    return quantity > 0;
  }
  if (signal.state === 'MS' && /^(retailer_store_inventory_result|cityhive_store_inventory_result)$/.test(type)) {
    return isMississippiSparseOnSiteInventory(signal);
  }
  if (signal.state === 'TN' && /^(retailer_store_inventory_result|cityhive_store_inventory_result)$/.test(type)) {
    return isTennesseeRetailerInventory(signal);
  }
  if (type === 'costco_warehouse_inventory_result') return isCostcoWarehouseInventorySignal(signal) && precision === 'store_level' && (quantity > 0 || (signal.sourceAvailabilityVerified === true && signal.availabilityStatus === 'in_stock'));
  if (type === 'retailer_store_inventory_result') return signal.state === 'SC' ? isSouthCarolinaRetailerInventory(signal) : quantity > 0 || (signal.sourceAvailabilityVerified === true && signal.availabilityStatus === 'in_stock');
  if (type === 'cityhive_store_inventory_result') return signal.state === 'SC' ? isSouthCarolinaRetailerInventory(signal) : quantity > 0 || (signal.sourceAvailabilityVerified === true && signal.availabilityStatus === 'in_stock');
  if (type === 'browser_assisted_store_inventory_limited_supply') return true;
  if (type === 'browser_assisted_store_inventory_in_stock') return true;
  if (isKentuckyDistilleryDrop(signal)) return true;

  return canAlert && precision === 'store_level';
}

function isIowaSourceNamedDeliveryLead(signal) {
  const isStoreLead = signal.state === 'IA'
    && /^(store_delivery_snapshot|store_allocation_snapshot)$/i.test(String(signal.eventType || ''))
    && String(signal.locationPrecision || '').toLowerCase() === 'store_level'
    && Number(signal.quantity || 0) > 0;
  if (!isStoreLead) return false;
  if (String(signal.raw?.sourceMatchStatus || '').startsWith('source_name_kept:')) return true;
  return !signal.bottleId && !signal.canonicalBottleId && Boolean(signal.canonicalName || signal.rawName);
}

function isMarylandAggregateLead(signal) {
  const quantity = Number(signal.quantity || 0) || 0;
  return signal.state === 'MD-MONTGOMERY'
    && /^county_inventory_aggregate$/i.test(String(signal.eventType || ''))
    && String(signal.locationPrecision || '').toLowerCase() === 'store_aggregate'
    && quantity > 0
    && Boolean(signal.canonicalName || signal.rawName);
}

function isUtahAggregateLead(signal) {
  const quantity = Number(signal.quantity || signal.storeQty || signal.warehouseQty || 0) || 0;
  return signal.state === 'UT'
    && /^board_inventory_aggregate$/i.test(String(signal.eventType || ''))
    && String(signal.locationPrecision || '').toLowerCase() === 'board_warehouse'
    && quantity > 0
    && Boolean(signal.canonicalName || signal.rawName);
}

function isMarylandOrUtahAggregateLead(signal) {
  return isMarylandAggregateLead(signal) || isUtahAggregateLead(signal);
}

function aggregateLeadIdentity(signal) {
  return [
    signal.state || '',
    signal.eventType || signal.type || '',
    signal.rawName || signal.canonicalName || '',
    signal.sourceLabel || signal.source || '',
    signal.locationName || '',
    signal.county || '',
    signal.quantity || signal.storeQty || signal.warehouseQty || 0,
    signal.price || 0
  ].map((value) => String(value).toLowerCase().replace(/\s+/g, ' ').trim()).join('|');
}

function isSafePublicSignal(signal) {
  const type = String(signal.eventType || '');
  if (signal.state === 'FL'
    && /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(type)
    && (!isFloridaRetailerSignalIdentity(signal) || !isFloridaRetailerInventory(signal))) return false;
  if (['NY', 'CO'].includes(signal.state)
    && /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(type)
    && (!isMetroRetailerSignalIdentity(signal) || !isMetroRetailerInventory(signal))) return false;
  if (signal.state === 'IN' && /Bourbon World|Big Red/i.test(String(signal.sourceLabel || signal.source || '')) && !/retailer_allocated_raffle_item|cityhive_store_inventory_result|cityhive_store_inventory_out_of_stock|retailer_store_location/i.test(type)) return false;
  if (signal.state === 'IN' && /^(cityhive_store_inventory|retailer_store_inventory)/i.test(type) && !/bourbon|whiskey|whisky|rye|blanton|eagle rare|weller|stagg|taylor|van winkle|buffalo trace|michter|willett|old fitz|elmer|rock hill|booker|baker|blood oath|four roses|1792|russell|woodford|wild turkey|elijah craig|old forester|green river|bardstown|knob creek|bulleit|maker/i.test(String(signal.rawName || signal.canonicalName || ''))) return false;
  if (signal.state === 'IL' && /^(retailer_store_inventory)/i.test(type) && !/bourbon|whiskey|whisky|rye|blanton|eagle rare|weller|stagg|taylor|van winkle|buffalo trace|michter|willett|old fitz|elmer|rock hill|booker|baker|blood oath|four roses|1792|russell|woodford|wild turkey|elijah craig|old forester|heaven hill|knob creek|maker|pappy/i.test(String(signal.rawName || signal.canonicalName || ''))) return false;
  if (signal.state === 'TN' && /^(cityhive_store_inventory|retailer_store_inventory)/i.test(type)) {
    if (signal.canAlertAsInventory !== true || !isTennesseeRetailerSignalIdentity(signal) || !isTennesseeRetailerInventory(signal)) return false;
  }

  if (signal.state === 'PA' && type === 'store_inventory_result' && signal.locationPrecision === 'store_level') {
    if (!signal.storeId) return false;
    const observedAt = new Date(signal.observedAt || signal.fetchedAt || 0).getTime();
    const maxAgeMs = PA_STORE_INVENTORY_MAX_AGE_HOURS * 60 * 60 * 1000;
    if (!Number.isFinite(observedAt) || Date.now() - observedAt > maxAgeMs) return false;
  }
  if (isCostcoWarehouseInventorySignal(signal)) {
    const name = String(signal.rawName || signal.canonicalName || '');
    if (!/costco/i.test(String(signal.sourceLabel || signal.source || ''))) return false;
    if (!/bourbon|whiskey|whisky|rye|blanton|eagle rare|weller|stagg|taylor|van winkle|buffalo trace|michter|willett|old fitz|elmer|rock hill|booker|blood oath|four roses|1792|old forester|birthday|high west|midwinter/i.test(name)) return false;
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
    const name = String(signal.rawName || signal.canonicalName || '');
    return NC_STRICT_SIGNAL_RE.test(name) && !NC_STRICT_SIGNAL_EXCLUDE_RE.test(name);
  }
  return true;
}

function publicDisplaySortTimestamp(signal, freshnessIndex) {
  const freshness = freshnessIndex.get(signalFreshnessKey(signal));
  return freshness?.eventAt || freshness?.firstSeenAt || signal.observedAt || signal.fetchedAt || freshness?.lastConfirmedAt || '';
}

export function buildDrops(signals, bible, currentSignals = []) {
  const seenSourceIds = new Set();
  const freshnessIndex = buildFreshnessIndex(signals, currentSignals);
  const currentKeys = new Set(currentSignals.map(signalFreshnessKey));
  const currentIowaLeadSourceIds = new Set((currentSignals || [])
    .filter((signal) => signal.state === 'IA' && /^(store_delivery_snapshot|store_allocation_snapshot)$/i.test(String(signal.eventType || '')))
    .map((signal) => signal.key || signal.id || signal.sourceSignalId)
    .filter(Boolean));
  const currentAggregateLeadIds = new Set((currentSignals || [])
    .filter((signal) => isMarylandOrUtahAggregateLead(signal))
    .map(aggregateLeadIdentity)
    .filter(Boolean));
  const seenAggregateLeadIds = new Set();
  return signals
    .filter((s) => isSafePublicSignal(s))
    .filter((s) => isFreshCurrentInventorySignal(s, currentKeys))
    .filter((s) => {
      if (s.state !== 'IA' || !/^(store_delivery_snapshot|store_allocation_snapshot)$/i.test(String(s.eventType || ''))) return true;
      const sourceId = s.key || s.id || s.sourceSignalId;
      return Boolean(sourceId && currentIowaLeadSourceIds.has(sourceId));
    })
    .filter((s) => {
      if (!isMarylandOrUtahAggregateLead(s)) return true;
      return currentAggregateLeadIds.has(aggregateLeadIdentity(s));
    })
    .filter((s) => findBibleRecord(s, bible) || isCostcoWarehouseInventorySignal(s) || isIowaSourceNamedDeliveryLead(s) || isMarylandAggregateLead(s) || isUtahAggregateLead(s) || (s.state === 'NC' && signalCanAlertAsInventory(s) && s.locationPrecision === 'store_level' && /High Point ABC public Power BI/i.test(String(s.sourceLabel || s.source || ''))))
    .filter((s) => isUserFacingDropSignal(s))
    .sort((a, b) => dropPriority(b) - dropPriority(a) || String(publicDisplaySortTimestamp(b, freshnessIndex)).localeCompare(String(publicDisplaySortTimestamp(a, freshnessIndex))) || Boolean(b.storeId) - Boolean(a.storeId) || (b.confidence || 0) - (a.confidence || 0) || precisionRank(b.locationPrecision) - precisionRank(a.locationPrecision))
    .filter((s) => {
      const sourceId = s.key || s.id || s.sourceSignalId;
      if (!sourceId) return true;
      if (seenSourceIds.has(sourceId)) return false;
      seenSourceIds.add(sourceId);
      return true;
    })
    .filter((s) => {
      if (!isMarylandOrUtahAggregateLead(s)) return true;
      const aggregateId = aggregateLeadIdentity(s);
      if (seenAggregateLeadIds.has(aggregateId)) return false;
      seenAggregateLeadIds.add(aggregateId);
      return true;
    })
    .map((signal) => publicSignal(signal, bible, freshnessIndex.get(signalFreshnessKey(signal))))
    .filter((drop) => isCustomerDropTier(drop))
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
  if (/distillery|buffalo trace|old forester|four roses|maker'?s mark|woodford reserve|wild turkey|heaven hill/.test(hay)) return 'official_distillery';
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
    official_distillery: 'Official distillery page',
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
  const eventKey = isKentuckyOfficialDistillerySignal(signal)
    ? stableId([drop.state, drop.type, drop.sourceUrl, drop.rawName || displayBottleName || title])
    : stableId([drop.state, category, drop.sourceUrl, eventDate, products.join('|') || displayBottleName || title, drop.storeId || drop.locationName]);
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
    eventKey,
    actionLabel: category === 'scheduled_release' ? 'Verify release rules before driving'
      : category === 'lottery' ? 'Check entry rules at source'
      : category === 'tasting' ? 'Check event details at source'
      : 'Monitor source for release details',
    inventoryCaveat: drop.canAlertAsInventory ? 'May indicate retailer/store inventory; verify before driving.' : 'Release/event intelligence only; not live shelf inventory.',
    sortScore: eventPriority({ category }) + eventFreshnessScore(signal, eventDate) + (drop.locationPrecision === 'store_level' ? 6 : 0) + (drop.canAlertAsWatch ? 4 : 0) + (/official/.test(sourceType) ? 8 : 0) + (drop.confidence || 0)
  };
}

function isUpcomingActionableEvent(event) {
  const status = String(event.eventStatus || '').toLowerCase();
  const actionability = String(event.actionability || '').toLowerCase();
  const category = String(event.category || '').toLowerCase();
  const sourceType = String(event.sourceType || '').toLowerCase();
  const sourceUrl = String(event.sourceUrl || '');
  const eventDate = Date.parse(String(event.eventDate || ''));
  const hasFutureDate = Number.isFinite(eventDate) && eventDate >= Date.now() - 24 * 60 * 60 * 1000;
  const hasOfficialLink = /^https?:\/\//i.test(sourceUrl);
  const isSourceWatchPage = status === 'watch_page' || category === 'release_watch' || !event.eventDate;
  const watchSurfaceText = `${sourceUrl} ${event.eventType || event.type || ''} ${event.title || ''} ${event.evidence || ''}`;
  const isOfficialWatchSurface = hasOfficialLink
    && isSourceWatchPage
    && /^official_/.test(sourceType)
    && Boolean(event.canAlertAsWatch)
    && ['lottery', 'barrel_pick', 'scheduled_release', 'release_watch'].includes(category)
    && /lottery|raffle|allocated|allocation|release|barrel|pick|bourbon|specialty|limited|distillery|gift shop/i.test(watchSurfaceText);
  return isOfficialWatchSurface || (hasOfficialLink && hasFutureDate && !isSourceWatchPage && ['high', 'medium'].includes(actionability));
}

function buildEvents(signals, bible) {
  const seen = new Set();
  return signals
    .filter((signal) => signal?.raw?.archivedSourceAlertBlocked !== true)
    .filter((signal) => isSafePublicSignal(signal))
    .filter((signal) => isEventSignal(signal))
    .filter((signal) => isKentuckyOfficialDistillerySignal(signal) || findBibleRecord(signal, bible) || /calendar|policy|program|source_reachable|release_surface|lottery_surface|barrel_pick_surface|inventory_surface/i.test(String(signal.eventType || '')))
    .map((signal) => publicEvent(signal, bible))
    .filter((event) => isUpcomingActionableEvent(event))
    .filter((event) => {
      const key = event.eventKey || [event.state, event.category, event.canonicalId || event.rawName || event.title, event.sourceUrl, event.locationName, event.eventDate, event.price].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.sortScore - a.sortScore || String(b.observedAt || '').localeCompare(String(a.observedAt || '')))
    .slice(0, 5000);
}


function alertActionabilityClass(candidate) {
  const eventType = String(candidate.eventType || candidate.type || '').toLowerCase();
  const state = String(candidate.state || '').toUpperCase();
  const precision = String(candidate.locationPrecision || '').toLowerCase();
  const source = `${candidate.source || ''} ${candidate.sourceLabel || ''}`.toLowerCase();

  if (/policy|license|catalog_row|source_reachable|regulatory/.test(eventType)) return 'context_only';
  if (state === 'KY' || precision === 'distillery' || /distillery|release[-_ ]?watch|gift[-_ ]?shop/.test(eventType)) return 'distillery_release_watch';
  if (/costco|warehouse/.test(source) && precision !== 'board_warehouse') return 'retailer_warehouse_watch';
  if (['board_county', 'board_warehouse'].includes(precision) || /board_shipment|shipment_snapshot|warehouse_stock/.test(eventType)) return 'board_or_county_lead';
  if (precision === 'store_aggregate' || /aggregate/.test(eventType)) return 'aggregate_watch';
  if (precision === 'store_level' && /delivery|allocation/.test(eventType)) return 'store_delivery_lead';
  if (precision === 'store_level') return 'store_inventory';
  return 'context_only';
}

function maxFreshnessForActionability(actionabilityClass, channel) {
  const table = {
    store_inventory: { onSite: 1, email: 1, sms: 1 },
    store_delivery_lead: { onSite: 1, email: 1, sms: 1 },
    board_or_county_lead: { onSite: 1, email: 1, sms: 1 },
    distillery_release_watch: { onSite: 1, email: 1, sms: 1 },
    retailer_warehouse_watch: { onSite: 1, email: 1, sms: 1 },
    aggregate_watch: { onSite: 1, email: 0, sms: 0 },
    context_only: { onSite: 0, email: 0, sms: 0 }
  };
  return table[actionabilityClass]?.[channel] || 0;
}

function alertDeliveryCaveat(actionabilityClass) {
  if (actionabilityClass === 'store_inventory') return 'Store-level signal; verify before driving.';
  if (actionabilityClass === 'store_delivery_lead') return 'Delivery/allocation lead; shelf availability is not guaranteed.';
  if (actionabilityClass === 'board_or_county_lead') return 'Board/county/warehouse lead; not exact shelf inventory.';
  if (actionabilityClass === 'distillery_release_watch') return 'Distillery/release signal; check official release terms.';
  if (actionabilityClass === 'retailer_warehouse_watch') return 'Warehouse/retailer signal; inventory can move quickly.';
  if (actionabilityClass === 'aggregate_watch') return 'Aggregate inventory signal; exact store may vary.';
  return 'Context only; not alertable.';
}

function alertChannelPolicy(candidate) {
  const actionabilityClass = candidate.actionabilityClass || alertActionabilityClass(candidate);
  const freshnessHours = Number(candidate.freshnessHours);
  const hasFreshness = Number.isFinite(freshnessHours);
  const tier = String(candidate.tier || '').toLowerCase();
  const priorityClass = String(candidate.priorityClass || '').toLowerCase();
  const blockers = Array.isArray(candidate.blockers) ? candidate.blockers.map((b) => String(b).toLowerCase()) : [];
  const cautions = Array.isArray(candidate.cautions) ? candidate.cautions.map((c) => String(c).toLowerCase()) : [];
  const blocked = Boolean(candidate.bootstrap) || blockers.includes('bootstrap_run_not_sendable') || blockers.includes('manual_refresh_quarantine') || blockers.includes('stale_observation') || cautions.includes('unknown_freshness') || actionabilityClass === 'context_only';
  const major = priorityClass === 'major' || tier === 'unicorn' || tier === 'allocated';
  const unicorn = tier === 'unicorn';
  const within = (channel) => hasFreshness && freshnessHours <= maxFreshnessForActionability(actionabilityClass, channel);

  const eligibleForOnSite = !blocked && within('onSite');
  const eligibleForEmail = candidate.eligibleForEmail !== false && eligibleForOnSite && within('email') && (
    actionabilityClass === 'store_inventory' ||
    actionabilityClass === 'store_delivery_lead' ||
    (actionabilityClass === 'board_or_county_lead' && (major || unicorn)) ||
    actionabilityClass === 'distillery_release_watch' ||
    (actionabilityClass === 'retailer_warehouse_watch' && (major || unicorn))
  );
  const eligibleForSms = candidate.eligibleForSms !== false && eligibleForEmail && within('sms') && (
    (actionabilityClass === 'store_inventory' && (major || unicorn)) ||
    (actionabilityClass === 'store_delivery_lead' && unicorn) ||
    (actionabilityClass === 'board_or_county_lead' && major) ||
    (actionabilityClass === 'retailer_warehouse_watch' && unicorn) ||
    (actionabilityClass === 'distillery_release_watch' && unicorn)
  );

  return {
    actionabilityClass,
    eligibleForOnSite,
    eligibleForEmail,
    eligibleForSms,
    freshnessPolicyHours: {
      onSite: maxFreshnessForActionability(actionabilityClass, 'onSite'),
      email: maxFreshnessForActionability(actionabilityClass, 'email'),
      sms: maxFreshnessForActionability(actionabilityClass, 'sms')
    },
    deliveryCaveat: alertDeliveryCaveat(actionabilityClass)
  };
}

function buildAlerts(alerts) {
  return (alerts.candidates || [])
    .filter((c) => Boolean(c.eligibleForDelivery))
    .filter((c) => lifecycleAllowsInventoryAlert(c.state) || lifecycleAllowsWatchAlert(c.state))
    .filter((c) => ['unicorn', 'allocated', 'limited'].includes(String(c.tier || '').toLowerCase()))
    .filter((c) => c.state !== 'IA' || (/^(store_delivery_snapshot|store_allocation_snapshot)$/i.test(String(c.eventType || '')) && String(c.locationPrecision || '').toLowerCase() === 'store_level' && c.action !== 'inventory_alert_candidate'))
    .filter((c) => !['MD-MONTGOMERY', 'UT'].includes(c.state) || !/^(county_inventory_aggregate|board_inventory_aggregate|county_product_search_match|county_product_row|county_allocated_product_row|catalog_row)$/i.test(String(c.eventType || '')))
    .map((c) => {
    const policy = alertChannelPolicy(c);
    return {
    id: c.id,
    action: c.action,
    score: c.score,
    reliabilityScore: c.reliabilityScore ?? null,
    eligibleForDelivery: Boolean(c.eligibleForDelivery) && policy.eligibleForOnSite,
    eligibleForOnSite: policy.eligibleForOnSite,
    eligibleForEmail: policy.eligibleForEmail,
    eligibleForSms: policy.eligibleForSms,
    actionabilityClass: policy.actionabilityClass,
    freshnessPolicyHours: policy.freshnessPolicyHours,
    deliveryCaveat: policy.deliveryCaveat,
    priorityClass: c.priorityClass || 'hold',
    deliveryChannel: c.deliveryChannel || 'review_only',
    sendRecommendation: c.sendRecommendation || 'review_before_send',
    signalAt: c.signalAt || null,
    freshnessHours: c.freshnessHours ?? null,
    bootstrap: Boolean(c.bootstrap),
    changeType: c.changeType || null,
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
    sourceChain: c.sourceChain || null,
    merchantId: c.merchantId || null,
    productId: c.productId || null,
    productHandle: c.productHandle || null,
    variantId: c.variantId || null,
    variantAvailable: c.variantAvailable ?? null,
    locationPrecision: c.locationPrecision,
    locationName: c.locationName,
    storeName: c.storeName,
    storeId: c.storeId || null,
    storeAddress: c.storeAddress,
    city: c.city || null,
    quantity: c.quantity || 0,
    quantityIsExact: typeof c.quantityIsExact === 'boolean' ? c.quantityIsExact : null,
    quantitySemantics: c.quantitySemantics || null,
    reportedQuantity: c.reportedQuantity ?? null,
    availabilityStatus: c.availabilityStatus,
    availabilityLabel: c.availabilityLabel,
    warehouseQty: c.warehouseQty || 0,
    price: c.price || 0,
    confidence: c.confidence,
    policyMode: c.policyMode,
    inventorySemantics: safeString(c.inventorySemantics, 700),
    reason: safeString(c.reason, 700),
    evidence: safeString(c.evidence, 700)
  }})
    .sort((a, b) => Number(b.eligibleForDelivery) - Number(a.eligibleForDelivery) || (b.reliabilityScore || 0) - (a.reliabilityScore || 0) || (b.score || 0) - (a.score || 0));
}


function applyAlertPolicyToCandidate(candidate) {
  const policy = alertChannelPolicy(candidate);
  const lifecycleEligible = lifecycleAllowsInventoryAlert(candidate.state) || lifecycleAllowsWatchAlert(candidate.state);
  return {
    ...candidate,
    eligibleForDelivery: lifecycleEligible && Boolean(candidate.eligibleForDelivery) && policy.eligibleForOnSite,
    eligibleForOnSite: lifecycleEligible && policy.eligibleForOnSite,
    eligibleForEmail: lifecycleEligible && policy.eligibleForEmail,
    eligibleForSms: lifecycleEligible && policy.eligibleForSms,
    actionabilityClass: policy.actionabilityClass,
    freshnessPolicyHours: policy.freshnessPolicyHours,
    deliveryCaveat: policy.deliveryCaveat
  };
}

function alertCandidateSort(a, b) {
  return Number(b.eligibleForDelivery) - Number(a.eligibleForDelivery) || (b.reliabilityScore || 0) - (a.reliabilityScore || 0) || (b.score || 0) - (a.score || 0);
}

function alertDropSort(a, b) {
  const tierRank = { unicorn: 3, allocated: 2, limited: 1 };
  return (tierRank[String(b.tier || '')] || 0) - (tierRank[String(a.tier || '')] || 0)
    || Number(b.quantity || b.warehouseQty || 0) - Number(a.quantity || a.warehouseQty || 0)
    || String(b.observedAt || b.lastConfirmedAt || b.displayAt || '').localeCompare(String(a.observedAt || a.lastConfirmedAt || a.displayAt || ''));
}

function capAlertCandidatesByState(candidates, limit = 200, perStateCap = 50) {
  const selected = [];
  const byState = new Map();
  for (const candidate of candidates.slice().sort(alertCandidateSort)) {
    const state = candidate.state || 'UNKNOWN';
    if (!byState.has(state)) byState.set(state, []);
    byState.get(state).push(candidate);
  }
  for (let round = 0; selected.length < limit; round += 1) {
    let added = false;
    for (const bucket of byState.values()) {
      if (round >= Math.min(bucket.length, perStateCap)) continue;
      selected.push(bucket[round]);
      added = true;
      if (selected.length >= limit) break;
    }
    if (!added) break;
  }
  if (selected.length < limit) {
    const already = new Set(selected.map((candidate) => candidate.dedupeKey || candidate.id));
    for (const candidate of candidates.slice().sort(alertCandidateSort)) {
      const key = candidate.dedupeKey || candidate.id;
      if (already.has(key)) continue;
      selected.push(candidate);
      already.add(key);
      if (selected.length >= limit) break;
    }
  }
  return selected.sort(alertCandidateSort);
}

function dropSignalAt(drop) {
  return authoritativeSignalTimestamp(drop);
}

function dropAgeHours(drop, nowMs = Date.now()) {
  const observed = Date.parse(dropSignalAt(drop) || 0);
  if (!Number.isFinite(observed)) return Infinity;
  const ageMs = nowMs - observed;
  return ageMs < -5 * 60_000 ? Infinity : Math.max(0, ageMs / (60 * 60 * 1000));
}

function signalAgeHours(signal) {
  const observedAt = asTime(signal?.observedAt || signal?.fetchedAt);
  if (!observedAt) return Infinity;
  const ageMs = Date.now() - observedAt;
  return ageMs < -5 * 60_000 ? Infinity : Math.max(0, ageMs / (60 * 60 * 1000));
}

function isOhioOhlqStoreInventorySignal(signal) {
  return signal?.state === 'OH'
    && /^browser_assisted_store_inventory_(limited_supply|in_stock)$/i.test(String(signal?.eventType || signal?.type || ''))
    && String(signal?.locationPrecision || '').toLowerCase() === 'store_level';
}

function ohioFeedStaleCaveat(signal) {
  return isOhioOhlqStoreInventorySignal(signal) && signalAgeHours(signal) > FAST_STORE_INVENTORY_MAX_AGE_HOURS;
}

export function dropHasPositiveAlertInventory(drop) {
  if (isSouthCarolinaDunesSignal(drop)) return isSouthCarolinaDunesInventory(drop);
  if (['NY', 'CO'].includes(drop?.state)) return isMetroRetailerInventory(drop);
  if (drop?.state === 'FL') {
    return (Number(drop.quantity || 0) > 0 || drop.quantityIsExact === false)
      && isFloridaRetailerInventory(drop);
  }
  if (drop?.state === 'GA') return isGeorgiaRetailerInventory(drop);
  if (drop?.state === 'TN') return isTennesseeRetailerInventory(drop);
  if (drop?.state === 'SC') return hasSouthCarolinaPositiveInventoryEvidence(drop);
  if (Number(drop?.quantity || 0) > 0) return true;
  if (drop?.state === 'CA') {
    return String(drop?.type || drop?.eventType || '') === 'retailer_store_inventory_result'
      && drop?.sourceAvailabilityVerified === true
      && ['del-mesa-liquor', 'mission-trails-wine-spirits'].includes(String(drop?.sourceChain || ''))
      && Boolean(drop?.merchantId && drop?.productId && drop?.variantId && drop?.storeId)
      && String(drop?.availabilityStatus || '').toLowerCase() === 'in_stock';
  }
  return drop?.state === 'OH'
    && /^browser_assisted_store_inventory_(limited_supply|in_stock)$/i.test(String(drop?.type || drop?.eventType || ''))
    && ['limited_supply', 'in_stock'].includes(String(drop?.availabilityStatus || '').toLowerCase());
}

export function buildCurrentInventoryAlertsFromDrops(drops) {
  return (drops || [])
    .filter((drop) => drop && drop.canAlertAsInventory && drop.locationPrecision === 'store_level')
    .filter((drop) => dropAgeHours(drop) <= CURRENT_INVENTORY_ALERT_MAX_AGE_HOURS)
    .filter((drop) => dropHasPositiveAlertInventory(drop))
    .filter((drop) => ['unicorn', 'allocated', 'limited'].includes(String(drop.tier || '')))
    .sort(alertDropSort)
    .map((drop) => {
      const georgiaBaseline = drop.state === 'GA';
      const metroBaseline = ['NY', 'CO'].includes(drop.state);
      const tennesseeBinaryBaseline = drop.state === 'TN' && drop.inventorySemantics === 'binary_retailer_orderable_no_exact_count';
      const floridaBinaryBaseline = drop.state === 'FL'
        && Number(drop.quantity || 0) === 0
        && drop.quantityIsExact === false
        && isFloridaRetailerInventory(drop);
      const southCarolinaBinaryBaseline = isSouthCarolinaSouthernSpiritsInventory(drop);
      const binaryRetailerOrderability = floridaBinaryBaseline || southCarolinaBinaryBaseline || (
        (georgiaBaseline || metroBaseline || tennesseeBinaryBaseline)
        && drop.inventorySemantics === 'binary_retailer_orderable_no_exact_count'
        && Number(drop.quantity || 0) === 0
      );
      return ({
      id: stableId(['current_inventory_alert', drop.id || drop.state, drop.canonicalId || drop.bottleName, drop.storeId || drop.locationName, drop.quantity || 0, drop.availabilityStatus || '']),
      action: 'inventory_alert_candidate',
      score: drop.tier === 'unicorn' ? 150 : drop.tier === 'allocated' ? 135 : 112,
      reliabilityScore: drop.tier === 'unicorn' ? 92 : drop.tier === 'allocated' ? 88 : 82,
      eligibleForDelivery: true,
      eligibleForOnSite: true,
      eligibleForEmail: drop.state === 'CA' || georgiaBaseline || metroBaseline || tennesseeBinaryBaseline || floridaBinaryBaseline || southCarolinaBinaryBaseline ? false : true,
      eligibleForSms: drop.state === 'CA' || georgiaBaseline || metroBaseline || tennesseeBinaryBaseline || floridaBinaryBaseline || southCarolinaBinaryBaseline ? false : ['unicorn', 'allocated'].includes(String(drop.tier || '')),
      actionabilityClass: 'store_inventory',
      priorityClass: drop.tier === 'limited' ? 'standard' : 'major',
      deliveryChannel: 'onsite_candidate',
      sendRecommendation: drop.state === 'CA' || georgiaBaseline || metroBaseline || tennesseeBinaryBaseline || floridaBinaryBaseline || southCarolinaBinaryBaseline ? 'display_on_site_until_change_detected' : 'send_to_matching_testers',
      signalAt: dropSignalAt(drop),
      observedAt: drop.observedAt || drop.signalAt || null,
      freshnessHours: Number(dropAgeHours(drop).toFixed(2)),
      bootstrap: false,
      changeType: 'current_inventory_signal',
      dedupeKey: stableId(['current_inventory_alert', drop.state, drop.canonicalId || drop.bottleName, drop.storeId || drop.locationName, drop.availabilityStatus || '', drop.quantity || 0]),
      matchKey: stableId([drop.state, drop.canonicalId || drop.bottleName, drop.storeId || drop.locationName || 'regional']),
      gates: ['current_public_drop', 'store_level', binaryRetailerOrderability || drop.state === 'CA' ? 'verified_binary_orderability' : 'positive_quantity'],
      blockers: [],
      cautions: ['verify_before_driving'],
      state: drop.state,
      stateCode: drop.state,
      bottle: drop.bottleName || drop.canonicalName,
      canonicalBottleId: drop.canonicalBottleId || drop.canonicalId || null,
      canonicalId: drop.canonicalId || drop.canonicalBottleId || null,
      canonicalName: drop.canonicalName || drop.bottleName || null,
      rawName: drop.rawName || null,
      tier: drop.tier,
      eventType: drop.type,
      source: drop.source,
      sourceLabel: drop.sourceLabel || drop.source,
      sourceUrl: drop.sourceUrl,
      sourceChain: drop.sourceChain || null,
      sourceRuntimeId: drop.sourceRuntimeId || null,
      leafSourceRuntimeId: drop.leafSourceRuntimeId || null,
      merchantId: drop.merchantId || null,
      productId: drop.productId || null,
      productHandle: drop.productHandle || null,
      variantId: drop.variantId || null,
      variantAvailable: typeof drop.variantAvailable === 'boolean' ? drop.variantAvailable : null,
      sku: drop.sku || null,
      locationPrecision: drop.locationPrecision,
      locationName: drop.locationName,
      storeName: drop.storeName,
      storeId: drop.storeId || null,
      storeAddress: drop.storeAddress,
      city: drop.city || null,
      postalCode: drop.zip || null,
      zip: drop.zip || null,
      quantity: drop.quantity || 0,
      storeQty: Number(drop.storeQty ?? drop.quantity ?? 0) || 0,
      quantityIsExact: typeof drop.quantityIsExact === 'boolean' ? drop.quantityIsExact : null,
      quantitySemantics: drop.quantitySemantics || null,
      reportedQuantity: drop.reportedQuantity ?? null,
      availabilityStatus: drop.availabilityStatus,
      availabilityLabel: drop.availabilityLabel,
      sourceAvailabilityVerified: drop.sourceAvailabilityVerified === true,
      premisesVerified: drop.premisesVerified === true,
      pickupOfferVerified: drop.pickupOfferVerified === true,
      orderabilityOfferVerified: drop.orderabilityOfferVerified === true,
      deliveryOfferVerified: drop.deliveryOfferVerified === true,
      integratedCartVerified: drop.integratedCartVerified === true,
      runtimeStoreId: drop.runtimeStoreId || null,
      fulfillmentGuaranteed: drop.fulfillmentGuaranteed === true,
      warehouseQty: drop.warehouseQty || 0,
      price: drop.price || 0,
      confidence: drop.confidence,
      policyMode: drop.policyMode,
      inventorySemantics: safeString(drop.inventorySemantics, 700),
      reason: drop.state === 'CA'
        ? 'Current first-party binary retailer orderability plus separately verified pickup/collection policy eligible for San Diego member matching.'
        : metroBaseline
          ? 'Current identity-bound New York City or Denver Metro retailer availability eligible for conservative on-site matching; verify pickup before driving.'
        : binaryRetailerOrderability
          ? 'Current first-party binary retailer orderability eligible for on-site matching; exact quantity is not published.'
        : 'Current source-backed store-level drop eligible for member alert matching.',
      evidence: safeString(drop.evidence, 700)
      });
    });
}

function buildRegionalWatchAlertsFromDrops(drops) {
  return (drops || [])
    .filter((drop) => drop && drop.canAlertAsWatch && !drop.canAlertAsInventory)
    .filter((drop) => ['board_county', 'board_warehouse', 'store_aggregate'].includes(String(drop.locationPrecision || '')))
    .filter((drop) => dropAgeHours(drop) <= 168)
    .filter((drop) => Number(drop.quantity || 0) + Number(drop.warehouseQty || 0) > 0)
    .filter((drop) => ['unicorn', 'allocated', 'limited'].includes(String(drop.tier || '')))
    .filter((drop) => /shipment|warehouse|limited_release_store_drop/i.test(String(drop.type || drop.eventType || '')))
    .sort(alertDropSort)
    .map((drop) => ({
      id: stableId(['regional_watch_alert', drop.id || drop.state, drop.canonicalId || drop.bottleName, drop.locationPrecision, drop.locationName, drop.quantity || 0, drop.warehouseQty || 0]),
      action: 'watch_alert_candidate',
      score: drop.tier === 'unicorn' ? 145 : drop.tier === 'allocated' ? 130 : 108,
      reliabilityScore: drop.tier === 'unicorn' ? 90 : drop.tier === 'allocated' ? 86 : 80,
      eligibleForDelivery: true,
      eligibleForOnSite: true,
      eligibleForEmail: ['unicorn', 'allocated'].includes(String(drop.tier || '')),
      eligibleForSms: String(drop.tier || '') === 'unicorn',
      actionabilityClass: 'board_or_county_lead',
      priorityClass: drop.tier === 'limited' ? 'standard' : 'major',
      deliveryChannel: 'watch_candidate',
      sendRecommendation: 'send_to_matching_testers',
      signalAt: dropSignalAt(drop),
      freshnessHours: Number(dropAgeHours(drop).toFixed(2)),
      bootstrap: false,
      changeType: 'current_regional_watch_signal',
      dedupeKey: stableId(['regional_watch_alert', drop.state, drop.canonicalId || drop.bottleName, drop.locationPrecision, drop.locationName, drop.quantity || 0, drop.warehouseQty || 0]),
      matchKey: stableId([drop.state, drop.canonicalId || drop.bottleName, drop.locationPrecision, drop.locationName || 'regional']),
      gates: ['current_public_drop', 'regional_watch', 'positive_quantity'],
      blockers: [],
      cautions: ['regional_not_store_level', 'verify_before_driving'],
      state: drop.state,
      bottle: drop.bottleName || drop.canonicalName,
      tier: drop.tier,
      eventType: drop.type,
      source: drop.source,
      sourceUrl: drop.sourceUrl,
      locationPrecision: drop.locationPrecision,
      locationName: drop.locationName,
      storeName: drop.storeName,
      storeAddress: drop.storeAddress,
      quantity: drop.quantity || 0,
      availabilityStatus: drop.availabilityStatus,
      availabilityLabel: drop.availabilityLabel,
      warehouseQty: drop.warehouseQty || 0,
      price: drop.price || 0,
      confidence: drop.confidence,
      policyMode: drop.policyMode,
      inventorySemantics: safeString(drop.inventorySemantics, 700),
      reason: 'Current source-backed regional shipment/warehouse signal eligible for member watch alert matching.',
      evidence: safeString(drop.evidence, 700)
    }));
}

function buildHistoricalTrends(historicalSignals, currentSignals, bible) {
  const byKey = new Map();
  for (const signal of historicalSignals || []) {
    if (signal?.archivedSourceAlertBlocked === true || signal?.raw?.archivedSourceAlertBlocked === true) continue;
    if (!isSafePublicSignal(signal)) continue;
    const state = signal.state;
    if (!state) continue;
    const bottle = findBibleRecord(signal, bible)?.canonical || signal.canonicalName || signal.rawName || 'Unknown bottle';
    const source = signal.storeName || signal.locationName || signal.sourceLabel || 'Unknown source';
    const key = [state, bottle, source].join('|');
    const cur = byKey.get(key) || {
      state,
      bottleName: bottle,
      source,
      locationPrecision: signal.locationPrecision || null,
      inventoryObservations: 0,
      watchObservations: 0,
      positiveQuantities: 0,
      firstObservedAt: null,
      lastObservedAt: null,
      sampleSignalIds: []
    };
    const observedAt = signal.observedAt || signal.fetchedAt || null;
    if (signalCanAlertAsInventory(signal) || /store_inventory|warehouse_stock|shipment_snapshot/i.test(String(signal.eventType || ''))) cur.inventoryObservations += 1;
    if (signalCanAlertAsWatch(signal) || /release|lottery|allocated|barrel|event/i.test(String(signal.eventType || ''))) cur.watchObservations += 1;
    if (Number(signal.quantity || signal.storeQty || 0) > 0) cur.positiveQuantities += 1;
    if (observedAt && (!cur.firstObservedAt || observedAt < cur.firstObservedAt)) cur.firstObservedAt = observedAt;
    if (observedAt && (!cur.lastObservedAt || observedAt > cur.lastObservedAt)) cur.lastObservedAt = observedAt;
    if (cur.sampleSignalIds.length < 5) cur.sampleSignalIds.push(signal.key || signal.id || signal.sourceSignalId || null);
    byKey.set(key, cur);
  }
  return [...byKey.values()]
    .filter((trend) => trend.inventoryObservations + trend.watchObservations >= 2 || trend.positiveQuantities >= 2)
    .map((trend) => ({
      ...trend,
      observationCount: trend.inventoryObservations + trend.watchObservations,
      current: (currentSignals || []).some((signal) => signal.state === trend.state && (signal.canonicalName === trend.bottleName || signal.rawName === trend.bottleName) && (signal.storeName || signal.locationName || signal.sourceLabel) === trend.source),
      trendLabel: trend.inventoryObservations >= 2 ? 'repeated_inventory_or_shipment_signal' : 'repeated_release_watch_signal'
    }))
    .sort((a, b) => b.positiveQuantities - a.positiveQuantities || b.observationCount - a.observationCount || String(b.lastObservedAt || '').localeCompare(String(a.lastObservedAt || '')))
    .slice(0, 100);
}

function stateCoverageTier(state) {
  const lifecycle = getStateLifecycle(state.state);
  if (lifecycle?.coverageTier) return lifecycle.coverageTier;
  if (state.coverageTier) return state.coverageTier;
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

function stateCoverageTesterValue(coverageTier) {
  if (coverageTier === 'live_store_inventory') return 'Live/store inventory where public source permits.';
  if (coverageTier === 'sparse_live_store_inventory') return 'Sparse exact-store orderability from reviewed first-party retailers; verify before driving.';
  if (coverageTier === 'store_availability_status') return 'Official store availability status; verify before driving.';
  if (coverageTier === 'store_delivery_leads') return 'Official delivery/allocation leads; useful leads, not live shelf stock.';
  if (coverageTier === 'aggregate_inventory_watch') return 'Aggregate inventory, warehouse, or program-watch data; useful context, not exact store shelf stock.';
  if (coverageTier === 'distillery_release_watch') return 'Official distillery gift-shop drops and release-watch pages; distinct from retailer store inventory.';
  if (coverageTier === 'store_location_watch') return 'Licensed store/location coverage and retailer-watch infrastructure; useful for routing users, not bottle inventory yet.';
  if (coverageTier === 'shipment_drop_intelligence') return 'Shipment, warehouse, board, or release intelligence; useful leads but not exact shelf stock.';
  if (coverageTier === 'catalog_watch') return 'Catalog, product, price, brand, or license-document watch; useful context, not inventory.';
  return 'Policy/source-discovery only.';
}

function buildStateCoverage(summary, options = {}) {
  const stateFilter = options.stateFilter || null;
  const states = (summary.states || [])
    .filter((state) => !stateFilter || stateFilter.has(state.state))
    .map((state) => {
      const lifecycle = getStateLifecycle(state.state);
      const coverageTier = stateCoverageTier(state);
      return {
        state: state.state,
        label: lifecycle?.customerLabel || state.label,
        sourceLabel: lifecycle?.sourceLabel || state.sourceLabel || state.label,
        tier: state.tier,
        status: state.status,
        publicStatus: lifecycle?.publicStatus || state.publicStatus || null,
        lifecycle: lifecycle?.lifecycle || state.lifecycle || null,
        signalCount: state.signalCount || 0,
        roadblockCount: state.roadblockCount || 0,
        targetLocationPrecision: state.targetLocationPrecision || null,
        bestLocationPrecision: state.bestLocationPrecision || null,
        strategy: state.strategy || null,
        refinementLevel: lifecycle?.refinementLevel || state.refinementLevel || null,
        customerAreaLabel: lifecycle?.customerAreaLabel || state.customerAreaLabel || null,
        areaOptions: lifecycle?.areaOptions || [],
        customerSummary: lifecycle?.customerSummary || state.customerSummary || null,
        coverageTier
      };
    });
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
    testerValue: stateCoverageTesterValue(state.coverageTier),
    customerAreaLabel: state.customerAreaLabel || null,
    customerSummary: state.customerSummary || null
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

  const rawSignals = (snapshot.signals || [])
    .filter((signal) => SITE_ACTIVE_STATE_IDS.has(signal.state))
    .map(enforceArchivedSourceAlertPolicy);
  const activeStateIds = SITE_ACTIVE_STATE_IDS;
  const activeOfficialLocations = (officialLocationBible.locations || []).filter((location) => activeStateIds.has(location.state));
  const signals = enrichNcSingleStoreShipmentSignals(rawSignals, activeOfficialLocations);
  const activeOfficialSourceReports = (officialLocationBible.sourceReports || []).filter((report) => !report.state || activeStateIds.has(report.state));
  const historicalSignals = uniqueHistoricalSignals(snapshots, signals)
    .filter((signal) => activeStateIds.has(signal.state))
    .map(enforceArchivedSourceAlertPolicy);
  const bottles = buildBottles(signals, bible, biblePayload.records || []);
  const stores = buildStores(signals);
  const locations = buildLocationBible(signals, activeOfficialLocations);
  const candidateDrops = buildDrops(historicalSignals, bible, signals);
  const currentDrops = buildDrops(signals, bible, signals);
  const previousDrops = await readJson(path.join(SITE_OUT, 'drops.json'), []);
  const previousStateQuality = await readJson(path.join(SITE_OUT, 'state-quality.json'), null);
  const detectedFallbackStateIds = detectDropCollapseFallbacks(previousStateQuality, currentDrops, summary.attemptedStateIds || []);
  const tennesseeStateReport = detectedFallbackStateIds.includes('TN')
    ? await readJson(path.join(OUT, 'states', 'TN.json'), null)
    : null;
  const tennesseePartialFallbackStateIds = detectedFallbackStateIds.includes('TN')
    && (summary.attemptedStateIds || []).includes('TN')
    && canPublishTennesseePartialEvidenceFallback({
      stateReport: tennesseeStateReport,
      drops: currentDrops.filter((drop) => String(drop.state || drop.state_code || '').toUpperCase() === 'TN'),
    })
      ? ['TN']
      : [];
  const partialFallbackStateIds = [...new Set([
    ...(summary.partialFallbackStateIds || []).map((state) => String(state).toUpperCase()),
    ...tennesseePartialFallbackStateIds,
  ])].sort();
  const fullFallbackStateIds = detectedFallbackStateIds.filter((state) => !partialFallbackStateIds.includes(state));
  if (process.env.BOURBON_SIGNAL_DEBUG_PARTIAL_REFRESH === '1') {
    const debugCounts = Object.fromEntries([...new Set((summary.attemptedStateIds || []).map((state) => String(state).toUpperCase()))].map((state) => [state, currentDrops.filter((drop) => String(drop.state || drop.state_code || '').toUpperCase() === state).length]));
    console.warn(JSON.stringify({ attemptedStateIds: summary.attemptedStateIds, previousDropCounts: Object.fromEntries((previousStateQuality?.states || []).map((state) => [state.state, state.dropCount ?? state.input?.dropCount ?? 0])), currentDropCounts: debugCounts, detectedFallbackStateIds }));
  }
  if (fullFallbackStateIds.length) console.warn(`Site export preserved last-good customer lanes after drop collapse: ${fullFallbackStateIds.join(', ')}`);
  if (partialFallbackStateIds.length) console.warn(`Site export published bounded current evidence and retained missing prior rows as stale context: ${partialFallbackStateIds.join(', ')}`);
  summary.fallbackStateIds = [...new Set([...(summary.fallbackStateIds || []), ...fullFallbackStateIds])].sort();
  summary.partialFallbackStateIds = partialFallbackStateIds;
  const fallbackStateIds = new Set(summary.fallbackStateIds);
  const drops = mergePartialRefreshDrops({
    previousDrops,
    currentDrops: candidateDrops,
    partialRefresh: summary.partialRefresh === true,
    attemptedStateIds: summary.attemptedStateIds || [],
    fallbackStateIds: summary.fallbackStateIds,
    partialFallbackStateIds: summary.partialFallbackStateIds,
    isSafePartialRetainedRow: (drop) => String(drop.state || drop.state_code || '').toUpperCase() !== 'TN'
      || isTennesseeRetailerSignalIdentity(drop),
  });
  const events = buildEvents(historicalSignals, bible);
  const alertableCurrentDrops = currentDrops.filter((drop) => !fallbackStateIds.has(String(drop.state || drop.state_code || '').toUpperCase()));
  const reportedAlertCandidates = buildAlerts({ candidates: (alerts.candidates || []).filter((candidate) => activeStateIds.has(candidate.state) && !fallbackStateIds.has(String(candidate.state).toUpperCase())) });
  const currentInventoryAlertCandidates = buildCurrentInventoryAlertsFromDrops(alertableCurrentDrops);
  const regionalWatchAlertCandidates = buildRegionalWatchAlertsFromDrops(alertableCurrentDrops);
  const alertCandidates = uniqueBy([...reportedAlertCandidates, ...regionalWatchAlertCandidates, ...currentInventoryAlertCandidates].map(applyAlertPolicyToCandidate), (candidate) => candidate.dedupeKey || candidate.id)
    .filter((candidate) => candidate.eligibleForDelivery)
    .sort(alertCandidateSort);
  const cappedAlertCandidates = capAlertCandidatesByState(alertCandidates, 1000, 200);
  const historicalTrends = buildHistoricalTrends(historicalSignals, signals, bible);
  const generatedAt = new Date().toISOString();
  const engineGeneratedAt = summary.generatedAt || snapshot.generatedAt || generatedAt;
  const runIdentity = {
    runId: stableId(['site-export', engineGeneratedAt, generatedAt, signals.length]),
    generatedAt,
    engineGeneratedAt,
  };
  const previousStats = await readJson(path.join(SITE_OUT, 'stats.json'), {});
  const summaryStatesById = new Map((summary.states || []).filter((state) => activeStateIds.has(state.state)).map((state) => [state.state, state]));
  const activeSummaryStates = [...activeStateIds].map((stateId) => summaryStatesById.get(stateId) || {
    state: stateId,
    label: getStateLifecycle(stateId)?.customerLabel || stateId,
    sourceLabel: getStateLifecycle(stateId)?.sourceLabel || stateId,
    tier: null,
    status: 'awaiting_current_source_run',
    stale: false,
    sourceCount: 0,
    signalCount: 0,
    roadblockCount: 0,
    targetLocationPrecision: null,
    bestLocationPrecision: null,
    strategy: getStateLifecycle(stateId)?.lifecycle || null,
    publicStatus: getStateLifecycle(stateId)?.publicStatus || null,
    lifecycle: getStateLifecycle(stateId)?.lifecycle || null,
    coverageTier: getStateLifecycle(stateId)?.coverageTier || null,
    refinementLevel: getStateLifecycle(stateId)?.refinementLevel || null,
    customerAreaLabel: getStateLifecycle(stateId)?.customerAreaLabel || null,
    customerSummary: getStateLifecycle(stateId)?.customerSummary || null
  });
  const stateCoverage = buildStateCoverage({ ...summary, states: activeSummaryStates }, { stateFilter: activeStateIds });
  const southeastReadiness = buildSoutheastReadiness({ ...summary, states: activeSummaryStates }, signals);
  const stateQualityInputs = buildStateQualityInputs({ stateCoverage, drops: currentDrops, alerts: cappedAlertCandidates });
  const candidateStateQuality = buildStateQualityScorecard(stateQualityInputs, { generatedAt });
  const qualityFallbackStateIds = [...new Set(summary.fallbackStateIds || [])].sort();
  const qualitySummary = { ...summary, fallbackStateIds: qualityFallbackStateIds };
  let stateQuality = mergePartialRefreshStateQuality(previousStateQuality, candidateStateQuality, qualitySummary);
  if (partialFallbackStateIds.length) {
    const currentByState = new Map((candidateStateQuality.states || []).map((state) => [String(state.state).toUpperCase(), state]));
    stateQuality = {
      ...stateQuality,
      partialFallbackStateIds,
      states: (stateQuality.states || []).map((state) => {
        const stateId = String(state.state).toUpperCase();
        if (!partialFallbackStateIds.includes(stateId)) return state;
        const current = currentByState.get(stateId);
        return {
          ...state,
          status: 'partial_fallback_current_plus_stale',
          partialFallback: true,
          currentScore: current?.score ?? null,
          currentInput: current?.input ?? null,
        };
      }),
    };
  }
  const comparisonFallbackStateIds = [...new Set([
    ...qualityFallbackStateIds,
    ...partialFallbackStateIds,
  ])].sort();
  const comparisonAttemptedStateIds = (summary.attemptedStateIds || [])
    .map((state) => String(state).toUpperCase())
    .filter((state) => !comparisonFallbackStateIds.includes(state));
  const comparisonSummary = {
    ...summary,
    attemptedStateIds: comparisonAttemptedStateIds,
    fallbackStateIds: comparisonFallbackStateIds,
  };
  const attemptedQualityStates = summary.partialRefresh === true
    ? new Set(comparisonAttemptedStateIds)
    : null;
  const scopedStateQuality = scopeStateQualityForRefresh(stateQuality, comparisonSummary);
  const comparableStateQuality = partialFallbackStateIds.length
    ? {
        ...scopedStateQuality,
        states: (scopedStateQuality.states || []).filter((state) =>
          !partialFallbackStateIds.includes(String(state.state).toUpperCase())),
      }
    : scopedStateQuality;
  const stateQualityRegression = previousStateQuality?.schemaVersion === stateQuality.schemaVersion
    ? compareStateQuality(previousStateQuality, comparableStateQuality)
    : { ok: true, failures: [], warnings: ['State-quality baseline schema changed; recording a current-snapshot baseline.'] };
  if (attemptedQualityStates) {
    stateQualityRegression.warnings.push(`Partial refresh quality comparison limited to attempted states: ${[...attemptedQualityStates].sort().join(', ') || 'none'}.`);
  }
  stateQuality.regression = stateQualityRegression;
  stateQuality.runId = runIdentity.runId;
  stateQuality.engineGeneratedAt = runIdentity.engineGeneratedAt;
  if (!stateQualityRegression.ok && process.env.BOURBON_SIGNAL_ALLOW_STATE_QUALITY_REGRESSION !== '1') {
    throw new Error(`State quality regression blocked site export: ${stateQualityRegression.failures.join(' ')}`);
  }
  const historicalSignalCount = Math.max(historicalSignals.length, Number(previousStats.historicalSignalCount || 0));
  const ncBoardCoverageSummary = buildNcBoardCoverageSummary(activeOfficialLocations, ncIntelligenceRaw);
  const ncSourceLedger = buildNcSourceLedger(activeOfficialLocations, ncIntelligenceRaw);
  const stats = {
    contractVersion: CONTRACT_VERSION,
    ...runIdentity,
    stateCount: activeSummaryStates.length,
    signalCount: signals.length,
    historicalSignalCount,
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
    historicalTrendCount: historicalTrends.length,
    alertCandidateCount: cappedAlertCandidates.length,
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
    statesAtTargetPrecision: activeSummaryStates.filter((state) => precisionRank(state.bestLocationPrecision || 'blocked') >= precisionRank(state.targetLocationPrecision || 'blocked')).length,
    rareStatesVerified: Array.isArray(rare.states) ? rare.states.filter((s) => s.status === 'verified_3_rare_signals').length : null,
    stateCoverage,
    stateQuality: stateQuality.summary,
    southeastReadiness,
    ncBoardIntelligence: ncBoardCoverageSummary,
    locationBibleSources: activeOfficialSourceReports,
    historicalTrends: historicalTrends.slice(0, 25),
    sourceCaveat: 'Standalone engine export only. Candidate alerts are not sent to users until app integration and alert policy are explicitly enabled.'
  };

  const manifest = {
    contractVersion: CONTRACT_VERSION,
    ...runIdentity,
    files: {
      stats: 'stats.json',
      bottles: 'bottles.json',
      stores: 'stores.json',
      locations: 'locations.json',
      drops: 'drops.json',
      stateDrops: 'states/index.json',
      events: 'events.json',
      alerts: 'alerts.json',
      stateQuality: 'state-quality.json',
      historicalTrends: 'historical-trends.json',
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
      alert: Object.keys(cappedAlertCandidates[0] || {}),
      historicalTrend: Object.keys(historicalTrends[0] || {})
    }
  };

  const stateDropPartitions = buildStateDropPartitions(drops, {
    contractVersion: CONTRACT_VERSION,
    generatedAt,
    activeStates: [...activeStateIds],
  });
  Object.assign(stateDropPartitions.index, runIdentity);
  for (const payload of stateDropPartitions.payloads.values()) Object.assign(payload, runIdentity);
  const partitionVerification = verifyStateDropPartitions(drops, stateDropPartitions);
  if (!partitionVerification.ok) {
    throw new Error(`State drop partition verification failed: ${partitionVerification.errors.join(' ')}`);
  }
  manifest.statePartitions = stateDropPartitions.index.states;

  const artifactPayloads = {
    manifest,
    stats,
    bottles: attachRunIdentity({ contractVersion: CONTRACT_VERSION, count: bottles.length, bottles }, runIdentity),
    stores: attachRunIdentity({ contractVersion: CONTRACT_VERSION, count: stores.length, stores }, runIdentity),
    locations: attachRunIdentity({ contractVersion: CONTRACT_VERSION, count: locations.length, locations }, runIdentity),
    drops: attachRunIdentity({ contractVersion: CONTRACT_VERSION, count: drops.length, drops }, runIdentity),
    events: attachRunIdentity({ contractVersion: CONTRACT_VERSION, count: events.length, events }, runIdentity),
    alerts: attachRunIdentity({ contractVersion: CONTRACT_VERSION, count: cappedAlertCandidates.length, alerts: cappedAlertCandidates }, runIdentity),
    stateQuality,
    historicalTrends: attachRunIdentity({ contractVersion: CONTRACT_VERSION, historyDays: HISTORY_DAYS, count: historicalTrends.length, trends: historicalTrends }, runIdentity),
    stateIndex: stateDropPartitions.index,
  };
  if (ncIntelligenceRaw) artifactPayloads.ncIntelligence = attachRunIdentity({ contractVersion: CONTRACT_VERSION, ...ncIntelligenceRaw, sourceLedger: ncSourceLedger }, runIdentity);
  const coherence = verifyRunCoherence(artifactPayloads, runIdentity);
  if (!coherence.ok) throw new Error(`Site artifact run coherence failed: ${coherence.errors.join(' ')}`);

  await rm(path.join(SITE_OUT, 'states'), { recursive: true, force: true });
  await mkdir(path.join(SITE_OUT, 'states'), { recursive: true });
  await writeFile(path.join(SITE_OUT, 'states', 'index.json'), JSON.stringify(stateDropPartitions.index, null, 2));
  for (const [state, payload] of stateDropPartitions.payloads) {
    const stateDir = path.join(SITE_OUT, 'states', state);
    await mkdir(stateDir, { recursive: true });
    await writeFile(path.join(stateDir, 'drops.json'), JSON.stringify(payload, null, 2));
  }
  await writeFile(path.join(SITE_OUT, 'manifest.json'), JSON.stringify(artifactPayloads.manifest, null, 2));
  await writeFile(path.join(SITE_OUT, 'stats.json'), JSON.stringify(artifactPayloads.stats, null, 2));
  await writeFile(path.join(SITE_OUT, 'bottles.json'), JSON.stringify(artifactPayloads.bottles, null, 2));
  await writeFile(path.join(SITE_OUT, 'stores.json'), JSON.stringify(artifactPayloads.stores, null, 2));
  await writeFile(path.join(SITE_OUT, 'locations.json'), JSON.stringify(artifactPayloads.locations, null, 2));
  await writeFile(path.join(SITE_OUT, 'drops.json'), JSON.stringify(artifactPayloads.drops, null, 2));
  await writeFile(path.join(SITE_OUT, 'events.json'), JSON.stringify(artifactPayloads.events, null, 2));
  await writeFile(path.join(SITE_OUT, 'alerts.json'), JSON.stringify(artifactPayloads.alerts, null, 2));
  await writeFile(path.join(SITE_OUT, 'state-quality.json'), JSON.stringify(artifactPayloads.stateQuality, null, 2));
  await writeFile(path.join(SITE_OUT, 'historical-trends.json'), JSON.stringify(artifactPayloads.historicalTrends, null, 2));
  if (artifactPayloads.ncIntelligence) await writeFile(path.join(SITE_OUT, 'nc-intelligence.json'), JSON.stringify(artifactPayloads.ncIntelligence, null, 2));

  console.log(`Site contract export: ${bottles.length} bottles, ${stores.length} stores, ${locations.length} locations, ${drops.length} drops, ${events.length} events, ${cappedAlertCandidates.length} alert candidates -> out/site/`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
