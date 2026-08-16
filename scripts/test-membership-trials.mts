import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  hasActiveGiftMembership,
  membershipTrialEligibility,
  membershipTrialMetadata,
  MONTHLY_MEMBERSHIP_TRIAL_DAYS,
} from "../src/lib/membership-trial.ts";

assert.equal(MONTHLY_MEMBERSHIP_TRIAL_DAYS, 7);
assert.equal(hasActiveGiftMembership({ plan: "gift_standard_annual", membershipStatus: "active", giftAccessExpiresAt: "2026-08-20T00:00:00.000Z" }, new Date("2026-08-19T00:00:00.000Z")), true);
assert.equal(hasActiveGiftMembership({ plan: "gift_standard_annual", membershipStatus: "active", giftAccessExpiresAt: "2026-08-18T00:00:00.000Z" }, new Date("2026-08-19T00:00:00.000Z")), false);
assert.equal(hasActiveGiftMembership({ plan: "bib_lifetime", membershipStatus: "active", giftOrderId: "gift_123" }), true);
assert.deepEqual(membershipTrialEligibility("standard_monthly", {}, {}), { eligible: true, reason: "eligible" });
assert.deepEqual(membershipTrialEligibility("barrel_monthly", {}, {}), { eligible: true, reason: "eligible" });
assert.deepEqual(membershipTrialEligibility("standard_annual", {}, {}), { eligible: false, reason: "plan_ineligible" });
assert.deepEqual(membershipTrialEligibility("barrel_monthly", { plan: "bib_lifetime", membershipStatus: "active" }, {}), { eligible: false, reason: "prior_subscription" });
assert.deepEqual(membershipTrialEligibility("barrel_annual", {}, {}), { eligible: false, reason: "plan_ineligible" });
assert.deepEqual(membershipTrialEligibility("bib_lifetime", {}, {}), { eligible: false, reason: "plan_ineligible" });
assert.equal(membershipTrialEligibility("barrel_monthly", {}, { membershipTrialStartedAt: "2026-08-16T12:00:00.000Z" }).eligible, false);
assert.equal(membershipTrialEligibility("standard_monthly", {}, { membershipTrialSubscriptionId: "sub_trial" }).reason, "trial_used");
assert.equal(membershipTrialEligibility("barrel_monthly", {}, { stripeSubscriptionId: "sub_prior" }).reason, "prior_subscription");
assert.equal(membershipTrialEligibility("barrel_monthly", { membershipStatus: "active", plan: "barrel_annual" }, {}).reason, "prior_subscription");
assert.equal(membershipTrialEligibility("standard_monthly", { membershipStatus: "free", plan: "free", subscribedAt: "2026-01-01" }, {}).eligible, true, "gift/free history alone must not be treated as a direct subscription");
assert.deepEqual(membershipTrialMetadata({
  status: "trialing",
  plan: "barrel_monthly",
  subscriptionId: "sub_trial",
  existingPrivateMetadata: {},
  now: "2026-08-16T12:00:00.000Z",
}), {
  membershipTrialStartedAt: "2026-08-16T12:00:00.000Z",
  membershipTrialPlan: "barrel_monthly",
  membershipTrialSubscriptionId: "sub_trial",
});
assert.deepEqual(membershipTrialMetadata({
  status: "active",
  plan: "barrel_monthly",
  subscriptionId: "sub_paid",
  existingPrivateMetadata: {},
  now: "2026-08-16T12:00:00.000Z",
}), {});
assert.equal(membershipTrialMetadata({
  status: "trialing",
  plan: "standard_monthly",
  subscriptionId: "sub_new",
  existingPrivateMetadata: { membershipTrialStartedAt: "2026-01-01T00:00:00.000Z" },
  now: "2026-08-16T12:00:00.000Z",
}).membershipTrialStartedAt, "2026-01-01T00:00:00.000Z", "the first trial date is durable");
assert.deepEqual(membershipTrialMetadata({
  status: "active",
  plan: "barrel_monthly",
  subscriptionId: "sub_trial",
  existingPrivateMetadata: { membershipTrialStartedAt: "2026-08-16T12:00:00.000Z", membershipTrialSubscriptionId: "sub_trial" },
  now: "2026-08-23T12:00:00.000Z",
}), { membershipTrialConvertedAt: "2026-08-23T12:00:00.000Z" });
assert.deepEqual(membershipTrialMetadata({
  status: "canceled",
  plan: "barrel_monthly",
  subscriptionId: "sub_trial",
  existingPrivateMetadata: { membershipTrialStartedAt: "2026-08-16T12:00:00.000Z", membershipTrialSubscriptionId: "sub_trial" },
  now: "2026-08-18T12:00:00.000Z",
}), { membershipTrialCanceledAt: "2026-08-18T12:00:00.000Z" });

const [checkout, membershipServer, pricing, welcome, catalog, trialSchema, trialRepository, webhook, continueCheckout, sync, recover, trialStripe] = await Promise.all([
  readFile(new URL("../src/app/api/checkout/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/membership-server.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/pricing/PricingPageClient.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/welcome/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/membership-plan-catalog.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/membership-trial-schema.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/membership-trial-repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/webhooks/stripe/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/checkout/continue/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/checkout/sync/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/checkout/recover/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/membership-trial-stripe.ts", import.meta.url), "utf8"),
]);
assert.match(checkout, /membershipTrialEligibility/);
assert.match(checkout, /trial_period_days:\s*MONTHLY_MEMBERSHIP_TRIAL_DAYS/);
assert.match(checkout, /trial_settings:[\s\S]*missing_payment_method:[\s\S]*"cancel"/);
assert.doesNotMatch(checkout, /payment_method_collection/, "Stripe Checkout should present payment collection without site-level card-required messaging");
assert.match(membershipServer, /membershipTrialMetadata/);
assert.match(membershipServer, /\.\.\.user\.privateMetadata,[\s\S]*stripeMembershipStatus: "canceled"/, "cancellation must preserve durable trial history");
assert.match(trialSchema, /user_id TEXT PRIMARY KEY/);
assert.match(trialSchema, /subscription_id TEXT NOT NULL UNIQUE/);
assert.match(trialRepository, /CREATE TABLE IF NOT EXISTS membership_trial_claims/);
assert.match(trialRepository, /ON CONFLICT \(user_id\) DO NOTHING/);
assert.match(webhook, /enforceMembershipSubscriptionActivation/);
assert.match(webhook, /retrieveCurrentSubscription\(stripe, eventSubscription\.id\)/, "subscription transitions must use current Stripe state");
assert.match(continueCheckout, /trialOfferExpected[\s\S]*\/api\/membership-trial/, "post-sign-in checkout must recheck the advertised trial");
assert.match(checkout, /trialOfferExpected/);
assert.match(checkout, /hasActiveGiftMembership/, "active, unexpired gift memberships cannot create overlapping direct subscriptions");
assert.match(checkout, /completedPaidSession[\s\S]*enforceMembershipSubscriptionActivation/);
assert.match(sync, /enforceMembershipSubscriptionActivation/);
assert.match(recover, /enforceMembershipSubscriptionActivation/);
assert.match(trialStripe, /hasActiveGiftMembership/);
assert.match(trialStripe, /stripe\.subscriptions\.cancel/);
assert.doesNotMatch(trialStripe, /hasActiveGiftMembership\([^)]*observedAt/);
assert.match(webhook, /durableClaim\.subscriptionId !== subscription\.id/);
assert.match(pricing, /7 days free, then \$3\/month/);
assert.match(pricing, /7 days free, then \$6\/month/);
assert.match(pricing, /Start 7-day free trial/);
assert.match(pricing, /Annual <span>2 months free<\/span>/);
assert.doesNotMatch(pricing, /card required/i);
assert.match(welcome, /Try Barrel Proof free for 7 days/);
assert.match(welcome, /\$6\/month after 7 days/);
assert.match(welcome, /Start 7-day free trial/);
assert.doesNotMatch(welcome, /card required/i);
assert.match(catalog, /tier:\s*"barrel"[\s\S]*featured:\s*true/);
assert.doesNotMatch(catalog.slice(catalog.indexOf('tier: "standard"'), catalog.indexOf('tier: "barrel"')), /featured:\s*true/);
console.log("Membership trial and conversion-copy contracts passed.");
