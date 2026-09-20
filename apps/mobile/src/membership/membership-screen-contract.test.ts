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
  assert.match(chooser, /accessibilityLabel=\{\[plan\.name/);
  assert.doesNotMatch(chooser, /trialDisclosureFor|7-day free trial|Trial eligibility/);
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

test("plan review is composed for Apple's bootstrap screenshots before products exist", () => {
  const screen = read("app/(app)/account/membership/[tier].tsx");
  assert.match(screen, /APPLE SUBSCRIPTION/);
  assert.match(screen, /plan\.chooserName \|\| plan\.name/);
  assert.match(screen, /billingChoiceFor\(plan\.tier, interval\)/);
  assert.match(screen, /Monthly/);
  assert.match(screen, /Annual/);
  assert.match(screen, /Auto-renews monthly until canceled\./);
  assert.match(screen, /Auto-renews annually until canceled\./);
  assert.match(screen, /Payment is charged to your Apple Account after confirmation\./);
  assert.match(screen, /What you get/);
  assert.ok(screen.includes('router.push("/(app)/account/privacy")'));
  assert.ok(screen.includes('router.push("/(app)/account/terms")'));
  assert.doesNotMatch(screen, /7-day free trial|trialEligibility|purchases are not available|purchasing is coming soon|Purchases coming soon|Price unavailable/i);
  assert.doesNotMatch(screen, /Linking\.openURL|WebBrowser|bourbonsignal\.com/);
});

test("iOS comparison does not advertise Founder as a purchasable plan", () => {
  const chooser = read("src/membership/MembershipPlanChooser.tsx");
  assert.match(chooser, /Platform\.OS !== "ios" && founder/);
  assert.doesNotMatch(chooser, /accessibilityLabel=\{membershipChoiceAccessibilityLabel\("bottled-in-bond"/);
});

test("subscription review links to native terms that cover recurring billing", () => {
  const terms = read("app/(app)/account/terms.tsx");
  assert.match(terms, /Terms of Service/);
  assert.match(terms, /Paid subscriptions renew automatically unless canceled/);
  assert.match(terms, /Billing, cancellations, and refunds/);
});

test("Founder entitlement is presented as Free on the pricing page only", () => {
  const screen = read("app/(app)/account/membership.tsx");
  assert.match(screen, /const pricingTier = currentTier === "bottled-in-bond" \? "free" : currentTier/);
  assert.match(screen, /currentTier=\{pricingTier\}/);
  assert.match(screen, /Pick your hunting plan\./);
  assert.doesNotMatch(screen, /You’re a Founder|No subscription renewal|compareExpanded|showPlans/);
  assert.match(screen, /eligible \?\? null/);
  assert.doesNotMatch(screen, /unlimited range/);
});
