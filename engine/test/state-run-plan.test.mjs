import assert from 'node:assert/strict';
import test from 'node:test';

import { updateStateRunMetric, selectScheduledStates, inventoryStateCadenceMs } from '../src/optimization/state-run-plan.mjs';
import { legacyPrecisionRuntimeOptions } from '../src/collectors/precision-probes.mjs';

test('all inventory states stay due at the collection cadence even after unchanged or failed passes', () => {
  const states = ['AZ', 'CA', 'CO', 'FL', 'GA', 'ID', 'IL', 'IN', 'MS', 'NC', 'NV', 'NY', 'OH', 'PA', 'SC', 'TN', 'TX', 'VA'];
  const metric = { lastProbeAt: '2026-10-28T00:00:00Z', probes: 100, usefulChanges: 0, failures: 80, consecutiveFailures: 4, consecutiveUnchanged: 80 };
  const options = { now: '2026-10-28T00:31:00Z', baseCadenceMs: 1_800_000, maxCadenceMs: 86_400_000 };
  const metrics = Object.fromEntries(states.map(id => [id, metric]));
  for (const result of selectScheduledStates(states.map(id => ({ id })), metrics, options)) {
    assert.equal(result.run, true, result.id);
    assert.equal(result.cadenceMs, 1_800_000, result.id);
    assert.equal(legacyPrecisionRuntimeOptions(result.id, {}, {}).maxCadenceMs, 1_800_000, result.id);
  }
  assert.equal(selectScheduledStates([{ id: 'NV' }], metrics, { ...options, now: '2026-10-28T00:29:00Z' })[0].run, false);
});

test('inventory scheduling preserves explicit cooldown, disabled and requested-state boundaries', () => {
  const metric = { lastProbeAt: '2026-10-28T00:00:00Z', probes: 100, consecutiveUnchanged: 80, cooldownUntil: '2026-10-28T04:00:00Z' };
  const options = { now: '2026-10-28T00:31:00Z', baseCadenceMs: 1_800_000, maxCadenceMs: 86_400_000 };
  assert.equal(selectScheduledStates([{ id: 'NV' }], { NV: metric }, options)[0].nextProbeAt, new Date(metric.cooldownUntil).toISOString());
  assert.equal(selectScheduledStates([{ id: 'NV' }], { NV: { ...metric, disabled: true } }, options)[0].run, false);
  const scheduled = selectScheduledStates([{ id: 'NV' }, { id: 'FL' }], {}, { ...options, requestedIds: new Set(['NV']) });
  assert.deepEqual(scheduled.map(row => row.run), [true, false]);
  assert.equal(inventoryStateCadenceMs('IA'), null);
  assert.equal(inventoryStateCadenceMs('UT'), null);
  assert.equal(inventoryStateCadenceMs('MA'), null);
});

test('expanded Texas collector has one bounded attempt within its parent state envelope', () => {
  const options = legacyPrecisionRuntimeOptions('TX', {}, {});
  assert.equal(options.timeoutMs, 600_000);
  assert.equal(options.maxAttempts, 1);
  assert.equal(options.maxCadenceMs, 1_800_000);
});

test('state runtime metrics prefer the current worker attempt envelope over retained report timestamps', () => {
  const metrics = updateStateRunMetric({}, {
    id: 'PA',
    ok: false,
    contentHash: null,
    startedAt: '2026-07-27T00:00:00.000Z',
    finishedAt: '2026-08-05T12:01:00.000Z',
    attemptStartedAt: '2026-08-05T12:00:00.000Z',
    attemptFinishedAt: '2026-08-05T12:01:00.000Z',
  });

  assert.equal(metrics.PA.lastRuntimeMs, 60_000);
  assert.equal(metrics.PA.totalRuntimeMs, 60_000);
  assert.equal(metrics.PA.failures, 1);
});
