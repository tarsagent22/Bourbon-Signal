import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  hasActiveGiftMembership,
  hasMembershipPurchaseHistory,
  membershipTrialConversionMetadata,
  membershipTrialEligibility,
  membershipTrialMetadata,
  paidPostTrialInvoiceConvertsMembership,
  MONTHLY_MEMBERSHIP_TRIAL_DAYS,
} from "../src/lib/membership-trial.ts";

assert.equal(MONTHLY_MEMBERSHIP_TRIAL_DAYS, 7);
assert.equal(hasMembershipPurchaseHistory({ tier: "free" }, {}), false);
for (const privateMetadata of [{ membershipTrialStartedAt: "2026-08-16" }, { membershipTrialSubscriptionId: "sub_trial" }, { stripeSubscriptionId: "sub_paid" }]) {
  assert.equal(hasMembershipPurchaseHistory({ tier: "free" }, privateMetadata), true);
}
for (const status of ["active", "trialing", "past_due", "unpaid", "canceled", "incomplete", "incomplete_expired"]) {
  assert.equal(hasMembershipPurchaseHistory({ billingPlan: "barrel_monthly", membershipStatus: status }, {}), true);
}
assert.equal(hasMembershipPurchaseHistory({ plan: "bib_lifetime" }, {}), true);
assert.equal(hasActiveGiftMembership({ plan: "gift_standard_annual", membershipStatus: "active", giftAccessExpiresAt: "2026-08-20T00:00:00.000Z" }, new Date("2026-08-19T00:00:00.000Z")), true);
assert.equal(hasActiveGiftMembership({ plan: "gift_standard_annual", membershipStatus: "active", giftAccessExpiresAt: "2026-08-18T00:00:00.000Z" }, new Date("2026-08-19T00:00:00.000Z")), false);
assert.equal(hasActiveGiftMembership({ plan: "bib_lifetime", membershipStatus: "active", giftOrderId: "gift_123" }), true);
for (const plan of ["standard_monthly", "barrel_monthly", "standard_annual", "barrel_annual", "bib_lifetime"] as const) {
  for (const [publicMetadata, privateMetadata] of [[{}, {}], [{ plan: "free" }, {}], [{ plan: "barrel_monthly", membershipStatus: "trialing" }, { membershipTrialStartedAt: "2026-08-16" }]]) {
    assert.deepEqual(membershipTrialEligibility(plan, publicMetadata, privateMetadata), { eligible: false, reason: "trials_ended" });
  }
}
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
}), {}, "subscription active alone is not proof that the first paid invoice succeeded");
assert.deepEqual(membershipTrialConversionMetadata({
  subscriptionId: "sub_trial",
  existingPrivateMetadata: { membershipTrialStartedAt: "2026-08-16T12:00:00.000Z", membershipTrialSubscriptionId: "sub_trial" },
  convertedAt: "2026-08-23T12:00:00.000Z",
}), { membershipTrialConvertedAt: "2026-08-23T12:00:00.000Z" });
assert.deepEqual(membershipTrialConversionMetadata({
  subscriptionId: "sub_trial",
  existingPrivateMetadata: { membershipTrialStartedAt: "2026-08-16T12:00:00.000Z", membershipTrialSubscriptionId: "sub_trial", membershipTrialConvertedAt: "2026-08-25T12:00:00.000Z" },
  convertedAt: "2026-08-23T12:00:00.000Z",
}), { membershipTrialConvertedAt: "2026-08-23T12:00:00.000Z" }, "an earlier delayed paid invoice repairs the conversion timestamp");
assert.deepEqual(membershipTrialConversionMetadata({
  subscriptionId: "sub_other",
  existingPrivateMetadata: { membershipTrialStartedAt: "2026-08-16T12:00:00.000Z", membershipTrialSubscriptionId: "sub_trial" },
  convertedAt: "2026-08-23T12:00:00.000Z",
}), {});
assert.equal(paidPostTrialInvoiceConvertsMembership({ status: "paid", billingReason: "subscription_cycle" }), true);
assert.equal(paidPostTrialInvoiceConvertsMembership({ status: "open", billingReason: "subscription_cycle" }), false);
assert.equal(paidPostTrialInvoiceConvertsMembership({ status: "paid", billingReason: "subscription_create" }), false);
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
assert.doesNotMatch(checkout, /membershipTrialEligibility/);
assert.doesNotMatch(checkout, /trial_period_days|trial_settings/);
assert.doesNotMatch(checkout, /payment_method_collection/, "Stripe Checkout should present payment collection without site-level card-required messaging");
assert.match(membershipServer, /membershipTrialMetadata/);
assert.match(membershipServer, /\.\.\.user\.privateMetadata,[\s\S]*stripeMembershipStatus: "canceled"/, "cancellation must preserve durable trial history");
assert.match(trialSchema, /user_id TEXT PRIMARY KEY/);
assert.match(trialSchema, /subscription_id TEXT NOT NULL UNIQUE/);
assert.match(trialRepository, /CREATE TABLE IF NOT EXISTS membership_trial_claims/);
assert.match(trialRepository, /ON CONFLICT \(user_id\) DO NOTHING/);
assert.match(trialRepository, /converted_at = LEAST\(COALESCE\(converted_at, \$2::timestamptz\), \$2::timestamptz\)/);
assert.match(trialRepository, /canceled_at IS NULL OR canceled_at > \$2::timestamptz/, "equal timestamps deterministically prefer cancellation");
assert.match(trialRepository, /\$2::timestamptz <= converted_at/);
assert.match(webhook, /enforceMembershipSubscriptionActivation/);
assert.match(webhook, /markMembershipTrialConvertedFromInvoice/);
assert.equal((webhook.match(/const cancellationAt = new Date\(\(subscription\.canceled_at \|\| event\.created\) \* 1000\)\.toISOString\(\)/g) || []).length, 2);
assert.equal((webhook.match(/markCanceled\(subscription\.id, cancellationAt\)/g) || []).length, 2);
assert.match(trialStripe, /const convertedClaim = await repository\.markConverted[\s\S]*if \(!convertedClaim\) return false[\s\S]*membershipTrialConversionMetadata/);
assert.doesNotMatch(trialStripe, /input\.subscription\.status === "active"[\s\S]*markConverted/);
assert.match(webhook, /retrieveCurrentSubscription\(stripe, eventSubscription\.id\)/, "subscription transitions must use current Stripe state");
assert.match(checkout, /trialOfferExpected/);
assert.match(checkout, /hasActiveGiftMembership/, "active, unexpired gift memberships cannot create overlapping direct subscriptions");
assert.match(checkout, /completedPaidSession[\s\S]*enforceMembershipSubscriptionActivation/);
assert.match(sync, /enforceMembershipSubscriptionActivation/);
assert.match(recover, /enforceMembershipSubscriptionActivation/);
assert.match(trialStripe, /hasActiveGiftMembership/);
assert.match(trialStripe, /stripe\.subscriptions\.cancel/);
assert.doesNotMatch(trialStripe, /hasActiveGiftMembership\([^)]*observedAt/);
assert.match(webhook, /durableClaim\.subscriptionId !== subscription\.id/);
assert.doesNotMatch(pricing, /7 days free, then \$3\/month/);
assert.doesNotMatch(pricing, /Annual|annual|2 months free/);
assert.doesNotMatch(pricing, /card required/i);
assert.doesNotMatch(welcome, /card required/i);
assert.match(catalog, /tier:\s*"barrel"[\s\S]*featured:\s*true/);
assert.doesNotMatch(catalog.slice(catalog.indexOf('tier: "standard"'), catalog.indexOf('tier: "barrel"')), /featured:\s*true/);
console.log("Membership trial and conversion-copy contracts passed.");
assert.match(checkout, /Free trials have ended/);
assert.match(continueCheckout, /Free trials have ended/);
assert.doesNotMatch(pricing + welcome, /7 days free|Start 7-day free trial|trialOffer=1/);
