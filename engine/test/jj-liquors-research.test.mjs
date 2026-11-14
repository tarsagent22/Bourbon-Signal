import assert from 'node:assert/strict';
import test from 'node:test';
import { parseJjLiquorsPickup } from '../src/collectors/jj-liquors-research.mjs';

const url = 'https://jjliquorsdc.com/washington-liquor-delivery/weller-special-reserve-750ml.html';
const observedAt = '2026-11-14T06:44:37.397Z';
const title = 'Weller Special Reserve - 750mL';
const sku = 'WA-9508047005-WELLER-SPECIAL-RESERVE-750ML';
const bible = { match: name => name === title ? {
  method: 'exact-normalized-alias', confidence: 1,
  record: { id: 'bb_54f5df2f8ee5d7c9', canonical: 'Weller Special Reserve', libraryIdentities: [{ id: 'weller', canonicalName: 'Weller Special Reserve', nationalTier: 'allocated' }] },
} : null };
const document = value => '<script type="application/ld+json">' + JSON.stringify(value) + '</script>';
const stock = document({
  '@type': 'LiquorStore', '@id': 'https://jjliquorsdc.com/', name: 'JJ Liquors',
  address: { streetAddress: '1211 Brentwood Rd NE', addressLocality: 'Washington', addressRegion: 'DC', postalCode: '20018' },
});
const offer = document({
  '@type': 'Product', name: title,
  offers: { availability: 'https://schema.org/InStock', priceCurrency: 'USD', price: '98.99', seller: { name: 'JJ Liquors', url } },
});
const pickup = '<span class="pickup-only-label widget-label">In-Store Pickup Available</span>';
const detail = '<script>const product = ' + JSON.stringify({ id: sku, internal_sku: sku, name: title, price: '98.9900' }) + ';</script>';
const html = stock + offer + pickup + detail;

test('JJ Liquors exact variant pickup stays an isolated binary observation', () => {
  const row = parseJjLiquorsPickup(html, url, bible, observedAt);
  assert.equal(row.tier, 'allocated');
  assert.equal(row.canonicalBottleId, 'bb_54f5df2f8ee5d7c9');
  assert.equal(row.storeId, 'jj-liquors:1211-brentwood-rd-ne');
  assert.equal(row.quantityIsExact, false);
  assert.equal(row.quantity, 0);
  assert.equal(row.observedAt, observedAt);
  assert.equal(row.canAlertAsInventory, false);
  assert.equal(row.eligibleForOnSite, false);
  assert.equal(row.eligibleForDelivery, false);
  assert.equal(row.raw.shadowOnly, true);
});

test('JJ Liquors refuses different store, missing pickup, out of stock, and mismatched product details', () => {
  for (const changed of [
    html.replace('1211 Brentwood', '1320 Brentwood'),
    html.replace(pickup, ''),
    html.replace('schema.org/InStock', 'schema.org/OutOfStock'),
    html.replace('98.9900', '118.99'),
    html.replace('750mL', '1.75L'),
    html + stock,
  ]) assert.equal(parseJjLiquorsPickup(changed, url, bible, observedAt), null);
  assert.equal(parseJjLiquorsPickup(html, url + '?variant=1', bible, observedAt), null);
  assert.equal(parseJjLiquorsPickup(html, url, bible, 'invalid'), null);
});
