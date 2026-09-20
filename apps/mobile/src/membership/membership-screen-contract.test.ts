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
  assert.match(plans, /name: "Standard"/);
  assert.match(plans, /name: "Barrel"/);
  assert.match(plans, /name: "Founder"/);
  assert.doesNotMatch(screen, /Annual|annual/);
  assert.ok(screen.includes('pathname: "/(app)/account/membership/[tier]"'));
  assert.match(screen, /profile \? membershipActionFor/);
  assert.doesNotMatch(screen, /profile\?\.membership\.tier \|\| "free"/);
  assert.doesNotMatch(screen, /Stripe Checkout|checkout\/continue|bourbonsignal\.com\/pricing/);
  assert.match(screen, /usePurchases\(\)/);
  assert.match(screen, /useEffect\(\(\) => \{\s*if \(purchases\.profile\) setProfile\(purchases\.profile\);\s*\}, \[purchases\.profile\]\)/);
  assert.match(screen, /localizedPrice/);
  assert.doesNotMatch(screen, /hasIntroductoryOffer|monthlyTrialIsEligible|getMembershipTrialEligibility|trialEligibility|7-day trial|Eligible 7-day/);
  assert.doesNotMatch(screen, /Standard Proof|Barrel Proof|Bottled in Bond|Bottle Check/);
});

test("plan review uses native purchases but fails closed until server reconciliation is ready", () => {
  const screen = read("app/(app)/account/membership/[tier].tsx");
  assert.match(screen, /Renews automatically unless canceled/);
  assert.match(screen, /Apple purchases are not available/);
  assert.match(screen, /Restore purchases/);
  assert.match(screen, /purchase\(productId\)/);
  assert.match(screen, /restore\(\)/);
  assert.match(screen, /localizedPrice/);
  assert.doesNotMatch(screen, /hasIntroductoryOffer|monthlyTrialIsEligible|getMembershipTrialEligibility|trialEligibility|7-day trial|Eligible 7-day/);
  assert.match(screen, /refresh.*authoritative|authoritative.*profile/i);
  assert.match(screen, /Platform\.OS/);
  assert.match(screen, /Apple ID/);
  assert.match(screen, /Google Play account/);
  assert.match(screen, /plan\.tier === "free"/);
  assert.match(screen, /Free membership\. No payment or renewal\./);
  assert.match(screen, /canceled before the next billing date/);

  assert.match(screen, /disabled/);
  assert.match(screen, /Founder memberships are honored here but are not sold through Apple/);
  assert.match(screen, /deriveMobileMembershipLifecycle/);
  assert.match(screen, /Manage subscriptions in the App Store/);
  assert.match(screen, /openAppleSubscriptionManagement/);
  assert.ok(screen.includes('router.push("/(app)/account/delete")'));
  assert.ok(screen.includes('router.push("/(app)/account/privacy")'));
  assert.ok(screen.includes('router.push("/(app)/account/terms")'));
  assert.ok(screen.includes('router.push("/(app)/account/support")'));
  assert.doesNotMatch(screen, /Stripe Checkout|checkout\/continue|bourbonsignal\.com\/pricing/);
  assert.doesNotMatch(screen, /Standard Proof|Barrel Proof|Bottled in Bond|Bottle Check/);
});

test("Apple review paywall keeps localized price, renewal terms, and purchase action together above benefits", () => {
  const screen = read("app/(app)/account/membership/[tier].tsx");
  const purchaseCardStart = screen.indexOf('<View style={styles.purchaseCard}>');
  const benefitsStart = screen.indexOf('<View style={styles.featuresCard}>');
  const purchaseAction = screen.indexOf('onPress={() => void buy()}');

  assert.ok(purchaseCardStart >= 0, "the StoreKit offer card must exist");
  assert.ok(purchaseAction > purchaseCardStart && purchaseAction < benefitsStart,
    "the purchase action must remain inside the StoreKit offer card before the benefits list");
  assert.match(screen, /storeProduct\?\.localizedPrice/);
  assert.match(screen, /Renews automatically unless canceled at least 24 hours before the current period ends/);
  assert.match(screen, /`Continue with \$\{plan\.name\} · \$\{storeProduct\.localizedPrice\}`/);
  assert.match(screen, /`Purchase \$\{plan\.name\} for \$\{storeProduct\.localizedPrice\} per \$\{storeProduct\.localizedPeriod\}`/);
  assert.match(screen, /accessibilityLabel=\{purchaseAccessibilityLabel\}/);
});

test("the authenticated app tree owns the purchase provider and no paywall UI dependency", () => {
  const layout = read("app/_layout.tsx");
  const packageJson = read("package.json");
  assert.match(layout, /PurchasesProvider/);
  assert.match(packageJson, /"react-native-purchases": "10\.9\.1"/);
  assert.doesNotMatch(packageJson, /react-native-purchases-ui/);
});

test("the purchase provider does not initialize StoreKit during root startup", () => {
  const provider = read("src/membership/PurchasesProvider.tsx");
  const planScreen = read("app/(app)/account/membership/[tier].tsx");
  assert.match(provider, /if \(!auth\.isLoaded \|\| auth\.isSignedIn\) return;/);
  assert.match(planScreen, /Refresh purchase status/);
});

test("native legal copy covers Apple and RevenueCat purchase handling without retired product wording", () => {
  const terms = read("app/(app)/account/terms.tsx");
  const privacy = read("app/(app)/account/privacy.tsx");
  assert.match(terms, /Terms of Service/);
  assert.match(terms, /Paid subscriptions renew automatically unless canceled/);
  assert.match(terms, /Billing, cancellations, and refunds/);
  assert.match(terms, /App Store/);
  assert.match(privacy, /RevenueCat/);
  assert.match(privacy, /purchase history|purchase status/);
  assert.doesNotMatch(`${terms}\n${privacy}`, /Bottle Check|Standard Proof|Barrel Proof|Bottled in Bond/);
});
