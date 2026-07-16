import assert from "node:assert/strict";
import {
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
assert.deepEqual(normalizeGrowthAttribution({ surface: "unknown<script>", utm_source: "x" }), {
  surface: "unknown",
  campaign: "unknown",
  referrerHost: "unknown",
});
assert.equal(sanitizeGrowthEvent("product_surface_viewed", { surface: "drop_feed" }).surface, "drop_feed");
assert.equal(sanitizeGrowthEvent("product_surface_viewed", { email: "member@example.com" }), null);
assert.equal(sanitizeGrowthEvent("not_an_event", { surface: "pricing" }), null);
assert.equal(sanitizeGrowthEvent("pricing_viewed", { source: "https://evil.example/?q=raw" }), null);
assert.deepEqual(
  mergeFirstTouch({ surface: "bottle_check", campaign: "direct", referrerHost: "unknown" }, { surface: "pricing", campaign: "newsletter:email:launch", referrerHost: "example.com" }),
  { surface: "bottle_check", campaign: "direct", referrerHost: "unknown" },
);
assert.deepEqual(mergeFirstTouch(null, { surface: "pricing", campaign: "unknown", referrerHost: "unknown" }), { surface: "pricing", campaign: "unknown", referrerHost: "unknown" });
assert.deepEqual(mergeGrowthMilestoneMetadata({ activation: { pricing_viewed: "2026-07-01T00:00:00.000Z" } }, "pricing_viewed", "2026-07-15T00:00:00.000Z"), { activation: { pricing_viewed: "2026-07-01T00:00:00.000Z" } });
assert.deepEqual(mergeGrowthMilestoneMetadata({}, "checkout_started", "2026-07-15T00:00:00.000Z"), { activation: { checkout_started: "2026-07-15T00:00:00.000Z" } });
console.log("Growth event contract passed.");
