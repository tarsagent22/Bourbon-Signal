import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCanaryPreviewPayload } from '../src/build-state-canary-preview.mjs';

test('canary preview adds only the candidate partition and prevents candidate alert delivery', () => {
  const base = {
    manifest: { files: { stateDrops: 'states/index.json' }, statePartitions: [{ state: 'AA', file: 'states/AA/drops.json', count: 1 }] },
    drops: { drops: [{ state: 'AA', id: 'aa-1' }] },
    stateIndex: { states: [{ state: 'AA', file: 'states/AA/drops.json', count: 1 }], totalCount: 1, stateCount: 1 },
    alerts: { alerts: [{ state: 'AA', id: 'alert-aa' }] },
    locations: { locations: [{ state: 'AA', id: 'store-aa', address: '1 Main St' }] },
  };
  const preview = buildCanaryPreviewPayload({
    base,
    state: 'ZZ',
    candidateDrops: [{ state: 'ZZ', id: 'zz-1', storeId: 'store-zz', storeName: 'ZZ Store', storeAddress: '2 Main St', city: 'Testville', zip: '00000' }],
  });
  assert.equal(preview.drops.drops.length, 2);
  assert.deepEqual(preview.stateIndex.states.map((entry) => entry.state), ['AA', 'ZZ']);
  assert.equal(preview.alerts.alerts.some((alert) => alert.state === 'ZZ'), false);
  assert.ok(preview.locations.locations.some((location) => location.state === 'ZZ' && location.storeId === 'store-zz'));
  assert.equal(preview.previewPolicy.alertDeliveryEnabled, false);
});
