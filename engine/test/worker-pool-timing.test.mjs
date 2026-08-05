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
