import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const page=readFileSync(new URL('../../app/(app)/(tabs)/cellar.tsx',import.meta.url),'utf8');
test('actual native My Shelf mounts rated cabinet and default three-column grid',()=>{
 assert.match(page,/<ShelfCabinet/); assert.doesNotMatch(page,/<MyShelfDisplay/); assert.match(page,/shelfGridLayout\(width, viewMode\)/);
 assert.match(page,/collectionSummary\(sourceBottles\)/); assert.match(page,/collectionDisplayKind\(bottle\)/);
 assert.match(page,/<CellarGlencairnSilhouette/); assert.match(page,/<ScoreSlider/);
 assert.match(page,/onPress=\{\(\) => setSelected\(item\)\}/);
 assert.match(page,/collectionPreferences: \{ shelfStyle/);
});
