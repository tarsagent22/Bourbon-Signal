import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compactBrowserDiscoveryResult,
  createBrowserDiscoveryPlan,
  groupSourcesByDomain,
  removeEphemeralProfile,
} from '../src/browser-source-discovery.mjs';
import { BrowserPage, filterBrowserExecutableCandidates, settleWaitRemaining } from '../src/core/browser-session.mjs';

test('browser executable discovery rejects missing foreign-platform absolute paths', () => {
  const existing = new Set(['/usr/bin/google-chrome']);
  const candidates = filterBrowserExecutableCandidates([
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
  ], { exists: (candidate) => existing.has(candidate) });
  assert.deepEqual(candidates, ['/usr/bin/google-chrome']);
});

test('browser profile cleanup retries transient runner races without failing successful evidence', async () => {
  let calls = 0;
  const removed = await removeEphemeralProfile('/tmp/profile', {
    remove: async () => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error('busy'), { code: 'ENOTEMPTY' });
    },
    wait: async () => {},
  });
  assert.equal(removed, true);
  assert.equal(calls, 3);
});

test('browser discovery plan uses a strict candidate/source allowlist and bounded limits', () => {
  const plan = createBrowserDiscoveryPlan({
    stateIds: ['OR'],
    registryStates: [{ state: 'OR', lifecycleStage: 'discovery' }],
    sourceByState: new Map([['OR', [{ label: 'Official Oregon source', url: 'https://oregon.example/search' }]]]),
    maxStates: 1,
    maxSourcesPerState: 1,
    maxPages: 1,
    maxDurationMs: 30_000,
  });
  assert.equal(plan.profileMode, 'ephemeral_isolated');
  assert.equal(plan.sources.length, 1);
  assert.throws(() => createBrowserDiscoveryPlan({ ...plan, stateIds: ['ZZ'] }), /allowlist|unknown/i);
});

test('browser result retention is compact endpoint evidence only, never raw rendered HTML/text', () => {
  const compact = compactBrowserDiscoveryResult({
    state: 'OR',
    source: { label: 'Official Oregon source', url: 'https://oregon.example/search' },
    page: {
      url: 'https://oregon.example/search', title: 'Search', text: 'private rendered body', htmlSample: '<html>private rendered body</html>',
      resources: [{ name: 'https://oregon.example/api/products?sku=123&apiKey=secret-value', initiatorType: 'fetch' }],
    },
    network: [
      { url: 'https://oregon.example/api/products?sku=123&apiKey=secret-value', type: 'Network.responseReceived', status: 200 },
      { url: 'https://cdn.example.com/product_details/123/large.png', type: 'Network.requestWillBeSent', resourceType: 'Image' },
      { url: 'https://www.google-analytics.com/g/collect?product=123', type: 'Network.responseReceived', status: 204, resourceType: 'Fetch' },
    ],
  });
  assert.equal(compact.page.text, undefined);
  assert.equal(compact.page.htmlSample, undefined);
  assert.deepEqual(compact.endpointCandidates, [{ url: 'https://oregon.example/api/products?sku=%5BVALUE%5D&apiKey=%5BREDACTED%5D', method: null, status: 200, resourceType: null }]);
});

test('query-driven endpoints are classified before all values are redacted', () => {
  const compact = compactBrowserDiscoveryResult({
    state: 'GA',
    source: { label: 'Official', url: 'https://retailer.example' },
    page: { url: 'https://retailer.example' },
    network: [{ url: 'https://retailer.example/data?kind=product&visitor=private-id', resourceType: 'XHR', status: 200 }],
  });
  assert.deepEqual(compact.endpointCandidates, [{
    url: 'https://retailer.example/data?kind=%5BVALUE%5D&visitor=%5BVALUE%5D',
    method: null,
    status: 200,
    resourceType: 'XHR',
  }]);
});

test('browser discovery groups the same domain sequentially and bounds independent-domain concurrency', () => {
  const groups = groupSourcesByDomain([
    { source: { url: 'https://a.example/one' } },
    { source: { url: 'https://b.example/two' } },
    { source: { url: 'https://a.example/three' } },
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.find((group) => group.domain === 'a.example').items.map((item) => item.source.url), [
    'https://a.example/one',
    'https://a.example/three',
  ]);
  const plan = createBrowserDiscoveryPlan({
    stateIds: ['OR'],
    registryStates: [{ state: 'OR' }],
    sourceByState: new Map([['OR', [
      { url: 'https://a.example/one' },
      { url: 'https://b.example/two' },
      { url: 'https://c.example/three' },
      { url: 'https://d.example/four' },
    ]]]),
    maxStates: 1,
    maxSourcesPerState: 4,
    maxPages: 4,
    concurrency: 99,
  });
  assert.equal(plan.concurrency, 3);
  assert.equal(plan.perDomainConcurrency, 1);
});

test('browser discovery fail-closed interception blocks heavy resource types and allows scripts and API traffic', async () => {
  const page = new BrowserPage('ws://example.test');
  const calls = [];
  page.send = async (method, params) => { calls.push({ method, params }); return {}; };
  await page.configureEndpointDiscovery();
  const enabled = calls.find((call) => call.method === 'Fetch.enable');
  assert.ok(enabled);
  const blockedTypes = enabled.params.patterns.map((pattern) => pattern.resourceType).sort();
  assert.deepEqual(blockedTypes, ['Font', 'Image', 'Media', 'Stylesheet']);
  assert.ok(blockedTypes.every((type) => !['Script', 'XHR', 'Fetch'].includes(type)));
  const blockedOrigins = calls.find((call) => call.method === 'Network.setBlockedURLs');
  assert.ok(blockedOrigins.params.urls.some((url) => url.includes('google-analytics')));

  calls.length = 0;
  await page.routeEndpointDiscoveryResource({ requestId: 'image-1', resourceType: 'Image', request: { url: 'https://cdn.example/extensionless' } });
  await page.routeEndpointDiscoveryResource({ requestId: 'script-1', resourceType: 'Script', request: { url: 'https://retailer.example/app' } });
  assert.equal(calls[0].method, 'Fetch.failRequest');
  assert.equal(calls[1].method, 'Fetch.continueRequest');

  const unsupported = new BrowserPage('ws://example.test');
  unsupported.send = async () => { throw new Error('Fetch interception unavailable'); };
  await assert.rejects(() => unsupported.configureEndpointDiscovery(), /interception unavailable/iu);
});

test('adaptive browser settle waits only for the remaining quiet window', () => {
  assert.equal(settleWaitRemaining({ nowMs: 1_000, lastActivityMs: 900, idleMs: 400, maxWaitRemainingMs: 2_000 }), 300);
  assert.equal(settleWaitRemaining({ nowMs: 1_500, lastActivityMs: 900, idleMs: 400, maxWaitRemainingMs: 2_000 }), 0);
  assert.equal(settleWaitRemaining({ nowMs: 1_000, lastActivityMs: 900, idleMs: 400, maxWaitRemainingMs: 150 }), 150);
});
