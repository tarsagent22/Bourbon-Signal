import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { standardBottleIdentity, standardBottleName } = require('../shared/standard-bottle-identity.ts') as typeof import('../shared/standard-bottle-identity');
const { resolveLabeledBottleArtwork } = require('../shared/labeled-bottle-artwork.ts') as typeof import('../shared/labeled-bottle-artwork');
const { cleanBrandName, getDisplayName } = require('../src/lib/drops.ts') as typeof import('../src/lib/drops');
const { normalizeDropSignal } = require('../src/lib/signals/signal-contract.ts') as typeof import('../src/lib/signals/signal-contract');
import { retailerBottleIdentityKey, createStandardBottleIndex } from '../shared/retailer-bottle-name.mjs';

const examples = [
  ['Eagle Rare 12yr Bourbon - 750 ML (limited quantities may be available in store)', 'eagle-rare-12', 'Eagle Rare 12 Year'],
  ['Old Fitzgerald Bourbon Bib 7 Year Whiskey - 700 Ml (limited quantities may be available in store)', 'old-fitzgerald-7y-bottled-in-bond', 'Old Fitzgerald 7Y Bottled in Bond'],
  ['Buffalo Trace Straight Bourbon -', 'buffalo-trace-bourbon', 'Buffalo Trace Bourbon'],
  ['E.H. Taylor Small Batch Kentucky Straight Bourbon Whiskey 100 Proof - 750 Ml (limited quantities may be available in store)', 'eh-taylor-small-batch', 'E.H. Taylor Small Batch'],
  ['Weller Full Proof -', 'weller-full-proof', 'W.L. Weller Full Proof'],
] as const;

test('literal screenshot titles use library name, identity and existing artwork throughout the feed', () => {
  for (const [rawName, id, name] of examples) {
    assert.deepEqual(standardBottleIdentity(rawName), { id, name });
    assert.equal(standardBottleName(rawName), name);
    assert.equal(cleanBrandName(rawName), name);
    assert.equal(getDisplayName({ canonical_name:rawName, brand_name:rawName } as never), name);
    const signal = normalizeDropSignal({ id:'existing-event', bottle_id:'retailer-id', canonical_name:rawName, raw_name:rawName, store_id:'343', retail_price:54.99 });
    assert.deepEqual([signal.bottle.id, signal.bottle.name], [id, name]);
    assert.equal(signal.id, 'trusted_source:existing-event');
    assert.equal(resolveLabeledBottleArtwork({bottleId:'retailer-id',bottleName:rawName})?.catalogId, id);
    assert.equal(resolveLabeledBottleArtwork({bottleId:id,bottleName:rawName})?.catalogId, id);
  }
});

test('future size, punctuation, age abbreviations and availability variants reuse reviewed identities', () => {
  for (const [name, id] of examples) for (const suffix of ['', ' 750 ml', ' - 1.75 L', ' 700ml (limited quantities may be available in store)']) {
    assert.equal(standardBottleIdentity(name + suffix)?.id, id, name + suffix);
  }
  assert.equal(standardBottleIdentity('Eagle Rare 12 yrs Bourbon 750ml')?.id, 'eagle-rare-12');
  assert.equal(standardBottleIdentity('Old Fitzgerald Bourbon BiB 7 Yr Whiskey')?.id, 'old-fitzgerald-7y-bottled-in-bond');
  assert.equal(standardBottleName('Unreviewed New Whiskey - 750 ML (limited quantities may be available in store)'), 'Unreviewed New Whiskey');
});

test('noise cleanup keeps ages, proofs, editions, finishes and store picks distinct', () => {
  for (const name of [
    'Eagle Rare 13yr Bourbon - 750ml',
    'E.H. Taylor Small Batch Kentucky Straight Bourbon Whiskey 110 Proof - 750 Ml',
    'Buffalo Trace Straight Rye Bourbon', 'Buffalo Trace Straight Bourbon Store Pick',
    'Old Fitzgerald Bourbon BiB 8 Year Whiskey',
    'Eagle Rare 12 Year Bourbon Port Finished',
    'Eagle Rare 12 Year Bourbon Limited Edition 2027',
  ]) {
    assert.equal(standardBottleIdentity(name), undefined, name);
    assert.equal(resolveLabeledBottleArtwork({bottleName:name}), undefined, name);
  }
  assert.notEqual(standardBottleIdentity('Eagle Rare 10 Year')?.id, standardBottleIdentity('Eagle Rare 12 Year')?.id);
  assert.equal(standardBottleIdentity(examples[0][0], 'eagle-rare-10'), undefined);
  assert.equal(resolveLabeledBottleArtwork({bottleId:'eagle-rare-10',bottleName:examples[0][0]}), undefined);
  assert.notEqual(retailerBottleIdentityKey('Whiskey 100.5 Proof'), retailerBottleIdentityKey('Whiskey 100 Proof'));
  const conflict = createStandardBottleIndex([
    { catalogId:'one', displayName:'One',exactNames:['Same 750ml'],sha256:'a' },
    { catalogId:'two', displayName:'Two',exactNames:['Same'],sha256:'b' },
  ]);
  assert.equal(conflict.get(retailerBottleIdentityKey('Same 700ml')), null);
});
