import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { standardBottleIdentity, standardBottleName } = require('../shared/standard-bottle-identity.ts') as typeof import('../shared/standard-bottle-identity');
const { resolveLabeledBottleArtwork } = require('../shared/labeled-bottle-artwork.ts') as typeof import('../shared/labeled-bottle-artwork');
const { cleanBrandName, getDisplayName } = require('../src/lib/drops.ts') as typeof import('../src/lib/drops');
const { normalizeDropSignal } = require('../src/lib/signals/signal-contract.ts') as typeof import('../src/lib/signals/signal-contract');
const catalog = require('../apps/mobile/src/cellar/bottle-catalog-seed.json');
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
    assert.deepEqual([signal.bottle.id, signal.bottle.name], ['retailer-id', name]);
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
    'Buffalo Trace Straight Rye Bourbon',
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

test('numbered Binny’s toasted picks show the Toasted Barrel image and keep their original identities', () => {
  const base = resolveLabeledBottleArtwork({bottleId:'elijah-craig-toasted-barrel'});
  assert.ok(base);
  for (const barrel of ['471088', '471170', '471228', '472001']) {
    const bottleName = `Elijah Craig Barrel Proof Bourbon Single Toasted Barrel # ${barrel} Women of Binny’s Handpicked`;
    const bottleId = `retailer-${barrel}`;
    assert.equal(standardBottleIdentity(bottleName, bottleId), undefined);
    assert.equal(standardBottleName(bottleName), bottleName);
    assert.equal(resolveLabeledBottleArtwork({bottleId,bottleName}, catalog)?.sha256, base.sha256);
    assert.equal(resolveLabeledBottleArtwork({bottleId:'elijah-craig-toasted-barrel-private-barrel',bottleName}, catalog)?.sha256, base.sha256);
    assert.equal(resolveLabeledBottleArtwork({bottleId:'elijah-craig-barrel-proof-rye',bottleName}, catalog), undefined);
  }
});

test('artwork-only pick fallback keeps the age, recipe and release intact', () => {
  for (const [bottleName, catalogId] of [
    ['Buffalo Trace Straight Bourbon Store Pick', 'buffalo-trace-bourbon'],
    ['1792 Full Proof - Barrel Pick # 820 750ml', '1792-full-proof'],
    ["Weller Full Proof Binny's Handpicked", 'weller-full-proof'],
    ['Weller Full Proof (Store Pick)', 'weller-full-proof'],
    ['Four Roses Single Barrel # AB-37 Handpicked', 'four-roses-single-barrel'],
    ["Elijah Craig Barrel Proof Single Barrel # 8888999 Binny's Handpicked", 'elijah-craig-private-barrel-barrel-proof'],
  ]) {
    assert.equal(standardBottleIdentity(bottleName), undefined);
    assert.equal(resolveLabeledBottleArtwork({bottleName}, catalog)?.catalogId, catalogId);
  }
  assert.equal(resolveLabeledBottleArtwork({bottleName:'Four Roses Single Barrel OBSK Barrel Pick'}, catalog)?.catalogId, 'four-roses-single-barrel-obsk');
  for (const bottleName of [
    'Eagle Rare 13 Year Store Pick',
    'Weller Full Proof Rye Barrel Pick',
    '1792 Full Proof Port Finished - Barrel Pick',
    'Jack Daniels 10 Year Batch 4 Handpicked',
    'Yellowstone Handpicked 113 Proof',
  ]) {
    assert.equal(resolveLabeledBottleArtwork({bottleName}, catalog), undefined, bottleName);
  }
});

test('every captured inventory identity has one standard name and exact reviewed artwork', () => {
  const fleet = JSON.parse(readFileSync(new URL('./fixtures/feed-bottle-reconciliation-20261031.json', import.meta.url), 'utf8'));
  assert.equal(fleet.entries.length, 274);
  for (const row of fleet.entries) {
    const expected = {id:row.standardId, name:row.standardName};
    assert.deepEqual(standardBottleIdentity(row.bottleName, row.bottleId), expected, row.bottleName);
    const signal = normalizeDropSignal({id:'retained-event', canonical_id:row.bottleId, canonical_name:row.bottleName, quantity:3, retail_price:64.99});
    assert.equal(signal.bottle.id, row.bottleId, 'Do not rewrite durable source links');
    assert.equal(signal.bottle.name, row.standardName, row.bottleName);
    assert.equal(signal.availability?.quantity, 3);
    assert.equal(signal.availability?.price, 64.99);
    for (const bottleName of [row.bottleName, row.standardName]) {
      assert.equal(resolveLabeledBottleArtwork({bottleId:row.bottleId,bottleName}, catalog)?.sha256, row.expectedArtworkSha256, bottleName);
    }
  }
});

test('an explicit batch is a separate library identity and unknown releases remain unresolved', () => {
  const batch3 = standardBottleIdentity('Jack Daniels 10 Year Batch 3 700ml');
  assert.deepEqual(batch3, {id:'jack-daniels-10-year-batch-3',name:"Jack Daniel's 10 Year Batch 3"});
  assert.notEqual(resolveLabeledBottleArtwork({bottleName:batch3!.name})?.sha256,
    resolveLabeledBottleArtwork({bottleId:'jack-daniels-10-year'})?.sha256);
  for (const bottleName of ['Jack Daniels 10 Year Batch 4 700ml','Basil Hayden 10 Year 90 Proof',
    'W.L. Weller Full Proof Kentucky Straight Bourbon Whiskey 115 Proof', 'Penelope Havana Rye']) {
    assert.equal(standardBottleIdentity(bottleName), undefined, bottleName);
    assert.equal(resolveLabeledBottleArtwork({bottleName}), undefined, bottleName);
  }
});

test('recent live catalogue additions have producer-reviewed names and expression artwork', () => {
  const additions = JSON.parse(readFileSync(new URL('./fixtures/catalog-bottle-reconciliation-20261031.json', import.meta.url), 'utf8'));
  assert.equal(additions.entries.length, 5);
  for (const row of additions.entries) {
    assert.deepEqual(standardBottleIdentity(row.bottleName, row.bottleId), {id:row.standardId,name:row.standardName});
    assert.equal(resolveLabeledBottleArtwork(row, catalog)?.sha256, row.expectedArtworkSha256, row.bottleName);
  }
  for (const bottleName of ['Barrell Toasted Vantage', 'Girl Dad Bourbon 8 Year',
    '291 Single Barrel Rye', 'Conviction 1929 Toast Cask',
    'Penelope Estate Collection Private Select 21% Rye']) {
    assert.equal(standardBottleIdentity(bottleName), undefined, bottleName);
    assert.equal(resolveLabeledBottleArtwork({bottleName}), undefined, bottleName);
  }
});
