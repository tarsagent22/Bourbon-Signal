import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BourbonBible } from '../src/core/bible.mjs';
import { CUSTOMER_ACTIVE_STATE_IDS } from '../src/state-lifecycle.mjs';
import {
  MAINE_SHAWS_RESEARCH_SOURCES,
  maineShawsPremiseMatches,
  parseMaineShawsResearchInventory,
} from '../src/collectors/maine-shaws-research.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/maine-shaws-research-20261114/identity.json', import.meta.url)));
const bible = new BourbonBible(fixture.bibleRecords);
const byMerchant = new Map(MAINE_SHAWS_RESEARCH_SOURCES.map(source => [source.merchantId, source]));

test('Maine Shaw\'s replay binds eight exact resolver premises and current captured limited products', () => {
  assert.equal(fixture.researchOnly, true);
  assert.equal(fixture.productionMutation, false);
  assert.equal(MAINE_SHAWS_RESEARCH_SOURCES.length, 8);
  assert.equal(new Set(MAINE_SHAWS_RESEARCH_SOURCES.map(source => source.city)).size, 8);
  assert.equal(CUSTOMER_ACTIVE_STATE_IDS.has('ME'), false);
  assert.equal(fixture.stores.reduce((count, store) => count + store.products.length, 0), 23);

  const canonicalNames = new Set();
  for (const capture of fixture.stores) {
    const source = byMerchant.get(capture.source.merchantId);
    assert.ok(source);
    assert.deepEqual(capture.source, source);
    assert.equal(capture.locator.spirits, true);
    assert.equal(capture.resolver.domainName, "Shaw's");
    assert.equal(maineShawsPremiseMatches(source, capture.resolver), true);

    const rows = parseMaineShawsResearchInventory(
      { response: { docs: capture.products } },
      source,
      bible,
      { observedAt: capture.productReceipt.capturedAt },
    );
    assert.deepEqual(rows.map(row => ({
      canonicalName: row.canonicalName,
      productId: row.productId,
      price: row.price,
      quantityIsExact: row.quantityIsExact,
      observedAt: row.observedAt,
    })), capture.expected.map(row => ({
      canonicalName: row.canonicalName,
      productId: row.productId,
      price: row.price,
      quantityIsExact: row.quantityIsExact,
      observedAt: row.observedAt,
    })));
    for (const row of rows) {
      canonicalNames.add(row.canonicalName);
      assert.equal(row.quantity, 0);
      assert.equal(row.quantityIsExact, false);
      assert.equal(row.inventorySemantics, 'binary_retailer_orderable_no_exact_count');
      assert.equal(row.researchOnly, true);
      assert.equal(row.canAlertAsInventory, false);
      assert.equal(row.canAlertAsWatch, false);
      assert.equal(row.storeId, source.storeId);
    }
  }

  assert.deepEqual([...canonicalNames].sort(), [
    'Blade and Bow Bourbon',
    'Heaven Hill Bottled-in-Bond 7 Year',
    'Penelope Four Grain Bourbon',
    'Wild Turkey Rare Breed Straight Bourbon',
  ]);
});

test('Maine Shaw\'s resolver identity requires the recorded ASCII-apostrophe domain and exact source', () => {
  const source = MAINE_SHAWS_RESEARCH_SOURCES[0];
  const capture = fixture.stores.find(store => store.source.merchantId === source.merchantId);
  assert.equal(maineShawsPremiseMatches(source, { ...capture.resolver, domainName: 'Shaw’s' }), false);
  assert.equal(maineShawsPremiseMatches(source, { ...capture.resolver, locationId: '999999' }), false);
  assert.equal(maineShawsPremiseMatches(source, { ...capture.resolver, address: { ...capture.resolver.address, state: 'NH' } }), false);
  assert.deepEqual(parseMaineShawsResearchInventory(
    { response: { docs: capture.products } },
    { ...source },
    bible,
    { observedAt: capture.productReceipt.capturedAt },
  ), []);

  const product = capture.products[0];
  for (const mutation of [
    { storeId: '999999' },
    { pid: '999999' },
    { containsAlcohol: false },
    { dispItemPackageQty: 2 },
    { channelEligibility: { inStore: false, shipping: true } },
    { channelInventory: { instore: '0', shipping: '1' } },
  ]) {
    assert.deepEqual(parseMaineShawsResearchInventory(
      { response: { docs: [{ ...product, ...mutation }] } },
      source,
      bible,
      { observedAt: capture.productReceipt.capturedAt },
    ), []);
  }
});
