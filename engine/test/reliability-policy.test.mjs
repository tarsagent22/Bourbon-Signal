import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_RELIABILITY_SLO,
  evaluateCapacityBudget,
  evaluateStateControl,
  validateExpansionLifecycle,
} from '../src/reliability-policy.mjs';

test('production reliability SLO fixes freshness and coverage targets', () => {
  assert.equal(DEFAULT_RELIABILITY_SLO.maxSnapshotAgeMs, 45 * 60_000);
  assert.equal(DEFAULT_RELIABILITY_SLO.requiredStateCoverageRatio, 1);
  assert.equal(DEFAULT_RELIABILITY_SLO.maxConsecutiveRefreshFailures, 1);
  assert.ok(DEFAULT_RELIABILITY_SLO.refreshSafetyMarginMs >= 5 * 60_000);
});

test('state controls isolate a quarantined or disabled state without changing lifecycle', () => {
  const env = {
    BOURBON_SIGNAL_DISABLED_STATES: 'WA, WI',
    BOURBON_SIGNAL_QUARANTINED_STATES: 'TX',
  };
  assert.deepEqual(evaluateStateControl('TX', env), { state: 'TX', mode: 'quarantined', collect: true, publishCandidate: false });
  assert.deepEqual(evaluateStateControl('WA', env), { state: 'WA', mode: 'disabled', collect: false, publishCandidate: false });
  assert.deepEqual(evaluateStateControl('FL', env), { state: 'FL', mode: 'active', collect: true, publishCandidate: true });
});

test('capacity budget blocks expansions that cannot finish inside the refresh interval', () => {
  const healthy = evaluateCapacityBudget({ stateExpectedRunMs: [60_000, 70_000, 80_000, 90_000], concurrency: 2, intervalMs: 30 * 60_000, safetyMarginMs: 5 * 60_000 });
  assert.equal(healthy.ok, true);
  const overloaded = evaluateCapacityBudget({ stateExpectedRunMs: Array(24).fill(180_000), concurrency: 2, intervalMs: 30 * 60_000, safetyMarginMs: 5 * 60_000 });
  assert.equal(overloaded.ok, false);
  assert.match(overloaded.reason, /capacity/i);
});

test('new active states require staged promotion evidence', () => {
  const config = {
    activeStates: ['NC', 'ZZ'],
    reliabilityPolicy: { grandfatheredActiveStates: ['NC'] },
    states: {
      NC: { publicStatus: 'active' },
      ZZ: { publicStatus: 'active', promotionStage: 'canary' },
    },
  };
  const invalid = validateExpansionLifecycle(config);
  assert.equal(invalid.ok, false);
  assert.match(invalid.failures.join('\n'), /ZZ.*promotionStage.*active/i);
  config.states.ZZ.promotionStage = 'active';
  config.states.ZZ.promotionEvidence = { shadowRuns: 3, canaryRuns: 2, verifiedAt: '2026-07-13T00:00:00.000Z' };
  assert.equal(validateExpansionLifecycle(config).ok, true);
});
