import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BourbonBible } from '../src/core/bible.mjs';
import { binnysBottleMatch, binnysProductRelevant, collectIllinois } from '../src/collectors/precision-probes.mjs';
import { canonicalizeSignal } from '../src/operational-report.mjs';
import { bibleLookup, buildCurrentInventoryAlertsFromDrops, buildDrops, isActiveCustomerStateRow } from '../src/export-site-contract.mjs';

const capture = JSON.parse(await readFile(new URL('./fixtures/illinois-binnys/2026-10-22-page0.json', import.meta.url), 'utf8'));
const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));
const lookup = bibleLookup(bible.records);
const reviewed = new Map([
  ['982098', { canonical: 'Heaven Hill Bottled-in-Bond 7 Year', publicRows: 46 }],
  ['190801', { canonical: "Blanton's Original Single Barrel", publicRows: 2 }],
]);

async function collect(products = capture.products, stores = capture.stores) {
  return collectIllinois({ id: 'IL' }, bible, {
    observedAt: capture.capturedAt,
    sleep: async () => {},
    query: async (index, params) => {
      if (index === 'Stores_Production') return { hits: structuredClone(stores) };
      if (params.query) return { hits: [], nbPages: 0, nbHits: 0 };
      // Replay the single 200-hit diagnostic capture at the collector's normal
      // 100-hit page size. No uncaptured pages or network calls are simulated.
      return { hits: structuredClone(products.slice(params.page * 100, (params.page + 1) * 100)), nbPages: Math.ceil(products.length / 100), nbHits: products.length };
    },
  });
}

function project(signals) {
  const operational = JSON.parse(JSON.stringify(signals.map((row) => canonicalizeSignal(row, bible))));
  const drops = buildDrops(operational, lookup, operational).filter((row) => isActiveCustomerStateRow(row));
  return { operational, drops, alerts: buildCurrentInventoryAlertsFromDrops(drops) };
}

function setCaptureClock(t, offsetMs = 5 * 60_000) {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(capture.capturedAt) + offsetMs });
}

test('captured Binny exact identities add 48 public rows and alert candidates under production policy', async (t) => {
  setCaptureClock(t);
  const source = await collect();
  const { operational, drops, alerts } = project(source.signals);
  // Before this change, replaying the same capture through the source collector,
  // canonicalization, JSON snapshot and production exporter yielded 87 / 87.
  assert.equal(drops.length, 135);
  assert.equal(alerts.length, 135);
  let gained = 0;
  for (const [id, expected] of reviewed) {
    const product = capture.products.find((row) => row.objectID === id);
    const match = binnysBottleMatch(product.productName, bible, product);
    assert.equal(match.record.canonical, expected.canonical);
    assert.equal(match.match.method, 'reviewed-binnys-product-identity');
    // The production retailer projection deliberately uses source title IDs.
    // Check its unchanged source URL and name against the canonical source rows.
    const candidates = drops.filter((row) => row.sourceUrl === product.productUrl);
    assert.equal(candidates.length, expected.publicRows);
    assert.equal(alerts.filter((row) => row.sourceUrl === product.productUrl).length, expected.publicRows);
    assert.ok(candidates.every((row) => row.canonicalName === product.productName));
    assert.ok(candidates.every((row) => row.observedAt === capture.capturedAt && row.canAlertAsInventory));
    assert.ok(candidates.every((row) => /retailer|verify/i.test(row.inventorySemantics)));
    assert.ok(source.signals.filter((row) => row.canonicalBottleId === match.record.id).every((row) => row.raw.product.objectID === id));
    assert.ok(operational.filter((row) => row.sourceUrl === product.productUrl).every((row) => row.canonicalBottleId === match.record.id));
    gained += candidates.length;
  }
  assert.equal(gained, 48);
  assert.equal(drops.length - gained, 87);
});

test('reviewed Binny identity requires the exact SKU, age, proof, bottle format and source URL', async (t) => {
  setCaptureClock(t);
  for (const id of reviewed.keys()) {
    const captured = capture.products.find((row) => row.objectID === id);
    const mutations = [
      (row) => { row.objectID = 'rejected-sku'; },
      (row) => { row.variantCode = 'rejected-sku'; },
      (row) => { row.variantCode = null; },
      (row) => { row.proof = Number(row.proof) + 1; },
      (row) => { delete row.proof; },
      (row) => { row.itemSize = '50ML'; },
      (row) => { row.itemSize = '375ML'; },
      (row) => { row.itemSize = '1.75L'; },
      (row) => { row.priceUnitLabel = '750 ml Gift Pack'; },
      (row) => { row.designations = ['Gift Pack']; },
      (row) => { row.productName += ' Gift Set with Glasses'; },
      (row) => { row.productName += ' Finished in Sherry Casks'; },
      (row) => { row.productName = row.productName.replace(/7 year old|Single Barrel/i, ''); },
      (row) => { row.shortDescription = 'Different product'; },
      (row) => { row.productUrl = row.productUrl.replace('www.binnys.com', 'unrelated.example'); },
      (row) => { row.productUrl = row.productUrl.replace(`-${id}/`, '-rejected-sku/'); },
      (row) => { row.productUrl += '?variant=rejected-sku'; },
      (row) => { row.productVarietal = 'Rye'; },
      (row) => { row.productType = 'Cream Liqueur'; },
    ];
    for (const mutate of mutations) {
      const product = structuredClone(captured);
      mutate(product);
      const result = await collect([product]);
      assert.equal(result.signals.filter((row) => /^retailer_store_inventory_/.test(row.eventType)).length, 0, JSON.stringify(product));
      assert.deepEqual(project(result.signals).drops, []);
      assert.deepEqual(project(result.signals).alerts, []);
    }
    assert.equal(binnysBottleMatch(captured.productName, bible).record, null, 'name alone cannot bypass reviewed SKU proof');
  }
});

test('Binny generic, distinct finish and unqualified edition identities remain rejected', () => {
  for (const name of [
    'Evan Williams Bourbon',
    'Hard Truth Bourbon Sweet Mash Double Oak',
    'Barrell Foundation Double Barrel Bourbon',
    'Four Roses Bourbon',
    'Henry McKenna Bourbon',
    'Henry McKenna 10 year old Single Barrel Bottled in Bond',
    'Old Fitzgerald Prime Bourbon',
    "Booker's Bourbon Southern Thunder 2026-3",
    "Baker's 7 Year Kentucky Straight Bourbon",
    'Small Batch 1792 Bottled in Bond Limited Release',
  ]) assert.equal(binnysBottleMatch(name, bible).record, null, name);
  assert.equal(binnysBottleMatch('Woodford Reserve Double Oaked Bourbon', bible).record?.canonical, 'Woodford Reserve Double Oaked Bourbon');
  assert.equal(binnysBottleMatch("Michter's US*1 Small Batch Bourbon", bible).record?.canonical, "Michter's US 1 Straight Bourbon Small Batch", 'The app library now supplies this exact expression identity');
  assert.equal(binnysBottleMatch('Evan Williams 1783 Bourbon', bible).record?.canonical, 'Evan Williams 1783 Bourbon');
  assert.equal(binnysProductRelevant({ productName: 'Buffalo Trace Bourbon Cream Liqueur', productVarietal: 'Bourbon' }, bible), false);
});

test('reviewed Binny products cannot turn absent stores, out of stock or stale observations into alerts', async (t) => {
  setCaptureClock(t);
  const products = capture.products.filter((row) => reviewed.has(row.objectID));
  const outsideStores = await collect(products, []);
  assert.deepEqual(project(outsideStores.signals).drops, []);
  const outOfStock = products.map((row) => ({
    ...structuredClone(row),
    storesPriceAndInventory: row.storesPriceAndInventory.map((inventory) => ({ ...inventory, purchaseAvailability: 0, stockMessageByStore: 'Out of Stock' })),
  }));
  assert.deepEqual(project((await collect(outOfStock)).signals).drops, []);
  const source = await collect(products);
  t.mock.timers.setTime(Date.parse(capture.capturedAt) + 3 * 60 * 60_000);
  const aged = project(source.signals);
  assert.equal(aged.drops.length, 48);
  assert.deepEqual(aged.alerts, []);
  t.mock.timers.setTime(Date.parse(capture.capturedAt) + 13 * 60 * 60_000);
  assert.deepEqual(project(source.signals).drops, []);
});
