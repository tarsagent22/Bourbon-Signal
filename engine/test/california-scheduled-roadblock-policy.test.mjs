import assert from 'node:assert/strict';
import test from 'node:test';

import { unexpectedCaliforniaRoadblocks } from '../src/california-release-policy.mjs';

const costcoMissing = {
  state: 'CA',
  source: 'Costco warehouse observation feed',
  status: 'not_configured',
};

test('California scheduled non-stale mode isolates only the missing auxiliary Costco feed', () => {
  assert.deepEqual(unexpectedCaliforniaRoadblocks([costcoMissing], { scheduledNonStale: true }), []);
  assert.deepEqual(unexpectedCaliforniaRoadblocks([costcoMissing], { scheduledNonStale: false }), [costcoMissing]);

  for (const roadblock of [
    { ...costcoMissing, state: 'NV' },
    { ...costcoMissing, source: 'California Shopify inventory' },
    { ...costcoMissing, status: 'stale' },
  ]) {
    assert.deepEqual(unexpectedCaliforniaRoadblocks([roadblock], { scheduledNonStale: true }), [roadblock]);
  }
});
