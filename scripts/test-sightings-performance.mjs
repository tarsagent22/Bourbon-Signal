import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const route = read("src/app/api/sightings/route.ts");
const client = read("src/app/sightings/SightingsClient.tsx");
const dashboard = read("src/app/dashboard/page.tsx");
const repository = read("src/lib/community-sightings-repository.ts");

assert.doesNotMatch(
  route,
  /unstable_cache/,
  "Clerk server helpers read request headers and must not execute inside a Next persistent-cache scope",
);
assert.match(
  route,
  /const LEGACY_COMMUNITY_CACHE_TTL_MS = 5 \* 60 \* 1_000;/,
  "legacy community metadata should use a bounded five-minute warm-instance cache",
);
assert.match(
  repository,
  /listSightingsForReporter\(reporterUserId: string\)[\s\S]*?WHERE reporter_user_id = \$1[\s\S]*?ORDER BY created_at DESC/,
  "reward reconciliation must have an exhaustive owner-scoped durable query instead of the capped public feed",
);
assert.match(
  route,
  /let legacyCommunityInFlight: Promise<LegacyCommunitySnapshot> \| null = null;/,
  "concurrent cache misses should share one Clerk pagination request",
);
assert.match(
  route,
  /async function getAggregateSightings[\s\S]*?readCachedLegacyCommunitySnapshot\(\)[\s\S]*?repository\.listSightings\(\)[\s\S]*?repository\.listVotes\(\)/,
  "the feed should combine the cached legacy snapshot with fresh durable sightings and votes",
);

const getHandler = route.match(/export async function GET\(req: NextRequest\) \{([\s\S]*?)\r?\n\}\r?\n\r?\nexport async function POST/);
assert.ok(getHandler, "GET handler should remain discoverable");
const getBody = getHandler[1];
assert.doesNotMatch(
  getBody,
  /createCommunitySightingsRepository\(\)\.listSightings\(\)/,
  "GET must reuse the durable sightings already loaded for the feed instead of querying them again for rewards",
);
assert.match(
  getBody,
  /after\(\(\) => persistMemberRewardsBestEffort\(client, userId, nextRewards\)\)/,
  "GET should defer one-time reward migrations until after the response",
);
assert.doesNotMatch(
  getBody,
  /await persistMemberRewardsBestEffort/,
  "GET reward migration must never block feed hydration on a Clerk write",
);

assert.match(
  client,
  /useState<"submit" \| "feed">\("feed"\)/,
  "ordinary visits should open the lightweight Feed tab instead of eagerly constructing the submission form",
);
assert.match(
  client,
  /useBottles\(activeTab === "submit" && optimisticMemberAccess\)/,
  "the bottle catalog should load only when the member opens the Submit tab",
);
assert.match(
  client,
  /useStores\(activeTab === "submit" && authLoaded && isSignedIn && canSubmitSightings\)/,
  "the large exact-store directory should load only when the member opens the Submit tab",
);
assert.match(
  client,
  /useSightings\(authLoaded && isSignedIn && canReadSightings, \{ includePreferences: false \}\)/,
  "the Sightings page should not block feed hydration on unrelated signal-report preferences",
);
assert.match(
  client,
  /if \(tab === "submit" \|\| bottle \|\| bottleId \|\| store\) setActiveTab\("submit"\)/,
  "deep links that prefill a bottle or store should still open the submission form",
);
assert.match(
  dashboard,
  /href="\/sightings\?tab=submit"/,
  "the dashboard submission CTA should preserve its submit-form intent",
);

const patchHandler = route.match(/export async function PATCH\(req: NextRequest\) \{([\s\S]*?)\r?\n\}/);
assert.ok(patchHandler, "could not isolate the Member Sightings PATCH handler");
assert.match(
  patchHandler[1],
  /client\.users\.getUser\(target\.reporterUserId\)[\s\S]*submittedSightings\.find\([\s\S]*repository\.insertSightingIfAbsent/,
  "legacy migration must re-read the owner's current moderation state before persisting a cached row",
);

console.log("Member Sightings performance contract passed.");
