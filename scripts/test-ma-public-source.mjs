import assert from 'node:assert/strict';
import { test } from 'node:test';
import { probeMassachusettsSource, SOURCE_URLS } from './probe-ma-public-source.mjs';

const product = { id: 12051, name: 'Elijah Craig Small Batch Bourbon', permalink: SOURCE_URLS[3],
  is_in_stock: true, is_purchasable: true, is_on_backorder: false, prices: { price: '3999', currency_code: 'USD' } };
const reply = (url, value = product) => new Response(url.includes('/wp-json/') ? JSON.stringify(value) : '<html>Public store page</html>');

test('fixed unauthenticated GETs produce research evidence, never fulfillment', async () => {
  const calls = [];
  const result = await probeMassachusettsSource({ fetchImpl: async (url, options) => {
    calls.push(url); assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    assert.equal(options.headers, undefined); return reply(url);
  } });
  assert.deepEqual(calls, SOURCE_URLS);
  assert.equal(result.runnerReachable, true);
  assert.equal(result.inventoryEvidence, false);
  assert.equal(result.promotionEligible, false);
  assert.equal(result.observations[2].product.isOnBackorder, false);
});

test('blocked or redirected sources fail without retaining server text or error secrets', async () => {
  const result = await probeMassachusettsSource({ fetchImpl: async url => {
    if (url.includes('/wp-json/')) throw new Error('redirect contains secret');
    return new Response('private diagnostic', { status: 403 });
  } });
  assert.equal(result.runnerReachable, false);
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.equal(JSON.stringify(result).includes('private diagnostic'), false);
  assert.equal(result.observations[0].error, 'public_source_http_403');
});

test('unexpected catalog identity and missing stock fields cannot establish stock', async () => {
  const wrong = await probeMassachusettsSource({ fetchImpl: async url => reply(url, { ...product, id: 2 }) });
  assert.equal(wrong.runnerReachable, false);
  assert.equal(wrong.observations[2].product, null);
  const missing = await probeMassachusettsSource({ fetchImpl: async url => reply(url, { id: 12051, permalink: SOURCE_URLS[3] }) });
  assert.equal(missing.observations[2].product.isInStock, false);
  assert.equal(missing.observations[2].product.isPurchasable, false);
  assert.equal(missing.observations[2].product.isOnBackorder, true);
});

test('oversized responses are bounded and never accepted', async () => {
  const result = await probeMassachusettsSource({ fetchImpl: async () => new Response('x'.repeat(2_000_001)) });
  assert.equal(result.runnerReachable, false);
  assert.ok(result.observations.every(row => row.error === 'response_size_limit' && row.sha256 === null));
});
