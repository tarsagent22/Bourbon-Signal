import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TIER_ENTITLEMENTS } from "../src/lib/entitlements.ts";

assert.equal(TIER_ENTITLEMENTS.free.sightingsPreviewLimit, 2, "Free members may see only the two newest Member Sightings");
for (const tier of ["standard", "barrel", "bottled-in-bond"] as const) {
  assert.equal(TIER_ENTITLEMENTS[tier].sightingsPreviewLimit, null, `${tier} should retain the full Member Sightings feed`);
}
assert.equal(TIER_ENTITLEMENTS.free.feedPreviewLimit, 7, "the separate Drop Feed preview must remain unchanged");

const api = readFileSync("src/app/api/sightings/route.ts", "utf8");
assert.match(api, /const previewLimit = entitlements\.sightingsPreviewLimit/);
assert.match(api, /allSightings\.slice\(0, previewLimit\)/, "the server must enforce the preview before returning sightings");

const hook = readFileSync("src/hooks/useSightings.ts", "utf8");
assert.match(hook, /next\.slice\(0, previewLimit\)/, "submitting a sighting must not expand a Free member's local preview past two items");

const client = readFileSync("src/app/sightings/SightingsClient.tsx", "utf8");
assert.match(client, /entitlements\.sightingsPreviewLimit/);
assert.match(client, /Free members can preview the two newest reports/);
assert.match(client, /Upgrade to see more/);

console.log("Member Sightings two-item preview contract passed.");
