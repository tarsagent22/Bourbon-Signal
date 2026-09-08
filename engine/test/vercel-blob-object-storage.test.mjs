import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';

import { VercelBlobObjectStorage } from '../src/data-plane/vercel-blob-object-storage.mjs';

function fakeBlobApi() {
  const objects = new Map();
  let revision = 0;
  let pointerEventFailures = 0;
  class PreconditionError extends Error {}
  return {
    BlobPreconditionFailedError: PreconditionError,
    async put(pathname, body, options) {
      if (pathname.startsWith('engine/pointer-events/') && pointerEventFailures > 0) {
        pointerEventFailures -= 1;
        throw new Error('transient pointer event failure');
      }
      const current = objects.get(pathname);
      if (current && !options.allowOverwrite) throw new Error('already exists');
      if (options.ifMatch && current?.etag !== options.ifMatch) throw new PreconditionError('etag mismatch');
      revision += 1;
      const value = { body: String(body), etag: `"${createHash('md5').update(String(body)).digest('hex')}"`, url: `https://blob.test/${pathname}`, pathname };
      objects.set(pathname, value);
      return value;
    },
    async list({ prefix }) {
      return { blobs: [...objects.values()].filter((item) => item.pathname.startsWith(prefix)).map(({ body, ...item }) => item) };
    },
    async head(url) {
      const pathname = new URL(url).pathname.slice(1);
      const value = objects.get(pathname);
      if (!value) throw new Error('not found');
      return { ...value };
    },
    async fetcher(url) {
      const pathname = new URL(url).pathname.slice(1);
      const value = objects.get(pathname);
      return { ok: Boolean(value), status: value ? 200 : 404, headers: new Headers(value ? { etag: value.etag } : {}), text: async () => value?.body || '' };
    },
    objects,
    failPointerEvents(count) { pointerEventFailures = count; },
  };
}

test('blob adapter reads exact objects and never overwrites immutable data', async () => {
  const api = fakeBlobApi();
  const storage = new VercelBlobObjectStorage({ blob: api, fetcher: api.fetcher });
  await storage.putImmutable('engine/snapshots/one/manifest.json', '{"one":1}');
  assert.equal(await storage.readObject('engine/snapshots/one/manifest.json'), '{"one":1}');
  await assert.rejects(() => storage.putImmutable('engine/snapshots/one/manifest.json', '{"one":2}'), /exist/i);
});

test('blob pointer compare-and-swap rejects a stale etag', async () => {
  const api = fakeBlobApi();
  const first = new VercelBlobObjectStorage({ blob: api, fetcher: api.fetcher });
  const second = new VercelBlobObjectStorage({ blob: api, fetcher: api.fetcher });
  assert.equal(await first.readPointer(), null);
  assert.equal(await first.compareAndSwapPointer(0, { revision: 1, active: 'one' }), true);
  assert.equal((await first.readPointer()).active, 'one');
  assert.equal((await second.readPointer()).revision, 1);
  api.failPointerEvents(2);
  assert.equal(await first.compareAndSwapPointer(1, { revision: 2, active: 'two' }), true);
  assert.equal([...api.objects.keys()].filter((key) => key.startsWith('engine/pointer-events/')).length, 2);
  assert.equal(await second.compareAndSwapPointer(1, { revision: 2, active: 'stale' }), false);
  assert.equal((await second.readPointer()).active, 'two');
});


test('cached mutable pointer recovers current body from an ETag-bound immutable event', async () => {
  const api = fakeBlobApi();
  const writer = new VercelBlobObjectStorage({ blob: api, fetcher: api.fetcher });
  await writer.readPointer();
  await writer.compareAndSwapPointer(0, { revision: 1, active: 'old' });
  const cached = { ...api.objects.get('engine/active.json') };
  await writer.readPointer();
  await writer.compareAndSwapPointer(1, { revision: 2, active: 'current' });
  const reader = new VercelBlobObjectStorage({ blob: api, fetcher: async (url) => {
    if (new URL(url).pathname === '/engine/active.json') return {
      ok: true, status: 200, headers: new Headers({ etag: cached.etag }), text: async () => cached.body,
    };
    return api.fetcher(url);
  } });
  assert.deepEqual(await reader.readPointer(), { revision: 2, active: 'current' });
  assert.equal(await reader.compareAndSwapPointer(2, { revision: 3, active: 'next' }), true);
});

test('journal recovery fails closed without an event matching current storage version', async () => {
  const api = fakeBlobApi();
  await api.put('engine/active.json', JSON.stringify({ revision: 2, active: 'current' }), { allowOverwrite: true });
  const stale = JSON.stringify({ revision: 1, active: 'old' });
  const reader = new VercelBlobObjectStorage({ blob: api, fetcher: async () => ({
    ok: true, status: 200, headers: new Headers({ etag: '"old-version"' }), text: async () => stale,
  }) });
  await assert.rejects(() => reader.readPointer(), /current.*pointer|pointer.*version/i);
  assert.equal(JSON.parse(api.objects.get('engine/active.json').body).active, 'current');
});

for (const mode of ['competing-write', 'tampered-event', 'wrong-response-version']) {
  test(`immutable pointer recovery preserves fencing: ${mode}`, async () => {
    const api = fakeBlobApi();
    const writer = new VercelBlobObjectStorage({ blob: api, fetcher: api.fetcher });
    await writer.readPointer();
    await writer.compareAndSwapPointer(0, { revision: 1, active: 'old' });
    const cached = { ...api.objects.get('engine/active.json') };
    await writer.readPointer();
    await writer.compareAndSwapPointer(1, { revision: 2, active: 'current' });
    const reader = new VercelBlobObjectStorage({ blob: api, fetcher: async (url) => {
      if (new URL(url).pathname === '/engine/active.json') return {
        ok: true, status: 200, headers: new Headers({ etag: cached.etag }), text: async () => cached.body,
      };
      const response = await api.fetcher(url);
      if (mode === 'tampered-event') return { ...response, text: async () => JSON.stringify({ revision: 99, active: 'forged' }) };
      if (mode === 'wrong-response-version') return { ...response, headers: new Headers({ etag: '"other"' }) };
      return response;
    } });
    if (mode === 'competing-write') {
      assert.equal((await reader.readPointer()).revision, 2);
      await writer.readPointer();
      await writer.compareAndSwapPointer(2, { revision: 3, active: 'competitor' });
      assert.equal(await reader.compareAndSwapPointer(2, { revision: 3, active: 'lost-update' }), false);
      assert.equal(JSON.parse(api.objects.get('engine/active.json').body).active, 'competitor');
    } else {
      await assert.rejects(() => reader.readPointer(), /mismatch/i);
      assert.equal(JSON.parse(api.objects.get('engine/active.json').body).active, 'current');
    }
  });
}
