import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TIER_ENTITLEMENTS } from "../src/lib/entitlements.ts";

assert.equal(TIER_ENTITLEMENTS.free.sightingsPreviewLimit, null, "Free members can read the complete Community feed");
for (const tier of ["standard", "barrel", "bottled-in-bond"] as const) {
  assert.equal(TIER_ENTITLEMENTS[tier].sightingsPreviewLimit, null, `${tier} should retain the full Member Sightings feed`);
}
assert.equal(TIER_ENTITLEMENTS.free.feedPreviewLimit, 6, "Free Intel has a six-card preview");

const api = readFileSync("src/app/api/sightings/route.ts", "utf8");
assert.match(api, /const previewLimit = entitlements\.sightingsPreviewLimit/);
assert.match(api, /allSightings\.slice\(0, previewLimit\)/, "the server must enforce the preview before returning sightings");

const hook = readFileSync("src/hooks/useSightings.ts", "utf8");
assert.match(hook, /next\.slice\(0, previewLimit\)/, "submitting a sighting must not expand a Free member's local preview past two items");

const client = readFileSync("src/app/sightings/SightingsClient.tsx", "utf8");
assert.match(client, /entitlements\.sightingsPreviewLimit/);
assert.doesNotMatch(client, /Free members can preview the two newest reports/);

console.log("Full Community access and six-card Intel preview contract passed.");
