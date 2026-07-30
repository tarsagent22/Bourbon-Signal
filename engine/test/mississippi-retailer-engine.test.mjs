import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  MISSISSIPPI_RETAILER_SOURCES,
  isMississippiCanonicalBottleCompatible,
  parseMississippiCityHiveHtml,
  parseMississippiGoDaddyReleaseProducts,
  parseMississippiGoToLiquorStoreProducts,
  parseMississippiMoonshineResponse,
  parseMississippiTupelo2GoHtml,
} from '../src/collectors/mississippi-retailer-surfaces.mjs';
import {
  buildMississippiReleaseWatchSignal,
  buildMississippiRetailerSignal,
  collectMississippiRetailers,
  readBoundedMississippiJsonResponse,
  readBoundedMississippiTextResponse,
} from '../src/collectors/mississippi-retailer-collector.mjs';
import {
  isMississippiRetailerInventory,
  isMississippiRetailerReleaseWatch,
  isMississippiRetailerSignalIdentity,
} from '../src/mississippi-retailer-policy.mjs';
import {
  MISSISSIPPI_SOURCE_CONFIG_DIGEST,
  silenceMississippiResearchCandidates,
  suppressMississippiActivationBaseline,
} from '../src/mississippi-activation-policy.mjs';
import { verifyMississippiReleasePolicy } from '../src/mississippi-release-policy.mjs';
import { validateMississippiShadowEvidenceArtifact } from '../src/verify-ms.mjs';
import { summarizeMississippiSourceHealth } from '../src/mississippi-source-health.mjs';
import { confidenceForSignal } from '../src/confidence-policy.mjs';
import { getStateLifecycle } from '../src/state-lifecycle.mjs';
import { ALL_STATE_SOURCES } from '../src/state-sources.mjs';
import { canonicalizeSignal } from '../src/operational-report.mjs';
import { buildDrops } from '../src/export-site-contract.mjs';

const registry = JSON.parse(await readFile(new URL('../data/mississippi-retailer-registry.json', import.meta.url), 'utf8'));
const fixture = (name) => readFile(new URL(`./fixtures/ms/${name}`, import.meta.url), 'utf8');

function exactSignal(source, row = {}) {
  return buildMississippiRetailerSignal(source, {
    productId: source.platform === 'cityhive' ? 'product-1' : source.platform === 'moonshine' ? '2896' : '1138',
    variantId: source.platform === 'cityhive' ? 'option-1' : source.platform === 'moonshine' ? '3605' : null,
    title: 'Buffalo Trace Bourbon 750ml',
    productUrl: source.platform === 'cityhive'
      ? `${source.baseUrl}/shop/product/buffalo-trace/product-1?option-id=option-1`
      : source.platform === 'moonshine'
        ? `${source.baseUrl}/shop/buffalo-trace-bourbon-2896`
        : `${source.baseUrl}/p/buffalo-trace-bourbon/1138`,
    price: 31.99,
    reportedQuantity: 7,
    sourceAvailabilityVerified: true,
    pickupOfferVerified: true,
    premisesVerified: true,
    ...row,
  }, {
    observedAt: '2026-07-25T20:00:00.000Z',
    bottle: { id: 'bb_test', canonical: 'Buffalo Trace Bourbon', tier: 'allocated', confidence: 0.94 },
  });
}

test('registry binds thirteen reviewed stores to exact permit, merchant, host, premises, and independent runtime IDs', () => {
  assert.equal(registry.schemaVersion, 1);
  assert.equal(registry.stores.length, 13);
  assert.deepEqual(new Set(registry.stores.map((store) => store.permitNumber)), new Set(['046478', '040562', '029254', '044692', '044411', '049222', '051851', '007481', '041265', '047419', '055298', '041251', '041113']));
  assert.equal(new Set(registry.stores.map((store) => store.sourceRuntimeId)).size, 13);
  assert.deepEqual(registry.stores.slice(0, 4).map((store) => ({
    permit: store.permitNumber,
    merchant: store.merchantId,
    controlStore: store.controlStoreId || null,
    host: store.hostname,
    city: store.city,
    zip: store.zip,
  })), [
    { permit: '046478', merchant: '955132', controlStore: '1031', host: 'www.aliquorwarehouse.com', city: 'Winona', zip: '38967' },
    { permit: '040562', merchant: '736142', controlStore: '1069', host: 'www.cabinfeverliquor.com', city: 'Nesbit', zip: '38651' },
    { permit: '029254', merchant: '68ba2980113a7a29c2076fc3', controlStore: null, host: 'www.desotoliquor.com', city: 'Horn Lake', zip: '38637' },
    { permit: '044411', merchant: '323', controlStore: null, host: 'www.moonshinems.com', city: 'Madison', zip: '39110' },
  ]);
  assert.deepEqual(registry.stores.filter((store) => store.platform === 'moonshine').map((store) => ({
    name: store.name,
    seller: store.moonshineSellerId,
    url: store.sellerUrl,
    pickup: store.pickupAvailable,
  })), [
    { name: 'Barleys Beer Barn', seller: 323, url: 'https://www.moonshinems.com/barleysbeerbarn', pickup: true },
    { name: 'Cork Screw', seller: 2118, url: 'https://www.moonshinems.com/corkscrew', pickup: true },
    { name: 'Madison Cellars', seller: 7, url: 'https://www.moonshinems.com/madisoncellars', pickup: true },
    { name: 'Terra Nova', seller: 1882, url: 'https://www.moonshinems.com/terranova', pickup: true },
    { name: 'Ridgeland Wine & Spirits', seller: 767, url: 'https://www.moonshinems.com/ridgelandwinespirit', pickup: false },
  ]);
  assert.deepEqual(new Set(MISSISSIPPI_RETAILER_SOURCES.map((source) => source.permitNumber)), new Set(registry.stores.map((store) => store.permitNumber)));
  assert.deepEqual(registry.stores.map((store) => store.autonomousFetchAllowed), [false, false, true, true, true, true, true, true, true, true, true, true, true]);
  assert.deepEqual(registry.stores.map((store) => store.sourcePolicyStatus), ['blocked_by_source_policy', 'blocked_by_source_policy', 'allowed', 'allowed', 'allowed', 'allowed', 'allowed', 'allowed', 'allowed', 'allowed', 'allowed', 'allowed', 'allowed']);
});

test('GoTo parser requires visible store-bound orderability, safe format, and a clean same-host product URL', async () => {
  const source = MISSISSIPPI_RETAILER_SOURCES.find((entry) => entry.permitNumber === '046478');
  const rows = parseMississippiGoToLiquorStoreProducts(await fixture('gotoliquor/positive.html'), source);
  assert.deepEqual(rows, [{
    productId: '1138',
    variantId: null,
    title: 'Buffalo Trace Bourbon 750ml',
    productUrl: 'https://www.aliquorwarehouse.com/p/buffalo-trace-bourbon/1138',
    price: 31.99,
    reportedQuantity: null,
    quantity: 0,
    quantityIsExact: false,
    sourceAvailabilityVerified: true,
    pickupOfferVerified: true,
    premisesVerified: true,
    inventorySemantics: 'binary_retailer_orderable_no_exact_count',
  }]);
  assert.deepEqual(parseMississippiGoToLiquorStoreProducts(
    (await fixture('gotoliquor/positive.html')).replaceAll('955132', '999999'),
    source,
  ), []);
  assert.deepEqual(parseMississippiGoToLiquorStoreProducts(
    (await fixture('gotoliquor/positive.html')).replaceAll('1031', '9999'),
    source,
  ), []);
});

test('Mississippi canonical compatibility rejects generic and wrong-grain containment matches', () => {
  assert.equal(isMississippiRetailerInventory(null), false);
  assert.equal(isMississippiCanonicalBottleCompatible('ANGELS ENVY BOURBON WHISKEY 750ml', 'Buffalo Trace Bourbon'), false);
  assert.equal(isMississippiCanonicalBottleCompatible('OLD FITZGERALD 7YR BIB BOURBON 750ml', 'Old Forester 100 Proof Bourbon'), false);
  assert.equal(isMississippiCanonicalBottleCompatible('OLD GRAND DAD BONDED BOURBON 750ml', 'Old Forester 100 Proof Bourbon'), false);
  assert.equal(isMississippiCanonicalBottleCompatible('FOUR GATE BOURBON 750ml', 'Four Roses Limited Edition Small Batch'), false);
  assert.equal(isMississippiCanonicalBottleCompatible('ANGELS ENVY BOURBON WHISKEY 750ml', "Angel's Envy Bourbon"), true);
  assert.equal(isMississippiCanonicalBottleCompatible('WOODFORD RESERVE STRAIGHT WHEAT 750ml', 'Woodford Reserve Bourbon'), false);
  assert.equal(isMississippiCanonicalBottleCompatible('WOODFORD RESERVE STRAIGHT MALT 750ml', 'Woodford Reserve Bourbon'), false);
  assert.equal(isMississippiCanonicalBottleCompatible('Evan Williams Bourbon Whiskey (750 ml)', 'Evan Williams 1783 Bourbon'), false);
  assert.equal(isMississippiCanonicalBottleCompatible('Rabbit Hole Bourbon Whiskey (750 ml)', 'Rabbit Hole Heigold Kentucky Straight Bourbon'), false);
  assert.equal(isMississippiCanonicalBottleCompatible('WILD TURKEY 750ML', 'Wild Turkey Master'), false);
  assert.equal(isMississippiCanonicalBottleCompatible('Old Forester 100 Proof Straight Kentucky Bourbon Whiskey Bottle (750 ml)', 'Old Forester 100 Proof Bourbon'), true);
  assert.equal(isMississippiCanonicalBottleCompatible('BARRELL BOURBON BATCH 30 750ml', 'Barrell Bourbon Batch'), true);
});

test('Tupelo2Go parser binds exact marketplace vendor, permit premise, active product control, and binary orderability', async () => {
  const source = MISSISSIPPI_RETAILER_SOURCES.find((entry) => entry.permitNumber === '055298');
  const html = await fixture('tupelo2go/positive.html');
  const rows = parseMississippiTupelo2GoHtml(html, source);
  assert.equal(rows.length, 1);
  assert.deepEqual({
    productId: rows[0].productId,
    variantId: rows[0].variantId,
    title: rows[0].title,
    productUrl: rows[0].productUrl,
    price: rows[0].price,
    quantity: rows[0].quantity,
    quantityIsExact: rows[0].quantityIsExact,
    orderabilityOfferVerified: rows[0].orderabilityOfferVerified,
    pickupOfferVerified: rows[0].pickupOfferVerified,
    premisesVerified: rows[0].premisesVerified,
  }, {
    productId: '16765721',
    variantId: null,
    title: 'ANGELS ENVY BOURBON WHISKEY 750ml',
    productUrl: source.categoryUrl,
    price: 65.99,
    quantity: 0,
    quantityIsExact: false,
    orderabilityOfferVerified: true,
    pickupOfferVerified: false,
    premisesVerified: true,
  });
  assert.match(rows[0].productBinding, /^[0-9a-f]{64}$/u);
  assert.deepEqual(parseMississippiTupelo2GoHtml(html.replaceAll('data-dd_vendorID="1187"', 'data-dd_vendorID="9999"'), source), []);
  assert.deepEqual(parseMississippiTupelo2GoHtml(html.replaceAll('1663 coley rd', '999 attacker rd'), source), []);
  assert.deepEqual(parseMississippiTupelo2GoHtml(html.replaceAll('Tupelo Wine Spirits', 'Forged Wine Spirits'), source), []);
  assert.deepEqual(parseMississippiTupelo2GoHtml(html.replace("Lzip(16765721,'1'", "Lzip(16765721,'3'"), source), []);
  const duplicate = `<a class="dd_item_a" href="#" OnClick="Lzip(16765721,'1', event);return false;"><div class="dd_menu-item"><div class="dd_menu-item-title">ANGELS ENVY BOURBON WHISKEY 750ml</div><p class="dd_menu-item-price">$65.99</p></div></a>`;
  assert.equal(parseMississippiTupelo2GoHtml(`${html}${duplicate}`, source).length, 1);
  const conflictingDuplicate = duplicate.replace('ANGELS ENVY BOURBON WHISKEY 750ml', 'BUFFALO TRACE BOURBON 750ml');
  assert.deepEqual(parseMississippiTupelo2GoHtml(`${html}${conflictingDuplicate}`, source), []);
  assert.deepEqual(parseMississippiTupelo2GoHtml(`${html}${' '.repeat(8 * 1024 * 1024)}`, source), []);
  assert.deepEqual(parseMississippiTupelo2GoHtml(html, { ...source, categoryUrl: 'https://www.tupelo2go.com/r/9999/restaurants/delivery/Alcohol/Forged' }), []);
});

test('Tupelo2Go signal identity survives canonicalization but rejects forged product bindings and controls', async () => {
  const source = MISSISSIPPI_RETAILER_SOURCES.find((entry) => entry.permitNumber === '055298');
  const [row] = parseMississippiTupelo2GoHtml(await fixture('tupelo2go/positive.html'), source);
  const signal = buildMississippiRetailerSignal(source, row, {
    observedAt: '2026-07-25T19:30:00.000Z',
    bottle: { id: 'bb_angels_envy', canonical: "Angel's Envy Bourbon", tier: 'standard', confidence: 1 },
  });
  assert.equal(buildMississippiRetailerSignal(source, row, {
    observedAt: '2026-07-25T19:30:00.000Z',
    bottle: { id: 'bb_buffalo_trace', canonical: 'Buffalo Trace Bourbon', tier: 'allocated', confidence: 0.94 },
  }), null);
  assert.equal(isMississippiRetailerSignalIdentity(signal), true);
  assert.equal(isMississippiRetailerInventory(signal), true);
  const normalized = canonicalizeSignal(signal, {
    match: () => ({ record: { id: 'bb_angels_envy_bourbon', canonical: "Angel's Envy Bourbon", tier: 'limited', producer: "Angel's Envy" } }),
  });
  assert.equal(isMississippiRetailerInventory(normalized), true);
  assert.equal(normalized.orderabilityOfferVerified, true);
  assert.equal(normalized.pickupOfferVerified, false);
  assert.equal(isMississippiRetailerInventory({ ...normalized, sourceProductBinding: '0'.repeat(64) }), false);
  assert.equal(isMississippiRetailerInventory({ ...normalized, raw: { ...normalized.raw, productBinding: '0'.repeat(64) } }), false);
  assert.equal(isMississippiRetailerInventory({ ...normalized, raw: { ...normalized.raw, controlCode: '9' } }), false);
  assert.equal(isMississippiRetailerInventory({ ...normalized, sourceUrl: 'https://www.tupelo2go.com/r/9999/restaurants/delivery/Alcohol/Forged' }), false);
  assert.equal(normalized.canAlertAsInventory, false);
  assert.equal(normalized.canAlertAsWatch, false);
});

test('CityHive parser binds exact merchant and premises but converts orderability to non-exact zero quantity', async () => {
  const source = MISSISSIPPI_RETAILER_SOURCES.find((entry) => entry.permitNumber === '029254');
  const rows = parseMississippiCityHiveHtml(await fixture('cityhive/positive.html'), source);
  assert.equal(rows.length, 1);
  assert.deepEqual({
    merchantId: rows[0].merchantId,
    productId: rows[0].productId,
    variantId: rows[0].variantId,
    quantity: rows[0].quantity,
    quantityIsExact: rows[0].quantityIsExact,
    pickupOfferVerified: rows[0].pickupOfferVerified,
    premisesVerified: rows[0].premisesVerified,
    semantics: rows[0].inventorySemantics,
  }, {
    merchantId: '68ba2980113a7a29c2076fc3',
    productId: 'product-1',
    variantId: 'option-1',
    quantity: 0,
    quantityIsExact: false,
    pickupOfferVerified: true,
    premisesVerified: true,
    semantics: 'binary_retailer_orderable_no_exact_count',
  });
  const forged = (await fixture('cityhive/positive.html')).replaceAll(
    '904 Goodman Rd W Ste A Horn Lake MS 38637',
    '999 Attacker Rd Jackson MS 39201',
  );
  assert.deepEqual(parseMississippiCityHiveHtml(forged, source), []);
});

test('Moonshine parser binds the selected seller, exact product URL, safe bottle size, price, and cart control', async () => {
  const source = MISSISSIPPI_RETAILER_SOURCES.find((entry) => entry.permitNumber === '007481');
  const payload = JSON.parse(await fixture('moonshine/positive.json'));
  const rows = parseMississippiMoonshineResponse(payload, source);
  assert.deepEqual(rows, [{
    productId: '2896',
    variantId: '3605',
    platformProductId: '3605',
    title: 'Bulleit Straight Bourbon 90 Proof 1.75L',
    productUrl: 'https://www.moonshinems.com/shop/17088-bulleit-straight-bourbon-90-proof-2896',
    price: 50.99,
    reportedQuantity: null,
    quantity: 0,
    quantityIsExact: false,
    sourceAvailabilityVerified: true,
    pickupOfferVerified: true,
    orderabilityOfferVerified: false,
    premisesVerified: true,
    inventorySemantics: 'binary_retailer_orderable_no_exact_count',
  }]);
  const forgedSeller = { ...payload, moonshine_seller_id: 7 };
  assert.deepEqual(parseMississippiMoonshineResponse(forgedSeller, source), []);
  const forgedControl = { ...payload, available_store_tab: payload.available_store_tab.replace('seller_id\" value=\"1882', 'seller_id\" value=\"7') };
  assert.deepEqual(parseMississippiMoonshineResponse(forgedControl, source), []);
  const unsafeSize = { ...payload, product_store: payload.product_store.replace('1.75L', '375ml') };
  assert.deepEqual(parseMississippiMoonshineResponse(unsafeSize, source), []);
});

test('Ridgeland Moonshine parser decodes human seller text but preserves exact machine identity and cart orderability', async () => {
  const source = MISSISSIPPI_RETAILER_SOURCES.find((entry) => entry.permitNumber === '041265');
  const payload = JSON.parse(await fixture('moonshine/ridgeland-positive.json'));
  const rows = parseMississippiMoonshineResponse(payload, source);
  assert.equal(rows.length, 1);
  assert.deepEqual({
    productId: rows[0].productId,
    variantId: rows[0].variantId,
    title: rows[0].title,
    sourceAvailabilityVerified: rows[0].sourceAvailabilityVerified,
    pickupOfferVerified: rows[0].pickupOfferVerified,
    orderabilityOfferVerified: rows[0].orderabilityOfferVerified,
    premisesVerified: rows[0].premisesVerified,
  }, {
    productId: '5386',
    variantId: '6387',
    title: 'Buffalo Trace Bourbon (Limit 1/order) 750ml',
    sourceAvailabilityVerified: true,
    pickupOfferVerified: false,
    orderabilityOfferVerified: true,
    premisesVerified: true,
  });
  assert.deepEqual(parseMississippiMoonshineResponse({ ...payload, moonshine_seller_id: 7 }, source), []);
  assert.deepEqual(parseMississippiMoonshineResponse({ ...payload, available_store_tab: payload.available_store_tab.replace('value="767"', 'value="7"') }, source), []);
});

test('Mabrys parser emits only fresh exact-bottle in-stock release rows and never treats holds as inventory', async () => {
  const source = MISSISSIPPI_RETAILER_SOURCES.find((entry) => entry.permitNumber === '047419');
  const payload = JSON.parse(await fixture('godaddy/mabrys-products.json'));
  const rows = parseMississippiGoDaddyReleaseProducts(payload, source, { observedAt: '2026-07-30T12:00:00.000Z' });
  assert.deepEqual(rows.map((row) => row.title), [
    'Very Olde St. Nick Ancient Cask IMMACULATA',
    'Rare Perfection 9-Year-Old Kentucky Bourbon',
  ]);
  assert.ok(rows.every((row) => row.inventorySemantics === 'retailer_release_hold_watch_no_inventory_count'
    && row.sourceAvailabilityVerified
    && row.premisesVerified
    && !row.pickupOfferVerified
    && row.quantity === 0
    && row.quantityIsExact === false));
  const signal = buildMississippiReleaseWatchSignal(source, rows[0], {
    observedAt: '2026-07-30T12:00:00.000Z',
    bottle: { id: 'bb_very_olde_st_nick_immaculata', canonical: 'Very Olde St. Nick Ancient Cask Immaculata', tier: 'limited', confidence: 0.9 },
  });
  assert.equal(isMississippiRetailerReleaseWatch(signal), true);
  const normalizedWatch = canonicalizeSignal(signal, {
    match: () => ({ record: { id: signal.canonicalBottleId, canonical: signal.canonicalName, tier: signal.tier, producer: 'Preservation Distillery' } }),
  });
  assert.equal(isMississippiRetailerReleaseWatch(normalizedWatch), true);
  assert.equal(isMississippiRetailerInventory(signal), false);
  assert.equal(signal.canAlertAsInventory, false);
  assert.equal(signal.canAlertAsWatch, false);
  assert.equal(signal.alertable, false);
  assert.equal(isMississippiRetailerReleaseWatch({ ...signal, productId: 'forged-product' }), false);
  assert.equal(isMississippiRetailerReleaseWatch({ ...signal, raw: { ...signal.raw, productId: 'forged-product' } }), false);
  assert.equal(isMississippiRetailerReleaseWatch({ ...signal, raw: { ...signal.raw, sourceProductUrl: 'https://attacker.example/product' } }), false);
  assert.equal(isMississippiRetailerReleaseWatch({
    ...signal,
    productId: rows[1].productId,
    sourceUrl: rows[1].productUrl,
    raw: { ...signal.raw, productId: rows[1].productId, sourceProductUrl: rows[1].productUrl },
  }), false);
});

test('bounded Mississippi text reader rejects oversized bodies before buffering them', async () => {
  const small = new Response('<html>ok</html>', { headers: { 'content-type': 'text/html' } });
  assert.equal(await readBoundedMississippiTextResponse(small, { maxBytes: 64 }), '<html>ok</html>');
  const declaredOversize = new Response('ok', { headers: { 'content-length': '65' } });
  await assert.rejects(() => readBoundedMississippiTextResponse(declaredOversize, { maxBytes: 64 }), /exceeded 64 bytes/iu);
  const streamedOversize = new Response('x'.repeat(128));
  await assert.rejects(() => readBoundedMississippiTextResponse(streamedOversize, { maxBytes: 64 }), /exceeded 64 bytes/iu);
});

test('bounded Mississippi JSON reader rejects oversized bodies before buffering them', async () => {
  const small = new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
  assert.deepEqual(await readBoundedMississippiJsonResponse(small, { maxBytes: 64 }), { ok: true });
  const declaredOversize = new Response('{"ok":true}', { headers: { 'content-length': '65' } });
  await assert.rejects(() => readBoundedMississippiJsonResponse(declaredOversize, { maxBytes: 64 }), /exceeded 64 bytes/iu);
  const streamedOversize = new Response(`{"value":"${'x'.repeat(128)}"}`);
  await assert.rejects(() => readBoundedMississippiJsonResponse(streamedOversize, { maxBytes: 64 }), /exceeded 64 bytes/iu);
});

test('exact Mississippi policy accepts guarded binary evidence and rejects every forged binding', () => {
  const source = MISSISSIPPI_RETAILER_SOURCES.find((entry) => entry.permitNumber === '029254');
  const signal = exactSignal(source);
  assert.equal(isMississippiRetailerSignalIdentity(signal), true);
  assert.equal(isMississippiRetailerInventory(signal), true);
  assert.equal(isMississippiRetailerInventory({ ...signal, pickupOfferVerified: false, deliveryOfferVerified: true }), false);
  const moonshine = MISSISSIPPI_RETAILER_SOURCES.find((entry) => entry.permitNumber === '007481');
  assert.equal(isMississippiRetailerSignalIdentity(exactSignal(moonshine)), true);
  assert.equal(isMississippiRetailerInventory(exactSignal(moonshine)), true);
  const blockedGoTo = MISSISSIPPI_RETAILER_SOURCES.find((entry) => entry.permitNumber === '046478');
  assert.equal(isMississippiRetailerSignalIdentity(exactSignal(blockedGoTo)), false);
  assert.equal(isMississippiRetailerInventory(exactSignal(blockedGoTo)), false);
  for (const forged of [
    { ...signal, permitNumber: '999999' },
    { ...signal, sourceRuntimeId: 'retailer:ms:forged' },
    { ...signal, merchantId: '999999' },
    { ...signal, raw: { ...signal.raw, controlStoreId: '9999' } },
    { ...signal, raw: { ...signal.raw, displayedMerchantId: '999999' } },
    { ...signal, sourceUrl: 'https://attacker.example/p/bourbon/1138' },
    { ...signal, storeAddress: '999 Attacker Rd Jackson MS 39201' },
    { ...signal, city: 'Jackson', storeCity: 'Jackson' },
    { ...signal, zip: '39201', postalCode: '39201' },
    { ...signal, quantity: 1 },
    { ...signal, quantityIsExact: true },
    { ...signal, pickupOfferVerified: false },
    { ...signal, sourceAvailabilityVerified: false },
    { ...signal, rawName: 'Buffalo Trace Bourbon 12 x 50ml' },
    { ...signal, stale: true },
  ]) assert.equal(isMississippiRetailerInventory(forged), false, JSON.stringify(forged));

  const ridgeland = MISSISSIPPI_RETAILER_SOURCES.find((entry) => entry.permitNumber === '041265');
  const ridgelandSignal = exactSignal(ridgeland, {
    productId: '5386',
    variantId: '6387',
    productUrl: `${ridgeland.baseUrl}/shop/buffalo-trace-bourbon-limit-1-order-5386`,
    pickupOfferVerified: false,
    orderabilityOfferVerified: true,
  });
  assert.equal(isMississippiRetailerInventory(ridgelandSignal), true);
  const normalizedRidgeland = canonicalizeSignal(ridgelandSignal, {
    match: () => ({ record: { id: 'bb_test', canonical: 'Buffalo Trace Bourbon', tier: 'allocated', producer: 'Buffalo Trace' } }),
  });
  assert.equal(normalizedRidgeland.orderabilityOfferVerified, true);
  assert.equal(isMississippiRetailerInventory(normalizedRidgeland), true);
});

test('research lifecycle keeps exact positive rows visible but nonalertable and suppresses the first baseline', () => {
  const lifecycle = {
    publicStatus: 'research_only',
    promotionStage: 'research_only',
    coverageTier: 'known_directory_selected_storefronts',
    inventoryAlertable: false,
    watchAlertable: false,
  };
  const source = MISSISSIPPI_RETAILER_SOURCES.find((entry) => entry.permitNumber === '029254');
  const signal = exactSignal(source);
  const confidence = confidenceForSignal(signal);
  assert.equal(confidence.canAlertAsInventory, false);
  assert.equal(confidence.canAlertAsWatch, false);
  const [baseline] = suppressMississippiActivationBaseline(
    [{ ...signal, eligibleForDelivery: true, eligibleForEmail: true, eligibleForSms: true, blockers: [] }],
    [],
    [signal],
  );
  assert.equal(baseline.eligibleForDelivery, false);
  assert.equal(baseline.eligibleForEmail, false);
  assert.equal(baseline.eligibleForSms, false);
  assert.ok(baseline.blockers.includes('state_activation_baseline'));
  const [promotionBaseline] = suppressMississippiActivationBaseline(
    [{ ...signal, eligibleForDelivery: true, eligibleForEmail: true, eligibleForSms: true, blockers: [] }],
    [signal],
    [signal],
    { activated: true },
  );
  assert.equal(promotionBaseline.eligibleForDelivery, false, 'research/shadow history cannot stand in for the persisted post-promotion baseline marker');
  const [afterPersistedBaseline] = suppressMississippiActivationBaseline(
    [{ ...signal, eligibleForDelivery: true, eligibleForEmail: true, eligibleForSms: true, blockers: [] }],
    [signal],
    [signal],
    {
      markerVersion: 'bourbon-signal/ms-activation-baseline@1',
      state: 'MS',
      baselineEstablished: true,
      sourceConfigDigest: MISSISSIPPI_SOURCE_CONFIG_DIGEST,
      lifecycleActivatedAt: '2026-07-27T12:00:00.000Z',
    },
  );
  assert.equal(afterPersistedBaseline.eligibleForDelivery, true);
  const [wrongConfigBaseline] = suppressMississippiActivationBaseline(
    [{ ...signal, eligibleForDelivery: true, blockers: [] }],
    [],
    [signal],
    {
      markerVersion: 'bourbon-signal/ms-activation-baseline@1',
      state: 'MS',
      baselineEstablished: true,
      sourceConfigDigest: '0'.repeat(64),
      lifecycleActivatedAt: '2026-07-27T12:00:00.000Z',
    },
  );
  assert.equal(wrongConfigBaseline.eligibleForDelivery, false);
  const [researchSilent] = silenceMississippiResearchCandidates([{ ...signal, eligibleForOnSite: true, eligibleForDelivery: true }]);
  assert.equal(researchSilent.eligibleForOnSite, false);
  assert.equal(researchSilent.eligibleForDelivery, false);
  assert.throws(() => verifyMississippiReleasePolicy({
    lifecycle,
    signals: [signal],
    alerts: [{ state: 'MS', eligibleForOnSite: true, eligibleForDelivery: false, eligibleForEmail: false, eligibleForSms: false }],
  }), /cannot publish or deliver/iu);
});

test('sparse Mississippi coverage permits exact rows on-site while keeping every outbound channel closed', () => {
  const source = MISSISSIPPI_RETAILER_SOURCES.find((entry) => entry.permitNumber === '029254');
  const signal = exactSignal(source);
  const lifecycle = {
    publicStatus: 'active',
    coverageTier: 'sparse_live_store_inventory',
    inventoryAlertable: false,
    watchAlertable: false,
  };
  const result = verifyMississippiReleasePolicy({
    lifecycle,
    phase: 'sparse',
    signals: [signal],
    alerts: [{ state: 'MS', eligibleForOnSite: true, eligibleForDelivery: false, eligibleForEmail: false, eligibleForSms: false, published: false }],
  });
  assert.equal(result.onSiteOnly, true);
  assert.throws(() => verifyMississippiReleasePolicy({
    lifecycle,
    phase: 'sparse',
    signals: [signal],
    alerts: [{ state: 'MS', eligibleForOnSite: true, eligibleForDelivery: true, eligibleForEmail: false, eligibleForSms: false }],
  }), /sparse coverage can be on-site only/iu);
});

test('sparse Mississippi exact-store identity survives normalization and publishes on-site without outbound eligibility', () => {
  const source = MISSISSIPPI_RETAILER_SOURCES.find((entry) => entry.permitNumber === '029254');
  const sourceSignal = exactSignal(source, { title: 'Buffalo Trace Bourbon 750ml' });
  sourceSignal.observedAt = new Date().toISOString();
  const record = { id: 'bb_test', canonical: 'Buffalo Trace Bourbon', tier: 'allocated', producer: 'Buffalo Trace' };
  const normalized = canonicalizeSignal(sourceSignal, { match: () => ({ record }) });
  assert.equal(isMississippiRetailerInventory(normalized), true);
  const bible = { byId: new Map([[record.id, record]]), byName: new Map() };
  const [drop] = buildDrops([normalized], bible, [normalized]);
  assert.ok(drop);
  assert.equal(drop.storeId, source.id);
  assert.equal(isMississippiRetailerInventory(drop), true);
  assert.equal(drop.stateCode, 'MS');
  assert.equal(drop.sourceRuntimeId, source.sourceRuntimeId);
  assert.equal(drop.permitNumber, source.permitNumber);
  assert.equal(drop.regionId, source.regionId);
  assert.equal(drop.raw.platformStoreId, source.platformStoreId);
  assert.equal(drop.eligibleForOnSite, true);
  assert.equal(drop.eligibleForDropFeed, true);
  assert.equal(drop.eligibleForWatch, false);
  assert.equal(drop.eligibleForDelivery, false);
  assert.equal(drop.eligibleForEmail, false);
  assert.equal(drop.eligibleForSms, false);
  assert.equal(drop.sourceStale, false);
  assert.equal(drop.canAlertAsInventory, false);
  assert.equal(drop.canAlertAsWatch, false);
  assert.equal(drop.dataLane, 'onsite_inventory');
  assert.equal(drop.availabilityStatus, 'orderable');
});

test('collector isolates allowed stores and reports policy-blocked sources without requesting them', async () => {
  const mabrysPayload = JSON.parse(await fixture('godaddy/mabrys-products.json'));
  const htmlByHost = new Map([
    ['www.aliquorwarehouse.com', await fixture('gotoliquor/positive.html')],
    ['www.cabinfeverliquor.com', (await fixture('gotoliquor/positive.html'))
      .replaceAll('A Liquor Warehouse', 'Cabin Fever Wine & Spirits')
      .replaceAll('955132', '736142')
      .replaceAll('Winona, 38967', 'Nesbit, 38651')
      .replaceAll('1031', '1069')],
    ['www.desotoliquor.com', await fixture('cityhive/positive.html')],
    ['thehernandowinespirits.com', (await fixture('cityhive/positive.html'))
      .replaceAll('68ba2980113a7a29c2076fc3', '669150d28f28f1287440bdce')
      .replaceAll('904 Goodman Rd W Ste A Horn Lake MS 38637', '2358 Mt Pleasant Rd Hernando MS 38632')
      .replaceAll('https://www.desotoliquor.com', 'https://thehernandowinespirits.com')],
  ]);
  const tupelo2GoByUrl = new Map([
    ['https://www.tupelo2go.com/r/1187/restaurants/delivery/Alcohol/Tupelo-Wine-Spirits-tupelo', await fixture('tupelo2go/positive.html')],
    ['https://www.tupelo2go.com/r/1237/restaurants/delivery/Alcohol/Maya-Wine-Spirits-tupelo', await fixture('tupelo2go/maya.html')],
    ['https://www.tupelo2go.com/r/1544/restaurants/delivery/Alcohol/Bogarts-Liquor-Wine-tupelo', await fixture('tupelo2go/bogarts.html')],
  ]);
  const requestedHosts = [];
  const result = await collectMississippiRetailers({ id: 'MS' }, {
    fetchText: async (url) => {
      requestedHosts.push(new URL(url).hostname);
      return { ok: true, status: 200, text: tupelo2GoByUrl.get(url) || htmlByHost.get(new URL(url).hostname) };
    },
    fetchJson: async () => ({ ok: true, status: 200, cookie: 'session_id=test', payload: { product_store: '', available_store_tab: '' } }),
    fetchGetJson: async (url) => {
      requestedHosts.push(new URL(url).hostname);
      return { ok: true, status: 200, payload: mabrysPayload };
    },
    matchBottle: (title) => {
      if (/angel'?s? envy/iu.test(title)) return { id: 'bb_angels_envy', canonical: "Angel's Envy Bourbon", tier: 'standard', confidence: 1 };
      if (/bulleit/iu.test(title)) return { id: 'bb_bulleit', canonical: 'Bulleit Bourbon', tier: 'standard', confidence: 1 };
      if (/buffalo trace/iu.test(title)) return { id: 'bb_buffalo_trace', canonical: 'Buffalo Trace Bourbon', tier: 'allocated', confidence: 1 };
      if (/michters us 1 small batch/iu.test(title)) return { id: 'bb_michters_small_batch', canonical: "Michter's US 1 Straight Bourbon Small Batch", tier: 'limited', confidence: 1 };
      if (/wild turkey.*rare breed/iu.test(title)) return { id: 'bb_wild_turkey_rare_breed', canonical: 'Wild Turkey Rare Breed Straight Bourbon', tier: 'limited', confidence: 1 };
      if (/very olde/iu.test(title)) return { id: 'bb_very_olde', canonical: 'Very Olde St. Nick Ancient Cask Immaculata', tier: 'limited', confidence: 1 };
      if (/rare perfection/iu.test(title)) return { id: 'bb_rare_perfection', canonical: 'Rare Perfection 9 Year Bourbon', tier: 'limited', confidence: 1 };
      return null;
    },
    now: () => new Date('2026-07-25T20:00:00.000Z'),
    sourceRunnerOptions: { timeoutMs: 5_000, maxAttempts: 1 },
  });
  assert.equal(result.sourceResults.length, 13);
  assert.equal(new Set(result.sourceResults.map((entry) => entry.sourceId)).size, 13);
  assert.ok(result.sourceResults.every((entry) => entry.alertable === false
    && entry.inventoryAlertable === false
    && entry.watchAlertable === false));
  assert.deepEqual(new Set(requestedHosts), new Set(['www.desotoliquor.com', 'thehernandowinespirits.com', 'www.moonshinems.com', 'adf6c00c-b93f-4bbe-80c6-03e4a97b5a0a.mysimplestore.com', 'www.tupelo2go.com']));
  assert.equal(result.runtime.partitionCount, 11);
  assert.equal(result.runtime.blockedSourceCount, 2);
  assert.equal(result.sourceResults.filter((entry) => entry.status === 'source_policy_blocked').length, 2);
  assert.equal(result.roadblocks.filter((entry) => entry.status === 'source_policy_blocked').length, 2);
  assert.ok(result.signals.length >= 5);
  assert.ok(result.signals.every((signal) => signal.quantity === 0 && signal.quantityIsExact === false));
});

test('reachable zero-row Mississippi storefronts remain explicit roadblocks and nonalertable', async () => {
  const result = await collectMississippiRetailers({ id: 'MS' }, {
    fetchText: async () => ({ ok: true, status: 200, text: '<html><body>No exact-store orderability rows</body></html>' }),
    fetchJson: async () => ({ ok: true, status: 200, cookie: 'session_id=test', payload: { product_store: '', available_store_tab: '' } }),
    fetchGetJson: async () => ({ ok: true, status: 200, payload: { products: [] } }),
    matchBottle: () => ({ id: 'bb_test', canonical: 'Buffalo Trace Bourbon', tier: 'allocated', confidence: 0.94 }),
    now: () => new Date('2026-07-25T20:00:00.000Z'),
    sourceRunnerOptions: { timeoutMs: 5_000, maxAttempts: 1 },
  });
  assert.equal(result.signals.length, 0);
  assert.equal(result.roadblocks.length, 13);
  assert.equal(result.roadblocks.filter((entry) => entry.status === 'reachable_no_safe_orderability_rows').length, 10);
  assert.equal(result.roadblocks.filter((entry) => entry.status === 'reachable_no_fresh_release_watch_rows').length, 1);
  assert.equal(result.roadblocks.filter((entry) => entry.status === 'source_policy_blocked').length, 2);
  assert.ok(result.sourceResults.every((entry) => entry.alertable === false));
});

test('blocked BottleCapps probes stay health-visible, nonalertable, and out of inventory authority', async () => {
  const atlas = JSON.parse(await readFile(new URL('../data/source-atlas/MS.json', import.meta.url), 'utf8'));
  const health = summarizeMississippiSourceHealth({ atlas, sourceResults: [] });
  assert.equal(health.inventorySources, 10);
  assert.equal(health.directorySourcePolicyStatus, 'source_policy_blocked');
  assert.equal(health.blockedBySourcePolicy, 5);
  assert.equal(health.sourceOffline, 2);
  assert.equal(health.platformProbeOnly, 2);
  assert.equal(health.entries.filter((entry) => entry.platform === 'bottlecapps').length, 7);
  assert.ok(health.entries.filter((entry) => entry.platform === 'bottlecapps')
    .every((entry) => entry.healthVisible && !entry.inventoryAuthoritative && !entry.alertable));
});

test('shadow verification rejects a hand-authored run count without bound production evidence', () => {
  const commit = 'a'.repeat(40);
  const sourceTree = { 'engine/data/mississippi-retailer-registry.json': 'b'.repeat(40) };
  const evidence = {
    contractVersion: 'bourbon-signal/ms-shadow-evidence@2',
    state: 'MS',
    sourceRevisionSha: commit,
    sourceTree,
    runs: [0, 1, 2].map((index) => ({
      runId: `fake-run-${index}`,
      startedAt: new Date(Date.parse('2026-07-27T00:00:00.000Z') + index * 12 * 60 * 60_000).toISOString(),
      finishedAt: new Date(Date.parse('2026-07-27T00:05:00.000Z') + index * 12 * 60 * 60_000).toISOString(),
      publicationAttempted: false,
      deliveryCount: 0,
      baselineDeliveries: 0,
      sourceResults: [],
      signals: [],
      alertOutputs: [],
    })),
  };
  assert.throws(
    () => validateMississippiShadowEvidenceArtifact(evidence, { expectedSourceTree: sourceTree }),
    /verified immutable GitHub workflow provenance/iu,
  );
  const artifactBoundEvidence = {
    ...evidence,
    runs: [0, 1, 2].map((index) => ({
      runId: `gha-${1000 + index}-1`,
      github: { workflowRunId: 1000 + index, runAttempt: 1, headSha: commit, artifactId: 2000 + index, artifactDigest: `sha256:${'e'.repeat(64)}` },
      sourceResults: MISSISSIPPI_RETAILER_SOURCES.map((source) => ({ sourceId: source.sourceRuntimeId, status: 'success' })),
    })),
  };
  const verifiedArtifactContents = new Map(artifactBoundEvidence.runs.map((run, index) => [String(run.github.workflowRunId), {
    artifactId: run.github.artifactId,
    artifactDigest: run.github.artifactDigest,
    headSha: commit,
    evidence: {
      state: 'MS',
      mode: 'shadow',
      publication: { productionSnapshotTouched: false },
      alerts: { disabled: true, deliveryAttempted: false, candidateRowsExported: false },
      metrics: { alertCandidateCount: 0 },
      execution: { ok: true },
      collector: { status: 'useful', startedAt: new Date(Date.parse('2026-07-27T00:00:00.000Z') + index * 12 * 60 * 60_000).toISOString(), finishedAt: new Date(Date.parse('2026-07-27T00:05:00.000Z') + index * 12 * 60 * 60_000).toISOString() },
    },
    report: { state: 'MS', sourceResults: [], signals: [] },
  }]));
  assert.throws(
    () => validateMississippiShadowEvidenceArtifact(artifactBoundEvidence, { expectedSourceTree: sourceTree, verifiedGithubRuns: verifiedArtifactContents }),
    /source results must contain one result per registered Mississippi source/iu,
    'checked-in self-asserted rows cannot substitute for the downloaded artifact report',
  );
});

test('Mississippi is sparse on-site exact-store coverage with direct precision dispatch and no legacy collapse', async () => {
  const lifecycle = getStateLifecycle('MS');
  assert.equal(lifecycle.publicStatus, 'active');
  assert.equal(lifecycle.promotionStage, 'active');
  assert.equal(lifecycle.coverageTier, 'sparse_live_store_inventory');
  assert.equal(lifecycle.shadowEligible, false);
  assert.equal(lifecycle.inventoryAlertable, false);
  assert.equal(lifecycle.watchAlertable, false);

  const stateSource = ALL_STATE_SOURCES.find((entry) => entry.id === 'MS');
  assert.equal(stateSource.strategy, 'hybrid_official_intelligence_private_retailer');
  assert.ok(stateSource.sources.some((source) => source.sourceLayer === 'directory'));
  assert.ok(stateSource.sources.some((source) => source.sourceLayer === 'official_intelligence'));
  assert.equal(stateSource.sources.filter((source) => source.sourceLayer === 'private_retailer_inventory').length, 10);
  assert.equal(stateSource.sources.filter((source) => source.sourceLayer === 'retailer_release_watch').length, 1);
  assert.equal(stateSource.sources.filter((source) => source.sourceLayer === 'storefront_probe').length, 2);

  const precision = await readFile(new URL('../src/collectors/precision-probes.mjs', import.meta.url), 'utf8');
  assert.match(precision, /if \(config\.id === 'MS'\) return collectMississippiRetailers/);
  const legacySet = precision.match(/const LEGACY_PRECISION_RUNTIME_STATES = new Set\(\[([\s\S]*?)\]\);/)?.[1] || '';
  assert.doesNotMatch(legacySet, /'MS'/);
  const operational = await readFile(new URL('../src/operational-report.mjs', import.meta.url), 'utf8');
  assert.match(operational, /silenceMississippiResearchCandidates\(georgiaGuardedCandidates\)/);
  assert.match(operational, /MISSISSIPPI_ACTIVATION_STATE[\s\S]*mississippi-retailer-activation\.json/);
  assert.match(operational, /sourceConfigDigest:\s*MISSISSIPPI_SOURCE_CONFIG_DIGEST/);
});
