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

assert.match(authSource, /window\.location\.href = "\/sign-up"/);
assert.doesNotMatch(authSource, /redirect_url=\/pricing/);
assert.match(signUpSource, /resolveSignUpRedirect/);
assert.match(welcomeSource, /Your free Bourbon Signal account is ready/);
assert.match(welcomeSource, /href="\/dashboard"/);
assert.match(welcomeSource, /Upgrade membership[\s\S]*Continue with my free account/, "the glowing upgrade action must appear above the quieter free continuation");
assert.match(welcomeSource, /href="\/pricing\?source=welcome" className=\{styles\.primaryAction\}>Upgrade membership/);
assert.match(welcomeSource, /href="\/dashboard" className=\{styles\.secondaryAction\}>Continue with my free account/);
assert.doesNotMatch(welcomeSource, /href="\/drops"/);
assert.match(pricingSource, /Continue with Free/);
assert.match(pricingSource, /\/sign-up\?redirect_url=%2Fwelcome|\/sign-up/);
assert.doesNotMatch(dashboardSource, /FreeMemberDashboard/, "free members should use the real dashboard instead of a parallel imitation");
assert.match(dashboardSource, /return <PaidMemberDashboard \/>/, "all entitled members should enter the shared dashboard shell");
assert.match(dashboardSource, /isFreeTier[\s\S]*?Free access includes 7 recent signals, 3 Bottle Checks, and Member Sightings/, "the shared dashboard must explain the real free entitlements");
assert.doesNotMatch(dashboardSource, /Your free dashboard|Free member dashboard/, "free access must not look like a separate imitation product");
assert.match(dashboardSource, />\s*Member Dashboard\s*<\/h1>/, "free and paid members should share the real dashboard identity");
assert.match(dashboardSource, /Upgrade membership/);
assert.match(middlewareSource, /"\/welcome\(\.\*\)"/);

console.log("Member welcome contract passed.");
