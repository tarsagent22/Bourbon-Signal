import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  COMMUNITY_ALERT_AUTHORITY_LIMIT,
  COMMUNITY_ALERT_AUTHORITY_WINDOW_HOURS,
  COMMUNITY_CONTRIBUTOR_SPACING_HOURS,
  COMMUNITY_CONTRIBUTOR_SURVIVAL_HOURS,
  assessCommunityContributorStanding,
  communityAlertAllowance,
  communityVoteAllowed,
  type CommunityContributorModeration,
} from "../src/lib/community-contributor-standing.ts";
import type { MemberSighting } from "../src/lib/sightings.ts";

const now = "2026-08-29T16:00:00.000Z";
const clean = (createdAt: string, overrides: Partial<MemberSighting> = {}): MemberSighting => ({
  id: `sighting-${createdAt}`,
  bottleId: "stagg",
  bottleName: "Stagg",
  rarityTier: "allocated",
  storeId: "canonical-store-1",
  storeName: "Example Spirits",
  storeAddress: "123 Main St",
  storeCity: "Miami",
  storeState: "FL",
  source: "custom",
  sightingType: "seen_in_store",
  reporterUserId: "member-1",
  createdAt,
  ...overrides,
});

test("standing requires two clean sightings spaced at least 24 hours apart after both survive 24 hours", () => {
  assert.equal(COMMUNITY_CONTRIBUTOR_SPACING_HOURS, 24);
  assert.equal(COMMUNITY_CONTRIBUTOR_SURVIVAL_HOURS, 24);
  assert.equal(assessCommunityContributorStanding([
    clean("2026-08-26T16:00:00.000Z"),
    clean("2026-08-27T16:00:00.000Z"),
  ], now), "active");
  assert.equal(assessCommunityContributorStanding([
    clean("2026-08-27T17:00:00.000Z"),
    clean("2026-08-28T16:00:00.000Z"),
  ], now), "new", "sightings less than 24 hours apart do not establish standing");
  assert.equal(assessCommunityContributorStanding([
    clean("2026-08-27T15:59:59.999Z"),
    clean("2026-08-28T16:00:00.001Z"),
  ], now), "new", "a sighting must survive the full 24-hour window");
});

test("removed, rejected, and pending-review sightings do not establish standing", () => {
  const anchor = clean("2026-08-25T16:00:00.000Z");
  for (const disqualified of [
    clean("2026-08-27T16:00:00.000Z", { rewardState: { removedAt: "2026-08-28T00:00:00.000Z" } }),
    clean("2026-08-27T16:00:00.000Z", { rewardState: { rejectedAt: "2026-08-28T00:00:00.000Z" } }),
    clean("2026-08-27T16:00:00.000Z", { reviewState: { needsBottleReview: true } }),
  ]) assert.equal(assessCommunityContributorStanding([anchor, disqualified], now), "new");
});

test("ordinary community availability feedback never reduces clean standing", () => {
  assert.equal(assessCommunityContributorStanding([
    clean("2026-08-25T16:00:00.000Z", { downCount: 20 }),
    clean("2026-08-27T16:00:00.000Z", { downCount: 30 }),
  ], now), "active");
});

test("explicit spam or deception restriction wins until a later restoration", () => {
  const sightings = [clean("2026-08-25T16:00:00.000Z"), clean("2026-08-27T16:00:00.000Z")];
  const restricted: CommunityContributorModeration = {
    restrictionKind: "spam",
    restrictionReason: "Repeated fabricated store reports",
    restrictedAt: "2026-08-28T12:00:00.000Z",
  };
  assert.equal(assessCommunityContributorStanding(sightings, now, restricted), "restricted");
  assert.equal(assessCommunityContributorStanding(sightings, now, {
    ...restricted,
    restorationReason: "Owner review cleared the account",
    restoredAt: "2026-08-29T12:00:00.000Z",
  }), "active");
});

test("only three alert-authority reservations fit in each rolling 24-hour window", () => {
  assert.equal(COMMUNITY_ALERT_AUTHORITY_LIMIT, 3);
  assert.equal(COMMUNITY_ALERT_AUTHORITY_WINDOW_HOURS, 24);
  assert.equal(communityAlertAllowance([
    "2026-08-28T16:00:00.001Z",
    "2026-08-29T01:00:00.000Z",
    "2026-08-29T15:00:00.000Z",
  ], now), false);
  assert.equal(communityAlertAllowance([
    "2026-08-28T16:00:00.000Z",
    "2026-08-29T01:00:00.000Z",
    "2026-08-29T15:00:00.000Z",
  ], now), true, "the exact 24-hour boundary has rolled out of the active window");
});

test("reporters cannot vote on their own sightings", () => {
  assert.equal(communityVoteAllowed("member-1", "member-1"), false);
  assert.equal(communityVoteAllowed("member-1", "member-2"), true);
  assert.equal(communityVoteAllowed("", "member-2"), false);
});

test("durable schema and repository retain moderation evidence and alert-authority reservations", () => {
  const schema = readFileSync("src/lib/community-sightings-schema.sql", "utf8");
  const repository = readFileSync("src/lib/community-sightings-repository.ts", "utf8");
  const adminRoute = readFileSync("src/app/api/admin/sightings/route.ts", "utf8");
  assert.match(schema, /CREATE TABLE IF NOT EXISTS community_contributor_moderation/);
  assert.match(schema, /restriction_kind[\s\S]*restriction_reason[\s\S]*restricted_at[\s\S]*restoration_reason[\s\S]*restored_at/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS community_sighting_alert_authority/);
  assert.match(repository, /listRecentAlertSightings[\s\S]*contributorStanding/);
  assert.match(repository, /reserveAlertAuthority[\s\S]*community_sighting_alert_authority/);
  assert.match(repository, /findRecentCanonicalDuplicate[\s\S]*reporter_user_id = \$1[\s\S]*payload->>'bottleId'[\s\S]*payload->>'storeId'/);
  assert.match(adminRoute, /getContributorModeration[\s\S]*contributorModeration/, "moderation reasons and timestamps must be readable only through the admin surface");
});
