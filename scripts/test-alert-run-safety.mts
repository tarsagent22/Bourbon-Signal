import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAlertSnapshotSafety } from '../src/lib/alert-run-safety.ts';

test('stale export blocks delivery even when embedded candidate freshness is low', () => {
  const result = evaluateAlertSnapshotSafety({
    generatedAt: '2026-07-10T10:00:00.000Z',
    now: '2026-07-10T15:00:00.000Z',
    maxAgeMinutes: 45,
  });
  assert.equal(result.safe, false);
  assert.equal(result.reason, 'stale_alert_snapshot');
  assert.equal(result.ageMinutes, 300);
});

test('unknown export timestamp blocks delivery', () => {
  const result = evaluateAlertSnapshotSafety({ generatedAt: null, now: '2026-07-10T15:00:00.000Z', maxAgeMinutes: 45 });
  assert.equal(result.safe, false);
  assert.equal(result.reason, 'unknown_alert_snapshot_freshness');
});

test('recent export permits downstream candidate evaluation', () => {
  const result = evaluateAlertSnapshotSafety({
    generatedAt: '2026-07-10T14:30:00.000Z',
    now: '2026-07-10T15:00:00.000Z',
    maxAgeMinutes: 45,
  });
  assert.equal(result.safe, true);
  assert.equal(result.reason, null);
});
