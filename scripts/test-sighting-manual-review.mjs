import assert from 'node:assert/strict';
import sightingReviewModule from '../src/lib/sighting-review.ts';
import sightingsModule from '../src/lib/sightings.ts';

const { canonicalizeLegacySighting } = sightingsModule;
const { isLikelyDuplicateSighting, isSameReporterCanonicalDuplicateSighting, needsSightingReview, reviewReasonLabels, sanitizeManualSightingField, sightingDuplicateKey } = sightingReviewModule;

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

const approvedPhoto = needsSightingReview({
  ...baseSighting,
  reviewState: {},
  rewardState: { photoProof: { url: 'https://example.com/proof.jpg', uploadedAt: '2026-07-03T14:01:00Z', status: 'verified_public' } },
});
assert.equal(approvedPhoto, false, 'approved photo proofs leave the queue');

const migratedPhoto = canonicalizeLegacySighting({
  ...baseSighting,
  rewardState: {
    photoProof: {
      url: 'https://example.com/proof.jpg',
      pathname: 'sighting-proofs/member/proof.jpg',
      uploadedAt: '2026-07-03T14:01:00Z',
      status: 'verified_public',
      publicUrl: 'https://example.com/proof.jpg',
    },
    verificationSources: ['photo'],
    verifiedAt: '2026-07-03T14:02:00Z',
  },
}, 'member_1');
assert.equal(migratedPhoto.rewardState?.photoProof?.url, 'https://example.com/proof.jpg', 'durable migration preserves an approved legacy photo');
assert.equal(migratedPhoto.rewardState?.photoProof?.status, 'verified_public');
assert.deepEqual(migratedPhoto.rewardState?.verificationSources, ['photo']);

const rejectedSighting = needsSightingReview({
  ...baseSighting,
  reviewState: { needsBottleReview: true },
  rewardState: { rejectedAt: '2026-07-03T14:05:00Z' },
});
assert.equal(rejectedSighting, false, 'rejected sightings leave the queue even if their original manual-review flags remain');

const removedSighting = needsSightingReview({
  ...baseSighting,
  reviewState: { needsStoreReview: true },
  rewardState: { removedAt: '2026-07-03T14:05:00Z' },
});
assert.equal(removedSighting, false, 'removed sightings leave the queue');

const canonical = needsSightingReview({
  ...baseSighting,
  reviewState: {},
  storeId: 'abc-123',
});
assert.equal(canonical, false, 'canonical sightings without proof do not require admin review');


assert.equal(sightingDuplicateKey({ bottleName: 'E.H. Taylor Cured Oak', storeName: 'Beach Discount Beverage' }), 'e h taylor cured oak::beach discount beverage');
assert.equal(isLikelyDuplicateSighting(
  { bottleName: 'E.H. Taylor Cured Oak', storeName: 'Beach Discount Beverage', createdAt: '2026-07-03T14:36:34Z' },
  { bottleName: 'E.H. Taylor Cured Oak', storeName: 'Beach Discount Beverage', createdAt: '2026-07-03T14:42:34Z' }
), true, 'same bottle/store inside the duplicate window is suppressed');
assert.equal(isLikelyDuplicateSighting(
  { bottleName: 'E.H. Taylor Cured Oak', storeName: 'Beach Discount Beverage', createdAt: '2026-07-03T14:36:34Z' },
  { bottleName: 'E.H. Taylor Cured Oak', storeName: 'Other Store', createdAt: '2026-07-03T14:42:34Z' }
), false, 'different store is not a duplicate');

const canonicalReport = {
  ...baseSighting,
  reporterUserId: 'member-1',
  bottleId: 'bottle-123',
  storeId: 'store-456',
  createdAt: '2026-07-03T14:36:34Z',
};
assert.equal(isSameReporterCanonicalDuplicateSighting(canonicalReport, {
  ...canonicalReport,
  id: 'sighting_manual_2',
  createdAt: '2026-07-03T14:42:34Z',
}), true, 'the same reporter and canonical bottle/store are deduped inside the existing window');
assert.equal(isSameReporterCanonicalDuplicateSighting(canonicalReport, {
  ...canonicalReport,
  id: 'sighting_manual_3',
  reporterUserId: 'member-2',
  createdAt: '2026-07-03T14:42:34Z',
}), false, 'a different reporter may independently report the same canonical bottle/store');
assert.equal(isSameReporterCanonicalDuplicateSighting(canonicalReport, {
  ...canonicalReport,
  id: 'sighting_manual_4',
  bottleId: 'bottle-789',
  bottleName: canonicalReport.bottleName,
  createdAt: '2026-07-03T14:42:34Z',
}), false, 'canonical IDs, not matching display names, control anti-gaming dedupe');

console.log('Manual sighting review policy verified.');
