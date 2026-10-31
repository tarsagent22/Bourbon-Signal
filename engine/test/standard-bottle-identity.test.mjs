import assert from 'node:assert/strict';
import test from 'node:test';
import { BourbonBible } from '../src/core/bible.mjs';
import { integrateLibraryCatalog } from '../src/core/library-catalog.mjs';
import { standardInventoryBottleName } from '../src/core/standard-bottle-identity.mjs';

test('new inventory titles match reviewed library expressions before legacy containment', () => {
  const records = [
    ['eagle-rare-12', 'Eagle Rare 12 Year', 'Eagle Rare 12yr Bourbon - 750 ML (limited quantities may be available in store)'],
    ['old-fitzgerald-7y-bottled-in-bond', 'Old Fitzgerald 7Y Bottled in Bond', 'Old Fitzgerald Bourbon Bib 7 Year Whiskey - 700 Ml (limited quantities may be available in store)'],
    ['eh-taylor-small-batch', 'E.H. Taylor Small Batch', 'E.H. Taylor Small Batch Kentucky Straight Bourbon Whiskey 100 Proof - 750 Ml (limited quantities may be available in store)'],
    ['buffalo-trace-bourbon', 'Buffalo Trace Bourbon', 'Buffalo Trace Straight Bourbon - 750 ml'],
  ];
  const catalog = { records:records.map(([id,canonicalName]) => ({id,canonicalName,aliases:[],nationalTier:'allocated',stateOverrides:[]})) };
  const bible = new BourbonBible(integrateLibraryCatalog([], catalog));
  for (const [id,name,title] of records) {
    assert.equal(bible.match(title)?.record.id, id, title);
    assert.equal(standardInventoryBottleName(title), name);
  }
  for (const title of ['Eagle Rare 13yr Bourbon', 'Old Fitzgerald Bourbon BiB 8 Year Whiskey', 'E.H. Taylor Small Batch Kentucky Straight Bourbon Whiskey 110 Proof']) assert.equal(bible.match(title), null, title);
});
