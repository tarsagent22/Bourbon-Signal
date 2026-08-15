import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BourbonBible } from '../engine/src/core/bible.mjs';
import { collectCostco } from '../engine/src/collectors/costco.mjs';
import { ALL_STATE_SOURCES, CUSTOMER_ACTIVE_STATE_IDS, STATE_SOURCES } from '../engine/src/state-sources.mjs';

const tmp = await mkdtemp(path.join(tmpdir(), 'costco-source-'));
const observationsFile = path.join(tmp, 'costco-observations.json');
await writeFile(observationsFile, JSON.stringify({
  generatedAt: '2026-07-03T16:00:00.000Z',
  observations: [
    {
      itemNumber: '1280805',
      bottleName: 'Weller C.Y.P.B.',
      status: 'available',
      quantity: 2,
      price: 69.99,
      storeName: 'Costco Hoover',
      storeNumber: '362',
      city: 'Hoover',
      state: 'AL',
      observedAt: '2026-07-03T15:55:00.000Z'
    },
    {
      itemNumber: '122438',
      bottleName: "Blanton's Single Barrel",
      status: 'available',
      quantity: 1,
      storeName: 'Costco Charlotte',
      storeNumber: '359',
      city: 'Charlotte',
      state: 'NC',
      observedAt: '2026-07-03T15:56:00.000Z'
    },
    {
      itemNumber: '149017',
      bottleName: 'Eagle Rare',
      status: 'out_of_stock',
      storeName: 'Costco Louisville',
      storeNumber: '1150',
      city: 'Louisville',
      state: 'KY'
    },
    {
      itemNumber: '122438',
      bottleName: "Blanton's Single Barrel",
      status: 'available',
      quantity: 1,
      storeName: 'Costco Seattle',
      storeNumber: '1',
      city: 'Seattle',
      state: 'WA',
      observedAt: '2026-07-03T15:57:00.000Z'
    }
  ]
}, null, 2));
process.env.COSTCO_OBSERVATIONS_FILE = observationsFile;
process.env.COSTCO_WATCHLIST_FILE = path.resolve('engine/data/costco-bourbon-watchlist.json');
process.env.COSTCO_MAX_OBSERVATION_AGE_HOURS = '999999';

try {
  const activeIds = [...CUSTOMER_ACTIVE_STATE_IDS];
  assert.ok(!activeIds.includes('US-COSTCO'), 'Costco must not be a customer-facing pseudo-state');

  const originalEligibleStates = ['AL', 'IA', 'IL', 'IN', 'KY', 'SC'];
  const activeExpansionEligibleStates = ['AZ', 'CA', 'FL', 'GA', 'NV'];
  const researchOnlyEligibleStates = ['MI', 'MN', 'MO', 'WA', 'WI'];
  const eligibleStates = [...originalEligibleStates, ...activeExpansionEligibleStates, ...researchOnlyEligibleStates];
  const ineligibleActiveStates = ['NC', 'VA', 'PA', 'ID', 'TN', 'MD-MONTGOMERY'];
  const warehouses = JSON.parse(await readFile(path.resolve('engine/data/costco-warehouses.json'), 'utf8')).warehouses;
  assert.ok(warehouses.length >= 20, 'Costco probe list should cover a useful multi-state warehouse set');
  for (const state of eligibleStates) {
    assert.ok(warehouses.some((warehouse) => warehouse.state === state), `${state} should have at least one Costco probe warehouse`);
  }
  for (const state of [...originalEligibleStates, ...activeExpansionEligibleStates]) {
    const config = STATE_SOURCES.find((source) => source.id === state);
    assert.ok(config, `${state} should be active`);
    assert.ok(config.sources.some((source) => source.kind === 'costco'), `${state} should include Costco as an in-state source`);
  }
  for (const state of researchOnlyEligibleStates) {
    assert.ok(!STATE_SOURCES.some((source) => source.id === state), `${state} must not be customer-active without recurring Costco observations`);
    const config = ALL_STATE_SOURCES.find((source) => source.id === state);
    assert.ok(config, `${state} should retain research configuration`);
    assert.ok(config.sources.some((source) => source.kind === 'costco'), `${state} research configuration should retain Costco`);
  }
  for (const state of ineligibleActiveStates) {
    const config = STATE_SOURCES.find((source) => source.id === state);
    assert.ok(config, `${state} should be active`);
    assert.ok(!config.sources.some((source) => source.kind === 'costco'), `${state} should not include Costco spirits source`);
  }
  for (const state of activeExpansionEligibleStates) {
    const config = STATE_SOURCES.find((source) => source.id === state);
    assert.ok(config, `${state} expansion state should be active`);
    assert.ok(
      config.strategy === 'costco_warehouse_inventory_watch' || config.sources.some((source) => source.kind === 'costco'),
      `${state} expansion engine should invoke an in-state Costco lane`,
    );
  }

  const bible = await BourbonBible.load(path.resolve('engine/out/bourbon-bible.json'));
  const alReport = await collectCostco({
    id: 'AL',
    label: 'Alabama ABC + Costco warehouse watch',
    tier: 'A',
    strategy: 'scheduled_release_leads_plus_costco_warehouse_inventory',
    cadence: '15-60m',
    value: 'test'
  }, bible);
  assert.equal(alReport.status, 'signals_normalized');
  assert.equal(alReport.signals.length, 1);
  const signal = alReport.signals[0];
  assert.equal(signal.state, 'AL');
  assert.equal(signal.displayState, 'AL');
  assert.equal(signal.eventType, 'costco_warehouse_inventory_result');
  assert.equal(signal.canAlertAsInventory, true);
  assert.equal(signal.sourceLabel, 'Costco warehouse inventory');
  assert.equal(signal.sourceReliability, 'warehouse_observation');
  assert.equal(signal.raw.costcoItemNumber, '1280805');
  assert.match(signal.evidence, /Costco warehouse inventory reported/i);

  const waReport = await collectCostco({ id: 'WA', label: 'Washington Costco warehouse bourbon watch' }, bible);
  assert.equal(waReport.status, 'signals_normalized');
  assert.equal(waReport.signals.length, 1);
  assert.equal(waReport.signals[0].state, 'WA');

  const ncReport = await collectCostco({ id: 'NC', label: 'North Carolina ABC + county boards' }, bible);
  assert.equal(ncReport.signals.length, 0, 'NC Costco observations must be ignored because Costco spirits are not eligible there');

  const kyReport = await collectCostco({ id: 'KY', label: 'Kentucky distillery drops + Costco warehouse watch' }, bible);
  assert.equal(kyReport.signals.length, 0, 'out-of-stock Costco rows must not become signals');
  assert.equal(kyReport.roadblocks.length, 0, 'a current negative warehouse observation is healthy zero inventory, not a source failure');

  const undatedPositive = {
    itemNumber: '1280805',
    bottleName: 'Weller C.Y.P.B.',
    status: 'available',
    quantity: 2,
    storeName: 'Costco Hoover',
    storeNumber: '362',
    city: 'Hoover',
    state: 'AL',
  };
  await writeFile(observationsFile, JSON.stringify([undatedPositive], null, 2));
  const undatedReport = await collectCostco({ id: 'AL', label: 'Alabama Costco watch' }, bible);
  assert.equal(undatedReport.signals.length, 0, 'a bare undated observation array must fail closed instead of inheriting collection time');
  assert.equal(undatedReport.roadblocks[0]?.status, 'invalid_timestamp');
  assert.equal(undatedReport.sources[1]?.signalType, 'costco_observation_timestamp_invalid');

  const explicitFeedTime = new Date().toISOString();
  await writeFile(observationsFile, JSON.stringify({ generatedAt: explicitFeedTime, observations: [undatedPositive] }, null, 2));
  const feedDatedReport = await collectCostco({ id: 'AL', label: 'Alabama Costco watch' }, bible);
  assert.equal(feedDatedReport.signals.length, 1, 'an explicit valid feed timestamp may date an otherwise undated observation');
  assert.equal(feedDatedReport.signals[0].observedAt, explicitFeedTime);
  assert.equal(Number.isFinite(Date.parse(feedDatedReport.signals[0].fetchedAt)), true);

  await writeFile(observationsFile, JSON.stringify({ generatedAt: 'not-a-timestamp', observations: [undatedPositive] }, null, 2));
  const invalidFeedTimeReport = await collectCostco({ id: 'AL', label: 'Alabama Costco watch' }, bible);
  assert.equal(invalidFeedTimeReport.signals.length, 0, 'an invalid feed timestamp must fail closed');
  assert.equal(invalidFeedTimeReport.roadblocks[0]?.status, 'invalid_timestamp');

  console.log('Costco state-embedded source policy verified.');
} finally {
  await rm(tmp, { recursive: true, force: true });
}
