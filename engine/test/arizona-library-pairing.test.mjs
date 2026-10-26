import assert from 'node:assert/strict';
import test from 'node:test';
import { arizonaXapiLibraryQueryAssignments, arizonaXapiRequestPlan } from '../src/collectors/arizona-xapi.mjs';

test('Arizona library scheduling visits every store/query pair despite shared factors and a migrated query cursor', () => {
  for (const [storeCount, poolSize] of [[134, 350], [32, 64], [3, 10], [1, 21]]) {
    for (const shift of [0, 37]) {
      const batchSize = Math.min(16, poolSize, storeCount);
      const pairs = new Set();
      for (let invocation = 0; invocation < Math.ceil(storeCount * poolSize / batchSize); invocation++) {
        const terms = Array.from({ length: batchSize }, (_, offset) => `query-${(invocation * batchSize + offset + shift) % poolSize}`);
        const assignments = arizonaXapiLibraryQueryAssignments(storeCount, { terms, poolSize, invocation });
        assert.equal(assignments.length, batchSize);
        assert(storeCount + assignments.length <= 150);
        for (const { storeIndex, term } of assignments) {
          assert(storeIndex >= 0 && storeIndex < storeCount);
          pairs.add(`${storeIndex}:${term}`);
        }
      }
      assert.equal(pairs.size, storeCount * poolSize, `${storeCount} stores / ${poolSize} queries / offset ${shift}`);
    }
  }
});

test('production Arizona request plans retain every baseline store and all supplemental searches across pool wrap', () => {
  for (const storeCount of [134, 3]) {
    const stores = Array.from({ length: storeCount }, (_, i) => ({ locationId: String(10000 + i), polarisBannerName: 'safeway', domainName: 'safeway', address: { line1: `${i + 1} Main St`, city: 'Phoenix', state: 'AZ', zipcode: '85001' } }));
    const batchSize = Math.min(16, storeCount);
    const invocation = Math.floor(349 / batchSize);
    const terms = Array.from({ length: batchSize }, (_, i) => `expression-${(invocation * batchSize + i) % 350}`);
    const plan = arizonaXapiRequestPlan(stores, { terms, rotationIndex: invocation, queryPoolSize: 350 });
    assert.equal(plan.length, storeCount);
    assert(plan.every(row => row.terms[0] === 'bourbon'));
    assert.equal(plan.flatMap(row => row.terms).length, storeCount + batchSize);
    assert.deepEqual(plan.flatMap(row => row.terms.slice(1)).sort(), [...terms].sort());
    assert(new Set(plan.map(row => row.store.locationId)).size === storeCount);
  }
});

test('Arizona pairing rejects malformed source progress and oversized query batches', () => {
  for (const options of [
    { terms: ['a'], poolSize: 350, invocation: -1 },
    { terms: ['a', 'b'], poolSize: 1, invocation: 0 },
    { terms: ['a', 'a'], poolSize: 350, invocation: 0 },
    { terms: Array.from({ length: 17 }, (_, i) => String(i)), poolSize: 350, invocation: 0 },
    { terms: ['a'], poolSize: 350, invocation: Number.MAX_SAFE_INTEGER },
  ]) assert.throws(() => arizonaXapiLibraryQueryAssignments(134, options));
});
