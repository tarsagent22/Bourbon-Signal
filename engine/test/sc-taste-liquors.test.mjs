import assert from 'node:assert/strict';
import test from 'node:test';
import { BourbonBible } from '../src/core/bible.mjs';
import { buildTasteSignal, collectTasteLiquors, isTasteInventory, parseTastePickupPage } from '../src/collectors/south-carolina-taste.mjs';
import { buildCurrentInventoryAlertsFromDrops, buildDrops } from '../src/export-site-contract.mjs';
import { canonicalizeSignal, candidateFromChange } from '../src/operational-report.mjs';
import { confidenceForSignal } from '../src/confidence-policy.mjs';

const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));
const url = 'https://tasteliquors.com/columbia-liquor-delivery/1792-small-batch-750ml.html';
const store = { '@type': 'LiquorStore', '@id': 'https://tasteliquors.com/', url: 'https://tasteliquors.com/', name: 'Taste Liquors', address: { streetAddress: '2722 N Lake Dr', addressLocality: 'Columbia', addressRegion: 'SC', postalCode: '29212', addressCountry: 'US' } };
const product = { '@type': 'Product', name: '1792 Small Batch - 750mL', offers: { '@type': 'Offer', priceCurrency: 'USD', price: '37.81', availability: 'https://schema.org/InStock', seller: { name: 'Taste Liquors', url } } };
function page({ product: p = product, store: s = store, button = '<button data-test="add-to-cart-button-available">Add to Cart</button>', pickup = 'In-Store Pickup Available', heading = p.name } = {}) {
  return `<script type="application/ld+json">${JSON.stringify(s)}</script><script type="application/ld+json">${JSON.stringify(p)}</script><h1>${heading}</h1><span>${pickup}</span>${button}<script>product_id: 326806</script>`;
}
function signal() { return buildTasteSignal(parseTastePickupPage(page(), url), bible, new Date().toISOString()); }

test('only an exact store, product, stock offer, pickup and active cart can produce availability', () => {
  assert.ok(parseTastePickupPage(page(), url));
  const rejected = [
    page({ product: { ...product, offers: { ...product.offers, availability: 'https://schema.org/OutOfStock' } } }),
    page({ product: { ...product, offers: { ...product.offers, price: '0' } } }),
    page({ product: { ...product, offers: { ...product.offers, seller: { name: 'Taste Liquors', url: 'https://example.com/product' } } } }),
    page({ store: { ...store, address: { ...store.address, addressRegion: 'NC' } } }),
    page({ store: { ...store, address: { ...store.address, streetAddress: '2723 N Lake Dr' } } }),
    page({ button: '<button disabled data-test="add-to-cart-button-available">Add to Cart</button>' }),
    page({ button: '' }), page({ pickup: 'Delivery Available' }), page({ heading: 'A different bottle' }),
    page({ product: { ...product, name: '1792 Small Batch gift basket' } }),
    page() + `<script type="application/ld+json">${JSON.stringify(product)}</script>`,
    page() + '<script>product_id: 99999</script>',
  ];
  for (const html of rejected) assert.equal(parseTastePickupPage(html, url), null);
  assert.equal(parseTastePickupPage(page(), 'https://example.com/product.html'), null);
});

test('fresh pickup availability survives the customer and alert projections without an invented count', () => {
  const row = signal(); assert.ok(row); assert.equal(isTasteInventory(row), true);
  assert.equal(row.quantity, 0); assert.equal(row.quantityIsExact, false);
  const normalized = canonicalizeSignal(row, bible); assert.equal(isTasteInventory(normalized), true);
  const record = { id: row.canonicalBottleId, canonical: row.canonicalName, tier: 'allocated', aliases: [] };
  const drops = buildDrops([row], { byId: new Map([[record.id, record]]), byName: new Map() }, [row]);
  assert.equal(drops.length, 1); assert.equal(isTasteInventory(drops[0]), true);
  const alerts = buildCurrentInventoryAlertsFromDrops(drops); assert.equal(alerts.length, 1);
  assert.equal(isTasteInventory(alerts[0]), true); assert.equal(alerts[0].quantity, 0); assert.equal(alerts[0].eligibleForEmail, false); assert.equal(alerts[0].eligibleForSms, false);
  assert.ok(alerts[0].gates.includes('verified_binary_orderability'));
  const candidate = candidateFromChange({ type: 'new_signal', key: normalized.key, before: null, after: normalized });
  assert.equal(candidate.eligibleForEmail, false); assert.equal(candidate.eligibleForSms, false);
});

test('forged bindings and stale proof cannot reach the feed or become inventory alerts', () => {
  for (const mutate of [
    r => { r.state = r.stateCode = 'NC'; }, r => { r.sourceUrl = 'https://example.com/product'; },
    r => { r.storeId = 'taste-liquors:other'; }, r => { r.storeAddress = 'Elsewhere, SC 29212'; },
    r => { r.sourceLabel = 'Forged'; }, r => { r.sourceChain = 'forged'; },
    r => { r.productId = '99999'; }, r => { r.canonicalBottleId = 'other'; }, r => { r.price = 1; },
    r => { r.quantity = r.storeQty = 1; r.quantityIsExact = true; },
    r => { r.sourceProductBinding.pickupAvailable = false; }, r => { r.sourceProductBinding.availability = 'out_of_stock'; },
    r => { r.observedAt = new Date(Date.now() - 3 * 3600000).toISOString(); },
    r => { r.observedAt = new Date(Date.now() + 10 * 60000).toISOString(); }, r => { r.raw.chain = 'forged'; },
  ]) {
    const row = structuredClone(signal()); mutate(row); assert.equal(isTasteInventory(row), false);
    assert.equal(confidenceForSignal(row).canAlertAsInventory, false);
    const record = { id: row.canonicalBottleId, canonical: row.canonicalName, tier: 'allocated', aliases: [] };
    assert.deepEqual(buildDrops([row], { byId: new Map([[record.id, record]]), byName: new Map() }, [row]), []);
  }
});

test('a rate limit ends the bounded collector without probing around access controls', async () => {
  const calls = [];
  const result = await collectTasteLiquors({ id: 'SC' }, bible, new Date().toISOString(), {
    pause: async () => {}, fetchPage: async address => {
      calls.push(address);
      return address.endsWith('/') ? { ok: true, status: 200, url: address, text: `<a href="${url}"></a><a href="https://tasteliquors.com/columbia-liquor-delivery/another.html"></a>` }
        : { ok: false, status: 429, url: address, text: '' };
    },
  });
  assert.equal(calls.length, 2); assert.equal(result.signals.length, 0);
  assert.ok(result.roadblocks.some(row => row.status === 429));
});
