import { readFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('out');
const MAX_AGE_HOURS = Number(process.env.PA_STORE_INVENTORY_MAX_AGE_HOURS || 72);

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
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

  const signals = (snapshot.signals || []).filter((signal) => signal.state === 'PA');
  const storeSignals = signals.filter((signal) => signal.eventType === 'store_inventory_result' && signal.locationPrecision === 'store_level');
  const inventorySignals = storeSignals.filter((signal) => signal.canAlertAsInventory && Number(signal.quantity || 0) > 0);
  const drops = (dropsPayload.drops || []).filter((drop) => drop.state === 'PA');
  const exactDrops = drops.filter((drop) => drop.type === 'store_inventory_result' && drop.locationPrecision === 'store_level');
  const stores = (storesPayload.stores || []).filter((store) => store.state === 'PA');
  const locations = (locationsPayload.locations || []).filter((location) => location.state === 'PA');
  const staleExactDrops = exactDrops.filter((drop) => ageHours(drop.observedAt) > MAX_AGE_HOURS);
  const staleDisplayExactDrops = exactDrops.filter((drop) => ageHours(drop.displayAt || drop.observedAt) > MAX_AGE_HOURS || drop.timestampBasis !== 'last_confirmed_at');
  const missingStoreIds = exactDrops.filter((drop) => !drop.storeId);
  const storeIds = new Set(stores.map((store) => String(store.id)).filter(Boolean));
  const unmatchedDropStores = exactDrops.filter((drop) => drop.storeId && !storeIds.has(String(drop.storeId)));

  assert(fwgs.summary?.positiveInventoryRowCount >= 1000, 'FWGS browser artifact has too few positive PA inventory rows.', fwgs.summary);
  assert(ageHours(fwgs.generatedAt) <= MAX_AGE_HOURS, 'FWGS browser artifact is stale.', { generatedAt: fwgs.generatedAt, maxAgeHours: MAX_AGE_HOURS });
  assert(storeSignals.length >= 1000, 'PA store-level signal count is below threshold.', storeSignals.length);
  assert(inventorySignals.length >= 1000, 'PA inventory-alertable signal count is below threshold.', inventorySignals.length);
  assert(exactDrops.length >= 1000, 'PA site exact-store drop count is below threshold.', exactDrops.length);
  assert(stores.length >= 450, 'PA site store count is below threshold.', stores.length);
  assert(locations.length >= stores.length, 'PA locations should include at least all PA stores.', { stores: stores.length, locations: locations.length });
  assert(!staleExactDrops.length, 'PA exact-store user-facing drops include stale inventory.', staleExactDrops.slice(0, 10));
  assert(!staleDisplayExactDrops.length, 'PA exact-store drops must display last-confirmed freshness, not first-seen age.', staleDisplayExactDrops.slice(0, 10));
  assert(!missingStoreIds.length, 'PA exact-store drops are missing storeId needed for dashboard store targeting.', missingStoreIds.slice(0, 10));
  assert(!unmatchedDropStores.length, 'PA exact-store drops reference store ids not present in stores export.', unmatchedDropStores.slice(0, 10));

  console.log(`PA verification passed: ${inventorySignals.length} alertable store signals, ${exactDrops.length} exact-store drops, ${stores.length} stores, FWGS artifact ${fwgs.generatedAt}.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
