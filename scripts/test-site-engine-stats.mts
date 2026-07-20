import assert from 'node:assert/strict';
import { buildStateStats } from '../src/lib/site-stats-metrics.ts';

const stats = buildStateStats(
  [
    { state: 'PA', type: 'store_inventory_result', locationPrecision: 'store_level', storeId: 's1' },
    { state: 'PA', event_type: 'store_inventory_result', location_precision: 'store_level', store_id: 's2' },
    { state: 'PA', type: 'allocation_snapshot', locationPrecision: 'state_level' },
  ],
  [{ state: 'PA', id: 's1' }, { state: 'PA', id: 's2' }],
  [],
);

assert.deepEqual(stats.PA, {
  drops: 3,
  stores: 2,
  bottles: 0,
  exactStoreDrops: 2,
  exactStores: 2,
});

console.log('Site stats exact-store metrics contract passed.');
