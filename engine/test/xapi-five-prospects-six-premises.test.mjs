import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { BourbonBible } from '../src/core/bible.mjs';
import { parseNevadaAlbertsonsXapi } from '../src/collectors/nevada-retailer-surfaces.mjs';
import { reviewedArizonaXapiBottleMatch } from '../src/collectors/arizona-xapi-matching.mjs';
import { cityHiveSafeBottleMatch } from '../src/collectors/safe-bottle-match.mjs';

// Saved-source compatibility only: no network, provider archive authentication,
// current-stock assertion, current state policy, admission or activation proof.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/grocery-xapi/2026-10-25-five-prospects-six-premises-derived.json', import.meta.url)));
const bibleBytes = readFileSync(new URL('./fixtures/shopify-variant-pickup/current-bourbon-bible.json', import.meta.url));
const bible = new BourbonBible(JSON.parse(bibleBytes).records);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const parse = (source, products = source.products.map(x => x.product)) => parseNevadaAlbertsonsXapi({ response: { docs: products } }, { merchantId: source.merchantId });

test('derived projection preserves all sixteen complete product objects and original source provenance', () => {
  assert.equal(fixture.sources.length, 6);
  assert.equal(fixture.sources.flatMap(s => s.products).length, 16);
  for (const source of fixture.sources) {
    for (const proof of [source.source, source.resolver]) {
      assert.match(proof.originalBodySha256, /^[a-f0-9]{64}$/u);
      assert(proof.originalBodyBytes > 80_000);
      assert.equal(new URL(proof.url).hostname, source.host === 'www.albertsons.com' && proof === source.resolver ? 'www.safeway.com' : source.host);
      assert.equal(new Date(proof.capturedAt).toISOString(), proof.capturedAt);
    }
    assert.equal(new URL(source.source.url).searchParams.get('storeid'), source.merchantId);
    assert.equal(source.source.status, 200);
    assert.equal(source.resolver.status, 206);
    assert.equal(source.resolver.partial, true);
    assert.equal(source.requestBudget.retries, 0);
    assert.equal(source.requestBudget.redirects, 0);
    assert.equal(source.requestBudget.maxDecodedBodyBytes, 2_097_152);
    for (const row of source.products) assert.equal(sha(Buffer.from(JSON.stringify(row.product))), row.productObjectJsonSha256);
  }
});

test('one unchanged guarded parser plus actual Bible and AZ matcher preserve all expected canonical IDs and quantities', () => {
  assert.equal(sha(bibleBytes), fixture.bible.sha256);
  assert.equal(bible.records.length, 188);
  for (const source of fixture.sources) {
    const rows = parse(source);
    assert.equal(rows.length, source.products.length);
    for (const { product, expected } of source.products) {
      const row = rows.find(r => r.productId === expected.productId);
      assert(row); assert.equal(product.storeId, source.merchantId);
      assert.equal(product.containsAlcohol, true);
      assert.equal(Number(product.dispItemSizeQty), 750);
      assert.equal(String(product.dispUnitOfMeasure).toLowerCase(), 'ml');
      assert.equal(Number(product.dispItemPackageQty), 1);
      assert.match(product.name + JSON.stringify(product.categories), /\bbourbon\b/iu);
      assert.doesNotMatch(product.name, /\b(rye|scotch|canadian|chocolate|cream|liqueur|cocktail)\b/iu);
      const match = reviewedArizonaXapiBottleMatch(product, bible, { storeId: source.merchantId });
      assert.equal(match.record?.id, expected.canonicalId);
      assert.equal(match.record?.canonical, expected.canonicalName);
      assert.equal(row.reportedQuantity, expected.reportedQuantity);
      assert.equal(row.quantity, expected.quantity);
      assert.equal(row.inventorySemantics, expected.inventorySemantics);
    }
  }
});

test('existing NV generic matching differs only for the six exact Buffalo Trace stock-caveat identities', () => {
  let differences = 0;
  for (const source of fixture.sources) for (const { product, expected } of source.products) {
    const legacy = cityHiveSafeBottleMatch(product.name, bible);
    assert.equal(legacy.record?.id || null, expected.existingNVCanonicalId);
    if (product.id === '960051942') { assert.equal(legacy.record, null); differences++; }
    else assert.equal(legacy.record?.id, expected.canonicalId);
  }
  assert.equal(differences, 6); // AZ reviewed identity mapping is an explicit dependency.
});

test('actual products reject foreign, missing and coercible store identity for every premise', () => {
  for (const source of fixture.sources) for (const storeId of [undefined, null, '999999', Number(source.merchantId), [source.merchantId]]) {
    const p = structuredClone(source.products[0].product); p.storeId = storeId;
    assert.deepEqual(parse(source, [p]), []);
  }
});

test('actual products never convert malformed or nonpositive quantity into binary availability', () => {
  for (const source of fixture.sources) for (const quantity of [true, [1], {}, null, undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '0x10', '1e2', '04']) {
    const p = structuredClone(source.products[0].product);
    p.channelInventory = { instore: '1', instoreItemQty: quantity };
    assert.deepEqual(parse(source, [p]), []);
  }
});

test('only absent quantity becomes binary; sentinel and conflicting aliases keep existing semantics', () => {
  for (const source of fixture.sources) {
    const p = structuredClone(source.products[0].product);
    p.channelInventory = { instore: '1' };
    const binary = parse(source, [p])[0]; assert.equal(binary.quantity, 0); assert.equal(binary.reportedQuantity, null);
    p.channelInventory = { instore: '1', instoreItemQty: 100 };
    assert.equal(parse(source, [p])[0].quantity, 0);
    p.channelInventory = { instore: '1', instoreItemQty: 5, inStoreItemQty: 6 };
    assert.deepEqual(parse(source, [p]), []);
    p.channelInventory = { instore: '0', instoreItemQty: 5 };
    assert.deepEqual(parse(source, [p]), []);
  }
});

test('literal premises and roles prove parser compatibility, not five customer connections or runtime admission', () => {
  assert.deepEqual(fixture.sources.map(s => [s.state, s.merchantId, s.premise.address]), [
    ['NV', '4024', '2835 S Nellis Blvd'], ['NV', '1059', '5500 Boulder Hwy'],
    ['CA', '745', '655 14th St'], ['CA', '707', '7090 Broadway'], ['AZ', '1207', '2300 W Hwy 89A'],
    ['AZ', '2799', '28455 N Vistancia Blvd'],
  ]);
  assert.equal(fixture.sources.filter(s => s.role === 'five_prospect').length, 5);
  assert.equal(fixture.sources.filter(s => s.role === 'existing_AZ_control').length, 1);
  assert.equal(fixture.summary.prospects, 5); assert.equal(fixture.summary.premises, 6);
  const peoria = fixture.sources.find(s => s.merchantId === '2799');
  assert.equal(peoria.role, 'five_prospect'); assert.equal(peoria.premise.city, 'Peoria');
  assert.equal(peoria.premise.zip, '85383');
  assert.equal(peoria.source.originalBodySha256, '77142d05ffa1b6fb339a9d1b86c070380e228ef8c2509be7bd843895d23341eb');
  assert.deepEqual(peoria.products.map(x => x.expected.reportedQuantity), [11, 39, 3, 5]);
  assert.equal(peoria.noveltyScope.historyGapsRetained, true);
  assert.equal(fixture.summary.newCustomerStores, 0);
  assert.equal(fixture.summary.fullConnectorReuseProven, false);
  assert.equal(fixture.summary.activated, false);
  assert.deepEqual(fixture.summary.admissions, []); assert.deepEqual(fixture.summary.descriptors, []);
  assert.equal(fixture.derivation.sourceRequestsDuringDerivation, 0);
  assert.match(fixture.scope, /not_raw_provider_archive/);
});
