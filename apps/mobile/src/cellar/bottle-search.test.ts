import assert from "node:assert/strict";
import test from "node:test";
import type { MemberCollectionBottle, RadarBottleOption } from "../api/types";
import { createCustomCollectionBottle, exactCustomBottleMatchIndex, upsertCollectionBottle } from "../interactions/member-interactions";
import { collectionMatchForOption, createBottleSearchIndex, rankBottleCatalog } from "./bottle-search";

const catalog: RadarBottleOption[] = [
  { id: "eagle-rare", name: "Eagle Rare 10 Year", aliases: ["ER10"], brand: "Buffalo Trace", producer: "Sazerac", proof: 90, ageStatement: "10 Years" },
  { id: "rare-breed", name: "Wild Turkey Rare Breed", aliases: ["WT Rare Breed"], brand: "Wild Turkey", producer: "Campari", proof: 116.8 },
  { id: "eh-taylor", name: "E.H. Taylor Small Batch", aliases: ["Colonel Taylor", "EHT"], brand: "E.H. Taylor", proof: 100 },
  { id: "makers-mark", name: "Maker’s Mark", aliases: ["Maker's"], brand: "Maker’s Mark", proof: 90 },
  { id: "larceny", name: "Larcény Small Batch", brand: "Larceny", proof: 92 },
];

const searchIndex = createBottleSearchIndex(catalog);

test("precomputed local Cellar search covers names, aliases, brand, producer, proof, age, and cross-field tokens", () => {
  assert.equal(rankBottleCatalog(searchIndex, "wild turkey", 10)[0]?.id, "rare-breed", "name");
  assert.equal(rankBottleCatalog(searchIndex, "eht", 10)[0]?.id, "eh-taylor", "alias");
  assert.equal(rankBottleCatalog(searchIndex, "buffalo", 10)[0]?.id, "eagle-rare", "brand");
  assert.equal(rankBottleCatalog(searchIndex, "sazerac", 10)[0]?.id, "eagle-rare", "producer");
  assert.equal(rankBottleCatalog(searchIndex, "90 proof", 10)[0]?.id, "eagle-rare", "proof with deterministic name fallback");
  assert.equal(rankBottleCatalog(searchIndex, "10 year", 10)[0]?.id, "eagle-rare", "age statement");
  assert.equal(rankBottleCatalog(searchIndex, "10 years", 10)[0]?.id, "eagle-rare", "year and years normalize together");
  assert.equal(rankBottleCatalog(searchIndex, "buffalo eagle", 10)[0]?.id, "eagle-rare", "tokens can match across brand and name");
  assert.equal(rankBottleCatalog(searchIndex, "makers", 10)[0]?.id, "makers-mark", "straight and curly apostrophes normalize together");
  assert.equal(rankBottleCatalog(searchIndex, "larceny", 10)[0]?.id, "larceny", "diacritics do not prevent a match");
});

test("local search retains deterministic name and alias priority", () => {
  assert.deepEqual(rankBottleCatalog(searchIndex, "rare", 10).map((item) => item.id), ["rare-breed", "eagle-rare"]);
  assert.deepEqual(rankBottleCatalog(searchIndex, "", 10), []);
});

test("search options resolve an existing canonical Cellar record for state-aware actions", () => {
  const existing = [{ bottleId: "eagle-rare", bottleName: "Eagle Rare 10 Year", canonicalKey: "eagle rare 10 year" }] as MemberCollectionBottle[];
  assert.equal(collectionMatchForOption(existing, catalog[0]), existing[0]);
  assert.equal(collectionMatchForOption(existing, catalog[1]), undefined);
});

test("a pending custom expression reconciles in place to its catalog bottle without losing personal data", () => {
  const pending = {
    ...createCustomCollectionBottle(
      { name: "My Local Pick", proof: 101.3, detail: "Batch 7" },
      { kind: "just_tasted", isRated: true, rating: 88, tasteTags: ["Cherry", "Oak"], notes: "A memorable pour", tastingContext: "event" },
      "2026-08-20T00:00:00.000Z",
    ),
    wouldBuyAgain: true,
    pricePaid: 64.99,
    store: "Local Shop",
    purchaseDate: "2026-07-04",
    finishedCount: 2,
    bottleContributionId: "contribution-505",
  };
  const unrelatedExpression = {
    ...pending,
    bottleId: "catalog-expression",
    bottleName: "My Local Pick · 110 proof · Batch 9",
    canonicalKey: "my local pick 110 proof batch 9",
    pendingCanonicalMatch: false,
    bottleContributionId: undefined,
  };
  const option = { id: "my-local-pick", name: "My Local Pick", aliases: ["The Local Pick"] };

  assert.equal(collectionMatchForOption([unrelatedExpression], option), undefined, "non-pending expressions and batches do not collapse into the base bottle");
  assert.equal(collectionMatchForOption([pending, unrelatedExpression], option), pending);

  const reconciled = upsertCollectionBottle(
    [pending, unrelatedExpression],
    option,
    { kind: "sealed", quantity: 1, isRated: false },
    "2026-08-25T00:00:00.000Z",
    { reconcilePendingCustom: true },
  );
  assert.equal(reconciled.length, 2);
  assert.equal(reconciled[1], unrelatedExpression);
  assert.deepEqual(reconciled[0], {
    ...pending,
    bottleId: "my-local-pick",
    bottleName: "My Local Pick",
    canonicalKey: "my local pick",
    pendingCanonicalMatch: false,
    sealedQuantity: 1,
    opened: false,
    tastedOnly: false,
    updatedAt: "2026-08-25T00:00:00.000Z",
  });

  const aliasPending = { ...pending, bottleName: "The Local Pick · 101.3 proof · Batch 7" };
  assert.equal(collectionMatchForOption([aliasPending], option), aliasPending, "pending base names also match exact catalog aliases");

  const reusedRecent = upsertCollectionBottle(
    [pending],
    { id: pending.bottleId, name: pending.bottleName },
    { kind: "sealed", quantity: 1 },
    "2026-08-26T00:00:00.000Z",
  )[0];
  assert.equal(reusedRecent.pendingCanonicalMatch, true, "reusing a recent pending record does not pretend the catalog approved it");
  assert.equal(reusedRecent.bottleId, pending.bottleId);

  const differentCustom = createCustomCollectionBottle(
    { name: "My Local Pick", proof: 110, detail: "Batch 9" },
    { kind: "sealed" },
    "2026-08-26T00:00:00.000Z",
  );
  assert.equal(exactCustomBottleMatchIndex([pending], differentCustom), -1, "different proof and batch expressions stay separate");
  assert.equal(exactCustomBottleMatchIndex([pending], { ...pending }), 0, "only the exact same custom expression is reused");
});
