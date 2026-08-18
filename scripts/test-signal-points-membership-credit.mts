import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SIGNAL_REWARD_CATALOG } from "../src/lib/signal-points.ts";
import {
  applyMembershipCredit,
  membershipCreditCatalogForTier,
  membershipCreditEligibility,
} from "../src/lib/signal-points-membership-credit.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const subscription = (priceId: string, overrides: Record<string, unknown> = {}) => ({
  id: "sub_active",
  status: "active",
  cancel_at_period_end: false,
  customer: "cus_member",
  items: { data: [{ price: { id: priceId } }] },
  ...overrides,
});
const standardPrivate = { stripeCustomerId: "cus_member", stripeSubscriptionId: "sub_active", stripePlan: "standard_monthly" };
const barrelPrivate = { stripeCustomerId: "cus_member", stripeSubscriptionId: "sub_active", stripePlan: "barrel_monthly" };

const standardKey = "standard_membership_credit_month";
const barrelKey = "barrel_membership_credit_month";
const standardMonthlyPrice = "price_1U3SkALQlLvo1rCDe3it7BpY";
const standardAnnualPrice = "price_1U3SivLQlLvo1rCDNWfku8up";
const barrelMonthlyPrice = "price_1U3ShaLQlLvo1rCDXYKq6mJn";
const barrelAnnualPrice = "price_1U3SfyLQlLvo1rCDYCcq0bs2";

test("membership credits use the approved tier-specific point costs and dollar values", () => {
  const standard = SIGNAL_REWARD_CATALOG.find((item) => item.key === standardKey);
  const barrel = SIGNAL_REWARD_CATALOG.find((item) => item.key === barrelKey);
  assert.deepEqual({ points: standard?.points, version: standard?.catalogVersion, type: standard?.fulfillmentType, credit: standard?.membershipCreditCents }, { points: 150, version: 3, type: "digital", credit: 300 });
  assert.deepEqual({ points: barrel?.points, version: barrel?.catalogVersion, type: barrel?.fulfillmentType, credit: barrel?.membershipCreditCents }, { points: 250, version: 3, type: "digital", credit: 600 });
  assert.equal(SIGNAL_REWARD_CATALOG.find((item) => item.key === "bourbon_shipping_gift_card_100")?.points, 2600);
});

test("members see only the membership credit matching their current tier", () => {
  const keys = (tier: "free" | "standard" | "barrel" | "bottled-in-bond") => membershipCreditCatalogForTier(SIGNAL_REWARD_CATALOG, tier).map((item) => item.key);
  assert.equal(keys("standard").includes(standardKey), true);
  assert.equal(keys("standard").includes(barrelKey), false);
  assert.equal(keys("barrel").includes(barrelKey), true);
  assert.equal(keys("barrel").includes(standardKey), false);
  assert.equal(keys("free").some((key) => key.includes("membership_credit")), false);
  assert.equal(keys("bottled-in-bond").some((key) => key.includes("membership_credit")), false);
});

test("active monthly and annual subscriptions qualify for their exact tier credit", () => {
  for (const [itemKey, tier, privateMetadata, priceId, plan, creditCents] of [
    [standardKey, "standard", standardPrivate, standardMonthlyPrice, "standard_monthly", 300],
    [standardKey, "standard", { ...standardPrivate, stripePlan: "standard_annual" }, standardAnnualPrice, "standard_annual", 300],
    [barrelKey, "barrel", barrelPrivate, barrelMonthlyPrice, "barrel_monthly", 600],
    [barrelKey, "barrel", { ...barrelPrivate, stripePlan: "barrel_annual" }, barrelAnnualPrice, "barrel_annual", 600],
  ] as const) {
    assert.deepEqual(membershipCreditEligibility({ itemKey, tier, privateMetadata, subscription: subscription(priceId) }), {
      ok: true, customerId: "cus_member", subscriptionId: "sub_active", plan, creditCents,
    });
  }
});

test("membership credit eligibility fails closed for wrong, risky, or unverifiable subscriptions", () => {
  const cases = [
    { itemKey: barrelKey, tier: "standard", privateMetadata: standardPrivate, subscription: subscription(standardMonthlyPrice) },
    { itemKey: standardKey, tier: "standard", privateMetadata: standardPrivate, subscription: subscription(standardMonthlyPrice, { status: "trialing" }) },
    { itemKey: standardKey, tier: "standard", privateMetadata: standardPrivate, subscription: subscription(standardMonthlyPrice, { status: "past_due" }) },
    { itemKey: standardKey, tier: "standard", privateMetadata: standardPrivate, subscription: subscription(standardMonthlyPrice, { cancel_at_period_end: true }) },
    { itemKey: standardKey, tier: "standard", privateMetadata: standardPrivate, subscription: subscription(standardMonthlyPrice, { cancel_at: 1_800_000_000 }) },
    { itemKey: standardKey, tier: "standard", privateMetadata: standardPrivate, subscription: subscription(standardMonthlyPrice, { pause_collection: { behavior: "void" } }) },
    { itemKey: standardKey, tier: "standard", privateMetadata: standardPrivate, subscription: subscription(standardMonthlyPrice, { customer: "cus_other" }) },
    { itemKey: standardKey, tier: "standard", privateMetadata: { ...standardPrivate, stripePlan: "gift_standard_annual" }, subscription: subscription(standardAnnualPrice) },
    { itemKey: standardKey, tier: "standard", privateMetadata: {}, subscription: subscription(standardMonthlyPrice) },
    { itemKey: standardKey, tier: "standard", privateMetadata: standardPrivate, subscription: subscription("price_unknown") },
    { itemKey: standardKey, tier: "standard", privateMetadata: standardPrivate, subscription: subscription(standardMonthlyPrice, { items: { data: [] } }) },
    { itemKey: standardKey, tier: "standard", privateMetadata: standardPrivate, subscription: subscription(standardMonthlyPrice, { items: { data: [{ quantity: 2, price: { id: standardMonthlyPrice } }] } }) },
  ];
  for (const input of cases) assert.equal(membershipCreditEligibility(input as never).ok, false);
});

test("Stripe credit is negative, USD, metadata-bound, and provider-idempotent", async () => {
  const calls: unknown[][] = [];
  const stripe = { customers: { createBalanceTransaction: async (...args: unknown[]) => { calls.push(args); return { id: "cbtxn_credit" }; } } };
  const result = await applyMembershipCredit({ stripe, customerId: "cus_member", redemptionId: "reward_123", itemKey: standardKey, creditCents: 300 });
  assert.deepEqual(result, { transactionId: "cbtxn_credit" });
  assert.deepEqual(calls, [["cus_member", {
    amount: -300,
    currency: "usd",
    description: "Bourbon Signal — one month on us",
    metadata: { signalPointsRedemptionId: "reward_123", signalPointsRewardKey: standardKey },
  }, { idempotencyKey: "signal-points-membership-credit:reward_123" }]]);
});

test("database and route enforce annual limit, atomic fulfillment preparation, and automatic delivery", () => {
  const schema = read("src/lib/signal-points-schema.sql");
  const route = read("src/app/api/signal-points/redemptions/route.ts");
  const repository = read("src/lib/signal-points-repository.ts");
  const panel = read("src/components/SignalPointsPanel.tsx");
  assert.match(schema, /membership credit already redeemed within the last 12 months/i);
  assert.match(schema, /created_at\s*>\s*NOW\(\)\s*-\s*INTERVAL\s*'1 year'/i);
  assert.match(schema, /status IN \('submitted','approved','digital_fulfillment'\)[\s\S]*RETURN QUERY SELECT existing_row\.id/i);
  assert.match(schema, /FOR UPDATE/i);
  assert.match(schema, /Membership credits are fulfilled automatically/i);
  assert.match(schema, /signal_points_membership_credit_v3_ready/i);
  assert.match(schema, /prepare_signal_membership_credit_fulfillment/i);
  assert.match(schema, /complete_signal_membership_credit_fulfillment/i);
  assert.match(repository, /prepareMembershipCreditFulfillment/);
  assert.match(repository, /completeMembershipCreditFulfillment/);
  assert.match(repository, /assertMembershipCreditReady/);
  assert.match(repository, /pending\.item_key NOT IN[\s\S]*signal_points_membership_credit_v3_ready/i);
  assert.match(route, /applyMembershipCredit/);
  assert.match(route, /subscriptions\.retrieve/);
  assert.match(route, /assertMembershipCreditReady/);
  assert.match(route, /prepareMembershipCreditFulfillment/);
  assert.match(route, /completeMembershipCreditFulfillment/);
  assert.match(panel, /Applied automatically to your next Stripe invoice/);
  assert.doesNotMatch(panel, /membershipCredit[\s\S]{0,500}21 or older/i);
});
