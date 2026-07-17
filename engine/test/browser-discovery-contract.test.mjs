import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compactBrowserDiscoveryResult,
  createBrowserDiscoveryPlan,
} from '../src/browser-source-discovery.mjs';
import { filterBrowserExecutableCandidates } from '../src/core/browser-session.mjs';

test('browser executable discovery rejects missing foreign-platform absolute paths', () => {
  const existing = new Set(['/usr/bin/google-chrome']);
  const candidates = filterBrowserExecutableCandidates([
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
  ], { exists: (candidate) => existing.has(candidate) });
  assert.deepEqual(candidates, ['/usr/bin/google-chrome']);
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
      resources: [{ name: 'https://oregon.example/api/products', initiatorType: 'fetch' }],
    },
    network: [{ url: 'https://oregon.example/api/products', type: 'Network.responseReceived', status: 200 }],
  });
  assert.equal(compact.page.text, undefined);
  assert.equal(compact.page.htmlSample, undefined);
  assert.deepEqual(compact.endpointCandidates, [{ url: 'https://oregon.example/api/products', method: null, status: 200, resourceType: null }]);
});
