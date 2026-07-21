import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDropExpectedInLiveFeed, parseLiveDropTotal } from './production-regression-drop-policy.mjs';

const now = Date.parse('2026-07-21T02:00:00.000Z');
const inventory = { state: 'TX', canAlertAsInventory: true };

assert.equal(isDropExpectedInLiveFeed({ ...inventory, lastConfirmedAt: '2026-07-18T02:00:00.000Z' }, now), true, 'exactly 72-hour inventory remains visible');
assert.equal(isDropExpectedInLiveFeed({ ...inventory, lastConfirmedAt: '2026-07-18T01:59:59.999Z' }, now), false, 'inventory older than 72 hours is not a live-feed regression expectation');
assert.equal(isDropExpectedInLiveFeed({ state: 'PA', type: 'store_inventory_aggregate', quantity: 56, lastConfirmedAt: '2026-07-18T01:59:59.999Z' }, now), false, 'positive store inventory aggregates use the same 72-hour route window');
assert.equal(isDropExpectedInLiveFeed({ state: 'UT', type: 'board_inventory_aggregate', quantity: 56, lastConfirmedAt: '2026-07-18T01:59:59.999Z', displayAt: '2026-07-18T01:59:59.999Z' }, now), true, 'board aggregates remain 30-day context rather than store inventory');
assert.equal(isDropExpectedInLiveFeed({ state: 'OH', sourceStale: true, displayAt: '2026-07-07T02:00:00.000Z' }, now), true, 'Ohio stale feed may remain visible for exactly 14 days');
assert.equal(isDropExpectedInLiveFeed({ state: 'OH', sourceStale: true, displayAt: '2026-07-07T01:59:59.999Z' }, now), false, 'expired Ohio context is not counted locally');
assert.equal(isDropExpectedInLiveFeed({ state: 'NC', type: 'shipment', displayAt: '2026-07-07T02:00:00.000Z' }, now), true);
assert.equal(isDropExpectedInLiveFeed({ state: 'NC', type: 'context', displayAt: '2026-06-21T02:00:00.000Z' }, now), true);
assert.equal(isDropExpectedInLiveFeed({ state: 'NC', type: 'context', displayAt: '2026-06-21T01:59:59.999Z' }, now), false);
assert.equal(isDropExpectedInLiveFeed({ ...inventory, lastConfirmedAt: '2026-07-21T02:15:00.001Z' }, now), false, 'materially future-dated rows fail closed');
assert.equal(isDropExpectedInLiveFeed({ ...inventory }, now), false, 'unknown freshness fails closed');

assert.equal(parseLiveDropTotal(0), 0);
assert.equal(parseLiveDropTotal(12), 12);
for (const invalid of [null, '', false, '12', -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.equal(parseLiveDropTotal(invalid), null, `invalid live total must fail closed: ${String(invalid)}`);
}

const verifierSource = readFileSync(new URL('./verify-production-engine-regression.mjs', import.meta.url), 'utf8');
assert.match(verifierSource, /localTotal > 0 && liveTotal === 0/, 'even one fresh local row must fail when the live state collapses to zero');
assert.match(verifierSource, /liveTotal === null/, 'invalid live totals must fail closed');

console.log('Production regression local drop-filter contracts passed.');
