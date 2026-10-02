import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolveLabelFreeBottleArtwork as resolve } from './label-free-bottle-artwork';
import catalog from '../../assets/bottles/label-free-v4/catalog.json';

const expected = {
  'buffalo-city-east-lake-bourbon': 'buffalo-city-amber-black',
  'buffalo-city-honey-roasted-almond-flavored-whiskey': 'buffalo-city-amber-black',
  'city-walk-bourbon': 'city-walk-bourbon-wood',
  'seventeen-twelve-bourbon': 'seventeen-twelve-natural',
  'end-of-days-survivors-cut-bourbon': 'end-days-natural',
  'ezra-brooks-90': 'ezra-ninety-black',
  'ry3-8y-rye-cask-strength': 'ry3-eight-green',
  'whiskey-jypsi-tribute-double-barrel-bourbon': 'jypsi-tribute-brown',
  'eagle-rare-25y': 'eagle-twentyfive-crystal',
  'benchmark-rye': 'benchmark-rye-black',
  'ben-holladay-8y-mo-whiskey-bourbon': 'holladay-eight-black',
  'woodinville-straight-bourbon-6y': 'woodinville-six-textured',
  'ezra-brooks-stave-finish-spice-and-clove': 'ezra-stave-black',
  'ezra-brooks-stave-fin-fr-oak-dk-chocolate': 'ezra-stave-black',
  "chicken-cock-private-cask": "chicken-private-etched",
  "hemingway-bourbon-whiskey": "hemingway-bourbon-black",
  "lonerider-bourbon-deadwood-cask-finish": "lonerider-deadwood-black",
  "montana-blackfoot-river-bourbon": "montana-blackfoot-metal",
  "nc-two-trees-wood-crafted-bourbon": "two-trees-crafted-black",
  "olde-raleigh-barrel-proof-bourbon": "raleigh-barrel-crystal",
  "on-your-six-usmc-250th-birthday-ed-bourbon": "on-six-anniversary-dark",
  "quinns-carolina-whiskey": "quinn-carolina-natural",
  "sergeants-valor-single-barrel-bourbon": "sergeant-valor-brown",
  "whiskey-row-bourbon-cask-strength": "whiskey-row-cask-black",
  "wyoming-whiskey-great-smoky-mountains": "wyoming-smoky-green",
  "zebs-american-straight-rye-whiskey": "zeb-rye-navy",
  "jim-beam-4y-trv": "jim-beam-traveler-white",
  "remus-6y-single-barrel": "remus-six-burgundy",
  "bardstown-bourbon-single-barrel-ncabc-btb": "bardstown-gold",
  "jim-beam-4y": "jim-beam-white",
  "minor-case-hand-selected-single-barrel": "minor-case",
  "parkers-heritage-collection-16th-editon": "parker-seventeen-black",
  "parkers-heritage-collection-19th-edition": "parker-seventeen-black",
  "rebel-distillers-collection": "rebel-burgundy",
  "rebel-full-proof-barrel-collection": "rebel-burgundy",
  "wyoming-whiskey-private-stock-ncabc-btb": "wyoming-private-black",
  "ezra-brooks-stave-finish-sweet-cinnamon": "ezra-stave-black",
} as const;

test('reviewed whiskey phase resolves exact bottles without leaking artwork to custom editions', () => {
  for (const [id, shape] of Object.entries(expected)) {
    const product = catalog.products.find(product => product.id === id);
    assert.ok(product, id);
    assert.equal(resolve({ bottleId: id }), shape);
    assert.equal(resolve({ bottleName: product.name }), shape);
    assert.equal(resolve({ bottleId: id, bottleName: `${product.name} Unreviewed Custom Edition` }), undefined);
  }
  assert.notEqual(resolve({ bottleId: 'benchmark-rye' }), resolve({ bottleId: 'ezra-brooks-90' }));
});

test('new whiskey phase assets are registered and match their reviewed transparent exports', () => {
  const base = new URL('../../assets/bottles/label-free-v4/', import.meta.url);
  const provenance = JSON.parse(readFileSync(new URL('provenance.json', base), 'utf8'));
  const module = readFileSync(new URL('./label-free-artwork-assets.ts', import.meta.url), 'utf8');
  for (const shape of new Set(Object.values(expected))) {
    const asset = provenance.assets.find((entry: { shape: string }) => entry.shape === shape);
    assert.ok(asset, shape);
    const png = readFileSync(new URL(asset.file, base));
    assert.equal(createHash('sha256').update(png).digest('hex'), asset.exportSha256);
    assert.equal(png[25], 6, 'RGBA PNG required');
    assert.ok(png.readUInt32BE(16) <= 540 && png.readUInt32BE(20) <= 810);
    assert.ok(module.includes(`'${shape}': require('../../assets/bottles/label-free-v4/${asset.file}')`));
  }
});

test('whiskey publication excludes other spirits and leaves unfinished bottles unresolved', () => {
 for (const id of ['burnetts-100','corazon-blanco','svedka','yellowstone-bourbon-cocktails-espresso-rts']) {
  assert.equal(catalog.products.some(p => p.id === id), false, id);
  assert.equal(resolve({bottleId:id}), undefined, id);
 }
 assert.equal(resolve({bottleId:'dry-fly-dawn-till-dusk'}), undefined);
});
