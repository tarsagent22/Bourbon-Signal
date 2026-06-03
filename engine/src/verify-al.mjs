import { readFile } from 'node:fs/promises';

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const state = await readJson('out/states/AL.json');
const dropsExport = await readJson('out/site/drops.json').catch(() => ({ drops: [] }));
const storesExport = await readJson('out/site/stores.json').catch(() => ({ stores: [] }));
const locationsExport = await readJson('out/site/locations.json').catch(() => ({ locations: [] }));

const releaseSignals = (state.signals || []).filter((signal) => signal.eventType === 'alabc_limited_release_store_drop');
const calendarSignals = (state.signals || []).filter((signal) => signal.eventType === 'alabc_limited_release_calendar');
const priceCatalogSignals = (state.signals || []).filter((signal) => signal.eventType === 'alabc_product_price_catalog_row');
const releaseStores = new Set(releaseSignals.map((signal) => signal.storeId).filter(Boolean));
const releaseCities = new Set(releaseSignals.map((signal) => signal.city).filter(Boolean));
const releaseSources = new Set(releaseSignals.map((signal) => signal.sourceLabel).filter(Boolean));
const releaseProducts = new Set(releaseSignals.map((signal) => signal.canonicalName || signal.rawName).filter(Boolean));
const datedReleaseSignals = releaseSignals.filter((signal) => signal.releaseDate);
const pricedReleaseSignals = releaseSignals.filter((signal) => Number(signal.price || 0) > 0);
const inventoryMislabels = releaseSignals.filter((signal) => signal.canAlertAsInventory || /in_stock|live_inventory|shelf_stock|quantity_on_hand/i.test(String(signal.availabilityStatus || '') + ' ' + String(signal.inventorySemantics || '')));
const alDrops = (dropsExport.drops || []).filter((drop) => drop.state === 'AL');
const alReleaseDrops = alDrops.filter((drop) => drop.type === 'alabc_limited_release_store_drop');
const alStores = (storesExport.stores || []).filter((store) => store.state === 'AL');
const alLocations = (locationsExport.locations || []).filter((location) => location.state === 'AL');
const releaseDropStores = new Set(alReleaseDrops.map((drop) => drop.storeId).filter(Boolean));
const releaseDropCities = new Set(alReleaseDrops.map((drop) => drop.city).filter(Boolean));
const releaseDropSources = new Set(alReleaseDrops.map((drop) => drop.source).filter(Boolean));
const releaseDropProducts = new Set(alReleaseDrops.map((drop) => drop.bottleName || drop.canonicalName).filter(Boolean));
const dropInventoryMislabels = alReleaseDrops.filter((drop) => drop.canAlertAsInventory || /in_stock|live_inventory|shelf_stock|quantity_on_hand/i.test(String(drop.availabilityStatus || '') + ' ' + String(drop.inventorySemantics || '')));

assert(state.status === 'useful' || state.status === 'reachable_needs_deeper_parser', `Unexpected AL state status: ${state.status}`);
assert(releaseSignals.length >= 350, `Expected at least 350 Alabama release store-drop signals; got ${releaseSignals.length}`);
assert(releaseStores.size >= 120, `Expected Alabama release coverage across at least 120 stores; got ${releaseStores.size}`);
assert(releaseCities.size >= 80, `Expected Alabama release coverage across at least 80 cities; got ${releaseCities.size}`);
assert(releaseSources.has('Alabama ABC monthly limited release hold list'), `Expected monthly Hold release source; got ${[...releaseSources].join(', ')}`);
assert(releaseSources.has('Alabama ABC monthly additional distribution list'), `Expected monthly Additional Distribution source; got ${[...releaseSources].join(', ')}`);
assert(datedReleaseSignals.length >= 250, `Expected dated Alabama release rows from Hold PDF; got ${datedReleaseSignals.length}`);
assert(pricedReleaseSignals.length === releaseSignals.length, `Expected all Alabama release rows to include price; got ${pricedReleaseSignals.length}/${releaseSignals.length}`);
for (const name of ["Blanton's Original Single Barrel", 'Eagle Rare 10 Year', 'Buffalo Trace Bourbon', 'Henry McKenna 10 Year', 'Little Book']) {
  assert(releaseProducts.has(name), `Expected Alabama release product coverage for ${name}; got ${[...releaseProducts].sort().join(', ')}`);
}
assert(inventoryMislabels.length === 0, `Alabama release rows must not be marked live inventory; got ${inventoryMislabels.length}`);
assert(calendarSignals.length >= 1, `Expected Alabama limited-release calendar signal; got ${calendarSignals.length}`);
assert(priceCatalogSignals.length >= 25, `Expected Alabama price-book/catalog signals; got ${priceCatalogSignals.length}`);

if (alDrops.length) {
  assert(alReleaseDrops.length >= 350, `Expected exported Alabama release drops >= 350; got ${alReleaseDrops.length}`);
  assert(releaseDropStores.size >= 120, `Expected exported Alabama release drops across >=120 stores; got ${releaseDropStores.size}`);
  assert(releaseDropCities.size >= 80, `Expected exported Alabama release drops across >=80 cities; got ${releaseDropCities.size}`);
  assert(releaseDropSources.has('Alabama ABC monthly limited release hold list'), `Expected exported Hold source; got ${[...releaseDropSources].join(', ')}`);
  assert(releaseDropSources.has('Alabama ABC monthly additional distribution list'), `Expected exported Additional Distribution source; got ${[...releaseDropSources].join(', ')}`);
  for (const name of ["Blanton's Original Single Barrel", 'Eagle Rare 10 Year', 'Buffalo Trace Bourbon', 'Henry McKenna 10 Year', 'Little Book']) {
    assert(releaseDropProducts.has(name), `Expected exported Alabama drop product ${name}; got ${[...releaseDropProducts].sort().join(', ')}`);
  }
  assert(dropInventoryMislabels.length === 0, `Exported Alabama release drops must not be marked live inventory; got ${dropInventoryMislabels.length}`);
}

console.log(JSON.stringify({
  status: 'ok',
  releaseSignals: releaseSignals.length,
  releaseStores: releaseStores.size,
  releaseCities: releaseCities.size,
  releaseSources: [...releaseSources].sort(),
  releaseProducts: [...releaseProducts].sort(),
  datedReleaseSignals: datedReleaseSignals.length,
  priceCatalogSignals: priceCatalogSignals.length,
  exportedDrops: alDrops.length,
  exportedReleaseDrops: alReleaseDrops.length,
  exportedStores: alStores.length,
  exportedLocations: alLocations.length,
  releaseDropStores: releaseDropStores.size,
  releaseDropCities: releaseDropCities.size
}, null, 2));
