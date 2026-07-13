import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSiteSnapshotManifest,
  decryptSnapshotObject,
  encryptSnapshotObject,
  verifySiteSnapshotManifest,
} from '../src/data-plane/site-snapshot-contract.mjs';
import {
  InMemoryObjectStorage,
  publishSiteSnapshot,
  readPublishedSiteFile,
  rollbackSiteSnapshot,
} from '../src/data-plane/site-snapshot-publisher.mjs';

const encryptionKey = Buffer.alloc(32, 7).toString('base64url');
const metadata = {
  generatedAt: '2026-07-10T12:33:49.778Z',
  appCommit: 'b7fa0dc8',
  engineCommit: 'engine123',
  collectionRunId: 'run-123',
  stateHealth: { NC: { status: 'healthy', signalCount: 10 } },
};
const files = {
  'stats.json': JSON.stringify({ contractVersion: 'bourbon-signal-site-v0.1', generatedAt: metadata.generatedAt, signalCount: 10 }),
  'states/NC/drops.json': JSON.stringify({ contractVersion: 'bourbon-signal-site-v0.1', generatedAt: metadata.generatedAt, state: 'NC', drops: [{ id: 'one' }] }),
};

test('site snapshot manifest is deterministic and rejects missing or tampered files', () => {
  const one = createSiteSnapshotManifest(files, metadata);
  const two = createSiteSnapshotManifest({ 'states/NC/drops.json': files['states/NC/drops.json'], 'stats.json': files['stats.json'] }, metadata);
  assert.equal(one.snapshotId, two.snapshotId);
  assert.equal(one.contractVersion, 'bourbon-signal-file-snapshot-v1');
  assert.equal(one.files['stats.json'].bytes, Buffer.byteLength(files['stats.json']));
  assert.deepEqual(verifySiteSnapshotManifest(one, files), { ok: true });
  assert.equal(verifySiteSnapshotManifest(one, { 'stats.json': files['stats.json'] }).ok, false);
  assert.equal(verifySiteSnapshotManifest(one, { ...files, 'stats.json': `${files['stats.json']} ` }).ok, false);
});

test('snapshot objects are encrypted and authenticated', () => {
  const plaintext = files['stats.json'];
  const encrypted = encryptSnapshotObject(plaintext, encryptionKey);
  assert.doesNotMatch(encrypted, /signalCount/);
  assert.equal(decryptSnapshotObject(encrypted, encryptionKey), plaintext);
  const tampered = JSON.parse(encrypted);
  tampered.ciphertext = `${tampered.ciphertext.slice(0, -2)}aa`;
  assert.throws(() => decryptSnapshotObject(JSON.stringify(tampered), encryptionKey));
});

test('publication can stage and verify a complete snapshot without activating it', async () => {
  const storage = new InMemoryObjectStorage();
  const result = await publishSiteSnapshot(storage, files, metadata, { encryptionKey, activate: false });
  assert.equal(result.status, 'staged');
  assert.equal(await storage.readPointer(), null);
  assert.equal(await readPublishedSiteFile(storage, 'stats.json', { encryptionKey, snapshotId: result.manifest.snapshotId }), files['stats.json']);
});

test('publication uploads and verifies every immutable file before atomic activation', async () => {
  const storage = new InMemoryObjectStorage();
  const result = await publishSiteSnapshot(storage, files, metadata, { encryptionKey });
  assert.equal(result.status, 'published');
  assert.equal((await storage.readPointer()).active, result.manifest.snapshotId);
  assert.equal(await readPublishedSiteFile(storage, 'stats.json', { encryptionKey }), files['stats.json']);
  assert.equal(await readPublishedSiteFile(storage, 'states/NC/drops.json', { encryptionKey }), files['states/NC/drops.json']);
});

test('failed readback never activates a partial snapshot', async () => {
  const storage = new InMemoryObjectStorage({ corruptReadPath: 'stats.json' });
  await assert.rejects(() => publishSiteSnapshot(storage, files, metadata, { encryptionKey }), /readback|decrypt|hash/i);
  assert.equal(await storage.readPointer(), null);
});

test('idempotent rollback republishes the authoritative pointer event', async () => {
  const storage = new InMemoryObjectStorage();
  const first = await publishSiteSnapshot(storage, files, metadata, { encryptionKey });
  const newerFiles = { ...files, 'stats.json': JSON.stringify({ contractVersion: 'bourbon-signal-site-v0.1', generatedAt: '2026-07-10T14:03:49.778Z', signalCount: 12 }) };
  await publishSiteSnapshot(storage, newerFiles, { ...metadata, generatedAt: '2026-07-10T14:03:49.778Z', collectionRunId: 'run-125' }, { encryptionKey });
  await rollbackSiteSnapshot(storage);
  let repaired = null;
  storage.ensurePointerEvent = async (pointer) => { repaired = pointer; };
  const repeat = await rollbackSiteSnapshot(storage);
  assert.equal(repeat.status, 'already_rolled_back');
  assert.equal(repaired.active, first.manifest.snapshotId);
});

test('repeat publication is idempotent and rollback restores the previous complete snapshot', async () => {
  const storage = new InMemoryObjectStorage();
  const first = await publishSiteSnapshot(storage, files, metadata, { encryptionKey });
  const repeat = await publishSiteSnapshot(storage, files, metadata, { encryptionKey });
  assert.equal(repeat.status, 'already_active');
  const newerFiles = { ...files, 'stats.json': JSON.stringify({ contractVersion: 'bourbon-signal-site-v0.1', generatedAt: '2026-07-10T13:03:49.778Z', signalCount: 11 }) };
  const newer = await publishSiteSnapshot(storage, newerFiles, { ...metadata, generatedAt: '2026-07-10T13:03:49.778Z', collectionRunId: 'run-124' }, { encryptionKey });
  assert.equal((await storage.readPointer()).previous, first.manifest.snapshotId);
  const rolledBack = await rollbackSiteSnapshot(storage);
  assert.equal(rolledBack.status, 'rolled_back');
  assert.equal((await storage.readPointer()).active, first.manifest.snapshotId);
  assert.notEqual(first.manifest.snapshotId, newer.manifest.snapshotId);
});
