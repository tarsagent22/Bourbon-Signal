import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createBraveClient, normalizeBraveResult } from '../src/discovery/brave-client.mjs';

test('Brave client uses the direct API once and reuses a normalized-query cache', async (t) => {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'bourbon-brave-'));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));
  const requests = [];
  const client = createBraveClient({
    apiKey: 'test-key',
    cacheDir,
    now: () => new Date('2026-07-16T12:00:00.000Z'),
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return new Response(JSON.stringify({ web: { results: [{ title: 'Colorado Spirits', url: 'https://www.example.test/bourbon', description: 'Colorado bourbon retailer' }] } }), { status: 200 });
    },
  });

  const first = await client.search(' Colorado  bourbon retailers ');
  const second = await client.search('colorado bourbon retailers');

  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /api\.search\.brave\.com/);
  assert.equal(requests[0].options.headers['X-Subscription-Token'], 'test-key');
  assert.equal(first.results[0].url, 'https://example.test/bourbon');
  assert.equal(second.cacheHit, true);
});

test('Brave normalization rejects non-HTTPS and preserves only compact discovery metadata', () => {
  assert.equal(normalizeBraveResult({ title: 'Bad', url: 'http://example.test', description: 'Colorado' }), null);
  const normalized = normalizeBraveResult({
    title: 'Colorado Spirits',
    url: 'https://www.example.test/bourbon#details',
    description: 'Colorado bourbon retailer with a public storefront.',
    age: '2 days ago',
  });
  assert.deepEqual(normalized, {
    title: 'Colorado Spirits',
    url: 'https://example.test/bourbon',
    domain: 'example.test',
    description: 'Colorado bourbon retailer with a public storefront.',
    age: '2 days ago',
  });
});
