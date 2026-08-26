import assert from "node:assert/strict";
import test from "node:test";
import type { MemberCollectionBottle, SignalRewardItem } from "../api/types";
import {
  addSignalBottleToCollection,
  applyCollectionInventoryAction,
  collectionSummary,
  collectionDisplayKind,
  finishCollectionBottle,
  filterAndSortCollection,
  formatCollectionRating,
  filterWatchedBottles,
  createCollectionBottle,
  createCustomCollectionBottle,
  activeCollectionRefinementCount,
  applyBottleContributionIds,
  rewardAvailability,
  TASTE_TAG_OPTIONS,
  updateCollectionBottle,
  upsertCollectionBottle,
  visibleTasteTags,
} from "./member-interactions";

const bottle = (overrides: Partial<MemberCollectionBottle> = {}): MemberCollectionBottle => ({
  bottleId: "old-forester-1910",
  bottleName: "Old Forester 1910",
  canonicalKey: "old forester 1910",
  rating: 95,
  isRated: true,
  tasteTags: ["Caramel", "Oak"],
  wouldBuyAgain: true,
  opened: true,
  sealedQuantity: 0,
  openedQuantity: 1,
  finishedCount: 0,
  tastedOnly: false,
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
  assert.deepEqual(filterAndSortCollection(bottles, "", "recently_acquired").map((item) => item.bottleName), ["Eagle Rare 10Y", "Old Forester 1910", "E.H. Taylor Small Batch"]);
  assert.deepEqual(filterAndSortCollection(bottles, "", "recently_updated").map((item) => item.bottleName), ["Old Forester 1910", "Eagle Rare 10Y", "E.H. Taylor Small Batch"]);
  assert.deepEqual(filterAndSortCollection(bottles, "", "name").map((item) => item.bottleName), ["E.H. Taylor Small Batch", "Eagle Rare 10Y", "Old Forester 1910"]);
});

test("recently rated sorts dated ratings first without inventing legacy dates", () => {
  const dated = bottle({ bottleName: "Dated pour", canonicalKey: "dated pour", ratedAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z" });
  const legacy = bottle({ bottleName: "Legacy pour", canonicalKey: "legacy pour", ratedAt: undefined, updatedAt: "2026-08-24T00:00:00.000Z" });
  assert.deepEqual(filterAndSortCollection([legacy, dated], "", "recently_rated").map((item) => item.bottleName), ["Dated pour", "Legacy pour"]);
});

test("filters Cellar by lifecycle, rating, and buy-again preference", () => {
  const bottles = [
    bottle({ bottleName: "Opened favorite", canonicalKey: "opened favorite", rating: 94, openedQuantity: 1, sealedQuantity: 0, wouldBuyAgain: true }),
    bottle({ bottleName: "Sealed favorite", canonicalKey: "sealed favorite", rating: 91, opened: false, openedQuantity: 0, sealedQuantity: 2, wouldBuyAgain: true }),
    bottle({ bottleName: "Finished", canonicalKey: "finished", rating: 79, openedQuantity: 0, finishedCount: 1, wouldBuyAgain: false }),
    bottle({ bottleName: "Bar taste", canonicalKey: "bar taste", rating: 90, openedQuantity: 0, sealedQuantity: 0, tastedOnly: true, tastingContext: "bar" }),
  ];
  assert.deepEqual(filterAndSortCollection(bottles, "", "rating", { status: "open", rating: "rated", minRating: 90, buyAgainOnly: true }).map((item) => item.bottleName), ["Opened favorite"]);
  assert.deepEqual(filterAndSortCollection(bottles, "", "rating", { status: "sealed", rating: "all", minRating: null, buyAgainOnly: false }).map((item) => item.bottleName), ["Sealed favorite"]);
  assert.deepEqual(filterAndSortCollection(bottles, "", "rating", { status: "tasted", rating: "all", minRating: null, buyAgainOnly: false }).map((item) => item.bottleName), ["Bar taste", "Finished"]);
  assert.deepEqual(filterAndSortCollection(bottles, "", "rating", { status: "owned", rating: "all", minRating: null, buyAgainOnly: false }).map((item) => item.bottleName), ["Opened favorite", "Sealed favorite"]);
  assert.deepEqual(filterAndSortCollection(bottles, "", "rating", { status: "all", rating: "unrated", minRating: null, buyAgainOnly: false }).map((item) => item.bottleName), []);
});

test("counts only active Cellar refinement choices", () => {
  assert.equal(activeCollectionRefinementCount({ status: "all", rating: "all", minRating: null, buyAgainOnly: false }, "recently_updated"), 0);
  assert.equal(activeCollectionRefinementCount({ status: "tasted", rating: "rated", minRating: null, buyAgainOnly: false }, "name"), 3);
});

test("summarizes rated bottles and compacts taste tags", () => {
  assert.deepEqual(collectionSummary([
    bottle({ rating: 95, sealedQuantity: 2, openedQuantity: 0 }),
    bottle({ canonicalKey: "unrated", rating: 0, isRated: false, sealedQuantity: 1, openedQuantity: 0 }),
    bottle({ canonicalKey: "rated", rating: 0, isRated: true, openedQuantity: 1 }),
  ]), { uniqueBourbons: 3, ownedWhiskeyCount: 3, tastedOnlyCount: 0, ownedBottleCount: 4, ratedCount: 2, averageRating: 47.5 });
  assert.deepEqual(visibleTasteTags(["Caramel", "Oak", "Vanilla", "Cherry"]), { visible: ["Caramel", "Oak"], hiddenCount: 2 });
  assert.equal(formatCollectionRating(bottle({ rating: 95 })), "9.5");
  assert.equal(formatCollectionRating(bottle({ rating: 0, isRated: true })), "0.0");
  assert.equal(formatCollectionRating(bottle({ rating: 0, isRated: false })), "Unrated");
});

test("updates one collection bottle without losing canonical identity", () => {
  const original = bottle();
  const updated = updateCollectionBottle([original], original.canonicalKey, { rating: 97, isRated: true, notes: "  Better after air  ", tasteTags: ["Caramel", "", "Oak", "Caramel"], wouldBuyAgain: false, sealedQuantity: 1, openedQuantity: 0, finishedCount: 2, tastedOnly: false }, "2026-08-22T00:00:00.000Z");
  assert.equal(updated[0].bottleId, original.bottleId);
  assert.equal(updated[0].rating, 97);
  assert.equal(updated[0].notes, "Better after air");
  assert.deepEqual(updated[0].tasteTags, ["Caramel", "Oak"]);
  assert.equal(updated[0].wouldBuyAgain, false);
  assert.equal(updated[0].opened, false);
  assert.equal(updated[0].sealedQuantity, 1);
  assert.equal(updated[0].finishedCount, 2);
  assert.equal(updated[0].updatedAt, "2026-08-22T00:00:00.000Z");
  assert.equal(updated[0].ratedAt, "2026-08-22T00:00:00.000Z");
});

test("preserves all three buy-again states through edit and creation", () => {
  const unknown = bottle({ wouldBuyAgain: undefined });
  const savedUnknown = updateCollectionBottle([unknown], unknown.canonicalKey, { rating: 95, isRated: true, notes: "", tasteTags: [], wouldBuyAgain: undefined, sealedQuantity: 0, openedQuantity: 1, finishedCount: 0, tastedOnly: false }, "2026-08-22T00:00:00.000Z")[0];
  assert.equal(savedUnknown.wouldBuyAgain, undefined);
  assert.equal(createCollectionBottle({ id: "new", name: "New Bottle" }, { kind: "sealed" }, "2026-08-22T00:00:00.000Z").wouldBuyAgain, undefined);
  assert.equal(updateCollectionBottle([unknown], unknown.canonicalKey, { rating: 95, isRated: true, notes: "", tasteTags: [], wouldBuyAgain: true, sealedQuantity: 0, openedQuantity: 1, finishedCount: 0, tastedOnly: false }, "2026-08-22T00:00:00.000Z")[0].wouldBuyAgain, true);
  assert.equal(updateCollectionBottle([unknown], unknown.canonicalKey, { rating: 95, isRated: true, notes: "", tasteTags: [], wouldBuyAgain: false, sealedQuantity: 0, openedQuantity: 1, finishedCount: 0, tastedOnly: false }, "2026-08-22T00:00:00.000Z")[0].wouldBuyAgain, false);
});

test("rating dates change only with rating state and numeric score", () => {
  const ratedAt = "2026-08-10T00:00:00.000Z";
  const current = bottle({ rating: 94, isRated: true, ratedAt });
  const unrelated = updateCollectionBottle([current], current.canonicalKey, { rating: 94, isRated: true, notes: "New note", tasteTags: ["Oak"], wouldBuyAgain: false, sealedQuantity: 2, openedQuantity: 0, finishedCount: 0, tastedOnly: false }, "2026-08-22T00:00:00.000Z")[0];
  assert.equal(unrelated.ratedAt, ratedAt);
  const changed = updateCollectionBottle([unrelated], current.canonicalKey, { rating: 95, isRated: true, notes: "New note", tasteTags: ["Oak"], wouldBuyAgain: false, sealedQuantity: 2, openedQuantity: 0, finishedCount: 0, tastedOnly: false }, "2026-08-23T00:00:00.000Z")[0];
  assert.equal(changed.ratedAt, "2026-08-23T00:00:00.000Z");
  const unrated = updateCollectionBottle([changed], current.canonicalKey, { rating: 95, isRated: false, notes: "New note", tasteTags: ["Oak"], wouldBuyAgain: false, sealedQuantity: 2, openedQuantity: 0, finishedCount: 0, tastedOnly: false }, "2026-08-24T00:00:00.000Z")[0];
  assert.equal(unrated.ratedAt, undefined);
});

test("constructors date new ratings and create stable pending custom bottles", () => {
  const now = "2026-08-22T00:00:00.000Z";
  assert.equal(createCollectionBottle({ id: "known", name: "Known Bottle" }, { kind: "sealed", isRated: false }, now).ratedAt, undefined);
  assert.equal(createCollectionBottle({ id: "known", name: "Known Bottle" }, { kind: "sealed", isRated: true, rating: 0 }, now).ratedAt, now);
  const first = createCustomCollectionBottle({ name: "  My Local Pick  ", proof: 101.3, detail: "Batch 7" }, { kind: "opened", isRated: true, rating: 88 }, now);
  const second = createCustomCollectionBottle({ name: "My Local Pick", proof: 101.3, detail: "Batch 7" }, { kind: "sealed" }, "2026-08-23T00:00:00.000Z");
  assert.equal(first.bottleId, second.bottleId, "the same custom identity gets the same local id");
  assert.equal(first.pendingCanonicalMatch, true);
  assert.equal(first.bottleName, "My Local Pick · 101.3 proof · Batch 7");
  assert.equal(first.ratedAt, now);
});

test("persists returned contribution ids onto only the exact pending local records", () => {
  const pending = createCustomCollectionBottle({ name: "My Local Pick" }, { kind: "sealed" }, "2026-08-22T00:00:00.000Z");
  const other = createCustomCollectionBottle({ name: "Other Local Pick" }, { kind: "sealed" }, "2026-08-22T00:00:00.000Z");
  const canonical = bottle({ bottleId: "canonical", pendingCanonicalMatch: false });
  const original = [pending, other, canonical];
  const updated = applyBottleContributionIds(original, new Map([[pending.bottleId, "contribution-505"]]));
  assert.notEqual(updated, original);
  assert.equal(updated[0].bottleContributionId, "contribution-505");
  assert.equal(updated[1], other);
  assert.equal(updated[2], canonical);
  assert.equal(applyBottleContributionIds(updated, new Map([[pending.bottleId, "replacement"]])), updated, "an existing persisted id is never replaced");
  assert.equal(applyBottleContributionIds(updated, new Map([["missing", "contribution"]])), updated, "a missing local record is a no-op");
});

test("adds a Signal bottle once and keeps an existing collection record", () => {
  const current = [bottle()];
  assert.equal(addSignalBottleToCollection(current, { id: "old-forester-1910", name: "Old Forester 1910" }, "2026-08-22T00:00:00.000Z"), current);
  const next = addSignalBottleToCollection(current, { id: "four-roses", name: "Four Roses Single Barrel" }, "2026-08-22T00:00:00.000Z");
  assert.equal(next.length, 2);
  assert.equal(next[1].rating, 0);
  assert.equal(next[1].isRated, false);
  assert.equal(next[1].sealedQuantity, 1);
  assert.equal(next[1].canonicalKey, "four roses single barrel");
});

test("finishing preserves history and only consumes an open bottle", () => {
  const opened = bottle({ sealedQuantity: 2, openedQuantity: 1, finishedCount: 3 });
  const afterOpened = finishCollectionBottle([opened], opened.canonicalKey, "2026-08-22T00:00:00.000Z")[0];
  assert.equal(afterOpened.openedQuantity, 0);
  assert.equal(afterOpened.sealedQuantity, 2);
  assert.equal(afterOpened.finishedCount, 4);
  const afterSealed = finishCollectionBottle([afterOpened], opened.canonicalKey, "2026-08-23T00:00:00.000Z")[0];
  assert.equal(afterSealed.sealedQuantity, 2, "finishing never silently consumes sealed inventory");
  assert.equal(afterSealed.finishedCount, 4);
  const tasted = bottle({ sealedQuantity: 0, openedQuantity: 0, finishedCount: 1, tastedOnly: true });
  assert.equal(finishCollectionBottle([tasted], tasted.canonicalKey, "2026-08-24T00:00:00.000Z")[0].finishedCount, 1, "tasted-only history is unchanged");
});

test("derives bottle and Glencairn presentation from current inventory", () => {
  assert.equal(collectionDisplayKind(bottle({ sealedQuantity: 1, openedQuantity: 0, tastedOnly: true })), "owned");
  assert.equal(collectionDisplayKind(bottle({ sealedQuantity: 0, openedQuantity: 0, tastedOnly: false, finishedCount: 1 })), "tasted");
});

test("inventory actions convert one canonical record in both directions without losing tasting data", () => {
  const tasted = bottle({ sealedQuantity: 0, openedQuantity: 0, tastedOnly: true, rating: 93, isRated: true, notes: "Keep me" });
  const owned = applyCollectionInventoryAction([tasted], tasted.canonicalKey, "add_bottle", "2026-08-25T00:00:00.000Z")[0];
  assert.equal(collectionDisplayKind(owned), "owned");
  assert.equal(owned.sealedQuantity, 1);
  assert.equal(owned.rating, 93);
  assert.equal(owned.notes, "Keep me");
  const opened = applyCollectionInventoryAction([owned], owned.canonicalKey, "open_bottle", "2026-08-25T01:00:00.000Z")[0];
  assert.equal(opened.sealedQuantity, 0);
  assert.equal(opened.openedQuantity, 1);
  const finished = applyCollectionInventoryAction([opened], opened.canonicalKey, "finish_bottle", "2026-08-25T02:00:00.000Z")[0];
  assert.equal(collectionDisplayKind(finished), "tasted");
  assert.equal(finished.finishedCount, tasted.finishedCount + 1);
  const removed = applyCollectionInventoryAction([owned], owned.canonicalKey, "keep_tasted_only", "2026-08-25T03:00:00.000Z")[0];
  assert.equal(collectionDisplayKind(removed), "tasted");
  assert.equal(removed.rating, 93);
});

test("upserts existing whiskey instead of creating duplicate owned and tasted records", () => {
  const existing = bottle({ bottleId: "eagle-rare", bottleName: "Eagle Rare 10 Year", canonicalKey: "eagle rare 10 year", sealedQuantity: 0, openedQuantity: 0, tastedOnly: true, rating: 91, isRated: true });
  const updated = upsertCollectionBottle([existing], { id: "eagle-rare", name: "Eagle Rare 10 Year" }, { kind: "sealed", quantity: 2, isRated: false }, "2026-08-25T00:00:00.000Z");
  assert.equal(updated.length, 1);
  assert.equal(updated[0].sealedQuantity, 2);
  assert.equal(updated[0].rating, 91, "adding ownership does not erase an existing rating");
  assert.equal(updated[0].tastedOnly, false);
});

test("native taste toggles exactly match the website choices", () => {
  assert.deepEqual(TASTE_TAG_OPTIONS, ["Caramel", "Vanilla", "Oak", "Cherry", "Spice", "Proof heat", "Sweet", "Dark fruit", "Nutty", "Smoky", "Dessert", "Balanced"]);
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
