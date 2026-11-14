import assert from 'node:assert/strict';
import test from 'node:test';
import { runStatePoolWithBrowserBarriers } from '../src/optimization/browser-state-barrier.mjs';

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('PA and OH wait for their own validated artifacts while independent states use all four slots', async () => {
  const fwgs = deferred(), ohlq = deferred();
  const started = [];
  let active = 0, peak = 0;
  const tasks = ['PA', 'CA', 'OH', 'TX', 'NY', 'FL'].map(id => ({ id }));
  const result = runStatePoolWithBrowserBarriers(tasks, async task => {
    started.push(task.id);
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 3));
    active -= 1;
    return task.id;
  }, { concurrency: 4, barriers: new Map([['PA', fwgs.promise], ['OH', ohlq.promise]]) });

  await new Promise(resolve => setTimeout(resolve, 12));
  assert.equal(started.includes('PA'), false);
  assert.equal(started.includes('OH'), false);
  assert.equal(peak, 4);

  fwgs.resolve({ validated: true });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(started.includes('PA'), true);
  assert.equal(started.includes('OH'), false);
  ohlq.resolve({ validated: true });
  const results = await result;
  assert.equal(started.includes('OH'), true);
  assert.equal(peak, 4);
  assert.deepEqual(results.map(row => row.value), ['PA', 'CA', 'OH', 'TX', 'NY', 'FL']);
});

test('a failed FWGS prerequisite prevents PA collection while OH may proceed after its own artifact passes', async () => {
  const fwgs = deferred(), ohlq = deferred();
  const calls = [];
  const result = runStatePoolWithBrowserBarriers([{ id: 'PA' }, { id: 'OH' }, { id: 'CA' }], async task => {
    calls.push(task.id);
    return task.id;
  }, { concurrency: 4, barriers: new Map([['PA', fwgs.promise], ['OH', ohlq.promise]]) });
  const error = new Error('FWGS candidate artifact failed validation');
  fwgs.reject(error);
  ohlq.resolve({ validated: true });
  const rows = await result;
  assert.equal(calls.includes('PA'), false);
  assert.equal(calls.includes('OH'), true);
  assert.equal(calls.includes('CA'), true);
  assert.equal(rows[0].status, 'rejected');
  assert.equal(rows[0].reason, error);
  assert.equal(rows[1].status, 'fulfilled');
});

test('a timed out browser source stays closed and preserves independent state work', async () => {
  const fwgs = deferred();
  const calls = [];
  const result = runStatePoolWithBrowserBarriers([{ id: 'PA' }, { id: 'CA' }], async task => {
    calls.push(task.id);
    return task.id;
  }, { concurrency: 4, barriers: new Map([['PA', fwgs.promise]]) });
  const timeout = new Error('FWGS worker timed out');
  fwgs.reject(timeout);
  const rows = await result;
  assert.deepEqual(calls, ['CA']);
  assert.equal(rows[0].status, 'rejected');
  assert.equal(rows[0].reason, timeout);
  assert.equal(rows[1].status, 'fulfilled');
});
