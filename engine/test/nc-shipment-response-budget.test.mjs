import assert from 'node:assert/strict';
import test from 'node:test';
import { readBoundedCollectionBody, DEFAULT_COLLECTION_MAX_BYTES } from '../src/core/collection-http.mjs';
const URL = 'https://abc2.nc.gov/Search/StockShippedData';
function responseAt(url, size, headers = {}) {
  const response = new Response(' '.repeat(size), {headers});
  Object.defineProperty(response, 'url', {value:url});
  return response;
}
test('official NC shipment extract measured at 17057251 decoded bytes survives its bounded reader', async () => {
  assert.equal((await readBoundedCollectionBody(responseAt(URL, 17_057_251))).length, 17_057_251);
});
test('NC shipment budget stays exact-endpoint only and bounded at 32 MiB', async () => {
  for (const url of ['', URL+'?x=1', URL.replace('https:', 'http:'), URL.replace('abc2.nc.gov','abc2.nc.gov.evil.test')]) {
    await assert.rejects(()=>readBoundedCollectionBody(responseAt(url,DEFAULT_COLLECTION_MAX_BYTES+1)),/exceeded 8388608/);
  }
  await assert.rejects(()=>readBoundedCollectionBody(responseAt(URL,1,{'content-length':String(32*1024*1024+1)})),/exceeded 33554432/);
  await assert.rejects(()=>readBoundedCollectionBody(responseAt(URL,32*1024*1024+1)),/exceeded 33554432/);
  await assert.rejects(()=>readBoundedCollectionBody(responseAt(URL,101),{maxBytes:100}),/exceeded 100/);
  await assert.rejects(()=>readBoundedCollectionBody(responseAt(URL,1),{signal:AbortSignal.abort()}),/abort/i);
});
