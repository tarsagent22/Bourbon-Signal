import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mergeBottleCatalogSources, type BottleCatalogEntry } from '../src/lib/bottle-catalog-merge.ts';

// Golden output from the previous merger includes the full bundled inventory,
// identity collisions, different ages, source precedence, and shared aliases.
const inventory = JSON.parse(readFileSync(new URL('../src/data/bourbonBibleInventory.json', import.meta.url), 'utf8')) as BottleCatalogEntry[];
const sources = [inventory, inventory.slice(0, 80).map((bottle, index) => ({
  ...bottle, id: `alternate-${index}`, availability: 'allocated',
  aliases: ['shared nickname'], isSignalTracked: true,
})), [
  {id:'edition-one',canonicalName:'Test Reserve 10 Year',availability:'limited',aliases:['shared nickname']},
  {id:'edition-two',canonicalName:'Test Reserve 12 Year',availability:'unicorn',aliases:['shared nickname']},
  {id:'edition-three',canonicalName:'Test Reserve Ten Year',availability:'allocated',aliases:[]},
]];
const original = JSON.stringify(sources);
const result = mergeBottleCatalogSources(sources);
const digest = createHash('sha256').update(JSON.stringify(result)).digest('hex');
assert.equal(digest, '1affde9054824302b215583e1c33b2cc35753ee9e1fea2ca3dd717b1a253fcb5');
assert.equal(JSON.stringify(sources), original, 'catalog merging must not mutate its inputs');
assert.deepEqual(mergeBottleCatalogSources(sources), result, 'memoization must remain local to each call');
console.log(`Catalog merge equivalence passed (${result.length} bottles).`);

