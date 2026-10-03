import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// A partial release validates all reviewed mappings; strict mode requires full coverage.
const allowUnmapped = process.argv.includes("--allow-unmapped");
const mobile = fileURLToPath(new URL('../', import.meta.url));
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const seed = read(path.join(mobile, 'src/cellar/bottle-catalog-seed.json'));
const directory = path.join(mobile, 'assets/bottles');
const products = new Map();
const shapes = new Set();
for (const folder of readdirSync(directory).filter(name => /^label-free-v\d+$/.test(name))) {
  const base = path.join(directory, folder);
  const catalog = read(path.join(base, 'catalog.json'));
  const provenance = read(path.join(base, 'provenance.json'));
  for (const asset of provenance.assets) {
    const shape = asset.shape ?? asset.file.replace(/^bare-/, '').replace(/\.png$/, '');
    assert.ok(!shapes.has(shape), `Duplicate exported shape: ${shape}`);
    shapes.add(shape);
    const data = readFileSync(path.join(base, asset.file));
    assert.equal(createHash('sha256').update(data).digest('hex'), asset.exportSha256 ?? asset.sha256);
  }
  for (const product of catalog.products) {
    assert.ok(!products.has(product.id), `Duplicate exact catalog ID: ${product.id}`);
    products.set(product.id, product);
  }
}
const missing = seed.filter(entry => !products.has(entry.id));
const invalid = seed.filter(entry => {
  const product = products.get(entry.id);
  return product && (product.name !== entry.name || product.shape === 'neutral' || !shapes.has(product.shape));
});
const collectionEntries = [...products.values()].filter(product => product.presentation === 'collection').length;
const illustrativeEntries = [...products.values()].filter(product => product.presentation === 'representative').length;
const summary = { catalogEntries: seed.length, mappedEntries: seed.length - missing.length - invalid.length, collectionEntries, illustrativeEntries, exactEntries: products.size - collectionEntries - illustrativeEntries, missing: missing.length, invalid: invalid.length, exportedShapes: shapes.size };
console.log(JSON.stringify(summary));
assert.equal(invalid.length, 0, `Invalid exact artwork mappings: ${invalid.map(entry => entry.name).join(', ')}`);
if (!allowUnmapped) assert.equal(missing.length, 0, `Catalog artwork incomplete: ${missing.slice(0, 15).map(entry => entry.name).join(', ')}${missing.length > 15 ? ', ...' : ''}`);

// Explicit regression checks for easy-to-confuse physical top variants.
const shape = id => products.get(id)?.shape;
assert.equal(shape('weller-special-reserve'), 'weller-green');
assert.equal(shape('weller-12-year'), 'weller-black');
for (const [id, expected] of Object.entries({
  '1792-small-batch':'1792-maroon',
  '1792-bottled-in-bond':'1792-yellow',
  '1792-bottled-in-bond-single-barrel-select':'1792-yellow',
  '1792-full-proof':'1792-black',
  '1792-full-proof-single-barrel-select':'1792-black',
  '1792-12-year':'1792-black',
  '1792-single-barrel-bourbon':'1792-beige',
  '1792-single-barrel-select':'1792-beige',
  '1792-sweet-wheat-bourbon':'1792-amber',
})) assert.equal(shape(id), expected, `Incorrect reviewed closure treatment: ${id}`);
assert.notEqual(shape('weller-special-reserve'), shape('weller-full-proof'));
assert.notEqual(shape('weller-12-year'), shape('weller-full-proof'));
assert.equal(shape('weller-special-reserve'), shape('weller-special-reserve-single-barrel-select'));
assert.equal(shape('weller-full-proof'), shape('weller-full-proof-single-barrel-select'));
for (const [left, right] of [['1792-small-batch', '1792-full-proof'], ['1792-bottled-in-bond', '1792-full-proof'], ['1792-single-barrel-bourbon', '1792-small-batch'], ['1792-sweet-wheat-bourbon', '1792-single-barrel-bourbon']]) {
  assert.notEqual(shape(left), shape(right), `${left} and ${right} require different neck treatments`);
}
console.log('Reviewed artwork mappings and closure variants pass; coverage is reported above.');
