import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';
import test from 'node:test';

import {
  canonicalJson,
  createSiteSnapshotManifest,
  decryptSnapshotObject,
  encryptSnapshotObject,
  sha256,
  verifySiteSnapshotManifest,
} from '../src/data-plane/site-snapshot-contract.mjs';
import { repackActiveSiteSnapshot, rollbackSnapshotIfActive } from '../src/data-plane/repack-active-site-snapshot.mjs';
import {
  InMemoryObjectStorage,
  publishSiteSnapshot,
  readPublishedSiteFile,
  rollbackSiteSnapshot,
  siteSnapshotObjectKeys,
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
  assert.equal(one.objectEncoding, 'gzip');
  assert.equal(one.files['stats.json'].bytes, Buffer.byteLength(files['stats.json']));
  assert.deepEqual(verifySiteSnapshotManifest(one, files), { ok: true });
  assert.equal(verifySiteSnapshotManifest(one, { 'stats.json': files['stats.json'] }).ok, false);
  assert.equal(verifySiteSnapshotManifest(one, { ...files, 'stats.json': `${files['stats.json']} ` }).ok, false);
});

test('snapshot objects are compressed, encrypted, and authenticated', () => {
  const plaintext = JSON.stringify({ ...JSON.parse(files['stats.json']), repeated: 'bourbon-signal-'.repeat(2_000) });
  const encrypted = encryptSnapshotObject(plaintext, encryptionKey);
  const envelope = JSON.parse(encrypted);
  assert.equal(envelope.encoding, 'gzip');
  assert.ok(Buffer.byteLength(encrypted) < Buffer.byteLength(plaintext) / 2);
  assert.doesNotMatch(encrypted, /signalCount/);
  assert.equal(decryptSnapshotObject(encrypted, encryptionKey), plaintext);
  const tampered = JSON.parse(encrypted);
  tampered.ciphertext = `${tampered.ciphertext.slice(0, -2)}aa`;
  assert.throws(() => decryptSnapshotObject(JSON.stringify(tampered), encryptionKey));
  const encodingTampered = JSON.parse(encrypted);
  delete encodingTampered.encoding;
  assert.throws(() => decryptSnapshotObject(JSON.stringify(encodingTampered), encryptionKey));
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

test('publication refuses to activate against a changed source pointer', async () => {
  const storage = new InMemoryObjectStorage();
  const first = await publishSiteSnapshot(storage, files, metadata, { encryptionKey });
  const competingFiles = { ...files, 'stats.json': JSON.stringify({ generatedAt: '2026-07-10T13:03:49.778Z', signalCount: 11 }) };
  const competing = await publishSiteSnapshot(storage, competingFiles, { ...metadata, generatedAt: '2026-07-10T13:03:49.778Z', collectionRunId: 'competing' }, { encryptionKey });
  const candidateFiles = { ...files, 'stats.json': JSON.stringify({ generatedAt: '2026-07-10T14:03:49.778Z', signalCount: 12 }) };
  await assert.rejects(
    () => publishSiteSnapshot(storage, candidateFiles, { ...metadata, generatedAt: '2026-07-10T14:03:49.778Z', collectionRunId: 'candidate' }, { encryptionKey, expectedActive: first.manifest.snapshotId }),
    /active snapshot changed/i,
  );
  assert.equal((await storage.readPointer()).active, competing.manifest.snapshotId);
});

test('guarded rollback never changes an unrelated active snapshot', async () => {
  const storage = new InMemoryObjectStorage();
  const first = await publishSiteSnapshot(storage, files, metadata, { encryptionKey });
  const secondFiles = { ...files, 'stats.json': JSON.stringify({ generatedAt: '2026-07-10T13:03:49.778Z', signalCount: 11 }) };
  const second = await publishSiteSnapshot(storage, secondFiles, { ...metadata, generatedAt: '2026-07-10T13:03:49.778Z', collectionRunId: 'second' }, { encryptionKey });
  const skipped = await rollbackSnapshotIfActive(storage, first.manifest.snapshotId);
  assert.equal(skipped.status, 'active_snapshot_mismatch');
  assert.equal((await storage.readPointer()).active, second.manifest.snapshotId);
  const rolledBack = await rollbackSnapshotIfActive(storage, second.manifest.snapshotId);
  assert.equal(rolledBack.status, 'rolled_back');
  assert.equal((await storage.readPointer()).active, first.manifest.snapshotId);
});

test('active legacy snapshot can be repacked to gzip without changing its plaintext contract', async () => {
  const sourceFiles = { 'stats.json': files['stats.json'], 'drops.json': files['states/NC/drops.json'] };
  const currentManifest = createSiteSnapshotManifest(sourceFiles, metadata);
  const { objectEncoding, snapshotId: _snapshotId, manifestHash: _manifestHash, ...legacyUnsigned } = currentManifest;
  const legacyHash = sha256(canonicalJson(legacyUnsigned));
  const legacyId = `${metadata.generatedAt.replace(/[:.]/g, '-')}-${legacyHash.slice(0, 16)}`;
  const legacyManifest = { ...legacyUnsigned, snapshotId: legacyId, manifestHash: legacyHash };
  const objects = new Map([[siteSnapshotObjectKeys.manifestKey(legacyId), canonicalJson(legacyManifest)]]);
  for (const [filePath, plaintext] of Object.entries(sourceFiles)) {
    const iv = Buffer.alloc(12, filePath.length);
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(encryptionKey, 'base64url'), iv);
    const ciphertext = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
    objects.set(siteSnapshotObjectKeys.encryptedKey(legacyId, filePath), JSON.stringify({
      contractVersion: 'bourbon-signal-encrypted-object-v1',
      algorithm: 'aes-256-gcm',
      iv: iv.toString('base64url'),
      tag: cipher.getAuthTag().toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
    }));
  }
  let pointer = { active: legacyId, previous: null, revision: 1 };
  const storage = {
    async readObject(key) { return objects.get(key) ?? null; },
    async putImmutable(key, value) {
      if (objects.has(key) && objects.get(key) !== value) throw new Error(`Immutable collision: ${key}`);
      objects.set(key, value);
    },
    async readPointer() { return structuredClone(pointer); },
    async compareAndSwapPointer(revision, next) {
      if (pointer.revision !== revision) return false;
      pointer = structuredClone(next);
      return true;
    },
  };
  const staged = await repackActiveSiteSnapshot(storage, encryptionKey, { activate: false });
  assert.equal(staged.status, 'staged');
  assert.equal((await storage.readPointer()).active, legacyId);
  const result = await repackActiveSiteSnapshot(storage, encryptionKey, {
    expectedSourceSnapshotId: staged.oldSnapshotId,
    expectedCandidateSnapshotId: staged.newSnapshotId,
  });
  assert.equal(result.oldSnapshotId, legacyId);
  assert.equal(result.newSnapshotId, currentManifest.snapshotId);
  assert.equal(result.previousSnapshotId, legacyId);
  assert.equal(result.encoding, 'gzip');
  assert.equal(await readPublishedSiteFile(storage, 'drops.json', { encryptionKey }), sourceFiles['drops.json']);
});
