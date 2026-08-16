import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SIGNAL_REWARD_CATALOG,
  canRedeemSignalPoints,
  isLegalRedemptionTransition,
  normalizeRedemptionDetails,
  rewardCatalogItem,
} from "../src/lib/signal-points.ts";
import { clerkRewardSourceTargets, normalizedClerkRewardPoints, SignalPointsRepository } from "../src/lib/signal-points-repository.ts";
import { REFERRAL_POINTS_BY_TIER } from "../src/lib/referrals.ts";
import { BADGE_POINTS_AWARD, SIGHTING_POINTS_BY_RARITY, WEEKLY_STREAK_POINTS_AWARD } from "../src/lib/sighting-rewards.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("launch catalog has the confirmed versioned prices and fulfillment kinds", () => {
  assert.deepEqual(Object.fromEntries(SIGNAL_REWARD_CATALOG.map((item) => [item.key, item.points])), {
    sticker_pack: 75,
    rocks_glass: 400,
    glencairn: 450,
    bourbon_shipping_gift_card_100: 2600,
  });
  assert.ok(SIGNAL_REWARD_CATALOG.every((item) => item.catalogVersion === 1));
  assert.equal(SIGNAL_REWARD_CATALOG.find((item) => item.key === "bourbon_shipping_gift_card_100")?.fulfillmentType, "digital");
  assert.equal(SIGNAL_REWARD_CATALOG.some((item) => item.key === "bourbon_shipping_gift_card_25"), false);
  assert.ok(SIGNAL_REWARD_CATALOG.filter((item) => item.fulfillmentType === "physical").every((item) => item.usShippingIncluded));
});

test("only paid memberships may redeem while Free can accumulate", () => {
  assert.equal(canRedeemSignalPoints("free"), false);
  for (const tier of ["standard", "barrel", "bottled-in-bond"] as const) assert.equal(canRedeemSignalPoints(tier), true);
});

test("member earning values stay authoritative", () => {
  assert.deepEqual(SIGHTING_POINTS_BY_RARITY, { unclassified: 10, limited: 10, allocated: 20, unicorn: 30 });
  assert.equal(BADGE_POINTS_AWARD, 10);
  assert.equal(WEEKLY_STREAK_POINTS_AWARD, 10);
  assert.deepEqual(REFERRAL_POINTS_BY_TIER, { free: 10, standard: 50, barrel: 100, "bottled-in-bond": 150 });
});

test("Clerk sighting balances migrate 10x once and normalized rewards remain exact", () => {
  assert.equal(normalizedClerkRewardPoints({ points: 8, ledger: [{ id: "old", reason: "sighting_base_v3", points: 3 }] }), 80);
  assert.equal(normalizedClerkRewardPoints({ points: 80, ledger: [{ id: "new", reason: "sighting_base_v4", points: 30 }] }), 80);
  assert.equal(normalizedClerkRewardPoints({
    points: 34,
    ledger: [
      { id: "old", reason: "sighting_base_v3", points: 3 },
      { id: "new", reason: "sighting_base_v4", points: 30 },
      { id: "legacy-badge", reason: "badge_v2", points: 1 },
    ],
  }), 70, "legacy entries are scaled individually when a profile also contains normalized entries");
});

test("Clerk reward entries become independent durable sources for concurrent sightings and corrections", () => {
  const first = clerkRewardSourceTargets({ points: 20, ledger: [
    { id: "sighting_base_v4:sighting-a", sightingId: "sighting-a", reason: "sighting_base_v4", points: 10 },
    { id: "badge_v3:first_sighting", badgeId: "first_sighting", reason: "badge_v3", points: 10 },
  ] });
  const concurrent = clerkRewardSourceTargets({ points: 20, ledger: [
    { id: "sighting_base_v4:sighting-b", sightingId: "sighting-b", reason: "sighting_base_v4", points: 10 },
    { id: "badge_v3:first_sighting", badgeId: "first_sighting", reason: "badge_v3", points: 10 },
  ] });
  assert.notEqual(first.find((source) => source.metadata.sightingId === "sighting-a")?.sourceKey, concurrent.find((source) => source.metadata.sightingId === "sighting-b")?.sourceKey);
  assert.equal(first.find((source) => source.metadata.badgeId === "first_sighting")?.sourceKey, concurrent.find((source) => source.metadata.badgeId === "first_sighting")?.sourceKey);
  assert.equal(clerkRewardSourceTargets({ points: 10, ledger: [
    { id: "sighting_base_v4:sighting-a", sightingId: "sighting-a", reason: "sighting_base_v4", points: 10, revokedAt: "2026-08-12T12:00:00.000Z" },
    { id: "sighting_base_v4:sighting-b", sightingId: "sighting-b", reason: "sighting_base_v4", points: 10 },
  ] }).find((source) => source.metadata.sightingId === "sighting-a")?.targetPoints, 0, "removal explicitly zeros only the removed sighting source");
  assert.equal(clerkRewardSourceTargets({ points: 30, ledger: [
    { id: "sighting_base_v4:sighting-b", sightingId: "sighting-b", reason: "sighting_base_v4", points: 30 },
  ] }).find((source) => source.metadata.sightingId === "sighting-b")?.targetPoints, 30, "rarity updates reuse the sighting source key with a new target");
});

test("sighting mutation routes reconcile one complete generation-guarded source set", () => {
  const repository = read("src/lib/signal-points-repository.ts");
  assert.match(repository, /reconcile_signal_point_source_set/);
  assert.doesNotMatch(repository, /for \(const source of clerkRewardSourceTargets/);
  const communityRepository = read("src/lib/community-sightings-repository.ts");
  assert.match(communityRepository, /rewardGeneration/);
  for (const path of ["src/app/api/sightings/route.ts", "src/app/api/sightings/photo/route.ts", "src/app/api/admin/sightings/route.ts"]) {
    assert.match(read(path), /reconcileClerkRewards\([^;]*rewardGeneration/);
  }
});

test("member cutover gate fails closed and has only an explicit non-production override", async () => {
  const closed = new SignalPointsRepository({ query: async () => [] });
  await assert.rejects(closed.assertCutoverVerified(), /not verified complete/i);
  const open = new SignalPointsRepository({ query: async () => [{ verified: 1 }] });
  await open.assertCutoverVerified();
  const localOverride = new SignalPointsRepository({ query: async () => { throw new Error("should not query"); } }, { allowUnverifiedCutover: true });
  await localOverride.assertCutoverVerified();
  const repository = read("src/lib/signal-points-repository.ts");
  assert.match(repository, /SIGNAL_POINTS_ALLOW_UNVERIFIED_CUTOVER/);
  assert.match(repository, /NODE_ENV\s*===\s*["']production["'][\s\S]*forbidden in production/i);
});

test("glass engraving is short, validated, and priced per glass", () => {
  assert.deepEqual(normalizeRedemptionDetails("rocks_glass", { glassStyle: "standard" }), { ok: true, details: { glassStyle: "standard" }, surchargePoints: 0 });
  assert.deepEqual(normalizeRedemptionDetails("glencairn", { glassStyle: "personal", engravingText: "C.T. 2026" }), {
    ok: true, details: { glassStyle: "personal", engravingText: "C.T. 2026" }, surchargePoints: 125,
  });
  assert.equal(normalizeRedemptionDetails("rocks_glass", { glassStyle: "personal", engravingText: "BOURBON SIGNAL MEMBER NAME IS TOO LONG" }).ok, false);
});

test("the reduced catalog keeps only stickers, two glasses, and the gift card", () => {
  assert.deepEqual(SIGNAL_REWARD_CATALOG.map((item) => item.key), ["sticker_pack", "rocks_glass", "glencairn", "bourbon_shipping_gift_card_100"]);
  assert.equal(rewardCatalogItem("tshirt")?.key, "tshirt", "retired definitions remain available only for safe idempotent retries");
  assert.equal(rewardCatalogItem("bourbon_shipping_gift_card_25")?.key, "bourbon_shipping_gift_card_25", "the retired gift card remains retry-safe");
  assert.equal(normalizeRedemptionDetails("bourbon_shipping_gift_card_100", { age21Attested: false, accountEmail: "member@example.com" }).ok, false);
  assert.equal(normalizeRedemptionDetails("bourbon_shipping_gift_card_100", { age21Attested: true, accountEmail: "member@example.com" }).ok, true);
  const schema = read("src/lib/signal-points-schema.sql");
  assert.match(read("src/lib/signal-points-repository.ts"), /INSERT INTO signal_point_accounts\(user_id\)[\s\S]*ON CONFLICT\(user_id\) DO NOTHING/, "new members receive a zero-balance account before their first read");
  assert.match(schema, /bourbon_shipping_gift_card_100[^\n]*2600/);
  assert.match(schema, /UPDATE signal_reward_catalog SET active=FALSE[\s\S]*item_key='bourbon_shipping_gift_card_25'/i);
  for (const retired of ["coaster_set", "tshirt", "rocks_glass_pair", "glencairn_pair", "hoodie"]) assert.match(schema, new RegExp(retired));
});

test("redemption state machine allows only forward fulfillment transitions and pre-fulfillment cancellation", () => {
  for (const [from, to] of [
    ["reserved", "details_required"], ["reserved", "submitted"], ["details_required", "submitted"],
    ["submitted", "approved"], ["approved", "packed"], ["approved", "digital_fulfillment"],
    ["packed", "shipped"], ["shipped", "delivered"], ["digital_fulfillment", "delivered"],
    ["reserved", "canceled"], ["details_required", "canceled"], ["submitted", "canceled"], ["approved", "canceled"],
  ] as const) assert.equal(isLegalRedemptionTransition(from, to), true, `${from} -> ${to}`);
  for (const [from, to] of [["packed", "canceled"], ["shipped", "canceled"], ["delivered", "approved"], ["canceled", "submitted"]] as const) {
    assert.equal(isLegalRedemptionTransition(from, to), false, `${from} -/-> ${to}`);
  }
});

test("schema, migration, encrypted backup, APIs, drawer, and owner queue are wired", () => {
  const schema = read("src/lib/signal-points-schema.sql");
  for (const token of ["signal_point_accounts", "signal_point_reward_generations", "signal_point_ledger", "signal_reward_catalog", "signal_reward_redemptions", "signal_reward_redemption_events", "signal_reward_fulfillments", "reserve_signal_reward", "transition_signal_reward_redemption"]) assert.match(schema, new RegExp(token));
  assert.match(schema, /ON CONFLICT\s*\(user_id,\s*idempotency_key\)/i);
  assert.match(schema, /FOR UPDATE/i);
  assert.match(schema, /inventory_remaining\s+IS\s+NULL\s+OR\s+(?:catalog_row\.)?inventory_remaining\s*>\s*0/i);
  assert.match(schema, /cancellation_credit/i);
  assert.match(schema, /member_referral_point_ledger/i);
  assert.match(schema, /signal_points_clerk_metadata_v1/i);
  assert.match(schema, /CREATE TRIGGER[\s\S]*signal_point_ledger[\s\S]*(UPDATE|DELETE)/i);
  assert.match(schema, /debt\s+INTEGER[\s\S]*CHECK\s*\(debt\s*>=\s*0\)/i);
  assert.match(schema, /balance_delta/i);
  assert.match(schema, /debt_delta/i);
  assert.match(schema, /signal_point_ledger_sign_matches_kind/i);
  assert.match(schema, /signal_point_ledger_economic_balance/i);
  assert.match(schema, /entry_kind\s+IN\s*\('credit','migration_credit','cancellation_credit'\)[\s\S]*balance_delta\s*>=\s*0[\s\S]*debt_delta\s*<=\s*0/i);
  assert.match(schema, /entry_kind\s+IN\s*\('debit','migration_debit','redemption_debit'\)[\s\S]*balance_delta\s*<=\s*0[\s\S]*debt_delta\s*>=\s*0/i);
  assert.match(schema, /shipping_address\s+JSONB/i);
  assert.match(schema, /signal_reward_fulfillment_tracking_pair/i);
  assert.match(schema, /CREATE TRIGGER\s+signal_reward_fulfillments_immutable_snapshot\s+BEFORE UPDATE/i);
  assert.match(schema, /shipping_address\s+IS DISTINCT FROM\s+OLD\.shipping_address/i);
  assert.match(schema, /Signal reward fulfillment snapshot is immutable/i);
  assert.match(schema, /Signal Points credit idempotency key conflict/i);
  assert.match(schema, /signal_points_clerk_metadata_v1_required/i);
  assert.match(schema, /signal_points_clerk_metadata_v1_verified_complete/i);
  assert.match(schema, /p_next_status='shipped'[\s\S]*carrier[\s\S]*tracking/i);
  assert.match(schema, /roll-forward/i);
  assert.match(schema, /referral-ledger-adjustment-9x:/);
  assert.match(schema, /imported\.points\*10=referrals\.points/);

  const migration = read("scripts/migrate-app-storage.mjs");
  assert.match(migration, /signal-points-schema\.sql/);
  for (const table of ["signal_point_accounts", "signal_point_reward_generations", "signal_point_ledger", "signal_reward_catalog", "signal_reward_redemptions", "signal_reward_redemption_events", "signal_reward_fulfillments"]) assert.match(migration, new RegExp(table));
  assert.match(migration, /expectedSignalConstraintShapes/);
  assert.match(migration, /signal_point_ledger_sign_matches_kind[\s\S]*balance_delta>=0[\s\S]*debt_delta<=0/i);
  assert.match(migration, /signal_reward_fulfillments_immutable_snapshot/);

  const backup = read("scripts/backup-neon-local.mjs");
  assert.match(backup, /SIGNAL_POINT_TABLES/);
  assert.match(backup, /pre-migration/i);
  assert.match(backup, /post-migration/i);
  for (const table of ["signal_point_accounts", "signal_point_reward_generations", "signal_point_ledger", "signal_reward_catalog", "signal_reward_redemptions", "signal_reward_redemption_events", "signal_reward_fulfillments"]) assert.match(backup, new RegExp(`'${table}'`));
  assert.match(backup, /SIGNAL_POINT_REQUIRED_COLUMNS/);
  assert.match(backup, /SIGNAL_POINT_REQUIRED_CONSTRAINTS/);
  assert.match(backup, /pg_get_constraintdef/i);
  assert.match(backup, /SIGNAL_POINT_REQUIRED_CONSTRAINT_SHAPES/);
  assert.match(backup, /signal_reward_fulfillments_immutable_snapshot/);

  const backfill = read("scripts/backfill-signal-points.mts");
  assert.match(backfill, /getUserList/);
  assert.match(backfill, /orderBy:\s*["']\+created_at["']/);
  assert.match(backfill, /page\.totalCount/);
  assert.match(backfill, /--apply/);
  assert.match(backfill, /dryRun/);
  for (const count of ["scanned", "reconciled", "verified", "mismatched"]) assert.match(backfill, new RegExp(count));
  assert.match(backfill, /firstPass/i);
  assert.match(backfill, /secondPass/i);
  assert.match(backfill, /snapshotHash/i);
  assert.match(backfill, /signal_points_clerk_metadata_v1_verified_complete/i);
  assert.match(read("package.json"), /backfill:signal-points/);
  assert.match(read("package.json"), /verify:ci[\s\S]*test:signal-points/);

  const memberRoute = read("src/app/api/signal-points/route.ts");
  const redemptionRoute = read("src/app/api/signal-points/redemptions/route.ts");
  const adminRoute = read("src/app/api/admin/signal-points/route.ts");
  assert.match(memberRoute, /requireSignalPointsApiAccess/); assert.match(memberRoute, /503/); assert.match(memberRoute, /assertCutoverVerified/);
  assert.doesNotMatch(memberRoute, /privateMetadata|reconcileClerkRewards/);
  assert.doesNotMatch(redemptionRoute, /privateMetadata|reconcileClerkRewards/);
  assert.match(redemptionRoute, /requireSignalPointsApiAccess/); assert.match(redemptionRoute, /verified/i); assert.match(redemptionRoute, /shipping/i); assert.match(redemptionRoute, /503/); assert.match(redemptionRoute, /assertCutoverVerified/);
  assert.match(adminRoute, /requireOwnerApiAccess/);
  const operationsPage = read("src/app/admin/operations/page.tsx");
  assert.match(operationsPage, /requireOwnerPageAccess/);
  const ownerAuth = read("src/lib/owner-auth.ts");
  assert.match(ownerAuth, /status:\s*401/); assert.match(ownerAuth, /status:\s*403/);
  assert.match(ownerAuth, /primaryEmailAddressId/);
  assert.match(ownerAuth, /verification[^\n]*status[^\n]*verified/i);
  assert.doesNotMatch(ownerAuth, /emailAddresses\?\.\[0\]|emails\[0\]/);
  for (const path of ["src/app/api/admin/sightings/route.ts", "src/app/api/admin/bottle-contributions/route.ts"]) {
    const source = read(path);
    assert.match(source, /requireOwnerApiAccess/);
    assert.doesNotMatch(source, /function primaryEmail|function requireAdmin/);
  }
  for (const path of ["src/app/admin/sightings/page.tsx", "src/app/admin/bottle-queue/page.tsx"]) assert.match(read(path), /requireOwnerPageAccess/);
  const panel = read("src/components/SignalPointsPanel.tsx");
  assert.match(panel, /Paid membership required/);
  assert.match(panel, /useRef/);
  assert.match(panel, /redemptionIntent/i);
  assert.match(panel, /body:\s*JSON\.stringify\([^\n]*idempotencyKey:\s*redemptionIntentKey\(\)/);
  assert.match(panel, /PreviewTab/);
  assert.match(panel, /overview[\s\S]*rewards[\s\S]*badges[\s\S]*history/);
  assert.match(panel, /prefers-reduced-motion/);
  assert.match(panel, /showAllRewards/);
  assert.match(panel, /slice\(0, 4\)/);
  assert.match(panel, /Show all \$\{data\.catalog\.length\} rewards/);
  assert.match(panel, /Next unlock/);
  assert.match(panel, /data-distance/);
  assert.match(panel, /points-shimmer/);
  assert.match(panel, /REWARD_MARKS/);
  assert.match(panel, /How to earn points/);
  assert.match(panel, /Every way to earn Signal Points/);
  assert.match(panel, /SIGHTING_POINTS_BY_RARITY/);
  assert.match(panel, /BADGE_POINTS_AWARD/);
  assert.match(panel, /WEEKLY_STREAK_POINTS_AWARD/);
  assert.match(panel, /REFERRAL_POINTS_BY_TIER/);
  assert.match(panel, /EARNING_GROUPS/);
  assert.match(panel, /Post an eligible bottle sighting/);
  assert.match(panel, /Post an allocated-bottle sighting/);
  assert.doesNotMatch(panel, /Post an unclassified sighting/i);
  assert.match(panel, /If a bottle’s classification changes, the award adjusts automatically/);
  assert.match(panel, /bonuses are added to points earned from qualifying sightings/i);
  assert.match(panel, /One eligible sighting in each consecutive week maintains a streak/i);
  assert.match(panel, /Total points earned from one referral as their membership changes/i);
  assert.match(panel, /Free referral awards are limited to the first five/i);
  assert.match(panel, /only the difference between tiers/i);
  assert.match(panel, /role="dialog"[\s\S]*points-guide-title/);
  assert.match(panel, /points-compact-head/);
  assert.match(panel, /position:sticky/);
  assert.match(panel, /badgeCards[\s\S]*sort/);
  assert.match(panel, /data-progress/);
  assert.doesNotMatch(panel, /<section className="points-earn-strip"/);
  const dashboard = read("src/app/dashboard/page.tsx");
  assert.doesNotMatch(dashboard, /SignalPointsPanel|Member Points|Signal Points|memberPoints|rewards|redemption/i);
  const controlRoom = read("src/app/admin/control-room/page.tsx");
  assert.match(controlRoom, /isCompanyControlRoomOwnerEmail/);
  assert.match(controlRoom, /notFound\(\)/);
  assert.match(controlRoom, /<SignalPointsPanel preview/);
  assert.match(controlRoom, /Private product preview/);
  assert.doesNotMatch(read("src/components/Navigation.tsx"), /label:\s*["']Rewards["']/);

  const referrals = read("src/app/api/referrals/me/route.ts");
  for (const field of ["referralPoints", "communityPoints", "totalPoints", "freePointsAwarded", "redemptionEligible"]) assert.doesNotMatch(referrals, new RegExp(field));
  assert.doesNotMatch(referrals, /signal-points-repository/);
  assert.doesNotMatch(read("src/components/MemberReferralLink.tsx"), /Signal Points|points?\b|rewards?|redeem|redemption/i);
  assert.doesNotMatch(read("src/components/emails/FreeMemberDayTwoEmail.tsx"), /Points and badges|Point redemption/i);
  assert.doesNotMatch(read("src/lib/faq-content.ts"), /Member Points|earn Member Points|Point redemption|reward catalog/i);

  const sightingsRoute = read("src/app/api/sightings/route.ts");
  assert.match(sightingsRoute, /isRewardsAdminEmail\(verifiedPrimaryClerkEmail\(user\)\)/);
  assert.match(sightingsRoute, /ownerPointsPreview\s*&&\s*url\.searchParams\.get\(["']rewards["']\)\s*!==\s*["']0["']/);
  assert.match(sightingsRoute, /visibleSightingForRequester/);
  assert.match(sightingsRoute, /ownerPointsPreview\s*\?\s*\{ rewards \}\s*:\s*\{\}/);
  assert.doesNotMatch(sightingsRoute, /Signal Points reconciliation is temporarily unavailable/);

  assert.match(read("src/app/admin/operations/page.tsx"), /SignalPointRewardQueue/);
  const ownerQueue = read("src/components/admin/SignalPointRewardQueue.tsx");
  assert.match(ownerQueue, /carrier/i);
  assert.match(ownerQueue, /trackingNumber/);
});

test("sighting reward projections write PostgreSQL before Clerk", () => {
  for (const path of [
    "src/app/api/sightings/route.ts",
    "src/app/api/sightings/photo/route.ts",
    "src/app/api/admin/sightings/route.ts",
  ]) {
    const source = read(path);
    assert.match(source, /await (?:createSignalPointsRepository\(\)|signalPoints)\.reconcileClerkRewards\([^;]+;[\s\S]{0,220}await [^;]*users\.updateUserMetadata/, `${path} writes PostgreSQL before its Clerk projection`);
    assert.doesNotMatch(source, /await [^;]*users\.updateUserMetadata[\s\S]{0,220}await createSignalPointsRepository\(\)\.reconcileClerkRewards/, `${path} has no Clerk-first reward projection`);
  }
  const memberSightings = read("src/app/api/sightings/route.ts");
  assert.doesNotMatch(memberSightings, /after\(async \(\) => \{[\s\S]{0,300}persistMemberRewardsBestEffort/, "new sightings commit PostgreSQL points before returning success");
});
