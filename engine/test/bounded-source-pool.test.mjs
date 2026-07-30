import assert from 'node:assert/strict';
import test from 'node:test';

import { runBoundedSourceLanes } from '../src/core/bounded-source-pool.mjs';

test('source pool runs independent domains concurrently and never overlaps one domain', async () => {
  let active = 0;
  let peak = 0;
  const activeDomains = new Set();
  const starts = [];
  const lanes = [
    { name: 'a-one', domain: 'a.example' },
    { name: 'b-one', domain: 'b.example' },
    { name: 'a-two', domain: 'a.example' },
    { name: 'c-one', domain: 'c.example' },
  ].map((lane) => ({
    ...lane,
    run: async () => {
      assert.equal(activeDomains.has(lane.domain), false, `${lane.domain} overlapped itself`);
      activeDomains.add(lane.domain);
      active += 1;
      peak = Math.max(peak, active);
      starts.push(lane.name);
      await new Promise((resolve) => setTimeout(resolve, 15));
      active -= 1;
      activeDomains.delete(lane.domain);
      return { signals: [{ id: lane.name }], roadblocks: [] };
    },
  }));
  const run = await runBoundedSourceLanes(lanes, { concurrency: 3 });
  assert.equal(peak, 3);
  assert.deepEqual(run.results.map((row) => row.name), ['a-one', 'b-one', 'a-two', 'c-one']);
  assert.equal(run.timings.length, 4);
  assert.ok(run.timings.every((row) => row.outcome === 'passed' && row.signalCount === 1));
  assert.ok(starts.indexOf('a-two') > starts.indexOf('a-one'));
});

test('source pool aborts siblings, waits for quiescence, and requires explicit domain keys', async () => {
  let siblingSettled = false;
  const startedAt = Date.now();
  const promise = runBoundedSourceLanes([
    {
      name: 'failing', domain: 'a.example', run: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error('lane failed');
      },
    },
    {
      name: 'sibling', domain: 'b.example', run: async ({ signal }) => {
        await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
        await new Promise((resolve) => setTimeout(resolve, 15));
        siblingSettled = true;
        throw signal.reason;
      },
    },
  ], { concurrency: 2 });
  await assert.rejects(promise, /lane failed/iu);
  assert.equal(siblingSettled, true);
  assert.ok(Date.now() - startedAt >= 15, 'pool returned before the sibling settled');
  await assert.rejects(() => runBoundedSourceLanes([{ name: 'missing-domain', run: async () => ({}) }]), /domain isolation key/iu);
});

test('source pool propagates caller abort without starting queued work', async () => {
  const controller = new AbortController();
  let queuedStarted = false;
  const promise = runBoundedSourceLanes([
    {
      name: 'first', domain: 'a.example', run: async () => {
        controller.abort(new Error('stop'));
        await new Promise((resolve) => setTimeout(resolve, 1));
        return { signals: [], roadblocks: [] };
      },
    },
    { name: 'queued', domain: 'a.example', run: async () => { queuedStarted = true; return { signals: [], roadblocks: [] }; } },
  ], { concurrency: 1, signal: controller.signal });
  await assert.rejects(promise, /stop|abort/iu);
  assert.equal(queuedStarted, false);
});
