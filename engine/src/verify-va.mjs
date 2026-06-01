import { readFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('out');

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function assert(condition, message, detail = null) {
  if (!condition) {
    const error = new Error(message);
    error.detail = detail;
    throw error;
  }
}

function groupBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item) || 'missing';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

async function main() {
  const snapshot = await readJson(path.join(OUT, 'current-snapshot.json'));
  const drops = await readJson(path.join(OUT, 'site', 'drops.json'));
  const locations = await readJson(path.join(OUT, 'site', 'locations.json'));
  const state = await readJson(path.join(OUT, 'states', 'VA.json'));

  const signals = (snapshot.signals || []).filter((signal) => signal.state === 'VA');
  const vaDrops = (drops.drops || []).filter((drop) => drop.state === 'VA');
  const vaLocations = (locations.locations || []).filter((location) => location.state === 'VA');
  const storeSignals = signals.filter((signal) => signal.locationPrecision === 'store_level');
  const inventorySignals = signals.filter((signal) => signal.canAlertAsInventory);
  const positiveSignals = signals.filter((signal) => signal.eventType === 'store_inventory_result' && Number(signal.quantity || 0) > 0);
  const productCodes = new Set(signals.map((signal) => String(signal.sourceUrl || '').match(/productCode=([^&]+)/)?.[1]).filter(Boolean));
  const canonicalNames = new Set(signals.map((signal) => signal.canonicalName).filter(Boolean));
  const bad1792 = signals.filter((signal) => /1792\s+Small\s+Batch/i.test(String(signal.rawName || '')) && /Full\s+Proof/i.test(String(signal.canonicalName || '')));
  const invalidOriginRoadblocks = (state.roadblocks || []).filter((roadblock) => /No Store exists/i.test(String(roadblock.error || '')));
  const directPage403s = (state.roadblocks || []).filter((roadblock) => Number(roadblock.status) === 403 && /abc\.virginia\.gov\/products/i.test(String(roadblock.url || '')));

  assert(signals.length >= 700, 'VA signal count below definition-of-done threshold', signals.length);
  assert(storeSignals.length >= 700, 'VA store-level signal count below definition-of-done threshold', storeSignals.length);
  assert(inventorySignals.length >= 250, 'VA inventory-alertable signal count below definition-of-done threshold', inventorySignals.length);
  assert(positiveSignals.length >= 250, 'VA positive store inventory signal count below definition-of-done threshold', positiveSignals.length);
  assert(vaDrops.length >= 1000, 'VA site drops below definition-of-done threshold', vaDrops.length);
  assert(vaLocations.length >= 350, 'VA site locations below definition-of-done threshold', vaLocations.length);
  assert(productCodes.size >= 5, 'VA product-code coverage below expanded baseline', [...productCodes]);
  assert(canonicalNames.has('1792 Small Batch'), 'VA 1792 Small Batch canonical identity missing', [...canonicalNames]);
  assert(!canonicalNames.has('1792 Full Proof') || !bad1792.length, 'VA 1792 Small Batch is being misidentified as 1792 Full Proof', bad1792.slice(0, 10));
  assert(!invalidOriginRoadblocks.length, 'VA has stale/invalid store-origin roadblocks', invalidOriginRoadblocks.slice(0, 10));
  assert(directPage403s.length <= 4, 'VA has more direct product-page 403 roadblocks than expected', directPage403s.slice(0, 10));

  console.log(`VA verified: ${signals.length} signals, ${storeSignals.length} store-level, ${inventorySignals.length} inventory-alertable, ${positiveSignals.length} positive inventory, ${vaDrops.length} site drops, ${vaLocations.length} locations, ${productCodes.size} product codes. Event types: ${JSON.stringify(groupBy(signals, (s) => s.eventType))}`);
}

main().catch((error) => {
  console.error(error.message || error);
  if (error.detail) console.error(JSON.stringify(error.detail, null, 2));
  process.exit(1);
});
