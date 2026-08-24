import assert from "node:assert/strict";
import test from "node:test";
import { buildCommunityAlertCandidates, qualifyCommunitySighting } from "../src/lib/community-alert-candidates.ts";
import type { MemberSighting } from "../src/lib/sightings.ts";

const now = "2026-08-24T12:00:00.000Z";
const canonicalStores = new Map([["FL:canonical-store-1", {
  id: "canonical-store-1",
  name: "Example Spirits",
  address: "123 Main St, Miami, FL 33101",
  city: "Miami",
  state: "FL",
}]]);
const valid = (overrides: Partial<MemberSighting> = {}): MemberSighting => ({
  id: "sighting-1",
  bottleId: "stagg",
  bottleName: "Stagg",
  rarityTier: "allocated",
  storeId: "canonical-store-1",
  storeName: "Example Spirits",
  storeAddress: "123 Main St, Miami, FL 33101",
  storeCity: "Miami",
  storeState: "FL",
  source: "finder",
  sightingType: "seen_in_store",
  reporterUserId: "user-1",
  createdAt: "2026-08-24T10:00:00.000Z",
  ...overrides,
});

test("only strict current exact-store community sightings qualify", () => {
  assert.equal(qualifyCommunitySighting(valid(), now, canonicalStores).qualified, true);
  for (const sighting of [
    valid({ reporterUserId: undefined }),
    valid({ sightingType: "online_social" }),
    valid({ bottleId: undefined }),
    valid({ storeId: "manual-store-miami" }),
    valid({ storeAddress: "" }),
    valid({ storeCity: undefined }),
    valid({ reviewState: { needsBottleReview: true } }),
    valid({ reviewState: { needsStoreReview: true } }),
    valid({ reviewState: { manualStoreCity: "Miami" } }),
    valid({ rewardState: { removedAt: now } }),
    valid({ rewardState: { rejectedAt: now } }),
    valid({ createdAt: "2026-08-24T09:59:59.999Z" }),
    valid({ createdAt: "2026-08-20T10:00:00.000Z" }),
  ]) assert.equal(qualifyCommunitySighting(sighting, now, canonicalStores).qualified, false);
  assert.equal(qualifyCommunitySighting(valid({ storeCity: "Orlando" }), now, canonicalStores).qualified, false);
  assert.equal(qualifyCommunitySighting(valid({ storeName: "Spoofed Store" }), now, canonicalStores).qualified, false);
  assert.equal(qualifyCommunitySighting(valid({ storeState: "GA", storeCity: "Atlanta" }), now, canonicalStores).qualified, false);
});

test("community candidates are stable, deduped, cautious, and contain no quantity claim", () => {
  const candidates = buildCommunityAlertCandidates([valid(), valid()], now, canonicalStores);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.sourceType, "community");
  assert.equal(candidates[0]?.dedupeKey, "community-sighting:sighting-1");
  assert.match(String(candidates[0]?.availabilityLabel), /reported seeing/i);
  assert.doesNotMatch(JSON.stringify(candidates[0]), /quantityEstimate|verified stock|in stock/i);
});
