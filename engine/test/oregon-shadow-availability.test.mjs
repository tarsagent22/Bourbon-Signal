import assert from 'node:assert/strict';
import test from 'node:test';

import { trustedOregonStoreQuantity } from '../src/collectors/precision-probes.mjs';
import { assertOregonCollectionComplete, findOregonProductDetailUrl, summarizeOregonCollection } from '../src/or-browser-collector.mjs';
import { ALL_STATE_SOURCES } from '../src/state-sources.mjs';

test('Oregon never turns an unknown browser-card quantity into invented out-of-stock evidence', () => {
  assert.equal(trustedOregonStoreQuantity(null), null);
  assert.equal(trustedOregonStoreQuantity(undefined), null);
  assert.equal(trustedOregonStoreQuantity(''), null);
  assert.equal(trustedOregonStoreQuantity('unknown'), null);
  assert.equal(trustedOregonStoreQuantity(-1), null);
  assert.equal(trustedOregonStoreQuantity('0'), 0);
  assert.equal(trustedOregonStoreQuantity('4'), 4);
});

test('Oregon detail failures propagate to top-level diagnostics and fail required coverage', () => {
  const payload = summarizeOregonCollection({
    terms: ['blanton', 'weller'],
    products: [
      { itemCode: 'A', stores: [{ storeNo: '0001', quantity: 1 }] },
      { itemCode: 'B', stores: [], error: 'detail timed out' },
    ],
    errors: [],
    generatedAt: '2026-09-08T23:00:00.000Z',
  });
  assert.equal(payload.storeRowCount, 1);
  assert.equal(payload.status, 'partial');
  assert.deepEqual(payload.errors, [{ phase: 'detail', itemCode: 'B', term: null, error: 'detail timed out' }]);
  assert.throws(() => assertOregonCollectionComplete(payload), /incomplete.*detail timed out/iu);
});

test('Oregon source configuration no longer probes the audited dead guessed API endpoints', () => {
  const oregon = ALL_STATE_SOURCES.find((state) => state.id === 'OR');
  assert.ok(oregon);
  assert.deepEqual(oregon.apiCandidates, []);
  assert.ok(oregon.sources.some((source) => source.url === 'https://www.oregonliquorsearch.com/'));
});

test('Oregon follows only an official product-identity detail link from the rendered result', () => {
  const page = {
    url: 'https://www.oregonliquorsearch.com/search',
    links: [
      { text: '8990B', href: 'https://example.test/steal/8990B' },
      { text: 'BLANTON GOLD 8990B', href: '/servlet/FrontController?action=detail&itemCode=8990B' },
    ],
  };
  assert.equal(
    findOregonProductDetailUrl(page, { itemCode: '8990B', newItemCode: '99900899075' }),
    'https://www.oregonliquorsearch.com/servlet/FrontController?action=detail&itemCode=8990B',
  );
  assert.equal(findOregonProductDetailUrl(page, { itemCode: 'missing' }), null);
});
