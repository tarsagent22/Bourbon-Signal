import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isCaliforniaRetailerInventory } from './california-retailer-policy.mjs';

const state = JSON.parse(await readFile('out/states/CA.json', 'utf8'));
const storeUniverse = JSON.parse(await readFile('data/store-universe/CA.json', 'utf8'));
const siteStores = JSON.parse(await readFile('out/site/stores.json', 'utf8'));
const siteLocations = JSON.parse(await readFile('out/site/locations.json', 'utf8'));
const siteAlerts = JSON.parse(await readFile('out/site/alerts.json', 'utf8'));
const stateQuality = JSON.parse(await readFile('out/site/state-quality.json', 'utf8'));
const signals = Array.isArray(state.signals) ? state.signals : [];
const inventory = signals.filter((signal) => signal.eventType === 'retailer_store_inventory_result');
const allowSafeRetainedNotDue = process.argv.includes('--allow-safe-retained-not-due');
const retainedNotDue = state.status === 'useful_retained_not_due' && state.stale !== true;
const scheduledOnlyException = allowSafeRetainedNotDue && retainedNotDue;
const currentInventoryAlertMaxAgeHours = Number(process.env.CURRENT_INVENTORY_ALERT_MAX_AGE_HOURS || 2);
const currentInventoryAlertMaxAgeMs = currentInventoryAlertMaxAgeHours * 60 * 60 * 1000;
const freshInventory = inventory.filter((signal) => {
  const observedAt = Date.parse(signal.observedAt || '');
  return Number.isFinite(observedAt)
    && Date.now() >= observedAt
    && Date.now() - observedAt <= currentInventoryAlertMaxAgeMs;
});

assert.equal(state.state, 'CA');
assert.ok(['useful', 'useful_retained_not_due'].includes(state.status), `California status ${JSON.stringify(state.status)} is not release-useful.`);
assert.equal(state.roadblocks?.length ?? 0, 0);
assert.ok(inventory.length >= 12, `expected at least 12 California inventory rows; got ${inventory.length}`);
assert.ok(new Set(inventory.map((signal) => signal.storeId)).size >= 2, 'expected at least two independently identity-bound San Diego stores');
assert.ok(inventory.every(isCaliforniaRetailerInventory), 'every California inventory row must pass the exact identity and semantics policy');
assert.ok(inventory.every((signal) => signal.state === 'CA' && (signal.storeCity || signal.city) === 'San Diego'), 'California launch inventory must remain scoped to San Diego city');
assert.ok(inventory.every((signal) => signal.quantity === 0 && signal.inventorySemantics === 'binary_retailer_orderable_no_exact_count'), 'Shopify availability must stay binary and must not fabricate quantity');
assert.ok(inventory.every((signal) => signal.sourceAvailabilityVerified === true), 'inventory rows must carry positive source availability evidence');
assert.ok(inventory.every((signal) => signal.productId && signal.variantId && (signal.raw?.productId || signal.raw?.product?.id) && (signal.raw?.variantId || signal.raw?.variant?.id)), 'inventory identity must survive in top-level and raw fields');
assert.ok(inventory.every((signal) => /^https:\/\/(?:www\.delmesaliquor\.com|missiontrailswineandspirits\.com)\//.test(signal.sourceUrl)), 'inventory source URLs must remain on the whitelisted retailer hosts');
assert.ok((storeUniverse.stores ?? []).filter((store) => store.city === 'San Diego').length >= 3, 'store universe must include the audited San Diego retailer set');

const stateDrops = JSON.parse(await readFile('out/site/states/CA/drops.json', 'utf8')).drops ?? [];
assert.ok(stateDrops.length >= 12, 'California state partition should include customer-facing rows');
assert.ok(stateDrops.every((row) => row.state === 'CA' && (row.store_city || row.city) === 'San Diego'), 'California drops must stay scoped to San Diego city');
assert.ok(stateDrops.every((row) => row.sourceChain && row.merchantId && row.productId && row.variantId), 'California drops must preserve source and product identity');
assert.ok(stateDrops.every((row) => !/\b(?:50|100|200|375)\s*m[lL]\b/.test(`${row.rawName || ''} ${row.bottleName || ''}`)), 'California drops must reject small formats');

const exportedStores = (siteStores.stores ?? []).filter((row) => row.state === 'CA');
const exportedLocations = (siteLocations.locations ?? []).filter((row) => row.state === 'CA');
const exportedAlerts = (siteAlerts.alerts ?? []).filter((row) => row.state === 'CA');
assert.ok(exportedStores.length >= 2, 'root store export must include both inventory-eligible San Diego stores');
assert.ok(exportedLocations.length >= 3, 'root location export must include San Diego inventory and watch locations');
assert.ok(exportedStores.every((row) => row.city === 'San Diego' && row.address), 'exported California stores require exact San Diego addresses');
if (freshInventory.length > 0 && exportedAlerts.length < Math.min(12, freshInventory.length)) {
  assert.ok(scheduledOnlyException, 'fresh California inventory must expose on-site orderability alerts');
  assert.ok(stateDrops.length >= 12, 'a retained-not-due California partition may omit duplicate baseline alerts only while its customer-facing drops remain intact');
  assert.ok(exportedAlerts.every((row) => row.eligibleForEmail === false && row.eligibleForSms === false), 'a retained-not-due California partition must never leak outbound alerts');
} else if (freshInventory.length > 0) {
  assert.ok(exportedAlerts.length >= Math.min(12, freshInventory.length), 'fresh California inventory must expose on-site orderability alerts');
} else {
  assert.equal(exportedAlerts.length, 0, 'stale California inventory must not produce alert candidates');
}
assert.ok(exportedAlerts.every((row) => row.sourceChain && row.merchantId && row.productId && row.variantId && row.storeId), 'California alerts must preserve source, product, variant, and store identity');
assert.ok(exportedAlerts.filter((row) => row.changeType === 'current_inventory_signal').every((row) => row.eligibleForOnSite && !row.eligibleForEmail && !row.eligibleForSms), 'baseline/current California projections must remain on-site only until a real change is detected');

const qualityRows = stateQuality.states ?? stateQuality.scorecards ?? [];
const californiaQuality = qualityRows.find((row) => row.state === 'CA');
assert.ok(californiaQuality?.releaseEligible, 'California state quality must be release eligible');
assert.ok(Number(californiaQuality?.score || 0) >= Number(californiaQuality?.threshold || 65), 'California quality score must meet its live-store threshold');

console.log(JSON.stringify({
  state: 'CA',
  status: state.status,
  signals: signals.length,
  inventory: inventory.length,
  stores: new Set(inventory.map((signal) => signal.storeId)).size,
}));
