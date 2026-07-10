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
assert.equal(scorecard.schemaVersion, 1);
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

console.log('State quality scorecard tests passed.');
