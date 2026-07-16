import assert from 'node:assert/strict';
import test from 'node:test';

import { createBoundedHttpClient } from '../src/discovery/probe-http.mjs';
import { probeSource } from '../src/discovery/probe-source.mjs';

const publicDns = async () => [{ address: '8.8.8.8', family: 4 }];

test('HTTP-first probes classify catalog surfaces without granting alert-grade status', async () => {
  const calls = [];
  const result = await probeSource({
    url: 'https://shop.example/collections/bourbon',
    state: 'CO',
    sourceClass: 'retailer_storefront',
  }, {
    httpClient: createBoundedHttpClient({
      resolveHost: publicDns,
      fetchImpl: async (url, options) => {
        calls.push({ url: String(url), options });
        return new Response('<html><script src="https://cdn.shopify.com/store.js"></script>bourbon catalog</html>', { status: 200, headers: { 'content-type': 'text/html' } });
      },
    }),
  });
  assert.equal(result.resultClass, 'catalog_watch');
  assert.equal(result.alertGrade, false);
  assert.equal(result.promotionEligible, false);
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.redirect, 'manual');
});

test('probe ladder fails closed on blocked/login surfaces and only escalates after deterministic routes fail', async () => {
  const blocked = await probeSource({ url: 'https://blocked.example/login', state: 'NH' }, {
    httpClient: createBoundedHttpClient({ resolveHost: publicDns, fetchImpl: async () => new Response('Cloudflare access denied', { status: 403 }) }),
  });
  assert.equal(blocked.resultClass, 'blocked_terms_identity_ambiguity');
  assert.equal(blocked.browserEscalationEligible, false);
  assert.equal(blocked.alertGrade, false);

  const dynamic = await probeSource({ url: 'https://dynamic.example/bourbon', state: 'OR' }, {
    httpClient: createBoundedHttpClient({ resolveHost: publicDns, fetchImpl: async () => new Response('<div id="root"></div><script src="/app.js"></script>', { status: 200 }) }),
  });
  assert.equal(dynamic.resultClass, 'browser_escalation_required');
  assert.equal(dynamic.browserEscalationEligible, true);
});

test('bounded HTTP client rejects insecure URLs and per-host budget overruns', async () => {
  const client = createBoundedHttpClient({
    perHostRequestBudget: 1,
    resolveHost: publicDns,
    fetchImpl: async () => new Response('{}', { status: 200 }),
  });
  await assert.rejects(() => client.get('http://insecure.example/'), /HTTPS/);
  await client.get('https://budget.example/one');
  await assert.rejects(() => client.get('https://budget.example/two'), /budget/i);
});

test('bounded HTTP client blocks private, loopback, and private redirect destinations before fetch', async () => {
  let fetchCalls = 0;
  const privateClient = createBoundedHttpClient({
    resolveHost: async () => [{ address: '127.0.0.1', family: 4 }],
    fetchImpl: async () => { fetchCalls += 1; return new Response('{}'); },
  });
  await assert.rejects(() => privateClient.get('https://private.example/'), /public internet host/i);
  assert.equal(fetchCalls, 0);

  const redirectClient = createBoundedHttpClient({
    resolveHost: async (host) => [{ address: host === 'public.example' ? '1.1.1.1' : '10.0.0.8', family: 4 }],
    fetchImpl: async () => { fetchCalls += 1; return new Response('', { status: 302, headers: { location: 'https://internal.example/secret' } }); },
  });
  await assert.rejects(() => redirectClient.get('https://public.example/start'), /public internet host/i);
  assert.equal(fetchCalls, 1);
});
