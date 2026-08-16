import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CITYHIVE_RARE_BRAND_PROBE_POLICY,
  buildCityHiveRareProbeUrls,
} from '../src/collectors/cityhive-rare-probes.mjs';

const EXPECTED_POLICY = {
  GA: {
    '74-package': ['Weller', 'Old Fitzgerald', "Blanton's"],
  },
  TX: {
    'twin-liquors': ['1792', 'Buffalo Trace'],
  },
};

test('rare CityHive probes are restricted to reviewed high-yield source and brand cohorts', () => {
  assert.deepEqual(CITYHIVE_RARE_BRAND_PROBE_POLICY, EXPECTED_POLICY);

  for (const [state, sources] of Object.entries(CITYHIVE_RARE_BRAND_PROBE_POLICY)) {
    assert.ok(['GA', 'TX'].includes(state));
    for (const [sourceId, brands] of Object.entries(sources)) {
      assert.ok(sourceId);
      assert.ok(brands.length >= 2 && brands.length <= 4, `${state}/${sourceId} must remain bounded`);
      assert.equal(new Set(brands).size, brands.length);
      for (const brand of brands) {
        assert.doesNotMatch(brand, /bourbon|whiskey|allocated|rare/i, 'generic category/search terms are forbidden');
      }
    }
  }
});

test('rare CityHive probe URLs preserve the first-party category and bind every request to one exact merchant', () => {
  const urls = buildCityHiveRareProbeUrls({
    state: 'GA',
    sourceId: '74-package',
    categoryUrl: 'https://74package.com/shop/?subtype=bourbon',
    merchantId: '61426e7ac3063702b3ce1fd9',
  });

  assert.equal(urls.length, 4);
  const parsed = urls.map((value) => new URL(value));
  assert.equal(parsed[0].href, 'https://74package.com/shop/?subtype=bourbon&merchant-id=61426e7ac3063702b3ce1fd9');
  assert.deepEqual(parsed.slice(1).map((url) => url.searchParams.get('brands')), EXPECTED_POLICY.GA['74-package']);

  for (const url of parsed) {
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, '74package.com');
    assert.equal(url.pathname, '/shop/');
    assert.equal(url.searchParams.get('subtype'), 'bourbon');
    assert.equal(url.searchParams.get('merchant-id'), '61426e7ac3063702b3ce1fd9');
    assert.equal(url.searchParams.has('search'), false);
    assert.equal(url.searchParams.has('q'), false);
    assert.equal(url.searchParams.has('skip'), false);
  }
});

test('Texas Twin probes remain bounded to one baseline and two reviewed brand requests', () => {
  const urls = buildCityHiveRareProbeUrls({
    state: 'TX',
    sourceId: 'twin-liquors',
    categoryUrl: 'https://twinliquors.com/shop/?subtype=bourbon',
    merchantId: '5af17b54c8852b44f5995f46',
  }).map((value) => new URL(value));
  assert.equal(urls.length, 3);
  assert.deepEqual(urls.slice(1).map((url) => url.searchParams.get('brands')), ['1792', 'Buffalo Trace']);
  for (const url of urls) {
    assert.equal(url.hostname, 'twinliquors.com');
    assert.equal(url.searchParams.get('merchant-id'), '5af17b54c8852b44f5995f46');
  }
});

test('unreviewed sources receive only their existing exact-store category URL', () => {
  const urls = buildCityHiveRareProbeUrls({
    state: 'TN',
    sourceId: 'unreviewed-store',
    categoryUrl: 'https://retailer.example/shop/?subtype=bourbon',
    merchantId: 'merchant-1',
  });
  assert.deepEqual(urls, ['https://retailer.example/shop/?subtype=bourbon&merchant-id=merchant-1']);
});

test('the production Georgia collector invokes the bounded rare-probe builder', async () => {
  const collector = await readFile(new URL('../src/collectors/precision-probes.mjs', import.meta.url), 'utf8');
  assert.match(collector, /buildCityHiveRareProbeUrls/);
  assert.match(collector, /buildCityHiveRareProbeUrls\(\{[\s\S]{0,240}?state:\s*['"]GA['"]/);
});

test('rare CityHive probe builder rejects non-HTTPS, missing merchant, and malformed inputs', () => {
  for (const input of [
    { state: 'GA', sourceId: '74-package', categoryUrl: 'http://74package.com/shop/?subtype=bourbon', merchantId: 'merchant-1' },
    { state: 'GA', sourceId: '74-package', categoryUrl: 'https://74package.com/shop/?subtype=bourbon', merchantId: '' },
    { state: 'GA', sourceId: '74-package', categoryUrl: 'not-a-url', merchantId: 'merchant-1' },
  ]) assert.throws(() => buildCityHiveRareProbeUrls(input));
});
