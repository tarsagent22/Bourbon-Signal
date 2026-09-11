import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const load = () => import(new URL('./cache.ts', import.meta.url).href).then(m => m.default ?? m);
const data = () => JSON.parse(readFileSync(new URL('../../../../public/bottle-photos/registry.v1.json', import.meta.url), 'utf8'));
const memory = (initial: string | null = null) => {
  let value = initial;
  return { getItem: async (_key: string) => value, setItem: async (_key: string, next: string) => { value = next; }, value: () => value };
};

test('demand cache exists', async () => {
  const api = await load().catch(() => null);
  assert.equal(typeof api?.createPhotoRegistryCache, 'function', 'missing deduplicated persistent registry cache');
});

test('no eager fetch; 50 parallel cards and later mounts make one public metadata request per app', async () => {
  const { createPhotoRegistryCache, PHOTO_REGISTRY_URL } = await load();
  let calls = 0;
  const storage = memory();
  const cache = createPhotoRegistryCache({ storage, fetcher: async (url: string, options: RequestInit) => {
    calls++;
    assert.equal(url, 'https://www.bourbonsignal.com/bottle-photos/registry.v1.json');
    assert.equal(url, PHOTO_REGISTRY_URL);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    return { ok: true, json: async () => data() };
  } });
  assert.equal(calls, 0);
  const results = await Promise.all(Array.from({ length: 50 }, () => cache.load()));
  assert.equal(calls, 1);
  assert.equal(results[0].entries.length, data().entries.length);
  assert.ok(results.every(value => value === results[0]));
  assert.equal(await cache.load(), results[0]);
  assert.deepEqual(JSON.parse(storage.value()!), data());
});

test('restart offline serves validated persistent metadata; invalid cache and HTTP failures fall back without storms', async () => {
  const { createPhotoRegistryCache } = await load();
  let calls = 0;
  const offline = async () => { calls++; throw new Error('offline'); };
  const cache = createPhotoRegistryCache({ storage: memory(JSON.stringify(data())), fetcher: offline });
  assert.deepEqual(await cache.load(), data());
  assert.deepEqual(await cache.load(), data());
  assert.equal(calls, 1);
  for (const initial of [null, '{bad', JSON.stringify({ ...data(), schemaVersion: 999 }), JSON.stringify({ ...data(), sourcePage: 'private' })]) {
    const broken = createPhotoRegistryCache({ storage: memory(initial), fetcher: async () => ({ ok: false }) });
    assert.equal(await broken.load(), undefined);
    assert.equal(await broken.load(), undefined);
  }
});

test('new app fetches a newer web registry without any bundled registry; invalid network cannot poison saved data', async () => {
  const { createPhotoRegistryCache } = await load();
  const storage = memory(JSON.stringify(data()));
  const next = { ...data(), revision: '1'.repeat(64), entries: data().entries.slice(0, 1) };
  const app = createPhotoRegistryCache({ storage, fetcher: async () => ({ ok: true, json: async () => next }) });
  assert.deepEqual(await app.load(), next);
  const broken = createPhotoRegistryCache({ storage, fetcher: async () => ({ ok: true, json: async () => ({ ...next, url: 'http://evil.test' }) }) });
  assert.deepEqual(await broken.load(), next);
  assert.deepEqual(JSON.parse(storage.value()!), next);
});

test('storage failures do not suppress valid network data; stalled network resolves cached fallback within timeout', async () => {
  const { createPhotoRegistryCache } = await load();
  const brokenStorage = { getItem: async () => { throw Error('disk'); }, setItem: async () => { throw Error('disk'); } };
  const online = createPhotoRegistryCache({ storage: brokenStorage, fetcher: async () => ({ ok: true, json: async () => data() }) });
  assert.deepEqual(await online.load(), data());
  const stalled = createPhotoRegistryCache({ storage: memory(JSON.stringify(data())), timeoutMs: 10, fetcher: () => new Promise(() => {}) });
  assert.deepEqual(await stalled.load(), data());
});

test('component demands cached photo, handles image errors, preserves static pilots and exact sizing', () => {
  const component = readFileSync(new URL('../components/CellarBottleArtwork.tsx', import.meta.url), 'utf8');
  assert.match(component, /useBottlePhoto/);
  assert.match(component, /!bottle.bottleId && !bottle.bottleName/, 'key-only input must not select even a static pilot');
  assert.match(component, /onError=/);
  assert.match(component, /cache: "force-cache"/);
  for (const style of ['gridFrame: { width: 80, height: 116', 'gridArtwork: { width: 80, height: 116 }', 'listFrame: { width: 44, height: 62', 'listArtwork: { width: 44, height: 62 }']) assert.ok(component.includes(style));
  assert.match(component, /resizeMode="contain"/);
  assert.equal((component.match(/require\("\.\.\/\.\.\/assets\/bottles\/photos\//g) || []).length, 6);
});
