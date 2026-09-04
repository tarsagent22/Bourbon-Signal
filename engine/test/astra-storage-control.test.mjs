import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { VercelBlobObjectStorage } from '../src/data-plane/vercel-blob-object-storage.mjs';
import { acquireRefreshControlPlane, renewRefreshControlLease } from '../src/refresh-control-plane.mjs';

// Local fake provider interleavings, not provider/live proof.
function provider({ missingEtag = false, competeOnGet = false, competeOnPut = false } = {}) {
  let current = { revision: 1, active: 'old' }, version = 1, writes = 0;
  class Precondition extends Error {}
  const commit = () => { current = { revision: ++version, active: 'competitor' }; };
  const api = {
    BlobPreconditionFailedError: Precondition,
    list: async () => ({ blobs: [{ pathname: 'engine/active.json', url: 'https://fixture.invalid/active' }] }),
    head: async () => ({ etag: `v${version}` }),
    put: async (key, body, options) => {
      if (key !== 'engine/active.json') return {};
      if (options.ifMatch !== `v${version}`) throw new Precondition();
      writes++; current = JSON.parse(body); version++;
      if (competeOnPut) commit();
      return { url: 'https://fixture.invalid/active' };
    },
  };
  const fetcher = async () => {
    const body = JSON.stringify(current), etag = `v${version}`;
    if (competeOnGet) { competeOnGet = false; commit(); }
    return { ok: true, status: 200, headers: new Headers(missingEtag ? {} : { etag }), text: async () => body };
  };
  return { storage: new VercelBlobObjectStorage({ blob: api, fetcher }), current: () => current, writes: () => writes };
}
test('E05 competing commit between GET and metadata cannot be overwritten', async () => {
  const p = provider({ competeOnGet: true });
  const read = await p.storage.readPointer();
  assert.equal(read.revision, 1);
  assert.equal(await p.storage.compareAndSwapPointer(1, { revision: 2, active: 'candidate' }), false);
  assert.equal(p.current().active, 'competitor');
});
test('E05 missing same-response version fails closed before a pointer write', async () => {
  const p = provider({ missingEtag: true });
  await assert.rejects(() => p.storage.readPointer(), /etag|version/i);
  assert.equal(p.writes(), 0);
});
test('E05 post-write HEAD cannot seed a later CAS with a competing version', async () => {
  const p = provider({ competeOnPut: true });
  await p.storage.readPointer();
  assert.equal(await p.storage.compareAndSwapPointer(1, { revision: 2, active: 'candidate' }), true);
  assert.equal(await p.storage.compareAndSwapPointer(2, { revision: 3, active: 'lost-update' }), false);
  assert.equal(p.current().active, 'competitor');
});
test('E06 different scope cannot replace a live owner; dead owner is fenced', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'astra-control-'));
  try {
    const statePath = path.join(dir, 'control.json');
    const args = { statePath, stages: ['collect'], now: '2026-09-04T20:00:00Z', ownerAlive: () => true };
    const first = await acquireRefreshControlPlane({ ...args, scope: { states: ['NC'] } });
    const second = await acquireRefreshControlPlane({ ...args, scope: { states: ['OH'] } });
    assert.equal(second.acquired, false);
    const replacement = await acquireRefreshControlPlane({ ...args, scope: { states: ['OH'] }, ownerAlive: () => false });
    assert.equal(replacement.acquired, true);
    await assert.rejects(() => renewRefreshControlLease({ statePath, leaseId: first.session.lease.leaseId }), /fenced/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
