import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeMapStore } from '../src/lib/store-map.ts';
import { buildSightingStoreSearchIndex, searchSightingStoreIndex, searchSightingStores } from '../src/lib/sighting-store-search.ts';
import { combineStoreDirectoryRows } from '../src/lib/store-directory.ts';

const locationsPayload = JSON.parse(readFileSync(new URL('../engine/out/site/locations.json', import.meta.url), 'utf8'));
const storesPayload = JSON.parse(readFileSync(new URL('../engine/out/site/stores.json', import.meta.url), 'utf8'));
const rawStores = [...(locationsPayload.locations || []), ...(storesPayload.stores || [])];
const stores = combineStoreDirectoryRows(rawStores).map((store) => normalizeMapStore(store));
const exactStores = stores.filter((store) => store.precision === 'store' && store.searchable !== false);
const searchIndex = buildSightingStoreSearchIndex(stores);

assert.equal(searchIndex.length, exactStores.length, 'the pre-normalized search index should contain every exact store and no board rows');

assert.ok(stores.length >= 5_000, `expected the complete merged store/location database, found ${stores.length}`);
assert.ok(exactStores.length >= 4_400, `expected every exact store from the directory, found ${exactStores.length}`);

const concordPrefix = searchSightingStoreIndex(searchIndex, '854 uni');
assert.ok(concordPrefix.some((store) => /Concord ABC Store/i.test(store.name || '') && /854 Union St/i.test(store.address || '')), 'predictive street search should find the Concord ABC store while the member types');

const zipPrefix = searchSightingStores(stores, '2750');
assert.ok(zipPrefix.some((store) => store.zip?.startsWith('2750')), 'predictive ZIP search should return matching exact stores');

const cityPrefix = searchSightingStores(stores, 'myrtle bea');
assert.ok(cityPrefix.some((store) => store.city === 'Myrtle Beach'), 'predictive city search should work before the full city is typed');

const boardResults = searchSightingStores(stores, 'Concord ABC Board');
assert.ok(boardResults.every((store) => store.precision === 'store'), 'member sighting suggestions must never return board/area rows');

const exactId = exactStores.find((store) => store.id === 'a108004f2c774607');
assert.ok(exactId, 'known database store should be present in the full merged directory');
assert.ok(searchSightingStores(stores, exactId.id).some((store) => store.id === exactId.id), 'every exact database store must be searchable by stable ID');

const hookSource = readFileSync(new URL('../src/hooks/useStores.ts', import.meta.url), 'utf8');
assert.match(hookSource, /if \(!res\.ok\) throw/, 'store loading must not cache an unauthorized/error response as an empty directory');
assert.match(hookSource, /cachedStores = normalized/, 'successful full directory loads should remain cached');

const clientSource = readFileSync(new URL('../src/app/sightings/SightingsClient.tsx', import.meta.url), 'utf8');
assert.match(clientSource, /useDeferredValue\(storeQuery\)/, 'predictive search should defer expensive ranking so typing stays responsive');
assert.match(clientSource, /role="combobox"/, 'predictive search input should expose the combobox accessibility pattern');
assert.match(clientSource, /useEffect\(\(\) => \{\s*setActiveStoreIndex\(-1\);\s*\}, \[geo\]\)/, 'geolocation-driven result reordering should clear the active keyboard option');
for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'aria-activedescendant', 'storeSuggestionsOpen', 'if (activeStore) selectStore(activeStore)']) {
  assert.ok(clientSource.includes(key), `predictive store search should support ${key}`);
}

console.log(`Sighting store predictive search verified across ${exactStores.length} exact-store rows.`);
