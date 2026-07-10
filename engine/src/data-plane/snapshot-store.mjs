import { canonicalJson, verifySnapshot } from './snapshot-contract.mjs';

const snapshotKey = (hash) => `snapshots/${hash}.json`;

function parseAndVerify(raw, expectedHash) {
  let snapshot;
  try {
    snapshot = JSON.parse(raw);
  } catch {
    throw new Error('Snapshot readback verification failed: invalid_json');
  }
  const verified = verifySnapshot(snapshot);
  if (!verified.ok || snapshot.hash !== expectedHash) {
    throw new Error(`Snapshot readback verification failed: ${verified.reason || 'identity_mismatch'}`);
  }
  return snapshot;
}

export class InMemorySnapshotStorage {
  #objects = new Map();
  #pointer = null;
  #conflicts;
  #corruptReads;

  constructor(options = {}) {
    this.#conflicts = Number(options.conflicts || 0);
    this.#corruptReads = options.corruptReads === true;
  }

  async putImmutable(key, value) {
    const current = this.#objects.get(key);
    if (current !== undefined && current !== value) throw new Error(`Immutable object already exists at ${key}`);
    this.#objects.set(key, value);
  }

  async readImmutable(key) {
    const value = this.#objects.get(key) ?? null;
    if (value && this.#corruptReads) return `${value.slice(0, -1)},"corrupt":true}`;
    return value;
  }

  async readPointer() {
    return this.#pointer ? structuredClone(this.#pointer) : null;
  }

  async compareAndSwapPointer(expectedRevision, next) {
    if (this.#conflicts > 0) {
      this.#conflicts -= 1;
      return false;
    }
    const currentRevision = this.#pointer?.revision ?? 0;
    if (currentRevision !== expectedRevision) return false;
    this.#pointer = structuredClone(next);
    return true;
  }
}

export async function publishSnapshot(storage, snapshot, options = {}) {
  const verified = verifySnapshot(snapshot);
  if (!verified.ok) throw new Error(`Cannot publish invalid snapshot: ${verified.reason}`);
  const serialized = canonicalJson(snapshot);
  const key = snapshotKey(snapshot.hash);
  await storage.putImmutable(key, serialized);
  const readback = await storage.readImmutable(key);
  if (typeof readback !== 'string') throw new Error('Snapshot readback verification failed: missing');
  parseAndVerify(readback, snapshot.hash);

  const maxAttempts = Number(options.pointerRetries ?? 3) + 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const current = await storage.readPointer();
    if (current?.active === snapshot.hash) return { status: 'already_active', hash: snapshot.hash, pointer: current };
    const revision = current?.revision ?? 0;
    const next = {
      contractVersion: 'bourbon-signal-pointer-v1',
      active: snapshot.hash,
      previous: current?.active ?? null,
      revision: revision + 1,
      updatedAt: snapshot.generatedAt,
      lastRollback: null,
    };
    if (await storage.compareAndSwapPointer(revision, next)) {
      return { status: 'published', hash: snapshot.hash, pointer: next };
    }
  }
  throw new Error(`Atomic pointer update failed after ${maxAttempts} attempts`);
}

export async function readActiveSnapshot(storage) {
  const pointer = await storage.readPointer();
  if (!pointer?.active) return null;
  const raw = await storage.readImmutable(snapshotKey(pointer.active));
  if (typeof raw !== 'string') throw new Error(`Active snapshot missing: ${pointer.active}`);
  return parseAndVerify(raw, pointer.active);
}

export async function rollbackSnapshot(storage, options = {}) {
  const maxAttempts = Number(options.pointerRetries ?? 3) + 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const current = await storage.readPointer();
    if (!current?.active) return { status: 'no_active_snapshot', pointer: current };
    if (current.lastRollback?.to === current.active) return { status: 'already_rolled_back', pointer: current };
    if (!current.previous) return { status: 'no_previous_snapshot', pointer: current };

    const raw = await storage.readImmutable(snapshotKey(current.previous));
    if (typeof raw !== 'string') throw new Error(`Rollback snapshot missing: ${current.previous}`);
    parseAndVerify(raw, current.previous);
    const next = {
      ...current,
      active: current.previous,
      previous: current.active,
      revision: current.revision + 1,
      updatedAt: options.now ?? new Date().toISOString(),
      lastRollback: { from: current.active, to: current.previous },
    };
    if (await storage.compareAndSwapPointer(current.revision, next)) {
      return { status: 'rolled_back', pointer: next };
    }
  }
  throw new Error(`Atomic rollback failed after ${maxAttempts} attempts`);
}
