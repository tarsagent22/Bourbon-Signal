import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const route = read("src/app/api/sightings/route.ts");
const client = read("src/app/sightings/SightingsClient.tsx");
const hook = read("src/hooks/useSightings.ts");
const dropFeed = read("src/components/sections/DropFeed.tsx");
const packageJson = JSON.parse(read("package.json"));

const repository = read("src/lib/community-sightings-repository.ts");
const migration = read("scripts/migrate-community-sightings-to-neon.ts");

assert.doesNotMatch(route, /unstable_cache|cache\(/, "Clerk request helpers must not run inside Next persistent-cache scope");
assert.match(route, /LEGACY_COMMUNITY_CACHE_TTL_MS\s*=\s*5 \* 60 \* 1_000/, "legacy fallback actions should retain a bounded warm-instance cache");
assert.match(route, /if \(legacyCommunityInFlight\) return legacyCommunityInFlight/, "concurrent legacy fallback actions should share in-flight work");
assert.match(repository, /listSightingsForReporter[\s\S]*reporter_user_id = \$1/, "reward reconciliation should query exhaustive durable owner history");
assert.match(repository, /WITH recent AS MATERIALIZED[\s\S]*LIMIT \$1[\s\S]*SELECT recent\.payload/, "the initial feed should materialize its bounded page before follow-up work");
assert.doesNotMatch(repository, /LEFT JOIN LATERAL/, "the feed query must not aggregate every historical vote before LIMIT");
assert.match(repository, /listVotesForSightings[\s\S]*sighting_id = ANY\(\$1::text\[\]\)/, "votes should be loaded only for visible sighting IDs");
assert.match(repository, /countSightingsByIds[\s\S]*id = ANY\(\$1::text\[\]\)/, "legacy fallback totals should count durable overlap by indexed IDs");

const getStart = route.indexOf("export async function GET");
const postStart = route.indexOf("export async function POST");
const getBody = route.slice(getStart, postStart);
assert.match(getBody, /const includeRewards = ownerPointsPreview && url\.searchParams\.get\("rewards"\) !== "0"/);
assert.match(getBody, /verifiedPrimaryClerkEmail\(user\)/, "reward summaries must require the verified owner identity");
assert.match(getBody, /getAggregateSightings\(userId, \{ includeOwned: includeRewards, limit: feedLimit \}\)/);
assert.match(route, /COMMUNITY_SIGHTINGS_DURABLE_CUTOVER\.completed/,
  "the GET cutover must be gated by an explicit verified migration marker");
assert.match(route, /Math\.min\(limit, 1_000\)/,
  "the aggregate should honor the advertised load-more ceiling");
assert.match(getBody, /if \(includeRewards\) \{[\s\S]*getBourbonBible\(\)/, "feed-only calls should skip reward catalog work");

assert.match(client, /const \[feedLimit, setFeedLimit\] = useState\(60\)/);
assert.match(client, /includePreferences: false, includeRewards: false, feedLimit/);
assert.match(client, /Load more sightings/);
assert.match(client, /sightings\.length < totalSightings && feedLimit < 1_000/, "load more should stop cleanly at the advertised ceiling");
assert.match(client, /setFeedLimit\(\(current\) => Math\.min\(current \+ 60, 1_000\)\)/);
assert.match(hook, /params\.set\("limit", String\(Math\.max\(1, Math\.min\(feedLimit, 1_000\)\)\)\)/);
assert.match(dropFeed, /useSightings\(isSignedIn && canReadSightings, \{ feedLimit: 1_000 \}\)/,
  "DropFeed client-side filters must retain the established 1,000-row completeness window");
assert.equal(packageJson.scripts["migrate:community-sightings"], "tsx scripts/migrate-community-sightings-to-neon.ts");
assert.equal(packageJson.scripts["migrate:community-sightings:apply"], "tsx scripts/migrate-community-sightings-to-neon.ts --apply");
assert.doesNotMatch(migration, /^#!\/usr\/bin\/env node/m,
  "the TypeScript migration must not advertise unsupported direct Node execution");
assert.match(migration, /process\.argv\.includes\("--apply"\)/);
assert.match(migration, /insertSightingIfAbsent/);
assert.match(migration, /setVote/);

assert.match(route, /after\(\(\) => persistMemberRewardsBestEffort/, "reward persistence should remain post-response");
const persistedSightingIndex = route.indexOf("const savedSighting = await repository.insertSighting(sighting);");
const deferredRewardIndex = route.indexOf("after(async () =>", persistedSightingIndex);
assert.ok(persistedSightingIndex >= 0 && deferredRewardIndex > persistedSightingIndex,
  "POST must persist the sighting before deferred reward work");
assert.doesNotMatch(route, /await client\.users\.updateUserMetadata\(userId, \{ privateMetadata: \{ memberRewards: nextRewards \} \}\)/, "reward persistence should not block a request inline");
assert.match(route, /let target = await repository\.getSighting\(sightingId\)/,
  "voting should resolve durable sightings directly regardless of feed page");
assert.match(route, /getAggregateSightings\(userId, \{ requireLegacy: true, limit: 1_000 \}\)/,
  "legacy vote fallback should remain explicit behind the durable lookup");

console.log("Sightings performance contracts passed.");
