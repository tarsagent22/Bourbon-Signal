import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GROWTH_EVENT_NAMES,
  normalizeGrowthAttribution,
  sanitizeGrowthEvent,
  mergeFirstTouch,
  mergeGrowthMilestoneMetadata,
} from "../src/lib/growth-events.ts";

assert.deepEqual(normalizeGrowthAttribution({
  surface: "release-radar",
  utm_source: "Newsletter",
  utm_medium: "Email",
  utm_campaign: "July Launch",
  referrer: "https://example.com/story?email=member@example.com",
}), {
  surface: "release_radar",
  campaign: "newsletter:email:july-launch",
  referrerHost: "example.com",
});
assert.deepEqual(normalizeGrowthAttribution({
  surface: "sign-up",
  utm_source: "meta",
  utm_medium: "paid_social",
  utm_campaign: "State Preview",
}), {
  surface: "sign_up",
  campaign: "meta:paid_social:state-preview",
  referrerHost: "unknown",
});
assert.deepEqual(normalizeGrowthAttribution({
  surface: "sign_up",
  campaign: "meta:paid_social:state_preview",
}), {
  surface: "sign_up",
  campaign: "meta:paid_social:state_preview",
  referrerHost: "unknown",
});
assert.deepEqual(normalizeGrowthAttribution({ surface: "unknown<script>", utm_source: "x" }), {
  surface: "unknown",
  campaign: "unknown",
  referrerHost: "unknown",
});
assert.equal(sanitizeGrowthEvent("product_surface_viewed", { surface: "drop_feed" }).surface, "drop_feed");
assert.equal(sanitizeGrowthEvent("product_surface_viewed", { email: "member@example.com" }), null);
assert.equal(sanitizeGrowthEvent("not_an_event", { surface: "pricing" }), null);
assert.equal(sanitizeGrowthEvent("pricing_viewed", { source: "https://evil.example/?q=raw" }), null);
assert.deepEqual(sanitizeGrowthEvent("signup_started", { surface: "sign_up" }), { surface: "sign_up" });
assert.deepEqual(sanitizeGrowthEvent("registration_completed", { surface: "welcome" }), { surface: "welcome" });
assert.deepEqual(sanitizeGrowthEvent("onboarding_state_selected", {
  surface: "welcome",
  kind: "state_selection",
  market: "VA",
}), {
  surface: "welcome",
  kind: "state_selection",
  market: "va",
});
assert.deepEqual(sanitizeGrowthEvent("free_value_reached", {
  surface: "drop_feed",
  kind: "state_feed",
  market: "NC",
}), {
  surface: "drop_feed",
  kind: "state_feed",
  market: "nc",
});
assert.equal(sanitizeGrowthEvent("registration_completed", { provider_id: "user_123" }), null);
assert.equal(sanitizeGrowthEvent("onboarding_state_selected", { exact_location: "123 Main Street" }), null);
assert.equal(sanitizeGrowthEvent("free_value_reached", { url: "/?state=VA#drops" }), null);
assert.deepEqual(sanitizeGrowthEvent("radar_release_followed", {
  surface: "release_radar",
  kind: "release",
  market: "va",
  verification: "official",
}), {
  surface: "release_radar",
  kind: "release",
  market: "va",
  verification: "official",
});
assert.equal(sanitizeGrowthEvent("radar_bottle_tracked", { bottle_name: "Private bottle query" }), null, "Radar analytics must reject bottle names");
assert.equal(sanitizeGrowthEvent("radar_market_handoff", { market: "VA", release_slug: "secret-slug" }), null, "Radar analytics must reject release identifiers");
assert.deepEqual(
  mergeFirstTouch({ surface: "bottle_check", campaign: "direct", referrerHost: "unknown" }, { surface: "pricing", campaign: "newsletter:email:launch", referrerHost: "example.com" }),
  { surface: "bottle_check", campaign: "direct", referrerHost: "unknown" },
);
assert.deepEqual(mergeFirstTouch(null, { surface: "pricing", campaign: "unknown", referrerHost: "unknown" }), { surface: "pricing", campaign: "unknown", referrerHost: "unknown" });
assert.deepEqual(mergeGrowthMilestoneMetadata({ activation: { pricing_viewed: "2026-07-01T00:00:00.000Z" } }, "pricing_viewed", "2026-07-15T00:00:00.000Z"), { activation: { pricing_viewed: "2026-07-01T00:00:00.000Z" } });
assert.deepEqual(mergeGrowthMilestoneMetadata({}, "checkout_started", "2026-07-15T00:00:00.000Z"), { activation: { checkout_started: "2026-07-15T00:00:00.000Z" } });
assert.deepEqual(mergeGrowthMilestoneMetadata({}, "registration_completed", "2026-07-15T00:00:00.000Z"), { activation: { registration_completed: "2026-07-15T00:00:00.000Z" } });

for (const stage of [
  "signup_started",
  "registration_completed",
  "onboarding_state_selected",
  "free_value_reached",
  "pricing_viewed",
  "checkout_started",
  "membership_activated",
  "paid_activation_completed",
  "first_alert_created",
]) {
  assert.ok(GROWTH_EVENT_NAMES.includes(stage as never), `growth event registry missing ${stage}`);
}

const attributionRoute = readFileSync("src/app/api/growth/attribution/route.ts", "utf8");
const growthClient = readFileSync("src/lib/growth-client.ts", "utf8");
const growthAnalytics = readFileSync("src/components/analytics/GrowthAnalytics.tsx", "utf8");
const bottleCheck = readFileSync("src/app/bottle-check/page.tsx", "utf8");
const dropFeed = readFileSync("src/components/sections/DropFeed.tsx", "utf8");
const releaseRadar = readFileSync("src/components/release-radar/CalendarExplorer.tsx", "utf8");
const checkoutContinue = readFileSync("src/app/checkout/continue/page.tsx", "utf8");
assert.match(growthClient, /sanitizeGrowthEvent\(name, properties\)/, "the client recorder must sanitize before analytics or persistence");
assert.match(growthClient, /keepalive:\s*true/, "navigation-triggered milestones must survive the safe value-path handoff");
assert.match(growthClient, /AbortController[\s\S]*2_500[\s\S]*signal:\s*controller\.signal/, "growth persistence must fail closed instead of hanging customer navigation indefinitely");
assert.match(growthClient, /growthPersistenceQueue[\s\S]*\.then\(persist\)/, "authenticated milestone writes must be serialized to avoid metadata races");
assert.match(growthClient, /if \(options\.navigation\)[\s\S]*return persist\(\)/, "navigation milestones must start immediately instead of waiting behind the persistence queue");
assert.match(attributionRoute, /SIGNUP_COOKIE[\s\S]*httpOnly:\s*true/);
const clientMilestoneAllowlist = attributionRoute.match(/ALLOWED_MILESTONES[\s\S]*?\(\[([\s\S]*?)\]\)/)?.[1] || "";
assert.doesNotMatch(clientMilestoneAllowlist, /registration_completed/, "registration completion must be webhook-authoritative, not client-writable");
assert.match(attributionRoute, /storedSignupStarted[\s\S]*"signup_started"/);
assert.match(attributionRoute, /if \(!privateMetadata\.firstTouch\) update\.firstTouch = firstTouch/);
assert.match(attributionRoute, /ACTIVE_MARKETS\.has\(market\)/, "persisted onboarding markets must be active state codes");
assert.match(growthAnalytics, /path\.startsWith\("\/welcome"\)[\s\S]*path\.startsWith\("\/dashboard"\)/, "welcome and dashboard must be safe attribution surfaces");
assert.match(bottleCheck, /recordGrowthMilestone\("free_value_reached"[\s\S]*kind:\s*"bottle_check"/);
assert.match(dropFeed, /IntersectionObserver[\s\S]*!isSignedIn[\s\S]*!feedResultsVisible[\s\S]*!pageVisible[\s\S]*kind:\s*"state_feed"[\s\S]*4_000/, "authenticated state feed value requires continuous visible results dwell");
assert.match(dropFeed, /ref=\{feedResultsRef\}[\s\S]*height:\s*"1px"/, "Drop Feed value visibility must use a reachable top-of-results sentinel on tall layouts");
assert.match(dropFeed, /You have seen the latest seven signals\./);
assert.match(dropFeed, /Standard Proof unlocks the full state feed and alerts for the bottles and areas you choose\./);
assert.match(releaseRadar, /onChange=[\s\S]*recordExploration\("calendar_filter"\)/, "Release Radar value must require an explicit interaction");
assert.match(releaseRadar, /!isSignedIn \|\| entitlements\.tier !== "free"/, "anonymous Radar exploration must not count as free-member activation");
assert.match(checkoutContinue, /registrationCompleted[\s\S]*recordGrowthMilestone\("registration_completed", \{ surface: "sign_up" \}\)/, "paid signup continuation must persist registration and first-touch before Stripe");
console.log("Growth event contract passed.");
