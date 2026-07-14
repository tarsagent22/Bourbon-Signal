import { readFile } from 'node:fs/promises';
import { isFloridaRetailerInventory, isFloridaRetailerSignalIdentity } from './florida-retailer-policy.mjs';

function assert(condition, message, sample = null) {
  if (!condition) throw new Error(`${message}${sample ? `\n${JSON.stringify(sample, null, 2).slice(0, 2000)}` : ''}`);
}

const state = JSON.parse(await readFile('out/states/FL.json', 'utf8'));
const signals = state.signals || [];
const inventory = signals.filter((signal) => /^(retailer_store_inventory_result|cityhive_store_inventory_result)$/.test(signal.eventType));
const trusted = inventory.filter(isFloridaRetailerInventory);
const unsafe = inventory.filter((signal) => !isFloridaRetailerSignalIdentity(signal)
  || signal.state !== 'FL'
  || signal.stateCode !== 'FL'
  || !/,\s*FL\s+\d{5}/i.test(signal.storeAddress || '')
  || signal.locationPrecision !== 'store_level'
  || !signal.storeId
  || Number(signal.quantity || 0) < 0
  || (Number(signal.raw?.reportedQuantity || 0) >= 100 && Number(signal.quantity || 0) > 1)
  || signal.sourceAvailabilityVerified !== true);
const smallFormats = signals.filter((signal) => (signal.canAlertAsInventory || signal.canAlertAsWatch) && /\b(?:50|100|187|200|250|375)\s*ml\b/i.test(signal.rawName || ''));

assert(state.status === 'useful', `Expected Florida status useful; got ${state.status}`);
assert(!state.stale, `Florida collector must not publish stale fallback: ${state.staleReason || 'stale=true'}`);
assert(trusted.length > 0, 'Expected at least one guarded Florida retailer inventory signal.');
assert(trusted.some((signal) => signal.city === 'Kissimmee' || signal.city === 'Orlando'), 'Expected verified Central Florida inventory.');
assert(trusted.some((signal) => ['Tampa', 'Clearwater', 'Riverview', 'Largo', 'Saint Petersburg', 'Brandon', 'Wesley Chapel', 'Lutz'].includes(signal.city)), 'Expected verified Tampa Bay inventory.');
assert(new Set(trusted.map((signal) => signal.sourceLabel)).size >= 3, 'Expected at least three live Florida retailer sources.');
const liquorDepotWatches = signals.filter((signal) => signal.sourceLabel === 'Liquor Depot Tampa online quantity watch');
assert(liquorDepotWatches.length > 0, 'Expected Liquor Depot Tampa chain-level online quantity watches.');
assert(liquorDepotWatches.every((signal) => signal.canAlertAsInventory === false && signal.locationPrecision === 'store_aggregate'), 'Liquor Depot chain quantities must never masquerade as exact-store inventory.', liquorDepotWatches);
assert(!unsafe.length, 'Florida inventory contains unsafe provenance, geography, or quantity semantics.', unsafe);
assert(!smallFormats.length, 'Florida inventory and watch rows should exclude miniature formats.', smallFormats);

console.log(JSON.stringify({
  status: 'ok',
  stateStatus: state.status,
  inventorySignals: trusted.length,
  stores: new Set(trusted.map((signal) => signal.storeId)).size,
  cities: [...new Set(trusted.map((signal) => signal.city))],
  sources: [...new Set(trusted.map((signal) => signal.sourceLabel))],
  sample: trusted.slice(0, 6).map((signal) => ({ bottle: signal.canonicalName, price: signal.price, store: signal.storeName, availability: signal.availabilityLabel })),
}, null, 2));
