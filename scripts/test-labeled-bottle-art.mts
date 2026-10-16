import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { LABELED_BOTTLE_ARTWORK, resolveLabeledBottleArtwork: resolve } = require('../shared/labeled-bottle-artwork.ts') as typeof import('../shared/labeled-bottle-artwork');
import catalog from '../apps/mobile/src/cellar/bottle-catalog-seed.json';
const { catalogBottlePhoto } = require('../src/lib/bottle-photos.ts') as typeof import('../src/lib/bottle-photos');

test('labeled illustrations preserve exact catalog identities and immutable native/web assets', () => {
  const provenance = JSON.parse(readFileSync(new URL('../apps/mobile/assets/bottles/labeled-v1/provenance.json', import.meta.url), 'utf8'));
  const registry = readFileSync(new URL('../apps/mobile/src/components/labeled-artwork-assets.ts', import.meta.url), 'utf8');
  for (const row of LABELED_BOTTLE_ARTWORK.entries) {
    assert.equal(catalog.find(bottle => bottle.id === row.catalogId)?.name, row.displayName);
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

test('labeled images take priority in the shared renderer, retaining its motion and sizing behavior', () => {
  const component = readFileSync(new URL('../apps/mobile/src/components/CellarBottleArtwork.tsx',import.meta.url),'utf8');
  assert.ok(component.indexOf('if (labeled)') < component.indexOf('if (!shape'));
  assert.ok(component.indexOf('if (labeled)') < component.indexOf('if (shape)'));
  assert.match(component,/resolveLabeledBottleArtwork\(bottle, catalog\)/);
  const renderer = readFileSync(new URL('../apps/mobile/src/components/BottleArtworkImage.tsx',import.meta.url),'utf8');
  assert.match(renderer,/resizeMode="contain"/);
  assert.match(renderer,/if \(!detail \|\| reduceMotion \|\| !active\) return/);
  assert.match(renderer,/accessibilityElementsHidden/);
});
