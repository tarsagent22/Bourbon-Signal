import assert from 'node:assert/strict';
import test from 'node:test';

import { idahoSafeBottleMatch } from '../src/collectors/precision-probes.mjs';
import { BourbonBible } from '../src/core/bible.mjs';

test('Idaho safely repairs live product-title variants back to the intended bottle identities', async () => {
  const bible = await BourbonBible.load();
  const cases = [
    ['Blanton Bourbon Single Barrel', /Blanton's Original Single Barrel/i],
    ['Eagle Rare 10yr Single Barrel Bourbon', /Eagle Rare 10 Year/i],
    ['Willett Family Estate 4yr Small Batch Bourbon', /Willett Family Estate/i],
    ['Old Fitzgerald 7yr Bottled In Bond', /Old Fitzgerald Bottled-in-Bond/i],
    ['Buffalo Trace Kentucky Straight Bourbon Barrel Select (Psb)', /Buffalo Trace Bourbon/i],
    ['E.H. Taylor JR. Single Barrel', /E\.H\. Taylor Single Barrel/i],
    ['Four Roses Single Barrel OBSK', /Four Roses Single Barrel Barrel Strength/i],
  ];

  for (const [rawName, canonical] of cases) {
    const result = idahoSafeBottleMatch(rawName, bible);
    assert.match(result.record?.canonical || '', canonical, rawName);
    assert.match(result.match?.method || '', /bible-scan|bible-alias|exact-normalized-alias/i, rawName);
  }
});

test('Idaho repair logic still fails closed on unsafe or unresolved bottle names', async () => {
  const bible = await BourbonBible.load();
  assert.equal(idahoSafeBottleMatch('Four Roses Single Barrel', bible).record, null);
  assert.equal(idahoSafeBottleMatch('Weller Millennium Blend Straight Whiskey', bible).record, null);
});
