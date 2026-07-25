import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDropExpectedInLiveFeed, liveDropTotalMeetsRegressionFloor, parseLiveDropTotal } from './production-regression-drop-policy.mjs';

const now = Date.parse('2026-07-21T02:00:00.000Z');
const inventory = { state: 'TX', tier: 'allocated', canAlertAsInventory: true, quantity: 1 };

assert.equal(isDropExpectedInLiveFeed({ ...inventory, lastConfirmedAt: '2026-07-18T02:00:00.000Z' }, now), true, 'exactly 72-hour inventory remains visible');
assert.equal(isDropExpectedInLiveFeed({ ...inventory, lastConfirmedAt: '2026-07-18T01:59:59.999Z' }, now), false, 'inventory older than 72 hours is not a live-feed regression expectation');
assert.equal(isDropExpectedInLiveFeed({ ...inventory, quantity: 0, lastConfirmedAt: '2026-07-21T01:59:00.000Z' }, now), false, 'zero-quantity inventory is not exposed by the live route');
assert.equal(isDropExpectedInLiveFeed({ state: 'AL', tier: 'limited', type: 'alabc_limited_release_store_drop', locationPrecision: 'store_level', availabilityScope: 'store_reported', quantity: 0, displayAt: '2026-07-21T01:59:00.000Z' }, now), true, 'fresh zero-quantity release context remains visible');
assert.equal(isDropExpectedInLiveFeed({ state: 'PA', tier: 'allocated', type: 'store_inventory_aggregate', quantity: 56, lastConfirmedAt: '2026-07-18T01:59:59.999Z' }, now), false, 'positive store inventory aggregates use the same 72-hour route window');
assert.equal(isDropExpectedInLiveFeed({ state: 'UT', tier: 'limited', type: 'board_inventory_aggregate', quantity: 56, lastConfirmedAt: '2026-07-18T01:59:59.999Z', displayAt: '2026-07-18T01:59:59.999Z' }, now), true, 'board aggregates remain 30-day context rather than store inventory');
assert.equal(isDropExpectedInLiveFeed({ state: 'OH', tier: 'allocated', sourceStale: true, displayAt: '2026-07-07T02:00:00.000Z' }, now), true, 'Ohio stale feed may remain visible for exactly 14 days');
assert.equal(isDropExpectedInLiveFeed({ state: 'OH', tier: 'allocated', sourceStale: true, displayAt: '2026-07-07T01:59:59.999Z' }, now), false, 'expired Ohio context is not counted locally');
assert.equal(isDropExpectedInLiveFeed({ state: 'NC', tier: 'allocated', type: 'shipment', displayAt: '2026-07-07T02:00:00.000Z' }, now), true);
assert.equal(isDropExpectedInLiveFeed({ state: 'NC', tier: 'limited', type: 'context', displayAt: '2026-06-21T02:00:00.000Z' }, now), true);
assert.equal(isDropExpectedInLiveFeed({ state: 'NC', tier: 'limited', type: 'context', displayAt: '2026-06-21T01:59:59.999Z' }, now), false);
assert.equal(isDropExpectedInLiveFeed({ state: 'SC', tier: 'standard', type: 'retailer_store_inventory_result', quantity: 1, lastConfirmedAt: '2026-07-21T01:59:00.000Z' }, now), false, 'standard bottles filtered by the public Drop Feed are not regression expectations');
assert.equal(isDropExpectedInLiveFeed({ state: 'SC', type: 'retailer_store_inventory_result', quantity: 1, lastConfirmedAt: '2026-07-21T01:59:00.000Z' }, now), false, 'unknown tiers filtered by the public Drop Feed are not regression expectations');
assert.equal(isDropExpectedInLiveFeed({ ...inventory, lastConfirmedAt: '2026-07-21T02:15:00.001Z' }, now), false, 'materially future-dated rows fail closed');
assert.equal(isDropExpectedInLiveFeed({ ...inventory }, now), false, 'unknown freshness fails closed');

assert.equal(parseLiveDropTotal(0), 0);
assert.equal(parseLiveDropTotal(12), 12);
for (const invalid of [null, '', false, '12', -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.equal(parseLiveDropTotal(invalid), null, `invalid live total must fail closed: ${String(invalid)}`);
}

assert.equal(liveDropTotalMeetsRegressionFloor({ localTotal: 42, liveTotal: 0, minRatio: 0.4 }), false, 'a stale zero response must be retried');
assert.equal(liveDropTotalMeetsRegressionFloor({ localTotal: 42, liveTotal: 15, minRatio: 0.4 }), false, 'a stale response below the floor must be retried');
assert.equal(liveDropTotalMeetsRegressionFloor({ localTotal: 42, liveTotal: 16, minRatio: 0.4 }), true);
assert.equal(liveDropTotalMeetsRegressionFloor({ localTotal: 0, liveTotal: 0, minRatio: 0.4 }), true);
assert.equal(liveDropTotalMeetsRegressionFloor({ localTotal: 1, liveTotal: null, minRatio: 0.4 }), false);

const verifierSource = readFileSync(new URL('./verify-production-engine-regression.mjs', import.meta.url), 'utf8');
const dropRouteSource = readFileSync(new URL('../src/app/api/drops/route.ts', import.meta.url), 'utf8');
const siteContractSource = readFileSync(new URL('../src/lib/site-engine-contract.ts', import.meta.url), 'utf8');
const engineExporterSource = readFileSync(new URL('../engine/src/export-site-contract.mjs', import.meta.url), 'utf8');
assert.match(engineExporterSource, /signal\.stale === true[\s\S]{0,160}signal\.sourceStale === true[\s\S]{0,160}return false/, 'stale fallback rows must fail closed before any state-specific alert override');
assert.match(siteContractSource, /sourceStale[\s\S]{0,400}staleSourceCaveat[\s\S]{0,600}inventoryCaveat/, 'app normalization must visibly label retained stale store context');
assert.match(siteContractSource, /type === ["']retailer_store_inventory_result["'][\s\S]{0,160}quantity > 0/, 'the app must accept positive retailer inventory rows already admitted by the engine exporter');
assert.match(siteContractSource, /type === ["']cityhive_store_inventory_result["'][\s\S]{0,160}quantity > 0/, 'the app must accept positive CityHive inventory rows already admitted by the engine exporter');
assert.match(dropRouteSource, /!status\.startsWith\(["']stale_useful["']\)/, 'labeled stale-useful variants must stay visible while row-age gates remain authoritative');
assert.match(verifierSource, /pendingStates/, 'drop totals must retry in rounds while route-local snapshot caches converge');
assert.match(verifierSource, /PRODUCTION_VERIFY_ATTEMPTS/, 'drop retries must stay bounded');
assert.match(verifierSource, /liveDropTotalMeetsRegressionFloor/, 'drop retries must use the same regression floor as final validation');
assert.match(verifierSource, /localTotal > 0 && liveTotal === 0/, 'even one fresh local row must fail when the live state collapses to zero');
assert.match(verifierSource, /liveTotal === null/, 'invalid live totals must fail closed');

console.log('Production regression local drop-filter contracts passed.');
