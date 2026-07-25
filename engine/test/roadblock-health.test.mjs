import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyRoadblock, summarizeRoadblocks } from '../src/roadblock-health.mjs';

test('expected no-inventory outcomes do not inflate operational failures', () => {
  assert.equal(classifyRoadblock({ status: 'reachable_no_safe_inventory_rows', error: 'No safe rows' }).severity, 'expected_negative');
  assert.equal(classifyRoadblock({ status: 'locator_only_no_products', error: 'Exact store is reachable but publishes no product options' }).severity, 'expected_negative');
  assert.equal(classifyRoadblock({ error: 'Store Closed for Ecommerce' }).severity, 'expected_negative');
  assert.equal(classifyRoadblock({ status: 500, error: 'upstream failed' }).severity, 'operational_failure');
});

test('roadblock health deduplicates repeated root causes', () => {
  const summary = summarizeRoadblocks([
    { state: 'VA', source: 'Virginia ABC', status: 200, error: 'Store Closed for Ecommerce', url: 'https://x/a' },
    { state: 'VA', source: 'Virginia ABC', status: 200, error: 'Store Closed for Ecommerce', url: 'https://x/b' },
    { state: 'FL', source: 'MDP', status: 503, error: 'upstream failed', url: 'https://y' },
  ]);
  assert.equal(summary.total, 3);
  assert.equal(summary.expectedNegativeCount, 2);
  assert.equal(summary.operationalFailureCount, 1);
  assert.equal(summary.groups.find((group) => group.severity === 'expected_negative').count, 2);
});
