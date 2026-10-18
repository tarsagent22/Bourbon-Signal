import assert from 'node:assert/strict';
import test from 'node:test';
import { DURHAM_STORE_PRODUCTS, parseDurhamStoreInventory } from '../src/collectors/nc-durham-store-surfaces.mjs';

const source = DURHAM_STORE_PRODUCTS[0];
function fixture(qty = 4) {
  const rows = [1, 3].map(id => `<tr data-in-stock="${qty > 0}"><td><a href="/stores/${id}">#${id}</a><div>Store #${id}</div></td>
    <td><div>${id === 1 ? '1928 Holloway Street' : '2806 Hillsborough Road'}</div><div><span>Durham</span>, <span>NC</span> <span>27703</span></div></td>
    <td>919-000-0000</td><td>Mon-Sat</td><td>${qty > 0 ? `In Stock (<span>${qty}</span>)` : 'Out of Stock'}</td>
    <td><a href="https://www.google.com/maps/dir/?api=1&amp;destination=35.9920,-78.8673">Directions</a></td></tr>`).join('');
  return `<h1>Green River Full Proof Bourbon</h1><p>PLU <span>23449</span> · .75L</p><p>$49.95</p>
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
    fixture().replace('.75L', '1.75L'), fixture().replace('/stores/3', '/stores/1'),
    fixture().replace('1928 Holloway Street', 'Warehouse'), fixture().replace('<span>NC</span>', '<span>VA</span>'),
    fixture().replace('35.9920,-78.8673', '40.7,-74.0')]) assert.equal(parseDurhamStoreInventory(body, source.url), null);
  assert.equal(parseDurhamStoreInventory(fixture(), 'https://unrelated.example/products/23449'), null);
  assert.equal(parseDurhamStoreInventory(fixture(), source.url + '?product=another'), null);
});
