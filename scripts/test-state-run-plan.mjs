import assert from 'node:assert/strict';
import test from 'node:test';
import { selectScheduledStates, updateStateRunMetric } from '../engine/src/optimization/state-run-plan.mjs';

const configs = [{ id: 'HOT' }, { id: 'COLD' }, { id: 'FAIL' }];
const now = '2026-07-10T14:00:00.000Z';

test('scheduler selects due high-yield states and skips unchanged cold states', () => {
  const metrics = {
    HOT: { probes: 10, usefulChanges: 8, failures: 0, consecutiveUnchanged: 0, lastProbeAt: '2026-07-10T13:00:00.000Z' },
    COLD: { probes: 20, usefulChanges: 0, failures: 0, consecutiveUnchanged: 12, lastProbeAt: '2026-07-10T13:30:00.000Z' },
    FAIL: { probes: 10, usefulChanges: 2, failures: 8, consecutiveFailures: 4, lastProbeAt: '2026-07-10T13:30:00.000Z' },
  };
  const plan = selectScheduledStates(configs, metrics, { now, baseCadenceMs: 30 * 60_000 });
  assert.deepEqual(plan.filter((entry) => entry.run).map((entry) => entry.id), ['HOT']);
  assert.equal(plan.find((entry) => entry.id === 'COLD').decision, 'wait');
});

test('explicit requested states bypass adaptive cadence', () => {
  const plan = selectScheduledStates(configs, {}, { requestedIds: new Set(['COLD']), now });
  assert.equal(plan.find((entry) => entry.id === 'COLD').run, true);
  assert.equal(plan.find((entry) => entry.id === 'HOT').run, false);
});

test('metrics retain yield, unchanged, and failure history', () => {
  const first = updateStateRunMetric({}, { id: 'NC', ok: true, contentHash: 'a', startedAt: '2026-07-10T13:59:59.000Z', finishedAt: now });
  const unchanged = updateStateRunMetric(first, { id: 'NC', ok: true, contentHash: 'a', startedAt: '2026-07-10T13:59:58.000Z', finishedAt: now });
  const failed = updateStateRunMetric(unchanged, { id: 'NC', ok: false, contentHash: 'a', startedAt: '2026-07-10T13:59:57.000Z', finishedAt: now });
  assert.equal(failed.NC.probes, 3);
  assert.equal(failed.NC.usefulChanges, 1);
  assert.equal(failed.NC.consecutiveUnchanged, 1);
  assert.equal(failed.NC.consecutiveFailures, 1);
  assert.equal(failed.NC.lastRuntimeMs, 3_000);
  assert.equal(failed.NC.totalRuntimeMs, 6_000);
});
