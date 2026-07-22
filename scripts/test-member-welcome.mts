import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveSignUpRedirect, contextualProductHref } from "../src/lib/growth-events.ts";

assert.equal(resolveSignUpRedirect(null), "/welcome");
assert.equal(resolveSignUpRedirect("/release-radar?source=release_radar"), "/release-radar?source=release_radar");
assert.equal(resolveSignUpRedirect("//evil.example"), "/welcome");
assert.equal(contextualProductHref("pricing", "drop_feed"), "/pricing?source=drop_feed");

const [authSource, signUpSource, welcomeSource, pricingSource, dashboardSource, freeDashboardSource, middlewareSource] = await Promise.all([
  readFile(new URL("../src/lib/auth.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/sign-up/[[...sign-up]]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/welcome/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/pricing/PricingPageClient.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/dashboard/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/dashboard/FreeMemberDashboard.tsx", import.meta.url), "utf8").catch(() => ""),
  readFile(new URL("../src/middleware.ts", import.meta.url), "utf8"),
]);

assert.match(authSource, /window\.location\.href = "\/sign-up"/);
assert.doesNotMatch(authSource, /redirect_url=\/pricing/);
assert.match(signUpSource, /resolveSignUpRedirect/);
assert.match(welcomeSource, /Your free Bourbon Signal account is ready/);
assert.match(welcomeSource, /href="\/dashboard"/);
assert.doesNotMatch(welcomeSource, /href="\/drops"/);
assert.match(pricingSource, /Continue with Free/);
assert.match(pricingSource, /\/sign-up\?redirect_url=%2Fwelcome|\/sign-up/);
assert.match(dashboardSource, /isFreeTier[\s\S]*?<FreeMemberDashboard/);
assert.match(freeDashboardSource, /Your free dashboard/);
assert.match(freeDashboardSource, /Bottle Checks remaining/);
assert.match(freeDashboardSource, /Latest signals/);
assert.match(freeDashboardSource, /Getting started/);
assert.match(freeDashboardSource, /Unlock alerts when you are ready/);
assert.match(middlewareSource, /"\/welcome\(\.\*\)"/);

console.log("Member welcome contract passed.");
