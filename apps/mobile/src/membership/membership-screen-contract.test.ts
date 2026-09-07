import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative: string) => readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");

test("Account opens the native membership destination instead of embedding a dead summary", () => {
  const account = read("app/(app)/(tabs)/hq.tsx");
  assert.match(account, /label="Membership"/);
  assert.ok(account.includes('router.push("/(app)/account/membership")'));
  assert.doesNotMatch(account, /expandedDestination === "membership"/);
  assert.doesNotMatch(account, /Linking\.openURL|WebBrowser|bourbonsignal\.com\/pricing/);
});

test("membership overview compares every tier with accurate pricing and native detail routes", () => {
  const screen = read("app/(app)/account/membership.tsx");
  const plans = read("src/membership/membership-plans.ts");
  assert.match(screen, /YOUR MEMBERSHIP/);
  assert.match(plans, /name: "Free"/);
  assert.match(plans, /name: "Standard Proof"/);
  assert.match(plans, /name: "Barrel Proof"/);
  assert.match(plans, /name: "Bottled in Bond"/);
  assert.match(screen, /Monthly/);
  assert.match(screen, /Annual · 2 months free/);
  assert.match(screen, /<MembershipPlanChooser/);
  const chooser = read("src/membership/MembershipPlanChooser.tsx");
  assert.match(screen, /Pick your hunting plan\./);
  assert.match(chooser, /plan\.bestFor/);
  assert.match(chooser, /plan\.chooserFeatures\?\.map/);
  assert.match(chooser, /Every paid plan also includes/);
  assert.match(chooser, /Founder/);
  assert.match(chooser, /Prefer free\?/);
  assert.match(chooser, /without alerts/);
  assert.match(chooser, /useState\(false\)/);
  assert.match(chooser, /accessibilityState=\{\{ expanded: freeExpanded \}\}/);
  assert.match(chooser, /accessibilityLabel=\{membershipChoiceAccessibilityLabel/);
  assert.match(chooser, /trialDisclosureFor/);
  assert.doesNotMatch(chooser, /Compare features|Plan differences|MEMBERSHIP_COMPARISON_ROWS|Full \+ advanced|ScrollView|numberOfLines|adjustsFontSizeToFit/);
  assert.doesNotMatch(screen, /MembershipComparison|PAID_MEMBERSHIP_PLANS\.map|Monthly Standard Proof and Barrel Proof include/);
  assert.doesNotMatch(screen, /\{MEMBERSHIP_PLANS\.map/);
  assert.doesNotMatch(screen, /plan\.description/);
  assert.doesNotMatch(screen, /plan\.features\.slice/);
  assert.ok(screen.includes('pathname: "/(app)/account/membership/[tier]"'));
  assert.match(chooser, /currentTier\s*\? membershipActionFor/);
  assert.doesNotMatch(screen, /profile\?\.membership\.tier \|\| "free"/);
  assert.doesNotMatch(screen, /Linking\.openURL|WebBrowser|bourbonsignal\.com/);
});

test("membership navigation names Account instead of exposing the route group", () => {
  const layout = read("app/(app)/_layout.tsx");
  assert.match(layout, /name="account\/membership" options=\{\{ title: "Membership", headerBackTitle: "Account" \}\}/);
  assert.match(layout, /name="account\/membership\/\[tier\]" options=\{\{ title: "Review membership", headerBackTitle: "Membership" \}\}/);
});

test("mobile membership and legal surfaces retire Bottle Check copy", () => {
  const surfaces = [
    read("src/membership/membership-plans.ts"),
    read("app/(app)/account/membership.tsx"),
    read("app/(app)/account/membership/[tier].tsx"),
    read("app/(app)/account/terms.tsx"),
  ].join("\n");
  assert.doesNotMatch(surfaces, /Bottle Check|Bottle Checker/i);
});

test("plan review gives Apple-ready disclosures without pretending purchasing works", () => {
  const screen = read("app/(app)/account/membership/[tier].tsx");
  assert.match(screen, /plan\.chooserName \|\| plan\.name/);
  assert.match(screen, /7-day free trial/);
  assert.match(screen, /Renews automatically unless canceled/);
  assert.match(screen, /In-app purchases are not available in this build yet/);
  assert.match(screen, /Restore purchases/);
  assert.match(screen, /Platform\.OS/);
  assert.match(screen, /Apple ID/);
  assert.match(screen, /Google Play account/);
  assert.match(screen, /plan\.tier === "free"/);
  assert.match(screen, /Free membership\. No payment or renewal\./);
  assert.match(screen, /canceled before the next billing date/);
  assert.match(screen, /getMembershipTrialEligibility/);
  assert.match(screen, /trialEligibility/);
  assert.match(screen, /disabled/);
  assert.ok(screen.includes('router.push("/(app)/account/privacy")'));
  assert.ok(screen.includes('router.push("/(app)/account/terms")'));
  assert.ok(screen.includes('router.push("/(app)/account/support")'));
  assert.doesNotMatch(screen, /Linking\.openURL|WebBrowser|bourbonsignal\.com/);
});

test("subscription review links to native terms that cover recurring billing", () => {
  const terms = read("app/(app)/account/terms.tsx");
  assert.match(terms, /Terms of Service/);
  assert.match(terms, /Paid subscriptions renew automatically unless canceled/);
  assert.match(terms, /Billing, cancellations, and refunds/);
});

 test("Founder overview confirms access and makes comparison secondary", () => {
 const screen = read("app/(app)/account/membership.tsx");
 assert.match(screen, /You’re a Founder/);
 assert.match(screen, /No subscription renewal/);
 assert.match(screen, /const showPlans = !isFounder \|\| compareExpanded/);
 assert.match(screen, /eligible \?\? null/);
 assert.doesNotMatch(screen, /unlimited range/);
 });
