import test from 'node:test';
import assert from 'node:assert/strict';

import { isSafePennsylvaniaScheduledFallback } from '../src/pennsylvania-fallback-policy.mjs';

const lastGoodAt = '2026-08-07T03:20:48.010Z';
const staleSignal = {
  stale: true,
  canAlertAsInventory: false,
  canAlertAsWatch: false,
};

function retainedNotDue(overrides = {}) {
  return {
    state: 'PA',
    status: 'useful_retained_not_due',
    stale: false,
    lastGoodAt,
    signals: [staleSignal],
    ...overrides,
  };
}

test('scheduled PA continuity accepts only provenance-backed non-alertable retained-not-due rows', () => {
  assert.equal(isSafePennsylvaniaScheduledFallback({
    allowSafeStaleFallback: true,
    stateReport: retainedNotDue(),
  }), true);
  assert.equal(isSafePennsylvaniaScheduledFallback({
    allowSafeStaleFallback: false,
    stateReport: retainedNotDue(),
  }), false, 'targeted recovery remains strict');
  assert.equal(isSafePennsylvaniaScheduledFallback({
    allowSafeStaleFallback: true,
    stateReport: retainedNotDue({ lastGoodAt: null }),
  }), false, 'retained-not-due evidence requires last-good provenance');
  for (const stale of [undefined, null, 'false']) {
    assert.equal(isSafePennsylvaniaScheduledFallback({
      allowSafeStaleFallback: true,
      stateReport: retainedNotDue({ stale }),
    }), false, 'retained-not-due evidence requires an explicit false report-level stale marker');
  }
  assert.equal(isSafePennsylvaniaScheduledFallback({
    allowSafeStaleFallback: true,
    stateReport: retainedNotDue({ signals: [{ ...staleSignal, canAlertAsInventory: true }] }),
  }), false, 'retained evidence can never regain alert eligibility');
  assert.equal(isSafePennsylvaniaScheduledFallback({
    allowSafeStaleFallback: true,
    stateReport: retainedNotDue({ signals: [{ ...staleSignal, stale: false }] }),
  }), false, 'retained evidence must remain explicitly stale');
});

test('scheduled PA continuity preserves the existing explicit stale fallback contract', () => {
  assert.equal(isSafePennsylvaniaScheduledFallback({
    allowSafeStaleFallback: true,
    stateReport: retainedNotDue({
      status: 'stale_useful_retained_not_due_quality_fallback',
      stale: true,
      staleReason: 'quality guard preserved the last verified exact-store rows',
      staleFallbackAt: '2026-08-07T04:00:00.000Z',
    }),
  }), true);
  assert.equal(isSafePennsylvaniaScheduledFallback({
    allowSafeStaleFallback: true,
    stateReport: retainedNotDue({ status: 'stale_', stale: true, staleReason: 'bad label' }),
  }), false);
});
