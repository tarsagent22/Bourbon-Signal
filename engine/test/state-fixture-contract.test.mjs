import assert from 'node:assert/strict';
import test from 'node:test';

import { validateStateFixtures } from '../src/verify-state-fixtures.mjs';

function fixture(overrides = {}) {
  return {
    schemaVersion: 1,
    state: 'ZZ',
    cases: [
      { id: 'positive', kind: 'positive_bottle_match', sourceId: 'zz:retailer', input: 'Weller Full Proof Bourbon', expected: { matches: true } },
      { id: 'ordinary', kind: 'ordinary_vs_rare_negative', sourceId: 'zz:retailer', input: 'Four Roses Small Batch', expected: { matches: false } },
      { id: 'rye', kind: 'rye_cream_liqueur_rtd_exclusion', sourceId: 'zz:retailer', input: 'Bourbon Cream', expected: { matches: false } },
      { id: 'size', kind: 'size_or_multipack_exclusion', sourceId: 'zz:retailer', input: 'Weller 375ml 3-pack', expected: { matches: false } },
      { id: 'availability', kind: 'availability_semantics', sourceId: 'zz:retailer', input: 'in stock', expected: { quantity: null, inventorySemantics: 'binary' } },
      { id: 'identity', kind: 'store_identity', sourceId: 'zz:retailer', input: 'store', expected: { storeId: 'zz-1', storeAddress: '1 Main St, Zed, ZZ 00000' } },
      { id: 'timestamp', kind: 'timestamp_freshness', sourceId: 'zz:retailer', input: '2026-07-16T00:00:00.000Z', expected: { freshness: 'fresh' } },
    ],
    ...overrides,
  };
}

test('state fixtures cover false-positive, identity, semantics, and freshness truth', () => {
  assert.deepEqual(validateStateFixtures(fixture()), { ok: true, failures: [] });
  const incomplete = fixture({ cases: fixture().cases.slice(0, -1) });
  const result = validateStateFixtures(incomplete);
  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /timestamp_freshness/i);
});
