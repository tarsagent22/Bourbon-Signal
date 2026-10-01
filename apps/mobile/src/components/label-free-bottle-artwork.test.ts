import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import seed from '../cellar/bottle-catalog-seed.json';
import { LABEL_FREE_PRODUCTS, resolveLabelFreeBottleArtwork as resolve } from './label-free-bottle-artwork';

test('first batch covers 16 exact catalog entries using five reusable shapes', () => {
  assert.equal(LABEL_FREE_PRODUCTS.length, 16);
  assert.equal(new Set(LABEL_FREE_PRODUCTS.map(product => product.shape)).size, 5);
  for (const product of LABEL_FREE_PRODUCTS) {
    const entry = seed.find(bottle => bottle.id === product.id);
    assert.equal(entry?.name, product.name, `${product.id} must remain a real exact catalog entry`);
    assert.equal(resolve({ bottleId: entry!.id, bottleName: entry!.name }), product.shape);
    assert.equal(resolve({ bottleId: entry!.id }), product.shape);
    assert.equal(resolve({ bottleName: entry!.name, canonicalKey: 'legacy lossy key' }), product.shape);
  }
});

test('unreviewed editions, sizes, generic brand names and lossy keys never inherit artwork', () => {
  for (const bottleName of ['Eagle Rare 12 Year', 'Eagle Rare 17 Year', 'Eagle Rare 25Y', 'George T. Stagg', "Michter's US*1 Unblended American Whiskey", "Michter's 10 Year Bourbon", "Blanton's Gold Bourbon", 'E.H. Taylor Cured Oak', 'E.H. Taylor Small Batch 1.75L', 'E.H. Taylor', 'Michter']) {
    assert.equal(resolve({ bottleName }), undefined, bottleName);
    assert.equal(resolve({ bottleId: 'eh-taylor-small-batch', bottleName }), undefined, `stale ID: ${bottleName}`);
  }
  assert.equal(resolve({ canonicalKey: 'eagle rare year' }), undefined);
  assert.equal(resolve({ bottleId: 'unknown', canonicalKey: 'stagg' }), undefined);
  assert.equal(resolve({ bottleId: 'stagg', bottleName: 'Eagle Rare 10 Year' }), undefined);
});

test('approved names normalize apostrophes and punctuation without importing ambiguous seed aliases', () => {
  assert.equal(resolve({ bottleName: 'E H Taylor Small Batch' }), 'taylor');
  assert.equal(resolve({ bottleName: 'Michter’s US*1 Small Batch Bourbon' }), 'michters');
  assert.equal(resolve({ bottleName: "Blanton's Original Single Barrel" }), 'blantons');
  assert.equal(resolve({ bottleName: 'Stagg Jr.' }), 'stagg');
  assert.equal(resolve({ bottleName: 'EHT' }), undefined);
});

test('bundled first batch overrides photo fetching and exports have alpha and recorded provenance', () => {
  const component = readFileSync(new URL('./CellarBottleArtwork.tsx', import.meta.url), 'utf8');
  assert.match(component, /if \(shape\) return <LabelFreeBottleArtwork/);
  assert.ok(component.indexOf('if (shape)') < component.indexOf('return <LegacyBottleArtwork'));
  const directory = new URL('../../assets/bottles/label-free-v1/', import.meta.url);
  const provenance = JSON.parse(readFileSync(new URL('provenance.json', directory), 'utf8'));
  assert.equal(provenance.assets.length, 5);
  let bytes = 0;
  for (const asset of provenance.assets) {
    const png = readFileSync(new URL(asset.file, directory));
    assert.equal(png.readUInt32BE(16), asset.width);
    assert.equal(png.readUInt32BE(20), asset.height);
    assert.equal(png[25], 6, 'PNG RGBA transparency required');
    assert.equal(png.length, asset.bytes);
    bytes += png.length;
  }
  assert.ok(bytes < 2_000_000, 'five assets should remain under 2 MB total');
});
