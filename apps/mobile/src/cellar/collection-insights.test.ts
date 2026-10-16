import assert from 'node:assert/strict';
import test from 'node:test';
import { collectionInsights } from './collection-insights';
import type { MemberCollectionBottle, RadarBottleOption } from '../api/types';
const bottle = (id: string, sealed = 1, rating?: number): MemberCollectionBottle => ({ bottleId: id, bottleName: id, canonicalKey: id, sealedQuantity: sealed, openedQuantity: 0, finishedCount: 0, tastedOnly: sealed === 0, rating: rating ?? 0, isRated: rating !== undefined, addedAt: '2026-10-16', updatedAt: '2026-10-16' });
test('producer and rarity breakdowns count physical holdings and keep unknown metadata separate', () => {
  const catalog: RadarBottleOption[] = [{ id: 'a', name: 'a', producer: 'Producer A', proof: 100, nationalTier: 'regular' }, { id: 'b', name: 'b', producer: 'Producer B', rarity: 'unicorn', rarityPending: true }];
  const result = collectionInsights([bottle('a', 2), bottle('b'), bottle('unmatched'), bottle('tasted', 0)], catalog);
  assert.equal(result.ownedCount, 4); assert.equal(result.proofCount, 2); assert.equal(result.averageProof, 100);
  assert.equal(result.producers.find(row => row.label === 'Producer not matched')?.count, 1);
  assert.equal(result.rarity.find(row => row.label === 'Under review')?.count, 1);
  assert.equal(result.rarity.find(row => row.label === 'Regular')?.count, 2);
  assert.equal(result.rarity.find(row => row.label === 'Not classified')?.count, 1);
});
test('ratings are per entry, including zero, and comparisons need three observations per group', () => {
  const entries = [bottle('a', 10, 90), bottle('b', 1, 0), bottle('c', 0, 90), bottle('d', 1, 70), bottle('e', 0, 80), bottle('f', 1, 90)];
  const catalog = entries.map((item, index) => ({ id: item.bottleId, name: item.bottleName, proof: index < 3 ? 110 : 90 }));
  const result = collectionInsights(entries, catalog);
  assert.equal(result.proofComparison?.higher, 6); assert.equal(result.proofComparison?.lower, 8);
  assert.equal(result.ownershipComparison, null);
  assert.equal(collectionInsights(entries.slice(1), catalog).proofComparison, null);
});
test('pending canonical matches do not inherit proof or producer from a proposed bottle', () => {
  const result = collectionInsights([{ ...bottle('a'), pendingCanonicalMatch: true, wouldBuyAgain: true }], [{ id: 'a', name: 'a', producer: 'Wrong pending producer', proof: 120, rarity: 'unicorn' }]);
  assert.equal(result.averageProof, null); assert.equal(result.producers[0].label, 'Producer not matched'); assert.equal(result.buyAgain, 1);
});

import { collectionPayoff } from './collection-payoff';
test('small collections get real highlights without inventing ratings or proof', () => {
  const one = collectionPayoff([bottle('a')], [{ id: 'a', name: 'a', proof: 90 }]);
  assert.equal(one.highlights[0].bottleId, 'a'); assert.equal(one.averageRating, null); assert.equal(one.proofRange?.low, 90); assert.equal(one.proofBuckets[0].count, 1);
  const empty = collectionPayoff([], []); assert.equal(empty.highlights.length, 0); assert.equal(empty.proofRange, null); assert.equal(empty.nextMilestone, 1);
});
test('collection highlights rank ratings per entry and weight proof by bottles on hand', () => {
  const items = [bottle('a', 4, 85), bottle('b', 1, 95), { ...bottle('c', 1, 0), tasteTags: ['Vanilla'] }];
  const copy = structuredClone(items);
  const result = collectionPayoff(items, [{ id: 'a', name: 'a', proof: 100 }, { id: 'b', name: 'b', proof: 120 }]);
  assert.equal(result.highlights[0].bottleId, 'b'); assert.equal(result.ratedCount, 3); assert.equal(result.averageRating, 6);
  assert.equal(result.proofCount, 5); assert.equal(result.proofBuckets[1].count, 4); assert.equal(result.favoriteCount, 2); assert.equal(result.tasteTags.length, 0); assert.deepEqual(items, copy);
});
test('pending catalog matches cannot supply proof and favorite taste cues are deduplicated', () => {
  const items = [{ ...bottle('a', 1, 90), tasteTags: ['Vanilla', 'vanilla', 'Oak'], pendingCanonicalMatch: true }, { ...bottle('b', 0, 80), tasteTags: ['vanilla'] }];
  const result = collectionPayoff(items, [{ id: 'a', name: 'a', proof: 120 }]);
  assert.equal(result.proofCount, 0); assert.equal(result.tasteTags[0].label, 'Vanilla'); assert.equal(result.tasteTags[0].count, 2);
  assert.equal(result.ownedCount, 1); assert.equal(result.nextMilestone, 3);
});
