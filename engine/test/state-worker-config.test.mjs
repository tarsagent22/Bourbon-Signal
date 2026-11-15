import assert from 'node:assert/strict';
import test from 'node:test';
import lifecycle from '../../src/config/state-lifecycle.json' with { type: 'json' };
import { evaluateCapacityBudget } from '../src/reliability-policy.mjs';
import { resolveStateWorkerConcurrency } from '../src/optimization/state-worker-config.mjs';

test('the shared I/O worker policy defaults to five and preserves valid environment overrides', () => {
  const policy = lifecycle.reliabilityPolicy;
  assert.equal(policy.workerConcurrency, 5);
  assert.equal(resolveStateWorkerConcurrency(policy.workerConcurrency, undefined), 5);
  assert.equal(resolveStateWorkerConcurrency(policy.workerConcurrency, '3'), 3);
  assert.equal(resolveStateWorkerConcurrency(policy.workerConcurrency, '8'), 8);
  assert.equal(resolveStateWorkerConcurrency(policy.workerConcurrency, 'invalid'), 5);

  const states = lifecycle.activeStates.map(state => policy.stateExpectedRunMs[state] || policy.defaultExpectedStateRunMs);
  const forecast = evaluateCapacityBudget({
    stateExpectedRunMs: states,
    concurrency: resolveStateWorkerConcurrency(policy.workerConcurrency),
    intervalMs: policy.refreshIntervalMs,
    safetyMarginMs: policy.refreshSafetyMarginMs,
  });
  assert.equal(forecast.ok, true, forecast.reason);
  assert.equal(forecast.availableRunMs, 1_500_000);
});
