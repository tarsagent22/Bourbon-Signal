import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SIGNAL_CONTRACT_VERSION,
  buildCanonicalSignalFeed,
  normalizeDropSignal,
  normalizeMemberSightingSignal,
} from "../src/lib/signals/signal-contract.ts";
import { createSignalFeedHandler } from "../src/lib/signals/signal-route.ts";
import { SIGNAL_RARITY_TIERS, normalizeSignalRarities, parseSignalFeedFilters } from "../src/lib/signals/signal-feed-filters.ts";
import { decodeSignalFeedCursor, encodeSignalFeedCursor } from "../src/lib/signals/signal-feed-cursor.ts";
import { communityDisplayNameSeparateFromIdentity } from "../src/lib/community-display-name.ts";

assert.equal(communityDisplayNameSeparateFromIdentity(" Founder #19 ", "Founder #19"), null, "historical tag fallbacks must never survive as a chosen name");
assert.equal(communityDisplayNameSeparateFromIdentity("founder #19", "Founder #19"), null, "tag fallback cleanup is case-insensitive");
assert.equal(communityDisplayNameSeparateFromIdentity("Oak Street Scout", "Founder #19"), "Oak Street Scout");

assert.deepEqual(SIGNAL_RARITY_TIERS, ["limited", "allocated", "unicorn"]);
assert.deepEqual(normalizeSignalRarities(["highly_allocated"]), ["unicorn"], "legacy Highly Allocated filters migrate to Unicorn");
assert.equal(parseSignalFeedFilters(new URL("https://example.test?state=VA&area=Raleigh")).area, "Raleigh");
assert.throws(() => parseSignalFeedFilters(new URL("https://example.test?state=VA&area=%25")), /area is not supported/);
const areaCursor = encodeSignalFeedCursor({
  view: "market",
  dropsOffset: 4,
  dropSnapshot: "snapshot-1",
  memberBoundary: null,
  filters: parseSignalFeedFilters(new URL("https://example.test?state=NC&area=Wake%20County%20ABC&tiers=allocated")),
  asOf: "2026-08-23T12:00:00.000Z",
});
assert.equal(decodeSignalFeedCursor(areaCursor)?.filters.area, "Wake County ABC");
const legacyRarityCursor = Buffer.from(JSON.stringify({
  v: 4,
  fv: "market",
  d: 0,
  ds: null,
  mb: null,
  f: { rarities: ["highly_allocated"], state: null, freshness: null, bottle: null },
  at: "2026-08-23T12:00:00.000Z",
})).toString("base64url");
assert.deepEqual(decodeSignalFeedCursor(legacyRarityCursor)?.filters, {
  rarities: ["unicorn"], state: null, area: null, freshness: null, bottle: null,
}, "legacy v4 cursor filters remain readable but normalize to canonical rarity");

const engineSignal = normalizeDropSignal({
  id: "drop-1",
  availability_episode_id: "episode-drop-1",
  canonical_id: "bottle-1",
  canonical_name: "Example Bourbon",
  event_type: "store_inventory_result",
  source: "inventory-probe-internal",
  state: "NC",
  store_id: "store-1",
  store_name: "Example Spirits",
  store_address: "100 Main St, Raleigh, NC 27601",
  store_city: "Raleigh",
  observed_at: "2026-08-20T20:00:00.000Z",
  last_confirmed_at: "2026-08-20T20:05:00.000Z",
  displayAt: "2026-08-20T20:05:00.000Z",
  availability_scope: "exact",
  confidence_tier: "exact_store",
  can_alert_as_inventory: true,
  quantity_in_stock: 3,
  retail_price: 79.99,
  evidence: "Exact-store inventory response.",
});

assert.equal(engineSignal.contractVersion, SIGNAL_CONTRACT_VERSION);
assert.equal(engineSignal.id, "trusted_source:drop-1");
assert.equal(engineSignal.availabilityEpisodeId, "episode-drop-1");
assert.equal(engineSignal.kind, "availability");
assert.deepEqual(engineSignal.source, { type: "trusted_source", label: "Trusted source" });
assert.deepEqual(engineSignal.bottle, { id: "bottle-1", name: "Example Bourbon" });
assert.equal(engineSignal.location.scope, "exact_store");
assert.equal(engineSignal.location.store?.name, "Example Spirits");
assert.equal(engineSignal.timing.displayAt, "2026-08-20T20:05:00.000Z");
assert.equal(engineSignal.strength, "best");
assert.equal(engineSignal.alertEligibility.inventory, true);
assert.equal(engineSignal.availability?.quantity, 3);
assert.equal(engineSignal.availability?.price, 79.99);
assert.equal(JSON.stringify(engineSignal).includes("inventory-probe-internal"), false, "internal source identifiers must not leak into the Signal contract");
assert.equal(normalizeDropSignal({
  id: "ohlq:item-42",
  bottleName: "Namespaced Bottle",
  state: "OH",
  timestamp: "2026-08-20T20:00:00.000Z",
}).id, "trusted_source:ohlq:item-42", "legacy source namespaces must remain part of canonical IDs");
assert.deepEqual(SIGNAL_RARITY_TIERS, ["limited", "allocated", "unicorn"], "Signal v1 only emits the three approved rarity categories");
assert.deepEqual(normalizeSignalRarities(["highly_allocated", "unicorn"]), ["unicorn"], "legacy rarity aliases collapse to Unicorn");
assert.equal(normalizeDropSignal({
  id: "legacy-rarity",
  bottleName: "Legacy Rarity Bottle",
  rarity_tier: "highly_allocated",
  price: 0,
  state: "NC",
  timestamp: "2026-08-20T20:00:00.000Z",
}).bottle.rarity, "unicorn");
assert.equal(normalizeDropSignal({
  id: "zero-price",
  bottleName: "Zero Price Bottle",
  price: 0,
  state: "NC",
  timestamp: "2026-08-20T20:00:00.000Z",
}).availability?.price, undefined, "zero is unknown, not a public price");

const retailerSignal = normalizeDropSignal({
  id: "retailer:submission-1",
  bottleId: "bottle-2",
  bottleName: "Retailer Pick",
  type: "verified_retailer_barrel_pick",
  source: "verified-retailer",
  retailerReported: true,
  retailerSignalKind: "barrel_pick",
  retailerSignalState: "live",
  state: "SC",
  storeId: "retailer-store-1",
  storeName: "Retailer One",
  storeAddress: "200 Broad St, Greenville, SC 29601",
  observedAt: "2026-08-20T19:00:00.000Z",
  startsAt: "2026-08-20T19:00:00.000Z",
  expiresAt: "2026-08-21T19:00:00.000Z",
  canAlertAsInventory: true,
});
assert.equal(retailerSignal.source.type, "retailer");
assert.equal(retailerSignal.source.label, "Retailer One");
assert.equal(retailerSignal.kind, "availability");
assert.equal(retailerSignal.strength, "best");
assert.equal(retailerSignal.timing.expiresAt, "2026-08-21T19:00:00.000Z");

const releaseSignal = normalizeDropSignal({
  id: "release-1",
  canonicalName: "Future Bourbon",
  type: "scheduled_release",
  signal_category: "release_watch",
  signal_label: "Scheduled release",
  inventoryCaveat: "Release intelligence; not live shelf inventory.",
  source: "release-calendar-internal",
  state: "KY",
  releaseDate: "2026-09-01",
  eventDate: "2026-09-01",
  timestamp: "2026-08-20T18:00:00.000Z",
  canAlertAsInventory: false,
  canAlertAsWatch: true,
});
assert.equal(releaseSignal.source.type, "release_source");
assert.equal(releaseSignal.source.label, "Release source");
assert.equal(releaseSignal.kind, "release");
assert.equal(releaseSignal.alertEligibility.inventory, false);
assert.equal(releaseSignal.alertEligibility.watch, true);
assert.notEqual(releaseSignal.location.scope, "exact_store");
assert.equal(releaseSignal.timing.scheduledFor, "2026-09-01");
assert.equal(releaseSignal.timing.observedAt, undefined, "a scheduled occurrence is not an observation");
assert.equal(releaseSignal.timing.reportedAt, undefined, "a scheduled occurrence is not a report timestamp");
assert.equal(releaseSignal.timing.displayAt, "2026-08-20T18:00:00.000Z", "unified feeds rank releases by when the intelligence appeared, not the future occurrence");

const distilleryAvailability = normalizeDropSignal({
  id: "distillery-1",
  bottleName: "Gift Shop Bourbon",
  type: "distillery_gift_shop_availability",
  releaseDate: "2026-07-18",
  observedAt: "2026-07-16T22:53:59.144Z",
  state: "KY",
  city: "Frankfort",
  zip: "40601",
  storeName: "Distillery Gift Shop",
  locationPrecision: "distillery",
});
assert.equal(distilleryAvailability.kind, "availability", "release metadata on current availability must not turn it into release intelligence");
assert.equal(distilleryAvailability.location.store?.city, "Frankfort");
assert.equal(distilleryAvailability.location.store?.zip, "40601");

const memberSightingInput: Parameters<typeof normalizeMemberSightingSignal>[0] = {
  id: "sighting-1",
  bottleId: "bottle-3",
  bottleName: "Community Bourbon",
  storeId: "store-3",
  storeName: "Community Liquors",
  storeAddress: "300 Main St",
  storeCity: "Charlotte",
  storeState: "NC",
  storeZip: "28202",
  quantityEstimate: "A few bottles",
  price: 64.99,
  notes: "Reported in a local group.",
  source: "custom",
  sightingType: "online_social",
  reporterUserId: "user_secret_123",
  reporterDisplayName: "Private First Name",
  reporterPublicIdentity: { kind: "member", number: 184, label: "Member #184", displayName: "Oak Street Scout" },
  reporterBadges: ["legacy badge"],
  createdAt: "2026-08-20T21:00:00.000Z",
  upCount: 2,
  downCount: 0,
  rewardState: { verificationSources: ["photo"] },
};
const memberSignal = normalizeMemberSightingSignal(memberSightingInput);
assert.equal(memberSignal.id, "member:sighting-1");
assert.equal(memberSignal.source.type, "member");
assert.equal(memberSignal.source.label, "Member #184");
assert.equal(memberSignal.source.reportMode, "reported_online");
assert.equal(memberSignal.source.actor?.displayName, "Oak Street Scout");
assert.equal(memberSignal.strength, "more_activity");
assert.equal(memberSignal.evidence.photo, false, "private reward metadata must not alter the public Signal contract");
assert.equal(memberSignal.evidence.corroborationCount, 0, "helpful votes are not corroboration");
assert.equal(memberSignal.evidence.helpfulCount, 2);
assert.equal(memberSignal.timing.observedAt, undefined, "submission time is not proof of observation time");
assert.equal(memberSignal.timing.reportedAt, "2026-08-20T21:00:00.000Z");
assert.equal(memberSignal.availability?.quantityLabel, "A few bottles");
assert.equal(JSON.stringify(memberSignal).includes("user_secret_123"), false, "private account IDs must never enter the public Signal contract");
assert.equal(JSON.stringify(memberSignal).includes("Private First Name"), false, "legacy first names must not enter the public Signal contract");
const tagOnlySignal = normalizeMemberSightingSignal({
  ...memberSightingInput,
  id: "sighting-tag-only",
  reporterDisplayName: "Member #184",
  reporterPublicIdentity: { kind: "member", number: 184, label: "Member #184", displayName: "Member #184" },
});
assert.equal(tagOnlySignal.source.label, "Member #184");
assert.equal(tagOnlySignal.source.actor?.displayName, undefined, "a numbered identity tag must never be projected as a chosen display name");

const feed = buildCanonicalSignalFeed({
  drops: [releaseSignal, engineSignal, retailerSignal],
  memberSightings: [memberSignal, memberSignal],
});
assert.equal(feed.contractVersion, SIGNAL_CONTRACT_VERSION);
assert.deepEqual(feed.signals.map((signal) => signal.id), ["member:sighting-1", "trusted_source:drop-1", "retailer:submission-1", "release_source:release-1"]);
assert.deepEqual(feed.sources, { drops: "ready", members: "ready" });
assert.equal(feed.total, 4);

const routeSource = readFileSync(new URL("../src/app/api/v1/signals/route.ts", import.meta.url), "utf8");
const routeHandlerSource = readFileSync(new URL("../src/lib/signals/signal-route.ts", import.meta.url), "utf8");
const packageSource = readFileSync(new URL("../package.json", import.meta.url), "utf8");
assert.match(packageSource, /verify:ci[^\n]*test:signal-contract/, "the canonical Signal contract must be part of the shared CI gate");
assert.match(routeSource, /createSignalFeedHandler/);
assert.match(routeSource, /getLegacyDrops/);
assert.match(routeSource, /getLegacySightings/);
assert.match(routeHandlerSource, /memberStatus/);
assert.match(routeHandlerSource, /private, no-store/);

const scopedHandler = createSignalFeedHandler({
  getDrops: async () => Response.json({
    drops: [
      { id: "drop-new", bottleName: "NC Drop", state: "NC", timestamp: "2026-08-20T20:00:00.000Z" },
      { id: "drop-old", bottleName: "Older NC Drop", state: "NC", timestamp: "2026-08-20T18:00:00.000Z" },
    ],
    total: 2,
    lastUpdated: "2026-08-20T20:00:00.000Z",
  }),
  getSightings: async (request) => {
    assert.equal(new URL(request.url).searchParams.get("limit"), "3");
    return Response.json({
    sightings: [
      { ...memberSightingInput, id: "sighting-new", storeState: "NC", createdAt: "2026-08-20T21:00:00.000Z" },
      { ...memberSightingInput, id: "sighting-old", storeState: "SC", createdAt: "2026-08-20T17:00:00.000Z" },
    ],
    totalSightings: 2,
    previewLimit: null,
    });
  },
});
const scopedResponse = await scopedHandler(new Request("https://www.bourbonsignal.com/api/v1/signals?limit=2"));
assert.equal(scopedResponse.status, 200);
const scopedPayload = await scopedResponse.json();
assert.deepEqual(scopedPayload.signals.map((signal: { id: string }) => signal.id), ["member:sighting-new", "trusted_source:drop-new"]);
assert.equal(scopedPayload.total, 2, "limit must apply to the combined feed, not independently to each source");
assert.equal(typeof scopedPayload.nextCursor, "string", "a full combined page must expose continuation without changing legacy limit behavior");
assert.equal(scopedPayload.hasMore, true);
assert.equal(scopedPayload.pagination, undefined, "v1 uses one opaque nextCursor rather than exposing source offsets");

let unsupportedCalled = false;
const unsupportedHandler = createSignalFeedHandler({
  getDrops: async () => { unsupportedCalled = true; return Response.json({}); },
  getSightings: async () => { unsupportedCalled = true; return Response.json({}); },
});
const unsupportedResponse = await unsupportedHandler(new Request("https://www.bourbonsignal.com/api/v1/signals?cursor=legacy"));
assert.equal(unsupportedResponse.status, 400);
assert.equal(unsupportedCalled, false, "unsupported pagination must fail before calling legacy sources");

const partialHandler = createSignalFeedHandler({
  getDrops: async () => Response.json({ error: "drop source unavailable" }, { status: 503 }),
  getSightings: async () => Response.json({ sightings: [{ ...memberSightingInput, id: "only", storeState: "NC" }], totalSightings: 1 }),
});
const partialResponse = await partialHandler(new Request("https://www.bourbonsignal.com/api/v1/signals"));
assert.equal(partialResponse.status, 200);
const partialPayload = await partialResponse.json();
assert.deepEqual(partialPayload.sources, { drops: "unavailable", members: "ready" });
assert.deepEqual(partialPayload.signals.map((signal: { id: string }) => signal.id), ["member:only"]);

const malformedHandler = createSignalFeedHandler({
  getDrops: async () => Response.json({ drops: [null], total: 1 }),
  getSightings: async () => Response.json({ error: "Unauthorized" }, { status: 401 }),
});
const malformedResponse = await malformedHandler(new Request("https://www.bourbonsignal.com/api/v1/signals"));
assert.equal(malformedResponse.status, 503, "a malformed successful source must not become a healthy empty feed");
const malformedPayload = await malformedResponse.json();
assert.deepEqual(malformedPayload.sources, { drops: "unavailable", members: "unauthorized" });

const previewHandler = createSignalFeedHandler({
  getDrops: async () => Response.json({ drops: [], total: 0, previewLocked: false, requiresAccountForFullFeed: false }),
  getSightings: async () => Response.json({ sightings: [memberSightingInput], totalSightings: 4, previewLimit: 1 }),
});
const previewPayload = await (await previewHandler(new Request("https://www.bourbonsignal.com/api/v1/signals"))).json();
assert.equal(previewPayload.access.previewLocked, true, "member preview truncation must make the unified feed visibly incomplete");
assert.equal(previewPayload.access.requiresAccountForFullFeed, true);

const malformedMemberHandler = createSignalFeedHandler({
  getDrops: async () => Response.json({ error: "Unauthorized" }, { status: 401 }),
  getSightings: async () => Response.json({ sightings: [{ ...memberSightingInput, notes: 42 }], totalSightings: 1, previewLimit: null }),
});
const malformedMemberResponse = await malformedMemberHandler(new Request("https://www.bourbonsignal.com/api/v1/signals"));
assert.equal(malformedMemberResponse.status, 503, "invalid optional member fields must fail the source closed");

const filterCalls: string[] = [];
const filterHandler = createSignalFeedHandler({
  getDrops: async (request) => { filterCalls.push(request.url); return Response.json({ drops: [], total: 0, snapshot: "filters", hasMore: false }); },
  getSightings: async (request) => { filterCalls.push(request.url); return Response.json({ sightings: [], totalSightings: 0, previewLimit: null }); },
});
const filteredResponse = await filterHandler(new Request("https://www.bourbonsignal.com/api/v1/signals?state=nc&tiers=allocated,unicorn&freshness=24h&bottle=Weller"));
assert.equal(filteredResponse.status, 200, "v1 filters should delegate to the entitlement-aware source routes");
assert.equal(filterCalls.length, 2);
for (const call of filterCalls) {
  const params = new URL(call).searchParams;
  assert.equal(params.get("state"), "NC");
  assert.equal(params.get("tiers"), "allocated,unicorn");
  assert.equal(params.get("bottle"), "Weller");
  assert.ok(params.get("since"));
}
filterCalls.length = 0;
const legacyAreaResponse = await filterHandler(new Request("https://www.bourbonsignal.com/api/v1/signals?state=nc&area=Wake%20County%20ABC&tiers=highly_allocated"));
assert.equal(legacyAreaResponse.status, 200);
const dropAreaCall = filterCalls.find((call) => new URL(call).pathname === "/api/drops");
const sightingAreaCall = filterCalls.find((call) => new URL(call).pathname === "/api/sightings");
assert.equal(new URL(dropAreaCall!).searchParams.get("store"), "Wake County ABC", "NC Board selections use the website's legacy drop contract");
assert.equal(new URL(sightingAreaCall!).searchParams.get("area"), "Wake County ABC", "area selection is passed safely to Community sightings");
assert.equal(new URL(dropAreaCall!).searchParams.get("tiers"), "unicorn");
assert.equal(new URL(sightingAreaCall!).searchParams.get("tiers"), "unicorn");
const areaWithoutState = await filterHandler(new Request("https://www.bourbonsignal.com/api/v1/signals?area=Wake%20County%20ABC"));
assert.equal(areaWithoutState.status, 400, "area requires an explicit state lens");
const unsupportedFilter = await filterHandler(new Request("https://www.bourbonsignal.com/api/v1/signals?store=secret"));
assert.equal(unsupportedFilter.status, 400, "unapproved source filters must still fail closed");
assert.equal(filterCalls.length, 2, "unsupported filters must fail before additional source access");

console.log("Canonical Signal v1 contract passed.");
