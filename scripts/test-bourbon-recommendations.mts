import assert from 'node:assert/strict';
import {
  buildRecommendationFeedbackModel,
  normalizeRecommendationFeedbackEntries,
  recommendationReadiness,
  rankRecommendationCandidates,
  scoreMarketSignals,
} from '../src/lib/bourbon-recommendations.ts';

const normalizedFeedback = normalizeRecommendationFeedbackEntries({ entries: [
  { bottleId: 'valid', bottleName: 'Bottle & One', signal: 'useful', matchedTags: ['Oak', 42], createdAt: '2026-07-21T10:00:00.000Z' },
  { bottleId: '', bottleName: 'Invalid', signal: 'useful' },
] });
assert.equal(normalizedFeedback.length, 1, 'invalid persisted feedback is ignored');
assert.equal(normalizedFeedback[0].canonicalKey, 'bottle one', 'legacy feedback uses bottle identity canonicalization');
assert.deepEqual(normalizedFeedback[0].matchedTags, ['Oak'], 'invalid matched tags are removed');
assert.equal(normalizeRecommendationFeedbackEntries({ entries: [{
  bottleId: 'bounded', bottleName: 'Bounded', signal: 'useful', matchedTags: [], score: Number.MAX_VALUE, createdAt: '2026-07-21T10:00:00.000Z',
}] })[0].score, 100, 'persisted recommendation scores are bounded');

const deduplicatedFeedback = normalizeRecommendationFeedbackEntries({ entries: [
  { bottleId: 'same-old', bottleName: 'Weller Special Reserve', signal: 'useful', matchedTags: [], createdAt: '2026-07-20T12:00:00.000Z' },
  { bottleId: 'same-new', bottleName: 'Weller Special Reserve', signal: 'not_for_me', matchedTags: [], createdAt: '2026-07-21T12:00:00.000Z' },
] });
assert.equal(deduplicatedFeedback.length, 1, 'legacy feedback keeps one row per canonical bottle');
assert.equal(deduplicatedFeedback[0].signal, 'not_for_me', 'the newest legacy signal wins before atomic migration');

const identityNormalized = normalizeRecommendationFeedbackEntries({ entries: [{
  bottleId: 'legacy-weller',
  bottleName: 'Kentucky Weller Special Reserve Whiskey 750ml',
  signal: 'not_for_me',
  matchedTags: [`${'x'.repeat(80)}`, ...Array.from({ length: 20 }, (_, index) => `tag-${index}`)],
  createdAt: '2026-07-21T10:00:00.000Z',
}] });
assert.equal(identityNormalized[0].canonicalKey, 'reserve special weller', 'canonical keys sort tokens and remove bottle identity stopwords');
assert.equal(identityNormalized[0].matchedTags.length, 12, 'feedback tags are capped');
assert.ok(identityNormalized[0].matchedTags.every((tag) => tag.length <= 48), 'each feedback tag is length capped');

const overlongCanonical = normalizeRecommendationFeedbackEntries({ entries: [{
  bottleId: 'too-long',
  bottleName: 'Valid Bottle',
  canonicalKey: Array.from({ length: 50 }, (_, index) => `token${index}`).join(' '),
  signal: 'not_for_me',
  matchedTags: [],
  createdAt: '2026-07-21T10:00:00.000Z',
}] });
assert.equal(overlongCanonical.length, 0, 'overlong canonical keys are rejected instead of entering feedback state');

const feedback = buildRecommendationFeedbackModel([
  {
    bottleId: 'bottle-alpha',
    bottleName: 'Bottle Alpha',
    canonicalKey: 'bottle alpha',
    signal: 'saved',
    matchedTags: ['Caramel', 'Oak'],
    createdAt: '2026-07-20T12:00:00.000Z',
  },
  {
    bottleId: 'bottle-alpha',
    bottleName: 'Bottle Alpha',
    canonicalKey: 'bottle alpha',
    signal: 'not_for_me',
    matchedTags: ['Caramel', 'Oak'],
    createdAt: '2026-07-21T12:00:00.000Z',
  },
  {
    bottleId: 'bottle-beta',
    bottleName: 'Bottle Beta',
    canonicalKey: 'bottle beta',
    signal: 'saved',
    matchedTags: ['Cherry'],
    createdAt: '2026-07-21T13:00:00.000Z',
  },
]);

assert.equal(feedback.directSignals['alpha bottle'], 'not_for_me', 'the newest direct signal wins for a bottle');
assert.equal(feedback.suppressedKeys.includes('alpha bottle'), true, 'dismissed bottles are suppressed');
assert.equal(feedback.suppressedKeys.includes('beta bottle'), true, 'saved bottles are not repeatedly recommended');
assert.ok((feedback.tagAdjustments.Caramel || 0) < 0, 'not-for-me feedback downweights matching taste tags');
assert.ok((feedback.tagAdjustments.Cherry || 0) > 0, 'saved feedback strengthens matching taste tags');

const legacySuppression = buildRecommendationFeedbackModel(identityNormalized);
const legacySuppressedRanking = rankRecommendationCandidates([{
  canonicalKey: 'weller reserve special',
  bottleName: 'Weller Special Reserve',
  baseScore: 20,
  matchedTags: ['Caramel'],
  profileConfidence: 'high',
  profileMethod: 'curated',
  recentSignals: [],
}], legacySuppression);
assert.equal(legacySuppressedRanking.length, 0, 'legacy feedback suppresses candidates with the same canonical bottle identity');

const cappedFeedback = buildRecommendationFeedbackModel(Array.from({ length: 40 }, (_, index) => ({
  bottleId: `liked-${index}`,
  bottleName: `Liked Bottle ${index}`,
  canonicalKey: `liked bottle series${index}`,
  signal: 'useful' as const,
  matchedTags: ['Oak', `Flavor ${index}`],
  createdAt: `2026-07-21T10:${String(index).padStart(2, '0')}:00.000Z`,
})));
assert.ok(cappedFeedback.tagAdjustments.Oak <= 3, 'aggregate adjustment for one tag is capped');
const cappedCandidate = rankRecommendationCandidates([{
  canonicalKey: 'candidate',
  bottleName: 'Candidate',
  baseScore: 10,
  matchedTags: Object.keys(cappedFeedback.tagAdjustments),
  profileConfidence: 'high',
  profileMethod: 'curated',
  recentSignals: [],
}], cappedFeedback)[0];
assert.ok(cappedCandidate.tasteScore - 10 <= 6, 'aggregate feedback adjustment for one candidate is capped');

assert.deepEqual(recommendationReadiness(0), { target: 3, ratedBottleCount: 0, remaining: 3, ready: false });
assert.deepEqual(recommendationReadiness(2), { target: 3, ratedBottleCount: 2, remaining: 1, ready: false });
assert.deepEqual(recommendationReadiness(3), { target: 3, ratedBottleCount: 3, remaining: 0, ready: true });

const now = Date.parse('2026-07-21T20:00:00.000Z');
const freshExact = scoreMarketSignals([{ timestamp: '2026-07-21T10:00:00.000Z', exactStore: true, alertGrade: true }], now);
const fiveDaysOld = scoreMarketSignals([{ timestamp: '2026-07-16T20:00:00.000Z', exactStore: false, alertGrade: false }], now);
const stale = scoreMarketSignals([{ timestamp: '2026-06-01T20:00:00.000Z', exactStore: true, alertGrade: true }], now);
assert.ok(freshExact > fiveDaysOld, 'fresh exact-store evidence outranks older broad evidence');
assert.ok(fiveDaysOld > stale, 'recent evidence outranks stale evidence');
assert.equal(stale, 0, 'stale market evidence cannot boost a recommendation');

const ranked = rankRecommendationCandidates([
  {
    canonicalKey: 'unknown fallback', bottleName: 'Unknown Fallback', producer: 'Fallback Co',
    baseScore: 20, matchedTags: ['Balanced'], profileConfidence: 'low', profileMethod: 'inferred', fallbackOnly: true,
    recentSignals: [],
  },
  {
    canonicalKey: 'curated match', bottleName: 'Curated Match', producer: 'Producer A',
    baseScore: 11, matchedTags: ['Caramel', 'Oak'], profileConfidence: 'high', profileMethod: 'curated',
    recentSignals: [],
  },
  {
    canonicalKey: 'same producer second', bottleName: 'Same Producer Second', producer: 'Producer A',
    baseScore: 10.8, matchedTags: ['Caramel'], profileConfidence: 'high', profileMethod: 'curated',
    recentSignals: [],
  },
  {
    canonicalKey: 'fresh local', bottleName: 'Fresh Local', producer: 'Producer B',
    baseScore: 8.5, matchedTags: ['Spice'], profileConfidence: 'medium', profileMethod: 'inferred',
    recentSignals: [{ timestamp: '2026-07-21T10:00:00.000Z', exactStore: true, alertGrade: true }],
  },
  {
    canonicalKey: 'bottle alpha', bottleName: 'Bottle Alpha', producer: 'Producer C',
    baseScore: 30, matchedTags: ['Caramel'], profileConfidence: 'high', profileMethod: 'curated',
    recentSignals: [],
  },
], feedback, { limit: 4, now });

assert.equal(ranked.some((item) => item.canonicalKey === 'bottle alpha'), false, 'dismissed bottles never return');
assert.ok(ranked.findIndex((item) => item.canonicalKey === 'curated match') < ranked.findIndex((item) => item.canonicalKey === 'unknown fallback'), 'curated evidence outranks a weak fallback even when the fallback has a larger raw score');
assert.equal(ranked[0]?.lane, 'best_match', 'the strongest recommendation is labeled as the best match');
assert.equal(ranked.some((item) => item.canonicalKey === 'fresh local' && item.lane === 'local_opportunity'), true, 'fresh local evidence creates a simple nearby lane');
assert.notEqual(ranked[0]?.producer, ranked[1]?.producer, 'the first recommendations are diversified by producer');

const reorderedDiversity = rankRecommendationCandidates([
  {
    canonicalKey: 'local x', bottleName: 'Local X', producer: 'Producer X',
    baseScore: 8, matchedTags: ['Oak'], profileConfidence: 'high', profileMethod: 'curated',
    recentSignals: [{ timestamp: '2026-07-21T10:00:00.000Z', exactStore: true, alertGrade: true }],
  },
  {
    canonicalKey: 'steady y', bottleName: 'Steady Y', producer: 'Producer Y',
    baseScore: 8.8, matchedTags: ['Spice'], profileConfidence: 'high', profileMethod: 'curated', recentSignals: [],
  },
  {
    canonicalKey: 'best taste x', bottleName: 'Best Taste X', producer: 'Producer X',
    baseScore: 9.2, matchedTags: ['Cherry'], profileConfidence: 'high', profileMethod: 'curated', recentSignals: [],
  },
], buildRecommendationFeedbackModel([]), { limit: 3, now });
assert.notEqual(reorderedDiversity[0]?.producer, reorderedDiversity[1]?.producer, 'best-match reordering preserves top-card producer diversity');

console.log('bourbon recommendation tests passed');
