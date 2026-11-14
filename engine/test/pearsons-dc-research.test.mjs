import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PEARSONS_DC_SOURCE, parsePearsonsDcCapture } from '../src/collectors/pearsons-dc-research.mjs';

const fixture = await readFile(new URL('./fixtures/pearsons-dc/product-page.html', import.meta.url));
const headers = 'HTTP/1.1 200 OK\r\nAge: 0\r\nDate: Sat, 14 Nov 2026 17:40:21 GMT\r\n';
const expectedId = 'blantons-original';
const bible = { match: name => name === PEARSONS_DC_SOURCE.canonicalName
  ? { confidence: 1, record: { id: expectedId, canonical: PEARSONS_DC_SOURCE.canonicalName, tier: 'allocated' } } : null };
const parse = (bytes = fixture, options = {}) => parsePearsonsDcCapture(bytes, {
  url: PEARSONS_DC_SOURCE.productUrl, headers, bible, ...options,
});

test('Pearson retained storefront evidence binds exact DC premise, bottle, variant, pickup and clock', () => {
  const row = parse();
  assert.ok(row);
  assert.equal(row.storeId, PEARSONS_DC_SOURCE.storeId);
  assert.equal(row.storeAddress, '2436 Wisconsin Avenue NW, Washington, DC 20007');
  assert.equal(row.canonicalBottleId, expectedId);
  assert.equal(row.tier, 'allocated');
  assert.equal(row.price, 99.99);
  assert.equal(row.observedAt, '2026-11-14T17:40:21.000Z');
  assert.equal(row.sourceProductBinding.sourcePageSha256, createHash('sha256').update(fixture).digest('hex'));
  assert.equal(row.sourceProductBinding.variantId, '45949567795418');
  assert.equal(row.sourceProductBinding.storeGraphId, 'https://pearsonswine.com/#store');
  assert.equal(row.sourceAvailabilityVerified, true);
  assert.equal(row.pickupOfferVerified, true);
  assert.equal(row.quantityIsExact, false);
  assert.equal(row.inventorySemantics, 'storefront_orderable_pickup_offer_no_shelf_count');
  assert.equal(row.canAlertAsInventory, false);
  assert.equal(row.canAlertAsWatch, false);
  assert.equal(row.eligibleForDelivery, false);
});

test('Pearson parser fails closed on wrong premise, product variant, seller, pickup or source clock', () => {
  const edits = [
    [fixture.toString().replace('2436 Wisconsin Avenue NW', '2436 Other Avenue NW'), null],
    [fixture.toString().replace('45949567795418', '45949567795419'), null],
    [fixture.toString().replace('https://pearsonswine.com/#store', 'https://other.example/#store'), null],
    [fixture.toString().replace('Pick up at Wisconsin Ave NW', 'Delivery only'), null],
    [fixture.toString().replace('Ready within 30 minutes.', 'Ships in 5 days.'), null],
  ];
  for (const [changed] of edits) assert.equal(parse(Buffer.from(changed)), null);
  assert.equal(parse(fixture, { headers: headers.replace('200 OK', '429 Too Many Requests') }), null);
  assert.equal(parse(fixture, { url: 'https://pearsonswine.com/products/unreviewed' }), null);
  assert.equal(parse(fixture, { expectedSha256: '0'.repeat(64) }), null);
  assert.equal(parse(fixture, { bible: { match: () => null } }), null);
});
