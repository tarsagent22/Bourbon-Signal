import test from 'node:test';
import assert from 'node:assert/strict';

import { guardStateReport } from '../src/state-report-guard.mjs';
import { markStaleReport } from '../src/state-report-fallback.mjs';

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
  previous.sourceCircuitState = { 'va:configured:fixture': { state: 'closed', consecutiveFailures: 0 } };
  candidate.sourceCircuitState = { 'va:configured:fixture': { state: 'open', consecutiveFailures: 3 } };
  candidate.sourceResults = [{ sourceId: 'va:configured:fixture', status: 'collapsed', attemptCount: 1 }];
  const result = guardStateReport({ previous, candidate, now: '2026-07-13T01:00:00.000Z' });

  assert.equal(result.accepted, false);
  assert.equal(result.report.signals.length, 100);
  assert.equal(result.report.stale, true);
  assert.match(result.report.staleReason, /signal count collapsed from 100 to 20/i);
  assert.equal(result.report.signals[0].observedAt, '2026-07-13T00:00:00.000Z');
  assert.equal(result.report.lastGoodAt, '2026-07-13T00:00:00.000Z');
  assert.equal(result.report.signals.every((signal) => signal.canAlertAsInventory === false && signal.canAlertAsWatch === false), true);
  assert.equal(result.report.sourceCircuitState['va:configured:fixture'].state, 'open');
  assert.equal(result.report.sourceResults[0].status, 'collapsed');
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

test('preserves last-good public bottle rows when unmatched inventory inflates total and actionable counts', () => {
  const previous = report('IN', 1000, { actionable: 100 });
  previous.signals.slice(0, 72).forEach((signal, index) => { signal.canonicalId = `bottle-${index}`; });
  const candidate = report('IN', 1400, { actionable: 295 });
  candidate.signals[0].canonicalId = 'bottle-0';

  const result = guardStateReport({ previous, candidate, now: '2026-07-17T11:00:00.000Z' });
  assert.equal(result.accepted, false);
  assert.match(result.reason, /public bottle candidate count collapsed from 72 to 1/i);
  assert.equal(result.report.status, 'stale_useful_quality_fallback');
  assert.equal(result.report.signals.length, 1000);
  assert.equal(result.report.signals.every((signal) => signal.canAlertAsInventory === false), true);
});

test('protects low-volume public bottle lanes from collapsing behind inflated generic inventory', () => {
  const previous = report('IN', 20, { actionable: 10 });
  previous.signals.slice(0, 4).forEach((signal, index) => { signal.canonicalId = `limited-${index}`; });
  const candidate = report('IN', 40, { actionable: 20 });

  const result = guardStateReport({ previous, candidate });
  assert.equal(result.accepted, false);
  assert.match(result.reason, /public bottle candidate count collapsed from 4 to 0/i);
});

test('uses projected customer tier rather than generic canonical identity for public-collapse guards', () => {
  const previous = report('IN', 1000, { actionable: 100 });
  previous.signals.slice(0, 72).forEach((signal, index) => { signal.canonicalId = `limited-${index}`; signal.tier = 'limited'; });
  const candidate = report('IN', 2000, { actionable: 300 });
  candidate.signals.slice(0, 300).forEach((signal, index) => { signal.canonicalId = `core-${index}`; signal.tier = 'core'; });
  const isPublicBottleCandidate = (signal) => ['limited', 'allocated', 'unicorn'].includes(signal.tier);

  const result = guardStateReport({ previous, candidate, options: { isPublicBottleCandidate } });
  assert.equal(result.accepted, false);
  assert.match(result.reason, /public bottle candidate count collapsed from 72 to 0/i);
});

test('duplicate inventory rows cannot hide a collapse in unique public bottle-store combinations', () => {
  const previous = report('IN', 1000, { actionable: 100 });
  previous.signals.slice(0, 72).forEach((signal, index) => {
    signal.canonicalName = `Rare Bottle ${index}`;
    signal.locationName = `Store ${index}`;
    signal.projectedTier = 'limited';
  });
  const candidate = report('IN', 1400, { actionable: 295 });
  candidate.signals.slice(0, 295).forEach((signal, index) => {
    signal.canonicalName = `Rare Bottle ${index % 7}`;
    signal.locationName = `Store ${index % 7}`;
    signal.projectedTier = 'limited';
  });
  const result = guardStateReport({
    previous,
    candidate,
    options: { isPublicBottleCandidate: (signal) => signal.projectedTier === 'limited' },
  });
  assert.equal(result.accepted, false);
  assert.match(result.reason, /public bottle candidate count collapsed from 72 to 7/i);
});

test('a stale last-good fallback remains the public baseline on the next collection attempt', () => {
  const previous = report('IN', 1000, { actionable: 100 });
  previous.signals.slice(0, 72).forEach((signal, index) => { signal.canonicalId = `limited-${index}`; signal.tier = 'limited'; });
  const stalePrevious = markStaleReport(previous, { id: 'IN', label: 'Indiana' }, 'worker failed', '2026-07-17T11:00:00.000Z');
  const candidate = report('IN', 2000, { actionable: 300 });
  candidate.signals.slice(0, 300).forEach((signal, index) => { signal.canonicalId = `core-${index}`; signal.tier = 'core'; });
  const isPublicBottleCandidate = (signal) => ['limited', 'allocated', 'unicorn'].includes(signal.tier);

  const result = guardStateReport({ previous: stalePrevious, candidate, options: { isPublicBottleCandidate } });
  assert.equal(result.accepted, false);
  assert.match(result.reason, /public bottle candidate count collapsed from 72 to 0/i);
  assert.equal(result.report.signals.every((signal) => signal.canAlertAsInventory === false), true);
});

test('statewide tier rows do not inflate the stale store-level public baseline', () => {
  const previous = report('NC', 1274, { actionable: 76 });
  previous.signals.forEach((signal, index) => {
    signal.canonicalId = `limited-${index}`;
    signal.tier = 'limited';
    if (index >= 76) signal.locationPrecision = 'statewide_catalog';
  });
  const stalePrevious = markStaleReport(previous, { id: 'NC', label: 'North Carolina' }, 'worker failed');
  const candidate = report('NC', 1274, { actionable: 80 });
  candidate.signals.forEach((signal, index) => {
    signal.canonicalId = index < 80 ? `limited-new-${index}` : `core-${index}`;
    signal.tier = index < 80 ? 'limited' : 'core';
    if (index >= 80) signal.locationPrecision = 'statewide_catalog';
  });
  const isPublicBottleCandidate = (signal) => ['limited', 'allocated', 'unicorn'].includes(signal.tier);

  const result = guardStateReport({ previous: stalePrevious, candidate, options: { isPublicBottleCandidate } });
  assert.equal(result.accepted, true);
});
