import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolveLabelFreeBottleArtwork as resolve } from './label-free-bottle-artwork';
import catalog from '../../assets/bottles/label-free-v5/catalog.json';
import seed from '../cellar/bottle-catalog-seed.json';

test('fifth batch adds thirty exact reviewed whiskey entries without guessing custom editions', () => {
  assert.equal(catalog.products.length, 30);
  assert.equal(new Set(catalog.products.map(p => p.id)).size, 30);
  assert.equal(catalog.shapes.length, 26);
  for (const product of catalog.products) {
    assert.equal(seed.find(p => p.id === product.id)?.name, product.name);
    assert.equal(resolve({bottleId:product.id}), product.shape);
    assert.equal(resolve({bottleName:product.name}), product.shape);
    assert.equal(resolve({bottleId:product.id,bottleName:product.name}), product.shape);
    assert.equal(resolve({bottleId:product.id,bottleName:product.name+' Unreviewed Edition'}), undefined);
    const evidence=catalog.reviewEvidence.find(e=>e.productIds.includes(product.id));
    assert.ok(evidence, product.id);
    assert.match(evidence.referenceUrl, /^https:\/\/abc2\.nc\.gov\/Pricing\/ViewItemDetails\/\d+$/);
    assert.match(evidence.referenceSha256, /^[a-f0-9]{64}$/);
  }
  assert.equal(catalog.products.some(p=>p.id==='bowmans-virginia'), false);
  assert.equal(resolve({bottleId:'bowmans-virginia'}), undefined);
});

test('reviewed physical closure and PET variants stay distinct', () => {
  assert.equal(resolve({bottleId:'rebel-100-6y-bottled-in-bond-single-barrel'}), 'rebel-six-bib-blue');
  assert.equal(resolve({bottleId:'rebel-stave-finish-pure-vanilla-single-barrel'}), 'rebel-burgundy');
  assert.equal(resolve({bottleId:'bb_1c4d78c9fee9f02c'}), 'rebel-burgundy');
  const variants=['single-barrel-series-tier-1-straight-bourbon','single-barrel-series-tier-1-straight-rye','single-barrel-series-tier-3-finished-bourbon','single-barrel-series-tier-3-finished-rye'];
  assert.deepEqual(variants.map(bottleId=>resolve({bottleId})), ['rare-tier-one-bourbon-blue','rare-tier-one-rye-green','rare-tier-three-bourbon-gray','rare-tier-three-rye-white']);
  assert.notEqual(resolve({bottleId:'jack-daniels-black-label-pet'}), resolve({bottleId:'jack-daniels-black-label-replica-square'}));
  assert.notEqual(resolve({bottleId:'bulleit-bourbon-pet'}), resolve({bottleName:'Bulleit Bourbon'}));
});

test('all twenty-six new exports match approved transparent hashes and provenance', () => {
  const base=new URL('../../assets/bottles/label-free-v5/', import.meta.url);
  const provenance=JSON.parse(readFileSync(new URL('provenance.json',base),'utf8'));
  const registry=readFileSync(new URL('./label-free-artwork-assets.ts',import.meta.url),'utf8');
  assert.equal(provenance.assets.length,26);
  assert.deepEqual(new Set(provenance.assets.map((a:{shape:string})=>a.shape)),new Set(catalog.shapes));
  let bytes=0;
  for (const asset of provenance.assets) {
    const png=readFileSync(new URL(asset.file,base));
    assert.equal(createHash('sha256').update(png).digest('hex'),asset.exportSha256);
    assert.equal(png[25],6,'RGBA required');
    assert.equal(png.readUInt32BE(16),asset.width);
    assert.equal(png.readUInt32BE(20),asset.height);
    assert.ok(asset.width<=540&&asset.height<=810);
    assert.equal(png.length,asset.bytes);bytes+=png.length;
    assert.match(asset.referenceUrl,/^https:\/\/abc2\.nc\.gov\//);
    assert.ok(registry.includes(`'${asset.shape}': require('../../assets/bottles/label-free-v5/${asset.file}')`));
  }
  assert.ok(bytes<6_000_000,'batch should stay below 6 MB');
  const brook=provenance.assets.find((a:{shape:string})=>a.shape==='brook-hill-pear-green');
  assert.match(brook.refinementPrompt,/Remove the opaque pale silver\/white paper band/);
});
