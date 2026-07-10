import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SNAPSHOT_CONTRACT_VERSION,
  createSnapshot,
  verifySnapshot,
} from '../src/data-plane/snapshot-contract.mjs';
import {
  InMemorySnapshotStorage,
  publishSnapshot,
  readActiveSnapshot,
  rollbackSnapshot,
} from '../src/data-plane/snapshot-store.mjs';

const base = (generatedAt, marker) => ({
  generatedAt,
  provenance: {
    engineVersion: 'engine-test',
    gitSha: 'abc1234',
    runId: `run-${marker}`,
    sources: [{ id: 'nc-abc', fetchedAt: generatedAt }],
  },
  stateHealth: {
    NC: { status: 'healthy', observedAt: generatedAt, signalCount: marker },
  },
  data: {
    bottles: [{ id: `bottle-${marker}` }],
    drops: [{ id: `drop-${marker}` }],
    stats: { marker },
  },
});

test('snapshot contract is deterministic, versioned, hashed, and tamper evident', () => {
  const input = base('2026-07-09T12:00:00.000Z', 1);
  const first = createSnapshot(input);
  const second = createSnapshot({ ...input, data: { stats: input.data.stats, drops: input.data.drops, bottles: input.data.bottles } });

  assert.equal(first.contractVersion, SNAPSHOT_CONTRACT_VERSION);
  assert.equal(first.hash, second.hash);
  assert.equal(first.snapshotId, first.hash);
  assert.equal(verifySnapshot(first).ok, true);
  assert.deepEqual(Object.keys(first.stateHealth), ['NC']);

  const tampered = structuredClone(first);
  tampered.data.stats.marker = 99;
  assert.deepEqual(verifySnapshot(tampered), { ok: false, reason: 'hash_mismatch' });
});

test('publish writes immutable content, verifies readback, and atomically advances active/previous', async () => {
  const storage = new InMemorySnapshotStorage();
  const one = createSnapshot(base('2026-07-09T12:00:00.000Z', 1));
  const two = createSnapshot(base('2026-07-09T12:05:00.000Z', 2));

  const firstPublish = await publishSnapshot(storage, one);
  const secondPublish = await publishSnapshot(storage, two);
  const pointer = await storage.readPointer();

  assert.equal(firstPublish.status, 'published');
  assert.equal(secondPublish.status, 'published');
  assert.equal(pointer.active, two.hash);
  assert.equal(pointer.previous, one.hash);
  assert.equal((await readActiveSnapshot(storage)).data.stats.marker, 2);
  await assert.rejects(() => storage.putImmutable(`snapshots/${one.hash}.json`, JSON.stringify(two)), /immutable/i);
});

test('publish refuses pointer activation when immutable readback is corrupt', async () => {
  const storage = new InMemorySnapshotStorage({ corruptReads: true });
  const snapshot = createSnapshot(base('2026-07-09T12:00:00.000Z', 1));

  await assert.rejects(() => publishSnapshot(storage, snapshot), /readback verification failed/i);
  assert.equal(await storage.readPointer(), null);
});

test('rollback is idempotent and does not bounce between snapshots', async () => {
  const storage = new InMemorySnapshotStorage();
  const one = createSnapshot(base('2026-07-09T12:00:00.000Z', 1));
  const two = createSnapshot(base('2026-07-09T12:05:00.000Z', 2));
  await publishSnapshot(storage, one);
  await publishSnapshot(storage, two);

  const first = await rollbackSnapshot(storage);
  const second = await rollbackSnapshot(storage);

  assert.equal(first.status, 'rolled_back');
  assert.equal(second.status, 'already_rolled_back');
  assert.equal((await storage.readPointer()).active, one.hash);
  assert.equal((await readActiveSnapshot(storage)).hash, one.hash);
});

test('compare-and-swap conflict retries without losing pointer history', async () => {
  const storage = new InMemorySnapshotStorage({ conflicts: 1 });
  const snapshot = createSnapshot(base('2026-07-09T12:00:00.000Z', 1));
  const result = await publishSnapshot(storage, snapshot, { pointerRetries: 2 });
  assert.equal(result.status, 'published');
  assert.equal((await storage.readPointer()).active, snapshot.hash);
});
