import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();

const {
  PUBLIC_NAVIGATION_LINKS,
  MEMBER_NAVIGATION_LINKS,
  dashboardSectionUrl,
  legacySignalPointsUrl,
  memberNavigationActiveKey,
  dashboardDestinationCopy,
  sightingsTabUrl,
} = await import("../src/lib/member-navigation.ts");

assert.deepEqual(
  PUBLIC_NAVIGATION_LINKS.map(({ label, href }) => ({ label, href })),
  [
    { label: "Feed", href: "/#drops" },
    { label: "Dashboard", href: "/dashboard" },
    { label: "Sightings", href: "/sightings" },
    { label: "Bottle Check", href: "/bottle-check" },
    { label: "Coverage", href: "/coverage" },
  ],
  "signed-out marketing navigation must remain unchanged",
);

assert.deepEqual(
  MEMBER_NAVIGATION_LINKS.map(({ key, label, href }) => ({ key, label, href })),
  [
    { key: "signals", label: "Signals", href: "/#drops" },
    { key: "radar", label: "Radar", href: "/dashboard?section=alerts" },
    { key: "post", label: "Post", href: "/sightings?tab=submit" },
    { key: "cellar", label: "Cellar", href: "/dashboard?section=collection" },
    { key: "hq", label: "HQ", href: "/hq" },
  ],
  "member navigation must reflect the approved core loop",
);

assert.equal(memberNavigationActiveKey("/", ""), "signals");
assert.equal(memberNavigationActiveKey("/dashboard", "section=alerts"), "radar");
assert.equal(memberNavigationActiveKey("/alerts", ""), "radar");
assert.equal(memberNavigationActiveKey("/sightings", "tab=submit"), "post");
assert.equal(memberNavigationActiveKey("/dashboard", "section=collection"), "cellar");
assert.equal(memberNavigationActiveKey("/dashboard", "section=recommendations"), "cellar");
assert.equal(memberNavigationActiveKey("/dashboard", "section=memberPoints"), "hq");
assert.equal(memberNavigationActiveKey("/hq", ""), "hq");
assert.equal(memberNavigationActiveKey("/account/signal-points", ""), "hq");
assert.equal(memberNavigationActiveKey("/settings", ""), "hq");

assert.equal(
  dashboardSectionUrl("https://www.bourbonsignal.com/dashboard?section=recommendations&utm_source=member#tools", "collection"),
  "/dashboard?section=collection&utm_source=member#tools",
);
assert.equal(
  dashboardSectionUrl("https://www.bourbonsignal.com/dashboard?section=collection&utm_source=member#tools", null),
  "/dashboard?utm_source=member#tools",
);
assert.equal(
  sightingsTabUrl("https://www.bourbonsignal.com/sightings?tab=submit&bottle=Stagg&bottleId=42&store=ABC&utm_source=member", "feed"),
  "/sightings?utm_source=member",
);
assert.equal(
  sightingsTabUrl("https://www.bourbonsignal.com/sightings?utm_source=member", "submit"),
  "/sightings?utm_source=member&tab=submit",
);
assert.equal(
  legacySignalPointsUrl("https://www.bourbonsignal.com/dashboard?section=memberPoints&utm_source=email&source=campaign"),
  "/hq?utm_source=email&source=campaign#signal-points",
);

assert.deepEqual(dashboardDestinationCopy("alerts"), {
  eyebrow: "Your radar",
  title: "Radar",
  summary: "Manage saved markets, watched bottles, alert rules, and recent matches.",
});
assert.deepEqual(dashboardDestinationCopy("collection"), {
  eyebrow: "Your bottles",
  title: "Cellar",
  summary: "Track bottles you own or have tasted and shape what Bourbon Signal recommends next.",
});

const navigationSource = await readFile(resolve(root, "src/components/Navigation.tsx"), "utf8");
assert.match(navigationSource, /MEMBER_NAVIGATION_LINKS/);
assert.match(navigationSource, /PUBLIC_NAVIGATION_LINKS/);
assert.match(navigationSource, /aria-label="Member navigation"/);
assert.match(navigationSource, /member-mobile-navigation/);
assert.match(navigationSource, /member-navigation-post/);
assert.match(navigationSource, /--member-mobile-navigation-inset/);
assert.match(navigationSource, /member-navigation-change/);
assert.match(navigationSource, /member-profile-trigger:focus-visible/);
assert.match(navigationSource, /rgba\(245,237,214,0\.64\)/);
assert.match(navigationSource, /!isLoaded\s*\? \[\]/);
assert.match(navigationSource, /mounted && isLoaded/);

const homeServerSource = await readFile(resolve(root, "src/app/page.tsx"), "utf8");
const homeSource = await readFile(resolve(root, "src/app/HomeClient.tsx"), "utf8");
assert.match(homeServerSource, /await auth\(\)/);
assert.match(homeServerSource, /dynamic = "force-dynamic"/);
assert.match(homeServerSource, /initialSignedIn=\{Boolean\(userId\)\}/);
assert.match(homeSource, /const \{ isLoaded, isSignedIn \} = useAuth\(\)/);
assert.match(homeSource, /const member = isLoaded \? isSignedIn : initialSignedIn/);
assert.match(homeSource, /<HomeExperience member=\{member\}/);
assert.doesNotMatch(homeSource, /@clerk\/nextjs/);
assert.doesNotMatch(homeSource, /showMarketingHero/);

const layoutSource = await readFile(resolve(root, "src/app/layout.tsx"), "utf8");
assert.match(layoutSource, /process\.env\.VERCEL_ENV === "production"/);
assert.match(layoutSource, /proxyUrl=\{clerkProxyUrl\}/);

const legacySetupSource = await readFile(resolve(root, "src/components/LegacyMemberSetupPrompt.tsx"), "utf8");
const previewSwitcherSource = await readFile(resolve(root, "src/components/PreviewTierSwitcher.tsx"), "utf8");
assert.match(legacySetupSource, /--member-mobile-navigation-inset/);
assert.match(previewSwitcherSource, /--member-mobile-navigation-inset/);

const middlewareSource = await readFile(resolve(root, "src/middleware.ts"), "utf8");
assert.match(middlewareSource, /"\/hq\(\.\*\)"/);
assert.match(middlewareSource, /searchParams\.get\("section"\) === "memberPoints"/);
assert.match(middlewareSource, /legacySignalPointsUrl\(request\.url\)/);

const dashboardSource = await readFile(resolve(root, "src/app/dashboard/page.tsx"), "utf8");
const sightingsSource = await readFile(resolve(root, "src/app/sightings/SightingsClient.tsx"), "utf8");
assert.match(dashboardSource, /history\.replaceState/);
assert.match(dashboardSource, /member-navigation-change/);
assert.match(sightingsSource, /history\.replaceState/);
assert.match(sightingsSource, /member-navigation-change/);
assert.doesNotMatch(dashboardSource, /prepareDashboardSection\("collection"\);\s*setActiveDashboardSection\("collection"\)/);

const hqSource = await readFile(resolve(root, "src/app/hq/page.tsx"), "utf8");
for (const expected of ["HQ", "SignalPointsPanel", "/referrals", "/settings", "/alerts", "/support"]) {
  assert.ok(hqSource.includes(expected), `HQ must include ${expected}`);
}
for (const expected of [
  "useSightings",
  "preview",
  "rewards={rewards}",
  "rewardsLoading={rewardsLoading}",
  "rewardsError={rewardsError}",
  "badgeIconFor={signalPointsBadgeIcon}",
  "badgeLabelFor={signalPointsBadgeLabel}",
  "badgeDescriptionFor={signalPointsBadgeDescription}",
  "badgeBaseKey={signalPointsBadgeBaseKey}",
]) {
  assert.ok(hqSource.includes(expected), `HQ Signal Points parity requires ${expected}`);
}
assert.match(hqSource, /scroll-margin-top: 96px/);

const badgePresentationSource = await readFile(resolve(root, "src/lib/signal-points-badge-presentation.ts"), "utf8");
assert.match(badgePresentationSource, /verified_scout/);
assert.match(badgePresentationSource, /Helpful Neighbor/);

console.log("Member website experience contract passed.");
