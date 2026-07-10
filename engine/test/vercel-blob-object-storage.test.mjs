import assert from 'node:assert/strict';
import test from 'node:test';

import { VercelBlobObjectStorage } from '../src/data-plane/vercel-blob-object-storage.mjs';

function fakeBlobApi() {
  const objects = new Map();
  let revision = 0;
  class PreconditionError extends Error {}
  return {
    BlobPreconditionFailedError: PreconditionError,
    async put(pathname, body, options) {
      const current = objects.get(pathname);
      if (current && !options.allowOverwrite) throw new Error('already exists');
      if (options.ifMatch && current?.etag !== options.ifMatch) throw new PreconditionError('etag mismatch');
      revision += 1;
      const value = { body: String(body), etag: `etag-${revision}`, url: `https://blob.test/${pathname}`, pathname };
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
      return { ok: Boolean(value), status: value ? 200 : 404, text: async () => value?.body || '' };
    },
    objects,
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
  assert.equal(await first.compareAndSwapPointer(1, { revision: 2, active: 'two' }), true);
  assert.equal(await second.compareAndSwapPointer(1, { revision: 2, active: 'stale' }), false);
  assert.equal((await second.readPointer()).active, 'two');
});
