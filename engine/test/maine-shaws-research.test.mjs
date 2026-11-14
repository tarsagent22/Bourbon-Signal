import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BourbonBible } from '../src/core/bible.mjs';
import { CUSTOMER_ACTIVE_STATE_IDS, STATE_LIFECYCLE_CONFIG } from '../src/state-lifecycle.mjs';
import { ALL_STATE_SOURCES } from '../src/state-sources.mjs';
import { groceryResearchSourceForState, collectGroceryResearchReport, isExactGroceryResearchInventory } from '../src/research-grocery-runtime.mjs';
import { researchSourceForState, withResearchLifecycle } from '../src/research-state-registry.mjs';
import {
  MAINE_SHAWS_RESEARCH_SOURCES,
  maineShawsPremiseMatches,
  parseMaineShawsResearchInventory,
} from '../src/collectors/maine-shaws-research.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/maine-shaws-research-20261114/identity.json', import.meta.url)));
const bible = new BourbonBible(fixture.bibleRecords);
const byMerchant = new Map(MAINE_SHAWS_RESEARCH_SOURCES.map(source => [source.merchantId, source]));

test('Maine Shaw\'s registry covers ten premises; eight retain exact limited-product captures', () => {
  assert.equal(fixture.researchOnly, true);
  assert.equal(fixture.productionMutation, false);
  assert.equal(MAINE_SHAWS_RESEARCH_SOURCES.length, 10);
  assert.equal(new Set(MAINE_SHAWS_RESEARCH_SOURCES.map(source => source.city)).size, 10);
  assert.deepEqual(MAINE_SHAWS_RESEARCH_SOURCES.map(source => source.merchantId).sort(),
    ['1609','2541','2552','3548','3551','4556','4559','4560','57','608'].sort());
  assert.equal(CUSTOMER_ACTIVE_STATE_IDS.has('ME'), false);
  assert.equal(researchSourceForState('ME', { shadowMode: false }), null);
  assert.equal(researchSourceForState('ME', { shadowMode: true }), groceryResearchSourceForState('ME'));
  assert.equal(withResearchLifecycle(STATE_LIFECYCLE_CONFIG).states.ME.publicStatus, 'research_only');
  assert.equal(ALL_STATE_SOURCES.find(source => source.id === 'ME').sources.some(source => source.url.includes('www.shaws.com')), false);
  assert.equal(fixture.stores.reduce((count, store) => count + store.products.length, 0), 23);

  const canonicalNames = new Set();
  for (const capture of fixture.stores) {
    const source = byMerchant.get(capture.source.merchantId);
    assert.ok(source);
    assert.deepEqual({ ...capture.source, sourceLabel: source.sourceLabel }, source);
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

test('Maine Shaw\'s registered shadow collector stays within the retained 30-request cohort and cannot publish', async () => {
  const config = groceryResearchSourceForState('ME');
  assert.ok(config);
  const byZip = new Map(MAINE_SHAWS_RESEARCH_SOURCES.map(source => [source.zip, source]));
  const byMerchant = new Map(MAINE_SHAWS_RESEARCH_SOURCES.map(source => [source.merchantId, source]));
  const captures = new Map(fixture.stores.map(store => [store.source.merchantId, store]));
  const requests = [];
  const fetchText = async url => {
    const target = new URL(url);
    requests.push(target);
    let payload;
    if (target.pathname.endsWith('/storeresolver/v2/all')) {
      const source = byZip.get(target.searchParams.get('zipcode'));
      assert.ok(source);
      payload = { instore: { stores: [{ locationId: source.merchantId, domainName: "Shaw's", polarisBannerName: 'shaws',
        address: { country: 'US', state: 'ME', line1: source.address.split(',')[0], city: source.city, zipcode: source.zip } }] } };
    } else {
      const source = byMerchant.get(target.searchParams.get('storeid'));
      assert.ok(source);
      const term = target.searchParams.get('q');
      payload = { appCode: 'GR200', response: { start: 0, miscInfo: { query: term },
        docs: captures.get(source.merchantId)?.products || [] } };
    }
    return { ok: true, status: 200, url, text: JSON.stringify(payload) };
  };
  const reportDirectory = await mkdtemp(path.join(tmpdir(), 'maine-shaws-shadow-'));
  try {
    const report = await collectGroceryResearchReport(config, bible, {
      env: { BOURBON_SIGNAL_SHADOW_MODE: '1' }, fetchText, sleep: async () => {},
      attemptsFile: path.join(reportDirectory, 'attempts.json'), sourceClockFile: path.join(reportDirectory, 'source-clock.json'), reportDirectory,
    });
    assert.equal(report.metadata.complete, true, JSON.stringify({metadata:report.metadata,roadblocks:report.roadblocks}));
    assert.equal(report.metadata.shadowOnly, true);
    assert.ok(report.signals.every(isExactGroceryResearchInventory));
    const [positive] = report.signals;
    assert.equal(isExactGroceryResearchInventory({ ...positive, canAlertAsInventory: true }), false);
    assert.equal(isExactGroceryResearchInventory({ ...positive, storeAddress: "12 Different St, Portland, ME 04103" }), false);
    assert.equal(report.metadata.productionActivationAllowed, false);
    assert.equal(report.metadata.customerDeliveryAllowed, false);
    assert.equal(report.metadata.requests.length, 30);
    assert.equal(requests.length, 30);
    assert.deepEqual(report.metadata.selectedStores.slice().sort(), MAINE_SHAWS_RESEARCH_SOURCES.map(source => source.storeId).sort());
    assert.deepEqual(report.metadata.verifiedPremises.slice().sort(), MAINE_SHAWS_RESEARCH_SOURCES.map(source => source.storeId).sort());
    assert.deepEqual([...new Set(report.signals.map(row => row.canonicalName))].sort(), [
      'Blade and Bow Bourbon', 'Heaven Hill Bottled-in-Bond 7 Year',
      'Penelope Four Grain Bourbon', 'Wild Turkey Rare Breed Straight Bourbon',
    ]);
    assert.ok(report.signals.every(row => row.researchOnly === true && row.alertable === false
      && row.eligibleForOnSite === false && row.eligibleForDelivery === false
      && row.sourceProductBinding.shadowOnly === true && row.raw.shadowOnly === true));
    assert.ok(requests.every(url => url.hostname === 'www.shaws.com'
      && ['/abs/pub/xapi/storeresolver/v2/all','/abs/pub/xapi/search/substitute'].includes(url.pathname)));
    const beforeSecondRun = requests.length;
    const repeat = await collectGroceryResearchReport(config, bible, {
      env: { BOURBON_SIGNAL_SHADOW_MODE: '1' }, fetchText, sleep: async () => {},
      attemptsFile: path.join(reportDirectory, 'attempts.json'), sourceClockFile: path.join(reportDirectory, 'source-clock.json'), reportDirectory,
    });
    assert.equal(repeat.status, 'not_due');
    assert.equal(repeat.metadata.requestCount, 0);
    assert.equal(requests.length, beforeSecondRun);
  } finally {
    await rm(reportDirectory, { recursive: true, force: true });
  }
});

test('Maine Shaw\'s resolver identity requires the recorded ASCII-apostrophe domain and exact source', () => {
  const source = MAINE_SHAWS_RESEARCH_SOURCES.find(candidate => candidate.merchantId === '2541');
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
