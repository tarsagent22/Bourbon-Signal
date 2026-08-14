import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  calculateReferralAward,
  normalizeReferralCode,
  referralPointsForTier,
} from "../src/lib/referrals.ts";
import {
  ReferralRepository,
  generateReferralCode,
  hashReferralEmail,
  referralHashSecret,
} from "../src/lib/referral-repository.ts";
import {
  claimReferralAtSignup,
  ensureMemberReferralCode,
  reconcileReferredMembership,
} from "../src/lib/referral-service.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("normalizes valid referral codes and rejects malformed input", () => {
  assert.equal(normalizeReferralCode(" abcd-2345 "), "ABCD2345");
  assert.equal(normalizeReferralCode("ABCD2345"), "ABCD2345");
  assert.equal(normalizeReferralCode("short"), null);
  assert.equal(normalizeReferralCode("contains!bad"), null);
  assert.equal(normalizeReferralCode("IIIIIIII"), null);
});

test("maps the highest referred membership tier to its total point value", () => {
  assert.equal(referralPointsForTier("free"), 10);
  assert.equal(referralPointsForTier("standard"), 50);
  assert.equal(referralPointsForTier("barrel"), 100);
  assert.equal(referralPointsForTier("bottled-in-bond"), 150);
});

test("awards only the difference as a referral upgrades", () => {
  assert.deepEqual(calculateReferralAward({ previousAwardedPoints: 0, nextTier: "free", freePointsAlreadyAwarded: 0 }), {
    points: 10,
    targetPoints: 10,
    earnsFounderGlass: false,
  });
  assert.deepEqual(calculateReferralAward({ previousAwardedPoints: 10, nextTier: "standard", freePointsAlreadyAwarded: 10 }), {
    points: 40,
    targetPoints: 50,
    earnsFounderGlass: false,
  });
  assert.deepEqual(calculateReferralAward({ previousAwardedPoints: 50, nextTier: "barrel", freePointsAlreadyAwarded: 10 }), {
    points: 50,
    targetPoints: 100,
    earnsFounderGlass: false,
  });
  assert.deepEqual(calculateReferralAward({ previousAwardedPoints: 100, nextTier: "bottled-in-bond", freePointsAlreadyAwarded: 10 }), {
    points: 50,
    targetPoints: 150,
    earnsFounderGlass: false,
  });
});

test("caps Free-only points without reducing a later paid conversion", () => {
  assert.deepEqual(calculateReferralAward({ previousAwardedPoints: 0, nextTier: "free", freePointsAlreadyAwarded: 50 }), {
    points: 0,
    targetPoints: 0,
    earnsFounderGlass: false,
  });
  assert.deepEqual(calculateReferralAward({ previousAwardedPoints: 0, nextTier: "standard", freePointsAlreadyAwarded: 50 }), {
    points: 50,
    targetPoints: 50,
    earnsFounderGlass: false,
  });
});

test("never issues duplicate points or new referral glasses at the same tier", () => {
  assert.deepEqual(calculateReferralAward({ previousAwardedPoints: 150, nextTier: "bottled-in-bond", freePointsAlreadyAwarded: 50 }), {
    points: 0,
    targetPoints: 150,
    earnsFounderGlass: false,
  });
});

test("durable referral schema enforces attribution, event, cap, and glass invariants", () => {
  const schema = read("src/lib/referral-schema.sql");
  assert.match(schema, /CREATE TABLE IF NOT EXISTS member_referral_codes/i);
  assert.match(schema, /code\s+TEXT\s+NOT NULL\s+UNIQUE/i);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS member_referrals/i);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS member_referral_eligibility_events/i);
  assert.match(schema, /referred_user_id\s+TEXT\s+PRIMARY KEY/i);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS member_referral_point_ledger/i);
  assert.match(schema, /event_key\s+TEXT\s+NOT NULL\s+UNIQUE/i);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS member_referral_glass_rewards/i);
  assert.match(schema, /referred_user_id\s+TEXT\s+PRIMARY KEY/i);
  assert.match(schema, /CREATE OR REPLACE FUNCTION claim_member_referral/i);
  assert.match(schema, /INSERT INTO member_referral_eligibility_events/i);
  assert.match(schema, /ORDER BY referral_tier_rank\(tier\) DESC/i);
  assert.match(schema, /FOR UPDATE/i);
  assert.match(schema, /free_points_awarded\s*>=\s*50/i);
  assert.match(schema, /ON CONFLICT \(referred_user_id\) DO NOTHING/i);
  assert.doesNotMatch(schema, /INSERT INTO member_referral_glass_rewards[\s\S]*effective_tier/i);
});

test("app storage migration and encrypted backup enforce referral durability", () => {
  const migration = read("scripts/migrate-app-storage.mjs");
  const backup = read("scripts/backup-neon-local.mjs");
  assert.match(migration, /referral-schema\.sql/);
  assert.match(migration, /member_referral_eligibility_events/);
  assert.match(migration, /member_referral_point_ledger_event_key_key/);
  assert.match(migration, /reconcile_member_referral_reward/);
  assert.match(migration, /pg_get_function_identity_arguments/);
  assert.match(migration, /pg_get_functiondef/);
  assert.match(migration, /expectedReferralConstraintShapes/);
  for (const table of ["member_referral_codes", "member_referral_eligibility_events", "member_referrals", "member_referral_point_ledger", "member_referral_glass_rewards"]) {
    assert.match(backup, new RegExp(`'${table}'`));
  }
});

test("generates non-ambiguous referral codes and hashes normalized emails", () => {
  for (let index = 0; index < 25; index += 1) {
    assert.match(generateReferralCode(), /^[A-HJ-NP-Z2-9]{10}$/u);
  }
  assert.equal(
    hashReferralEmail(" Member@Example.com ", "secret-value"),
    hashReferralEmail("member@example.com", "secret-value"),
  );
  assert.notEqual(
    hashReferralEmail("member@example.com", "secret-value"),
    hashReferralEmail("member@example.com", "different-secret"),
  );
});

test("derives a domain-separated referral hash key from the existing Clerk webhook secret", () => {
  assert.equal(referralHashSecret({ REFERRAL_HASH_SECRET: "dedicated" }), "dedicated");
  const derived = referralHashSecret({ CLERK_WEBHOOK_SECRET: "clerk-secret" });
  assert.match(derived, /^[a-f0-9]{64}$/);
  assert.notEqual(derived, "clerk-secret");
  assert.throws(() => referralHashSecret({}), /required/);
});

test("repository calls atomic claim and tier reconciliation functions", async () => {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const query = {
    async query(text: string, params: unknown[] = []) {
      calls.push({ text, params });
      if (/claim_member_referral/i.test(text)) return [{ claim_status: "claimed", points_awarded: 1 }];
      if (/reconcile_member_referral_reward/i.test(text)) return [{ points_awarded: 4, target_points: 5, founder_glass_earned: false }];
      return [];
    },
  };
  const repository = new ReferralRepository(query);
  assert.deepEqual(await repository.claimReferral({ referredUserId: "new-user", code: "ABCD2345", referredEmailHash: "hash" }), {
    status: "claimed",
    pointsAwarded: 1,
  });
  assert.deepEqual(await repository.reconcileTier({ referredUserId: "new-user", tier: "standard", sourceEventId: "evt_1" }), {
    pointsAwarded: 4,
    targetPoints: 5,
    founderGlassEarned: false,
  });
  assert.match(calls[0].text, /claim_member_referral/i);
  assert.deepEqual(calls[0].params, ["new-user", "ABCD2345", "hash"]);
  assert.match(calls[1].text, /reconcile_member_referral_reward/i);
  assert.deepEqual(calls[1].params, ["new-user", "standard", "evt_1"]);
});

test("signup service claims valid codes with an email HMAC and ignores malformed codes", async () => {
  const claims: unknown[] = [];
  const repository = {
    async claimReferral(input: unknown) { claims.push(input); return { status: "claimed", pointsAwarded: 1 }; },
  };
  assert.deepEqual(await claimReferralAtSignup({
    userId: "new-user",
    email: "New@Example.com",
    referralCode: "abcd-2345",
    hashSecret: "secret-value",
    repository,
  }), { status: "claimed", pointsAwarded: 1 });
  assert.equal(claims.length, 1);
  assert.deepEqual(claims[0], {
    referredUserId: "new-user",
    code: "ABCD2345",
    referredEmailHash: hashReferralEmail("new@example.com", "secret-value"),
  });
  assert.deepEqual(await claimReferralAtSignup({
    userId: "other-user",
    email: "other@example.com",
    referralCode: "bad",
    hashSecret: "secret-value",
    repository,
  }), { status: "no_referral", pointsAwarded: 0 });
  assert.equal(claims.length, 1);
});

test("member referral service ensures a code and reconciles membership tiers", async () => {
  const calls: unknown[] = [];
  const repository = {
    async ensureCode(input: unknown) { calls.push(["ensure", input]); return "ABCD2345"; },
    async reconcileTier(input: unknown) { calls.push(["tier", input]); return { pointsAwarded: 15, targetPoints: 15, founderGlassEarned: true }; },
  };
  assert.equal(await ensureMemberReferralCode({
    userId: "member-1",
    email: "member@example.com",
    hashSecret: "secret-value",
    repository,
  }), "ABCD2345");
  assert.deepEqual(await reconcileReferredMembership({
    userId: "new-user",
    tier: "bottled-in-bond",
    sourceEventId: "evt_founder",
    repository,
  }), { pointsAwarded: 15, targetPoints: 15, founderGlassEarned: true });
  assert.deepEqual(calls[1], ["tier", { referredUserId: "new-user", tier: "bottled-in-bond", sourceEventId: "evt_founder" }]);
});

test("signup, Clerk, Stripe, and member API are wired to the referral service", () => {
  const signup = read("src/app/sign-up/[[...sign-up]]/page.tsx");
  const clerkWebhook = read("src/app/api/webhooks/clerk/route.ts");
  const stripeWebhook = read("src/app/api/webhooks/stripe/route.ts");
  const memberApi = read("src/app/api/referrals/me/route.ts");
  const referralRedirect = read("src/app/r/[code]/route.ts");

  assert.match(signup, /normalizeReferralCode\(searchParams\.get\("ref"\)\)/);
  assert.match(signup, /unsafeMetadata=\{referralCode \? \{ referralCode \} : undefined\}/);
  assert.match(clerkWebhook, /claimReferralAtSignup/);
  assert.match(clerkWebhook, /unsafeMetadata\.referralCode/);
  assert.doesNotMatch(clerkWebhook, /reconcileReferredMembership/);
  assert.match(stripeWebhook, /reconcileReferredMembership/);
  assert.match(stripeWebhook, /purchase_type/);
  assert.match(stripeWebhook, /gift/);
  for (const route of [
    "src/app/api/checkout/route.ts",
    "src/app/api/checkout/sync/route.ts",
    "src/app/api/checkout/recover/route.ts",
  ]) {
    const source = read(route);
    assert.match(source, /reconcileReferredMembership/);
    assert.match(source, /purchase_type/);
    assert.match(source, /gift/);
  }
  assert.match(memberApi, /ensureMemberReferralCode/);
  assert.match(memberApi, /readSummary/);
  assert.match(referralRedirect, /\/sign-up\?ref=/);
  assert.match(read("src/app/api/referrals/glasses/confirm/route.ts"), /confirmGlassAddress/);
  assert.match(read("src/app/api/member/shipping/route.ts"), /hasGlassRewards/);
  const shippingRepository = read("src/lib/founder-shipping-repository.ts");
  assert.match(shippingRepository, /referral_glass_quantity|member_referral_glass_rewards/);
  assert.match(shippingRepository, /rewards\.status = 'address_required'/);
  assert.match(shippingRepository, /status IN \('address_confirmed', 'packed'\)/);
  assert.match(read("src/app/admin/control-room/page.tsx"), /Referral glasses/);
});

test("member referral link stays useful without exposing the private points program", () => {
  const component = read("src/components/MemberReferralLink.tsx");
  const settings = read("src/app/settings/page.tsx");
  const dashboard = read("src/app/dashboard/page.tsx");
  const referralsPage = read("src/app/referrals/page.tsx");
  const navigation = read("src/components/Navigation.tsx");
  assert.match(component, /\/api\/referrals\/me/);
  assert.match(component, /navigator\.clipboard\.writeText/);
  assert.match(component, /Share Bourbon Signal with friends using your personal link/);
  assert.doesNotMatch(component, /Signal Points|rewards|redeem/i);
  assert.match(settings, /<MemberReferralLink/);
  assert.match(settings, /id="referrals"/);
  assert.doesNotMatch(dashboard, /SignalPointsPanel|Signal Points|memberPoints/);
  assert.match(read("src/app/admin/control-room/page.tsx"), /<SignalPointsPanel preview/);
  assert.match(read("src/components/SignalPointsPanel.tsx"), /<MemberReferralLink compact/);
  assert.match(referralsPage, /redirect\("\/settings#referrals"\)/);
  assert.doesNotMatch(navigation, /label: "Referrals"/);
  assert.doesNotMatch(component, /totalPoints|founderGlassesEarned|freePointsAwarded/);
  assert.doesNotMatch(read("src/app/api/referrals/me/route.ts"), /referralPoints|communityPoints|totalPoints|freePointsAwarded|redemptionEligible/);
});
