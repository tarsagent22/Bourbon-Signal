import assert from 'node:assert/strict';
import test from 'node:test';

import { BourbonBible } from '../src/core/bible.mjs';

test('exact normalized bottle aliases beat broad fingerprint containment', async () => {
  const bible = await BourbonBible.load();
  assert.equal((bible.match('Four Roses Small Batch Bourbon 750ml')), null);
  assert.equal((bible.match('Bulleit Straight Bourbon 90 Proof 1.75L')?.record?.canonical), 'Bulleit Bourbon');
});

test('Mississippi release-watch bottles require exact curated aliases', async () => {
  const bible = await BourbonBible.load();
  assert.equal(bible.match('Very Olde St. Nick Ancient Cask IMMACULATA')?.record?.canonical, 'Very Olde St. Nick Ancient Cask Immaculata');
  assert.equal(bible.match('Rare Perfection 9-Year-Old Kentucky Bourbon')?.record?.canonical, 'Rare Perfection 9 Year Bourbon');
  assert.equal(bible.match('ALLOCATED BOTTLES'), null);
});
