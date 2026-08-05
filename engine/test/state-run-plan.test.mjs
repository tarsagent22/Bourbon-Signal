import assert from 'node:assert/strict';
import test from 'node:test';

import { updateStateRunMetric } from '../src/optimization/state-run-plan.mjs';

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
