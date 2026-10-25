import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BourbonBible } from '../src/core/bible.mjs';
import { collectArizonaAlbertsons } from '../src/collectors/precision-probes.mjs';
import { ARIZONA_XAPI_OCT22_STORE_IDS as ARIZONA_XAPI_PREVIOUS_STORE_IDS } from '../src/collectors/arizona-xapi.mjs';
import { canonicalizeSignal } from '../src/operational-report.mjs';
import { bibleLookup, buildDrops, buildCurrentInventoryAlertsFromDrops } from '../src/export-site-contract.mjs';
const fixture = JSON.parse(await readFile(new URL('./fixtures/arizona-xapi/2026-10-24-new-premises.json', import.meta.url), 'utf8'));
const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));

test('live Sedona, Cottonwood and Benson captures survive collector, canonical JSON, public export and alert policy', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Math.max(...fixture.captures.map(row => Date.parse(row.observedAt))) + 60_000 });
  const signals = [];
  for (const capture of fixture.captures) {
    assert.equal(capture.status, 200);
    assert.ok(!ARIZONA_XAPI_PREVIOUS_STORE_IDS.includes(capture.store.locationId));
    const result = await collectArizonaAlbertsons({ id: 'AZ' }, bible, capture.observedAt, {
      zips: [capture.store.address.zipcode], maxStores: 1, sleep: async () => {},
      fetchText: async value => {
        const url = new URL(value);
        return { ok: true, status: 200, text: JSON.stringify(url.pathname.includes('storeresolver')
          ? { instore: { stores: [capture.store] } }
          : { response: { docs: url.searchParams.get('q') === 'bourbon' ? capture.products : [] } }) };
      },
    });
    assert.equal(result.signals.length, 1);
    const signal = result.signals[0];
    assert.equal(signal.city, capture.store.address.city);
    assert.equal(signal.observedAt, capture.observedAt);
    assert.equal(signal.raw.product.id, capture.products[0].id);
    assert.equal(signal.quantity, Number(capture.products[0].channelInventory.instoreItemQty));
    signals.push(signal);
  }
  const operational = JSON.parse(JSON.stringify(signals.map(row => canonicalizeSignal(row, bible))));
  const drops = buildDrops(operational, bibleLookup(bible.records), operational);
  assert.equal(new Set(drops.map(row => row.storeId)).size, 3);
  assert.deepEqual(new Set(drops.map(row => row.city)), new Set(['Sedona', 'Cottonwood', 'Benson']));
  assert.equal(buildCurrentInventoryAlertsFromDrops(drops).length, 3);
});
