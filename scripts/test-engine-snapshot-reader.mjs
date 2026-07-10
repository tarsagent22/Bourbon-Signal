import assert from 'node:assert/strict';
import test from 'node:test';

import { createEngineSnapshotReader } from '../src/lib/engine-snapshot-reader.ts';
import { createSnapshot } from '../engine/src/data-plane/snapshot-contract.mjs';

const makeSnapshot = (marker) => createSnapshot({
  generatedAt: `2026-07-09T12:0${marker}:00.000Z`,
  provenance: { engineVersion: 'test', gitSha: 'abc', runId: `run-${marker}`, sources: [] },
  stateHealth: { NC: { status: 'healthy', observedAt: `2026-07-09T12:0${marker}:00.000Z`, signalCount: marker } },
  data: { bottles: [{ marker }], drops: [{ marker }], stats: { marker } },
});

const bundled = makeSnapshot(1);
const remote = makeSnapshot(2);

test('bundled mode never contacts remote storage', async () => {
  let reads = 0;
  const reader = createEngineSnapshotReader({ bundledSnapshot: bundled, mode: 'bundled', storage: { readPointer: async () => { reads += 1; } } });
  const result = await reader.read();
  assert.equal(result.source, 'bundled');
  assert.equal(result.snapshot.hash, bundled.hash);
  assert.equal(reads, 0);
});

test('shadow mode validates remote but serves one complete bundled snapshot', async () => {
  const reader = createEngineSnapshotReader({
    bundledSnapshot: bundled,
    mode: 'shadow',
    storage: {
      readPointer: async () => ({ active: remote.hash, previous: bundled.hash, revision: 2 }),
      readImmutable: async () => JSON.stringify(remote),
    },
  });
  const result = await reader.read();
  assert.equal(result.source, 'bundled');
  assert.equal(result.shadow?.hash, remote.hash);
  assert.deepEqual(result.snapshot.data, bundled.data);
});

test('remote mode falls back atomically to bundled on pointer, read, or hash failure', async () => {
  const tampered = structuredClone(remote);
  tampered.data.stats.marker = 99;
  const reader = createEngineSnapshotReader({
    bundledSnapshot: bundled,
    mode: 'remote',
    storage: {
      readPointer: async () => ({ active: remote.hash, previous: bundled.hash, revision: 2 }),
      readImmutable: async () => JSON.stringify(tampered),
    },
  });
  const result = await reader.read();
  assert.equal(result.source, 'bundled-fallback');
  assert.equal(result.snapshot.hash, bundled.hash);
  assert.equal(result.snapshot.data.bottles[0].marker, 1);
  assert.equal(result.snapshot.data.drops[0].marker, 1);
  assert.match(result.reason ?? '', /hash_mismatch/);
});
