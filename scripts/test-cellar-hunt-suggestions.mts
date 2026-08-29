import assert from "node:assert/strict";
import { buildCellarHuntSuggestions } from "../src/lib/cellar-hunt-suggestions.ts";

const collection = [
  {
    canonicalKey: "favorite local",
    bottleName: "Favorite Local",
    rating: 91,
    isRated: true,
    wouldBuyAgain: true,
    finishedCount: 1,
    tastedOnly: false,
  },
  {
    canonicalKey: "already watched",
    bottleName: "Already Watched",
    rating: 98,
    isRated: true,
    wouldBuyAgain: true,
    finishedCount: 2,
    tastedOnly: false,
  },
  {
    canonicalKey: "finished favorite",
    bottleName: "Finished Favorite",
    rating: 88,
    isRated: true,
    wouldBuyAgain: true,
    finishedCount: 2,
    tastedOnly: false,
  },
  {
    canonicalKey: "tasted favorite",
    bottleName: "Tasted Favorite",
    rating: 86,
    isRated: true,
    wouldBuyAgain: undefined,
    finishedCount: 0,
    tastedOnly: true,
  },
  {
    canonicalKey: "quiet bottle",
    bottleName: "Quiet Bottle",
    rating: 62,
    isRated: true,
    wouldBuyAgain: false,
    finishedCount: 0,
    tastedOnly: false,
  },
  {
    canonicalKey: "fourth favorite",
    bottleName: "Fourth Favorite",
    rating: 84,
    isRated: true,
    wouldBuyAgain: true,
    finishedCount: 0,
    tastedOnly: false,
  },
];
const watched = ["already watched"];
const collectionSnapshot = structuredClone(collection);
const watchedSnapshot = [...watched];

const suggestions = buildCellarHuntSuggestions({
  collection,
  watchedBottleKeys: watched,
  localSignals: [
    { canonicalKey: "favorite local", observedAt: "2026-08-28T15:00:00.000Z" },
    { canonicalKey: "favorite local", observedAt: "2026-08-27T15:00:00.000Z" },
  ],
  now: Date.parse("2026-08-29T15:00:00.000Z"),
  limit: 99,
});

assert.equal(suggestions.length, 3, "Cellar offers at most three Hunt Next suggestions");
assert.equal(suggestions.some((item) => item.canonicalKey === "already watched"), false, "watched bottles are excluded");
assert.equal(suggestions.some((item) => item.canonicalKey === "quiet bottle"), false, "weak or negative evidence is not promoted");
assert.equal(suggestions[0]?.canonicalKey, "favorite local", "explicit preference plus local context ranks first");
assert.equal(suggestions[0]?.reason, "You rated this 9.1 and it has appeared locally.");
assert.ok(suggestions.every((item) => item.actionLabel === "Watch for another"), "every suggestion requires an explicit watch action");
assert.deepEqual(collection, collectionSnapshot, "suggestion generation never mutates Cellar data");
assert.deepEqual(watched, watchedSnapshot, "suggestion generation never mutates Radar preferences");

const simple = buildCellarHuntSuggestions({
  collection: collection.slice(2, 4),
  watchedBottleKeys: [],
});
assert.match(simple.find((item) => item.canonicalKey === "finished favorite")?.reason || "", /finished 2 bottles/i);
assert.match(simple.find((item) => item.canonicalKey === "tasted favorite")?.reason || "", /rated this 8\.6 after tasting/i);

console.log("Cellar-to-Radar suggestion tests passed.");
