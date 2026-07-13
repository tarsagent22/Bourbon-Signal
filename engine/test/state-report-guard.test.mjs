import test from 'node:test';
import assert from 'node:assert/strict';

import { guardStateReport } from '../src/state-report-guard.mjs';

function report(state, count, { actionable = count, status = 'useful' } = {}) {
  return {
    state,
    status,
    finishedAt: '2026-07-13T00:00:00.000Z',
    signals: Array.from({ length: count }, (_, index) => ({
      id: `${state}-${index}`,
      locationPrecision: index < actionable ? 'store_level' : 'statewide_catalog',
      canAlertAsInventory: index < actionable,
      observedAt: '2026-07-13T00:00:00.000Z',
    })),
    sources: [{ ok: true }],
    roadblocks: [],
  };
}

test('preserves the last good state report when a successful collector silently collapses', () => {
  const previous = report('VA', 100);
  const candidate = report('VA', 20);
  const result = guardStateReport({ previous, candidate, now: '2026-07-13T01:00:00.000Z' });

  assert.equal(result.accepted, false);
  assert.equal(result.report.signals.length, 100);
  assert.equal(result.report.stale, true);
  assert.match(result.report.staleReason, /signal count collapsed from 100 to 20/i);
  assert.equal(result.report.signals[0].observedAt, '2026-07-13T00:00:00.000Z');
});

test('accepts a healthy expansion and first report', () => {
  assert.equal(guardStateReport({ previous: report('FL', 1), candidate: report('FL', 73) }).accepted, true);
  assert.equal(guardStateReport({ previous: null, candidate: report('TX', 760) }).accepted, true);
});

test('preserves low-volume watch lanes when they collapse to zero', () => {
  const result = guardStateReport({ previous: report('KY', 8, { actionable: 0 }), candidate: report('KY', 0, { actionable: 0 }) });
  assert.equal(result.accepted, false);
  assert.equal(result.report.signals.length, 8);
});

test('does not use a zero-signal baseline to block legitimate empty watch states', () => {
  const result = guardStateReport({ previous: report('CA', 0, { actionable: 0 }), candidate: report('CA', 0, { actionable: 0 }) });
  assert.equal(result.accepted, true);
});
