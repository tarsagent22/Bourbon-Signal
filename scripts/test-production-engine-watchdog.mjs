import assert from 'node:assert/strict';
import { evaluateProductionHealth } from './production-engine-watchdog.mjs';

const nowMs = Date.parse('2026-07-20T02:00:00.000Z');

function statsWithPa({ drops, stores, bestLocationPrecision }) {
  return {
    ok: true,
    status: 200,
    source: 'remote-snapshot',
    snapshotId: 'snapshot-pa-test',
    body: {
      generatedAt: '2026-07-20T01:45:00.000Z',
      stateCount: 1,
      refreshHealth: { failedStateCount: 0 },
      by_state: { PA: { drops, stores, bottles: 30, exactStoreDrops: drops, exactStores: stores } },
      stateCoverage: {
        states: [{
          state: 'PA',
          lifecycle: 'store_inventory',
          targetLocationPrecision: 'store_level',
          bestLocationPrecision,
          coverageTier: 'live_store_inventory',
        }],
      },
    },
  };
}

const stateChecks = [{
  state: 'PA',
  ok: true,
  status: 200,
  total: 13,
  source: 'remote-snapshot',
  snapshotId: 'snapshot-pa-test',
}];

const collapsed = evaluateProductionHealth({
  nowMs,
  activeStates: ['PA'],
  stats: statsWithPa({ drops: 13, stores: 0, bestLocationPrecision: 'store_aggregate' }),
  stateChecks,
});
assert.equal(collapsed.ok, false, 'PA must be unhealthy when a nominal live-store partition has zero stores and only statewide rows.');
assert.deepEqual(collapsed.recoveryStates, ['PA'], 'PA coverage collapse must request a targeted PA recovery.');
assert.match(collapsed.failures.join('\n'), /PA.*exact-store|PA.*store/i);

const healthy = evaluateProductionHealth({
  nowMs,
  activeStates: ['PA'],
  stats: statsWithPa({ drops: 1400, stores: 560, bestLocationPrecision: 'store_level' }),
  stateChecks: [{ ...stateChecks[0], total: 1400 }],
});
assert.equal(healthy.ok, true, healthy.failures.join('\n'));
assert.deepEqual(healthy.recoveryStates, []);

const aggregateOnly = statsWithPa({ drops: 1200, stores: 500, bestLocationPrecision: 'store_level' });
aggregateOnly.body.by_state.PA.exactStoreDrops = 1;
aggregateOnly.body.by_state.PA.exactStores = 1;
const aggregateOnlyResult = evaluateProductionHealth({ nowMs, activeStates: ['PA'], stats: aggregateOnly, stateChecks });
assert.equal(aggregateOnlyResult.ok, false, 'Aggregate PA rows must not satisfy the exact-store health floor.');
assert.deepEqual(aggregateOnlyResult.recoveryStates, ['PA']);

const mixedStats = statsWithPa({ drops: 13, stores: 0, bestLocationPrecision: 'store_aggregate' });
mixedStats.body.stateCount = 2;
mixedStats.body.stateCoverage.states.push({ state: 'VA', bestLocationPrecision: 'store_level' });
const mixed = evaluateProductionHealth({
  nowMs,
  activeStates: ['PA', 'VA'],
  stats: mixedStats,
  stateChecks: [stateChecks[0], { state: 'VA', ok: false, status: 503, source: null, snapshotId: null }],
});
assert.equal(mixed.ok, false);
assert.deepEqual(mixed.recoveryStates, ['PA', 'VA'], 'Every failed state partition must be included in targeted recovery; PA must not mask VA.');

const missingExactFields = statsWithPa({ drops: 1200, stores: 500, bestLocationPrecision: 'store_level' });
delete missingExactFields.body.by_state.PA.exactStoreDrops;
delete missingExactFields.body.by_state.PA.exactStores;
const missingExactResult = evaluateProductionHealth({ nowMs, activeStates: ['PA'], stats: missingExactFields, stateChecks });
assert.equal(missingExactResult.ok, false, 'Missing exact-store metrics must fail closed.');
assert.deepEqual(missingExactResult.recoveryStates, ['PA']);

const contractRetry = statsWithPa({ drops: 1400, stores: 560, bestLocationPrecision: 'store_level' });
contractRetry.body.refreshHealth.retryStateIds = ['PA'];
contractRetry.body.refreshHealth.states = [
  { state: 'PA', health: 'degraded', recoveryAction: 'retry_state_collection' },
];
const contractRetryResult = evaluateProductionHealth({ nowMs, activeStates: ['PA'], stats: contractRetry, stateChecks });
assert.equal(contractRetryResult.ok, false, 'Published retryStateIds must trigger targeted recovery even when the snapshot route is alive.');
assert.deepEqual(contractRetryResult.recoveryStates, ['PA']);
assert.match(contractRetryResult.failures.join('\n'), /retryStateIds|retry state/i);

const staleAndCollapsed = statsWithPa({ drops: 13, stores: 0, bestLocationPrecision: 'store_aggregate' });
staleAndCollapsed.body.generatedAt = '2026-07-19T23:00:00.000Z';
staleAndCollapsed.body.refreshHealth.retryStateIds = ['PA'];
const staleAndCollapsedResult = evaluateProductionHealth({ nowMs, activeStates: ['PA'], stats: staleAndCollapsed, stateChecks });
assert.equal(staleAndCollapsedResult.ok, false);
assert.deepEqual(staleAndCollapsedResult.recoveryStates, [], 'A global stale-snapshot failure requires full recovery even when PA also collapses.');

const unavailable = evaluateProductionHealth({
  nowMs,
  activeStates: ['PA'],
  stats: { ok: false, status: 503, source: null, snapshotId: null, body: null },
  stateChecks: [{ ...stateChecks[0], ok: false, status: 503, source: null, snapshotId: null }],
});
assert.equal(unavailable.ok, false);
assert.deepEqual(unavailable.recoveryStates, [], 'A global stats outage must request full recovery instead of being misclassified as a PA-only collapse.');

console.log('Production watchdog PA coverage contracts passed.');
