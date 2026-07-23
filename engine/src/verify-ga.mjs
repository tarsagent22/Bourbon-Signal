import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { isGeorgiaRetailerInventory, isGeorgiaRetailerSignalIdentity } from './georgia-retailer-policy.mjs';

const state = JSON.parse(await readFile('out/states/GA.json', 'utf8'));
const siteDrops = JSON.parse(await readFile('out/site/states/GA/drops.json', 'utf8')).drops || [];
const siteAlerts = JSON.parse(await readFile('out/site/alerts.json', 'utf8')).alerts || [];
const signals = Array.isArray(state.signals) ? state.signals : [];
const retailerRows = signals.filter((signal) => /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(String(signal.eventType || '')));
const trusted = retailerRows.filter(isGeorgiaRetailerInventory);
const unsafe = retailerRows.filter((signal) => !isGeorgiaRetailerSignalIdentity(signal) || !isGeorgiaRetailerInventory(signal));
const binary = trusted.filter((signal) => signal.inventorySemantics === 'binary_retailer_orderable_no_exact_count');
const exact = trusted.filter((signal) => signal.inventorySemantics === 'exact_retailer_reported_quantity');
const invalidFormats = signals.filter((signal) => (signal.canAlertAsInventory || signal.canAlertAsWatch)
  && /\b(?:50|100|187|200|250|375)\s*ml\b|\b(?:bundle|multipack|multi-pack|case\s+of|pack\s+of|\d+\s*(?:pack|pk)|\d+\s*x\s*\d+\s*(?:ml|l))\b/i.test(String(signal.rawName || '')));
const georgiaDrops = siteDrops.filter((drop) => drop.state === 'GA' && /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(String(drop.type || '')));
const georgiaAlerts = siteAlerts.filter((alert) => alert.state === 'GA' && alert.changeType === 'current_inventory_signal');
const maxInventoryAgeHours = Number(process.env.BOURBON_SIGNAL_GA_MAX_INVENTORY_AGE_HOURS || 12);
const isFresh = (row) => {
  const observedAt = Date.parse(row.observedAt || row.signalAt || '');
  return Number.isFinite(observedAt)
    && Date.now() >= observedAt
    && Date.now() - observedAt <= maxInventoryAgeHours * 60 * 60 * 1000;
};

assert.equal(state.state, 'GA');
const releaseUsefulStatuses = ['useful', 'useful_retained_not_due', 'stale_useful'];
assert.ok(releaseUsefulStatuses.includes(state.status), `Georgia status ${JSON.stringify(state.status)} is not release-useful.`);
if (state.stale === true) {
  assert.equal(state.status, 'stale_useful', `Georgia stale report must be an explicit stale_useful retained fallback, got ${JSON.stringify(state.status)}.`);
  assert.match(String(state.staleReason || ''), /retained|collapsed|fallback|previous/i, 'Georgia stale fallback must record the retention reason.');
}
assert.ok(trusted.length > 0, 'Expected at least one exact-identity Georgia retailer inventory row.');
assert.ok(trusted.every(isFresh), `Georgia retailer inventory must be source-fresh within ${maxInventoryAgeHours} hours.`);
assert.equal(unsafe.length, 0, 'Georgia retailer output contains an identity, geography, availability, or quantity-semantics violation.');
assert.ok(new Set(trusted.map((signal) => signal.storeId)).size > 0, 'Expected at least one exact Georgia retailer premises.');
assert.ok(binary.every((signal) => signal.quantity === 0 && signal.quantityIsExact === false && signal.sourceAvailabilityVerified === true), 'Georgia binary rows must never invent positive quantity.');
assert.ok(exact.every((signal) => signal.quantity > 0 && signal.quantity < 100 && signal.quantityIsExact === true), 'Georgia exact CityHive quantities must be finite positive values below the binary sentinel.');
assert.equal(invalidFormats.length, 0, 'Georgia alertable rows must reject 375ml-or-smaller bottles, bundles, and multipacks.');
assert.ok(georgiaDrops.length > 0, 'Georgia retailer inventory must survive the customer drop projection.');
assert.ok(georgiaDrops.every(isGeorgiaRetailerInventory), 'Every projected Georgia retailer drop must retain its exact identity and quantity semantics.');
assert.ok(georgiaDrops.every(isFresh), `Georgia projected retailer drops must be source-fresh within ${maxInventoryAgeHours} hours.`);
assert.ok(georgiaAlerts.every((alert) => alert.eligibleForEmail === false && alert.eligibleForSms === false), 'Georgia activation baselines and stale fallback rows must remain on-site only; outbound alerts require a later source-backed change.');
assert.ok(georgiaAlerts.filter((alert) => alert.inventorySemantics === 'exact_retailer_reported_quantity')
  .every((alert) => alert.quantityIsExact === true && alert.reportedQuantity === alert.quantity), 'Georgia exact-quantity alerts must preserve source quantity evidence.');
assert.ok(georgiaAlerts.filter((alert) => alert.inventorySemantics === 'binary_retailer_orderable_no_exact_count')
  .every((alert) => alert.quantityIsExact === false), 'Georgia binary alerts must preserve non-exact quantity semantics.');

console.log(JSON.stringify({
  status: 'ok',
  stateStatus: state.status,
  inventorySignals: trusted.length,
  binarySignals: binary.length,
  exactQuantitySignals: exact.length,
  stores: new Set(trusted.map((signal) => signal.storeId)).size,
  sources: [...new Set(trusted.map((signal) => signal.sourceLabel))],
  projectedDrops: georgiaDrops.length,
  currentInventoryAlerts: georgiaAlerts.length,
}, null, 2));
