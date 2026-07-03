import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BourbonBible } from '../engine/src/core/bible.mjs';
import { collectCostco } from '../engine/src/collectors/costco.mjs';
import { CUSTOMER_ACTIVE_STATE_IDS, STATE_SOURCES } from '../engine/src/state-sources.mjs';

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
    }
  ]
}, null, 2));
process.env.COSTCO_OBSERVATIONS_FILE = observationsFile;
process.env.COSTCO_WATCHLIST_FILE = path.resolve('engine/data/costco-bourbon-watchlist.json');

try {
  const activeIds = [...CUSTOMER_ACTIVE_STATE_IDS];
  assert.ok(!activeIds.includes('US-COSTCO'), 'Costco must not be a customer-facing pseudo-state');

  const eligibleStates = ['AL', 'IA', 'IL', 'IN', 'KY', 'SC'];
  const ineligibleActiveStates = ['NC', 'VA', 'PA', 'ID', 'TN', 'MD-MONTGOMERY'];
  for (const state of eligibleStates) {
    const config = STATE_SOURCES.find((source) => source.id === state);
    assert.ok(config, `${state} should be active`);
    assert.ok(config.sources.some((source) => source.kind === 'costco'), `${state} should include Costco as an in-state source`);
  }
  for (const state of ineligibleActiveStates) {
    const config = STATE_SOURCES.find((source) => source.id === state);
    assert.ok(config, `${state} should be active`);
    assert.ok(!config.sources.some((source) => source.kind === 'costco'), `${state} should not include Costco spirits source`);
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
  assert.equal(signal.raw.costcoItemNumber, '1280805');
  assert.match(signal.evidence, /Costco warehouse inventory reported/i);

  const ncReport = await collectCostco({ id: 'NC', label: 'North Carolina ABC + county boards' }, bible);
  assert.equal(ncReport.signals.length, 0, 'NC Costco observations must be ignored because Costco spirits are not eligible there');

  const kyReport = await collectCostco({ id: 'KY', label: 'Kentucky distillery drops + Costco warehouse watch' }, bible);
  assert.equal(kyReport.signals.length, 0, 'out-of-stock Costco rows must not become signals');

  console.log('Costco state-embedded source policy verified.');
} finally {
  await rm(tmp, { recursive: true, force: true });
}
