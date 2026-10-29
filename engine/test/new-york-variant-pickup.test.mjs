import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { BourbonBible } from '../src/core/bible.mjs';
import { NEW_YORK_VARIANT_PICKUP_SOURCES, collectNewYorkVariantPickup } from '../src/collectors/new-york-variant-pickup.mjs';
import { NEW_YORK_RETAILER_SOURCES } from '../src/collectors/metro-retailer-surfaces.mjs';
import { isMetroRetailerInventory } from '../src/metro-retailer-policy.mjs';
import { sameShopifyPremiseAddress, shopifyPremiseAddressSignature } from '../src/collectors/shopify-premises-identity.mjs';

const dir = new URL('./fixtures/new-york-variant-pickup-20261028/', import.meta.url);
const bible = new BourbonBible(JSON.parse(await readFile(new URL('bible.json', dir), 'utf8')).records);
const observedAt = new Date().toISOString();
const captures = new Map();
for (const source of NEW_YORK_VARIANT_PICKUP_SOURCES) {
  const seed = source.pickupDefinition.products[0];
  for (const kind of ['product', 'pickup']) {
    const text = await readFile(new URL(`${source.id}-${kind}.${kind === 'product' ? 'json' : 'html'}`, dir), 'utf8');
    captures.set(seed.evidence[kind].url, text);
  }
}
function fetcher(edit = text => text) {
  const calls = [];
  return { calls, fetchText: async url => {
    assert.ok(captures.has(url), `No reviewed capture for ${url}`); calls.push(url);
    return { ok: true, status: 200, url, text: edit(captures.get(url), url) };
  } };
}
test('five newly registered NY premises retain exact captured product/variant and binary pickup proof', async () => {
  assert.equal(NEW_YORK_VARIANT_PICKUP_SOURCES.length, 5);
  assert.equal(new Set(NEW_YORK_VARIANT_PICKUP_SOURCES.map(source => source.stores[0].address)).size, 5);
  for (const source of NEW_YORK_VARIANT_PICKUP_SOURCES) {
    assert.ok(NEW_YORK_RETAILER_SOURCES.includes(source));
    const transport = fetcher();
    const result = await collectNewYorkVariantPickup({ id: 'NY' }, bible, source, observedAt, transport);
    assert.equal(transport.calls.length, 2);
    assert.equal(result.signals.length, 1);
    const signal = result.signals[0], definition = source.pickupDefinition;
    assert.equal(signal.canonicalName, definition.products[0].canonicalName);
    assert.equal(signal.storeAddress, definition.stores[0].address);
    assert.equal(signal.variantId, definition.products[0].variantId);
    assert.equal(signal.sourceRuntimeId, `metro:ny:${source.id}`);
    assert.equal(signal.observedAt, observedAt);
    assert.equal(signal.quantity, 0); assert.equal(signal.quantityIsExact, false);
    assert.equal(signal.sourceAvailabilityVerified, true);
    assert.equal(signal.pickupOfferVerified, true); assert.equal(signal.premisesVerified, true);
    assert.equal(result.metadata.exhaustiveCatalogVerified, false);
    assert.equal(isMetroRetailerInventory(signal), true, source.id);
    assert.equal(isMetroRetailerInventory({ ...signal, sourceProductBinding: { ...signal.sourceProductBinding, pickupUrl: 'https://example.com' } }), false);
    for (const kind of ['product','pickup']) {
      assert.equal(createHash('sha256').update(captures.get(definition.products[0].evidence[kind].url)).digest('hex'), definition.products[0].evidence[kind].sha256);
    }
  }
});
test('current out-of-stock pickup withdraws every new retailer row rather than reusing old positive fixtures', async () => {
  for (const source of NEW_YORK_VARIANT_PICKUP_SOURCES) {
    const transport = fetcher((text,url) => url.endsWith('.json') ? text : text.replace(/Pickup available/giu, 'Pickup unavailable'));
    const result = await collectNewYorkVariantPickup({ id: 'NY' }, bible, source, observedAt, transport);
    assert.equal(result.signals.length, 0); assert.equal(result.observations[0].availabilityStatus, 'out_of_stock');
  }
});
test('wrong premise, product, variant, and pickup identity each fail closed', async () => {
  for (const source of NEW_YORK_VARIANT_PICKUP_SOURCES) {
    const badProduct = fetcher((text,url) => { if (!url.endsWith('.json')) return text; const p = JSON.parse(text); p.product.id++; return JSON.stringify(p); });
    await assert.rejects(() => collectNewYorkVariantPickup({ id: 'NY' }, bible, source, observedAt, badProduct));
    const badVariant = fetcher((text,url) => { if (!url.endsWith('.json')) return text; const p = JSON.parse(text); p.product.variants[0].id++; return JSON.stringify(p); });
    await assert.rejects(() => collectNewYorkVariantPickup({ id: 'NY' }, bible, source, observedAt, badVariant));
    const badAddress = fetcher((text,url) => url.endsWith('.json') ? text : text.replace(/NY (\d{5})/gu, 'NY 99999'));
    await assert.rejects(() => collectNewYorkVariantPickup({ id: 'NY' }, bible, source, observedAt, badAddress));
    const hidden = fetcher((text,url) => url.endsWith('.json') ? text : `<div hidden>${text}</div>`);
    await assert.rejects(() => collectNewYorkVariantPickup({ id: 'NY' }, bible, source, observedAt, hidden));
  }
});
test('Halo modal variant heading and named store stock remain independently required', async () => {
  const source = NEW_YORK_VARIANT_PICKUP_SOURCES.find(source => source.id === 'grand-wine-cellar');
  for (const edit of [text => text.replace(/750ml/gu, '375ml'), text => text.replace(/Wine Cellar/gu, 'Other Store'), text => text.replace(/store-availability-list__stock/gu, 'unreviewed-stock')]) {
    const transport = fetcher((text,url) => url.endsWith('.json') ? text : edit(text));
    await assert.rejects(() => collectNewYorkVariantPickup({ id: 'NY' }, bible, source, observedAt, transport));
  }
});
test('foreign source identity and another state never execute a request', async () => {
  const source = NEW_YORK_VARIANT_PICKUP_SOURCES[0], transport = fetcher();
  await assert.rejects(() => collectNewYorkVariantPickup({ id:'NJ' }, bible, source, observedAt, transport));
  await assert.rejects(() => collectNewYorkVariantPickup({ id:'NY' }, bible, { ...source, baseUrl:'https://example.com' }, observedAt, transport));
  assert.equal(transport.calls.length, 0);
});
test('new street forms preserve literal retail unit kind and street/house identity', () => {
  const ny = {city:'New York',state:'NY',zip:'10128'};
  assert.equal(sameShopifyPremiseAddress('1743 1st Avenue Retail A, New York NY 10128', '1743 1st Ave<br>Retail A<br>New York NY 10128', ny), true);
  for (const changed of ['1743 1st Avenue Suite A, New York NY 10128','1743 1st Avenue, New York NY 10128','1743 1st Avenue Retail B, New York NY 10128']) {
    assert.equal(sameShopifyPremiseAddress('1743 1st Avenue Retail A, New York NY 10128', changed, ny), false);
  }
  assert.ok(shopifyPremiseAddressSignature('1802 Broadway, New York NY 10019',{city:'New York',state:'NY',zip:'10019'}));
  assert.equal(sameShopifyPremiseAddress('4000 Jericho Tpke, East Northport NY 11731','4000 Jericho Turnpike, East Northport NY 11731',{city:'East Northport',state:'NY',zip:'11731'}), true);
});
