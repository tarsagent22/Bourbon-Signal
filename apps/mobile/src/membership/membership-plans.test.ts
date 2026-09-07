import assert from "node:assert/strict";
import test from "node:test";
import {
  MEMBERSHIP_PLANS,
  PAID_MEMBERSHIP_PLANS,
  billingChoiceFor,
  membershipChoiceAccessibilityLabel,
  membershipActionFor,
  trialDisclosureFor,
  type MembershipTier,
} from "./membership-plans";

test("paid plans explain who each choice serves and what changes", () => {
  assert.deepEqual(PAID_MEMBERSHIP_PLANS.map((plan) => plan.tier), ["standard", "barrel", "bottled-in-bond"]);
  const standard = MEMBERSHIP_PLANS.find((plan) => plan.tier === "standard");
  const barrel = MEMBERSHIP_PLANS.find((plan) => plan.tier === "barrel");
  const founder = MEMBERSHIP_PLANS.find((plan) => plan.tier === "bottled-in-bond");
  assert.equal(standard?.bestFor, "For focused hunting near home");
  assert.deepEqual(standard?.chooserFeatures, ["See all tracked availability in your state", "Track 15 bottles in 5 hunting areas", "Push, email, and SMS alerts for matching availability"]);
  assert.equal(barrel?.bestFor, "For serious or multi-area hunters");
  assert.deepEqual(barrel?.chooserFeatures, ["Everything in Standard Proof", "Track unlimited bottles and areas", "Alerts from member-reported sightings", "Discover your taste profile and bottles you may like"]);
  assert.equal(founder?.bestFor, "Barrel Proof for life");
  assert.deepEqual(founder?.chooserFeatures, ["Permanent Founder number", "Numbered Founder’s glass"]);
  assert.doesNotMatch(JSON.stringify(MEMBERSHIP_PLANS), /Bottle Check|Full \+ advanced/i);
});

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

test("chooser disclosures make trial state and decision details explicit", () => {
  assert.equal(trialDisclosureFor("standard", "monthly", null), "Trial eligibility could not be confirmed");
  assert.equal(trialDisclosureFor("standard", "monthly", true), "7-day free trial · $3/month after");
  assert.equal(trialDisclosureFor("standard", "monthly", false), "No trial available · $3/month");
  assert.equal(trialDisclosureFor("barrel", "annual", false), "2 months free · annual plans have no trial");
  assert.equal(trialDisclosureFor("bottled-in-bond", "lifetime", false), "Lifetime access · no trial");
  const label = membershipChoiceAccessibilityLabel("standard", "monthly", true, "Review Standard Proof");
  assert.match(label, /Standard Proof.*\$3\/month.*For focused hunting near home.*See all tracked availability in your state.*Track 15 bottles in 5 hunting areas.*7-day free trial.*Review Standard Proof/);
});

test("membership actions distinguish current, included, upgrade, and unavailable purchase states", () => {
  const action = (current: MembershipTier, target: MembershipTier) => membershipActionFor(current, target);
  assert.deepEqual(action("free", "free"), { kind: "current", label: "Current membership" });
  assert.deepEqual(action("barrel", "standard"), { kind: "included", label: "Included with Barrel Proof" });
  assert.deepEqual(action("bottled-in-bond", "barrel"), { kind: "included", label: "Included with Founder" });
  assert.deepEqual(action("free", "barrel"), { kind: "upgrade", label: "Review Barrel Proof" });
  assert.deepEqual(action("standard", "bottled-in-bond"), { kind: "upgrade", label: "Review Founder" });
});
