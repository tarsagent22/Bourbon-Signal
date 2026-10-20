import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveSignUpRedirect, contextualProductHref } from "../src/lib/growth-events.ts";

assert.equal(resolveSignUpRedirect(null, null), "/welcome");
assert.equal(resolveSignUpRedirect("/release-radar?source=release_radar", null), "/welcome", "generic signup destinations must complete Welcome first");
assert.equal(resolveSignUpRedirect("//evil.example", "paid"), "/welcome");
assert.equal(
  resolveSignUpRedirect("/checkout/continue?plan=standard_monthly&source=pricing&registration=1", "paid"),
  "/checkout/continue?plan=standard_monthly&source=pricing&registration=1",
  "only a validated paid checkout continuation may bypass Welcome",
);
assert.equal(resolveSignUpRedirect("/dashboard", "paid"), "/welcome", "paid intent cannot bless an arbitrary internal route");
assert.equal(contextualProductHref("pricing", "drop_feed"), "/pricing?source=drop_feed");

const [authSource, layoutSource, signInSource, signUpSource, welcomeSource, pricingSource, pricingCatalogSource, dashboardSource, middlewareSource, requestFormSource, preferencesHookSource] = await Promise.all([
  readFile(new URL("../src/lib/auth.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/sign-in/[[...sign-in]]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/sign-up/[[...sign-up]]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/welcome/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/pricing/PricingPageClient.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/membership-plan-catalog.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/dashboard/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/middleware.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/components/coverage/CoverageRequestForm.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/hooks/useAreaPreferences.ts", import.meta.url), "utf8"),
]);
const pricingTruthSource = `${pricingSource}\n${pricingCatalogSource}`;
const welcomeStyles = await readFile(new URL("../src/app/welcome/welcome.module.css", import.meta.url), "utf8");
const coverageMapSource = await readFile(new URL("../src/components/coverage/CoverageMap.tsx", import.meta.url), "utf8");
const coverageSummarySource = await readFile(new URL("../src/components/coverage/CoverageSummary.tsx", import.meta.url), "utf8");
const coverageSummaryStyles = await readFile(new URL("../src/components/coverage/CoverageSummary.module.css", import.meta.url), "utf8");
const coveragePanelSource = await readFile(new URL("../src/components/coverage/CoverageStatePanel.tsx", import.meta.url), "utf8");

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
assert.match(signUpSource, /fallbackRedirectUrl="\/welcome\?registration=1"/, "generic account creation must retain a Welcome fallback even when Clerk cannot use the forced destination");
assert.match(layoutSource, /signUpFallbackRedirectUrl="\/welcome\?registration=1"/, "every Clerk signup entry point must default to Welcome");

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
for (const destination of ["/bottle-check", "#drops", "/sightings", "/coverage", "/dashboard"]) {
  assert.ok(welcomeSource.includes(destination), `Welcome explore section must include ${destination}`);
}
assert.doesNotMatch(welcomeSource, /Release Radar|CalendarDays|\/release-radar/);
assert.doesNotMatch(welcomeSource, /window\.location\.href\s*=\s*`\/\?state=/, "state confirmation must not navigate away from Welcome");
assert.match(welcomeSource, /recordGrowthMilestone\("onboarding_state_selected"/);
assert.match(welcomeSource, /recordGrowthMilestone\("free_value_reached"/);
assert.match(welcomeSource, /precision:\s*"state_preview"/, "Welcome milestone context stays coarse and privacy-safe");
assert.doesNotMatch(welcomeStyles, /\.panel\s*\{[\s\S]{0,400}border:\s*1px/, "Welcome must not wrap the full journey in a bordered card");
assert.match(welcomeStyles, /\.signalSection[\s\S]*radial-gradient/, "Welcome sections should use subtle tonal landmarks");
assert.match(welcomeStyles, /\.signalList li[\s\S]*border:[\s\S]*border-radius/, "signal previews should use restrained Drop Feed-style cards");
assert.match(welcomeStyles, /\.exploreLinks a[\s\S]*border:[\s\S]*border-radius/, "Explore destinations should look actionable");
assert.doesNotMatch(welcomeSource, /See pricing quietly|Compare Free, Standard, Barrel, and Founder/i);
assert.match(welcomeSource, /Check out Bourbon Signal\./);
assert.doesNotMatch(welcomeSource, /Your free account|Free accounts do not include alerts\./);
const welcomeCoverageSection = welcomeSource.slice(
  welcomeSource.indexOf('aria-labelledby="coverage-depth-heading"'),
  welcomeSource.indexOf('aria-label="Optional coverage request"'),
);
assert.match(welcomeSource, /dynamic\([\s\S]*import\("@\/components\/coverage\/CoverageMap"\)[\s\S]*ssr:\s*false/, "map geometry is split out of Welcome's initial bundle");
assert.match(welcomeSource, /setCoverageStates\(coverageResult\.value\.payload\.states\)/, "Welcome retains the full coverage contract for the embedded map");
assert.match(welcomeCoverageSection, /<CoverageMap[\s\S]*states=\{coverageStates\}[\s\S]*selectedCode=\{activeState\}[\s\S]*interactive=\{false\}[\s\S]*compact/, "the embedded map highlights the home state without changing it");
assert.match(welcomeCoverageSection, /Explore the full map/, "the display map has a clear path to the interactive explorer");
assert.match(welcomeCoverageSection, /<CoverageSummary state=\{coverageState\}/, "Welcome renders the shared concise summary");
assert.ok(welcomeCoverageSection.indexOf("<CoverageMap") < welcomeCoverageSection.indexOf("<CoverageSummary"), "the map appears before the state summary");
assert.match(coverageMapSource, /interactive = true/, "the reusable map remains interactive by default");
assert.match(coverageMapSource, /role=\{interactive \? "button" : undefined\}/, "display mode removes fake button semantics");
assert.match(coverageSummarySource, /coverageStrengthLabel/, "the shared summary shows the canonical coverage type");
assert.match(coverageSummarySource, /coverageMonitoringFootprint\(state\)/, "the shared summary uses stale-inclusive monitoring-library breadth for every state");
assert.doesNotMatch(coverageSummarySource, /inventoryMonitoredStores|Stores with current inventory signals|current signals/i, "the shared summary omits current state freshness");
assert.equal((coverageSummarySource.match(/<dt>/g) || []).length, 1, "the shared summary keeps one durable monitoring-library count");
assert.match(coverageSummaryStyles, /grid-template-columns:\s*minmax\(0, 1fr\)[\s\S]{0,100}max-width:\s*270px/, "the shared summary stays compact");
assert.match(coverageSummarySource, /Shipment reports show board or area deliveries—not guaranteed shelf stock\./);
assert.match(coveragePanelSource, /<CoverageSummary state=\{state\}/, "the full Coverage page uses the same summary component");
assert.doesNotMatch(coveragePanelSource, /Update status|healthCopy|stateSummary|quickFacts|tracked shipment data|official local pages|stores listed|stores with current availability/i, "the full panel removes the verbose duplicate facts");
assert.match(coveragePanelSource, /<CoverageSearch[\s\S]*Request coverage[\s\S]*How we check this area/, "search, requests, and collapsed methodology remain on the full page");
assert.doesNotMatch(welcomeCoverageSection, /Updates:|healthLabel|data-health|temporarily limited|source updates|boards with recent signals/i, "the coverage summary omits negative or freshness-heavy messaging");
assert.doesNotMatch(welcomeCoverageSection, /coverage explained|ABC boards with shipment information|Official shipment sources|Stores represented|Cities and towns represented|Areas represented|Stores eligible for paid alerts|These counts describe coverage/i, "the previous verbose metrics and explanation are removed");
assert.doesNotMatch(welcomeSource, /Information available here|What you can do here|Stores listed|Stores with restock alerts/);
assert.doesNotMatch(welcomeSource, /Your free account is a preview|Paid unlocks the full feed|Plans start at|See paid options/);
assert.match(requestFormSource, /variant.*welcome/);

assert.match(pricingSource, /Continue with Free/);
assert.match(pricingSource, /intent=paid/);
assert.doesNotMatch(pricingSource, /sign-up\?redirect_url=\/dashboard/, "pricing fallbacks cannot bypass Welcome");
assert.match(pricingSource, /MEMBERSHIP_COMPARISON_ROWS/);
assert.match(pricingSource, /<table><thead>/);
assert.match(pricingSource, /scope="col"/);
assert.match(pricingSource, /scope="row"/);
for (const feature of [
  "Intel feed", "My Shelf", "Bottle lookups", "Alert areas and watched bottles",
  "Push and Community alerts", "Advanced filters and bottle search",
  "Bourbon DNA and recommendations", "Signal Points",
]) {
  assert.ok(pricingTruthSource.includes(feature), `comparison preserves feature: ${feature}`);
}
assert.doesNotMatch(pricingTruthSource, /Bottle Check/, "retired Bottle Check must not be advertised as a membership feature");
assert.match(pricingSource, /value === "✓" \? "Included" : value === "—" \? "Not included" : undefined/);
assert.match(pricingSource, /aria-label=\{comparisonLabel\(free\)\}/);
assert.match(pricingSource, /aria-label=\{comparisonLabel\(member\)\}/);
assert.doesNotMatch(pricingSource, /billing-toggle|Limited lifetime offer/);
assert.match(pricingSource, /@media\(max-width:860px\)[\s\S]*grid-template-columns:1fr/);
assert.match(pricingCatalogSource, /Redeem Signal Points for member rewards/);
assert.match(pricingCatalogSource, /barrel_monthly/);
assert.doesNotMatch(pricingCatalogSource, /standard_monthly/);
assert.match(pricingCatalogSource, /bib_lifetime/);
assert.match(pricingCatalogSource, /monthlyPrice: "\$6"/);
assert.match(pricingSource, /params.has\("canceled"\)[\s\S]*\/welcome/, "a canceled paid signup choosing Free must complete Welcome");
assert.doesNotMatch(dashboardSource, /FreeMemberDashboard/, "free members should use the real dashboard instead of a parallel imitation");
assert.match(dashboardSource, /return <PaidMemberDashboard \/>/, "all entitled members should enter the shared dashboard shell");
assert.match(middlewareSource, /"\/welcome\(\.\*\)"/);

console.log("Member welcome contract passed.");
