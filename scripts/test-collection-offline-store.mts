import assert from 'node:assert/strict';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const memoryStorage = new MemoryStorage();
Object.defineProperty(globalThis, 'window', { value: { localStorage: memoryStorage }, configurable: true });
Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage, configurable: true });
Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true });

const loaded = await import('../src/lib/collection-offline-store.ts');
const store = ((loaded as { default?: unknown }).default || loaded) as typeof import('../src/lib/collection-offline-store.ts');
const collection = (rating: number) => ({
  bottles: [{
    bottleId: 'bottle-a', bottleName: 'Bottle A', canonicalKey: 'bottle a', rating, isRated: true, ratedAt: '2026-07-29T00:30:00.000Z',
    tasteTags: [], wouldBuyAgain: true, notes: '', addedAt: '2026-07-29T00:00:00.000Z', updatedAt: '2026-07-29T00:00:00.000Z',
  }],
  version: 1,
});

const first = await store.writePendingCollection('user-a', collection(80));
assert.ok(first);
const second = await store.writePendingCollection('user-a', collection(90));
assert.ok(second);
await store.clearPendingCollection('user-a', first!.operationId);
assert.equal((await store.readPendingCollection('user-a'))?.collectionPreferences.bottles[0]?.rating, 90, 'an older request cannot clear a newer tab edit');
await store.markPendingCollectionConflict('user-a', first!.operationId);
assert.equal((await store.readPendingCollection('user-a'))?.blockedByConflict, false, 'an older request cannot block a newer tab edit');
await store.markPendingCollectionConflict('user-a', second!.operationId);
assert.equal((await store.readPendingCollection('user-a'))?.blockedByConflict, true);
assert.equal(await store.syncPendingCollection('user-a', async () => { throw new Error('blocked records must not auto-sync'); }), null);
await store.clearPendingCollection('user-a', second!.operationId);
assert.equal(await store.readPendingCollection('user-a'), null);

console.log('collection offline store tests passed');
