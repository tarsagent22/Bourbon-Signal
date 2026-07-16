import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SOURCE_SLO_TARGET,
  SEVEN_DAY_WINDOW_MS,
  appendSourceSloObservations,
  buildSevenDaySourceSloReport,
} from '../src/sources/slo-report.mjs';

const NOW = '2026-07-15T12:00:00.000Z';

test('seven-day SLO target is strictly greater than 98 percent', () => {
  assert.equal(DEFAULT_SOURCE_SLO_TARGET, 0.98);
  const start = Date.parse(NOW) - SEVEN_DAY_WINDOW_MS;
  const observations = Array.from({ length: 100 }, (_, index) => ({
    id: `run-${index}`,
    sourceId: 'fixture-source',
    observedAt: new Date(start + index * (SEVEN_DAY_WINDOW_MS / 100)).toISOString(),
    outcome: index < 99 ? 'success' : 'transient_error',
  }));
  const report = buildSevenDaySourceSloReport({
    firstObservedAt: new Date(start).toISOString(),
    observations,
  }, { now: NOW });

  assert.equal(report.target.operator, '>');
  assert.equal(report.availabilityRatio, 0.99);
  assert.equal(report.coveredDayCount, 7);
  assert.equal(report.status, 'met');
  assert.equal(report.metTarget, true);
});

test('partial history is reported as insufficient instead of fabricating seven days', () => {
  const history = appendSourceSloObservations(null, [{
    sourceId: 'new-source',
    status: 'success',
    attemptCount: 1,
    startedAt: '2026-07-15T11:59:00.000Z',
    finishedAt: NOW,
  }], { now: NOW });
  const report = buildSevenDaySourceSloReport(history, { now: NOW });

  assert.equal(report.observedSampleCount, 1);
  assert.equal(report.historyComplete, false);
  assert.equal(report.status, 'insufficient_history');
  assert.equal(report.metTarget, null);
  assert.ok(report.observedHistoryMs < SEVEN_DAY_WINDOW_MS);
});

test('not-due and quarantined diagnostics do not count as fabricated success', () => {
  const history = appendSourceSloObservations(null, [
    { sourceId: 'scheduled', status: 'not_due', attemptCount: 0, finishedAt: NOW },
    { sourceId: 'quarantined', status: 'quarantined', attemptCount: 1, finishedAt: NOW },
    { sourceId: 'failed', status: 'timeout', attemptCount: 2, finishedAt: NOW },
  ], { now: NOW });
  const report = buildSevenDaySourceSloReport(history, { now: NOW });

  assert.equal(report.observedSampleCount, 1);
  assert.equal(report.successfulSampleCount, 0);
  assert.equal(report.availabilityRatio, 0);
  assert.equal(report.excludedSampleCount, 2);
});

test('failed quarantined probes stay outside the SLO denominator', () => {
  const history = appendSourceSloObservations(null, [
    {
      sourceId: 'quarantined-timeout',
      status: 'quarantined',
      quarantined: true,
      ok: false,
      error: { kind: 'timeout' },
      attemptCount: 2,
      finishedAt: NOW,
    },
    { sourceId: 'healthy', status: 'success', attemptCount: 1, finishedAt: NOW },
  ], { now: NOW });
  const report = buildSevenDaySourceSloReport(history, { now: NOW });

  assert.equal(report.observedSampleCount, 1);
  assert.equal(report.successfulSampleCount, 1);
  assert.equal(report.availabilityRatio, 1);
  assert.equal(report.excludedSampleCount, 1);
  assert.deepEqual(report.sources.find((source) => source.sourceId === 'quarantined-timeout'), {
    sourceId: 'quarantined-timeout',
    observedSampleCount: 0,
    successfulSampleCount: 0,
    availabilityRatio: null,
  });
});
