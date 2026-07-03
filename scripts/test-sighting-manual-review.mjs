import assert from 'node:assert/strict';
import { needsSightingReview, reviewReasonLabels, sanitizeManualSightingField } from '../src/lib/sighting-review.ts';

const baseSighting = {
  id: 'sighting_manual_1',
  bottleName: 'E.H. Taylor Cured Oak',
  bottleId: 'eh-taylor-cured-oak',
  rarityTier: 'unicorn',
  storeId: 'custom-store-myrtle-beach-liquor',
  storeName: 'Myrtle Beach Liquor',
  storeAddress: '501 Kings Hwy, Myrtle Beach, SC 29577',
  storeCity: 'Myrtle Beach',
  storeState: 'SC',
  source: 'custom',
  sightingType: 'seen_in_store',
  createdAt: '2026-07-03T14:00:00Z',
};

assert.equal(sanitizeManualSightingField('  E.H. Taylor Cured Oak  ', 40), 'E.H. Taylor Cured Oak');
assert.equal(sanitizeManualSightingField('A'.repeat(60), 20), 'A'.repeat(20));
assert.equal(sanitizeManualSightingField('\n\tMyrtle   Beach\r\n', 80), 'Myrtle Beach');

const manualBottle = needsSightingReview({
  ...baseSighting,
  reviewState: {
    needsBottleReview: true,
    manualBottleName: 'E.H. Taylor Cured Oak',
  },
});
assert.equal(manualBottle, true, 'manual bottles enter admin review');
assert.deepEqual(reviewReasonLabels({ needsBottleReview: true }), ['Manual bottle']);

const manualStore = needsSightingReview({
  ...baseSighting,
  reviewState: {
    needsStoreReview: true,
    manualStoreName: 'Myrtle Beach Liquor',
    manualStoreCity: 'Myrtle Beach',
    manualStoreState: 'SC',
  },
});
assert.equal(manualStore, true, 'manual stores enter admin review');
assert.deepEqual(reviewReasonLabels({ needsStoreReview: true }), ['Manual store']);

const photoOnly = needsSightingReview({
  ...baseSighting,
  reviewState: {},
  rewardState: { photoProof: { url: 'https://example.com/proof.jpg', uploadedAt: '2026-07-03T14:01:00Z', status: 'pending' } },
});
assert.equal(photoOnly, true, 'photo proofs still enter admin review');

const canonical = needsSightingReview({
  ...baseSighting,
  reviewState: {},
  storeId: 'abc-123',
});
assert.equal(canonical, false, 'canonical sightings without proof do not require admin review');

console.log('Manual sighting review policy verified.');
