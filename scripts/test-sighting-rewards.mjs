import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basePointsForSighting, communityVerified, reconcileMemberRewards, summarizeMemberRewards } from '../src/lib/sighting-rewards.ts';
import { normalizeSightingsForRewards } from '../src/lib/sighting-reward-tiers.ts';

const sighting = (id, rarityTier, createdAt, extra = {}) => ({
  id,
  bottleName: `${id} bottle`,
  bottleId: id,
  rarityTier,
  storeId: 'store-1',
  storeName: 'Store One',
  storeCity: 'Raleigh',
  storeState: 'NC',
  sightingType: 'seen_in_store',
  source: 'custom',
  createdAt,
  ...extra,
});

assert.equal(basePointsForSighting({ rarityTier: 'limited' }), 1);
assert.equal(basePointsForSighting({ rarityTier: 'allocated' }), 2);
assert.equal(basePointsForSighting({ rarityTier: 'unicorn' }), 3);
assert.equal(basePointsForSighting({ rarityTier: undefined }), 1, 'a valid manual or not-yet-classified bottle sighting still earns its posting point');

const normalizedHistorical = normalizeSightingsForRewards([
  sighting('manual-unicorn', 'unicorn', '2026-07-01T14:00:00Z', { reviewState: { needsBottleReview: true, manualBottleName: 'Manual Unicorn' } }),
  sighting('known-client-unicorn', 'unicorn', '2026-07-01T15:00:00Z', { bottleId: 'known-allocated', bottleName: 'Known Allocated' }),
], [{ id: 'known-allocated', canonicalName: 'Known Allocated', aliases: [], availability: 'allocated' }]);
assert.equal(normalizedHistorical[0].rarityTier, 'limited', 'historical manual sightings cannot retain client-selected unicorn points');
assert.equal(normalizedHistorical[1].rarityTier, 'allocated', 'historical known bottles use the catalog tier rather than a stored client tier');
assert.equal(communityVerified(3, 0), true);
assert.equal(communityVerified(4, 0), true);
assert.equal(communityVerified(5, 2), true);
assert.equal(communityVerified(6, 2), true);

let rewards = reconcileMemberRewards([
  sighting('a', 'allocated', '2026-07-03T14:00:00Z'),
  sighting('u', 'unicorn', '2026-07-04T14:00:00Z', { rewardState: { photoProof: { url: 'https://example.com/photo.jpg', uploadedAt: '2026-07-04T15:00:00Z', status: 'pending' } } }),
], undefined, '2026-07-04T16:00:00Z');
assert.equal(rewards.points, 8, 'allocated base 2 + unicorn base 3 + First Sighting 1 + Photo Finish 1 + Unicorn Hunter bronze 1');
let summary = summarizeMemberRewards([
  sighting('a', 'allocated', '2026-07-03T14:00:00Z'),
  sighting('u', 'unicorn', '2026-07-04T14:00:00Z', { rewardState: { photoProof: { url: 'https://example.com/photo.jpg', uploadedAt: '2026-07-04T15:00:00Z', status: 'pending' } } }),
], rewards);
assert.equal(summary.eligibleSightings, 2);
assert.equal(summary.verifiedSightings, 0);
assert.equal(summary.photoSightings, 1);
assert.equal(summary.badgeProgress.some((badge) => badge.id === 'unicorn_hunter_diamond'), true);
assert.equal(summary.badgeProgress.some((badge) => badge.id === 'spotter_diamond'), true);
assert.equal(rewards.badges.some((badge) => /verified/i.test(badge.label)), false, 'sighting badge labels must not use verified language');
const legacySummary = summarizeMemberRewards([], { badges: [{ id: 'verified_scout', label: 'Verified Scout', earnedAt: '2026-07-04T15:00:00Z', pointsAwarded: 1 }], points: 1, ledger: [], currentWeeklyStreak: 0, longestWeeklyStreak: 0 });
assert.equal(legacySummary.badges[0].id, 'helpful_neighbor');
assert.equal(legacySummary.badges[0].label, 'Helpful Neighbor');

rewards = reconcileMemberRewards([
  sighting('a', 'allocated', '2026-07-03T14:00:00Z'),
  sighting('b', 'allocated', '2026-07-10T14:00:00Z'),
], rewards, '2026-07-10T16:00:00Z');
assert.equal(rewards.currentWeeklyStreak, 2);
assert.ok(rewards.ledger.some((entry) => entry.reason === 'streak_maintained_v2' && entry.points === 1));

rewards = reconcileMemberRewards([
  sighting('a', 'allocated', '2026-07-03T14:00:00Z', { rewardState: { rejectedAt: '2026-07-11T00:00:00Z' } }),
  sighting('b', 'allocated', '2026-07-10T14:00:00Z'),
], rewards, '2026-07-11T00:00:00Z');
assert.equal(rewards.points, 3, 'only the remaining allocated base 2 and First Sighting badge 1 should remain');
assert.ok(rewards.ledger.some((entry) => entry.sightingId === 'a' && entry.revokedAt));
assert.ok(rewards.ledger.some((entry) => entry.reason === 'streak_maintained_v2' && entry.revokedAt), 'unsupported streak bonus should be revoked');
assert.ok(!rewards.badges.some((badge) => badge.id === 'photo-finish'), 'unsupported photo badge should be removed');
assert.equal(rewards.currentWeeklyStreak, 1);

const limitedOnly = reconcileMemberRewards([
  sighting('limited-one', 'limited', '2026-07-18T14:00:00Z'),
], undefined, '2026-07-18T16:00:00Z');
assert.equal(limitedOnly.points, 2, 'a valid limited sighting earns one posting point plus the First Sighting badge point');
assert.equal(summarizeMemberRewards([sighting('limited-one', 'limited', '2026-07-18T14:00:00Z')], limitedOnly).eligibleSightings, 1, 'all valid sightings count toward general sighting progress');

const legacyAllocated = {
  points: 1,
  ledger: [{ id: 'legacy-base', sightingId: 'legacy-a', reason: 'sighting_base', points: 1, createdAt: '2026-07-01T14:00:00Z' }],
  badges: [],
  currentWeeklyStreak: 0,
  longestWeeklyStreak: 0,
};
const migrated = reconcileMemberRewards([
  sighting('legacy-a', 'allocated', '2026-07-01T14:00:00Z'),
], legacyAllocated, '2026-07-18T16:00:00Z');
assert.equal(migrated.ledger.filter((entry) => entry.sightingId === 'legacy-a' && !entry.revokedAt).reduce((sum, entry) => sum + entry.points, 0), 2, 'legacy sightings receive only the missing base-point difference');
const migratedAgain = reconcileMemberRewards([
  sighting('legacy-a', 'allocated', '2026-07-01T14:00:00Z'),
], migrated, '2026-07-18T17:00:00Z');
assert.equal(migratedAgain.points, migrated.points, 'base-point migration remains idempotent');

const upgraded = reconcileMemberRewards([
  sighting('legacy-a', 'unicorn', '2026-07-01T14:00:00Z'),
], migratedAgain, '2026-07-18T18:00:00Z');
assert.equal(upgraded.ledger.filter((entry) => entry.sightingId === 'legacy-a' && !entry.revokedAt).reduce((sum, entry) => sum + entry.points, 0), 3, 'later tier upgrades reconcile to the exact target');
const downgraded = reconcileMemberRewards([
  sighting('legacy-a', 'limited', '2026-07-01T14:00:00Z'),
], upgraded, '2026-07-18T19:00:00Z');
assert.equal(downgraded.ledger.filter((entry) => entry.sightingId === 'legacy-a' && !entry.revokedAt).reduce((sum, entry) => sum + entry.points, 0), 1, 'later tier downgrades remove excess base points');

const invalidOnly = reconcileMemberRewards([
  sighting('invalid-only', 'limited', '2026-07-18T14:00:00Z', { rewardState: { rejectedAt: '2026-07-18T15:00:00Z' } }),
], limitedOnly, '2026-07-18T20:00:00Z');
assert.equal(invalidOnly.points, 0, 'a rejected sole sighting cannot retain base or badge points');
assert.deepEqual(invalidOnly.badges, [], 'badges unsupported after moderation are removed');

const streakRewards = reconcileMemberRewards([
  sighting('week-one', 'limited', '2026-07-06T14:00:00Z'),
  sighting('week-two', 'limited', '2026-07-13T14:00:00Z'),
], undefined, '2026-07-13T16:00:00Z');
assert.equal(streakRewards.currentWeeklyStreak, 2);
assert.ok(streakRewards.ledger.some((entry) => entry.reason === 'streak_maintained_v2' && !entry.revokedAt));
const brokenStreak = reconcileMemberRewards([
  sighting('week-one', 'limited', '2026-07-06T14:00:00Z'),
  sighting('week-two', 'limited', '2026-07-13T14:00:00Z', { rewardState: { removedAt: '2026-07-14T00:00:00Z' } }),
], streakRewards, '2026-07-14T00:00:00Z');
assert.equal(brokenStreak.currentWeeklyStreak, 1);
assert.ok(!brokenStreak.ledger.some((entry) => entry.reason === 'streak_maintained_v2' && !entry.revokedAt), 'unsupported streak bonuses are revoked');

const sightingsRoute = readFileSync(new URL('../src/app/api/sightings/route.ts', import.meta.url), 'utf8');
const adminSightingsRoute = readFileSync(new URL('../src/app/api/admin/sightings/route.ts', import.meta.url), 'utf8');

const helpfulVerified = reconcileMemberRewards([
  sighting('helpful-vote', 'limited', '2026-07-18T14:00:00Z', { upCount: 3, downCount: 0 }),
], undefined, '2026-07-18T16:00:00Z');
assert.ok(helpfulVerified.badges.some((badge) => badge.id === 'helpful_neighbor'));
const helpfulDowngraded = reconcileMemberRewards([
  sighting('helpful-vote', 'limited', '2026-07-18T14:00:00Z', { upCount: 3, downCount: 1 }),
], helpfulVerified, '2026-07-18T17:00:00Z');
assert.ok(!helpfulDowngraded.badges.some((badge) => badge.id === 'helpful_neighbor'), 'a vote downgrade below community verification revokes Helpful Neighbor');
assert.ok(!helpfulDowngraded.ledger.some((entry) => entry.badgeId === 'helpful_neighbor' && !entry.revokedAt));

const manySightings = Array.from({ length: 1001 }, (_, index) => sighting(`many-${index}`, 'limited', '2026-07-20T14:00:00Z'));
const manyRewards = reconcileMemberRewards(manySightings, undefined, '2026-07-20T16:00:00Z');
assert.ok(manyRewards.points >= 1001, 'the audit-ledger cap cannot truncate posting points for an exhaustive owner history');
assert.equal(summarizeMemberRewards(manySightings, manyRewards).eligibleSightings, 1001);

assert.match(adminSightingsRoute, /const durableOwned = await repository\.listSightingsForReporter\(reporterUserId\);[\s\S]*?dedupeSightings\(\[\.\.\.legacyOwned, \.\.\.durableOwned\]\)/, 'legacy admin review must reconcile the complete legacy and durable owner history');
assert.match(sightingsRoute, /searchBourbonBible/, 'the server must resolve known bottle rarity from the catalog instead of trusting client reward tiers');
assert.match(sightingsRoute, /needsBottleReview\s*\?\s*"limited"/, 'manual bottles must start at the safe one-point tier');
assert.match(sightingsRoute, /if \(rewardsNeedPersistence\([\s\S]*?after\(\(\) => persistMemberRewardsBestEffort/, 'GET must persist reward migrations when reconciliation changes metadata');
assert.match(sightingsRoute, /if \(duplicate\) \{[\s\S]*?reconcileMemberRewards/, 'duplicate POST responses must reconcile instead of returning stale totals');

console.log('Sighting rewards policy verified.');
