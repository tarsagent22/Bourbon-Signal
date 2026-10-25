import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BourbonBible } from '../src/core/bible.mjs';
import { parseArizonaXapiInventory } from '../src/collectors/arizona-xapi.mjs';
import { reviewedArizonaXapiBottleMatch } from '../src/collectors/arizona-xapi-matching.mjs';
import { canonicalizeSignal } from '../src/operational-report.mjs';
import { bibleLookup, buildDrops } from '../src/export-site-contract.mjs';
import { isPublicDropFeedEligible } from '../../src/lib/public-drop-evidence.ts';

const fixture = JSON.parse(await readFile(new URL('./fixtures/arizona-xapi/2026-10-25-depth.json', import.meta.url)));
const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));

test('three live reviewed product identities survive canonical JSON and the actual public feed gate', t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(fixture.observedAt) + 60_000 });
  const signals = parseArizonaXapiInventory({ response: { docs: fixture.products } }, fixture.store, bible, { observedAt: fixture.observedAt });
  assert.equal(signals.length, 3);
  assert.deepEqual(new Set(signals.map(s => s.canonicalName)), new Set(['Heaven Hill Bottled-in-Bond 7 Year', 'WhistlePig PiggyBack 6 Year Bourbon', 'E.H. Taylor Small Batch']));
  const op = JSON.parse(JSON.stringify(signals.map(s => canonicalizeSignal(s, bible))));
  const drops = buildDrops(op, bibleLookup(bible.records), op).filter(isPublicDropFeedEligible);
  assert.equal(drops.length, 3);
  const binary = signals.find(s => s.canonicalName === 'E.H. Taylor Small Batch');
  assert.equal(binary.quantity, 0, 'binary stock cannot invent a shelf quantity');
});

test('each reviewed identity fails closed when its product, UPC, title, strength, format or premise changes', () => {
  for (const product of fixture.products) {
    const check = value => reviewedArizonaXapiBottleMatch(value, bible, { storeId: String(fixture.store.locationId) });
    assert.ok(check(product).record);
    for (const patch of [{ id: '1' }, { pid: '1' }, { upc: '1' }, { name: product.name + ' Single Barrel' }, { containsAlcohol: false },
      { alcoholVolumePct: 40 }, { dispItemSizeQty: 50 }, { dispUnitOfMeasure: 'L' }, { unitOfMeasure: 'L' }, { dispItemPackageQty: 2 }, { storeId: '9999' }]) {
      assert.equal(check({ ...product, ...patch }).record, null, JSON.stringify(patch));
    }
  }
});
