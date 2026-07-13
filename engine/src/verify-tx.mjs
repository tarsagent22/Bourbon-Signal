import { readFile } from 'node:fs/promises';
import { isTexasRetailerInventory, isTexasRetailerSignalIdentity } from './texas-retailer-policy.mjs';

function assert(condition, message, sample = null) {
  if (!condition) throw new Error(`${message}${sample ? `\n${JSON.stringify(sample, null, 2).slice(0, 3000)}` : ''}`);
}

const minSources = Number(process.env.BOURBON_SIGNAL_TX_MIN_SOURCES || 3);
const minStores = Number(process.env.BOURBON_SIGNAL_TX_MIN_STORES || 25);
const minInventory = Number(process.env.BOURBON_SIGNAL_TX_MIN_INVENTORY || 75);
const state = JSON.parse(await readFile('out/states/TX.json', 'utf8'));
const signals = state.signals || [];
const inventoryCandidates = signals.filter((s) => /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/.test(String(s.eventType || '')));
const trusted = inventoryCandidates.filter(isTexasRetailerInventory);
const unsafe = inventoryCandidates.filter((s) => !isTexasRetailerSignalIdentity(s) || !isTexasRetailerInventory(s));
const sources = new Set(trusted.map((s) => s.sourceLabel));
const stores = new Set(trusted.map((s) => s.storeId));
const cities = new Set(trusted.map((s) => s.city).filter(Boolean));
const smallFormats = trusted.filter((s) => /\b(?:50|100|187|200|250|375)\s*ml\b/i.test(String(s.rawName || '')));
const relativeUrls = trusted.filter((s) => { try { return !/^https?:$/.test(new URL(s.sourceUrl).protocol); } catch { return true; } });
const exposedSentinels = trusted.filter((s) => Number(s.raw?.reportedQuantity) === 100 && Number(s.quantity) !== 0);

assert(state.status === 'useful', `Expected Texas status useful; got ${state.status}`);
assert(!state.stale, `Texas collector must not publish stale fallback: ${state.staleReason || 'stale=true'}`);
assert(sources.size >= minSources, `Expected at least ${minSources} trusted Texas inventory sources; got ${sources.size}`);
assert(stores.size >= minStores, `Expected at least ${minStores} trusted Texas stores; got ${stores.size}`);
assert(trusted.length >= minInventory, `Expected at least ${minInventory} trusted Texas inventory rows; got ${trusted.length}`);
assert(!unsafe.length, 'Texas inventory contains unsafe identity, geography, or availability semantics.', unsafe.slice(0, 5));
assert(!smallFormats.length, 'Texas inventory contains miniature formats.', smallFormats.slice(0, 5));
assert(!relativeUrls.length, 'Texas inventory contains relative/untrusted URLs.', relativeUrls.slice(0, 5));
assert(!exposedSentinels.length, 'Texas sentinel quantities were exposed as exact inventory.', exposedSentinels.slice(0, 5));

console.log(JSON.stringify({ status: 'ok', stateStatus: state.status, inventorySignals: trusted.length, stores: stores.size, cities: [...cities].sort(), sources: [...sources].sort(), binaryAvailability: trusted.filter((s) => Number(s.quantity) === 0).length, exactQuantity: trusted.filter((s) => Number(s.quantity) > 0).length, sample: trusted.slice(0, 6).map((s) => ({ bottle: s.canonicalName, store: s.storeName, city: s.city, availability: s.availabilityLabel })) }, null, 2));
