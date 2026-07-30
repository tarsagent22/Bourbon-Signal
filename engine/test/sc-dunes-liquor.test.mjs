import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { BourbonBible } from '../src/core/bible.mjs';
import { confidenceForSignal } from '../src/confidence-policy.mjs';
import {
  buildSouthCarolinaDunesSignal,
  cityHiveSafeBottleMatch,
  collectSouthCarolinaDunes,
  isSouthCarolinaDunesStoreMetadata,
  isSouthCarolinaDunesStorefrontHtml,
  isFreshSouthCarolinaDunesCacheTimestamp,
  parseSouthCarolinaDunesItemDetail,
  readBoundedSouthCarolinaDunesResponse,
} from '../src/collectors/precision-probes.mjs';

const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));
const operationalReportSource = await readFile(new URL('../src/operational-report.mjs', import.meta.url), 'utf8');
const metadataCapture = JSON.parse(await readFile(new URL('../data/source-captures/SC-dunes-2026-07-30/store-metadata.json', import.meta.url), 'utf8'));
const storefrontCapture = await readFile(new URL('../data/source-captures/SC-dunes-2026-07-30/storefront.html', import.meta.url), 'utf8');
const searchCapture = JSON.parse(await readFile(new URL('../data/source-captures/SC-dunes-2026-07-30/search-results.json', import.meta.url), 'utf8'));
const itemCapture = JSON.parse(await readFile(new URL('../data/source-captures/SC-dunes-2026-07-30/item-details.json', import.meta.url), 'utf8'));

function detailFor(sku) {
  const entry = itemCapture.items.find((row) => Number(row.searchRow?.ID) === Number(sku));
  assert.ok(entry, `missing captured Dunes SKU ${sku}`);
  return structuredClone(entry);
}

test('Dunes reviewed abbreviations map to distinct canonical bottle expressions', () => {
  const expected = new Map([
    ["Bookers Bbn Jimmy's Batch 750ml", "Booker's Bourbon"],
    ['1792 Bourbon Small Batch 750ml', '1792 Small Batch'],
    ['WOODFORD DOUBLE OAKED BOURBON 750ml', 'Woodford Reserve Double Oaked Bourbon'],
    ['OLD FORESTER 1920 750ml', 'Old Forester 1920 Prohibition Style'],
    ['OLD FORESTER STATESMAN 750ml', 'Old Forester Statesman'],
    ['Old Forester Whsky 1910 750ml', 'Old Forester 1910 Old Fine Whisky'],
    ['Elijah Craig Ky Strt Rye Whsky 750ml', 'Elijah Craig Straight Rye Whiskey'],
    ['Bakers High Ry 7 Yr 750ml', "Baker's High Rye Bourbon"],
  ]);
  for (const [rawName, canonical] of expected) {
    assert.equal(bible.match(rawName)?.record?.canonical, canonical, rawName);
  }
});

test('Dunes generic labels cannot inherit a year-specific Old Forester identity', () => {
  assert.equal(cityHiveSafeBottleMatch('OLD FORESTER BOURBON 750ml', bible).record, null);
  assert.equal(cityHiveSafeBottleMatch('OLD FORESTER 1920 750ml', bible).record?.canonical, 'Old Forester 1920 Prohibition Style');
  assert.equal(cityHiveSafeBottleMatch('1792 Sweet Wheat 750ml', bible).record?.canonical, '1792 Sweet Wheat');
});

test('Dunes metadata binds the runtime to one exact Myrtle Beach premises', () => {
  assert.equal(isSouthCarolinaDunesStoreMetadata(metadataCapture.response), true);

  const wrongAddress = structuredClone(metadataCapture.response);
  wrongAddress.Data.StoreInfo.ADDRESS3 = 'Charleston, SC, 29401';
  assert.equal(isSouthCarolinaDunesStoreMetadata(wrongAddress), false);

  const wrongPhone = structuredClone(metadataCapture.response);
  wrongPhone.Data.StoreInfo.PHONE = '843-000-0000';
  assert.equal(isSouthCarolinaDunesStoreMetadata(wrongPhone), false);
});

test('Dunes storefront binds the integrated cart to runtime store 6178', () => {
  assert.equal(isSouthCarolinaDunesStorefrontHtml(storefrontCapture), true);
  assert.equal(isSouthCarolinaDunesStorefrontHtml(storefrontCapture.replaceAll('Store_6178', 'Store_9999')), false);
  assert.equal(isSouthCarolinaDunesStorefrontHtml(storefrontCapture.replace('lblIsIntegratedCart">1', 'lblIsIntegratedCart">0')), false);
});

test('Dunes cache freshness rejects future timestamps outside bounded clock skew', () => {
  const now = Date.parse('2026-07-30T20:00:00.000Z');
  assert.equal(isFreshSouthCarolinaDunesCacheTimestamp('2026-07-30T20:00:00.000Z', now), true);
  assert.equal(isFreshSouthCarolinaDunesCacheTimestamp('2026-07-30T14:00:00.000Z', now), true);
  assert.equal(isFreshSouthCarolinaDunesCacheTimestamp('2026-07-30T20:05:00.000Z', now), true);
  assert.equal(isFreshSouthCarolinaDunesCacheTimestamp('2026-07-30T20:05:00.001Z', now), false);
  assert.equal(isFreshSouthCarolinaDunesCacheTimestamp('2026-07-30T13:59:59.999Z', now), false);
  assert.equal(isFreshSouthCarolinaDunesCacheTimestamp('not-a-date', now), false);
});

test('Dunes item detail preserves exact positive stock, price, SKU, and store-bound orderability', () => {
  const entry = detailFor(89103);
  const row = parseSouthCarolinaDunesItemDetail(entry.response, {
    searchRow: entry.searchRow,
    observedAt: '2026-07-30T19:36:44.157Z',
  });

  assert.deepEqual(row, {
    sku: '89103',
    rawName: '1792 Bourbon Full Proof 750ml',
    quantity: 2,
    price: 49.99,
    size: '750ml',
    department: 'Spirits',
    category: 'Bourbon',
    itemUrl: 'https://www.dunesliquor.com/ListManage/ItemDescriptionPage?ItemID=89103',
    quantitySemantics: 'exact_retailer_in_store_quantity',
    sourceAvailabilityVerified: true,
    premisesVerified: true,
    pickupOfferVerified: true,
    orderabilityOfferVerified: true,
  });
});

test('Dunes signal carries exact-store identity and alert-grade stock evidence without widening fulfillment claims', () => {
  const entry = detailFor(89103);
  const parsed = parseSouthCarolinaDunesItemDetail(entry.response, { searchRow: entry.searchRow });
  const signal = buildSouthCarolinaDunesSignal({ id: 'SC' }, parsed, {
    observedAt: '2026-07-30T19:36:44.157Z',
    record: { id: '1792-full-proof', canonical: '1792 Full Proof', tier: 'limited' },
    match: { confidence: 0.97 },
  });

  assert.equal(signal.eventType, 'retailer_store_inventory_result');
  assert.equal(signal.sourceRuntimeId, 'retailer:sc:dunes:6178');
  assert.equal(signal.storeId, 'dunes-liquor:dunes-liquor-myrtle-beach');
  assert.equal(signal.storeAddress, '980 Cipriana Drive, Unit A5-B, Myrtle Beach, SC 29572');
  assert.equal(signal.city, 'Myrtle Beach');
  assert.equal(signal.canonicalName, '1792 Full Proof');
  assert.equal(signal.quantity, 2);
  assert.equal(signal.storeQty, 2);
  assert.equal(signal.quantityIsExact, true);
  assert.equal(signal.price, 49.99);
  assert.equal(signal.canAlertAsInventory, true);
  assert.equal(signal.canAlertAsWatch, true);
  assert.equal(signal.sourceAvailabilityVerified, true);
  assert.equal(signal.premisesVerified, true);
  assert.equal(signal.pickupOfferVerified, true);
  assert.equal(signal.orderabilityOfferVerified, true);
  assert.equal(signal.deliveryOfferVerified, false);
  assert.equal(signal.fulfillmentGuaranteed, false);
  assert.match(signal.evidence, /exact in-store quantity 2/i);
  assert.equal(signal.raw.runtimeStoreId, '6178');
  assert.equal(signal.raw.sku, '89103');
  const policy = confidenceForSignal(signal);
  assert.equal(policy.policyMode, 'alert_retailer_store_inventory_caveat');
  assert.equal(policy.canAlertAsInventory, true);
  assert.equal(policy.canAlertAsWatch, true);
  assert.match(operationalReportSource, /canAlertAsInventory:\s*sourceAlertPolicy\.canAlertAsInventory === false \? false : policy\.canAlertAsInventory/);
  assert.match(operationalReportSource, /canAlertAsWatch:\s*sourceAlertPolicy\.canAlertAsWatch === false \? false : policy\.canAlertAsWatch/);
  const signalObservedMs = Date.parse(signal.observedAt);
  assert.equal(confidenceForSignal(signal, { nowMs: signalObservedMs }).canAlertAsInventory, true);
  assert.equal(confidenceForSignal(signal, { nowMs: signalObservedMs + 6 * 60 * 60_000 + 1 }).canAlertAsInventory, false);

  for (const mutate of [
    (row) => { row.sourceRuntimeId = 'retailer:sc:dunes:9999'; },
    (row) => { row.storeId = 'dunes-liquor:charleston'; },
    (row) => { row.storeAddress = '980 King Street, Charleston, SC 29403'; },
    (row) => { row.sourceUrl = 'https://example.com/ListManage/ItemDescriptionPage?ItemID=89103'; },
    (row) => { row.sourceUrl = 'https://www.dunesliquor.com/ListManage/ItemDescriptionPage?ItemID=99999'; },
    (row) => { row.quantityIsExact = false; },
    (row) => { row.pickupOfferVerified = false; },
    (row) => { row.deliveryOfferVerified = true; },
    (row) => { row.quantity = true; row.storeQty = true; row.price = true; },
    (row) => { row.observedAt = '2026-07-29T19:36:44.157Z'; },
  ]) {
    const forged = structuredClone(signal);
    mutate(forged);
    assert.equal(confidenceForSignal(forged).canAlertAsInventory, false);
  }
});

test('Dunes collector uses bounded public routes and isolates sold-out rows', async () => {
  const requests = [];
  const searchByTerm = new Map(searchCapture.searches.map((entry) => [entry.term, entry.response]));
  const detailBySku = new Map(itemCapture.items.map((entry) => [String(entry.searchRow.ID), entry.response]));
  const fetcher = async (url, options = {}) => {
    requests.push({ url, method: options.method || 'GET', body: options.body || null });
    if (url === 'https://www.dunesliquor.com') return { ok: true, status: 200, url, text: storefrontCapture, error: null };
    if (url.endsWith('/Home/LoadBasicData')) return { ok: true, status: 200, url, text: JSON.stringify(metadataCapture.response), error: null };
    const body = JSON.parse(options.body || '{}');
    if (url.endsWith('/Home/GetSearchResult')) return { ok: true, status: 200, url, text: JSON.stringify(searchByTerm.get(body.SearchTerm)), error: null };
    if (url.endsWith('/ListManage/LoadItemDescription')) return { ok: true, status: 200, url, text: JSON.stringify(detailBySku.get(String(body.SKU))), error: null };
    return { ok: false, status: 404, url, text: '', error: 'unexpected test route' };
  };

  const result = await collectSouthCarolinaDunes({ id: 'SC' }, {}, '2026-07-30T19:36:44.157Z', {
    fetcher,
    sleepFn: async () => {},
    useCache: false,
    persistCache: false,
    searchTerms: ['1792', 'blanton'],
    maxItems: 4,
    detailConcurrency: 2,
    matchBottle: (rawName) => ({
      match: { confidence: 0.95 },
      record: { id: `test-${rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, canonical: rawName, tier: 'standard' },
    }),
  });

  const inventory = result.signals.filter((row) => row.eventType === 'retailer_store_inventory_result');
  assert.equal(inventory.length, 3);
  assert.deepEqual(inventory.map((row) => row.quantity).sort((a, b) => a - b), [1, 2, 2]);
  assert.ok(inventory.every((row) => row.storeId === 'dunes-liquor:dunes-liquor-myrtle-beach'));
  assert.ok(inventory.every((row) => row.quantityIsExact === true));
  assert.equal(result.roadblocks.length, 0);
  assert.ok(requests.length <= 8, `bounded test collector made ${requests.length} requests`);
  assert.equal(requests.filter((row) => row.url.endsWith('/Home/LoadBasicData')).length, 1);
  assert.equal(requests.filter((row) => row.url.endsWith('/Home/GetSearchResult')).length, 2);
});

test('Dunes bounded reader aborts oversized streamed and declared bodies before buffering them', async () => {
  const oversizedStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('123456'));
      controller.enqueue(new TextEncoder().encode('789012'));
      controller.close();
    },
  });
  await assert.rejects(
    readBoundedSouthCarolinaDunesResponse(new Response(oversizedStream), { url: 'https://www.dunesliquor.com/test', maxBytes: 10 }),
    /exceeded 10 bytes/,
  );
  await assert.rejects(
    readBoundedSouthCarolinaDunesResponse(new Response('small', { headers: { 'content-length': '999' } }), { url: 'https://www.dunesliquor.com/test', maxBytes: 10 }),
    /declared 999 bytes/,
  );
});

test('Dunes collector rejects oversized storefront bodies before any item requests', async () => {
  const requests = [];
  const result = await collectSouthCarolinaDunes({ id: 'SC' }, bible, '2026-07-30T19:36:44.157Z', {
    fetcher: async (url) => {
      requests.push(url);
      return { ok: true, status: 200, url, text: 'x'.repeat(600 * 1_024), error: null };
    },
    useCache: false,
    persistCache: false,
  });
  assert.equal(result.signals.length, 0);
  assert.equal(requests.length, 1);
  assert.match(result.roadblocks[0].error, /maximum body/i);
});

test('Dunes parser rejects out-of-stock, cross-SKU, non-bottle, and unsafe category responses', () => {
  const soldOut = detailFor(73066);
  assert.equal(parseSouthCarolinaDunesItemDetail(soldOut.response, { searchRow: soldOut.searchRow, observedAt: '2026-07-30T19:36:44.157Z' }), null);

  const wrongSku = detailFor(89103);
  wrongSku.response.Data.objItem.SKU = 99999;
  assert.equal(parseSouthCarolinaDunesItemDetail(wrongSku.response, { searchRow: wrongSku.searchRow, observedAt: '2026-07-30T19:36:44.157Z' }), null);

  const cream = detailFor(89103);
  cream.response.Data.objItem.ITEMNAME = 'Buffalo Trace Bourbon Cream';
  assert.equal(parseSouthCarolinaDunesItemDetail(cream.response, { searchRow: cream.searchRow, observedAt: '2026-07-30T19:36:44.157Z' }), null);

  const nips = detailFor(88824);
  assert.equal(parseSouthCarolinaDunesItemDetail(nips.response, { searchRow: nips.searchRow, observedAt: '2026-07-30T19:36:44.157Z' }), null);

  const multipack = detailFor(88353);
  assert.equal(parseSouthCarolinaDunesItemDetail(multipack.response, { searchRow: multipack.searchRow, observedAt: '2026-07-30T19:36:44.157Z' }), null);

  const wine = detailFor(89103);
  wine.response.Data.objItem.DEPNAME = 'Wines**';
  wine.response.Data.objItem.CATNAME = '**Wine';
  assert.equal(parseSouthCarolinaDunesItemDetail(wine.response, { searchRow: wine.searchRow, observedAt: '2026-07-30T19:36:44.157Z' }), null);
});

test('Dunes parser rejects malformed quantity, price, search identity, and response envelopes', () => {
  for (const mutate of [
    (entry) => { entry.response.Data.objItem.INSTOREQTY = 0; },
    (entry) => { entry.response.Data.objItem.INSTOREQTY = 1.5; },
    (entry) => { entry.response.Data.objItem.INSTOREQTY = true; },
    (entry) => { entry.response.Data.objItem.PRICEPERUNIT = 0; },
    (entry) => { entry.response.Data.objItem.PRICEPERUNIT = true; },
    (entry) => { entry.searchRow.label = 'Unrelated Product 750ml'; },
    (entry) => { entry.response.StatusVal = false; },
  ]) {
    const entry = detailFor(89103);
    mutate(entry);
    assert.equal(parseSouthCarolinaDunesItemDetail(entry.response, { searchRow: entry.searchRow, observedAt: '2026-07-30T19:36:44.157Z' }), null);
  }
});
