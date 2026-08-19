import test from 'node:test';
import assert from 'node:assert/strict';

import { binnysBottleMatch, binnysProductRelevant } from '../src/collectors/precision-probes.mjs';

const elijahCraig = { id: 'elijah-craig-barrel-proof', canonical: 'Elijah Craig Barrel Proof' };

const bible = {
  match: () => null,
  scanText: (name) => String(name).includes('Elijah Craig Barrel Proof') ? [elijahCraig] : [],
};

test('Binny handpicked barrel names resolve only through an unambiguous alert-grade Bible identity', () => {
  const result = binnysBottleMatch("Elijah Craig Barrel Proof Single Barrel # 7364966 Binny's Handpicked", bible);
  assert.equal(result.record, elijahCraig);
  assert.equal(result.match.method, 'unique-alert-grade-bible-scan');
});

test('generic or unsafe Bible scan matches remain rejected', () => {
  const unsafeBible = {
    match: () => null,
    scanText: () => [{ id: 'michter', canonical: 'Michter' }],
  };
  assert.equal(binnysBottleMatch("Michter's US*1 Small Batch Bourbon", unsafeBible).record, null);
  assert.equal(binnysProductRelevant({ productName: 'Buffalo Trace Bourbon Cream Liqueur', productVarietal: 'Bourbon' }), false);
  assert.equal(binnysProductRelevant({
    productName: "Elijah Craig Barrel Proof Single Barrel # 7364966 Binny's Handpicked",
    productType: 'Whiskey',
    productVarietal: 'Bourbon',
    productDescriptionLong: 'Creamy vanilla from extended aging in oak.',
  }), true);
  assert.equal(binnysProductRelevant({
    productName: "Wild Turkey Master's Keep Voyage Bourbon Finished in Jamaican Rum Casks",
    productType: 'Whiskey',
    productVarietal: 'Bourbon',
  }), true);
  assert.equal(binnysProductRelevant({
    productName: 'Blood Oath Pact 11 Bourbon Finished in Anejo Tequila Barrels',
    productType: 'Whiskey',
    productVarietal: 'Bourbon',
  }), true);
  assert.equal(binnysProductRelevant({
    productName: 'Buffalo Trace Bourbon',
    productType: 'Liqueur',
    productVarietal: 'Cream',
  }), false);
});
