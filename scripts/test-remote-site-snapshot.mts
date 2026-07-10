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
