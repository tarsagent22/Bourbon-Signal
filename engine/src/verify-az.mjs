import { readFile } from 'node:fs/promises';

function assert(condition, message, sample = null) {
  if (!condition) throw new Error(`${message}${sample ? `\n${JSON.stringify(sample, null, 2).slice(0, 2000)}` : ''}`);
}

const state = JSON.parse(await readFile('out/states/AZ.json', 'utf8'));
const exportContractSource = await readFile('src/export-site-contract.mjs', 'utf8');
const arizonaPolicySource = await readFile('src/arizona-retailer-policy.mjs', 'utf8');
const confidencePolicySource = await readFile('src/confidence-policy.mjs', 'utf8');
const stateSourceConfig = await readFile('src/state-sources.mjs', 'utf8');
const signals = state.signals || [];
const inventory = signals.filter((signal) => /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/.test(signal.eventType));
const xapiInventory = inventory.filter((signal) => /^(Safeway|Albertsons) Arizona XAPI/.test(signal.sourceLabel || ''));
const catalogWatch = signals.filter((signal) => signal.eventType === 'cityhive_store_catalog_watch');
const stores = signals.filter((signal) => signal.eventType === 'retailer_store_location');
const highValue = inventory.filter((signal) => /blanton|eagle rare|e\.?\s*h\.?\s*taylor|buffalo trace|1792 (?:full proof|sweet wheat)/i.test(`${signal.rawName || ''} ${signal.canonicalName || ''}`));
const rareTierInventory = inventory.filter((signal) => ['unicorn', 'allocated', 'limited'].includes(signal.tier));
const unsafe = inventory.filter((signal) => signal.state !== 'AZ' || signal.stateCode !== 'AZ' || !/,\s*AZ\s+\d{5}/i.test(signal.storeAddress || '') || signal.locationPrecision !== 'store_level' || !signal.storeId || !signal.canAlertAsInventory || (Number(signal.quantity || 0) <= 0 && signal.sourceAvailabilityVerified !== true));
const sentinelLeaks = signals.filter((signal) => Number(signal.raw?.reportedQuantity || 0) >= 100 && (signal.eventType !== 'cityhive_store_catalog_watch' || Number(signal.quantity || 0) !== 0 || signal.canAlertAsInventory || signal.availabilityStatus !== 'catalog_listed' || signal.raw?.quantitySemantics !== 'catalog_sentinel_unverified'));
const smallFormats = inventory.filter((signal) => {
  const size = signal.raw?.option?.option_params?.size || {};
  const qty = Number(size.quantity || 0);
  const ml = String(size.measure || '').toLowerCase() === 'l' ? qty * 1000 : qty;
  return ml > 0 && ml < 375;
});

assert(state.status === 'useful', `Expected Arizona status useful; got ${state.status}`);
assert(/isArizonaRetailerInventory/.test(exportContractSource) && /isArizonaRetailerSignalIdentity/.test(exportContractSource), 'Site export must use guarded Arizona retailer identity checks.');
assert(/ARIZONA_RETAILER_IDENTITIES/.test(arizonaPolicySource) && /hostname/.test(arizonaPolicySource), 'Arizona retailer policy must bind source labels to exact chains, merchants, and hostnames.');
assert(/ARIZONA_RETAILER_POLICY/.test(confidencePolicySource), 'Central confidence policy must include the guarded Arizona retailer lane.');
for (const source of ['Paradise Liquor', 'Liquor Vault', 'Skyline Liquor', 'Chandler Liquors']) assert(stateSourceConfig.includes(source), `Arizona state source config is missing ${source}.`);
assert(!state.stale, `Arizona collector must not publish stale fallback: ${state.staleReason || 'stale=true'}`);
assert(stores.length >= 5, `Expected at least five Arizona retailer locations; got ${stores.length}`);
assert(stores.some((signal) => /Paradise Liquor/i.test(signal.storeName || '') && signal.city === 'Phoenix'), 'Expected Paradise Liquor Phoenix store location signal.');
assert(inventory.length > 0, 'Expected at least one finite-quantity guarded Arizona inventory signal.');
assert(['Scottsdale', 'Mesa'].every((city) => inventory.some((signal) => signal.city === city)), 'Expected verified Phoenix-metro inventory in Scottsdale and Mesa.');
assert(xapiInventory.length >= 20, `Expected broad Safeway/Albertsons XAPI inventory; got ${xapiInventory.length}.`);
assert(new Set(xapiInventory.map((signal) => signal.storeId)).size >= 10, 'Expected Safeway/Albertsons coverage across at least ten stores.');
assert(highValue.length > 0, 'Expected at least one high-value finite-quantity Arizona signal.');
assert(rareTierInventory.length > 0, 'Expected at least one allocated/limited/unicorn Arizona signal with an explicit tier.');
assert(catalogWatch.length > 0, 'Expected sentinel-only CityHive rows to remain visible as non-inventory catalog watch evidence.');
assert(!unsafe.length, 'Arizona inventory contains unsafe geography/actionability rows.', unsafe);
assert(!sentinelLeaks.length, 'CityHive sentinel quantities leaked as exact inventory.', sentinelLeaks);
assert(!smallFormats.length, 'Arizona inventory should exclude miniature formats below 375ml.', smallFormats);

console.log(JSON.stringify({
  status: 'ok',
  stateStatus: state.status,
  storeLocations: stores.length,
  inventorySignals: inventory.length,
  xapiInventorySignals: xapiInventory.length,
  xapiStores: new Set(xapiInventory.map((signal) => signal.storeId)).size,
  catalogWatchSignals: catalogWatch.length,
  highValueSignals: highValue.length,
  cities: [...new Set(inventory.map((signal) => signal.city))],
  sources: [...new Set(inventory.map((signal) => signal.sourceLabel))],
  sample: highValue.slice(0, 6).map((signal) => ({ bottle: signal.canonicalName, price: signal.price, quantity: signal.quantity, quantitySemantics: signal.raw?.quantitySemantics, store: signal.storeName }))
}, null, 2));
