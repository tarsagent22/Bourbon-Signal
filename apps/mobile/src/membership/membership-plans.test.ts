import assert from "node:assert/strict";
import test from "node:test";
import {
  MEMBERSHIP_PLANS,
  billingChoiceFor,
  membershipActionFor,
  type MembershipTier,
} from "./membership-plans";

test("mobile plans preserve the canonical pricing and monthly trial disclosures", () => {
  const standard = MEMBERSHIP_PLANS.find((plan) => plan.tier === "standard");
  const barrel = MEMBERSHIP_PLANS.find((plan) => plan.tier === "barrel");
  const founder = MEMBERSHIP_PLANS.find((plan) => plan.tier === "bottled-in-bond");

  assert.deepEqual(standard?.monthly, { price: "$3", suffix: "/month", trialDays: 7 });
  assert.deepEqual(standard?.annual, { price: "$30", suffix: "/year", valueNote: "2 months free" });
  assert.deepEqual(barrel?.monthly, { price: "$6", suffix: "/month", trialDays: 7 });
  assert.deepEqual(barrel?.annual, { price: "$60", suffix: "/year", valueNote: "2 months free" });
  assert.deepEqual(founder?.lifetime, { price: "$50", suffix: " once" });
  assert.equal(MEMBERSHIP_PLANS.find((plan) => plan.tier === "free")?.annual, undefined);
});

test("monthly is the default and annual never receives a trial", () => {
  assert.deepEqual(billingChoiceFor("standard"), { interval: "monthly", price: "$3", suffix: "/month", trialDays: 7 });
  assert.deepEqual(billingChoiceFor("barrel", "annual"), { interval: "annual", price: "$60", suffix: "/year", valueNote: "2 months free" });
  assert.deepEqual(billingChoiceFor("bottled-in-bond"), { interval: "lifetime", price: "$50", suffix: " once" });
});

test("membership actions distinguish current, included, upgrade, and unavailable purchase states", () => {
  const action = (current: MembershipTier, target: MembershipTier) => membershipActionFor(current, target);
  assert.deepEqual(action("free", "free"), { kind: "current", label: "Current membership" });
  assert.deepEqual(action("barrel", "standard"), { kind: "included", label: "Included with Barrel Proof" });
  assert.deepEqual(action("free", "barrel"), { kind: "upgrade", label: "Review Barrel Proof" });
  assert.deepEqual(action("standard", "bottled-in-bond"), { kind: "upgrade", label: "Review Bottled in Bond" });
});
