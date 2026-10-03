import assert from 'node:assert/strict';
import './shelf-asset-layout.test';
import './shelf-fidelity.test';
import './photo-presentation.test';
import './collection-statistics.test';
import './collection-statistics-ui.test';
import './shelf-stats-polish.test';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const page=readFileSync(new URL('../../app/(app)/(tabs)/cellar.tsx',import.meta.url),'utf8');

test('actual native My Shelf mounts rated cabinet and default three-column grid',()=>{
 assert.match(page,/<ShelfCabinet/); assert.doesNotMatch(page,/<MyShelfDisplay/); assert.match(page,/shelfGridLayout\(width, viewMode, fontScale\)/);
 assert.match(page,/collectionSummary\(sourceBottles\)/); assert.match(page,/collectionDisplayKind\(bottle\)/);
 assert.match(page,/<CellarGlencairnSilhouette/); assert.match(page,/<ScoreSlider/);
 assert.match(page,/onPress=\{\(\) => setSelected\(item\)\}/);
 assert.doesNotMatch(page,/saveShelfStyle|styleSaving|\bonStyle=/);
});

test('all filtered entries are virtualized with stable identities and original artwork in details',()=>{
 assert.match(page,/data=\{bottles\}/);
 assert.match(page,/keyExtractor=\{shelfBottleKey\}/);
 assert.doesNotMatch(page,/visibleCount|visibleBottles|nextShelfPageSize/);
 assert.match(page,/<CellarBottleArtwork key=\{shelfBottleKey\(bottle\)\} bottle=\{bottle\} size="detail"/);
});

test('the native editor supplies exact selected identity for updates, inventory and deletion',()=>{
 assert.match(page,/updateCollectionBottle\(preferences.collectionPreferences.bottles, selected, patch/);
 assert.match(page,/applyCollectionInventoryAction\(priorBottles, selected, action/);
 assert.match(page,/filter\(\(bottle\) => !matchesCollectionBottle\(bottle, selected\)\)/);
 assert.doesNotMatch(page,/selected.canonicalKey, (patch|action)/);
});
