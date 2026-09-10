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

test('an older refresh cannot undo an acknowledged shelf finish', async () => {
 const loadBody = page.split('const load = useCallback(async (fresh = false) => {')[1].split('\n  }, [')[0];
 const saveBody = page.split('const saveShelfStyle = async (shelfStyle: ShelfStyle) => {')[1].split('\n  };')[0];
 let preferences = {collectionPreferences:{bottles:[],version:7,shelfStyle:'amber'}};
 let releaseRead!: (value: unknown) => void;
 let startedRead!: () => void;
 const started = new Promise<void>(resolve => { startedRead = resolve; });
 const read = new Promise(resolve => { releaseRead = resolve; });
 const stale = structuredClone(preferences);
 const api = {getMemberPreferences: () => {startedRead(); return read;}, updateMemberPreferences: async () => ({collectionPreferences:{shelfStyle:'black'}})};
 const noop = () => {};
 const deps = {api, mounted:{current:true}, activeUser:{current:'fixture'}, userId:'fixture', styleRevision:{current:0}, styleSaving:false, mutating:false, receiptStorageKey:'fixture', readContributionReceipts:async()=>({receipts:new Map()}), setLoading:noop, setError:noop, setStyleSaving:noop, retryPendingContributions:noop, MobileApiError:Error, Alert:{alert:noop}, acceptServerPreferences:(next:typeof preferences)=>{preferences=next;}, setPreferences:(update:(p:typeof preferences)=>typeof preferences)=>{preferences=update(preferences);}};
 const callbacks = new Function(...Object.keys(deps), `return {load:async(fresh=false)=>{${loadBody}},save:async(shelfStyle)=>{${saveBody}}}`)(...Object.values(deps));
 const loading = callbacks.load(true); await started;
 assert.equal(await callbacks.save('black'),true);
 assert.equal(preferences.collectionPreferences.shelfStyle,'black');
 releaseRead(stale); await loading;
 assert.equal(preferences.collectionPreferences.shelfStyle,'black');
 assert.equal(preferences.collectionPreferences.version,7);
});
test('actual native My Shelf mounts rated cabinet and default three-column grid',()=>{
 assert.match(page,/<ShelfCabinet/); assert.doesNotMatch(page,/<MyShelfDisplay/); assert.match(page,/shelfGridLayout\(width, viewMode\)/);
 assert.match(page,/collectionSummary\(sourceBottles\)/); assert.match(page,/collectionDisplayKind\(bottle\)/);
 assert.match(page,/<CellarGlencairnSilhouette/); assert.match(page,/<ScoreSlider/);
 assert.match(page,/onPress=\{\(\) => setSelected\(item\)\}/);
 assert.match(page,/collectionPreferences: \{ shelfStyle/);
});
