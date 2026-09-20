import assert from "node:assert/strict";
import test from "node:test";
import {
  MEMBERSHIP_PLANS,
  billingChoiceFor,
  membershipActionFor,
  type MembershipTier,
} from "./membership-plans";

test("mobile plans expose monthly pricing only while preserving Founder lifetime access", () => {
  const standard = MEMBERSHIP_PLANS.find((plan) => plan.tier === "standard");
  const barrel = MEMBERSHIP_PLANS.find((plan) => plan.tier === "barrel");
  const founder = MEMBERSHIP_PLANS.find((plan) => plan.tier === "bottled-in-bond");

  assert.deepEqual(standard?.monthly, { price: "$3", suffix: "/month", trialDays: 7 });
  assert.equal(Object.hasOwn(standard ?? {}, "annual"), false);
  assert.deepEqual(barrel?.monthly, { price: "$6", suffix: "/month", trialDays: 7 });
  assert.equal(Object.hasOwn(barrel ?? {}, "annual"), false);
  assert.deepEqual(founder?.lifetime, { price: "$50", suffix: " once" });
  assert.equal(Object.hasOwn(MEMBERSHIP_PLANS.find((plan) => plan.tier === "free") ?? {}, "annual"), false);
});

test("monthly is the only subscription choice, including for legacy annual route parameters", () => {
  assert.deepEqual(billingChoiceFor("standard"), { interval: "monthly", price: "$3", suffix: "/month", trialDays: 7 });
  assert.deepEqual(billingChoiceFor("barrel", "annual"), { interval: "monthly", price: "$6", suffix: "/month", trialDays: 7 });
  assert.deepEqual(billingChoiceFor("bottled-in-bond"), { interval: "lifetime", price: "$50", suffix: " once" });
});

test("membership actions distinguish current, included, upgrade, and unavailable purchase states", () => {
  const action = (current: MembershipTier, target: MembershipTier) => membershipActionFor(current, target);
  assert.deepEqual(action("free", "free"), { kind: "current", label: "Current membership" });
  assert.deepEqual(action("barrel", "standard"), { kind: "included", label: "Included with Barrel" });
  assert.deepEqual(action("free", "barrel"), { kind: "upgrade", label: "Review Barrel" });
  assert.deepEqual(action("standard", "bottled-in-bond"), { kind: "unavailable", label: "Founder access" });
});

test("customer-facing membership names are canonical while the Founder entitlement id remains stable", () => {
  assert.deepEqual(MEMBERSHIP_PLANS.map(({ tier, name }) => [tier, name]), [
    ["free", "Free"],
    ["standard", "Standard"],
    ["barrel", "Barrel"],
    ["bottled-in-bond", "Founder"],
  ]);
  assert.equal(MEMBERSHIP_PLANS.find((plan) => plan.tier === "bottled-in-bond")?.purchasableOnIos, false);
});
