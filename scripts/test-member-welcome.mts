import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveSignUpRedirect, contextualProductHref } from "../src/lib/growth-events.ts";

assert.equal(resolveSignUpRedirect(null, null), "/welcome");
assert.equal(resolveSignUpRedirect("/release-radar?source=release_radar", null), "/welcome", "generic signup destinations must complete Welcome first");
assert.equal(resolveSignUpRedirect("//evil.example", "paid"), "/welcome");
assert.equal(
  resolveSignUpRedirect("/checkout/continue?plan=standard_annual&source=pricing&registration=1", "paid"),
  "/checkout/continue?plan=standard_annual&source=pricing&registration=1",
  "only a validated paid checkout continuation may bypass Welcome",
);
assert.equal(resolveSignUpRedirect("/dashboard", "paid"), "/welcome", "paid intent cannot bless an arbitrary internal route");
assert.equal(contextualProductHref("pricing", "drop_feed"), "/pricing?source=drop_feed");

const [authSource, signInSource, signUpSource, welcomeSource, pricingSource, dashboardSource, middlewareSource, requestFormSource, preferencesHookSource] = await Promise.all([
  readFile(new URL("../src/lib/auth.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/sign-in/[[...sign-in]]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/sign-up/[[...sign-up]]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/welcome/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/pricing/PricingPageClient.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/dashboard/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/middleware.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/components/coverage/CoverageRequestForm.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/hooks/useAreaPreferences.ts", import.meta.url), "utf8"),
]);
const welcomeStyles = await readFile(new URL("../src/app/welcome/welcome.module.css", import.meta.url), "utf8");

assert.match(authSource, /window\.location\.href = "\/sign-up"/);
assert.doesNotMatch(authSource, /redirect_url=\/pricing/);
assert.match(signInSource, /newAccountRedirect[\s\S]*"\/welcome\?registration=1"/i, "generic Clerk login-card account creation must enter Welcome");
assert.match(signInSource, /signUpForceRedirectUrl=\{newAccountRedirect\}/);
assert.match(signInSource, /withRegistrationMarker\(paidSignupRedirect\)/, "paid intent survives sign-up to sign-in to sign-up with registration tracking");
assert.match(signUpSource, /resolveSignUpRedirect\([^,]+,\s*searchParams\.get\("intent"\)\)/);
assert.match(signUpSource, /Create your free Bourbon Signal account/);
assert.match(signUpSource, /No card required/);
assert.match(signUpSource, /recordGrowthMilestone\("signup_started"/);
assert.match(signUpSource, /if \(!confirmedAge \|\| signupStartedRecorded\.current\) return;[\s\S]*recordGrowthMilestone\("signup_started"/, "signup start must begin only after the age gate reveals the account form");
assert.match(signUpSource, /intent=paid|paidIntent/, "paid-plan signup must preserve an explicit checkout intent through sign-in");

assert.match(welcomeSource, /US_STATE_OPTIONS/, "Welcome must offer the nationwide state list");
assert.match(welcomeSource, /memberProfile/);
assert.match(welcomeSource, /homeState/);
assert.match(welcomeSource, /useAreaPreferences/);
assert.match(preferencesHookSource, /\/api\/user\/preferences/);
assert.match(welcomeSource, /\/api\/drops\?state=/);
assert.match(welcomeSource, /limit=5/);
assert.match(welcomeSource, /\/api\/coverage/);
assert.match(welcomeSource, /monitoredStoreCount/);
assert.match(welcomeSource, /representedAreaCount/);
assert.match(welcomeSource, /alertGrade/);
assert.match(welcomeSource, /CoverageRequestForm/);
assert.match(welcomeSource, /variant="welcome"/);
assert.match(welcomeSource, /recordGrowthMilestone\("free_value_reached"[\s\S]*surface:\s*"welcome"[\s\S]*kind:\s*"welcome_state_signals"/);
assert.match(requestFormSource, /Want Bourbon Signal to cover more near you\?/);
assert.match(requestFormSource, /Email me when coverage meaningfully improves\./);
assert.doesNotMatch(requestFormSource, /Request coverage and email me/i);
assert.match(requestFormSource, /<details[\s\S]*Add county, city, or store details/, "optional local fields should not dominate the request form");
assert.doesNotMatch(welcomeSource, /go deeper/i, "coverage copy must avoid the rejected phrasing");
assert.doesNotMatch(requestFormSource, /go deeper/i, "embedded request copy must avoid the rejected phrasing");
assert.match(welcomeSource, /Choose where to go next/);
for (const destination of ["/bottle-check", "/release-radar", "#drops", "/sightings", "/coverage", "/dashboard"]) {
  assert.ok(welcomeSource.includes(destination), `Welcome explore section must include ${destination}`);
}
assert.doesNotMatch(welcomeSource, /window\.location\.href\s*=\s*`\/\?state=/, "state confirmation must not navigate away from Welcome");
assert.match(welcomeSource, /recordGrowthMilestone\("onboarding_state_selected"/);
assert.match(welcomeSource, /recordGrowthMilestone\("free_value_reached"/);
assert.match(welcomeSource, /precision:\s*"state_preview"/, "Welcome milestone context stays coarse and privacy-safe");
assert.doesNotMatch(welcomeStyles, /\.panel\s*\{[\s\S]{0,400}border:\s*1px/, "Welcome must not wrap the full journey in a bordered card");
assert.match(welcomeStyles, /\.signalSection[\s\S]*radial-gradient/, "Welcome sections should use subtle tonal landmarks");
assert.match(welcomeStyles, /\.signalList li[\s\S]*border:[\s\S]*border-radius/, "signal previews should use restrained Drop Feed-style cards");
assert.match(welcomeStyles, /\.exploreLinks a[\s\S]*border:[\s\S]*border-radius/, "Explore destinations should look actionable");
assert.doesNotMatch(welcomeSource, /See pricing quietly|Compare Free, Standard, Barrel, and Founder/i);
assert.match(welcomeSource, /Your free account/);
assert.match(welcomeSource, /Free accounts do not include alerts\./, "free onboarding must state the entitlement boundary plainly");
assert.match(welcomeSource, /Coverage:/, "coverage breadth needs an explicit label");
assert.match(welcomeSource, /Updates:/, "source health needs a separate explicit label");
assert.match(welcomeSource, /ABC boards with shipment information|Official shipment sources/, "shipment coverage must use customer-facing source language");
assert.match(welcomeSource, /activeState === "NC" \? "ABC boards with shipment information" : "Official shipment sources"/, "NC board wording must not leak into other states");
assert.match(welcomeSource, /Stores represented/);
assert.match(welcomeSource, /Stores reporting current availability/);
assert.match(welcomeSource, /Cities and towns represented|Areas represented/);
assert.match(welcomeSource, /Stores eligible for paid alerts/, "free members must not mistake alert-ready coverage for an included feature");
assert.match(welcomeSource, /These counts describe coverage, not bottles currently on the shelf\./);
assert.doesNotMatch(welcomeSource, /Information available here|What you can do here|Stores listed|Stores with restock alerts/);
assert.match(welcomeSource, /Your free account is a preview\./);
assert.match(welcomeSource, /Paid unlocks the full feed, saved alert areas, bottle watchlists, and live alerts\./);
assert.match(welcomeSource, /Plans start at \$2\.99\/month\./);
assert.match(welcomeSource, /See paid options/);
assert.match(welcomeStyles, /\.membershipAction\s*\{[\s\S]{0,500}border:[\s\S]{0,300}background:/, "the paid option should be visible without becoming a sales banner");
assert.match(welcomeStyles, /\.membershipAction > a:focus-visible/, "the paid option needs an explicit keyboard focus treatment");
assert.match(welcomeStyles, /\.membershipAction small\s*\{[\s\S]{0,160}rgba\(245, 237, 214, 0\.68\)[\s\S]{0,100}font: 11px/, "paid entitlement and price copy must remain readable at normal-text contrast");
assert.ok(welcomeSource.indexOf("Choose where to go next") < welcomeSource.indexOf("Your free account is a preview."), "the upgrade option should follow visible free-account value");
assert.match(requestFormSource, /variant.*welcome/);

assert.match(pricingSource, /Continue with Free/);
assert.match(pricingSource, /intent=paid/);
assert.doesNotMatch(pricingSource, /sign-up\?redirect_url=\/dashboard/, "pricing fallbacks cannot bypass Welcome");
assert.match(pricingSource, /comparisonRows/);
assert.match(pricingSource, /comparison-table/);
assert.match(pricingSource, /role="table"/);
for (const feature of [
  "Drop Feed access",
  "Release Radar",
  "Bottle Checks",
  "Member Sightings",
  "SMS, email, and on-site alerts",
  "Alert preference limits",
  "Signal Strength meter",
  "Sightings alerts",
  "My Collection",
  "Recommended Bottles",
  "Lifetime future features",
  "Founder badge + number",
  "Numbered Founder’s glass",
  "Founder-only benefits",
]) {
  assert.ok(pricingSource.includes(feature), `comparison must preserve the complete prior feature row: ${feature}`);
}
assert.match(pricingSource, /value === "✓"[\s\S]*included[\s\S]*value === "—"[\s\S]*not-included/, "comparison should use the prior checkmark and dash treatment");
assert.match(pricingSource, /aria-label=\{value === "✓" \? "Included" : value === "—" \? "Not included" : undefined\}/, "symbol-only comparison cells need a single spoken label");
assert.match(pricingSource, /\.comparison-row span:first-child\s*\{[^}]*position:sticky[^}]*left:0/, "feature labels must persist during horizontal scrolling");
assert.doesNotMatch(pricingSource, /\.comparison-row span:first-child\s*\{[^}]*position:static/, "mobile must not disable the persistent feature column");
assert.match(pricingSource, /@media \(max-width:\s*480px\)[\s\S]*\.comparison-scroll\s*\{[^}]*padding-right:0[\s\S]*grid-template-columns:132px repeat\(4, calc\(100vw - 178px\)\)/, "narrow mobile should size one complete plan beside the persistent feature labels without hidden scroller padding");
for (const viewportWidth of [320, 375, 390]) {
  const comparisonViewport = viewportWidth - 46;
  const planWidth = viewportWidth - 178;
  assert.equal(132 + planWidth, comparisonViewport, `sticky feature and plan columns must exactly fill the ${viewportWidth}px comparison viewport`);
  assert.ok(planWidth >= 142, `${viewportWidth}px must retain a readable plan column`);
}
assert.match(pricingSource, /\.july-sale-banner\s*\{[^}]*grid-template-areas:/, "desktop sale copy must use bounded named grid areas");
assert.doesNotMatch(pricingSource, /grid-template-columns:auto 1fr auto/, "sale disclaimer must not squeeze the offer into an intrinsic three-column layout");
const founderCardSource = pricingSource.slice(pricingSource.indexOf('tier: "bottled-in-bond"'), pricingSource.indexOf("const comparisonRows"));
assert.ok(founderCardSource.indexOf("Numbered Founder’s glass") < founderCardSource.indexOf("Founder badge & number on profile"), "the numbered glass should precede the profile badge in the Founder card");
assert.doesNotMatch(pricingSource, /compact-differences/);
assert.match(pricingSource, /July sale — 15% off/);
assert.match(pricingSource, /annual memberships and Founder lifetime/);
assert.match(pricingSource, /first annual payment/);
assert.match(pricingSource, /Founder remains a one-time payment/);
assert.match(pricingSource, /@media \(max-width:\s*640px\)[\s\S]*100vw - 28px/, "mobile pricing containers must remain viewport-bound");
assert.match(pricingSource, /Recommended[\s\S]*Standard Proof/);
assert.match(pricingSource, /Limited lifetime offer/);
for (const plan of ["standard_monthly", "standard_annual", "barrel_monthly", "barrel_annual", "bib_lifetime"]) {
  assert.ok(pricingSource.includes(plan), `pricing must preserve checkout plan ${plan}`);
}
for (const price of ["$2.99", "$24.99", "$4.99", "$49.99"]) {
  assert.ok(pricingSource.includes(price), `pricing must preserve approved price ${price}`);
}
assert.match(pricingSource, /canceledPlan[\s\S]*\/welcome/, "a canceled paid signup choosing Free must complete Welcome");
assert.doesNotMatch(dashboardSource, /FreeMemberDashboard/, "free members should use the real dashboard instead of a parallel imitation");
assert.match(dashboardSource, /return <PaidMemberDashboard \/>/, "all entitled members should enter the shared dashboard shell");
assert.match(middlewareSource, /"\/welcome\(\.\*\)"/);

console.log("Member welcome contract passed.");
