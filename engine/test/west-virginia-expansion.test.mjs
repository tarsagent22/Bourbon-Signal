import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  collectWestVirginiaRecentPurchases,
  digestWestVirginiaCaBundle,
  enrichWestVirginiaBarrelSelections,
  parseWestVirginiaBarrelSelections,
  parseWestVirginiaCurlResponse,
  parseWestVirginiaLiquorSearchApiKey,
  WEST_VIRGINIA_CA_BUNDLE_SHA256,
  WEST_VIRGINIA_RECENT_PURCHASE_WATCHLIST,
  westVirginiaDirectorySignals,
  westVirginiaRecentPurchaseSignal,
} from '../src/collectors/west-virginia-official.mjs';
import { configuredSourceRuntimeOptions } from '../src/collectors/generic-state.mjs';
import { STATE_SOURCES } from '../src/state-sources.mjs';
import { BourbonBible } from '../src/core/bible.mjs';
import { buildDrops, buildStores, bibleLookup } from '../src/export-site-contract.mjs';
import { buildLocationBible } from '../src/location-bible.mjs';
import { derivePublicDropEvidence } from '../../src/lib/public-drop-evidence.ts';

const fixtureHtml = `
  <main>
    <h2>New 2026 discounts for limited barrel selections:</h2>
    <ul>
      <li>28204 - Ezra Brooks Stave Finish Spice &amp; Clove: A great choice for an Old-Fashioned.</li>
      <li>28206 - Rebel Full Proof Selection: Try it in a Hot Buttered Rebel to warm up!</li>
      <li>23911 - Yellowstone Handpicked 109 proof: Makes a great Smoky Whiskey Mule.</li>
      <li>26665 - Yellowstone Handpicked 119 proof: Perfect for a Yellowstone Gold Rush Cocktail.</li>
      <li>28208 - Rebel Stave Finish Collection Rich Mocha: Add to your coffee or enjoy over ice.</li>
    </ul>
    <h2>Available barrel selections (not discounted)</h2>
    <ul>
      <li>28276 - Wilderness Trail Rye Green Label Private Selection - $61.25</li>
      <li>28285 - Myers's Rum Single Barrel - $35.67</li>
      <li>24276 - Corazon de Agave Reposado WV Tequila Lovers</li>
    </ul>
    <p>Ask your local retailer or call the Spirits Department for more information!</p>
    <h2>Corazon Single Barrel Reposado Tequila-still available to order!</h2>
    <h2>2025 historical selections</h2>
    <p>28111 - Maker's Mark Private Selection - $49.99</p>
  </main>
`;

test('WV official parser keeps only current whiskey selections and never implies shelf stock', () => {
  const rows = parseWestVirginiaBarrelSelections(fixtureHtml, {
    observedAt: '2026-08-09T20:00:00.000Z',
    currentYear: 2026,
  });

  assert.equal(rows.length, 6);
  assert.deepEqual(rows.map((row) => row.stockNumber), ['28204', '28206', '23911', '26665', '28208', '28276']);
  assert.equal(rows.some((row) => /cocktail|old-fashioned|warm up/i.test(row.productName)), false);
  assert.equal(rows.some((row) => /rum|tequila|2025|maker/i.test(row.productName)), false);
  for (const row of rows) {
    assert.equal(row.state, 'WV');
    assert.equal(row.locationPrecision, 'statewide_catalog');
    assert.equal(row.sourceAvailabilityVerified, false);
    assert.equal(row.canAlertAsInventory, false);
    assert.equal(row.canAlertAsWatch, false);
    assert.equal(row.quantity, null);
    assert.match(row.readableSummary, /retailers may be able to order/i);
    assert.match(row.readableSummary, /does not confirm shelf stock/i);
  }
});

test('WV official parser rejects truncated or collapsed current-year responses', () => {
  assert.equal(parseWestVirginiaBarrelSelections('<h2>New 2026 discounts for limited barrel selections:</h2><p>28204 - Ezra Brooks Stave Finish Spice &amp; Clove</p>', { currentYear: 2026 }).length, 0);
  assert.equal(parseWestVirginiaBarrelSelections('<h2>New 2026 discounts for limited barrel selections:</h2><p>28204 - Ezra Brooks Stave Finish Spice &amp; Clove</p><h2>Corazon Single Barrel</h2>', { currentYear: 2026 }).length, 0);
  const sevenRowsThenTruncatedCorazon = `<h2>New 2026 discounts for limited barrel selections:</h2>${[
    '28204 - Ezra Brooks Stave Finish Spice & Clove',
    '28206 - Rebel Full Proof Selection',
    '23911 - Yellowstone Handpicked 109 Proof',
    '26665 - Yellowstone Handpicked 119 Proof',
    '28208 - Rebel Stave Finish Collection Rich Mocha',
    '28276 - Wilderness Trail Rye Green Label Private Selection',
    '27600 - Myers Rum Single Barrel',
  ].map((row) => `<p>${row}</p>`).join('')}<p>24276 - Corazon Single Barrel`;
  assert.equal(parseWestVirginiaBarrelSelections(sevenRowsThenTruncatedCorazon, { currentYear: 2026 }).length, 0);
});

test('WV directory publishes every active official premise as searchable, directory-only, and non-alertable', async () => {
  const universe = JSON.parse(await readFile(new URL('../data/store-universe/WV.json', import.meta.url), 'utf8'));
  const rows = westVirginiaDirectorySignals({ nowAt: '2026-08-09T21:00:00.000Z' });
  const expiredSnapshotRows = westVirginiaDirectorySignals({ nowAt: '2026-08-11T21:00:00.000Z' });

  assert.equal(universe.storeCount, 180);
  assert.equal(rows.length, universe.storeCount);
  assert.equal(new Set(rows.map((row) => row.storeId)).size, rows.length);
  assert.ok(new Set(rows.map((row) => row.storeCity)).size >= 100);
  for (const row of rows) {
    assert.match(row.storeAddress, /\S/);
    assert.match(row.storeCity, /\S/);
    assert.equal(row.locationPrecision, 'store_level');
    assert.equal(row.inventoryCapability, 'directory_only');
    assert.equal(row.sourceAvailabilityVerified, false);
    assert.equal(row.canAlertAsInventory, false);
    assert.equal(row.canAlertAsWatch, false);
    assert.equal(row.observedAt, universe.source.capturedAt);
    assert.equal(row.stale, false);
    assert.equal(row.raw.directoryOnly, true);
    assert.equal(row.raw.storeDigest, universe.source.storeDigest);
  }
  assert.ok(expiredSnapshotRows.every((row) => row.observedAt === universe.source.capturedAt && row.stale === true));
});

test('WV official selection rows reach the customer feed only as non-alertable ordering intelligence', async () => {
  const bibleData = JSON.parse(await readFile(new URL('../out/bourbon-bible.json', import.meta.url), 'utf8'));
  const bible = new BourbonBible(bibleData.records);
  const lookup = bibleLookup(bibleData.records);
  const rows = enrichWestVirginiaBarrelSelections(parseWestVirginiaBarrelSelections(fixtureHtml, {
    observedAt: '2026-08-09T20:00:00.000Z',
    currentYear: 2026,
  }), bible);
  const normalizedRows = rows.map((row) => ({
    ...row,
    sourceRuntimeId: 'wv:configured:wv-abca-barrel-selections',
    raw: undefined,
  }));
  const drops = buildDrops(normalizedRows, lookup, normalizedRows);

  assert.equal(rows.filter((row) => row.canonicalBottleId).length, 6);
  assert.equal(drops.length, 6);
  const evidence = derivePublicDropEvidence(drops, '2026-08-09T21:00:00.000Z').get('WV');
  assert.equal(evidence?.freshPublicSignalCount, 6);
  assert.equal(evidence?.freshPublicUpdateSignalCount, 6);
  assert.equal(evidence?.currentInventoryStores.length, 0);
  assert.equal(evidence?.alertableInventoryStores.length, 0);
  for (const drop of drops) {
    assert.equal(drop.canAlertAsInventory, false);
    assert.equal(drop.canAlertAsWatch, false);
    assert.equal(drop.eligibleForOnSite, true);
    assert.equal(drop.eligibleForDelivery, false);
    assert.equal(drop.eligibleForEmail, false);
    assert.equal(drop.eligibleForSms, false);
    assert.match(drop.inventorySemantics, /not live shelf inventory/i);
    assert.match(drop.inventoryCaveat, /not live shelf inventory/i);
  }
});

test('WV lifecycle remains shadow-only until provenance activates statewide official updates, with every alert channel disabled', async () => {
  const lifecycle = JSON.parse(await readFile(new URL('../../src/config/state-lifecycle.json', import.meta.url), 'utf8'));
  const entry = lifecycle.states.WV;

  if (entry.publicStatus === 'active') {
    assert.ok(lifecycle.activeStates.includes('WV'));
    assert.ok(entry.promotionEvidence?.immutableEvidence);
  } else {
    assert.equal(entry.publicStatus, 'research_only');
    assert.equal(lifecycle.activeStates.includes('WV'), false);
    assert.equal(entry.shadowEligible, true);
  }
  assert.equal(entry.coverageTier, 'shipment_drop_intelligence');
  assert.equal(entry.refinementLevel, 'exact_store');
  assert.match(entry.customerSummary, /exact-store.*purchase/i);
  assert.match(entry.customerSummary, /official.*barrel[- ]selection/i);
  assert.match(entry.customerSummary, /not.*shelf/i);
});

const liquorSearchHtml = `
  <script>
    var APIKey = 'public-runtime-key';
  </script>
`;

const buffaloCatalog = [{
  BottleSize: ' 750, 1750',
  ConfigID: 907,
  ProductID: 827,
  ProductName: 'Buffalo Trace Kentucky Straight Bourbon Whiskey',
}];

const buffaloStores = [
  {
    BottleSize: 750,
    City: 'Martinsburg',
    PhoneNumber: '(304) 263-3111',
    ProductID: 827,
    ProductName: 'Buffalo Trace Kentucky Straight Bourbon Whiskey',
    StoreName: '7-eleven #10670',
    StoreNumber: 624,
    StreetAddress1: '1015 N. Queen St.',
  },
  {
    BottleSize: 750,
    City: 'Morgantown',
    PhoneNumber: '(304) 296-2035',
    ProductID: 827,
    ProductName: 'Buffalo Trace Kentucky Straight Bourbon Whiskey',
    StoreName: 'Ashebrooke Liquor Outlet',
    StoreNumber: 544,
    StreetAddress1: '300 Beechhurst Avenue',
  },
];

test('WV Liquor Search key parser accepts only the public runtime key assignment', () => {
  assert.equal(parseWestVirginiaLiquorSearchApiKey(liquorSearchHtml), 'public-runtime-key');
  assert.equal(parseWestVirginiaLiquorSearchApiKey('<script>var other = "secret"</script>'), null);
  assert.equal(parseWestVirginiaLiquorSearchApiKey("var APIKey = '';"), null);
});

test('WV source-scoped CA bundle is immutable and contains only the pinned RapidSSL chain', async () => {
  const bundle = await readFile(new URL('../data/certificates/wvabca-rapidssl-chain.pem', import.meta.url));
  const pem = bundle.toString('utf8');
  assert.equal(digestWestVirginiaCaBundle(bundle), WEST_VIRGINIA_CA_BUNDLE_SHA256);
  assert.equal(digestWestVirginiaCaBundle(pem.replaceAll(String.fromCharCode(10), String.fromCharCode(13, 10))), WEST_VIRGINIA_CA_BUNDLE_SHA256);
  assert.equal((pem.match(/-----BEGIN CERTIFICATE-----/gu) || []).length, 2);
});

test('WV curl response parser derives the final HTTP status when Linux omits the write-out marker', () => {
  const crlf = String.fromCharCode(13, 10);
  const parsed = parseWestVirginiaCurlResponse([
    `HTTP/1.1 200 Connection established${crlf}${crlf}`,
    `HTTP/2 200${crlf}content-type: application/json${crlf}set-cookie: WVSession=abc; Path=/${crlf}${crlf}`,
    '[{"StoreNumber":624}]',
  ].join(''));
  assert.deepEqual(parsed, {
    status: 200,
    text: '[{"StoreNumber":624}]',
    setCookie: 'WVSession=abc',
  });
});

test('WV curl response parser ignores a proxy CONNECT handshake without an origin response', () => {
  const lf = String.fromCharCode(10);
  const parsed = parseWestVirginiaCurlResponse(`HTTP/1.1 200 Connection established${lf}${lf}${lf}__BOURBON_SIGNAL_WV_HTTP_STATUS__:000`);
  assert.equal(parsed.status, 0);
});

test('WV curl response parser prefers the explicit curl status marker when present', () => {
  const lf = String.fromCharCode(10);
  const parsed = parseWestVirginiaCurlResponse(`HTTP/2 200${lf}content-type: application/json${lf}${lf}[]${lf}__BOURBON_SIGNAL_WV_HTTP_STATUS__:204`);
  assert.equal(parsed.status, 204);
  assert.equal(parsed.text, '[]');
});

test('WV recent-purchase watchlist pins only live-verified official products within a nine-request budget', () => {
  assert.deepEqual(WEST_VIRGINIA_RECENT_PURCHASE_WATCHLIST, [
    { query: 'Buffalo Trace Kentucky Straight Bourbon Whiskey', expectedProductId: 827, bottleSize: 750 },
    { query: "Blanton's Gold Bourbon", expectedProductId: 10150, bottleSize: 750 },
    { query: "Booker's Bourbon", expectedProductId: 734, bottleSize: 750 },
  ]);
  assert.equal(2 * WEST_VIRGINIA_RECENT_PURCHASE_WATCHLIST.length + 3, 9);
});

test('WV recent-purchase source gets one bounded extended runtime attempt', () => {
  const config = STATE_SOURCES.find((entry) => entry.id === 'WV');
  const source = config.sources.find((entry) => entry.id === 'wv-abca-recent-purchases');
  assert.deepEqual(configuredSourceRuntimeOptions(config, source), { timeoutMs: 60_000, maxAttempts: 1 });
});

test('WV recent-purchase rows preserve official store identity without claiming live inventory', () => {
  const signal = westVirginiaRecentPurchaseSignal(buffaloStores[0], {
    observedAt: '2026-08-10T16:00:00.000Z',
    bottle: { id: 'buffalo-trace', canonical: 'Buffalo Trace', tier: 'allocated', confidence: 0.99 },
  });

  assert.equal(signal.storeId, 'wvabca-store-624');
  assert.equal(signal.storeNumber, '624');
  assert.equal(signal.storeName, '7-eleven #10670');
  assert.equal(signal.storeAddress, '1015 N. Queen St., Martinsburg, WV');
  assert.equal(signal.locationPrecision, 'store_level');
  assert.equal(signal.locationProjectionDisabled, true);
  assert.equal(signal.premisesVerified, true);
  assert.equal(signal.eventType, 'wv_abca_retailer_recent_purchase_window');
  assert.equal(signal.availabilityStatus, 'recent_purchase_window');
  assert.equal(signal.quantity, 0);
  assert.equal(signal.quantityIsExact, false);
  assert.equal(signal.sourceAvailabilityVerified, false);
  assert.equal(signal.canAlertAsInventory, false);
  assert.equal(signal.canAlertAsWatch, false);
  assert.equal(signal.raw.purchaseWindowDays, 90);
  assert.equal(signal.raw.noLiveInventory, true);
  assert.match(signal.readableSummary, /purchased.*within the last three months/i);
  assert.match(signal.readableSummary, /call.*store/i);
});

test('WV recent-purchase city normalization removes comma-suffixed state text', () => {
  const signal = westVirginiaRecentPurchaseSignal({
    ...buffaloStores[0],
    City: 'THOMAS,WV',
    StreetAddress1: '123 Capitol St',
  }, {
    observedAt: '2026-08-10T16:00:00.000Z',
    bottle: { id: 'buffalo-trace', canonical: 'Buffalo Trace', tier: 'allocated', confidence: 0.99 },
  });
  assert.equal(signal.city, 'THOMAS');
  assert.equal(signal.storeAddress, '123 Capitol St, THOMAS, WV');
});

test('WV purchase signals do not duplicate the licensed-store Finder universe', () => {
  const directorySignals = westVirginiaDirectorySignals({ observedAt: '2026-08-10T16:00:00.000Z' });
  const purchaseSignal = westVirginiaRecentPurchaseSignal(buffaloStores[0], {
    observedAt: '2026-08-10T16:00:00.000Z',
    bottle: { id: 'buffalo-trace', canonical: 'Buffalo Trace', tier: 'allocated', confidence: 0.99 },
  });
  const locations = buildLocationBible([...directorySignals, purchaseSignal]);
  const stores = buildStores([...directorySignals, purchaseSignal]);
  const westVirginiaStores = locations.filter((location) => location.state === 'WV' && location.type === 'store');
  const westVirginiaStoreExport = stores.filter((store) => store.state === 'WV');
  assert.equal(westVirginiaStores.length, 180);
  assert.equal(westVirginiaStoreExport.length, 180);
  assert.equal(westVirginiaStores.some((location) => String(location.id).startsWith('wvabca-store-')), false);
  assert.equal(westVirginiaStoreExport.some((store) => String(store.id).startsWith('wvabca-store-')), false);
});

test('WV purchase Drop Feed dedupe preserves separate branches sharing a DBA', async () => {
  const bibleData = JSON.parse(await readFile(new URL('../out/bourbon-bible.json', import.meta.url), 'utf8'));
  const lookup = bibleLookup(bibleData.records);
  const bottle = { id: 'bb_91e42d9de5250566', canonical: 'Buffalo Trace Bourbon', tier: 'allocated', confidence: 0.99 };
  const first = westVirginiaRecentPurchaseSignal({ ...buffaloStores[0], StoreName: 'The Loft', StoreNumber: 506 }, { observedAt: '2026-08-10T16:00:00.000Z', bottle });
  const second = westVirginiaRecentPurchaseSignal({ ...buffaloStores[0], StoreName: 'The Loft', StoreNumber: 507, StreetAddress1: '999 Other St' }, { observedAt: '2026-08-10T16:00:00.000Z', bottle });
  const drops = buildDrops([first, second], lookup, [first, second]);
  assert.deepEqual(drops.map((drop) => drop.storeId).sort(), ['wvabca-store-506', 'wvabca-store-507']);
});

test('WV recent-purchase collector keeps one session, stays bounded, and proves the canary at both ends', async () => {
  const calls = [];
  const request = async (url, options = {}) => {
    calls.push({ url, ...options, body: options.body ? JSON.parse(options.body) : null });
    if (url === 'https://www.wvabca.com/liquorsearch.aspx') {
      return { ok: true, status: 200, text: liquorSearchHtml, setCookie: 'ASP.NET_SessionId=abc123; path=/; secure' };
    }
    const body = JSON.parse(options.body);
    assert.match(options.headers.cookie, /ASP\.NET_SessionId=abc123/);
    assert.equal(body.APIKey, 'public-runtime-key');
    if (url.endsWith('/GetProductNameSearch')) return { ok: true, status: 200, text: JSON.stringify(buffaloCatalog) };
    if (url.endsWith('/GetStoresWithProduct')) return { ok: true, status: 200, text: JSON.stringify(buffaloStores) };
    throw new Error(`Unexpected URL ${url}`);
  };
  const bible = { scanText: () => [{ id: 'buffalo-trace', canonical: 'Buffalo Trace', tier: 'allocated', confidence: 0.99 }] };
  const result = await collectWestVirginiaRecentPurchases(bible, {
    observedAt: '2026-08-10T16:00:00.000Z',
    request,
    sleep: async () => {},
    watchlist: [{ query: 'Buffalo Trace Kentucky Straight Bourbon Whiskey', expectedProductId: 827, bottleSize: 750 }],
    minimumCanaryStores: 2,
  });

  assert.equal(result.signals.length, 2);
  assert.equal(result.sourceReport.requestCount, 5);
  assert.equal(result.sourceReport.canaryStoreCount, 2);
  assert.equal(calls.filter((call) => call.url.endsWith('/GetProductNameSearch')).length, 2);
  assert.equal(calls.filter((call) => call.url.endsWith('/GetStoresWithProduct')).length, 2);
  assert.ok(calls.length <= result.sourceReport.maximumRequests);
});

test('WV recent-purchase collector fails closed on silent empty-array throttling', async () => {
  let catalogCalls = 0;
  const request = async (url, options = {}) => {
    if (url === 'https://www.wvabca.com/liquorsearch.aspx') return { ok: true, status: 200, text: liquorSearchHtml };
    JSON.parse(options.body);
    if (url.endsWith('/GetProductNameSearch')) {
      catalogCalls += 1;
      return { ok: true, status: 200, text: JSON.stringify(catalogCalls === 1 ? buffaloCatalog : []) };
    }
    if (url.endsWith('/GetStoresWithProduct')) return { ok: true, status: 200, text: JSON.stringify(buffaloStores) };
    throw new Error(`Unexpected URL ${url}`);
  };
  const bible = { scanText: () => [{ id: 'buffalo-trace', canonical: 'Buffalo Trace', tier: 'allocated', confidence: 0.99 }] };

  await assert.rejects(
    collectWestVirginiaRecentPurchases(bible, {
      request,
      sleep: async () => {},
      watchlist: [{ query: 'Buffalo Trace Kentucky Straight Bourbon Whiskey', expectedProductId: 827, bottleSize: 750 }],
      minimumCanaryStores: 2,
    }),
    /ending canary.*empty|silent throttle/i,
  );
});

test('WV recent-purchase collector rejects an empty non-canary watched product', async () => {
  const blantonCatalog = [{ ProductID: 10150, ProductName: "Blanton's Gold Bourbon", BottleSize: '750' }];
  const request = async (url, options = {}) => {
    if (url === 'https://www.wvabca.com/liquorsearch.aspx') return { ok: true, status: 200, text: liquorSearchHtml };
    const body = JSON.parse(options.body);
    if (url.endsWith('/GetProductNameSearch')) {
      return { ok: true, status: 200, text: JSON.stringify(body.ProductName.includes("Blanton") ? blantonCatalog : buffaloCatalog) };
    }
    if (url.endsWith('/GetStoresWithProduct')) {
      return { ok: true, status: 200, text: JSON.stringify(Number(body.productID) === 10150 ? [] : buffaloStores) };
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const bible = { scanText: (name) => [{ id: name.includes("Blanton") ? 'blantons-gold' : 'buffalo-trace', canonical: name, tier: 'allocated', confidence: 0.99 }] };
  await assert.rejects(
    collectWestVirginiaRecentPurchases(bible, {
      request,
      sleep: async () => {},
      watchlist: [
        { query: 'Buffalo Trace Kentucky Straight Bourbon Whiskey', expectedProductId: 827, bottleSize: 750 },
        { query: "Blanton's Gold Bourbon", expectedProductId: 10150, bottleSize: 750 },
      ],
      minimumCanaryStores: 2,
    }),
    /known product 10150.*empty.*retailer|silent throttle/i,
  );
});

test('WV recent-purchase signals reach the onsite feed as call-first purchase leads, never inventory or delivery alerts', async () => {
  const bibleData = JSON.parse(await readFile(new URL('../out/bourbon-bible.json', import.meta.url), 'utf8'));
  const bible = new BourbonBible(bibleData.records);
  const lookup = bibleLookup(bibleData.records);
  const bottle = bible.scanText(buffaloStores[0].ProductName)[0];
  const signal = westVirginiaRecentPurchaseSignal(buffaloStores[0], {
    observedAt: '2026-08-10T16:00:00.000Z',
    bottle,
  });
  const drops = buildDrops([signal], lookup, [signal]);

  assert.equal(drops.length, 1);
  assert.equal(drops[0].storeId, 'wvabca-store-624');
  assert.equal(drops[0].eligibleForOnSite, true);
  assert.equal(drops[0].eligibleForDropFeed, true);
  assert.equal(drops[0].eligibleForDelivery, false);
  assert.equal(drops[0].eligibleForEmail, false);
  assert.equal(drops[0].eligibleForSms, false);
  assert.equal(drops[0].canAlertAsInventory, false);
  assert.equal(drops[0].canAlertAsWatch, false);
  assert.match(drops[0].inventorySemantics, /purchased.*three months/i);
});
