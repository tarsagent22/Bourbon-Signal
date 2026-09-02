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
  assert.ok(screen.includes('pathname: "/(app)/account/membership/[tier]"'));
  assert.match(screen, /profile \? membershipActionFor/);
  assert.doesNotMatch(screen, /profile\?\.membership\.tier \|\| "free"/);
  assert.doesNotMatch(screen, /Linking\.openURL|WebBrowser|bourbonsignal\.com/);
});

test("plan review gives Apple-ready disclosures without pretending purchasing works", () => {
  const screen = read("app/(app)/account/membership/[tier].tsx");
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
