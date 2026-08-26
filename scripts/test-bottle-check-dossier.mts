import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TIER_ENTITLEMENTS } from "../src/lib/entitlements.ts";
import {
  assessShelfPrice,
  bottleCheckActionAccess,
  buildBottleCheckCollectionEntry,
  countBottleCheckAlertAreas,
  countDistinctTrackedBottles,
} from "../src/lib/bottle-check-dossier.ts";

assert.equal(assessShelfPrice(null, 50), null, "price guidance requires a listed MSRP");
assert.equal(assessShelfPrice(40, null), null, "price guidance requires a shelf price");
assert.deepEqual(assessShelfPrice(40, 40), {
  tone: "near",
  label: "At MSRP",
  detail: "This shelf price matches the MSRP listed in Bottle Check.",
  premiumPercent: 0,
});
assert.equal(assessShelfPrice(40, 44)?.label, "Near MSRP");
assert.deepEqual(assessShelfPrice(100, 101), {
  tone: "near",
  label: "Near MSRP",
  detail: "This shelf price is 1% above the MSRP listed in Bottle Check.",
  premiumPercent: 1,
});
assert.equal(assessShelfPrice(100, 100.4)?.detail, "This shelf price is less than 1% above the MSRP listed in Bottle Check.");
assert.equal(assessShelfPrice(100, 99.6)?.detail, "This shelf price is less than 1% below the MSRP listed in Bottle Check.");
assert.ok(Math.abs((assessShelfPrice(100, 100.6)?.premiumPercent || 0) - 0.6) < 1e-9, "sub-1% UI output preserves the signed raw delta");
assert.equal(assessShelfPrice(40, 50)?.label, "25% above MSRP");
assert.equal(assessShelfPrice(40, 58)?.label, "45% above MSRP");
assert.equal(assessShelfPrice(40, 80)?.label, "100% above MSRP");
assert.equal(assessShelfPrice(40, -1), null, "invalid shelf prices do not create guidance");

assert.deepEqual(bottleCheckActionAccess("track", TIER_ENTITLEMENTS.free), {
  allowed: false,
  requiredTier: "Standard Proof",
  title: "Upgrade membership to track this bottle",
  description: "Standard Proof and higher memberships can save bottle alerts for selected markets.",
});
assert.equal(bottleCheckActionAccess("track", TIER_ENTITLEMENTS.standard).allowed, true);
assert.deepEqual(bottleCheckActionAccess("track", TIER_ENTITLEMENTS.standard, {
  trackedBottleCount: 15,
  currentAlertAreaCount: 4,
  requestedNewAreaCount: 0,
  alreadyTracked: false,
}), {
  allowed: false,
  requiredTier: "Barrel Proof",
  title: "Upgrade membership to track more bottles",
  description: "Barrel Proof and Founder memberships include unlimited tracked bottles and alert areas.",
});
assert.equal(bottleCheckActionAccess("track", TIER_ENTITLEMENTS.standard, {
  trackedBottleCount: 15,
  currentAlertAreaCount: 5,
  requestedNewAreaCount: 0,
  alreadyTracked: true,
}).allowed, true, "an already tracked Standard bottle remains a completed action");
assert.equal(bottleCheckActionAccess("track", TIER_ENTITLEMENTS.free, {
  trackedBottleCount: 15,
  currentAlertAreaCount: 5,
  requestedNewAreaCount: 0,
  alreadyTracked: true,
}).allowed, false, "downgraded Free users still receive the upgrade gate");
assert.equal(bottleCheckActionAccess("track", TIER_ENTITLEMENTS.standard, {
  trackedBottleCount: 2,
  currentAlertAreaCount: 5,
  requestedNewAreaCount: 1,
  alreadyTracked: false,
}).allowed, false, "new markets cannot be silently trimmed at the Standard area limit");

assert.deepEqual(bottleCheckActionAccess("collection", TIER_ENTITLEMENTS.free), {
  allowed: false,
  requiredTier: "Barrel Proof",
  title: "Upgrade membership to add this bottle to your collection",
  description: "Barrel Proof and Founder memberships include the saved collection and taste profile.",
});
assert.equal(bottleCheckActionAccess("collection", TIER_ENTITLEMENTS.standard).allowed, false);
assert.equal(bottleCheckActionAccess("collection", TIER_ENTITLEMENTS.barrel).allowed, true);
assert.equal(bottleCheckActionAccess("collection", TIER_ENTITLEMENTS["bottled-in-bond"]).allowed, true);

assert.equal(countBottleCheckAlertAreas({
  states: ["NC", "VA", "PA"],
  ncBoards: ["Wake", "Mecklenburg"],
  vaCities: ["Richmond"],
  paCounties: ["Allegheny"],
  paStores: ["Store 1"],
}), 5);
assert.equal(countDistinctTrackedBottles({
  bottleNames: Array.from({ length: 15 }, (_, index) => `Name ${index}`),
  bottleKeys: Array.from({ length: 15 }, (_, index) => `Key ${index}`),
}), 30, "disjoint name and key arrays cannot bypass a 15-bottle limit");
assert.equal(countDistinctTrackedBottles({
  bottleNames: ["Eagle Rare 10 Year"],
  bottleKeys: ["eagle-rare-10-year"],
}), 1, "names and keys for the same normalized bottle count once");

const collectionEntry = buildBottleCheckCollectionEntry({
  bottleId: "eagle-rare-10",
  bottleName: "Eagle Rare 10 Year",
  canonicalKey: "eagle rare 10 year",
  now: "2026-08-11T12:00:00.000Z",
});
assert.deepEqual(collectionEntry, {
  bottleId: "eagle-rare-10",
  bottleName: "Eagle Rare 10 Year",
  canonicalKey: "eagle rare 10 year",
  rating: 0,
  isRated: false,
  tasteTags: [],
  wouldBuyAgain: false,
  opened: false,
  sealedQuantity: 1,
  openedQuantity: 0,
  finishedCount: 0,
  tastedOnly: false,
  notes: "",
  addedAt: "2026-08-11T12:00:00.000Z",
  updatedAt: "2026-08-11T12:00:00.000Z",
});

const page = readFileSync(new URL("../src/app/bottle-check/page.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../src/app/api/user/preferences/route.ts", import.meta.url), "utf8");
const preferencesHook = readFileSync(new URL("../src/hooks/useAreaPreferences.ts", import.meta.url), "utf8");
assert.doesNotMatch(page, /call first/i, "Bottle Check must not use call-first language");
assert.match(page, /Bottle facts/, "Bottle Check renders a facts dossier");
assert.match(page, /Shelf price/, "Bottle Check accepts a shelf price");
assert.match(page, /Add to collection/, "Bottle Check exposes a collection action");
assert.match(page, /role="dialog"[\s\S]*aria-modal="true"/, "upgrade messaging is an accessible dialog");
assert.match(page, /View membership options/, "upgrade dialog links to pricing");
assert.match(page, /requireBottleCheckAction\("track"\)/, "tracking checks the explicit action gate before saving");
assert.match(page, /requireBottleCheckAction\("collection"\)/, "collection checks the explicit action gate before saving");
assert.match(page, /saveResult\?\.status === "pending"/, "collection pending writes have an explicit UI state");
assert.match(page, /Retry sync/, "members can retry a pending collection sync");
assert.match(page, /role="status" aria-live="polite"/, "collection outcomes are announced accessibly");
assert.match(page, /bottle\.producer \|\| "Not listed"/, "unknown producers are not replaced with a brand");
assert.doesNotMatch(page, /current MSRP|reviewed MSRP|Fair shelf price/i, "price copy stays neutral without provenance");
assert.match(route, /payload\.collectionPreferences !== undefined && !entitlements\.canUseCollection/, "collection entitlement is enforced before durable writes");
assert.match(route, /Collection is included with Barrel Proof and Founder memberships\./, "server denial explains the required collection tier");
assert.match(route, /code: "alert_area_limit_reached"/, "server rejects alert-area overflow instead of trimming it as success");
assert.match(route, /code: "tracked_bottle_limit_reached"/, "server rejects tracked-bottle overflow instead of trimming it as success");
assert.match(preferencesHook, /collectionSyncState/, "durable pending and conflict state is exposed after reload");
assert.match(page, /effectiveCollectionSaveState/, "Bottle Check keeps persistent collection retries actionable");
assert.match(page, /isInCollection \? collectionSyncState : "idle"/, "persistent sync state is scoped to a displayed collection bottle");
assert.match(page, /retryExistingCollection[\s\S]*prefs\.collectionPreferences/, "retry replays the persisted collection without rebuilding a bottle entry");
assert.equal((route.match(/code: "alert_area_limit_reached"/g) || []).length, 2, "real and QA-preview writes both reject alert-area overflow");
assert.equal((route.match(/code: "tracked_bottle_limit_reached"/g) || []).length, 2, "real and QA-preview writes both reject tracked-bottle overflow");
assert.equal((route.match(/countDistinctTrackedBottles\(/g) || []).length, 2, "both server paths enforce the normalized union count");

console.log("Bottle Check dossier and entitlement contracts passed.");
