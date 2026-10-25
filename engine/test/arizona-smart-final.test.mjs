import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BourbonBible } from '../src/core/bible.mjs';
import { parseArizonaSmartFinalInventory, collectArizonaSmartFinal, smartFinalEmbeddedState } from '../src/collectors/arizona-smart-final.mjs';
import { isArizonaRetailerInventory } from '../src/arizona-retailer-policy.mjs';
import { canonicalizeSignal } from '../src/operational-report.mjs';
import { bibleLookup, buildDrops } from '../src/export-site-contract.mjs';
import { isPublicDropFeedEligible } from '../../src/lib/public-drop-evidence.ts';
import { runArizonaSourcesWithDenialBackoff } from '../src/collectors/arizona-source-attempts.mjs';
import { ARIZONA_SMART_FINAL_SOURCE } from '../src/collectors/arizona-smart-final.mjs';
const fixture = JSON.parse(await readFile(new URL('./fixtures/arizona-smart-final/2026-10-25.json', import.meta.url)));
const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));
const positive = fixture.pages[0];
const parse = (page = positive.page, store = positive.store, options = {}) => parseArizonaSmartFinalInventory(page, store, bible, { observedAt: positive.observedAt, sourceUrl: positive.sourceUrl, ...options });
const html = state => `window.__PRELOADED_STATE__=${JSON.stringify(state)}; window.__GROWTHBOOK_FEATURE_FLAGS__={};`;

test('selected-store pickup stock survives canonicalization, serialization, export and public evidence without a count', t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(positive.observedAt) + 60_000 });
  const signal = parse()[0];
  assert.ok(isArizonaRetailerInventory(signal));
  assert.equal(signal.quantity, 0);
  assert.equal(signal.quantityIsExact, false);
  const op = JSON.parse(JSON.stringify([canonicalizeSignal(signal, bible)]));
  const drops = buildDrops(op, bibleLookup(bible.records), op);
  assert.equal(drops.length, 1);
  assert.ok(isPublicDropFeedEligible(drops[0]));
  assert.deepEqual(drops[0].sourceProductBinding, signal.sourceProductBinding);
  assert.equal(drops[0].quantityIsExact, false);
  assert.equal(isPublicDropFeedEligible({ ...drops[0], sourceProductBinding: null }), false);
  assert.equal(isPublicDropFeedEligible({ ...drops[0], storeAddress: '999 Other St, Gilbert, AZ 85234' }), false);
});

test('empty catalog defaults, unavailable stock, wrong stores, sizes and shopping modes cannot become inventory', () => {
  const negative = fixture.pages[1];
  assert.deepEqual(parse(negative.page, negative.store, { sourceUrl: negative.sourceUrl }), []);
  const mutations = [p => { p.product.available = false; }, p => { p.product.sku = 'other'; }, p => { p.product.name += ' Cream'; },
    p => { p.product.attributes.StockStatus = 'out'; }, p => { p.product.attributes.alcohol_restricted = false; }, p => { p.product.unitOfSize.size = 50; },
    p => { p.shoppingModes.selectedShoppingMode.displayName = 'delivery'; }, p => { p.stores.retailerStoreId = '721'; },
    p => { p.stores.activeStoreDetails.countyProvinceState = 'CA'; }, p => { p.stores.activeStoreDetails.addressLine1 = '999 Wrong St'; }];
  for (const mutate of mutations) { const page = structuredClone(positive.page); mutate(page); assert.deepEqual(parse(page), []); }
  assert.deepEqual(parse(undefined, { ...positive.store, shoppingModes: ['planning'] }), []);
  assert.deepEqual(parse(undefined, undefined, { sourceUrl: positive.sourceUrl.replace('/730/', '/721/') }), []);
  assert.equal(smartFinalEmbeddedState('window.__PRELOADED_STATE__=process.exit(); window.__GROWTHBOOK_FEATURE_FLAGS__={}'), null);
});

test('collector discovers current exact premises, excludes planning-only stores and stops after a denial', async () => {
  const urls = [];
  const result = await collectArizonaSmartFinal({ id: 'AZ' }, bible, positive.observedAt, {
    sleep: async () => {}, fetchText: async url => {
      urls.push(url);
      return urls.length === 1 ? { ok: true, status: 200, text: html({ stores: { availablePlanningStores: { items: fixture.discoveredStores } } }) }
        : { ok: false, status: 403, text: '' };
    },
  });
  assert.equal(urls.length, 2);
  assert.equal(result.signals.length, 0);
  assert.ok(urls.every(url => !url.includes('/rsid/491/product/')));
  assert.equal(result.metadata.discoveredStores.length, 7);
});

test('persistent denial control escapes the adapter and stops the entire retailer source pass', async () => {
  const urls = [];
  const result = await runArizonaSourcesWithDenialBackoff([ARIZONA_SMART_FINAL_SOURCE],
    (_source, { fetchText }) => collectArizonaSmartFinal({ id: 'AZ' }, bible, positive.observedAt, { fetchText, sleep: async () => {} }),
    { writeAttempts: async () => {}, fetchText: async url => {
      urls.push(url);
      return urls.length === 1 ? { ok: true, status: 200, text: html({ stores: { availablePlanningStores: { items: fixture.discoveredStores } } }) }
        : { ok: false, status: 403, text: '' };
    } });
  assert.equal(urls.length, 2, 'no later premise may be requested after access denial');
  assert.equal(result.values.length, 0);
  assert.equal(result.roadblocks[0].status, 403);
  assert.equal(result.metadata.sourceAttempts['smart-final'].status, 'access_denied');
});
