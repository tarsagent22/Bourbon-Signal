import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import * as dossierModule from "../src/lib/bottle-check-dossier.ts";
import * as suggestionModule from "../src/lib/bottle-suggestion-index.ts";

const dossier = (dossierModule as typeof dossierModule & { default?: typeof dossierModule }).default ?? dossierModule;
const suggestions = (suggestionModule as typeof suggestionModule & { default?: typeof suggestionModule }).default ?? suggestionModule;
const {
  findBottleCheckCollectionEntry,
  formatBottleCheckCollectionRating,
} = dossier;
const { searchFastBottleSuggestions } = suggestions;

const collection = [
  {
    bottleId: "eagle-rare-10y",
    bottleName: "Eagle Rare 10 Year",
    canonicalKey: "eagle rare 10 year",
    rating: 87,
    isRated: true,
    ratedAt: "2026-08-01T00:30:00.000Z",
    sealedQuantity: 1,
    openedQuantity: 0,
    finishedCount: 0,
    tastedOnly: false,
    addedAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
];

const saved = findBottleCheckCollectionEntry(collection, {
  id: "eagle-rare-10",
  canonicalName: "Eagle Rare 10 Year Kentucky Straight Bourbon",
});
assert.equal(saved?.rating, 87, "Bottle Check should recognize a saved bottle by stable ID even when display names differ");
assert.equal(formatBottleCheckCollectionRating(saved), "You rated this bottle 8.7/10.");
assert.equal(formatBottleCheckCollectionRating({ ...collection[0], rating: 0, isRated: false }), "This bottle is in your collection, but you haven’t rated it yet.");
assert.equal(formatBottleCheckCollectionRating({ ...collection[0], rating: 0, isRated: true }), "You rated this bottle 0.0/10.");
assert.equal(formatBottleCheckCollectionRating(null), null);

const blantons = searchFastBottleSuggestions("blantons", 6);
assert.equal(blantons[0]?.canonicalName, "Blanton's Single Barrel", "generic Blanton's intent should rank the standard expression first");
assert.match(blantons[0].canonicalName, /blanton/i, "fast suggestions should preserve useful ranking");
assert.ok(blantons.length <= 6, "fast suggestions should honor the response limit");
assert.ok(blantons.every((item) => typeof item.matchScore === "number" && item.matchScore > 0));

const weller = searchFastBottleSuggestions("weller green", 6);
assert.equal(weller[0]?.canonicalName, "W.L. Weller Special Reserve", "nickname aliases should stay useful");
assert.equal(searchFastBottleSuggestions("wt101", 6)[0]?.canonicalName, "Wild Turkey 101 Bourbon", "curated seed aliases must remain in autocomplete");
assert.equal(searchFastBottleSuggestions("gts", 6)[0]?.canonicalName, "George T. Stagg", "curated allocated-bottle aliases must remain in autocomplete");

const startedAt = performance.now();
for (let index = 0; index < 250; index += 1) searchFastBottleSuggestions(index % 2 ? "eagle rare" : "weller", 8);
const elapsedMs = performance.now() - startedAt;
assert.ok(elapsedMs < 500, `250 warm suggestion searches should stay under 500ms; received ${elapsedMs.toFixed(1)}ms`);

const page = readFileSync(new URL("../src/app/bottle-check/page.tsx", import.meta.url), "utf8");
assert.match(page, /const suggestionCache = useRef\(new Map/,
  "Bottle Check should retain exact-query suggestion results for the session");
assert.match(page, /findCachedSuggestionPrefix/,
  "Bottle Check should reuse a prior prefix while the more specific request is in flight");
assert.match(page, /}, 40\);/,
  "Bottle Check suggestion debounce should be short enough to feel immediate");
assert.doesNotMatch(page, /function updateSuggestionQuery\(value: string\) \{[\s\S]{0,260}?setLiveSuggestions\(\[\]\)/,
  "typing should not blank useful prefix results before the next response arrives");
assert.match(page, /collectionRatingCopy/,
  "Bottle Check should render collection-aware rating copy");
assert.match(page, /<p>\{collectionRatingCopy \|\|/,
  "the saved-rating copy should replace the add-to-collection explanation");

const bottleRoute = readFileSync(new URL("../src/app/api/bottle-check/route.ts", import.meta.url), "utf8");
const suggestBranch = bottleRoute.indexOf('if (intent === "suggest" || intent === "suggest-authoritative")');
const usageGate = bottleRoute.indexOf("consumeFreeBottleCheckIfNeeded(intent)");
assert.ok(suggestBranch >= 0 && usageGate >= 0 && suggestBranch < usageGate,
  "suggestions should return from the lightweight public index before auth/usage and full catalog work");
assert.match(bottleRoute, /intent === "suggest" \|\| intent === "suggest-authoritative"/);
assert.match(bottleRoute, /intent === "suggest-authoritative"[\s\S]*searchBourbonBible\(query, 8\)[\s\S]*searchFastBottleSuggestions\(query, 8\)/,
  "authoritative suggestions should be a separate refinement endpoint rather than blocking the fast response");
assert.match(page, /intent=suggest-authoritative/);
assert.match(page, /authoritativeSuggestionCache/);
assert.match(bottleRoute, /s-maxage=86400/,
  "suggestion responses should be CDN-cacheable because the catalog result is non-member-specific");

const sightingsRoute = readFileSync(new URL("../src/app/api/sightings/route.ts", import.meta.url), "utf8");
const sightingsRepo = readFileSync(new URL("../src/lib/community-sightings-repository.ts", import.meta.url), "utf8");
const sightingsHook = readFileSync(new URL("../src/hooks/useSightings.ts", import.meta.url), "utf8");
const sightingsClient = readFileSync(new URL("../src/app/sightings/SightingsClient.tsx", import.meta.url), "utf8");

assert.match(sightingsRepo, /listSightingsFeed\(\s*currentUserId: string,\s*limit = 60/,
  "the public feed should use a bounded purpose-built query");
assert.match(sightingsRepo, /recent AS MATERIALIZED[\s\S]*LIMIT \$1/,
  "the feed page should be bounded before votes are loaded");
assert.match(sightingsRepo, /listVotesForSightings[\s\S]*sighting_id = ANY\(\$1::text\[\]\)/,
  "vote work should be bounded to visible sighting IDs");
assert.match(sightingsRoute, /COMMUNITY_SIGHTINGS_DURABLE_CUTOVER\.completed/,
  "normal feed reads should skip Clerk only behind the verified durable cutover marker");
assert.match(sightingsRoute, /Math\.min\(limit, 1_000\)/,
  "load-more should remain available through the historical 1,000-row ceiling");
assert.match(sightingsRoute, /includeRewards = url\.searchParams\.get\("rewards"\) !== "0"/,
  "reward work should be optional for feed-only clients");
assert.match(sightingsHook, /includeRewards\?: boolean/);
assert.match(sightingsHook, /feedLimit\?: number/);
assert.match(sightingsClient, /includePreferences: false, includeRewards: false, feedLimit/,
  "the sightings page should request only its bounded feed-critical payload");
assert.match(sightingsClient, /Load more sightings/);

console.log(`Member experience performance contract passed (${elapsedMs.toFixed(1)}ms suggestion loop).`);
