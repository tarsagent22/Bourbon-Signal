import assert from 'node:assert/strict';
import test from 'node:test';
import { alertFreshnessIsDeliverable, evaluateAlertSnapshotSafety, resolveAlertFreshnessCapHours, resolveAlertSnapshotMaxAgeMinutes, signalFreshnessHoursAt } from '../src/lib/alert-run-safety.ts';

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

test('configured freshness can never exceed the one-hour hard cap', () => {
  assert.equal(resolveAlertFreshnessCapHours(2), 1);
  assert.equal(resolveAlertFreshnessCapHours(24), 1);
  assert.equal(resolveAlertFreshnessCapHours(undefined), 1);
  assert.equal(resolveAlertFreshnessCapHours(Number.NaN), 1);
});

test('stricter configured freshness remains allowed', () => {
  assert.equal(resolveAlertFreshnessCapHours(0.5), 0.5);
});

test('candidate freshness allows exactly one hour and rejects anything older', () => {
  assert.equal(alertFreshnessIsDeliverable(0.99, 24), true);
  assert.equal(alertFreshnessIsDeliverable(1, 24), true);
  assert.equal(alertFreshnessIsDeliverable(1.0001, 24), false);
  assert.equal(alertFreshnessIsDeliverable(Number.NaN, 24), false);
});

test('candidate-specific policies may be stricter but never wider', () => {
  assert.equal(alertFreshnessIsDeliverable(0.5, 0.5), true);
  assert.equal(alertFreshnessIsDeliverable(0.5001, 0.5), false);
  assert.equal(alertFreshnessIsDeliverable(1, 24), true);
  assert.equal(alertFreshnessIsDeliverable(1.0001, 24), false);
});

test('delivery recomputes exact age from the canonical signal timestamp', () => {
  const signalAt = '2026-07-20T12:00:00.000Z';
  assert.equal(signalFreshnessHoursAt(signalAt, '2026-07-20T13:00:00.000Z'), 1);
  assert.ok(signalFreshnessHoursAt(signalAt, '2026-07-20T13:00:00.001Z') > 1);
  assert.ok(signalFreshnessHoursAt(signalAt, '2026-07-20T13:25:00.000Z') > 1);
  assert.equal(Number.isNaN(signalFreshnessHoursAt('', '2026-07-20T13:00:00.000Z')), true);
});

test('future timestamps beyond bounded clock skew fail closed', () => {
  assert.equal(
    Number.isNaN(signalFreshnessHoursAt('2026-07-20T12:05:00.001Z', '2026-07-20T12:00:00.000Z')),
    true,
  );
  assert.equal(
    signalFreshnessHoursAt('2026-07-20T12:05:00.000Z', '2026-07-20T12:00:00.000Z'),
    0,
  );
});

test('future snapshot timestamps beyond bounded clock skew fail closed', () => {
  const result = evaluateAlertSnapshotSafety({
    generatedAt: '2026-07-20T12:05:00.001Z',
    now: '2026-07-20T12:00:00.000Z',
    maxAgeMinutes: 45,
  });
  assert.equal(result.safe, false);
  assert.equal(result.reason, 'future_alert_snapshot');
});

test('snapshot age configuration cannot widen past one hour', () => {
  assert.equal(resolveAlertSnapshotMaxAgeMinutes(45), 45);
  assert.equal(resolveAlertSnapshotMaxAgeMinutes(120), 60);
  assert.equal(resolveAlertSnapshotMaxAgeMinutes(Number.NaN), 45);
});
