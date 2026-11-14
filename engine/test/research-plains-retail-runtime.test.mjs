import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BourbonBible } from '../src/core/bible.mjs';
import { CUSTOMER_ACTIVE_STATE_IDS } from '../src/state-lifecycle.mjs';
import { withResearchLifecycle, researchSourceForState } from '../src/research-state-registry.mjs';
import {
  collectPlainsRetailResearchReport,
  parsePlainsRetailResearchCapture,
  plainsRetailResearchLifecycleEntries,
  plainsRetailResearchSourceForState,
} from '../src/research-plains-retail-runtime.mjs';

const fixture = JSON.parse(await readFile(new URL('../data/research-captures/plains-retail-20261114.json', import.meta.url)));
const bible = new BourbonBible(fixture.bibleRecords);
const now = Date.parse('2026-11-14T12:00:00.000Z');

test('SD and MT retained exact-store pickup evidence replays only in shadow research', async () => {
  assert.equal(CUSTOMER_ACTIVE_STATE_IDS.has('SD'), false);
  assert.equal(CUSTOMER_ACTIVE_STATE_IDS.has('MT'), false);
  assert.deepEqual([...['SD', 'MT']].map(state => researchSourceForState(state, { shadowMode: true })?.id), ['SD', 'MT']);
  assert.equal(researchSourceForState('SD', { shadowMode: false }), null);

  const lifecycle = withResearchLifecycle({ activeStates: [], states: {} });
  for (const state of ['SD', 'MT']) {
    assert.equal(lifecycle.states[state].publicStatus, 'research_only');
    assert.equal(lifecycle.states[state].inventoryAlertable, false);
    assert.equal(lifecycle.states[state].watchAlertable, false);
    assert.equal(plainsRetailResearchLifecycleEntries()[state].coverageTier, 'single_store_inventory_research');

    const config = plainsRetailResearchSourceForState(state);
    const report = await collectPlainsRetailResearchReport(config, bible, { env: { BOURBON_SIGNAL_SHADOW_MODE: '1' }, now });
    assert.equal(report.metadata.shadowOnly, true);
    assert.equal(report.metadata.productionActivationAllowed, false);
    assert.equal(report.metadata.customerDeliveryAllowed, false);
    assert.equal(report.metadata.origin.kind, 'retained_capture_replay');
    assert.equal(report.signals.every(row => row.researchOnly && !row.canAlertAsInventory && !row.canAlertAsWatch && row.observedAt === row.fetchedAt), true);
    for (const row of report.signals) assert.equal(row.stale, false);

    assert.equal(report.signals.length, state === 'SD' ? 2 : 1);
    assert.equal(new Set(report.signals.map(row => row.city)).size, 1);
  }

  const sd = await collectPlainsRetailResearchReport(plainsRetailResearchSourceForState('SD'), bible, { env: { BOURBON_SIGNAL_SHADOW_MODE: '1' }, now });
  assert.deepEqual(sd.signals.map(row => [row.canonicalName, row.quantity, row.price]).sort(), [
    ['Heaven Hill Bottled-in-Bond 7 Year', 3, 53.99],
    ['Larceny Barrel Proof', 12, 74.99],
  ].sort());
  const mt = await collectPlainsRetailResearchReport(plainsRetailResearchSourceForState('MT'), bible, { env: { BOURBON_SIGNAL_SHADOW_MODE: '1' }, now });
  assert.deepEqual(mt.signals.map(row => [row.canonicalName, row.quantity, row.price]), [
    ['Undammed Thief Creek Straight Bourbon', 6, 51],
  ]);
});

test('source, premise, store, UPC, expression, size, and positive pickup quantity are all required', () => {
  const source = plainsRetailResearchSourceForState('SD');
  const capture = { ...fixture.captures.SD, state: 'SD', researchOnly: true };
  const baseline = parsePlainsRetailResearchCapture(capture, source, bible, { now });
  assert.equal(baseline.length, 2);

  const invalidCaptures = [
    { ...capture, source: 'https://mrliquor.example/' },
    { ...capture, pickupEnabled: false },
    { ...capture, store: { ...capture.store, address: '9 Wrong St' } },
    { ...capture, store: { ...capture.store, id: '5187' } },
    { ...capture, state: 'MT' },
  ];
  for (const invalid of invalidCaptures) assert.deepEqual(parsePlainsRetailResearchCapture(invalid, source, bible, { now }), []);

  const product = capture.products[0];
  for (const mutation of [
    { upc: '096749999999' },
    { title: 'Heaven Hill Bourbon' },
    { canonicalBottleId: 'bb_dec2c347ba378237' },
    { canonicalName: 'Heaven Hill 7 Year' },
    { tier: 'unicorn' },
    { storeId: '5187' },
    { sizeMl: 375 },
    { available: 0 },
    { available: 1.5 },
    { reserved: 1 },
    { backorderEnabled: true },
  ]) {
    const rows = parsePlainsRetailResearchCapture({ ...capture, products: [{ ...product, ...mutation }] }, source, bible, { now });
    assert.deepEqual(rows, [], `mutation should fail closed: ${JSON.stringify(mutation)}`);
  }
});

test('captured source observation clocks are retained and become stale instead of being refreshed at replay', async () => {
  const config = plainsRetailResearchSourceForState('SD');
  const report = await collectPlainsRetailResearchReport(config, bible, {
    env: { BOURBON_SIGNAL_SHADOW_MODE: '1' },
    now: Date.parse('2026-11-14T14:00:00.000Z'),
  });
  assert.equal(report.stale, true);
  assert.equal(report.signals.every(row => row.stale && row.sourceStale && row.observedAt === row.fetchedAt), true);
  assert.equal(report.finishedAt, '2026-11-14T14:00:00.000Z');
  assert.equal(report.signals[0].observedAt, '2026-11-14T11:50:26.105Z');
});

