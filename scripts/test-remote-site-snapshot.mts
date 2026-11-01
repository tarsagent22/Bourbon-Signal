import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryObjectStorage, publishSiteSnapshot } from '../engine/src/data-plane/site-snapshot-publisher.mjs';
import { createRemoteSiteSnapshotReader } from '../src/lib/remote-site-snapshot.ts';

const encryptionKey = Buffer.alloc(32, 9).toString('base64url');
const stats = JSON.stringify({ contractVersion: 'bourbon-signal-site-v0.1', generatedAt: '2026-07-10T12:33:49.778Z', signalCount: 10 });
const drops = JSON.stringify({ contractVersion: 'bourbon-signal-site-v0.1', generatedAt: '2026-07-10T12:33:49.778Z', drops: [] });

async function publishedStorage() {
  const storage = new InMemoryObjectStorage();
  const result = await publishSiteSnapshot(storage, { 'stats.json': stats, 'drops.json': drops }, {
    generatedAt: '2026-07-10T12:33:49.778Z',
    appCommit: 'app',
    engineCommit: 'engine',
    collectionRunId: 'run',
    stateHealth: { NC: { status: 'healthy' } },
  }, { encryptionKey });
  return { storage, result };
}

test('remote reader pins one manifest and verifies/decrypts named exports', async () => {
  const { storage, result } = await publishedStorage();
  const reader = createRemoteSiteSnapshotReader({ storage, encryptionKey });
  const output = await reader.read('stats');
  assert.equal(output.source, 'remote');
  assert.equal(output.snapshotId, result.manifest.snapshotId);
  assert.equal(output.payload.signalCount, 10);
  assert.equal(output.generatedAt, '2026-07-10T12:33:49.778Z');
});

test('remote reader never falls through to a different snapshot when a file is missing', async () => {
  const { storage } = await publishedStorage();
  const reader = createRemoteSiteSnapshotReader({ storage, encryptionKey });
  await assert.rejects(() => reader.read('events'), /not declared/i);
});


test('verified immutable cache shares concurrent file reads and isolates consumer mutations', async () => {
  const { storage } = await publishedStorage();
  let objectReads = 0, pointerReads = 0;
  const reader = createRemoteSiteSnapshotReader({ encryptionKey, cacheImmutable: true, storage: {
    readPointer: async () => { pointerReads++; return storage.readPointer(); },
    readObject: async key => { objectReads++; return storage.readObject(key); },
  } });
  const [first, second] = await Promise.all([reader.read('stats'), reader.read('stats')]);
  first.payload.signalCount = 99;
  assert.equal(second.payload.signalCount, 10);
  assert.equal((await reader.read('stats')).payload.signalCount, 10);
  assert.equal(objectReads, 2, 'one verified manifest and encrypted file for concurrent and repeated reads');
  assert.equal(pointerReads, 3, 'active selection is never cached here');
});

test('cached files follow new activation, pinned bundles, rollback and fresh pointer metadata', async () => {
  const { storage, result } = await publishedStorage();
  let pointer = { active: result.manifest.snapshotId, snapshotActivatedAt: 'first' };
  const reader = createRemoteSiteSnapshotReader({ encryptionKey, cacheImmutable: true, storage: {
    readPointer: async () => pointer,
    readObject: key => storage.readObject(key),
  } });
  await reader.read('stats');
  const next = await publishSiteSnapshot(storage, { 'stats.json': stats.replace('10}', '20}') }, {
    generatedAt: '2026-07-11T12:33:49.778Z', appCommit: 'new', engineCommit: 'new', collectionRunId: 'new',
    stateHealth: { NC: { status: 'healthy' } },
  }, { encryptionKey });
  pointer = { active: next.manifest.snapshotId, snapshotActivatedAt: 'second' };
  assert.equal((await reader.read('stats')).payload.signalCount, 20);
  assert.equal((await reader.read('stats', { active: result.manifest.snapshotId })).payload.signalCount, 10);
  pointer = { active: result.manifest.snapshotId, snapshotActivatedAt: 'rollback' };
  assert.equal((await reader.read('stats')).snapshotActivatedAt, 'rollback');
  assert.equal((await reader.read('stats')).payload.signalCount, 10);
});

test('failed immutable reads are evicted and byte limits avoid retaining large files', async () => {
  const { storage } = await publishedStorage();
  let fail = true, fileReads = 0;
  const reader = createRemoteSiteSnapshotReader({ encryptionKey, cacheImmutable: true, cacheBytes: 1, storage: {
    readPointer: () => storage.readPointer(),
    readObject: async key => {
      if (key.endsWith('.enc')) { fileReads++; if (fail) return 'corrupt'; }
      return storage.readObject(key);
    },
  } });
  await assert.rejects(() => reader.read('stats'));
  fail = false;
  assert.equal((await reader.read('stats')).payload.signalCount, 10);
  await reader.read('stats');
  assert.equal(fileReads, 3);
});

test('failed verification never becomes a cached payload', async () => {
  const { storage } = await publishedStorage();
  let corrupt = true, fileReads = 0;
  const reader = createRemoteSiteSnapshotReader({ encryptionKey, cacheImmutable: true, storage: {
    readPointer: () => storage.readPointer(),
    readObject: async key => {
      if (key.endsWith('.enc')) { fileReads++; if (corrupt) return 'corrupt'; }
      return storage.readObject(key);
    },
  } });
  await assert.rejects(() => reader.read('stats'));
  corrupt = false;
  assert.equal((await reader.read('stats')).payload.signalCount, 10);
  await reader.read('stats');
  assert.equal(fileReads, 2);
});
