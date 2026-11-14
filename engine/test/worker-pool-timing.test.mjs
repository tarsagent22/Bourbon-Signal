import assert from 'node:assert/strict';
import test from 'node:test';

import { runBoundedPool } from '../src/optimization/worker-pool.mjs';

test('bounded worker results carry current attempt timestamps for scheduler accounting', async () => {
  const [result] = await runBoundedPool([{ id: 'AA' }], async () => ({ ok: true }), { timeoutMs: 1000 });

  assert.equal(result.status, 'fulfilled');
  assert.equal(Number.isFinite(Date.parse(result.startedAt)), true);
  assert.equal(Number.isFinite(Date.parse(result.finishedAt)), true);
  assert.equal(Date.parse(result.finishedAt) >= Date.parse(result.startedAt), true);
});

test('barrier-gated tasks wait without occupying one of the bounded worker slots', async () => {
  const tasks = [{ id: 'PA' }, { id: 'A' }, { id: 'B' }, { id: 'OH' }, { id: 'C' }, { id: 'D' }];
  let releaseBarrier;
  const barrier = new Promise(resolve => { releaseBarrier = resolve; });
  let ready = false;
  let active = 0;
  let peak = 0;
  const started = [];
  const resultPromise = runBoundedPool(tasks, async task => {
    started.push(task.id);
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 3));
    active -= 1;
    return task.id;
  }, { concurrency: 4, isReady: task => ready || !['PA', 'OH'].includes(task.id), waitForReady: () => barrier });
  await new Promise(resolve => setTimeout(resolve, 12));
  assert.equal(started.includes('PA'), false);
  assert.equal(started.includes('OH'), false);
  assert.deepEqual(started.sort(), ['A', 'B', 'C', 'D']);
  releaseBarrier();
  ready = true;
  const results = await resultPromise;
  assert.equal(peak, 4);
  assert.deepEqual(started.sort(), ['A', 'B', 'C', 'D', 'OH', 'PA']);
  assert.deepEqual(results.map(result => result.value), ['PA', 'A', 'B', 'OH', 'C', 'D']);
});

test('a failed prerequisite rejects deferred tasks but preserves successful independent tasks', async () => {
  const tasks = [{ id: 'PA' }, { id: 'A' }, { id: 'OH' }];
  const failure = new Error('FWGS artifact did not validate');
  const results = await runBoundedPool(tasks, async task => task.id, {
    concurrency: 4,
    isReady: task => task.id === 'A',
    waitForReady: async () => { throw failure; },
  });
  assert.equal(results[0].status, 'rejected');
  assert.equal(results[0].reason, failure);
  assert.equal(results[1].status, 'fulfilled');
  assert.equal(results[2].status, 'rejected');
  assert.equal(results[2].reason, failure);
});
