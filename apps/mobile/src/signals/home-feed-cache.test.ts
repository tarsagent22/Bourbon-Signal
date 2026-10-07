import assert from 'node:assert/strict';
import test from 'node:test';
import { createHomeFeedCache, feedCacheScope } from './home-feed-cache';
import { DEFAULT_SIGNAL_FILTERS } from './feed-filters';
import { feedFixture } from '../api/astra-fixtures';
const scope = feedCacheScope('market', { ...DEFAULT_SIGNAL_FILTERS, rarities: ['allocated','unicorn'] });
const signalFixture = () => ({ contractVersion: 'bourbon-signal/signal@1' as const, id: 'test', kind: 'availability' as const, source: { type: 'trusted_source' as const, label: 'Test' }, bottle: { name: 'Test Bourbon', rarity: 'allocated' as const }, location: { scope: 'state' as const }, timing: { displayAt: new Date().toISOString() }, evidence: { photo: false, corroborationCount: 0, helpfulCount: 0, retailerReported: false, sourceBacked: true }, strength: 'best' as const, alertEligibility: { inventory: false, watch: false }, actions: [] });
const page = { ...feedFixture(), view: 'market' as const, signals: [signalFixture()] };
function setup() {
  const disk = new Map<string,string>();
  const storage = { read: async (key:string) => disk.get(key) || null, write: async (key:string,raw:string|null) => { if(raw === null)disk.delete(key);else disk.set(key,raw); } };
  return { disk, storage };
}
test('account and full filter scope isolation, immediate memory and restart recovery', async () => {
  const {storage} = setup(); const cache = createHomeFeedCache(storage);
  await cache.save('user_A',scope,page);
  assert.equal(cache.peek('user_A',scope)?.signals[0].id,page.signals[0].id);
  assert.equal(await cache.load('user_B',scope),null);
  assert.equal(cache.peek('user_A',feedCacheScope('community',DEFAULT_SIGNAL_FILTERS)),null);
  assert.equal(feedCacheScope('market',{...DEFAULT_SIGNAL_FILTERS,rarities:['unicorn','allocated']}),scope);
  assert.deepEqual(await createHomeFeedCache(storage).load('user_A',scope),page);
});
test('outages preserve cache, confirmed empty invalidates scope, and auth clear deletes disk', async () => {
  const {storage,disk}=setup(); const cache=createHomeFeedCache(storage);
  await cache.save('user_A',scope,page);
  await cache.save('user_A',scope,{...page,degraded:true,signals:[]});
  assert.ok(cache.peek('user_A',scope));
  await cache.save('user_A',scope,{...page,signals:[]});
  assert.equal(cache.peek('user_A',scope),null);
  await cache.save('user_A',scope,page); await cache.clear('user_A');
  assert.equal(disk.has('user_A'),false);
});
test('expired and corrupt disk never render and caches stay bounded', async () => {
  const {storage,disk}=setup(); let at=100; const cache=createHomeFeedCache(storage,()=>at);
  for(let i=0;i<12;i++)await cache.save('user_A',String(i),page);
  assert.equal(JSON.parse(disk.get('user_A')!).entries.length,8);
  at+=86_400_001;
  assert.equal(cache.peek('user_A','11'),null);
  assert.equal(await createHomeFeedCache(storage,()=>at).load('user_A','11'),null);
  disk.set('user_B','{broken');assert.equal(await cache.load('user_B',scope),null);
});
test('signout fences a pending disk read and serializes deletion behind saves', async () => {
  let release:(v:string)=>void=()=>{}; const {storage,disk}=setup();
  const raw=JSON.stringify({version:1,entries:[{scope,savedAt:Date.now(),page}]});
  const cache=createHomeFeedCache({...storage,read:()=>new Promise(resolve=>{release=resolve;})});
  const reading=cache.load('user_A',scope); await Promise.resolve();
  await cache.clear('user_A'); release(raw);
  assert.equal(await reading,null);assert.equal(cache.peek('user_A',scope),null);
  const saving=cache.save('user_A',scope,page); const clearing=cache.clear('user_A'); await Promise.all([saving,clearing]);
  assert.equal(disk.has('user_A'),false);
});

test('an authoritative paid-access loss purges every cached filter scope', async () => {
  const {storage,disk}=setup(); const cache=createHomeFeedCache(storage);
  await cache.save('user_A',scope,page);await cache.save('user_A','another',page);
  await cache.save('user_A',scope,{...page,signals:[],access:{...page.access,marketDetailsLocked:true}});
  assert.equal(cache.peek('user_A','another'),null);assert.equal(disk.has('user_A'),false);
});
