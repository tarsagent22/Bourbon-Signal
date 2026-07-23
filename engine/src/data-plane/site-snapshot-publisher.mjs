import {
  canonicalJson,
  createSiteSnapshotManifest,
  decryptSnapshotObject,
  encryptSnapshotObject,
  sha256,
  verifySiteSnapshotManifest,
} from './site-snapshot-contract.mjs';

const ACTIVE_POINTER = 'engine/active.json';
const snapshotPrefix = (snapshotId) => `engine/snapshots/${snapshotId}`;
const encryptedKey = (snapshotId, filePath) => `${snapshotPrefix(snapshotId)}/files/${filePath}.enc`;
const manifestKey = (snapshotId) => `${snapshotPrefix(snapshotId)}/manifest.json`;

export class InMemoryObjectStorage {
  #objects = new Map();
  #pointer = null;
  #corruptReadPath;

  constructor(options = {}) {
    this.#corruptReadPath = options.corruptReadPath || null;
  }

  async putImmutable(key, value) {
    const existing = this.#objects.get(key);
    if (existing !== undefined && existing !== value) throw new Error(`Immutable object already exists: ${key}`);
    this.#objects.set(key, value);
  }

  async readObject(key) {
    const value = this.#objects.get(key) ?? null;
    if (value && this.#corruptReadPath && key.includes(this.#corruptReadPath)) return `${value.slice(0, -2)}aa`;
    return value;
  }

  async readPointer() {
    return this.#pointer ? structuredClone(this.#pointer) : null;
  }

  async compareAndSwapPointer(expectedRevision, next) {
    if ((this.#pointer?.revision ?? 0) !== expectedRevision) return false;
    this.#pointer = structuredClone(next);
    this.#objects.set(ACTIVE_POINTER, canonicalJson(next));
    return true;
  }
}

async function verifyReadback(key, raw, verifyExisting) {
  try {
    await verifyExisting(raw);
  } catch (error) {
    throw new Error(`Snapshot readback verification failed for ${key}: ${error instanceof Error ? error.message : 'invalid_object'}`);
  }
}

async function ensureImmutable(storage, key, value, verifyExisting) {
  const existing = await storage.readObject(key);
  if (existing !== null) {
    await verifyReadback(key, existing, verifyExisting);
    return;
  }
  await storage.putImmutable(key, value);
  const readback = await storage.readObject(key);
  if (readback === null) throw new Error(`Snapshot readback missing: ${key}`);
  await verifyReadback(key, readback, verifyExisting);
}

export async function publishSiteSnapshot(storage, files, metadata, options = {}) {
  const manifest = createSiteSnapshotManifest(files, metadata);
  const verified = verifySiteSnapshotManifest(manifest, files);
  if (!verified.ok) throw new Error(`Cannot publish invalid site snapshot: ${verified.reason}`);

  for (const [filePath, expected] of Object.entries(manifest.files)) {
    const plaintext = String(files[filePath]);
    const key = encryptedKey(manifest.snapshotId, filePath);
    await ensureImmutable(storage, key, encryptSnapshotObject(plaintext, options.encryptionKey), async (raw) => {
      const decoded = decryptSnapshotObject(raw, options.encryptionKey);
      if (Buffer.byteLength(decoded) !== expected.bytes || sha256(decoded) !== expected.sha256) {
        throw new Error(`Snapshot readback hash mismatch: ${filePath}`);
      }
    });
  }

  const serializedManifest = canonicalJson(manifest);
  await ensureImmutable(storage, manifestKey(manifest.snapshotId), serializedManifest, async (raw) => {
    const parsed = JSON.parse(raw);
    if (canonicalJson(parsed) !== serializedManifest) throw new Error('Snapshot manifest readback mismatch');
  });

  if (options.activate === false) return { status: 'staged', manifest, pointer: await storage.readPointer() };

  const maxAttempts = Number(options.pointerRetries ?? 3) + 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const current = await storage.readPointer();
    if (options.expectedActive !== undefined && current?.active !== options.expectedActive) {
      throw new Error(`Active snapshot changed during publication: expected ${options.expectedActive}, found ${current?.active || 'none'}`);
    }
    if (current?.active === manifest.snapshotId) {
      if (typeof storage.ensurePointerEvent === 'function') await storage.ensurePointerEvent(current);
      return { status: 'already_active', manifest, pointer: current };
    }
    const revision = current?.revision ?? 0;
    const next = {
      contractVersion: 'bourbon-signal-active-pointer-v1',
      active: manifest.snapshotId,
      previous: current?.active ?? null,
      manifestKey: manifestKey(manifest.snapshotId),
      revision: revision + 1,
      snapshotGeneratedAt: manifest.generatedAt,
      snapshotUploadedAt: options.uploadedAt || new Date().toISOString(),
      snapshotActivatedAt: options.activatedAt || new Date().toISOString(),
      lastRollback: null,
    };
    if (await storage.compareAndSwapPointer(revision, next)) return { status: 'published', manifest, pointer: next };
  }
  throw new Error(`Atomic pointer activation failed after ${maxAttempts} attempts`);
}

export async function readPublishedManifest(storage, snapshotId = null) {
  const pointer = snapshotId ? null : await storage.readPointer();
  const active = snapshotId || pointer?.active;
  if (!active) return null;
  const raw = await storage.readObject(manifestKey(active));
  if (!raw) throw new Error(`Active snapshot manifest missing: ${active}`);
  const manifest = JSON.parse(raw);
  if (manifest.snapshotId !== active) throw new Error('Active snapshot manifest identity mismatch');
  return manifest;
}

export async function readPublishedSiteFile(storage, filePath, options = {}) {
  const manifest = await readPublishedManifest(storage, options.snapshotId || null);
  if (!manifest) return null;
  const expected = manifest.files[filePath];
  if (!expected) return null;
  const raw = await storage.readObject(encryptedKey(manifest.snapshotId, filePath));
  if (!raw) throw new Error(`Active snapshot file missing: ${filePath}`);
  const plaintext = decryptSnapshotObject(raw, options.encryptionKey);
  if (Buffer.byteLength(plaintext) !== expected.bytes || sha256(plaintext) !== expected.sha256) throw new Error(`Active snapshot file hash mismatch: ${filePath}`);
  return plaintext;
}

export async function rollbackSiteSnapshot(storage, options = {}) {
  const maxAttempts = Number(options.pointerRetries ?? 3) + 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const current = await storage.readPointer();
    if (options.expectedActive !== undefined && current?.active !== options.expectedActive) {
      return { status: 'active_snapshot_mismatch', pointer: current };
    }
    if (!current?.active) return { status: 'no_active_snapshot', pointer: current };
    if (current.lastRollback?.to === current.active) {
      if (typeof storage.ensurePointerEvent === 'function') await storage.ensurePointerEvent(current);
      return { status: 'already_rolled_back', pointer: current };
    }
    if (!current.previous) return { status: 'no_previous_snapshot', pointer: current };
    await readPublishedManifest(storage, current.previous);
    const next = {
      ...current,
      active: current.previous,
      previous: current.active,
      manifestKey: manifestKey(current.previous),
      revision: current.revision + 1,
      snapshotActivatedAt: options.activatedAt || new Date().toISOString(),
      lastRollback: { from: current.active, to: current.previous, at: options.activatedAt || new Date().toISOString() },
    };
    if (await storage.compareAndSwapPointer(current.revision, next)) return { status: 'rolled_back', pointer: next };
  }
  throw new Error(`Atomic rollback failed after ${maxAttempts} attempts`);
}

export const siteSnapshotObjectKeys = { activePointer: ACTIVE_POINTER, encryptedKey, manifestKey };
