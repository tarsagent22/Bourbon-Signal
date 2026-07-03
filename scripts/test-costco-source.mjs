import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BourbonBible } from '../engine/src/core/bible.mjs';
import { collectCostco } from '../engine/src/collectors/costco.mjs';

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
      storeName: 'Costco Seattle',
      storeNumber: '1',
      city: 'Seattle',
      state: 'WA',
      observedAt: '2026-07-03T15:55:00.000Z'
    },
    {
      itemNumber: '122438',
      bottleName: "Blanton's Single Barrel",
      status: 'out_of_stock',
      storeName: 'Costco Spokane',
      storeNumber: '486',
      city: 'Spokane',
      state: 'WA'
    }
  ]
}, null, 2));
process.env.COSTCO_OBSERVATIONS_FILE = observationsFile;
process.env.COSTCO_WATCHLIST_FILE = path.resolve('engine/data/costco-bourbon-watchlist.json');

try {
  const bible = await BourbonBible.load(path.resolve('engine/out/bourbon-bible.json'));
  const report = await collectCostco({
    id: 'US-COSTCO',
    label: 'Costco warehouse bourbon watch',
    tier: 'B',
    strategy: 'national_retailer_item_number_watch',
    cadence: '15-60m',
    value: 'test'
  }, bible);
  assert.equal(report.status, 'signals_normalized');
  assert.equal(report.signals.length, 1);
  const signal = report.signals[0];
  assert.equal(signal.state, 'US-COSTCO');
  assert.equal(signal.displayState, 'WA');
  assert.equal(signal.eventType, 'costco_warehouse_inventory_result');
  assert.equal(signal.canAlertAsInventory, true);
  assert.equal(signal.sourceLabel, 'Costco warehouse inventory');
  assert.equal(signal.raw.costcoItemNumber, '1280805');
  assert.match(signal.evidence, /Costco warehouse inventory reported/i);
  console.log('Costco warehouse source policy verified.');
} finally {
  await rm(tmp, { recursive: true, force: true });
}
