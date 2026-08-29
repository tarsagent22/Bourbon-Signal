import assert from "node:assert/strict";

const loadedMemberCollection = await import("../src/lib/member-collection.ts");
const memberCollectionModule = ((loadedMemberCollection as { default?: unknown }).default || loadedMemberCollection) as typeof import("../src/lib/member-collection.ts");
const { collectionFingerprint, normalizeCollectionBottles } = memberCollectionModule;

const timestamp = "2026-08-20T12:00:00.000Z";
const base = {
  bottleId: "eagle-rare",
  bottleName: "Eagle Rare 10 Year",
  canonicalKey: "eagle rare 10 year",
  tasteTags: ["Vanilla"],
  addedAt: timestamp,
  updatedAt: timestamp,
};

const [legacySealed] = normalizeCollectionBottles([{ ...base, rating: 95, opened: false }]);
assert.equal(legacySealed.rating, 95);
assert.equal(legacySealed.isRated, true);
assert.equal(legacySealed.sealedQuantity, 1);
assert.equal(legacySealed.openedQuantity, 0);
assert.equal(legacySealed.finishedCount, 0);
assert.equal(legacySealed.tastedOnly, false);
assert.equal(legacySealed.opened, false);
assert.equal(legacySealed.wouldBuyAgain, undefined, "missing buy-again preference stays not sure");

const [legacyOpened] = normalizeCollectionBottles([{ ...base, rating: 0, opened: true }]);
assert.equal(legacyOpened.rating, 0, "legacy zero keeps its integer while becoming explicitly unrated");
assert.equal(legacyOpened.isRated, false);
assert.equal(legacyOpened.sealedQuantity, 0);
assert.equal(legacyOpened.openedQuantity, 1);
assert.equal(legacyOpened.opened, true);

const [realZero] = normalizeCollectionBottles([{
  ...base,
  rating: 0,
  isRated: true,
  sealedQuantity: 0,
  openedQuantity: 0,
  finishedCount: 0,
  tastedOnly: true,
  tastingContext: "bottle_share",
}]);
assert.equal(realZero.rating, 0, "an explicit 0.0 is a real rating");
assert.equal(realZero.isRated, true);
assert.equal(realZero.tastedOnly, true);
assert.equal(realZero.tastingContext, "bottle_share");
assert.equal(realZero.ratedAt, undefined, "legacy scores never receive a fabricated rating date");

const roundTrip = (bottle: Record<string, unknown>) => normalizeCollectionBottles(JSON.parse(JSON.stringify({ bottles: [bottle] })))[0];
const personalHistory = {
  ...base,
  rating: 92,
  isRated: true,
  ratedAt: "2026-08-20T18:30:00.000Z",
  tasteTags: ["Cherry", "Oak"],
  wouldBuyAgain: false,
  notes: "Opened up after ten minutes.",
  pricePaid: 72.49,
  store: "Neighborhood Spirits",
  purchaseDate: "2026-07-14",
  tastingContext: "friend",
  finishedCount: 2,
};
const expectedPersonalHistory = {
  rating: 92,
  isRated: true,
  ratedAt: "2026-08-20T18:30:00.000Z",
  tasteTags: ["Cherry", "Oak"],
  wouldBuyAgain: false,
  notes: "Opened up after ten minutes.",
  pricePaid: 72.49,
  store: "Neighborhood Spirits",
  purchaseDate: "2026-07-14",
  tastingContext: "friend",
  finishedCount: 2,
};
const preservedHistory = (bottle: ReturnType<typeof normalizeCollectionBottles>[number]) => ({
  rating: bottle.rating,
  isRated: bottle.isRated,
  ratedAt: bottle.ratedAt,
  tasteTags: bottle.tasteTags,
  wouldBuyAgain: bottle.wouldBuyAgain,
  notes: bottle.notes,
  pricePaid: bottle.pricePaid,
  store: bottle.store,
  purchaseDate: bottle.purchaseDate,
  tastingContext: bottle.tastingContext,
  finishedCount: bottle.finishedCount,
});

const noCurrentInventory = roundTrip({
  ...personalHistory,
  sealedQuantity: 0,
  openedQuantity: 0,
  tastedOnly: false,
});
assert.equal(noCurrentInventory.tastedOnly, true, "zero current inventory is tasted-only even with finished history and a false legacy flag");
assert.deepEqual(preservedHistory(noCurrentInventory), expectedPersonalHistory, "owned-to-history server round trip preserves tasting cues, acquisition, context, and finished history");

const ownedAfterTasting = roundTrip({
  ...noCurrentInventory,
  sealedQuantity: 1,
  openedQuantity: 0,
  tastedOnly: true,
});
assert.equal(ownedAfterTasting.tastedOnly, false, "current inventory is owned even with a true legacy flag");
assert.deepEqual(preservedHistory(ownedAfterTasting), expectedPersonalHistory, "tasted-to-owned server round trip preserves tasting cues, acquisition, context, and finished history");

const ratedAt = "2026-08-21T15:30:00.000Z";
const [datedRating] = normalizeCollectionBottles([{
  ...base,
  rating: 94,
  isRated: true,
  ratedAt,
  sealedQuantity: 1,
  openedQuantity: 0,
  finishedCount: 0,
  tastedOnly: false,
}]);
assert.equal(datedRating.ratedAt, ratedAt, "a valid rating date survives normalization");

const [owned] = normalizeCollectionBottles([{
  ...base,
  rating: 0,
  isRated: false,
  sealedQuantity: 2.8,
  openedQuantity: 1.2,
  finishedCount: 3.9,
  tastedOnly: true,
  pricePaid: 64.999,
  store: "  Main Street Spirits  ",
  purchaseDate: "2026-08-18",
  tastingContext: "not-valid",
}]);
assert.equal(owned.sealedQuantity, 2);
assert.equal(owned.openedQuantity, 1);
assert.equal(owned.finishedCount, 3);
assert.equal(owned.tastedOnly, false, "owned inventory cannot be tasted-only");
assert.equal(owned.pricePaid, 65);
assert.equal(owned.store, "Main Street Spirits");
assert.equal(owned.purchaseDate, "2026-08-18");
assert.equal(owned.tastingContext, undefined, "invalid tasting context is still discarded");

assert.notEqual(
  collectionFingerprint([{ ...base, rating: 0, isRated: false, sealedQuantity: 1 }]),
  collectionFingerprint([{ ...base, rating: 0, isRated: true, sealedQuantity: 1 }]),
  "unrated and a real zero must conflict-detect differently",
);
assert.notEqual(
  collectionFingerprint([{ ...base, rating: 94, isRated: true, ratedAt, sealedQuantity: 1 }]),
  collectionFingerprint([{ ...base, rating: 94, isRated: true, ratedAt: "2026-08-22T15:30:00.000Z", sealedQuantity: 1 }]),
  "rating dates participate in conflict detection",
);
assert.notEqual(
  collectionFingerprint([{ ...base, rating: 94, isRated: true, sealedQuantity: 1 }]),
  collectionFingerprint([{ ...base, rating: 94, isRated: true, sealedQuantity: 1, wouldBuyAgain: false }]),
  "not sure and wouldn't buy again must conflict-detect differently",
);

console.log("member collection lifecycle tests passed");
