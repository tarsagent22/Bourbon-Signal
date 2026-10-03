import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import batch from '../../assets/bottles/label-free-v6/catalog.json';
import seed from '../cellar/bottle-catalog-seed.json';
import { resolveLabelFreeBottleArtwork as resolve, labelFreeArtworkCaption as caption } from './label-free-bottle-artwork';

test('remaining whiskey worklist has 36 reviewed entries and excludes the vodka', () => {
  assert.equal(batch.products.length, 36);
  assert.equal(new Set(batch.products.map(p => p.id)).size, 36);
  assert.equal(batch.excluded[0].id, 'bowmans-virginia');
  assert.equal(resolve({ bottleId: 'bowmans-virginia', bottleName: "Bowman's Virginia" }), undefined);
  for (const product of batch.products) {
    assert.equal(seed.find(p => p.id === product.id)?.name, product.name);
    const identity = { bottleId: product.id, bottleName: product.name };
    assert.equal(resolve(identity), product.shape);
    assert.equal(resolve({ bottleName: product.name }), product.shape);
    assert.equal(resolve({ bottleId: product.id, bottleName: 'Unreviewed custom edition' }), undefined);
    assert.equal(caption({ bottleId: product.id, bottleName: 'Unreviewed custom edition' }), undefined);
    assert.ok(product.reviewEvidence.decision);
  }
});

test('family names and unverified packaging disclose the artwork limitation', () => {
  let families = 0, illustrative = 0, exact = 0;
  for (const product of batch.products) {
    const presentation = 'presentation' in product ? product.presentation : 'exact';
    const identity = { bottleId: product.id, bottleName: product.name };
    if (presentation === 'collection') {
      families++;
      assert.equal(caption(identity), 'Collection artwork · edition not specified');
    } else if (presentation === 'representative') {
      illustrative++;
      assert.equal(product.id, 'dry-fly-dawn-till-dusk-wheat-whiskey');
      assert.equal(caption(identity), 'Illustrative bottle · packaging not verified');
    } else { exact++; assert.equal(caption(identity), undefined); }
  }
  assert.deepEqual([exact, families, illustrative], [25, 10, 1]);
  assert.equal(caption({ bottleId: 'bb_00de3ec6e1619105', bottleName: "Maker's Mark 46" }), undefined);
  assert.equal(resolve({ bottleName: 'Willett Family Estate Custom Finish' }), undefined);
});

test('all new originals retain transparent PNGs and recorded export hashes', () => {
  const directory = new URL('../../assets/bottles/label-free-v6/', import.meta.url);
  const provenance = JSON.parse(readFileSync(new URL('provenance.json', directory), 'utf8'));
  assert.equal(provenance.assets.length, 21);
  assert.deepEqual(new Set(provenance.assets.map((p: {shape: string}) => p.shape)), new Set(batch.shapes));
  let bytes = 0;
  for (const asset of provenance.assets) {
    const png = readFileSync(new URL(asset.file, directory));
    assert.equal(createHash('sha256').update(png).digest('hex'), asset.exportSha256);
    assert.equal(png[25], 6);
    assert.ok(asset.width <= 540 && asset.height <= 810);
    assert.ok(asset.referenceUrl);
    bytes += png.length;
  }
  assert.ok(bytes < 8_000_000);
});
