import assert from 'node:assert/strict';
import test from 'node:test';

import { BourbonBible } from '../src/core/bible.mjs';
import { bibleLookup, publicSignal } from '../src/export-site-contract.mjs';

test('exact normalized bottle aliases beat broad fingerprint containment', async () => {
  const bible = await BourbonBible.load();
  assert.equal((bible.match('Four Roses Small Batch Bourbon 750ml')), null);
  assert.equal((bible.match('Bulleit Straight Bourbon 90 Proof 1.75L')?.record?.canonical), 'Bulleit Bourbon');
});

test('Mississippi Tupelo marketplace titles require exact curated aliases for distinct expressions', async () => {
  const bible = await BourbonBible.load();
  assert.equal(bible.match('BARDSTOWN BOURBON COMPANY DISCOVERY SERIES 750ml')?.record?.canonical, 'Bardstown Bourbon Discovery Series');
  assert.equal(bible.match('BLADE AND BOW STRAIGHT BOURBON 750ml')?.record?.canonical, 'Blade and Bow Bourbon');
  assert.equal(bible.match('WHISTLEPIG 6 YEAR PIGGYBACK BOURBON 750ml')?.record?.canonical, 'WhistlePig PiggyBack 6 Year Bourbon');
  assert.equal(bible.match('MICHTERS US 1 SMALL BATCH BOURBON 750ML')?.record?.canonical, "Michter's US 1 Straight Bourbon Small Batch");
});

test('Mississippi release-watch bottles require exact curated aliases', async () => {
  const bible = await BourbonBible.load();
  assert.equal(bible.match('Very Olde St. Nick Ancient Cask IMMACULATA')?.record?.canonical, 'Very Olde St. Nick Ancient Cask Immaculata');
  assert.equal(bible.match('Rare Perfection 9-Year-Old Kentucky Bourbon')?.record?.canonical, 'Rare Perfection 9 Year Bourbon');
  assert.equal(bible.match('ALLOCATED BOTTLES'), null);
});

test("Michter's 10 year rye source labels never collapse into the bourbon identity", async () => {
  const bible = await BourbonBible.load();
  assert.equal(bible.match("MICHTER'S 10Y KS RYE WHISKEY")?.record?.canonical, "Michter's 10 Year Rye");
  assert.equal(bible.match("Michter's 10Y KS Rye")?.record?.canonical, "Michter's 10 Year Rye");
  assert.equal(bible.match("Michter's 10Y Single Barrel")?.record?.canonical, "Michter's 10 Year Bourbon");
});

test('an exact raw source alias repairs a conflicting retained canonical id during site export', async () => {
  const sourceBible = await BourbonBible.load();
  const bible = bibleLookup(sourceBible.records);
  const rye = sourceBible.records.find((record) => record.canonical === "Michter's 10 Year Rye");
  const bourbon = sourceBible.records.find((record) => record.canonical === "Michter's 10 Year Bourbon");
  const eagleRare = sourceBible.records.find((record) => record.canonical === 'Eagle Rare 10 Year');
  assert.ok(rye && bourbon && eagleRare);
  const baseSignal = {
    state: 'NC',
    type: 'inventory',
    source: 'North Carolina ABC inventory',
    sourceUrl: 'https://abc.nc.gov/',
    locationName: 'Wake County ABC - 11360 Capital Blvd., Wake Forest, NC 27587',
    quantity: 1,
    observedAt: '2026-08-07T17:38:18.651Z',
    firstSeenAt: '2026-08-03T13:48:33.903Z',
  };
  const repaired = publicSignal({
    ...baseSignal,
    canonicalBottleId: bourbon.id,
    canonicalName: bourbon.canonical,
    rawName: "MICHTER'S 10Y KS RYE WHISKEY",
  }, bible);
  assert.equal(repaired.bottleName, rye.canonical);
  assert.equal(repaired.canonicalId, rye.id);

  const broadFingerprint = publicSignal({
    ...baseSignal,
    canonicalBottleId: eagleRare.id,
    canonicalName: eagleRare.canonical,
    rawName: 'four roses',
  }, bible);
  assert.equal(broadFingerprint.bottleName, eagleRare.canonical, 'lossy fingerprints must not override a valid canonical id');
  assert.equal(broadFingerprint.canonicalId, eagleRare.id);

  const guardedSignals = [
    { state: 'ID', eventType: 'store_inventory_result', raw: { sourceMatchStatus: 'source_name_kept:unmatched' } },
    { state: 'IA', eventType: 'store_delivery_snapshot', locationPrecision: 'store_level', raw: { sourceMatchStatus: 'source_name_kept:unmatched' } },
    { state: 'MD-MONTGOMERY', eventType: 'county_inventory_aggregate', locationPrecision: 'store_aggregate', raw: { sourceMatchStatus: 'source_name_kept:unmatched' } },
    { state: 'OH', eventType: 'store_inventory_result', raw: { sourceMatchStatus: 'source_name_kept:unmatched' } },
    { state: 'UT', eventType: 'board_inventory_aggregate', locationPrecision: 'board_warehouse', raw: { sourceMatchStatus: 'source_name_kept:unmatched' } },
  ];
  for (const guarded of guardedSignals) {
    const projected = publicSignal({
      ...baseSignal,
      ...guarded,
      canonicalBottleId: null,
      canonicalName: null,
      rawName: "MICHTER'S 10Y KS RYE WHISKEY",
    }, bible);
    assert.notEqual(projected.canonicalId, rye.id, `${guarded.state} source-name-only evidence must remain fail-closed`);
  }
});
