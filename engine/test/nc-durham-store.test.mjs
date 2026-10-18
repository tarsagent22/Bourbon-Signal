import assert from 'node:assert/strict';
import test from 'node:test';
import { DURHAM_STORE_PRODUCTS, parseDurhamStoreInventory } from '../src/collectors/nc-durham-store-surfaces.mjs';
import { collectDurhamStoreInventory } from '../src/collectors/nc-durham-store-collector.mjs';
import { BourbonBible } from '../src/core/bible.mjs';
import { bibleLookup, buildDrops } from '../src/export-site-contract.mjs';

const source = DURHAM_STORE_PRODUCTS[0];
function fixture(qty = 4, product = source) {
  const rows = [1, 3].map(id => `<tr data-in-stock="${qty > 0}"><td><a href="/stores/${id}">#${id}</a><div>Store #${id}</div></td>
    <td><div>${id === 1 ? '1928 Holloway Street' : '2806 Hillsborough Road'}</div><div><span>Durham</span>, <span>NC</span> <span>27703</span></div></td>
    <td>919-000-0000</td><td>Mon-Sat</td><td>${qty > 0 ? `In Stock (<span>${qty}</span>)` : 'Out of Stock'}</td>
    <td><a href="https://www.google.com/maps/dir/?api=1&amp;destination=35.9920,-78.8673">Directions</a></td></tr>`).join('');
  return `<h1>${product.names[0]}</h1><p>PLU <span>${product.ncCode}</span> · .75L</p><p>$49.95</p>
    <p>Available at ${qty > 0 ? 2 : 0} of 2 stores · ${qty * 2} bottles total</p>
    <table><thead><tr><th>Store</th><th>Address</th><th>Phone</th><th>Hours</th><th>Availability</th><th>Directions</th></tr></thead><tbody>${rows}</tbody></table>`;
}

test('Durham binds reviewed product, size, count, individual premises and published coordinates', () => {
  const parsed = parseDurhamStoreInventory(fixture(), source.url);
  assert.equal(parsed.ncCode, source.ncCode);
  assert.equal(parsed.bibleId, source.bibleId);
  assert.equal(parsed.stores.length, 2);
  assert.equal(parsed.reportedTotal, 8);
  assert.equal(parsed.stores[0].storeAddress, '1928 Holloway Street, Durham, NC 27703');
  assert.equal(parsed.stores[0].lat, 35.992);
  assert.equal(parsed.stores[0].inStock, true);
});

test('explicit out of stock differs from unavailable or inconsistent source evidence', () => {
  const zero = parseDurhamStoreInventory(fixture(0), source.url);
  assert.equal(zero.stores.every(row => !row.inStock && row.reportedQuantity === 0), true);
  for (const body of ['', '<html>Access denied</html>', fixture().replace('8 bottles total', '9 bottles total'),
    fixture().replace('at 2 of 2', 'at 3 of 3'), fixture().replace('data-in-stock="true"', 'data-in-stock="false"'),
    fixture().replace('In Stock (<span>4</span>)', 'Available soon')]) assert.equal(parseDurhamStoreInventory(body, source.url), null);
});

test('wrong product, format, host, duplicates and premises cannot become inventory', () => {
  for (const body of [fixture().replace('23449', '19312'), fixture().replace('Full Proof', 'Small Batch'),
    fixture().replace('.75L', '1.75L'), fixture().replace('.75L', '75L'), fixture().replace('/stores/3', '/stores/1'),
    fixture().replace('1928 Holloway Street', 'Warehouse'), fixture().replace('Mon-Sat', 'Mixed Beverage Only'), fixture().replace('<span>NC</span>', '<span>VA</span>'),
    fixture().replace('35.9920,-78.8673', '40.7,-74.0')]) assert.equal(parseDurhamStoreInventory(body, source.url), null);
  assert.equal(parseDurhamStoreInventory(fixture(), 'https://unrelated.example/products/23449'), null);
  assert.equal(parseDurhamStoreInventory(fixture(), source.url + '?product=another'), null);
});

test('actual catalog identities project exact current NC store cards without claiming exact shelf counts', async () => {
  const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));
  const called = [];
  const result = await collectDurhamStoreInventory({ id: 'NC' }, bible, { fetchPage: async url => {
    called.push(url); const product = DURHAM_STORE_PRODUCTS.find(row => row.url === url);
    return { ok: true, status: 200, url, text: fixture(4, product) };
  } });
  assert.deepEqual(called, DURHAM_STORE_PRODUCTS.map(row => row.url));
  assert.equal(result.sourceReports.every(row => row.ok), true);
  assert.equal(result.signals.length, 4);
  const cards = buildDrops(result.signals, bibleLookup(bible.records), result.signals);
  assert.equal(cards.length, 4);
  assert.equal(new Set(cards.map(row => row.storeId)).size, 2);
  assert.ok(cards.every(row => row.state === 'NC' && row.locationPrecision === 'store_level' && row.quantityIsExact === false));
  assert.ok(result.signals.every(row => row.county === null && row.raw.sourceCoordinates === 'first_party_published_directions'));
});

test('a failed source stays visible, is not retried and does not discard healthy sibling observations', async () => {
  const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));
  const calls = [];
  const result = await collectDurhamStoreInventory({ id: 'NC' }, bible, { fetchPage: async url => {
    calls.push(url); const product = DURHAM_STORE_PRODUCTS.find(row => row.url === url);
    return product === source ? { ok: false, status: 403, url, text: 'Blocked private response' }
      : { ok: true, status: 200, url, text: fixture(4, product) };
  } });
  assert.equal(calls.length, 2);
  assert.equal(result.sourceReports[0].ok, false);
  assert.equal(result.sourceReports[0].status, 403);
  assert.equal(result.signals.length, 2);
  assert.equal(JSON.stringify(result).includes('Blocked private response'), false);
  const mismatch = await collectDurhamStoreInventory({ id: 'NC' }, { match: () => ({ confidence: 1, record: { id: 'wrong', tier: 'limited' } }) }, {
    fetchPage: async url => ({ ok: true, status: 200, url, text: fixture(4, DURHAM_STORE_PRODUCTS.find(row => row.url === url)) }),
  });
  assert.equal(mismatch.signals.length, 0);
  assert.ok(mismatch.sourceReports.every(row => !row.ok && row.error === 'bible_identity_unverified'));
});

test('conflicting premises for the same public store ID cannot be merged across products', async () => {
  const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));
  const result = await collectDurhamStoreInventory({ id: 'NC' }, bible, { fetchPage: async url => {
    const product = DURHAM_STORE_PRODUCTS.find(row => row.url === url);
    const html = fixture(4, product);
    return { ok: true, status: 200, url, text: product === source ? html : html.replace('1928 Holloway Street', '123 Another Street') };
  } });
  assert.ok(result.signals.every(row => row.storeId !== 'nc-durham-1'));
  assert.ok(result.sourceReports.every(row => !row.ok && row.error === 'cross_product_premises_conflict'));
});
