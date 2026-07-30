import assert from 'node:assert/strict';
import test from 'node:test';

import { BourbonBible } from '../src/core/bible.mjs';

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
