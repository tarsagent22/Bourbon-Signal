import assert from 'node:assert/strict';
import test from 'node:test';
import { readBoundedCollectionBody, DEFAULT_COLLECTION_MAX_BYTES } from '../src/core/collection-http.mjs';
import { fetchWithMeta } from '../src/core/fetcher.mjs';

const WAREHOUSE_URL = 'https://abc2.nc.gov/StoresBoards/Stocks';
const WAREHOUSE_LIMIT = 16 * 1024 * 1024;
function responseAt(url, size, headers = {}) {
  const response = new Response(' '.repeat(size), { headers });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

test('official NC warehouse page above 8 MiB survives the configured fetch path', async (t) => {
  // The real official page measured 8,486,335 decoded bytes on 2026-09-08.
  const size = 8_486_335;
  t.mock.method(globalThis, 'fetch', async () => responseAt(WAREHOUSE_URL, size));
  const result = await fetchWithMeta(WAREHOUSE_URL);
  assert.equal(result.ok, true, result.error);
  assert.equal(result.bytes, size);
});

test('NC warehouse exception does not widen other URLs or unknown responses', async () => {
  for (const url of ['', 'https://abc2.nc.gov/StoresBoards/BoardList',
    'https://abc2.nc.gov.evil.test/StoresBoards/Stocks',
    'https://other.test/StoresBoards/Stocks', 'http://abc2.nc.gov/StoresBoards/Stocks',
    `${WAREHOUSE_URL}?unreviewed=1`, 'https://user@abc2.nc.gov/StoresBoards/Stocks']) {
    await assert.rejects(() => readBoundedCollectionBody(responseAt(url, DEFAULT_COLLECTION_MAX_BYTES + 1)), /exceeded 8388608 bytes/);
  }
});

test('NC warehouse remains bounded on decoded streams and Content-Length', async () => {
  await assert.rejects(() => readBoundedCollectionBody(responseAt(WAREHOUSE_URL, WAREHOUSE_LIMIT + 1)), /exceeded 16777216 bytes/);
  const response = responseAt(WAREHOUSE_URL, 1, { 'content-length': String(WAREHOUSE_LIMIT + 1) });
  await assert.rejects(() => readBoundedCollectionBody(response), /exceeded 16777216 bytes/);
  assert.equal(response.body.locked, false);
});

test('explicit tighter limits and aborts still override the NC warehouse budget', async () => {
  await assert.rejects(() => readBoundedCollectionBody(responseAt(WAREHOUSE_URL, 101), { maxBytes: 100 }), /exceeded 100 bytes/);
  await assert.rejects(() => readBoundedCollectionBody(responseAt(WAREHOUSE_URL, 1), { signal: AbortSignal.abort() }), /abort/i);
});
