import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { withStateRunLock } from '../src/state-run-lock.mjs';

test('serializes concurrent collectors for the same state', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bs-state-lock-'));
  const lockPath = path.join(root, 'TX.lock');
  let active = 0;
  let peak = 0;
  const task = () => withStateRunLock(lockPath, async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 20));
    active -= 1;
  }, { retryMs: 2, staleMs: 1_000 });
  try {
    await Promise.all([task(), task()]);
    assert.equal(peak, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
