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
