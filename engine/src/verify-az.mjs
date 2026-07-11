import { readFile } from 'node:fs/promises';

function assert(condition, message, sample = null) {
  if (!condition) throw new Error(`${message}${sample ? `\n${JSON.stringify(sample, null, 2).slice(0, 2000)}` : ''}`);
}

const state = JSON.parse(await readFile('out/states/AZ.json', 'utf8'));
const exportContractSource = await readFile('src/export-site-contract.mjs', 'utf8');
const stateSourceConfig = await readFile('src/state-sources.mjs', 'utf8');
const signals = state.signals || [];
const inventory = signals.filter((signal) => signal.eventType === 'cityhive_store_inventory_result');
const stores = signals.filter((signal) => signal.eventType === 'retailer_store_location');
const highValue = inventory.filter((signal) => /blanton|eagle rare|e\.?\s*h\.?\s*taylor|buffalo trace|1792 (?:full proof|sweet wheat)/i.test(`${signal.rawName || ''} ${signal.canonicalName || ''}`));
const rareTierInventory = inventory.filter((signal) => ['unicorn', 'allocated', 'limited'].includes(signal.tier));
const allowedCities = new Set(['Phoenix', 'Scottsdale', 'Mesa', 'Chandler', 'Casa Grande']);
const unsafe = inventory.filter((signal) => signal.state !== 'AZ' || signal.stateCode !== 'AZ' || !allowedCities.has(signal.city) || !/,\s*(?:Phoenix|Scottsdale|Mesa|Chandler|Casa Grande),\s*AZ\s+\d{5}/i.test(signal.storeAddress || '') || signal.locationPrecision !== 'store_level' || !signal.storeId || !signal.canAlertAsInventory || Number(signal.quantity || 0) <= 0);
const sentinelLeaks = inventory.filter((signal) => Number(signal.raw?.reportedQuantity || 0) >= 100 && (Number(signal.quantity || 0) !== 1 || signal.raw?.quantitySemantics !== 'listed_available_no_exact_count'));
const smallFormats = inventory.filter((signal) => {
  const size = signal.raw?.option?.option_params?.size || {};
  const qty = Number(size.quantity || 0);
  const ml = String(size.measure || '').toLowerCase() === 'l' ? qty * 1000 : qty;
  return ml > 0 && ml < 375;
});

assert(state.status === 'useful', `Expected Arizona status useful; got ${state.status}`);
assert(/function isArizonaRetailerInventory/.test(exportContractSource) && /isAzRetailerInventory/.test(exportContractSource), 'Site export must explicitly whitelist guarded Arizona retailer inventory.');
assert(/alert_retailer_store_inventory_caveat/.test(exportContractSource), 'Arizona export path must preserve the retailer inventory caveat policy.');
for (const source of ['Paradise Liquor', 'Liquor Vault', 'Skyline Liquor', 'Chandler Liquors']) assert(stateSourceConfig.includes(source), `Arizona state source config is missing ${source}.`);
assert(!state.stale, `Arizona collector must not publish stale fallback: ${state.staleReason || 'stale=true'}`);
assert(stores.length >= 5, `Expected at least five Arizona retailer locations; got ${stores.length}`);
assert(stores.some((signal) => /Paradise Liquor/i.test(signal.storeName || '') && signal.city === 'Phoenix'), 'Expected Paradise Liquor Phoenix store location signal.');
assert(inventory.length >= 40, `Expected at least 40 guarded Arizona inventory signals; got ${inventory.length}`);
assert(new Set(inventory.map((signal) => signal.city)).size >= 5, 'Expected Phoenix metro plus Casa Grande city coverage.');
assert(highValue.length >= 12, `Expected at least 12 high-value Arizona inventory signals; got ${highValue.length}`);
assert(rareTierInventory.length >= 12, `Expected at least 12 allocated/limited/unicorn Arizona signals with explicit tiers; got ${rareTierInventory.length}`);
assert(!unsafe.length, 'Arizona inventory contains unsafe geography/actionability rows.', unsafe);
assert(!sentinelLeaks.length, 'CityHive sentinel quantities leaked as exact inventory.', sentinelLeaks);
assert(!smallFormats.length, 'Arizona inventory should exclude miniature formats below 375ml.', smallFormats);

console.log(JSON.stringify({
  status: 'ok',
  stateStatus: state.status,
  storeLocations: stores.length,
  inventorySignals: inventory.length,
  highValueSignals: highValue.length,
  cities: [...new Set(inventory.map((signal) => signal.city))],
  sources: [...new Set(inventory.map((signal) => signal.sourceLabel))],
  sample: highValue.slice(0, 6).map((signal) => ({ bottle: signal.canonicalName, price: signal.price, quantity: signal.quantity, quantitySemantics: signal.raw?.quantitySemantics, store: signal.storeName }))
}, null, 2));
