import { readFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('out');
const MAX_AGE_HOURS = Number(process.env.PA_STORE_INVENTORY_MAX_AGE_HOURS || 72);
const ALLOW_SAFE_STALE_FALLBACK = process.argv.includes('--allow-safe-stale-fallback');

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (arguments.length > 1) return fallback; throw error; }
}

function assert(condition, message, details) {
  if (condition) return;
  const suffix = details === undefined ? '' : `\n${JSON.stringify(details, null, 2).slice(0, 2000)}`;
  throw new Error(`${message}${suffix}`);
}

function ageHours(iso) {
  const time = new Date(iso || 0).getTime();
  if (!Number.isFinite(time)) return Infinity;
  return (Date.now() - time) / 36e5;
}

async function main() {
  const snapshot = await readJson(path.join(OUT, 'current-snapshot.json'));
  const dropsPayload = await readJson(path.join(OUT, 'site', 'drops.json'));
  const storesPayload = await readJson(path.join(OUT, 'site', 'stores.json'));
  const locationsPayload = await readJson(path.join(OUT, 'site', 'locations.json'));
  const fwgs = await readJson(path.join(OUT, 'browser', 'fwgs-store-inventory.json'));
  const browserRefreshStatus = await readJson(path.join(OUT, 'browser-refresh-status.json'), null);
  const siteRefreshStatus = await readJson(path.join(OUT, 'site-refresh-status.json'), null);
  const stateReport = await readJson(path.join(OUT, 'states', 'PA.json'), null);

  const signals = (snapshot.signals || []).filter((signal) => signal.state === 'PA');
  const storeSignals = signals.filter((signal) => signal.eventType === 'store_inventory_result' && signal.locationPrecision === 'store_level');
  const inventorySignals = storeSignals.filter((signal) => signal.canAlertAsInventory && Number(signal.quantity || 0) > 0);
  const drops = (dropsPayload.drops || []).filter((drop) => drop.state === 'PA');
  const exactDrops = drops.filter((drop) => drop.type === 'store_inventory_result' && drop.locationPrecision === 'store_level');
  const stores = (storesPayload.stores || []).filter((store) => store.state === 'PA');
  const locations = (locationsPayload.locations || []).filter((location) => location.state === 'PA');
  const staleExactDrops = exactDrops.filter((drop) => ageHours(drop.observedAt) > MAX_AGE_HOURS);
  const falseFreshExactDrops = exactDrops.filter((drop) => drop.firstSeenAt && drop.lastConfirmedAt && drop.firstSeenAt !== drop.lastConfirmedAt && (drop.displayAt === drop.lastConfirmedAt || drop.timestampBasis === 'last_confirmed_at'));
  const missingStoreIds = exactDrops.filter((drop) => !drop.storeId);
  const storeIds = new Set(stores.map((store) => String(store.id)).filter(Boolean));
  const unmatchedDropStores = exactDrops.filter((drop) => drop.storeId && !storeIds.has(String(drop.storeId)));
  const coordinateInPennsylvania = (lat, lng) => {
    if (lat == null || lng == null) return true;
    const numericLat = Number(lat);
    const numericLng = Number(lng);
    if (!Number.isFinite(numericLat) || !Number.isFinite(numericLng)) return false;
    return numericLat >= 39 && numericLat <= 43 && numericLng >= -81 && numericLng <= -74;
  };
  const badStoreCoordinates = stores.filter((store) => !coordinateInPennsylvania(store.lat, store.lng));
  const badDropCoordinates = exactDrops.filter((drop) => !coordinateInPennsylvania(drop.lat, drop.lng));
  const licenseeServiceCenterDrops = exactDrops.filter((drop) => /LICENSEE SERVICE CENTER/i.test(`${drop.storeName || ''} ${drop.locationName || ''}`));
  const licenseeServiceCenterAlerts = inventorySignals.filter((signal) => /LICENSEE SERVICE CENTER/i.test(`${signal.storeName || ''} ${signal.locationName || ''}`) && signal.canAlertAsInventory);
  const safeFallback = ALLOW_SAFE_STALE_FALLBACK
    && stateReport?.stale === true
    && /^stale_useful_retained_/.test(String(stateReport?.status || ''))
    && Boolean(String(stateReport?.staleReason || '').trim());
  const retainedSignals = Array.isArray(stateReport?.signals) ? stateReport.signals : [];
  const unsafeRetainedSignals = retainedSignals.filter((signal) => signal.stale !== true || signal.canAlertAsInventory || signal.canAlertAsWatch);
  const unsafeFallbackDrops = exactDrops.filter((drop) => drop.canAlertAsInventory || drop.canAlertAsWatch);

  assert(fwgs.summary?.positiveInventoryRowCount >= 1000, 'FWGS browser artifact has too few positive PA inventory rows.', fwgs.summary);
  assert((fwgs.summary?.searchTermCount || fwgs.searchTerms?.length || 0) >= 30, 'FWGS PA search term mesh is too narrow for shipment-week unicorn/allocated discovery.', fwgs.summary);
  assert((fwgs.summary?.positiveInventoryProductCount || new Set((fwgs.inventoryRows || []).map((row) => row.product?.sku).filter(Boolean)).size) >= 10, 'FWGS PA positive inventory product coverage is too narrow.', fwgs.summary);
  assert(Number(fwgs.summary?.invalidCoordinateCount || 0) === 0, 'FWGS browser artifact has invalid PA coordinates after normalization.', fwgs.summary);
  assert(ageHours(fwgs.generatedAt) <= MAX_AGE_HOURS, 'FWGS browser artifact is stale.', { generatedAt: fwgs.generatedAt, maxAgeHours: MAX_AGE_HOURS });
  const paRefresh = (browserRefreshStatus?.results || []).find((result) => result.id === 'pa-fwgs');
  assert(!ALLOW_SAFE_STALE_FALLBACK || safeFallback || (!paRefresh || (['refreshed', 'fresh_artifact_reused'].includes(paRefresh.status) && !paRefresh.preservedPreviousArtifact)), 'PA scheduled fallback must be an explicitly stale, reason-labeled retained state report.', { status: stateReport?.status, stale: stateReport?.stale, staleReason: stateReport?.staleReason, paRefresh });
  assert(safeFallback || !paRefresh || (['refreshed', 'fresh_artifact_reused'].includes(paRefresh.status) && !paRefresh.preservedPreviousArtifact), 'PA browser refresh status indicates a failed/preserved FWGS artifact.', paRefresh);
  const latestScheduledAttemptMs = Date.parse(siteRefreshStatus?.lastBrowserAttemptAt || '');
  const latestSuccessfulFwgsMs = Math.max(
    Date.parse(siteRefreshStatus?.lastBrowserRefreshAt || '') || 0,
    Date.parse(fwgs.generatedAt || '') || 0,
  );
  assert(safeFallback || !Number.isFinite(latestScheduledAttemptMs) || latestSuccessfulFwgsMs >= latestScheduledAttemptMs, 'Latest scheduled FWGS browser attempt failed or preserved an older artifact.', {
    lastBrowserAttemptAt: siteRefreshStatus?.lastBrowserAttemptAt || null,
    lastBrowserRefreshAt: siteRefreshStatus?.lastBrowserRefreshAt || null,
    artifactGeneratedAt: fwgs.generatedAt || null,
    warnings: siteRefreshStatus?.warnings || [],
  });
  assert(storeSignals.length >= 1000, 'PA store-level signal count is below threshold.', storeSignals.length);
  if (safeFallback) {
    assert(retainedSignals.length >= 1000, 'PA retained fallback signal count is below threshold.', retainedSignals.length);
    assert(!unsafeRetainedSignals.length, 'PA retained fallback signals must all be stale and non-alertable.', unsafeRetainedSignals.slice(0, 10));
    assert(!unsafeFallbackDrops.length, 'PA retained fallback drops must not be alertable.', unsafeFallbackDrops.slice(0, 10));
  } else {
    assert(inventorySignals.length >= 1000, 'PA inventory-alertable signal count is below threshold.', inventorySignals.length);
  }
  assert(exactDrops.length >= 1000, 'PA site exact-store drop count is below threshold.', exactDrops.length);
  assert(stores.length >= 450, 'PA site store count is below threshold.', stores.length);
  assert(locations.length >= stores.length, 'PA locations should include at least all PA stores.', { stores: stores.length, locations: locations.length });
  if (!safeFallback) assert(!staleExactDrops.length, 'PA exact-store user-facing drops include stale inventory.', staleExactDrops.slice(0, 10));
  assert(!falseFreshExactDrops.length, 'PA exact-store drops must not re-report unchanged inventory as fresh.', falseFreshExactDrops.slice(0, 10));
  assert(!missingStoreIds.length, 'PA exact-store drops are missing storeId needed for dashboard store targeting.', missingStoreIds.slice(0, 10));
  assert(!unmatchedDropStores.length, 'PA exact-store drops reference store ids not present in stores export.', unmatchedDropStores.slice(0, 10));
  assert(!badStoreCoordinates.length, 'PA stores include coordinates outside Pennsylvania bounds, often caused by swapped FWGS lat/lng fields.', badStoreCoordinates.slice(0, 10));
  assert(!badDropCoordinates.length, 'PA exact-store drops include coordinates outside Pennsylvania bounds, often caused by swapped FWGS lat/lng fields.', badDropCoordinates.slice(0, 10));
  assert(!licenseeServiceCenterDrops.some((drop) => drop.canAlertAsInventory), 'PA Licensee Service Center rows must not be consumer inventory-alertable.', licenseeServiceCenterDrops.slice(0, 10));
  assert(!licenseeServiceCenterAlerts.length, 'PA Licensee Service Center signals must not be inventory-alertable.', licenseeServiceCenterAlerts.slice(0, 10));

  console.log(`PA verification passed: ${inventorySignals.length} alertable store signals, ${exactDrops.length} exact-store drops, ${stores.length} stores, FWGS artifact ${fwgs.generatedAt}, coordinate swaps ${fwgs.summary?.swappedCoordinateCount || 0}.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
