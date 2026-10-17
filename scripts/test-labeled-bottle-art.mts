import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { LABELED_BOTTLE_ARTWORK, resolveLabeledBottleArtwork: resolve } = require('../shared/labeled-bottle-artwork.ts') as typeof import('../shared/labeled-bottle-artwork');
import catalog from '../apps/mobile/src/cellar/bottle-catalog-seed.json';
import ownerCatalog from '../shared/labeled-owner-bottles.json';
import retailerNames from '../shared/labeled-artwork-retailer-names.json';
import feedProducts from '../shared/labeled-feed-bottles.json';
import feedFixture from './fixtures/feed-bottle-artwork-20261017.json';
import scannerFixture from './fixtures/feed-bottle-artwork-scanner-20261017.json';
const { catalogBottlePhoto } = require('../src/lib/bottle-photos.ts') as typeof import('../src/lib/bottle-photos');

test('every previously illustrated catalog and public owner bottle has labeled artwork', () => {
  const historical = [1,2,3,4,5,6].flatMap(n => JSON.parse(readFileSync(new URL(`../apps/mobile/assets/bottles/label-free-v${n}/catalog.json`, import.meta.url),'utf8')).products);
  const expected = [...historical,...ownerCatalog,...feedProducts].map(row => row.id).sort();
  assert.deepEqual(LABELED_BOTTLE_ARTWORK.entries.map(row => row.catalogId).sort(),expected);
  const fallback = readFileSync(new URL('../apps/mobile/src/components/CellarBottleSilhouette.tsx',import.meta.url),'utf8');
  assert.match(fallback,/neutral-labeled\.png/);
  assert.doesNotMatch(fallback,/LabelFreeBottleArtwork|label-free-artwork-assets/);
  const neutral = readFileSync(new URL('../apps/mobile/assets/bottles/neutral-labeled.png',import.meta.url));
  assert.equal(neutral.readUInt32BE(16),400);
  assert.equal(neutral.readUInt32BE(20),600);
  assert.equal(neutral[25],6);
});

test('labeled illustrations preserve exact catalog identities and immutable native/web assets', () => {
  const provenance = JSON.parse(readFileSync(new URL('../apps/mobile/assets/bottles/labeled-v1/provenance.json', import.meta.url), 'utf8'));
  const registry = readFileSync(new URL('../apps/mobile/src/components/labeled-artwork-assets.ts', import.meta.url), 'utf8');
  for (const row of LABELED_BOTTLE_ARTWORK.entries) {
    assert.equal([...catalog,...ownerCatalog,...feedProducts].find(bottle => bottle.id === row.catalogId)?.name, row.displayName);
    for (const identity of [{bottleId:row.catalogId}, {bottleId:`bible-${row.catalogId}`}, ...row.exactNames.map(bottleName => ({bottleName})), {bottleId:row.catalogId,bottleName:row.displayName}]) {
      assert.equal(resolve(identity, catalog)?.sha256, row.sha256);
    }
    const native = readFileSync(new URL(`../apps/mobile/assets/bottles/labeled-v1/${row.sha256}.png`, import.meta.url));
    assert.equal(createHash('sha256').update(native).digest('hex'), row.sha256);
    assert.deepEqual(readFileSync(new URL(`../public/bottle-artwork/${row.sha256}.png`, import.meta.url)), native);
    assert.equal(native.readUInt32BE(16),400);
    assert.equal(native.readUInt32BE(20),600);
    assert.equal(native[25],6,'RGBA export');
    assert.ok(registry.includes(`${row.sha256}.png`));
    assert.equal(provenance.assets.find((asset:{sha256:string})=>asset.sha256 === row.sha256)?.reviewed,true);
    const web = catalogBottlePhoto({id:row.catalogId,canonicalName:row.displayName});
    assert.equal(web?.sha256,row.sha256);
    assert.equal(web?.url,`https://www.bourbonsignal.com/bottle-artwork/${row.sha256}.png`);
  }
});

test('matching glass does not approve a different expression label', () => {
  const small = resolve({bottleId:'eh-taylor-small-batch'},catalog)!;
  const single = resolve({bottleId:'eh-taylor-single-barrel'},catalog)!;
  const rye = resolve({bottleId:'e-h-taylor-jr-straight-rye-whiskey'},catalog)!;
  assert.equal(new Set([small.sha256,single.sha256,rye.sha256]).size,3);
  assert.notEqual(resolve({bottleId:'michters-us-1-sour-mash-whiskey'},catalog)?.sha256, resolve({bottleId:'michters-us-1-small-batch-bourbon'},catalog)?.sha256);
  for (const identity of [
    {bottleId:'eh-taylor-single-barrel',bottleName:'E.H. Taylor Small Batch'},
    {bottleId:'eh-taylor-small-batch',bottleName:'E.H. Taylor Jr. Straight Rye Whiskey'},
    {bottleId:'michters-us-1-rye-whiskey',bottleName:"Michter's US*1 Small Batch Bourbon"},
    {bottleName:'E.H. Taylor'}, {bottleName:'E.H. Taylor Barrel Proof'},
    {bottleName:'Stagg Jr.'}, {canonicalKey:'batch small taylor'},
    {bottleId:'eagle-rare-10',bottleName:'Eagle Rare 17 Year'},
  ]) assert.equal(resolve(identity,catalog),undefined,JSON.stringify(identity));
});

test('retailer feed names and package suffixes resolve existing labeled artwork', () => {
  for (const [catalogId, names] of Object.entries(retailerNames)) {
    const expected = resolve({bottleId:catalogId}, catalog)!;
    assert.ok(expected, catalogId);
    for (const name of names) {
      assert.ok(expected.exactNames.includes(name), `Persist reviewed name: ${name}`);
      for (const suffix of ['', ' 750ml', ' 750 ml 750 ml', ' 1.75 L 1.75 L', ' .75L', ' - 750 Ml', ' - 1 LT']) {
        const bottleName = name + suffix;
        // Engine IDs are distinct from catalog IDs; both entry points matter.
        for (const bottleId of ['retailer-product-id', catalogId, `bible-${catalogId}`]) {
          assert.equal(resolve({bottleId, bottleName}, catalog)?.sha256, expected.sha256, bottleName);
        }
        assert.equal(catalogBottlePhoto({id:'retailer-product-id',canonicalName:bottleName})?.sha256, expected.sha256);
      }
    }
  }
  const hashes = new Map<string, string>();
  for (const row of LABELED_BOTTLE_ARTWORK.entries) for (const name of row.exactNames) {
    const key = name.trim().replace(/\s+/g, ' ').replace(/’/g, "'").toLowerCase();
    assert.ok(!hashes.has(key) || hashes.get(key) === row.sha256, `Conflicting artwork: ${name}`);
    hashes.set(key, row.sha256);
  }
});

test('observed collector reconstruction identities resolve on mobile and web', () => {
  for (const row of [...feedFixture.entries, ...scannerFixture.entries]) {
    const artwork = resolve(row, catalog);
    assert.ok(artwork, JSON.stringify(row));
    assert.equal(artwork.catalogId, row.expectedArtworkId, row.bottleName);
    assert.equal(catalogBottlePhoto({id:row.bottleId,canonicalName:row.bottleName})?.sha256,artwork.sha256);
  }
});

test('the three screenshot identities resolve, including literal retailer display names', () => {
  for (const [bottleId, bottleName, expected] of [
    ['74a75638e6ef11e2', 'Weller Antique 107 Barrel Select', 'weller-antique-107'],
    ['retailer-id', 'W.L Weller Special Reserve Bourbon', 'weller-special-reserve'],
    ['29a7ccd497a6d6c9', 'William Larue Weller Bourbon', 'william-larue-weller'],
  ]) assert.equal(resolve({bottleId, bottleName}, catalog)?.catalogId, expected);
  assert.notEqual(resolve({bottleName:'Little Book Whiskey Infinite'},catalog)?.sha256,
    resolve({bottleId:'little-book-the-infinite-ii'},catalog)?.sha256);
  assert.equal(resolve({bottleName:'Little Book The Infinite Edition IV'},catalog),undefined);
});

test('specific batch, proof and release labels never inherit another edition', () => {
  for (const ids of [
    ['barrell-bourbon-batch-032','barrell-bourbon-batch-034','barrell-bourbon-batch-036','barrell-bourbon-batch-037'],
    ['woodford-reserve-batch-proof-1195-2025','woodford-reserve-batch-proof-1212-2024','woodford-reserve-madeira-2024'],
    ['makers-mark-cellar-aged','makers-mark-cellar-aged-2026'],
    ['elijah-craig-barrel-proof','elijah-craig-private-barrel-barrel-proof'],
  ]) assert.equal(new Set(ids.map(bottleId => resolve({bottleId},catalog)?.sha256)).size,ids.length);
  for (const identity of [
    {bottleId:'barrell-bourbon-batch-036',bottleName:'Barrell Bourbon Batch 032'},
    {bottleId:'makers-mark-cellar-aged-2025',bottleName:"Maker's Mark Cellar Aged 2026 750ml"},
    {bottleId:'elijah-craig-barrel-proof-rye',bottleName:'Elijah Craig Private Barrel Barrel Proof'},
    {bottleName:'Barrell Bourbon Batch 039'},
    {bottleName:"Maker's Mark Cellar Aged 2027"},
    {bottleName:'Woodford Reserve Batch Proof 150.2 2027'},
  ]) assert.equal(resolve(identity,catalog),undefined,JSON.stringify(identity));
});

test('package cleanup retains age, proof, finish and stale-ID conflicts', () => {
  for (const identity of [
    {bottleId:'eh-taylor-single-barrel',bottleName:'Colonel E.H. Taylor Small Batch Bourbon 750ml'},
    {bottleId:'eagle-rare-10',bottleName:'Eagle Rare 17 Year 750ml'},
    {bottleId:'wild-turkey-rare-breed-rye',bottleName:'Wild Turkey Rare Breed Bourbon 750ml'},
    {bottleName:'Eagle Rare 10 Year Double Eagle Very Rare 750ml'},
    {bottleName:'1792 Full Proof 100 Proof 750ml'},
    {bottleName:'E.H. Taylor Barrel Proof 750ml'},
    {bottleName:'Michter\'s US 1 American Bourbon Whiskey 750 ml 750 ml'},
    {bottleName:'Elijah Craig Single Barrel 15 Year 750ml'},
    {canonicalKey:'batch small taylor'},
  ]) assert.equal(resolve(identity,catalog),undefined,JSON.stringify(identity));
});

test('labeled images take priority in the shared renderer, retaining its motion and sizing behavior', () => {
  const component = readFileSync(new URL('../apps/mobile/src/components/CellarBottleArtwork.tsx',import.meta.url),'utf8');
  assert.ok(component.indexOf('if (labeled)') < component.indexOf("if (bottle.bottleId?.startsWith('owner-')"));
  assert.doesNotMatch(component,/LabelFreeBottleArtwork|resolveLabelFreeBottleArtwork|label-free-artwork/);
  assert.match(component,/resolveLabeledBottleArtwork\(bottle, catalog\)/);
  const renderer = readFileSync(new URL('../apps/mobile/src/components/BottleArtworkImage.tsx',import.meta.url),'utf8');
  assert.match(renderer,/resizeMode="contain"/);
  assert.match(renderer,/if \(!detail \|\| reduceMotion \|\| !active\) return/);
  assert.match(renderer,/accessibilityElementsHidden/);
});
