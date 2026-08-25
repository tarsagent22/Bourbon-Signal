import assert from "node:assert/strict";
import test from "node:test";
import type { MemberCollectionBottle, SignalRewardItem } from "../api/types";
import {
  addSignalBottleToCollection,
  collectionSummary,
  filterAndSortCollection,
  filterWatchedBottles,
  rewardAvailability,
  updateCollectionBottle,
  visibleTasteTags,
} from "./member-interactions";

const bottle = (overrides: Partial<MemberCollectionBottle> = {}): MemberCollectionBottle => ({
  bottleId: "old-forester-1910",
  bottleName: "Old Forester 1910",
  canonicalKey: "old forester 1910",
  rating: 95,
  tasteTags: ["Caramel", "Oak"],
  wouldBuyAgain: true,
  opened: true,
  notes: "Dessert pour",
  addedAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...overrides,
});

test("filters collection text and applies deliberate sort modes", () => {
  const bottles = [
    bottle(),
    bottle({ bottleId: "eagle-rare", bottleName: "Eagle Rare 10Y", canonicalKey: "eagle rare 10y", rating: 93, tasteTags: ["Vanilla"], addedAt: "2026-08-20T00:00:00.000Z" }),
    bottle({ bottleId: "eh-taylor", bottleName: "E.H. Taylor Small Batch", canonicalKey: "eh taylor small batch", rating: 92, tasteTags: ["Balanced"] }),
  ];
  assert.deepEqual(filterAndSortCollection(bottles, "vanilla", "rating").map((item) => item.bottleName), ["Eagle Rare 10Y"]);
  assert.deepEqual(filterAndSortCollection(bottles, "", "recent").map((item) => item.bottleName), ["Eagle Rare 10Y", "Old Forester 1910", "E.H. Taylor Small Batch"]);
  assert.deepEqual(filterAndSortCollection(bottles, "", "name").map((item) => item.bottleName), ["E.H. Taylor Small Batch", "Eagle Rare 10Y", "Old Forester 1910"]);
});

test("filters Cellar by opened state, rating, and buy-again preference", () => {
  const bottles = [
    bottle({ bottleName: "Opened favorite", canonicalKey: "opened favorite", rating: 94, opened: true, wouldBuyAgain: true }),
    bottle({ bottleName: "Unopened favorite", canonicalKey: "unopened favorite", rating: 91, opened: false, wouldBuyAgain: true }),
    bottle({ bottleName: "Opened pass", canonicalKey: "opened pass", rating: 79, opened: true, wouldBuyAgain: false }),
  ];
  assert.deepEqual(filterAndSortCollection(bottles, "", "rating", { status: "opened", minRating: 90, buyAgainOnly: true }).map((item) => item.bottleName), ["Opened favorite"]);
  assert.deepEqual(filterAndSortCollection(bottles, "", "rating", { status: "unopened", minRating: null, buyAgainOnly: false }).map((item) => item.bottleName), ["Unopened favorite"]);
});

test("summarizes rated bottles and compacts taste tags", () => {
  assert.deepEqual(collectionSummary([bottle({ rating: 95 }), bottle({ canonicalKey: "unrated", rating: 0 }), bottle({ canonicalKey: "rated", rating: 85 })]), { count: 3, ratedCount: 2, averageRating: 90 });
  assert.deepEqual(visibleTasteTags(["Caramel", "Oak", "Vanilla", "Cherry"]), { visible: ["Caramel", "Oak"], hiddenCount: 2 });
});

test("updates one collection bottle without losing canonical identity", () => {
  const original = bottle();
  const updated = updateCollectionBottle([original], original.canonicalKey, { rating: 97, notes: "  Better after air  ", tasteTags: ["Caramel", "", "Oak", "Caramel"], wouldBuyAgain: false, opened: false }, "2026-08-22T00:00:00.000Z");
  assert.equal(updated[0].bottleId, original.bottleId);
  assert.equal(updated[0].rating, 97);
  assert.equal(updated[0].notes, "Better after air");
  assert.deepEqual(updated[0].tasteTags, ["Caramel", "Oak"]);
  assert.equal(updated[0].wouldBuyAgain, false);
  assert.equal(updated[0].opened, false);
  assert.equal(updated[0].updatedAt, "2026-08-22T00:00:00.000Z");
});

test("adds a Signal bottle once and keeps an existing collection record", () => {
  const current = [bottle()];
  assert.equal(addSignalBottleToCollection(current, { id: "old-forester-1910", name: "Old Forester 1910" }, "2026-08-22T00:00:00.000Z"), current);
  const next = addSignalBottleToCollection(current, { id: "four-roses", name: "Four Roses Single Barrel" }, "2026-08-22T00:00:00.000Z");
  assert.equal(next.length, 2);
  assert.equal(next[1].rating, 0);
  assert.equal(next[1].canonicalKey, "four roses single barrel");
});

test("filters watched bottles by member search text", () => {
  assert.deepEqual(filterWatchedBottles(["Eagle Rare", "Old Forester 1910"], "forester"), ["Old Forester 1910"]);
});

test("distinguishes catalog availability, physical stock, and claimability", () => {
  const digital: SignalRewardItem = { key: "membership_credit", name: "Membership credit", points: 100, fulfillmentType: "digital", inventoryRemaining: null };
  const physical: SignalRewardItem = { key: "sticker", name: "Sticker pack", points: 100, fulfillmentType: "physical", inventoryRemaining: 4 };
  assert.deepEqual(rewardAvailability(digital, { balance: 130, redemptionEligible: true }), { label: "Available to redeem", claimable: true, soldOut: false });
  assert.deepEqual(rewardAvailability(physical, { balance: 50, redemptionEligible: true }), { label: "50 more points needed · 4 remaining", claimable: false, soldOut: false });
  assert.deepEqual(rewardAvailability({ ...physical, inventoryRemaining: 0 }, { balance: 130, redemptionEligible: true }), { label: "Sold out", claimable: false, soldOut: true });
  assert.deepEqual(rewardAvailability(physical, { balance: 130, redemptionEligible: false }), { label: "Membership required to redeem · 4 remaining", claimable: false, soldOut: false });
});
