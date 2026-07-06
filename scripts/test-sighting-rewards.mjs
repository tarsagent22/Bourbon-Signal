import assert from 'node:assert/strict';
import { basePointsForSighting, communityVerified, reconcileMemberRewards, summarizeMemberRewards } from '../src/lib/sighting-rewards.ts';

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

assert.equal(basePointsForSighting({ rarityTier: 'limited' }), 0);
assert.equal(basePointsForSighting({ rarityTier: 'allocated' }), 1);
assert.equal(basePointsForSighting({ rarityTier: 'unicorn' }), 2);
assert.equal(communityVerified(3, 0), true);
assert.equal(communityVerified(4, 0), true);
assert.equal(communityVerified(5, 2), true);
assert.equal(communityVerified(6, 2), true);

let rewards = reconcileMemberRewards([
  sighting('a', 'allocated', '2026-07-03T14:00:00Z'),
  sighting('u', 'unicorn', '2026-07-04T14:00:00Z', { rewardState: { photoProof: { url: 'https://example.com/photo.jpg', uploadedAt: '2026-07-04T15:00:00Z', status: 'pending' } } }),
], undefined, '2026-07-04T16:00:00Z');
assert.equal(rewards.points, 6, 'allocated base 1 + unicorn base 2 + First Sighting 1 + Photo Finish 1 + Unicorn Hunter bronze 1');
let summary = summarizeMemberRewards([
  sighting('a', 'allocated', '2026-07-03T14:00:00Z'),
  sighting('u', 'unicorn', '2026-07-04T14:00:00Z', { rewardState: { photoProof: { url: 'https://example.com/photo.jpg', uploadedAt: '2026-07-04T15:00:00Z', status: 'pending' } } }),
], rewards);
assert.equal(summary.eligibleSightings, 2);
assert.equal(summary.verifiedSightings, 0);
assert.equal(summary.photoSightings, 1);
assert.equal(rewards.badges.some((badge) => /verified/i.test(badge.label)), false, 'sighting badge labels must not use verified language');
const legacySummary = summarizeMemberRewards([], { badges: [{ id: 'verified_scout', label: 'Verified Scout', earnedAt: '2026-07-04T15:00:00Z', pointsAwarded: 1 }], points: 1, ledger: [], currentWeeklyStreak: 0, longestWeeklyStreak: 0 });
assert.equal(legacySummary.badges[0].id, 'helpful_neighbor');
assert.equal(legacySummary.badges[0].label, 'Helpful Neighbor');

rewards = reconcileMemberRewards([
  sighting('a', 'allocated', '2026-07-03T14:00:00Z'),
  sighting('b', 'allocated', '2026-07-10T14:00:00Z'),
], rewards, '2026-07-10T16:00:00Z');
assert.equal(rewards.currentWeeklyStreak, 2);
assert.ok(rewards.ledger.some((entry) => entry.reason === 'streak_maintained' && entry.points === 1));

const beforeRevocation = rewards.points;
rewards = reconcileMemberRewards([
  sighting('a', 'allocated', '2026-07-03T14:00:00Z', { rewardState: { rejectedAt: '2026-07-11T00:00:00Z' } }),
  sighting('b', 'allocated', '2026-07-10T14:00:00Z'),
], rewards, '2026-07-11T00:00:00Z');
assert.equal(rewards.points, beforeRevocation - 1, 'rejected sighting subtracts its base point');
assert.ok(rewards.ledger.some((entry) => entry.sightingId === 'a' && entry.revokedAt));

console.log('Sighting rewards policy verified.');
