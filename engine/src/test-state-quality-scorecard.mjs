import assert from 'node:assert/strict';
import {
  buildStateQualityScorecard,
  compareStateQuality,
  scoreStateQuality,
} from './state-quality-scorecard.mjs';

const strong = scoreStateQuality({
  state: 'AA',
  coverageTier: 'live_store_inventory',
  signalCount: 1000,
  dropCount: 250,
  storeLevelDropCount: 240,
  alertCandidateCount: 20,
  sourceCount: 4,
  roadblockCount: 1,
  freshestObservedAt: new Date().toISOString(),
  status: 'useful',
});
assert.ok(strong.score >= 80, `strong state should score >=80, got ${strong.score}`);
assert.equal(strong.releaseEligible, true);

const weak = scoreStateQuality({
  state: 'BB',
  coverageTier: 'live_store_inventory',
  signalCount: 4,
  dropCount: 2,
  storeLevelDropCount: 0,
  alertCandidateCount: 0,
  sourceCount: 1,
  roadblockCount: 12,
  freshestObservedAt: null,
  status: 'stale_useful',
});
assert.ok(weak.score < 50, `weak state should score <50, got ${weak.score}`);
assert.equal(weak.releaseEligible, false);
assert.ok(weak.weaknesses.includes('no_store_level_drops'));
assert.ok(weak.weaknesses.includes('unknown_freshness'));

const watchLane = scoreStateQuality({
  state: 'CC',
  coverageTier: 'distillery_release_watch',
  signalCount: 25,
  dropCount: 8,
  storeLevelDropCount: 0,
  alertCandidateCount: 2,
  sourceCount: 3,
  roadblockCount: 0,
  freshestObservedAt: new Date().toISOString(),
  status: 'useful',
});
assert.ok(!watchLane.weaknesses.includes('no_store_level_drops'), 'watch lanes must not be judged as live store inventory');

const scorecard = buildStateQualityScorecard([strong.input, weak.input, watchLane.input], { generatedAt: '2026-07-09T00:00:00.000Z' });
assert.equal(scorecard.schemaVersion, 2);
assert.equal(scorecard.states.length, 3);
assert.equal(scorecard.summary.releaseBlockedStates, 1);
assert.equal(scorecard.states[0].state, 'AA');

const regression = compareStateQuality(
  { states: [{ state: 'AA', score: 90, releaseEligible: true, dropCount: 100 }] },
  { states: [{ state: 'AA', score: 60, releaseEligible: false, dropCount: 30 }] },
  { maxScoreDrop: 15, minDropRatio: 0.5 },
);
assert.equal(regression.ok, false);
assert.ok(regression.failures.some((failure) => failure.includes('score')));
assert.ok(regression.failures.some((failure) => failure.includes('drops')));

const degradedRegression = compareStateQuality(
  { states: [{ ...strong, state: 'AA', releaseEligible: true }] },
  { states: [{ ...strong, state: 'AA', releaseEligible: true, input: { ...strong.input, status: 'degraded' }, weaknesses: ['degraded_state_status'] }] },
);
assert.equal(degradedRegression.ok, false);
assert.ok(degradedRegression.failures.some((failure) => failure.includes('degraded')));

const inventoryChurn = compareStateQuality(
  { states: [{ state: 'FL', score: 66, releaseEligible: true, input: { dropCount: 24, status: 'useful' } }] },
  { states: [{ state: 'FL', score: 64, releaseEligible: false, weaknesses: ['no_alert_candidates'], input: { dropCount: 22, status: 'useful' } }] },
);
assert.equal(inventoryChurn.ok, true, 'normal rare-inventory churn must not block a fresh whole-site snapshot');
assert.ok(inventoryChurn.warnings.some((warning) => warning.includes('without a hard source failure')));

const hardEligibilityRegression = compareStateQuality(
  { states: [{ state: 'FL', score: 66, releaseEligible: true, input: { dropCount: 24, status: 'useful' } }] },
  { states: [{ state: 'FL', score: 45, releaseEligible: false, weaknesses: ['no_store_level_drops'], input: { dropCount: 22, status: 'useful' } }] },
  { maxScoreDrop: 30 },
);
assert.equal(hardEligibilityRegression.ok, false);
assert.ok(hardEligibilityRegression.failures.some((failure) => failure.includes('release eligible')));

const healthyLargeInventoryChurn = compareStateQuality(
  { states: [{ state: 'TX', score: 84, releaseEligible: true, input: { dropCount: 138, status: 'useful' } }] },
  { states: [{ state: 'TX', score: 78, releaseEligible: true, weaknesses: [], input: { dropCount: 67, status: 'useful' } }] },
);
assert.equal(healthyLargeInventoryChurn.ok, true, 'healthy inventory churn above the severe-collapse floor must not block the entire production refresh');
assert.ok(healthyLargeInventoryChurn.warnings.some((warning) => warning.includes('public drops fell')));

const severeInventoryCollapse = compareStateQuality(
  { states: [{ state: 'TX', score: 84, releaseEligible: true, input: { dropCount: 138, status: 'useful' } }] },
  { states: [{ state: 'TX', score: 70, releaseEligible: true, weaknesses: [], input: { dropCount: 30, status: 'useful' } }] },
  { maxScoreDrop: 20 },
);
assert.equal(severeInventoryCollapse.ok, false);
assert.ok(severeInventoryCollapse.failures.some((failure) => failure.includes('public drops fell')));

console.log('State quality scorecard tests passed.');
