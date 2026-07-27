import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CHARLOTTE_METRO_BOARD_GROUP,
  DEMAND_METRO_AREAS,
  demandMetroAreaMatchesFields,
  demandMetroBoardGroupMatchesFields,
  normalizeDemandMetroAreas,
} from '../src/demand-metro-areas.mjs';
import {
  buildTennesseeConfiguredStoreLocationSignals,
  TENNESSEE_RETAILER_STORES,
  registeredTennesseeStore,
} from '../src/collectors/tennessee-retailer-surfaces.mjs';
import { grabblHasCurrentOrderability } from '../src/collectors/precision-probes.mjs';
import {
  isAllowedTennesseeBottleFormat,
  isTennesseeRetailerInventory,
  normalizeTennesseeCityHiveQuantity,
} from '../src/tennessee-retailer-policy.mjs';
import {
  GEORGIA_CITYHIVE_SOURCES,
  GEORGIA_GOTOLIQUOR_STORES,
  GEORGIA_LIGHTSPEED_STORES,
} from '../src/collectors/georgia-retailer-surfaces.mjs';
import { buildLocationBible } from '../src/location-bible.mjs';
import { buildStores } from '../src/export-site-contract.mjs';
import { confidenceForSignal } from '../src/confidence-policy.mjs';
import { evaluateTennesseeSnapshotEvidence } from '../src/tennessee-verification-policy.mjs';

function tennesseeBinarySignal(overrides = {}) {
  const store = registeredTennesseeStore('frugal-macdoogal', '6599a3f98893882b7f30798d');
  return {
    state: 'TN',
    stateCode: 'TN',
    eventType: 'cityhive_store_inventory_result',
    sourceLabel: 'Frugal MacDoogal CityHive store inventory',
    sourceUrl: 'https://www.frugalmacdoogal.com/shop/product/buffalo-trace-bourbon/example',
    sourceChain: 'frugal-macdoogal',
    merchantId: store.merchantId,
    productId: 'product-1',
    variantId: 'option-1',
    rawName: 'Buffalo Trace Bourbon 750ml',
    canonicalBottleId: 'buffalo-trace',
    canonicalName: 'Buffalo Trace',
    locationPrecision: 'store_level',
    locationName: store.name,
    storeName: store.name,
    storeId: store.storeId,
    storeAddress: store.address,
    city: store.city,
    postalCode: store.zip,
    zip: store.zip,
    quantity: 0,
    quantityIsExact: false,
    reportedQuantity: 100,
    availabilityStatus: 'in_stock',
    sourceAvailabilityVerified: true,
    canAlertAsInventory: true,
    canAlertAsWatch: true,
    inventorySemantics: 'binary_retailer_orderable_no_exact_count',
    observedAt: new Date().toISOString(),
    raw: {
      chain: 'frugal-macdoogal',
      merchantId: store.merchantId,
      reportedQuantity: 100,
      binaryAvailability: true,
      sourceAvailabilityVerified: true,
      option: {
        merchant_id: store.merchantId,
        product_id: 'product-1',
        option_id: 'option-1',
        full_address: store.address,
      },
    },
    ...overrides,
  };
}

test('demand metros expose one stable canonical option with exact reviewed aliases', () => {
  assert.equal(DEMAND_METRO_AREAS.NC.label, CHARLOTTE_METRO_BOARD_GROUP);
  assert.equal(DEMAND_METRO_AREAS.GA.label, 'Atlanta Metro');
  assert.equal(DEMAND_METRO_AREAS.TN.label, 'Nashville Metro');

  assert.deepEqual(normalizeDemandMetroAreas('NC', ['Charlotte', 'Charlotte metro ABC boards']), [CHARLOTTE_METRO_BOARD_GROUP]);
  assert.deepEqual(normalizeDemandMetroAreas('GA', ['greater atlanta', 'Atlanta Metro']), ['Atlanta Metro']);
  assert.deepEqual(normalizeDemandMetroAreas('TN', ['middle tennessee', 'Nashville Metro']), ['Nashville Metro']);

  for (const [state, values] of Object.entries({
    NC: ['Charlotte', 'Mecklenburg', 'Concord', 'Kannapolis', 'Indian Trail', 'Mooresville', 'Statesville', 'Gastonia'],
    GA: ['Atlanta', 'Doraville', 'Brookhaven', 'Chamblee', 'Decatur', 'Stonecrest', 'Marietta', 'Alpharetta', 'Cumming', 'Suwanee', 'Fairburn', 'Norcross'],
    TN: ['Nashville', 'Davidson', 'Franklin', 'Brentwood', 'Murfreesboro', 'Smyrna', 'La Vergne', 'Hendersonville', 'Gallatin', 'Mount Juliet'],
  })) {
    for (const value of values) {
      assert.equal(demandMetroAreaMatchesFields(state, [value], [DEMAND_METRO_AREAS[state].label]), true, `${state} should include ${value}`);
    }
  }
});

test('demand metro matching has no substring, county-name, highway, or cross-state bleed', () => {
  const negatives = {
    NC: ['Charlottesville, VA', 'Charlotte County, VA', '9989 Charlotte Hwy, Indian Land, SC 29707', 'Davidson County ABC Board', 'Gastonia, TX'],
    GA: ['Atlantis, FL', 'Decatur, IL', 'Marietta, OH', 'Cumming, IA', 'Norcross, MN'],
    TN: ['Nashville, IN 47448', 'Davidson County, NC', 'Franklin, KY', 'Gallatin County, MT', 'Mount Juliet Estate'],
  };
  for (const [state, values] of Object.entries(negatives)) {
    for (const value of values) {
      assert.equal(demandMetroAreaMatchesFields(state, [value], [DEMAND_METRO_AREAS[state].label]), false, `${state} must reject ${value}`);
    }
  }
  assert.equal(demandMetroAreaMatchesFields('GA', ['Nashville, TN'], ['Atlanta Metro']), false);
  assert.equal(demandMetroAreaMatchesFields('TN', ['Atlanta, GA'], ['Nashville Metro']), false);
});

test('Charlotte board grouping expands only to exact reviewed official board names', () => {
  assert.equal(DEMAND_METRO_AREAS.NC.boardNames.length, 8);
  for (const board of DEMAND_METRO_AREAS.NC.boardNames) {
    assert.equal(demandMetroBoardGroupMatchesFields([board], [CHARLOTTE_METRO_BOARD_GROUP]), true, board);
  }
  for (const board of ['Davidson County ABC Board', 'Cabarrus County ABC Board', 'Union County ABC Board', 'Iredell County ABC Board', 'Gaston County ABC Board']) {
    assert.equal(demandMetroBoardGroupMatchesFields([board], [CHARLOTTE_METRO_BOARD_GROUP]), false, board);
  }
});

test('Atlanta and Nashville exact-store registries provide stable metro depth without claiming inventory', () => {
  const georgiaStores = [
    ...GEORGIA_CITYHIVE_SOURCES.flatMap((source) => [...source.merchants.values()].map((store) => ({ ...store, sourceId: source.id }))),
    ...GEORGIA_GOTOLIQUOR_STORES,
    ...GEORGIA_LIGHTSPEED_STORES,
  ].filter((store) => demandMetroAreaMatchesFields('GA', [store.city, store.address], ['Atlanta Metro']));
  const tennesseeStores = TENNESSEE_RETAILER_STORES
    .filter((store) => demandMetroAreaMatchesFields('TN', [store.city, store.address], ['Nashville Metro']));

  assert.ok(georgiaStores.length >= 20, `expected >=20 exact Atlanta-metro stores, got ${georgiaStores.length}`);
  assert.equal(tennesseeStores.length, 13, `expected all 13 exact Nashville-metro stores, got ${tennesseeStores.length}`);
  assert.ok(georgiaStores.every((store) => store.address && store.city));
  assert.ok(tennesseeStores.every((store) => store.storeId && store.merchantId && store.address && store.hostname));

  const locations = buildLocationBible([], []);
  const stableGaLocations = locations.filter((row) => row.state === 'GA' && row.area === 'Atlanta Metro');
  const stableTnLocations = locations.filter((row) => row.state === 'TN' && row.area === 'Nashville Metro');
  assert.ok(stableGaLocations.length >= 20);
  assert.equal(stableTnLocations.length, 13);
  assert.ok([...stableGaLocations, ...stableTnLocations].every((row) => row.hasSignals === false && row.inventoryCapability === 'exact_store_source_registered'));

  const stores = buildStores([]);
  assert.ok(stores.filter((row) => row.state === 'GA' && row.area === 'Atlanta Metro').length >= 20);
  assert.equal(stores.filter((row) => row.state === 'TN' && row.area === 'Nashville Metro').length, 13);
  assert.ok(stores.filter((row) => ['GA', 'TN'].includes(row.state)).every((row) => row.signalCount === 0 && row.sourceAvailabilityVerified === false));
});

test('all 13 Nashville locator identities stay searchable without becoming inventory', () => {
  const nashvilleRegistry = TENNESSEE_RETAILER_STORES
    .filter((store) => demandMetroAreaMatchesFields('TN', [store.city, store.address], ['Nashville Metro']));
  const locatorSignals = buildTennesseeConfiguredStoreLocationSignals('2026-07-27T12:00:00.000Z')
    .filter((signal) => nashvilleRegistry.some((store) => store.storeId === signal.storeId));
  assert.equal(locatorSignals.length, 13);

  const locatorStores = buildStores(locatorSignals)
    .filter((row) => row.state === 'TN' && row.area === 'Nashville Metro');
  assert.equal(locatorStores.length, 13);
  assert.ok(locatorStores.every((row) =>
    row.collectorAttached === true
    && row.hasSignals === false
    && row.signalCount === 0
    && row.sourceAvailabilityVerified === false
  ));

  const positive = tennesseeBinarySignal({ observedAt: '2026-07-27T12:05:00.000Z' });
  const withInventory = buildStores([...locatorSignals, positive]);
  const positiveStore = withInventory.find((row) => row.id === positive.storeId);
  assert.equal(positiveStore?.hasSignals, true);
  assert.equal(positiveStore?.signalCount, 1);
  assert.equal(positiveStore?.sourceAvailabilityVerified, true);
  assert.equal(
    withInventory.filter((row) => row.state === 'TN' && row.area === 'Nashville Metro' && row.hasSignals).length,
    1,
  );
});

test('Grabbl orderability fails closed on denial and ambiguous status text', () => {
  for (const status of [
    'not available',
    'unavailable',
    'not orderable',
    'out of stock',
    'sold out',
    'available for pickup but sold out',
    'not available for pickup; orderable status unknown',
    'available for pickup; current status unknown',
    'not sure if available for pickup',
  ]) {
    assert.equal(grabblHasCurrentOrderability({ status }), false, status);
  }
  assert.equal(grabblHasCurrentOrderability({ isInStock: true, status: 'not available' }), false);
  assert.equal(grabblHasCurrentOrderability({ isInStock: true }), true);
  assert.equal(grabblHasCurrentOrderability({ pickupAvailable: true }), true);
  assert.equal(grabblHasCurrentOrderability({ availableQuantity: 2 }), true);
  assert.equal(grabblHasCurrentOrderability({ status: 'available for pickup' }), true);
  assert.equal(grabblHasCurrentOrderability({ status: 'orderable for pickup' }), true);
  assert.equal(grabblHasCurrentOrderability({ status: 'availability unknown' }), false);
});

test('Tennessee snapshot evidence requires a current generated partition or explicitly allowed fresh retention', () => {
  const now = '2026-07-27T12:30:00.000Z';
  const current = tennesseeBinarySignal({ observedAt: '2026-07-27T12:05:00.000Z' });
  const base = {
    stateReport: {
      state: 'TN',
      status: 'useful',
      stale: false,
      startedAt: '2026-07-27T12:00:00.000Z',
      finishedAt: '2026-07-27T12:10:00.000Z',
      signals: [current],
    },
    dropsPayload: {
      generatedAt: '2026-07-27T12:11:00.000Z',
      drops: [current],
    },
    now,
  };
  assert.equal(evaluateTennesseeSnapshotEvidence(base).ok, true);

  const locatorOnly = {
    ...base,
    stateReport: { ...base.stateReport, signals: buildTennesseeConfiguredStoreLocationSignals(now) },
    dropsPayload: { ...base.dropsPayload, drops: [] },
  };
  assert.equal(evaluateTennesseeSnapshotEvidence(locatorOnly).ok, false);

  const retained = tennesseeBinarySignal({ observedAt: '2026-07-27T08:00:00.000Z' });
  const retainedOnly = {
    ...base,
    stateReport: { ...base.stateReport, signals: [retained] },
    dropsPayload: { ...base.dropsPayload, drops: [retained] },
  };
  assert.equal(evaluateTennesseeSnapshotEvidence(retainedOnly).ok, false);
  assert.equal(evaluateTennesseeSnapshotEvidence({
    ...retainedOnly,
    stateReport: {
      ...retainedOnly.stateReport,
      roadblocks: [{
        source: 'Tennessee CityHive retailer inventory cache reuse',
        status: 200,
        error: 'Using cache-backed exact-store rows inside the bounded freshness window.',
      }],
    },
  }).ok, true);
  assert.equal(evaluateTennesseeSnapshotEvidence({ ...retainedOnly, allowFreshRetainedEvidence: true }).ok, true);

  const expired = tennesseeBinarySignal({ observedAt: '2026-07-26T20:00:00.000Z' });
  const expiredRetention = {
    ...retainedOnly,
    stateReport: { ...base.stateReport, signals: [expired] },
    dropsPayload: { ...base.dropsPayload, drops: [expired] },
    allowFreshRetainedEvidence: true,
  };
  assert.equal(evaluateTennesseeSnapshotEvidence(expiredRetention).ok, false);
  assert.equal(evaluateTennesseeSnapshotEvidence({
    ...base,
    dropsPayload: { ...base.dropsPayload, generatedAt: '2026-07-27T11:59:00.000Z' },
  }).ok, false);
});

test('Tennessee format and quantity policy rejects unsafe formats and keeps binary orderability non-exact', () => {
  for (const value of ['50ml Buffalo Trace', '375 ml bourbon', 'Buffalo Trace 3 Pack', 'Bourbon bundle', 'Case of 6 bourbon', '2 x 750ml bourbon', 'Buffalo Trace candle']) {
    assert.equal(isAllowedTennesseeBottleFormat(value), false, value);
  }
  for (const value of ['Buffalo Trace Bourbon 750ml', "Maker's Mark 1 L", "Booker's Bourbon"]) {
    assert.equal(isAllowedTennesseeBottleFormat(value), true, value);
  }
  assert.deepEqual(normalizeTennesseeCityHiveQuantity(100), {
    reportedQuantity: 100,
    quantity: 0,
    quantityIsExact: false,
    binaryAvailability: true,
  });
  assert.deepEqual(normalizeTennesseeCityHiveQuantity(7), {
    reportedQuantity: 7,
    quantity: 7,
    quantityIsExact: true,
    binaryAvailability: false,
  });
});

test('Tennessee inventory requires exact host, merchant, premises, product, availability, and safe format', () => {
  const valid = tennesseeBinarySignal();
  assert.equal(isTennesseeRetailerInventory(valid), true);
  for (const forged of [
    { ...valid, sourceLabel: `${valid.sourceLabel} spoof` },
    { ...valid, sourceUrl: 'https://attacker.example/shop/product/test' },
    { ...valid, sourceUrl: valid.sourceUrl.replace('https:', 'http:') },
    { ...valid, sourceChain: 'forged-chain', raw: { ...valid.raw, chain: 'forged-chain' } },
    { ...valid, merchantId: 'forged-merchant' },
    { ...valid, storeId: 'frugal-macdoogal:forged-merchant' },
    { ...valid, storeAddress: '701 Division St, Nashville, IN 37203' },
    { ...valid, storeName: 'Forged Store', locationName: 'Forged Store' },
    { ...valid, city: 'Nashville', stateCode: 'IN' },
    { ...valid, zip: '99999', postalCode: '99999' },
    { ...valid, productId: null },
    { ...valid, sourceAvailabilityVerified: false },
    { ...valid, availabilityStatus: 'out_of_stock' },
    { ...valid, quantity: 1, quantityIsExact: false },
    { ...valid, rawName: 'Buffalo Trace Bourbon 375ml' },
    { ...valid, rawName: 'Buffalo Trace Bourbon 3 Pack' },
  ]) {
    assert.equal(isTennesseeRetailerInventory(forged), false, JSON.stringify(forged));
  }
});

test('confidence policy and source export fail closed for unverified Tennessee rows', () => {
  const accepted = confidenceForSignal(tennesseeBinarySignal());
  assert.equal(accepted.canAlertAsInventory, true);
  assert.equal(accepted.canAlertAsWatch, true);
  for (const invalid of [
    { ...tennesseeBinarySignal(), sourceAvailabilityVerified: false },
    { ...tennesseeBinarySignal(), storeAddress: '701 Division St, Nashville, IN 37203' },
    { ...tennesseeBinarySignal(), rawName: 'Buffalo Trace Bourbon 50ml' },
  ]) {
    const denied = confidenceForSignal(invalid);
    assert.equal(denied.canAlertAsInventory, false);
    assert.equal(denied.canAlertAsWatch, false);
  }

  const exporter = readFileSync(new URL('../src/export-site-contract.mjs', import.meta.url), 'utf8');
  assert.match(exporter, /isTennesseeRetailerInventory/);
  assert.match(exporter, /signal\.canAlertAsInventory !== true/);
  assert.match(exporter, /binary_retailer_orderable_no_exact_count/);
  assert.match(exporter, /eligibleForEmail:[^\n]*false/);
  assert.match(exporter, /eligibleForSms:[^\n]*false/);
});

test('lifecycle, collectors, verifiers, and CI expose all three demand-selected metros', () => {
  const lifecycle = JSON.parse(readFileSync(new URL('../../src/config/state-lifecycle.json', import.meta.url), 'utf8'));
  assert.equal(lifecycle.states.NC.customerAreaLabel, 'North Carolina ABC boards');
  assert.deepEqual(lifecycle.states.NC.areaOptions, [CHARLOTTE_METRO_BOARD_GROUP]);
  assert.equal(lifecycle.states.GA.customerAreaLabel, 'Atlanta Metro');
  assert.deepEqual(lifecycle.states.GA.areaOptions, ['Atlanta Metro']);
  assert.equal(lifecycle.states.TN.customerAreaLabel, 'Nashville Metro');
  assert.deepEqual(lifecycle.states.TN.areaOptions, ['Nashville Metro']);

  const enginePackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(enginePackage.scripts['test:demand-metros'], 'node --test test/demand-metro-expansion.test.mjs');
  assert.equal(enginePackage.scripts['verify:demand-metros'], 'node src/verify-demand-metros.mjs');

  const rootPackage = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(rootPackage.scripts['test:demand-metro-user-path'], 'node --no-warnings --experimental-strip-types scripts/test-demand-metro-user-path.mts');
  assert.match(rootPackage.scripts['verify:ci'], /test:demand-metro-user-path/);
  assert.match(rootPackage.scripts['verify:ci'], /verify:demand-metros/);

  const workflow = readFileSync(new URL('../../.github/workflows/refresh-feed.yml', import.meta.url), 'utf8');
  const demandGate = workflow.indexOf('Verify demand metro generated evidence');
  const lastDemandGate = workflow.lastIndexOf('Verify demand metro generated evidence');
  const tnGate = workflow.indexOf('Verify Tennessee generated contract');
  const lastTnGate = workflow.lastIndexOf('Verify Tennessee generated contract');
  const publish = workflow.indexOf('Publish and atomically activate encrypted snapshot');
  assert.ok(demandGate >= 0 && lastDemandGate < tnGate, 'every demand metro verification path must precede Tennessee verification');
  assert.ok(lastTnGate < publish, 'every Tennessee verification path must precede publication');
  assert.match(workflow, /verify:demand-metros/);
  assert.match(workflow, /verify:tn/);
  assert.match(workflow, /--allow-fresh-retained-evidence/);
  assert.doesNotMatch(workflow, /BOURBON_SIGNAL_VERIFY_SITE_DIR/, 'publication verification must inspect the generated workflow site directory');
});
