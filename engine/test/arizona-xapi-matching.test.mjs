import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BourbonBible } from '../src/core/bible.mjs';
import { cityHiveSafeBottleMatch } from '../src/collectors/safe-bottle-match.mjs';
import { reviewedArizonaXapiBottleMatch } from '../src/collectors/arizona-xapi-matching.mjs';
import { collectArizonaAlbertsons } from '../src/collectors/precision-probes.mjs';
import { canonicalizeSignal } from '../src/operational-report.mjs';
import { bibleLookup, buildCurrentInventoryAlertsFromDrops, buildDrops, isActiveCustomerStateRow } from '../src/export-site-contract.mjs';
import { STATE_LIFECYCLE_CONFIG } from '../../src/config/stateLifecycle.ts';
import { buildCoverageContract, searchCoverageTargets } from '../../src/lib/coverage-model.ts';

const fixture = JSON.parse(await readFile(new URL('./fixtures/arizona-xapi/2026-10-22-buffalo-trace.json', import.meta.url), 'utf8'));
const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));
const lookup = bibleLookup(bible.records);
const reviewedId = '960051942';
const lastObservationMs = Math.max(...fixture.captures.map((capture) => Date.parse(capture.observedAt)));

async function collectCapture(capture, { products = capture.products, stores = [capture.store], matchProduct } = {}) {
  return collectArizonaAlbertsons({ id: 'AZ' }, bible, capture.observedAt, {
    zips: [capture.store.address.zipcode],
    maxStores: 1,
    priorityQueries: false,
    nowMs: Date.parse(capture.observedAt),
    sleep: async () => {},
    matchProduct,
    fetchText: async (value) => {
      const url = new URL(value);
      if (url.pathname.includes('/storeresolver/')) return { ok: true, status: 206, text: JSON.stringify({ instore: { stores: structuredClone(stores) } }) };
      assert.equal(url.searchParams.get('storeid'), String(capture.store.locationId));
      assert.equal(url.searchParams.get('start'), '0');
      assert.equal(url.searchParams.get('rows'), '120');
      return { ok: true, status: 200, text: JSON.stringify({ response: { docs: url.searchParams.get('q') === 'bourbon' ? structuredClone(products) : [] } }) };
    },
  });
}

function project(signals) {
  const operational = JSON.parse(JSON.stringify(signals.map((signal) => canonicalizeSignal(signal, bible))));
  const drops = buildDrops(operational, lookup, operational).filter((drop) => isActiveCustomerStateRow(drop));
  return { operational, drops, alerts: buildCurrentInventoryAlertsFromDrops(drops) };
}

test('exact captured XAPI identity adds two Buffalo Trace public rows and alerts through the real collector and JSON boundary', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: lastObservationMs + 5 * 60_000 });
  const before = [];
  const after = [];
  for (const capture of fixture.captures) {
    const product = capture.products.find((row) => row.id === reviewedId);
    assert.equal(cityHiveSafeBottleMatch(product.name, bible).record?.canonical, 'Buffalo Trace Bourbon', 'reviewed library aliases now recognize retailer presentation noise');
    const matched = reviewedArizonaXapiBottleMatch(product, bible, { storeId: capture.store.locationId });
    assert.equal(matched.record?.canonical, 'Buffalo Trace Bourbon');
    assert.equal(matched.match?.method, 'reviewed-arizona-xapi-product-identity');
    before.push(...(await collectCapture(capture, { matchProduct: (row, sourceBible) => cityHiveSafeBottleMatch(row.name, sourceBible) })).signals);
    const result = await collectCapture(capture);
    assert.equal(result.signals.length, 1);
    const signal = result.signals[0];
    assert.equal(signal.raw.product.id, reviewedId);
    assert.equal(signal.raw.product.upc, product.upc);
    assert.equal(signal.storeId, `safeway:${capture.store.locationId}`);
    assert.equal(signal.storeAddress, `${capture.store.address.line1}, ${capture.store.address.city}, AZ ${capture.store.address.zipcode}`);
    assert.equal(signal.observedAt, capture.observedAt);
    assert.equal(signal.price, product.price);
    assert.equal(signal.quantity, product.channelInventory.instoreItemQty);
    assert.equal(signal.raw.channelInventory.instore, '1');
    assert.equal(result.metadata.bourbonSearchCount, 1);
    assert.equal(result.metadata.totalSearchCount, 3, 'matching adds no source request beyond the two broad and one supplemental searches');
    after.push(signal);
  }
  assert.equal(project(before).drops.length, 2);
  assert.equal(project(before).alerts.length, 2);
  const projected = project(after);
  assert.equal(projected.operational.length, 2);
  assert.equal(projected.drops.length, 2);
  assert.equal(projected.alerts.length, 2);
  assert.deepEqual(projected.drops.map((drop) => drop.storeId).sort(), ['safeway:1225', 'safeway:1604']);
  assert.ok(projected.operational.every((row) => row.canonicalName === 'Buffalo Trace Bourbon' && row.canonicalBottleId === bible.match('Buffalo Trace Bourbon').record.id));
  assert.ok(projected.drops.every((drop) => drop.canonicalName === fixture.captures[0].products[0].name && drop.tier === 'allocated' && drop.canAlertAsInventory));
  assert.deepEqual(projected.operational.map((row) => row.observedAt).sort(), fixture.captures.map((capture) => capture.observedAt).sort());
});

test('reviewed XAPI identity rejects changed SKU, UPC, title, proof, format, package or store binding', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: lastObservationMs + 5 * 60_000 });
  const mutations = [
    (row) => { row.id = '960051943'; },
    (row) => { row.pid = '960051943'; },
    (row) => { row.upc = '0008024400924'; },
    (row) => { delete row.upc; },
    (row) => { row.name = row.name.replace('90 Proof', '100 Proof'); },
    (row) => { row.name += ' Gift Set'; },
    (row) => { row.name = 'Buffalo Trace Bourbon'; },
    (row) => { row.alcoholVolumePct = 50; },
    (row) => { delete row.alcoholVolumePct; },
    (row) => { row.containsAlcohol = false; },
    (row) => { row.dispItemSizeQty = '50'; },
    (row) => { row.dispItemSizeQty = '375'; },
    (row) => { row.dispItemSizeQty = '1750'; },
    (row) => { row.dispUnitOfMeasure = 'L'; },
    (row) => { row.unitOfMeasure = 'L'; },
    (row) => { row.dispItemPackageQty = '2'; },
    (row) => { row.storeId = '9999'; },
    (row) => { delete row.storeId; },
  ];
  for (const capture of fixture.captures) {
    for (const mutate of mutations) {
      const product = structuredClone(capture.products.find((row) => row.id === reviewedId));
      mutate(product);
      const result = await collectCapture(capture, { products: [product] });
      assert.deepEqual(result.signals, [], JSON.stringify(product));
      assert.deepEqual(project(result.signals).drops, []);
      assert.deepEqual(project(result.signals).alerts, []);
    }
    const product = capture.products.find((row) => row.id === reviewedId);
    assert.equal(reviewedArizonaXapiBottleMatch(product, bible).record, null, 'a source title alone cannot establish the selected store');
  }
});

test('reviewed product cannot make absent premises, wrong geography, out-of-stock or stale observations alertable', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: lastObservationMs + 5 * 60_000 });
  const signals = [];
  for (const capture of fixture.captures) {
    assert.deepEqual((await collectCapture(capture, { stores: [] })).signals, []);
    const wrongState = structuredClone(capture.store);
    wrongState.address.state = 'NV';
    assert.deepEqual((await collectCapture(capture, { stores: [wrongState] })).signals, []);
    const noAddress = structuredClone(capture.store);
    delete noAddress.address;
    assert.deepEqual((await collectCapture(capture, { stores: [noAddress] })).signals, []);
    for (const inventory of [{ instore: '0', instoreItemQty: 17 }, { instore: '1', instoreItemQty: 0 }, { instore: '1', instoreItemQty: 'unknown' }]) {
      const product = structuredClone(capture.products.find((row) => row.id === reviewedId));
      product.channelInventory = inventory;
      assert.deepEqual(project((await collectCapture(capture, { products: [product] })).signals).alerts, []);
    }
    // Captured cream and miniature products retain their distinct identities.
    const excluded = capture.products.filter((row) => row.id !== reviewedId);
    assert.deepEqual((await collectCapture(capture, { products: excluded })).signals, []);
    signals.push(...(await collectCapture(capture)).signals);
  }
  t.mock.timers.setTime(lastObservationMs + 3 * 60 * 60_000);
  assert.equal(project(signals).drops.length, 2);
  assert.deepEqual(project(signals).alerts, []);
  t.mock.timers.setTime(lastObservationMs + 13 * 60 * 60_000);
  assert.deepEqual(project(signals).drops, []);
});

test('Arizona coverage exposes actual grocery availability and city search only while public inventory is current', async (t) => {
  const asOf = new Date(lastObservationMs + 5 * 60_000).toISOString();
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(asOf) });
  const signals = [];
  for (const capture of fixture.captures) signals.push(...(await collectCapture(capture)).signals);
  const { drops } = project(signals);
  assert.equal(drops.length, 2);
  const inputs = { lifecycle: STATE_LIFECYCLE_CONFIG, drops, asOf };
  const coverage = (overrides = {}) => buildCoverageContract({ ...inputs, ...overrides }).states.find((row) => row.code === 'AZ');
  const current = coverage();
  assert.equal(current.capabilities.currentBottleAvailability, true);
  assert.equal(current.capabilities.restockAlerts, true);
  assert.equal(current.freshness.currentInventoryStores, 2);
  assert.equal(current.freshness.currentInventoryCities, 2);
  assert.match(current.sourceLabel, /Safeway|retailer inventory/i);
  for (const city of ['Chandler', 'Flagstaff']) {
    const results = searchCoverageTargets({ ...inputs, stateCode: 'AZ', query: city });
    assert.ok(results.some((row) => row.kind === 'city' && row.label === city && row.status === 'covered'));
    assert.ok(results.some((row) => row.kind === 'store' && row.status === 'actively-monitored'));
  }
  for (const overrides of [
    { drops: [] },
    { asOf: new Date(lastObservationMs + 3 * 60 * 60_000).toISOString() },
    { drops: drops.map((row) => ({ ...row, type: 'cityhive_store_catalog_watch', event_type: 'cityhive_store_catalog_watch',
      canAlertAsInventory: false, can_alert_as_inventory: false, signalCategory: 'watch', signal_category: 'watch',
      availabilityScope: 'catalog', availability_scope: 'catalog' })) },
    { drops: project(signals.map((row) => ({ ...row, sourceUrl: 'https://unreviewed.example/products/960051942' }))).drops },
    { drops: drops.map((row) => ({ ...row, type: row.type.toUpperCase(), event_type: row.type.toUpperCase(),
      sourceUrl: 'https://unreviewed.example/products/960051942', canAlertAsInventory: false, can_alert_as_inventory: false })) },
    { drops: drops.map((row) => ({ ...row, storeAddress: null, store_address: null,
      locationPrecision: 'city_level', location_precision: 'city_level' })) },
  ]) {
    const unavailable = coverage(overrides);
    assert.equal(unavailable.capabilities.currentBottleAvailability, false, JSON.stringify(overrides));
    assert.equal(unavailable.capabilities.restockAlerts, false);
    assert.equal(unavailable.freshness.currentInventoryStores, 0);
  }
  // A stale warehouse observation cannot keep grocery coverage alive.
  const warehouse = { ...drops[0], source: 'Costco Arizona warehouse inventory', storeId: 'costco:historical',
    observedAt: '2026-10-21T00:00:00.000Z', lastConfirmedAt: '2026-10-21T00:00:00.000Z' };
  assert.equal(coverage({ drops: [warehouse] }).capabilities.currentBottleAvailability, false);
});
