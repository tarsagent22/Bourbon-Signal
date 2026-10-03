import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import seed from '../cellar/bottle-catalog-seed.json';
import secondBatch from '../../assets/bottles/label-free-v2/catalog.json';
import thirdBatch from '../../assets/bottles/label-free-v3/catalog.json';
import fourthBatch from '../../assets/bottles/label-free-v4/catalog.json';
import fifthBatch from '../../assets/bottles/label-free-v5/catalog.json';
import { FIRST_BATCH_PRODUCTS, LABEL_FREE_PRODUCTS, resolveLabelFreeBottleArtwork as resolve } from './label-free-bottle-artwork';

test('first batch covers 16 exact catalog entries with corrected physical variants', () => {
  assert.equal(FIRST_BATCH_PRODUCTS.length, 16);
  assert.equal(new Set(FIRST_BATCH_PRODUCTS.map(product => product.shape)).size, 6);
  for (const product of FIRST_BATCH_PRODUCTS) {
    const entry = seed.find(bottle => bottle.id === product.id);
    assert.equal(entry?.name, product.name, `${product.id} must remain a real exact catalog entry`);
    assert.equal(resolve({ bottleId: entry!.id, bottleName: entry!.name }), product.shape);
    assert.equal(resolve({ bottleId: entry!.id }), product.shape);
    assert.equal(resolve({ bottleName: entry!.name, canonicalKey: 'legacy lossy key' }), product.shape);
  }
});

test('second batch adds 59 exact products with 10 shapes, preserving all first-batch mappings', () => {
  assert.equal(secondBatch.products.length, 59);
  assert.equal(secondBatch.shapes.length, 10);
  assert.ok(LABEL_FREE_PRODUCTS.length <= seed.length);
  assert.equal(new Set(LABEL_FREE_PRODUCTS.map(product => product.id)).size, LABEL_FREE_PRODUCTS.length);
  assert.ok(new Set(LABEL_FREE_PRODUCTS.map(product => product.shape)).size > 37);
  for (const product of secondBatch.products) {
    const entry = seed.find(bottle => bottle.id === product.id);
    assert.equal(entry?.name, product.name, `${product.id}: exact catalog name required`);
    assert.equal(resolve({ bottleId: product.id, bottleName: product.name }), product.shape);
    assert.equal(resolve({ bottleName: product.name }), product.shape);
    assert.equal(resolve({ bottleId: product.id }), product.shape);
    assert.equal(resolve({ bottleId: product.id, bottleName: 'Unreviewed custom bottle' }), undefined);
  }
});

test('similar brands, unreviewed shapes and other sizes are excluded; distinct shapes never collide', () => {
  for (const bottleName of ['Unreleased 1792 Custom Finish', 'Buffalo Trace Bourbon 1.75L', 'Knob Creek 9 Year 375 ml']) {
    assert.equal(resolve({ bottleName }), undefined, bottleName);
  }
  assert.equal(resolve({ bottleId: 'makers-mark-46', bottleName: "Maker's Mark" }), undefined);
  assert.equal(resolve({ bottleId: 'woodford-double-oaked', bottleName: 'Woodford Reserve Bourbon' }), undefined);
  assert.equal(resolve({ bottleId: 'four-roses-small-batch', bottleName: 'Four Roses Single Barrel' }), undefined);
  assert.equal(resolve({ canonicalKey: 'batch small roses' }), undefined);
});

test('second-batch transparent exports match their recorded hashes and fit three-times detail resolution', () => {
  const directory = new URL('../../assets/bottles/label-free-v2/', import.meta.url);
  const provenance = JSON.parse(readFileSync(new URL('provenance.json', directory), 'utf8'));
  assert.equal(provenance.assets.length, 10);
  assert.deepEqual(new Set(provenance.assets.map((asset: {shape: string}) => asset.shape)), new Set(secondBatch.shapes));
  let bytes = 0;
  for (const asset of provenance.assets) {
    const png = readFileSync(new URL(asset.file, directory));
    assert.equal(createHash('sha256').update(png).digest('hex'), asset.exportSha256);
    assert.equal(png.readUInt32BE(16), asset.width);
    assert.equal(png.readUInt32BE(20), asset.height);
    assert.equal(png[25], 6, 'RGBA alpha required');
    assert.ok(asset.width <= 540 && asset.height <= 810);
    assert.equal(png.length, asset.bytes);
    bytes += png.length;
  }
  assert.ok(bytes < 3_500_000, 'second batch should stay below 3.5 MB');
});

test('unreviewed editions, sizes, generic brand names and lossy keys never inherit artwork', () => {
  for (const bottleName of ['E.H. Taylor Small Batch 1.75L', 'E.H. Taylor', 'Michter Custom Release']) {
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
  assert.doesNotMatch(component, /LegacyBottleArtwork|useBottlePhoto|assets\/bottles\/photos/);
  assert.match(component, /<CellarBottleSilhouette size=\{size\}/);
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

test('third batch adds 97 reviewed entries and never guesses unusual editions or packaging',()=>{
 assert.equal(thirdBatch.products.length,97);
 assert.equal(thirdBatch.shapes.length,23);
 for(const product of thirdBatch.products) {
  assert.equal(seed.find(entry=>entry.id===product.id)?.name,product.name);
  assert.equal(resolve({bottleId:product.id,bottleName:product.name}),product.shape);
  assert.equal(resolve({bottleName:product.name}),product.shape);
  assert.equal(resolve({bottleId:product.id}),product.shape);
  for(const name of ('names' in product ? product.names as string[] : [])) assert.equal(resolve({bottleName:name}),product.shape,name);
  assert.equal(resolve({bottleId:product.id,bottleName:'Custom unreviewed edition'}),undefined);
 }
 for(const bottleName of ['Penelope Estate Collection','Bulleit Bourbon 1.75L (PET)','Old Grand-Dad Custom Release']) assert.equal(resolve({bottleName}),undefined,bottleName);
 assert.equal(resolve({bottleName:'Eagle Rare 12 Year'}),'eagle-12');
 assert.equal(resolve({bottleId:'eagle-rare-10',bottleName:'Eagle Rare 12 Year'}),undefined);
});
test('third-batch exports and generated registry match every reviewed asset and catalog',()=>{
 const directory=new URL('../../assets/bottles/label-free-v3/',import.meta.url);
 const provenance=JSON.parse(readFileSync(new URL('provenance.json',directory),'utf8'));
 const registry=readFileSync(new URL('./label-free-artwork-assets.ts',import.meta.url),'utf8');
 const catalog=readFileSync(new URL('./label-free-artwork-catalog.ts',import.meta.url),'utf8');
 assert.equal(provenance.assets.length,23);
 assert.deepEqual(new Set(provenance.assets.map((asset:{shape:string})=>asset.shape)),new Set(thirdBatch.shapes));
 let bytes=0;
 for(const asset of provenance.assets) {
  const png=readFileSync(new URL(asset.file,directory));
  assert.equal(createHash('sha256').update(png).digest('hex'),asset.exportSha256);
  assert.equal(png[25],6,'true RGBA required');
  assert.equal(png.readUInt32BE(16),asset.width);
  assert.equal(png.readUInt32BE(20),asset.height);
  assert.ok(asset.width<=540&&asset.height<=810);
  assert.equal(png.length,asset.bytes); bytes+=png.length;
  assert.ok(registry.includes(`label-free-v3/${asset.file}`));
 }
 assert.ok(bytes<6_000_000,'batch3 below6MB');
 assert.equal((registry.match(/require\(/g)||[]).length,38+fourthBatch.shapes.length+fifthBatch.shapes.length);
 for(const batch of [1,2,3,4,5])assert.ok(catalog.includes(`label-free-v${batch}/catalog.json`));
 const fallback=readFileSync(new URL('./CellarBottleSilhouette.tsx',import.meta.url),'utf8');
 assert.match(fallback,/shape="neutral"/);
 assert.doesNotMatch(fallback,/styles\.label|useBottlePhoto/);
});

 test('every reviewed entry resolves exactly; unfinished entries retain the fallback',()=>{
  for(const reviewed of LABEL_FREE_PRODUCTS){
   const entry=seed.find(e=>e.id===reviewed.id)!;
   const product=LABEL_FREE_PRODUCTS.find(p=>p.id===entry.id);
   assert.ok(product,entry.name);
   assert.notEqual(product.shape,'neutral');
   assert.equal(resolve({bottleId:entry.id,bottleName:entry.name}),product.shape,entry.id);
   assert.equal(resolve({bottleId:entry.id}),product.shape,entry.id);
   assert.equal(resolve({bottleName:entry.name}),product.shape,entry.name);
   assert.equal(resolve({bottleId:entry.id,bottleName:'Uncataloged custom release'}),undefined);
  }
 });
