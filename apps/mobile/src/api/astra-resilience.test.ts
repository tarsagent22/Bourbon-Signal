import assert from 'node:assert/strict';
import test from 'node:test';
import { createMobileApi, MobileApiError } from './client';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
test('M04: shared catalog attempt expires, aborts transport and permits retry', async () => {
  let calls = 0; let aborted = false;
  const api = createMobileApi({ baseUrl: 'https://deadline.invalid', getToken: async () => 'A', requestTimeoutMs: 20,
    fetcher: async request => { calls++; if (calls > 1) return Response.json({ bottles: [] });
      new Request(request).signal.addEventListener('abort', () => { aborted = true; });
      return new Promise(() => {});
    } });
  const results = await Promise.race([Promise.allSettled([api.listBottleCatalog(), api.listBottleCatalog()]), sleep(150).then(() => 'hung')]);
  assert.notEqual(results, 'hung'); assert.equal(calls, 1); assert.equal(aborted, true);
  for (const result of results as PromiseSettledResult<unknown>[]) {
    assert.equal(result.status, 'rejected');
    if (result.status === 'rejected') assert.equal(result.reason.code, 'REQUEST_TIMEOUT');
  }
  assert.deepEqual(await api.listBottleCatalog(), []); assert.equal(calls, 2);
});
test('M04: token acquisition and response body are deadline bounded', async () => {
  for (const phase of ['token', 'body']) {
    const api = createMobileApi({ requestTimeoutMs: 15, getToken: () => phase === 'token' ? new Promise(() => {}) : Promise.resolve('A'),
      fetcher: async () => ({ ok: true, json: () => new Promise(() => {}) } as Response) });
    const result = await Promise.race([api.getMemberAlerts().catch(e => e), sleep(120).then(() => 'hung')]);
    assert.ok(result instanceof MobileApiError); assert.equal(result.code, 'REQUEST_TIMEOUT');
  }
});
test('M04: cancelling a catalog consumer does not cancel shared transport', async () => {
  let finish!: (r: Response) => void;
  const api = createMobileApi({ baseUrl: 'https://cancel.invalid', getToken: async () => 'A', fetcher: () => new Promise(r => { finish = r; }) });
  const controller = new AbortController();
  const cancelled = api.listBottleCatalog({ signal: controller.signal });
  const remaining = api.listBottleCatalog();
  await sleep(1); controller.abort(); finish(Response.json({ bottles: [] }));
  await assert.rejects(cancelled, (e: MobileApiError) => e.code === 'REQUEST_CANCELLED');
  assert.deepEqual(await remaining, []);
});
test('M11: unique reads are bounded, expired reads evicted and credentials absent from keys', async () => {
  let now = 0; let token = 'secret-A'; let calls = 0;
  const api = createMobileApi({ getToken: async () => token, now: () => now, maxReadCacheEntries: 8,
    fetcher: async () => { calls++; return Response.json({ bottles: [] }); } });
  for (let i = 0; i < 1000; i++) await api.listRadarBottles({ query: String(i) });
  assert.equal(api.readCacheInfo().size, 8);
  assert.ok(api.readCacheInfo().keys.every(k => !k.includes('secret')));
  now = 11000; await api.listRadarBottles({ query: 'last' }); assert.equal(api.readCacheInfo().size, 1);
  token = 'secret-B'; await api.listRadarBottles({ query: 'last' }); assert.equal(calls, 1002);
  api.clearReadCache(); assert.equal(api.readCacheInfo().size, 0);
});

test('M04: network errors are typed and uploads cannot hold saving forever', async () => {
  const network = createMobileApi({ getToken: async () => 'A', fetcher: async () => { throw new TypeError('Network request failed'); } });
  await assert.rejects(network.getMemberAlerts(), (e: unknown) => e instanceof MobileApiError && e.code === 'NETWORK_ERROR' && e.retryable);
  const upload = createMobileApi({ getToken: async () => 'A', requestTimeoutMs: 15, blobUploader: () => new Promise(() => {}) });
  const result = await Promise.race([upload.uploadSightingPhoto('sighting_a', new Blob(['jpeg'])).catch(e => e), sleep(120).then(() => 'hung')]);
  assert.ok(result instanceof MobileApiError); assert.equal(result.code, 'REQUEST_TIMEOUT');
});
test('M04: cancelling an authenticated read detaches only that consumer', async () => {
  let finish!: (r: Response) => void;
  const api = createMobileApi({ getToken: async () => 'A', fetcher: () => new Promise(r => { finish = r; }) });
  const abort = new AbortController(); const first = api.getMemberAlerts({ signal: abort.signal }); const second = api.getMemberAlerts();
  await sleep(1); abort.abort(); finish(Response.json({ alerts: [], unreadCount: 0 }));
  await assert.rejects(first, (e: MobileApiError) => e.code === 'REQUEST_CANCELLED'); assert.equal((await second).unreadCount, 0);
});
