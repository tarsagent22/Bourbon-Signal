import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createSignalFeedHandler } from "../src/lib/signals/signal-route.ts";
import { sortDropsByCanonicalSignalOrder } from "../src/lib/signals/signal-contract.ts";
import { decodeDropCursor } from "../src/lib/drop-cursor.ts";
import { createSignalApiClient } from "../src/lib/signals/signal-api-client.ts";
import { buildSignalMemberProfile } from "../src/lib/signals/signal-api-contract.ts";
import { canUseMemberSightingBoundary } from "../src/lib/signals/sighting-pagination-policy.ts";
import { buildWeeklyMarketSummaries } from "../src/lib/signals/signal-market-summary.ts";

const drops = [
  { id: "drop-1", canonical_name: "Bottle 1", observed_at: "2026-08-21T12:00:00.000Z", state: "NC" },
  { id: "drop-2", canonical_name: "Bottle 2", observed_at: "2026-08-21T10:00:00.000Z", state: "NC" },
  { id: "drop-3", canonical_name: "Bottle 3", observed_at: "2026-08-21T08:00:00.000Z", state: "NC" },
];
const sightings = [
  { id: "member-1", bottleName: "Member Bottle 1", storeId: "store-1", storeName: "Store 1", storeAddress: "1 Main St", storeState: "NC", source: "custom", createdAt: "2026-08-21T11:00:00.000Z" },
  { id: "member-2", bottleName: "Member Bottle 2", storeId: "store-2", storeName: "Store 2", storeAddress: "2 Main St", storeState: "NC", source: "custom", createdAt: "2026-08-21T09:00:00.000Z" },
  { id: "member-3", bottleName: "Member Bottle 3", storeId: "store-3", storeName: "Store 3", storeAddress: "3 Main St", storeState: "NC", source: "custom", createdAt: "2026-08-21T07:00:00.000Z" },
] as const;

const weeklySummaries = buildWeeklyMarketSummaries([
  { id: "nc-1", canonical_name: "Eagle Rare 10 Year", state: "NC", observed_at: "2026-08-22T12:00:00.000Z" },
  { id: "nc-2", canonical_name: "Russell's Reserve 13", state: "NC", observed_at: "2026-08-21T12:00:00.000Z" },
  { id: "nc-3", canonical_name: "Eagle Rare 10 Year", state: "NC", observed_at: "2026-08-20T12:00:00.000Z" },
  { id: "sc-1", canonical_name: "Blanton's", state: "SC", observed_at: "2026-08-19T12:00:00.000Z" },
  { id: "old", canonical_name: "Old Bottle", state: "VA", observed_at: "2026-08-01T12:00:00.000Z" },
], { now: "2026-08-23T00:00:00.000Z", stateLabels: { NC: "North Carolina", SC: "South Carolina", VA: "Virginia" } });
assert.deepEqual(weeklySummaries, [
  { state: "NC", areaLabel: "North Carolina", signalCount: 3, bottleNames: ["Eagle Rare 10 Year", "Russell's Reserve 13"] },
  { state: "SC", areaLabel: "South Carolina", signalCount: 1, bottleNames: ["Blanton's"] },
]);

let freeMarketSightingsCalled = false;
const freeMarketHandler = createSignalFeedHandler({
  getDrops: async () => Response.json({
    drops: [{ ...drops[0], store_name: "Locked Store", store_address: "1 Secret St" }],
    total: 25,
    requiresAccountForFullFeed: true,
    previewLocked: true,
    marketSummaries: weeklySummaries,
    lastUpdated: "2026-08-23T00:00:00.000Z",
  }),
  getSightings: async () => { freeMarketSightingsCalled = true; return Response.json({ sightings }); },
});
const freeMarket = await freeMarketHandler(new Request("https://www.bourbonsignal.com/api/v1/signals?view=market"));
const freeMarketPayload = await freeMarket.json();
assert.deepEqual(freeMarketPayload.signals, [], "free Market responses must not send exact rows to the client");
assert.deepEqual(freeMarketPayload.marketSummaries, weeklySummaries);
assert.equal(freeMarketPayload.access.marketDetailsLocked, true);
assert.equal(JSON.stringify(freeMarketPayload).includes("Locked Store"), false);
assert.equal(freeMarketSightingsCalled, false, "Market view must not fetch Community sightings");

const freeCombinedPayload = await (await freeMarketHandler(new Request("https://www.bourbonsignal.com/api/v1/signals"))).json();
assert.ok(freeCombinedPayload.signals.every((signal: { source: { type: string } }) => signal.source.type === "member"), "legacy combined view must retain Community while suppressing locked Market rows");
assert.equal(JSON.stringify(freeCombinedPayload).includes("Locked Store"), false, "legacy combined view must not leak locked exact Market details");
assert.equal(freeCombinedPayload.access.marketDetailsLocked, true);

let paidMarketSightingsCalled = false;
const paidMarketHandler = createSignalFeedHandler({
  getDrops: async () => Response.json({ drops, total: drops.length, snapshot: "paid-market", requiresAccountForFullFeed: false, hasMore: false }),
  getSightings: async () => { paidMarketSightingsCalled = true; return Response.json({ sightings }); },
});
const paidMarketPayload = await (await paidMarketHandler(new Request("https://www.bourbonsignal.com/api/v1/signals?view=market"))).json();
assert.ok(paidMarketPayload.signals.every((signal: { source: { type: string } }) => signal.source.type !== "member"));
assert.equal(paidMarketPayload.access.marketDetailsLocked, false);
assert.equal(paidMarketSightingsCalled, false);

let communityDropsCalled = false;
const communityHandler = createSignalFeedHandler({
  getDrops: async () => { communityDropsCalled = true; return Response.json({ drops }); },
  getSightings: async () => Response.json({ sightings, totalSightings: sightings.length, previewLimit: null }),
});
const communityPayload = await (await communityHandler(new Request("https://www.bourbonsignal.com/api/v1/signals?view=community"))).json();
assert.ok(communityPayload.signals.every((signal: { source: { type: string } }) => signal.source.type === "member"));
assert.equal(communityPayload.access.marketDetailsLocked, false);
assert.equal(communityDropsCalled, false, "Community view must not fetch locked Market rows");

const unsupportedView = await communityHandler(new Request("https://www.bourbonsignal.com/api/v1/signals?view=social"));
assert.equal(unsupportedView.status, 400);

const sourceRequests: string[] = [];
const handler = createSignalFeedHandler({
  getDrops: async (request) => {
    sourceRequests.push(request.url);
    const url = new URL(request.url);
    const decoded = decodeDropCursor(url.searchParams.get("cursor"));
    const offset = decoded?.offset ?? Number(url.searchParams.get("offset") || 0);
    const limit = Number(url.searchParams.get("limit") || 40);
    const items = drops.slice(offset, offset + limit);
    return Response.json({
      drops: items,
      total: drops.length,
      snapshot: "drop-snapshot-1",
      offset,
      hasMore: offset + items.length < drops.length,
      previewLocked: false,
      requiresAccountForFullFeed: false,
    });
  },
  getSightings: async (request) => {
    sourceRequests.push(request.url);
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || 40), 1_000);
    const beforeCreatedAt = url.searchParams.get("beforeCreatedAt");
    const beforeId = url.searchParams.get("beforeId");
    const filtered = beforeCreatedAt && beforeId
      ? sightings.filter((item) => item.createdAt < beforeCreatedAt || (item.createdAt === beforeCreatedAt && item.id > beforeId))
      : sightings;
    return Response.json({ sightings: filtered.slice(0, limit), totalSightings: sightings.length });
  },
});

const first = await handler(new Request("https://www.bourbonsignal.com/api/v1/signals?limit=2", { headers: { Authorization: "Bearer mobile-token" } }));
assert.equal(first.status, 200);
const firstPayload = await first.json();
assert.deepEqual(firstPayload.signals.map((signal: { id: string }) => signal.id), ["trusted_source:drop-1", "member:member-1"]);
assert.equal(typeof firstPayload.nextCursor, "string", "a full authenticated page must return an opaque cursor");
assert.equal(firstPayload.hasMore, true);
const crossViewCursor = await handler(new Request(`https://www.bourbonsignal.com/api/v1/signals?view=community&limit=2&cursor=${encodeURIComponent(firstPayload.nextCursor)}`));
assert.equal(crossViewCursor.status, 400, "a cursor must not be reusable across feed views");
assert.equal((await crossViewCursor.json()).error.code, "INVALID_CURSOR");

const second = await handler(new Request(`https://www.bourbonsignal.com/api/v1/signals?limit=2&cursor=${encodeURIComponent(firstPayload.nextCursor)}`, { headers: { Authorization: "Bearer mobile-token" } }));
assert.equal(second.status, 200);
const secondPayload = await second.json();
assert.deepEqual(secondPayload.signals.map((signal: { id: string }) => signal.id), ["trusted_source:drop-2", "member:member-2"]);
assert.equal(new Set([...firstPayload.signals, ...secondPayload.signals].map((signal: { id: string }) => signal.id)).size, 4, "adjacent pages must not duplicate Signals");
assert.ok(sourceRequests.some((value) => new URL(value).searchParams.has("cursor")), "the combined cursor must preserve the drop snapshot");
assert.ok(sourceRequests.some((value) => new URL(value).pathname === "/api/drops" && new URL(value).searchParams.get("signalOrder") === "canonical"), "the combined feed must request drops in canonical display order");
assert.ok(sourceRequests.some((value) => Number(new URL(value).searchParams.get("limit") || 0) >= 3), "member pagination must advance its own consumed offset");

const third = await handler(new Request(`https://www.bourbonsignal.com/api/v1/signals?limit=2&cursor=${encodeURIComponent(secondPayload.nextCursor)}`, { headers: { Authorization: "Bearer mobile-token" } }));
assert.equal(third.status, 200);
const thirdPayload = await third.json();
assert.deepEqual(thirdPayload.signals.map((signal: { id: string }) => signal.id), ["trusted_source:drop-3", "member:member-3"]);
assert.equal(thirdPayload.nextCursor, null);
assert.equal(thirdPayload.hasMore, false);

const scheduledDrops = [
  { id: "release-later-event", canonical_name: "Later Event", event_type: "scheduled_release", event_at: "2026-09-02T12:00:00.000Z", created_at: "2026-08-20T08:00:00.000Z", observed_at: "2026-09-02T12:00:00.000Z", state: "NC" },
  { id: "release-newer-report", canonical_name: "Newer Report", event_type: "scheduled_release", event_at: "2026-09-01T12:00:00.000Z", created_at: "2026-08-21T08:00:00.000Z", observed_at: "2026-09-01T12:00:00.000Z", state: "NC" },
];
const scheduledHandler = createSignalFeedHandler({
  getDrops: async (request) => {
    const url = new URL(request.url);
    const decoded = decodeDropCursor(url.searchParams.get("cursor"));
    const offset = decoded?.offset ?? Number(url.searchParams.get("offset") || 0);
    const limit = Number(url.searchParams.get("limit") || 40);
    const ordered = url.searchParams.get("signalOrder") === "canonical"
      ? sortDropsByCanonicalSignalOrder([...scheduledDrops])
      : scheduledDrops;
    const items = ordered.slice(offset, offset + limit);
    return Response.json({ drops: items, total: ordered.length, snapshot: "scheduled-snapshot", hasMore: offset + items.length < ordered.length });
  },
  getSightings: async () => Response.json({ sightings: [], totalSightings: 0 }),
});
const scheduledFirst = await scheduledHandler(new Request("https://www.bourbonsignal.com/api/v1/signals?limit=1"));
const scheduledFirstPayload = await scheduledFirst.json();
const scheduledSecond = await scheduledHandler(new Request(`https://www.bourbonsignal.com/api/v1/signals?limit=1&cursor=${encodeURIComponent(scheduledFirstPayload.nextCursor)}`));
const scheduledIds = [...scheduledFirstPayload.signals, ...(await scheduledSecond.json()).signals].map((signal: { id: string }) => signal.id);
assert.deepEqual(scheduledIds, ["release_source:release-newer-report", "release_source:release-later-event"], "scheduled drops must paginate once each in canonical displayed-time order");
assert.equal(new Set(scheduledIds).size, scheduledIds.length, "scheduled drop pages must not duplicate a consumed row");

const invalid = await handler(new Request("https://www.bourbonsignal.com/api/v1/signals?limit=2&cursor=not-a-cursor"));
assert.equal(invalid.status, 400);
const invalidPayload = await invalid.json();
assert.equal(invalidPayload.error.code, "INVALID_CURSOR");

const clientRequests: Request[] = [];
const client = createSignalApiClient({
  baseUrl: "https://www.bourbonsignal.com",
  getToken: async () => "mobile-token",
  fetch: async (request) => {
    clientRequests.push(request);
    if (request.url.includes("/api/v1/me/profile")) return Response.json({ contractVersion: "bourbon-signal/mobile-api@1", profile: {} });
    return Response.json({ contractVersion: "bourbon-signal/signal@1", signals: [], total: 0, sources: { drops: "ready", members: "ready" }, nextCursor: null, hasMore: false });
  },
});
await client.listSignals({ limit: 20, cursor: "opaque-next-page" });
await client.getMemberProfile();
assert.equal(new URL(clientRequests[0].url).searchParams.get("cursor"), "opaque-next-page");
assert.equal(new URL(clientRequests[1].url).pathname, "/api/v1/me/profile");
assert.equal(clientRequests[1].headers.get("authorization"), "Bearer mobile-token");

const memberProfile = buildSignalMemberProfile(
  { founderNumber: 19, memberNumber: 88, email: "private@example.com", clerkId: "user_private" },
  { tier: "bottled-in-bond", label: "Bottled in Bond", hasBetaAccess: true, feedPreviewLimit: null, canSubmitSightings: true },
);
assert.equal(memberProfile.profile.identity?.label, "Founder #19", "Founder identity must take precedence without also exposing Member identity");
assert.deepEqual(memberProfile.profile.entitlements, { fullFeed: true, canSubmitSignals: true });
assert.equal(JSON.stringify(memberProfile).includes("private@example.com"), false);
assert.equal(JSON.stringify(memberProfile).includes("user_private"), false);

const continuationBoundary = { createdAt: "2026-08-21T12:00:00.000Z", id: "member-1" };
assert.equal(canUseMemberSightingBoundary(null, continuationBoundary), true, "full-feed members may continue with a stable keyset");
assert.equal(canUseMemberSightingBoundary(5, continuationBoundary), false, "preview access must not enumerate older windows with forged boundaries");
assert.equal(canUseMemberSightingBoundary(5, null), true, "preview access may still read its first bounded page");

const degradedHandler = createSignalFeedHandler({
  getDrops: async () => Response.json({ error: "temporary" }, { status: 503 }),
  getSightings: async () => Response.json({ sightings, total: sightings.length }),
});
const degraded = await degradedHandler(new Request("https://www.bourbonsignal.com/api/v1/signals?limit=2"));
const degradedPayload = await degraded.json();
assert.equal(degradedPayload.degraded, true);
assert.equal(degradedPayload.nextCursor, null, "a partial-source page must not issue a cursor that can reorder recovered source data");

const accountPreviewHandler = createSignalFeedHandler({
  getDrops: async () => Response.json({
    drops: drops.slice(0, 2),
    total: drops.length,
    snapshot: "preview-drop-snapshot",
    hasMore: true,
    previewLocked: false,
    requiresAccountForFullFeed: true,
  }),
  getSightings: async () => Response.json({ sightings: sightings.slice(0, 2), totalSightings: sightings.length }),
});
const accountPreview = await accountPreviewHandler(new Request("https://www.bourbonsignal.com/api/v1/signals?limit=1"));
const accountPreviewPayload = await accountPreview.json();
assert.equal(accountPreviewPayload.access.requiresAccountForFullFeed, true);
assert.equal(accountPreviewPayload.hasMore, false, "account-limited feeds must not advertise an unusable continuation");
assert.equal(accountPreviewPayload.nextCursor, null, "account-limited feeds must not issue a continuation cursor");

function memberFeedHandler(items: Array<Record<string, unknown>>) {
  return createSignalFeedHandler({
    getDrops: async () => Response.json({ drops: [], total: 0, snapshot: "empty-drop-snapshot", hasMore: false }),
    getSightings: async (request) => {
      const url = new URL(request.url);
      const limit = Math.min(Number(url.searchParams.get("limit") || 40), 1_000);
      const beforeCreatedAt = url.searchParams.get("beforeCreatedAt");
      const beforeId = url.searchParams.get("beforeId");
      const filtered = beforeCreatedAt && beforeId
        ? items.filter((item) => String(item.createdAt) < beforeCreatedAt || (String(item.createdAt) === beforeCreatedAt && String(item.id) > beforeId))
        : items;
      return Response.json({ sightings: filtered.slice(0, limit), totalSightings: items.length });
    },
  });
}

const largeSightings = Array.from({ length: 1_005 }, (_, index) => ({
  id: `bulk-${String(1_005 - index).padStart(4, "0")}`,
  bottleName: `Bulk Bottle ${index}`,
  storeId: `bulk-store-${index}`,
  storeName: "Bulk Store",
  storeAddress: "1 Main St",
  storeState: "NC",
  source: "custom",
  createdAt: new Date(Date.UTC(2026, 7, 21, 12, 0, 0) - index * 1_000).toISOString(),
}));
const largeHandler = memberFeedHandler(largeSightings);
const pagedIds: string[] = [];
let largeCursor: string | null = null;
for (let page = 0; page < 20; page += 1) {
  const pageResponse = await largeHandler(new Request(`https://www.bourbonsignal.com/api/v1/signals?limit=100${largeCursor ? `&cursor=${encodeURIComponent(largeCursor)}` : ""}`));
  const pagePayload = await pageResponse.json();
  pagedIds.push(...pagePayload.signals.map((signal: { id: string }) => signal.id));
  largeCursor = pagePayload.nextCursor;
  if (!largeCursor) break;
}
assert.equal(pagedIds.length, 1_005, "member keyset pagination must continue beyond the legacy 1,000-row source cap");
assert.equal(new Set(pagedIds).size, 1_005);

const mutableSightings = largeSightings.slice(0, 6);
const stableHandler = memberFeedHandler(mutableSightings);
const stableFirst = await stableHandler(new Request("https://www.bourbonsignal.com/api/v1/signals?limit=2"));
const stableFirstPayload = await stableFirst.json();
mutableSightings.splice(1, 0, { ...mutableSightings[1], id: "inserted-between-pages", createdAt: new Date(Date.parse(String(mutableSightings[0].createdAt)) - 500).toISOString() });
const stableSecond = await stableHandler(new Request(`https://www.bourbonsignal.com/api/v1/signals?limit=2&cursor=${encodeURIComponent(stableFirstPayload.nextCursor)}`));
const stableSecondPayload = await stableSecond.json();
const stableIds = [...stableFirstPayload.signals, ...stableSecondPayload.signals].map((signal: { id: string }) => signal.id);
assert.equal(new Set(stableIds).size, stableIds.length, "insertions before the member keyset boundary must not duplicate already-consumed Signals");
assert.ok(stableIds.includes(`member:${largeSightings[2].id}`), "the next original member Signal must not be skipped");

const tieTimestamp = "2026-08-21T12:00:00.000Z";
const tiedSightings = ["c", "b", "a"].map((id) => ({ ...largeSightings[0], id: `tie-${id}`, createdAt: tieTimestamp }));
const tieHandler = memberFeedHandler(tiedSightings);
const tieFirst = await tieHandler(new Request("https://www.bourbonsignal.com/api/v1/signals?limit=2"));
const tieFirstPayload = await tieFirst.json();
const tieSecond = await tieHandler(new Request(`https://www.bourbonsignal.com/api/v1/signals?limit=2&cursor=${encodeURIComponent(tieFirstPayload.nextCursor)}`));
const tieIds = [...tieFirstPayload.signals, ...(await tieSecond.json()).signals].map((signal: { id: string }) => signal.id);
assert.deepEqual(tieIds, ["member:tie-a", "member:tie-b", "member:tie-c"], "member keyset tie-breaking must match canonical Signal ordering");

assert.equal(existsSync("src/app/api/v1/me/profile/route.ts"), true, "the app needs a minimal authenticated member-state endpoint");
const memberPreferencesRoute = readFileSync("src/app/api/user/preferences/route.ts", "utf8");
assert.match(memberPreferencesRoute, /canUseCollection: entitlements\.canUseCollection/, "the preferences response must expose the canonical collection entitlement to native clients");
assert.equal(existsSync("apps/mobile/app.json"), true, "the Expo shell must exist");
const nativeSignIn = readFileSync("apps/mobile/app/index.tsx", "utf8");
assert.match(nativeSignIn, /<Redirect href="\/\(app\)\/\(tabs\)" \/>/, "signed-in members must land on the actual tab navigator route");
assert.equal(existsSync("apps/mobile/app/_layout.tsx"), true, "the Expo Router root must exist");
assert.equal(existsSync("apps/mobile/app/(app)/(tabs)/index.tsx"), true, "the authenticated feed route must exist");
assert.equal(existsSync("apps/mobile/app/(app)/signal/[id].tsx"), true, "the Signal detail route must exist");
for (const route of ["radar", "post", "cellar", "hq"]) {
  assert.equal(existsSync(`apps/mobile/app/(app)/(tabs)/${route}.tsx`), true, `the native ${route} route must exist`);
}
assert.equal(existsSync("apps/mobile/app/(app)/(tabs)/account.tsx"), false, "HQ must replace the duplicate account tab");
const mobileApiHook = readFileSync("apps/mobile/src/hooks/useMobileApi.ts", "utf8");
assert.match(mobileApiHook, /const getTokenRef = useRef\(getToken\)/, "Clerk token callback churn must not recreate the API client");
assert.match(mobileApiHook, /getToken: \(\) => getTokenRef\.current\(\)/, "the stable API client must call Clerk's latest token callback");
const mobileApiClient = readFileSync("apps/mobile/src/api/client.ts", "utf8");
assert.match(mobileApiClient, /recentReads\.get\(key\)/, "native GET requests must have a circuit breaker against remount storms");
const nativeSignalFeed = readFileSync("apps/mobile/app/(app)/(tabs)/index.tsx", "utf8");
assert.match(nativeSignalFeed, /radio-tower/);
assert.match(nativeSignalFeed, /account-group-outline/);
assert.match(nativeSignalFeed, />Market</);
assert.match(nativeSignalFeed, />Community</);
assert.match(nativeSignalFeed, /requestInFlightRef\.current/, "feed requests need a synchronous in-flight guard so refresh and pagination cannot race");
assert.doesNotMatch(nativeSignalFeed, /LIVE MEMBER INTELLIGENCE/);
assert.doesNotMatch(nativeSignalFeed, /[\u{1F300}-\u{1FAFF}]/u, "the segmented control must use designed vector icons, not emoji");
for (const route of ["index", "radar", "post", "cellar"]) {
  assert.doesNotMatch(readFileSync(`apps/mobile/app/(app)/(tabs)/${route}.tsx`, "utf8"), /await signOut\(/, `native ${route} data errors must not destroy the member session`);
}
const mobilePackage = JSON.parse(readFileSync("apps/mobile/package.json", "utf8"));
assert.ok(mobilePackage.dependencies["@clerk/expo"]);
assert.ok(mobilePackage.dependencies["@expo/vector-icons"]);
assert.ok(mobilePackage.dependencies["expo-crypto"]);
assert.ok(mobilePackage.dependencies["expo-font"]);
assert.ok(mobilePackage.dependencies["expo-secure-store"]);
assert.ok(mobilePackage.scripts.typecheck);

console.log("Native thin-slice contract passed.");
