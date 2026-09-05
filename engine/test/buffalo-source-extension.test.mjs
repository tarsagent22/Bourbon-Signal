import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { BourbonBible } from '../src/core/bible.mjs';
import { mergeMetroSourceCacheSignals, NEW_YORK_RETAILER_SOURCES, parseMetroCityHiveHtml } from '../src/collectors/metro-retailer-surfaces.mjs';
import { cityHiveSafeBottleMatch } from '../src/collectors/precision-probes.mjs';
import {
  BUFFALO_CITYHIVE_DISCOVERY_BUDGETS,
  collectBuffaloCityHiveRows,
  selectMetroSourcesForRefresh,
} from '../src/collectors/buffalo-cityhive-discovery.mjs';

const evidenceRoot = new URL('../data/source-evidence/NY/buffalo/', import.meta.url);
const cases = [
  ['five-star-wine-spirits-buffalo', '5star-bourbon-live.html', '5star-buffalo-trace-375-oos.html', 24],
  ['bailey-discount-liquor-wine', 'bailey-bourbon-live.html', 'bailey-makers-mark-options.html', 16],
];
const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));

test('captured Buffalo first-party evidence stays bound to exact merchants and premises', () => {
  for (const [sourceId, positiveFixture, negativeFixture, minimumRows] of cases) {
    const source = NEW_YORK_RETAILER_SOURCES.find((candidate) => candidate.id === sourceId);
    const positiveRows = parseMetroCityHiveHtml(readFileSync(new URL(positiveFixture, evidenceRoot), 'utf8'), source);
    const negativeRows = parseMetroCityHiveHtml(readFileSync(new URL(negativeFixture, evidenceRoot), 'utf8'), source);
    assert.ok(positiveRows.length >= minimumRows);
    assert.ok(positiveRows.every((row) => row.merchantId === source.stores[0].merchantId
      && row.storeId === source.stores[0].id
      && row.premisesVerified
      && row.pickupOfferVerified
      && row.sourceAvailabilityVerified));
    assert.equal(negativeRows.length, 0);
  }
});

test('only due Buffalo sources bypass the four-hour state cache on a bounded thirty-minute cadence', () => {
  const buffalo = NEW_YORK_RETAILER_SOURCES.filter((source) => source.area === 'Buffalo');
  const nyPeer = NEW_YORK_RETAILER_SOURCES.find((source) => source.area === 'New York City' && source.platform === 'cityhive');
  const nowMs = Date.parse('2026-09-05T16:00:00.000Z');
  const cached = [
    ...buffalo.map((source, index) => ({ sourceChain: source.id, observedAt: new Date(nowMs - (index ? 31 : 20) * 60_000).toISOString() })),
    { sourceChain: nyPeer.id, observedAt: new Date(nowMs - 3 * 60 * 60_000).toISOString() },
  ];

  assert.deepEqual(
    selectMetroSourcesForRefresh([...buffalo, nyPeer], cached, { nowMs }).map((source) => source.id),
    [buffalo[1].id],
  );
  assert.deepEqual(
    selectMetroSourcesForRefresh([...buffalo, nyPeer], cached, { nowMs, forceLive: true }).map((source) => source.id),
    [...buffalo, nyPeer].map((source) => source.id),
  );
  const precisionSource = readFileSync(new URL('../src/collectors/precision-probes.mjs', import.meta.url), 'utf8');
  assert.match(precisionSource, /selectMetroSourcesForRefresh\(sources, eligibleCachedSignals, \{ forceLive \}\)/u);
  assert.match(precisionSource, /const adapters = refreshSources\.map/u);
});

test('an incomplete optional search refresh keeps prior extras at their original observation time', () => {
  const oldObservedAt = '2026-09-05T14:00:00.000Z';
  const freshObservedAt = '2026-09-05T15:30:00.000Z';
  const sourceChain = 'bailey-discount-liquor-wine';
  const merged = mergeMetroSourceCacheSignals(
    [{ id: 'baseline', sourceChain, observedAt: freshObservedAt }],
    [
      { id: 'baseline', sourceChain, observedAt: oldObservedAt },
      { id: 'prior-search-extra', sourceChain, observedAt: oldObservedAt },
    ],
    new Set(),
  );
  assert.deepEqual(merged.map((signal) => [signal.id, signal.observedAt]), [
    ['baseline', freshObservedAt],
    ['prior-search-extra', oldObservedAt],
  ]);
});

test('reviewed exact Buffalo aliases recover rare bottles without weakening expression protections', () => {
  const expected = new Map([
    ["Blanton's The Original Single Barrel Kentucky Straight Bourbon Whiskey", "Blanton's Original Single Barrel"],
    ['Colonel E.H. Taylor Small Batch Kentucky Straight Bourbon Whiskey', 'E.H. Taylor Small Batch'],
    ['Eagle Rare 10 Year Kentucky Straight Bourbon', 'Eagle Rare 10 Year'],
    ['Henry McKenna Single Barrel 10 Year Old Bourbon Whiskey', 'Henry McKenna 10 Year'],
  ]);
  for (const [rawName, canonical] of expected) {
    assert.equal(cityHiveSafeBottleMatch(rawName, bible).record?.canonical, canonical, rawName);
  }
  assert.equal(cityHiveSafeBottleMatch('Four Roses Bourbon', bible).record, null);
  assert.equal(cityHiveSafeBottleMatch('Basil Hayden Bourbon Whiskey', bible).record, null);
  assert.equal(cityHiveSafeBottleMatch('Henry McKenna Single Barrel Bourbon Whiskey', bible).record, null);
  assert.equal(cityHiveSafeBottleMatch("Blanton's Gold Bourbon", bible).record?.canonical, "Blanton's Gold");
  assert.equal(cityHiveSafeBottleMatch('Eagle Rare 12 Year Bourbon', bible).record?.canonical, 'Eagle Rare 12 Year');
});

function cityHivePage(source, products = []) {
  const store = source.stores[0];
  const payload = {
    merchant_configs: [{ merchant: { id: store.merchantId, address: { full_address: store.address } } }],
    products: products.map((product, index) => ({
      id: product.productId || `product-${index}`,
      name: product.title,
      basic_category: ['bourbon'],
      size: { quantity: '750', measure: 'ml' },
      merchants: [{
        merchant_id: product.merchantId || store.merchantId,
        full_address: product.address || store.address,
        offer_types: ['pick_up'],
        product_options: [{
          product_id: product.productId || `product-${index}`,
          option_id: product.variantId || `option-${index}`,
          merchant_id: product.merchantId || store.merchantId,
          full_address: product.address || store.address,
          quantity: product.quantity ?? 2,
          price: 79.99,
          product_url: `${source.baseUrl}/shop/product/test/${product.productId || `product-${index}`}?option-id=${product.variantId || `option-${index}`}`,
          option_display_data: { name: product.title, size: { quantity: '750', measure: 'ml' }, basic_category: ['bourbon'] },
        }],
      }],
    })),
  };
  return `<html data-ch-merchant-id="${store.merchantId}"><script>window.__DATA__=JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(payload))}"))</script></html>`;
}

test('Buffalo discovery is bounded, dedupes options, and stops after repeated or empty discovery pages', async () => {
  const source = NEW_YORK_RETAILER_SOURCES.find((candidate) => candidate.id === 'five-star-wine-spirits-buffalo');
  const requests = [];
  const first = cityHivePage(source, [{ title: "Blanton's The Original Single Barrel Kentucky Straight Bourbon Whiskey", productId: 'blanton', variantId: '750' }]);
  const result = await collectBuffaloCityHiveRows(source, {
    fetchText: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200, url, text: requests.length <= 2 ? first : cityHivePage(source) };
    },
    parseHtml: parseMetroCityHiveHtml,
    sleepFn: async () => {},
    searchTerms: ['weller', 'stagg', 'taylor', 'van winkle'],
    budgets: { ...BUFFALO_CITYHIVE_DISCOVERY_BUDGETS, maxRequests: 9 },
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.metadata.requestCount, 7);
  assert.equal(result.metadata.stoppedReason, 'repeated_category_page');
  assert.equal(result.metadata.attempts.find((attempt) => attempt.kind === 'bourbon_category_page')?.outcome, 'repeated_page');
  assert.ok(requests.every(({ options }) => options.timeoutMs > 0 && options.maxBytes > 0));
  assert.ok(requests.every(({ url }) => new URL(url).searchParams.get('merchant-id') === source.stores[0].merchantId));
});

test('Buffalo discovery enforces request, elapsed, body, and product budgets', async () => {
  const source = NEW_YORK_RETAILER_SOURCES.find((candidate) => candidate.id === 'five-star-wine-spirits-buffalo');
  let nowMs = 0;
  const products = Array.from({ length: 4 }, (_, index) => ({ title: `Weller Special Reserve ${index} 750ml`, productId: `p-${index}`, variantId: `v-${index}` }));
  const result = await collectBuffaloCityHiveRows(source, {
    fetchText: async (url) => {
      nowMs += 20;
      return { ok: true, status: 200, url, text: cityHivePage(source, products) };
    },
    parseHtml: parseMetroCityHiveHtml,
    sleepFn: async () => {},
    now: () => nowMs,
    budgets: { ...BUFFALO_CITYHIVE_DISCOVERY_BUDGETS, maxRequests: 2, maxElapsedMs: 100, maxTotalBytes: 2_000_000, maxProducts: 2 },
  });
  assert.equal(result.rows.length, 2);
  assert.equal(result.metadata.requestCount, 1);
  assert.equal(result.metadata.stoppedReason, 'product_budget');
  await assert.rejects(() => collectBuffaloCityHiveRows(source, {
    fetchText: async (url) => ({ ok: true, status: 200, url, text: 'x'.repeat(101) }),
    parseHtml: parseMetroCityHiveHtml,
    budgets: { ...BUFFALO_CITYHIVE_DISCOVERY_BUDGETS, maxBodyBytes: 100 },
  }), /body budget/i);
});

test('Buffalo optional query failure preserves baseline evidence while malformed baseline fails closed', async () => {
  const source = NEW_YORK_RETAILER_SOURCES.find((candidate) => candidate.id === 'bailey-discount-liquor-wine');
  const baseline = cityHivePage(source, [
    { title: 'Eagle Rare 10 Year Kentucky Straight Bourbon', productId: 'eagle', variantId: '750' },
    { title: 'Buffalo Trace Bourbon', productId: 'oos', variantId: 'oos', quantity: 0 },
    { title: 'Weller Special Reserve 750ml', productId: 'cross', variantId: 'cross', merchantId: 'other-merchant' },
  ]);
  let requestCount = 0;
  const result = await collectBuffaloCityHiveRows(source, {
    fetchText: async (url) => (++requestCount === 1
      ? { ok: true, status: 200, url, text: baseline }
      : { ok: false, status: 503, url, text: '', error: 'optional unavailable' }),
    parseHtml: parseMetroCityHiveHtml,
    sleepFn: async () => {},
    searchTerms: ['weller'],
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].productId, 'eagle');
  assert.equal(result.metadata.completeSnapshot, false);
  assert.ok(result.metadata.optionalFailures.length >= 1);
  await assert.rejects(() => collectBuffaloCityHiveRows(source, {
    fetchText: async (url) => ({ ok: true, status: 200, url, text: '<html>not CityHive</html>' }),
    parseHtml: parseMetroCityHiveHtml,
  }), /merchant identity/i);
});
