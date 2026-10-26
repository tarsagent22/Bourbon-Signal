import test from 'node:test';
import assert from 'node:assert/strict';

import { METRO_RETAILER_SOURCES, parseMetroCityHiveHtml, mergeMetroSourceCacheSignals } from '../src/collectors/metro-retailer-surfaces.mjs';
import { collectMetroCityHiveRows, selectMetroSourcesForRefresh } from '../src/collectors/buffalo-cityhive-discovery.mjs';
import { metroCityHiveDepthPolicy } from '../src/collectors/metro-cityhive-depth-policy.mjs';

const source = METRO_RETAILER_SOURCES.find((candidate) => candidate.id === 'michaeltowne-wines');

function page(products, { merchantId = source.stores[0].merchantId, address = source.stores[0].address, pickup = true } = {}) {
  const config = { merchant_configs: [{ merchant: { id: merchantId, pickup, address: { full_address: address } } }] };
  const list = {
    '@type': 'ItemList',
    itemListElement: products.map(({ id, title = 'Eagle Rare 10 Year Bourbon 750ml', available = true }) => ({
      '@type': 'Product', name: title, description: title, productID: id,
      url: `${source.baseUrl}/shop/product/bourbon/null?option-id=${id}`,
      offers: { availability: `https://schema.org/${available ? 'InStock' : 'OutOfStock'}`, price: '69.99' },
    })),
  };
  return `<html data-ch-merchant-id="${source.stores[0].merchantId}"><script type="application/json">${JSON.stringify(config)}</script><script type="application/ld+json">${JSON.stringify(list)}</script></html>`;
}

test('depth is enabled only where live canonical gains justify additional requests', () => {
  const enabled = METRO_RETAILER_SOURCES.filter((candidate) => metroCityHiveDepthPolicy(candidate.id));
  assert.deepEqual(enabled.map((candidate) => candidate.id).sort(), [
    '7th-ave-wines', 'bedford-wines', 'greenpoint-wine-liquor', 'mayfair-liquors',
    'michaeltowne-wines', 'off-broadway-wine-spirits', 'turnup-nyc',
    'springs-liquor-outlet', 'wallabys-liquor-warehouse', 'south-park-liquor',
  ].sort());
  for (const candidate of enabled) {
    assert.equal(candidate.stores.length, 1);
    assert.equal(candidate.inventoryMode, ['springs-liquor-outlet', 'wallabys-liquor-warehouse', 'south-park-liquor'].includes(candidate.id)
      ? 'premises_quantity' : 'itemlist_binary');
    assert.equal(candidate.depthDiscovery.maxCategoryPages, 1);
    assert.equal(candidate.depthDiscovery.includeWhiskey, false);
    assert.equal(candidate.depthDiscovery.maxRequests, 5);
    assert.equal(candidate.depthDiscovery.refreshCadenceMs, undefined);
    assert.ok(Object.isFrozen(candidate.depthDiscovery.queryTerms));
  }
  for (const id of ['bin70-wine', 'heritage-wine-liquor', 'yardsale-wines', 'city-wines-ny']) {
    assert.equal(METRO_RETAILER_SOURCES.find((candidate) => candidate.id === id).depthDiscovery, null);
  }
  const nowMs = Date.parse('2026-10-22T12:00:00.000Z');
  const cached = enabled.map((candidate) => ({ sourceChain: candidate.id, observedAt: new Date(nowMs - 3 * 60 * 60_000).toISOString() }));
  assert.deepEqual(selectMetroSourcesForRefresh(enabled, cached, { nowMs }), []);
  assert.equal(selectMetroSourcesForRefresh(enabled, cached, { nowMs: nowMs + 60 * 60_000 }).length, enabled.length);
});

test('family search adds exact variants while retaining binary stock and product rejection rules', async () => {
  const requests = [];
  const result = await collectMetroCityHiveRows(source, {
    fetchText: async (url) => {
      requests.push(url);
      return { ok: true, status: 200, url, text: requests.length === 1
        ? page([{ id: 'baseline' }])
        : page([{ id: 'baseline' }, { id: 'extra' }, { id: 'sold', available: false }, { id: 'cream', title: 'Buffalo Trace Bourbon Cream 750ml' }]) };
    },
    parseHtml: parseMetroCityHiveHtml,
  });
  assert.equal(requests.length, 3);
  assert.ok(requests.every((url) => new URL(url).searchParams.get('merchant-id') === source.stores[0].merchantId));
  assert.ok(requests.every((url) => !new URL(url).searchParams.has('page')));
  assert.deepEqual(result.rows.map((row) => row.variantId), ['baseline', 'extra']);
  assert.ok(result.rows.every((row) => row.quantity === 0 && !row.quantityIsExact && row.binaryAvailability
    && row.premisesVerified && row.pickupOfferVerified && row.sourceAvailabilityVerified));
  assert.equal(result.rows[1].discoveryRoute, 'family_search:barrel proof');
  assert.equal(result.metadata.completeSnapshot, true);
  assert.equal(result.metadata.discoveryMode, 'metro_bounded_cityhive_public_family_search');
  assert.deepEqual(parseMetroCityHiveHtml(page([{ id: 'forged' }], { merchantId: 'another-store' }), source), []);
  assert.deepEqual(parseMetroCityHiveHtml(page([{ id: 'forged' }], { address: '999 Other Street' }), source), []);
  assert.deepEqual(parseMetroCityHiveHtml(page([{ id: 'delivery' }], { pickup: false }), source), []);
});

test('an optional denial stops all further requests and keeps cached extras at their original time', async () => {
  for (const status of [401, 403, 429]) {
    const requests = [];
    const result = await collectMetroCityHiveRows(source, {
      fetchText: async (url) => {
        requests.push(url);
        return requests.length === 1
          ? { ok: true, status: 200, url, text: page([{ id: 'baseline' }]) }
          : { ok: false, status, url, text: '', error: `HTTP ${status}` };
      },
      parseHtml: parseMetroCityHiveHtml,
    });
    assert.equal(requests.length, 2);
    assert.equal(result.metadata.completeSnapshot, false);
    assert.equal(result.metadata.stoppedReason, status === 429 ? 'rate_limited' : 'access_denied');
    const oldObservedAt = '2026-10-22T08:00:00.000Z';
    const merged = mergeMetroSourceCacheSignals(
      [{ id: 'baseline', sourceChain: source.id, observedAt: '2026-10-22T12:00:00.000Z' }],
      [{ id: 'previous-search', sourceChain: source.id, observedAt: oldObservedAt, raw: { discoveryRoute: 'family_search:barrel proof' } }],
      new Set(), new Map([[source.id, result.metadata]]),
    );
    assert.equal(merged.find((row) => row.id === 'previous-search').observedAt, oldObservedAt);
  }
});

test('unregistered source identities and malformed required pages fail before optional search', async () => {
  let calls = 0;
  await assert.rejects(collectMetroCityHiveRows({ ...source, baseUrl: 'https://attacker.example' }, {
    fetchText: async () => { calls += 1; }, parseHtml: parseMetroCityHiveHtml,
  }), /exact registered source/i);
  assert.equal(calls, 0);
  await assert.rejects(collectMetroCityHiveRows(source, {
    fetchText: async (url) => { calls += 1; return { ok: true, status: 200, url, text: '<html>missing merchant</html>' }; },
    parseHtml: parseMetroCityHiveHtml,
  }), /merchant identity/i);
  assert.equal(calls, 1);
});
