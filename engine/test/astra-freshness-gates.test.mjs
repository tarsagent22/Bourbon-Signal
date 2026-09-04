import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStateQualityInputs, scoreStateQuality, buildStateQualityScorecard, compareStateQuality, mergePartialRefreshStateQuality } from '../src/state-quality-scorecard.mjs';
import { decideSourceSchedule } from '../src/optimization/source-scheduler.mjs';
import { selectScheduledStates, updateStateRunMetric } from '../src/optimization/state-run-plan.mjs';
import { decideCollectorProbe, updateCollectorMetadata } from '../src/optimization/collector-state.mjs';
import { createSourceAdapter } from '../src/sources/source-adapter.mjs';
import { runSourceAdapters } from '../src/sources/source-runner.mjs';

const now = '2026-09-04T20:00:00.000Z';
const nowMs = Date.parse(now);
const ago = (hours) => new Date(nowMs - hours * 3600000).toISOString();
const strong = { state: 'VA', coverageTier: 'live_store_inventory', signalCount: 100, dropCount: 100, storeLevelDropCount: 100, alertCandidateCount: 5, sourceCount: 3, roadblockCount: 0, freshestObservedAt: now, status: 'useful' };
const row = (i, age = 1) => ({ state: 'VA', storeId: `store-${i}`, area: `area-${i}`, locationPrecision: 'store_level', source: `source-${i % 3}`, canAlertAsInventory: true, lastConfirmedAt: ago(age), observedAt: ago(age), sourceEventAt: ago(100) });
function quality(rows, overrides = {}) {
  const [input] = buildStateQualityInputs({ stateCoverage: { states: [strong] }, drops: rows, alerts: [] });
  return scoreStateQuality({ ...input, ...overrides }, { nowMs });
}

test('F05 exact audit: historical 100/100/5/3 evidence cannot compensate for 2020 freshness', () => {
  const result = scoreStateQuality({ ...strong, freshestObservedAt: '2020-01-01T00:00:00.000Z', status: 'stale_useful' }, { nowMs });
  assert.equal(result.score, 80);
  assert.equal(result.releaseEligible, false);
  assert.equal(result.input.dropCount, 100);
});
test('future confirmation is rejected beyond five-minute tolerance, including aggregate API', () => {
  assert.equal(scoreStateQuality({ ...strong, freshestObservedAt: ago(-1) }, { nowMs }).releaseEligible, false);
  assert.equal(quality(Array.from({ length: 100 }, (_, i) => row(i, -1))).releaseEligible, false);
  assert.equal(quality(Array.from({ length: 100 }, (_, i) => row(i, -5 / 60))).releaseEligible, true);
  assert.equal(quality(Array.from({ length: 100 }, (_, i) => row(i, -(5 / 60 + 1 / 3600000)))).releaseEligible, false);
});
test('old event with recently confirmed inventory is healthy; old confirmation with new event is not', () => {
  const fresh = quality(Array.from({ length: 100 }, (_, i) => row(i)));
  assert.equal(fresh.releaseEligible, true);
  assert.equal(fresh.freshness.confirmationAgeHours.p50, 1);
  assert.equal(fresh.freshness.eventAgeHours.p50, 100);
  assert.equal(quality(Array.from({ length: 100 }, (_, i) => ({ ...row(i, 100), sourceEventAt: now, observedAt: now }))).releaseEligible, false);
});
test('one fresh row cannot turn 99 stale stores/areas green; breadth and source flags are unchanged', () => {
  const rows = Array.from({ length: 100 }, (_, i) => row(i, i ? 100 : 1));
  const before = structuredClone(rows);
  const result = quality(rows);
  assert.equal(result.releaseEligible, false);
  assert.equal(result.freshness.freshRowRatio, 0.01);
  assert.equal(result.freshness.freshStoreRatio, 0.01);
  assert.equal(result.freshness.freshAreaRatio, 0.01);
  assert.equal(result.input.dropCount, 100);
  assert.equal(result.input.storeLevelDropCount, 100);
  assert.deepEqual(rows, before);
});
test('store/area distribution cannot be masked by many fresh rows at one store', () => {
  const rows = [...Array.from({ length: 100 }, () => row(0)), ...Array.from({ length: 10 }, (_, i) => row(i + 1, 100))];
  assert.equal(quality(rows).releaseEligible, false);
});
test('stale flags and explicit invalid confirmations cannot be laundered by fresh observed/event time', () => {
  for (const changes of [{ stale: true }, { sourceStale: true }, { source_stale: true }, { raw: { sourceRuntimeNonAlertable: true } }, { lastConfirmedAt: 'invalid' }]) {
    assert.equal(quality(Array.from({ length: 100 }, (_, i) => ({ ...row(i), ...changes }))).releaseEligible, false);
  }
});
test('two-hour live boundary and slower event-watch lane are separate', () => {
  assert.equal(quality(Array.from({ length: 100 }, (_, i) => row(i, 2))).releaseEligible, true);
  assert.equal(quality(Array.from({ length: 100 }, (_, i) => row(i, 2.0001))).releaseEligible, false);
  const watch = Array.from({ length: 8 }, (_, i) => ({ ...row(i), canAlertAsInventory: false, canAlertAsWatch: true, sourceEventAt: ago(48) }));
  assert.equal(quality(watch, { coverageTier: 'distillery_release_watch' }).releaseEligible, true);
  assert.equal(quality(watch.map((r) => ({ ...r, sourceEventAt: ago(100), lastConfirmedAt: now })), { coverageTier: 'distillery_release_watch' }).releaseEligible, false);
});
test('freshness blocks state admission but retained partitions do not freeze global publication', () => {
  const stale = quality(Array.from({ length: 100 }, (_, i) => row(i, 100)), { status: 'stale_useful_quality_fallback' });
  assert.equal(stale.releaseEligible, false);
  for (const states of [[], [{ ...stale, releaseEligible: true }], [stale]]) {
    const comparison = compareStateQuality({ states }, { states: [stale] });
    assert.equal(comparison.ok, true);
    assert.ok(comparison.warnings.some(message => message.includes('insufficient fresh evidence')));
  }
});
test('partial fallback re-ages old scorecard without clearing historical rows', () => {
  const [input] = buildStateQualityInputs({ stateCoverage: { states: [strong] }, drops: Array.from({ length: 100 }, (_, i) => row(i)), alerts: [] });
  const previous = buildStateQualityScorecard([input], { generatedAt: now });
  const current = buildStateQualityScorecard([input], { generatedAt: ago(-3) });
  const merged = mergePartialRefreshStateQuality(previous, current, { partialRefresh: true, attemptedStateIds: ['VA'], fallbackStateIds: ['VA'] });
  assert.equal(previous.states[0].releaseEligible, true);
  assert.equal(merged.states[0].releaseEligible, false);
  assert.equal(merged.states[0].input.dropCount, 100);
});

test('a recently crawled watch/catalog row cannot substitute for live inventory confirmation', () => {
  const watch = Array.from({ length: 100 }, (_, i) => ({ ...row(i), canAlertAsInventory: false, canAlertAsWatch: true, type: 'release_watch' }));
  assert.equal(quality(watch).releaseEligible, false);
});
test('missing and invalid timestamps fail closed; future event does not discredit valid inventory confirmation', () => {
  for (const stamp of [null, '', 'invalid']) {
    assert.equal(quality(Array.from({ length: 100 }, (_, i) => ({ ...row(i), lastConfirmedAt: stamp, observedAt: stamp }))).releaseEligible, false);
  }
  assert.equal(quality(Array.from({ length: 100 }, (_, i) => ({ ...row(i), sourceEventAt: ago(-24) }))).releaseEligible, true);
});
test('fresh coverage floor is inclusive at 75 percent and fails just below', () => {
  assert.equal(quality(Array.from({ length: 100 }, (_, i) => row(i, i < 75 ? 1 : 100))).releaseEligible, true);
  assert.equal(quality(Array.from({ length: 100 }, (_, i) => row(i, i < 74 ? 1 : 100))).releaseEligible, false);
});

const cold = { sourceId: 'inventory', usefulChanges: 0, probes: 100, failures: 0, consecutiveUnchanged: 100, lastProbeAt: now };
const deadline = ago(-1);
test('E08 unchanged source polling cannot pass known absolute freshness deadline', () => {
  const baseline = decideSourceSchedule(cold, { now });
  const metrics = { ...cold, freshnessDeadlineAt: deadline };
  const before = structuredClone(metrics);
  const schedule = decideSourceSchedule(metrics, { now });
  assert.equal(schedule.nextProbeAt, deadline);
  assert.equal(schedule.cadenceMs, 3600000);
  assert.equal(schedule.roiScore, baseline.roiScore);
  assert.ok(schedule.reasons.includes('unchanged_backoff'));
  assert.ok(schedule.reasons.includes('freshness_deadline'));
  assert.deepEqual(metrics, before);
});
test('confirmation plus TTL deadline is anchored to confirmation, never last successful fetch', () => {
  const result = decideSourceSchedule({ ...cold, lastConfirmedAt: ago(1.5), freshnessMaxAgeMs: 7200000, lastSuccessfulProbeAt: now }, { now });
  assert.equal(result.nextProbeAt, ago(-0.5));
});
test('expired deadline is due immediately even below min cadence; missing deadline keeps directory backoff', () => {
  const result = decideSourceSchedule({ ...cold, freshnessDeadlineAt: ago(1) }, { now, minCadenceMs: 3600000 });
  assert.equal(result.decision, 'probe_now');
  assert.equal(result.cadenceMs, 0);
  assert.ok(Date.parse(result.nextProbeAt) <= nowMs);
  assert.equal(decideSourceSchedule(cold, { now }).cadenceMs, 86400000);
});
test('disabled, policy-blocked/403 and retry-after cannot be accelerated by freshness', () => {
  assert.equal(decideSourceSchedule({ ...cold, disabled: true, freshnessDeadlineAt: ago(1) }, { now }).decision, 'disabled');
  for (const blocked of [{ policyBlocked: true }, { lastStatus: 403 }]) {
    const baseline = decideSourceSchedule({ ...cold, ...blocked }, { now });
    const result = decideSourceSchedule({ ...cold, ...blocked, freshnessDeadlineAt: ago(1) }, { now });
    assert.equal(result.nextProbeAt, baseline.nextProbeAt);
  }
  assert.equal(decideSourceSchedule({ ...cold, freshnessDeadlineAt: ago(1), retryAfterAt: deadline }, { now }).nextProbeAt, deadline);
});
test('state metric updates preserve known deadline and useful-change counts across unchanged success/failure', () => {
  const previous = { VA: { ...cold, usefulChanges: 7, contentHash: 'same', freshnessDeadlineAt: deadline, lastConfirmedAt: ago(1), freshnessMaxAgeMs: 7200000 } };
  const next = updateStateRunMetric(previous, { id: 'VA', ok: true, contentHash: 'same', finishedAt: now });
  assert.equal(next.VA.freshnessDeadlineAt, deadline);
  assert.equal(next.VA.usefulChanges, 7);
  assert.equal(next.VA.consecutiveUnchanged, 101);
  const failed = updateStateRunMetric(next, { id: 'VA', ok: false, finishedAt: now, lastConfirmedAt: now, freshnessDeadlineAt: ago(-24) });
  assert.equal(failed.VA.lastConfirmedAt, ago(1));
  assert.equal(failed.VA.freshnessDeadlineAt, deadline);
  assert.equal(selectScheduledStates([{ id: 'VA' }], failed, { now })[0].nextProbeAt, deadline);
});
test('runtime consumes supplied deadlines: due inventory runs while unchanged directory waits', async () => {
  const called = [];
  const adapters = ['inventory', 'directory'].map((id) => createSourceAdapter({
    id, label: id, url: `https://${id}.example.test`,
    execute: async () => { called.push(id); return { signals: [] }; },
    recordCount: (value) => value.signals.length,
  }));
  const result = await runSourceAdapters(adapters, {}, { now: () => now,
    previousResults: { directory: { sourceId: 'directory', status: 'success', value: { signals: [] } } },
    sourceMetrics: { inventory: { ...cold, freshnessDeadlineAt: now }, directory: cold },
  });
  assert.deepEqual(called, ['inventory']);
  assert.equal(result.results.find((r) => r.sourceId === 'inventory').status, 'success');
  assert.equal(result.results.find((r) => r.sourceId === 'directory').status, 'not_due');
});
test('repeated unchanged polling remains bounded and metrics are not invented', () => {
  let metrics = { VA: { ...cold, contentHash: 'same', usefulChanges: 7, lastConfirmedAt: now, freshnessMaxAgeMs: 7200000 } };
  for (let i = 1; i <= 12; i++) {
    const checked = ago(-i / 4);
    metrics = updateStateRunMetric(metrics, { id: 'VA', ok: true, contentHash: 'same', finishedAt: checked });
    const schedule = decideSourceSchedule(metrics.VA, { now: checked });
    assert.ok(Date.parse(schedule.nextProbeAt) <= nowMs + 7200000);
    assert.equal(metrics.VA.usefulChanges, 7);
    assert.equal(metrics.VA.lastConfirmedAt, now);
  }
  const renewed = updateStateRunMetric(metrics, { id: 'VA', ok: true, contentHash: 'same', finishedAt: ago(-3), lastConfirmedAt: ago(-3) });
  assert.equal(decideSourceSchedule(renewed.VA, { now: ago(-3) }).nextProbeAt, ago(-5));
  assert.equal(renewed.VA.usefulChanges, 7);
});
test('collector metadata and due check honor evidence deadline without making a 304 a new confirmation', () => {
  const previous = { contentHash: 'same', lastConfirmedAt: ago(1), freshnessDeadlineAt: deadline, usefulChanges: 7 };
  const next = updateCollectorMetadata(previous, { status: 304, checkedAt: now }, { cadenceMs: 86400000 });
  assert.equal(next.nextProbeAt, deadline);
  assert.equal(next.lastConfirmedAt, previous.lastConfirmedAt);
  assert.equal(next.usefulChanges, 7);
  assert.equal(decideCollectorProbe({ ...next, nextProbeAt: ago(-24) }, { now: deadline }).decision, 'probe');
});
