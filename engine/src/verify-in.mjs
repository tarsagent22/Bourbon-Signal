import { readFile } from 'node:fs/promises';

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const state = await readJson('out/states/IN.json');
const artifact = await readJson('out/browser/IN-atc-package-stores.json');
const storesExport = await readJson('out/site/stores.json').catch(() => ({ stores: [] }));
const locationsExport = await readJson('out/site/locations.json').catch(() => ({ locations: [] }));
const dropsExport = await readJson('out/site/drops.json').catch(() => ({ drops: [] }));

const permitSignals = (state.signals || []).filter((signal) => signal.eventType === 'licensed_package_store_location');
const permitNumbers = new Set(permitSignals.map((signal) => signal.storeId).filter(Boolean));
const activePackageStoreSignals = permitSignals.filter((signal) => /package store/i.test(String(signal.raw?.permit?.licenseType || '')) && /active/i.test(String(signal.raw?.permit?.status || '')));
const cities = new Set(permitSignals.map((signal) => signal.city).filter(Boolean));
const zips = new Set(permitSignals.map((signal) => signal.postalCode || signal.zip).filter(Boolean));
const alertablePermitSignals = permitSignals.filter((signal) => signal.canAlertAsInventory || signal.canAlertAsWatch || signal.canonicalBottleId || signal.canonicalName);
const inStores = (storesExport.stores || []).filter((store) => store.state === 'IN');
const inLocations = (locationsExport.locations || []).filter((location) => location.state === 'IN');
const inDrops = (dropsExport.drops || []).filter((drop) => drop.state === 'IN');
const atcDrops = inDrops.filter((drop) => /ATC|permit/i.test(String(drop.source || '') + ' ' + String(drop.type || '')));
const retailerWatchDrops = inDrops.filter((drop) => drop.type === 'retailer_allocated_raffle_item' && /Bourbon World|Big Red/i.test(String(drop.source || '')));
const unsafeDrops = inDrops.filter((drop) => drop.type !== 'retailer_allocated_raffle_item');

assert(state.status === 'useful' || state.status === 'reachable_needs_deeper_parser', `Unexpected IN state status: ${state.status}`);
assert(artifact.storeCount >= 900, `Expected at least 900 active Indiana package-store permits; got ${artifact.storeCount}`);
assert(artifact.pageCount >= 20, `Expected ATC pagination to reach at least 20 pages; got ${artifact.pageCount}`);
assert(permitSignals.length === artifact.storeCount, `Permit signal count ${permitSignals.length} did not match artifact store count ${artifact.storeCount}`);
assert(permitNumbers.size === permitSignals.length, `Permit signals are not unique by permit number (${permitNumbers.size}/${permitSignals.length})`);
assert(activePackageStoreSignals.length === permitSignals.length, `Non-active or non-package-store permit signals found (${activePackageStoreSignals.length}/${permitSignals.length})`);
assert(cities.size >= 200, `Expected broad Indiana city coverage; got ${cities.size} cities`);
assert(zips.size >= 300, `Expected broad Indiana ZIP coverage; got ${zips.size} ZIPs`);
assert(alertablePermitSignals.length === 0, `ATC permit rows must not be alertable bottle/inventory signals; got ${alertablePermitSignals.length}`);
assert(atcDrops.length === 0, `ATC permit rows must not create Indiana drops; got ${atcDrops.length}`);
assert(retailerWatchDrops.length >= 5, `Expected Bourbon World retailer watch drops; got ${retailerWatchDrops.length}`);
assert(unsafeDrops.length === 0, `Unexpected non-retailer-watch Indiana drops found: ${unsafeDrops.map((drop) => `${drop.type}:${drop.bottleName}`).join(', ')}`);

if (inStores.length || inLocations.length) {
  assert(inStores.length >= 900, `Expected exported IN stores >= 900 after export; got ${inStores.length}`);
  assert(inLocations.length >= 900, `Expected exported IN locations >= 900 after export; got ${inLocations.length}`);
}

console.log(JSON.stringify({
  status: 'ok',
  permitStoreSignals: permitSignals.length,
  pages: artifact.pageCount,
  cities: cities.size,
  zips: zips.size,
  exportedStores: inStores.length,
  exportedLocations: inLocations.length,
  exportedDrops: inDrops.length,
  retailerWatchDrops: retailerWatchDrops.length
}, null, 2));
