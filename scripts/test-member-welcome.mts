import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveSignUpRedirect, contextualProductHref } from "../src/lib/growth-events.ts";

assert.equal(resolveSignUpRedirect(null), "/welcome");
assert.equal(resolveSignUpRedirect("/release-radar?source=release_radar"), "/release-radar?source=release_radar");
assert.equal(resolveSignUpRedirect("//evil.example"), "/welcome");
assert.equal(contextualProductHref("pricing", "drop_feed"), "/pricing?source=drop_feed");

const [authSource, signUpSource, welcomeSource, pricingSource, dashboardSource, middlewareSource] = await Promise.all([
  readFile(new URL("../src/lib/auth.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/sign-up/[[...sign-up]]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/welcome/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/pricing/PricingPageClient.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/dashboard/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/middleware.ts", import.meta.url), "utf8"),
]);
const welcomeStyles = await readFile(new URL("../src/app/welcome/welcome.module.css", import.meta.url), "utf8");

assert.match(authSource, /window\.location\.href = "\/sign-up"/);
assert.doesNotMatch(authSource, /redirect_url=\/pricing/);
assert.match(signUpSource, /resolveSignUpRedirect/);
assert.match(signUpSource, /Create your free Bourbon Signal account/);
assert.match(signUpSource, /No card required/);
assert.match(signUpSource, /recordGrowthMilestone\("signup_started"/);
assert.match(signUpSource, /if \(!confirmedAge \|\| signupStartedRecorded\.current\) return;[\s\S]*recordGrowthMilestone\("signup_started"/, "signup start must begin only after the age gate reveals the account form");
assert.match(signUpSource, /withoutRegistrationMarker[\s\S]*signInForceRedirectUrl=\{signInRedirectUrl\}/, "existing-user sign-in must not reuse a registration-completion marker");
assert.match(welcomeSource, /useStatePreferences/);
assert.match(welcomeSource, /STATE_LIFECYCLE_CONFIG/);
assert.match(welcomeSource, /Choose the state you want to hunt first/);
assert.match(welcomeSource, /setSelectedStates\(\[selectedState\]\)/, "onboarding must persist exactly one selected state through the shared preference store");
assert.match(welcomeSource, /`\/\?state=\$\{encodeURIComponent\(selectedState\)\}#drops`/, "the primary value path must open the existing state-filtered Drop Feed");
assert.match(welcomeSource, /customerSummary/, "coverage copy must come from the lifecycle customer summary");
assert.match(welcomeSource, /className=\{styles\.primaryAction\}[\s\S]*See my state's latest signals/);
assert.match(welcomeSource, /See my state's latest signals[\s\S]*href="\/bottle-check"/, "Bottle Check must be the next visible action after the state-first value path");
assert.doesNotMatch(welcomeSource, /className=\{styles\.primaryAction\}[^>]*>Upgrade/, "upgrade must not be the primary welcome action");
assert.match(welcomeSource, /href="\/pricing\?source=welcome"[^>]*>See membership options/);
assert.match(welcomeSource, /recordGrowthMilestone\("registration_completed"/);
assert.match(welcomeSource, /recordGrowthMilestone\("onboarding_state_selected"/);
assert.match(welcomeStyles, /\.tertiaryAction:focus-visible[\s\S]*outline:\s*2px solid/, "the tertiary welcome action must retain a visible keyboard focus ring");
assert.match(pricingSource, /Continue with Free/);
assert.match(pricingSource, /\/sign-up\?redirect_url=%2Fwelcome|\/sign-up/);
assert.doesNotMatch(pricingSource, /comparisonRows|comparison-table|role="table"/, "the giant repeated plan comparison must be removed");
assert.match(pricingSource, /compact-differences/);
assert.match(pricingSource, /Recommended[\s\S]*Standard Proof/);
assert.match(pricingSource, /Limited lifetime offer/);
for (const plan of ["standard_monthly", "standard_annual", "barrel_monthly", "barrel_annual", "bib_lifetime"]) {
  assert.ok(pricingSource.includes(plan), `pricing must preserve checkout plan ${plan}`);
}
for (const price of ["$2.99", "$24.99", "$4.99", "$49.99"]) {
  assert.ok(pricingSource.includes(price), `pricing must preserve approved price ${price}`);
}
assert.doesNotMatch(dashboardSource, /FreeMemberDashboard/, "free members should use the real dashboard instead of a parallel imitation");
assert.match(dashboardSource, /return <PaidMemberDashboard \/>/, "all entitled members should enter the shared dashboard shell");
assert.match(dashboardSource, /isFreeTier[\s\S]*?Free access includes 7 recent signals, 3 Bottle Checks, and Member Sightings/, "the shared dashboard must explain the real free entitlements");
assert.doesNotMatch(dashboardSource, /Your free dashboard|Free member dashboard/, "free access must not look like a separate imitation product");
assert.match(dashboardSource, />\s*Member Dashboard\s*<\/h1>/, "free and paid members should share the real dashboard identity");
assert.match(dashboardSource, /Upgrade membership/);
assert.match(middlewareSource, /"\/welcome\(\.\*\)"/);

console.log("Member welcome contract passed.");
