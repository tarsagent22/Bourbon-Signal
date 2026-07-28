import assert from 'node:assert/strict';
import test from 'node:test';

import { BourbonBible } from '../src/core/bible.mjs';

test('exact normalized bottle aliases beat broad fingerprint containment', async () => {
  const bible = await BourbonBible.load();
  assert.equal((bible.match('Four Roses Small Batch Bourbon 750ml')), null);
  assert.equal((bible.match('Bulleit Straight Bourbon 90 Proof 1.75L')?.record?.canonical), 'Bulleit Bourbon');
});
