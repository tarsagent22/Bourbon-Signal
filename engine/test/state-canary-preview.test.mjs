import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCanaryPreviewPayload } from '../src/build-state-canary-preview.mjs';

test('canary preview adds only the candidate partition and prevents candidate alert delivery', () => {
  const base = {
    manifest: { files: { stateDrops: 'states/index.json' }, statePartitions: [{ state: 'AA', file: 'states/AA/drops.json', count: 1 }] },
    drops: { drops: [{ state: 'AA', id: 'aa-1' }] },
    stateIndex: { states: [{ state: 'AA', file: 'states/AA/drops.json', count: 1 }], totalCount: 1, stateCount: 1 },
    alerts: { alerts: [{ state: 'AA', id: 'alert-aa' }] },
  };
  const preview = buildCanaryPreviewPayload({ base, state: 'ZZ', candidateDrops: [{ state: 'ZZ', id: 'zz-1' }] });
  assert.equal(preview.drops.drops.length, 2);
  assert.deepEqual(preview.stateIndex.states.map((entry) => entry.state), ['AA', 'ZZ']);
  assert.equal(preview.alerts.alerts.some((alert) => alert.state === 'ZZ'), false);
  assert.equal(preview.previewPolicy.alertDeliveryEnabled, false);
});
