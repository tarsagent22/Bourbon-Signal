import assert from 'node:assert/strict';
import test from 'node:test';
import { BourbonBible } from '../src/core/bible.mjs';
import { collectNorthCarolinaShipments, ncReviewedProductMatch } from '../src/collectors/north-carolina-intelligence.mjs';
import { bibleLookup, buildDrops } from '../src/export-site-contract.mjs';

const sourceUrl = 'https://abc2.nc.gov/Search/StockShippedData';
// Exact product, board and quantity rows captured from the official extract on
// 2026-11-13. The extract is board-level evidence, never a store stock count.
const franklinRows = [['Bunn', 12], ['Franklinton', 12], ['Louisburg', 12], ['Youngsville', 24]]
  .map(([board, quantity]) => ({ ProductName: 'Old Forester King Ranch .75L', boardName: `${board} ABC Board`, NUMUNITS: quantity, NCcode: '17110', item_id: 183158 }));

test('reviewed King Ranch identity survives official packaging without loose family matches', async () => {
  const bible = await BourbonBible.load();
  for (const name of ['Old Forester King Ranch', 'Old Forester King Ranch .75L', 'Old Forester King Ranch 750ML']) {
    assert.equal(ncReviewedProductMatch(name, bible)?.record.canonical, 'Old Forester King Ranch', name);
  }
  for (const name of ['Old Forester', 'Old Forester King Ranch Experimental Finish .75L',
    'Old Forester King Ranch Cream .75L', 'King Ranch Cocktail .75L', 'Unknown Bourbon .75L']) {
    assert.equal(ncReviewedProductMatch(name, bible), null, name);
  }
});

test('catalog additions work without another NC allowlist edit; regular and ambiguous identities stay excluded', () => {
  const record = { id: 'reviewed', canonical: 'Example Harvest Bourbon', normalizedKey: 'example harvest', aliases: [], tier: 'limited' };
  assert.equal(ncReviewedProductMatch('Example Harvest Bourbon .75L', new BourbonBible([record]))?.record.id, 'reviewed');
  assert.equal(ncReviewedProductMatch('Example Harvest Bourbon .75L', new BourbonBible([{ ...record, tier: 'regular' }])), null);
  assert.equal(ncReviewedProductMatch('Example Harvest Bourbon .75L', new BourbonBible([record, { ...record, id: 'conflict' }])), null);
  assert.equal(ncReviewedProductMatch('Example Harvest Rye .75L', new BourbonBible([record])), null);
});

test('official Franklin County rows become exact King Ranch board shipment cards', async (t) => {
  const bible = await BourbonBible.load();
  const extractDatetime = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const records = [...franklinRows, { ...franklinRows[0], ProductName: 'Old Forester King Ranch Experimental Finish .75L', NCcode: '99999' }];
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, sourceUrl);
    const response = Response.json({ metadata: { extractDatetime }, lookups: { boards: franklinRows.map(row => row.boardName), products: [] }, records });
    Object.defineProperty(response, 'url', { value: sourceUrl });
    return response;
  });
  const result = await collectNorthCarolinaShipments(bible);
  assert.equal(result.signals.length, 4);
  assert.equal(result.accounting.trackedSignalCount, 4);
  for (const signal of result.signals) {
    assert.equal(signal.canonicalName, 'Old Forester King Ranch');
    assert.equal(signal.eventType, 'nc_board_shipment_snapshot');
    assert.equal(signal.locationPrecision, 'board_county');
    assert.equal(signal.canAlertAsInventory, false);
    assert.equal(signal.ncCode, '17110');
    assert.match(signal.inventorySemantics, /exact store and shelf status remain unknown/);
  }
  const drops = buildDrops(result.signals, bibleLookup(bible.records), result.signals);
  assert.equal(drops.length, 4);
  assert.deepEqual(drops.map(drop => drop.boardShipmentQuantity).sort((a, b) => a - b), [12, 12, 12, 24]);
  for (const drop of drops) {
    assert.equal(drop.bottleName, 'Old Forester King Ranch');
    assert.equal(drop.eligibleForDropFeed, true);
    assert.equal(drop.availabilityScope, 'board');
    assert.equal(drop.canAlertAsInventory, false);
    assert.match(drop.inventoryCaveat, /does not prove an exact store/i);
  }
});
