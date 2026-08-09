import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareDropFeedNewestFirst, dropDisplayTime, dropFreshnessTime, resolveDropLimit } from "../src/lib/drop-feed-policy.ts";
import { scopedDropFeedHistoryEnabled } from "../src/lib/drop-feed-history.ts";
import { resolveDropQuantitySemantics } from "../src/lib/drop-quantity-semantics.ts";
import { isUserFacingDropSignal, MISSISSIPPI_ONSITE_SOURCE_PERMITS } from "../src/lib/drop-feed-visibility.ts";
import { coveredAreaLabelsMatch, getCoveredAreaOptionsForState } from "../src/lib/feed-area-options.ts";
import { isPublicDropFeedEligible, normalizePublicDropEvidenceInput } from "../src/lib/public-drop-evidence.ts";

assert.equal(resolveDropLimit("40", false, 7), 40);
assert.equal(resolveDropLimit("200", false, 7), 200, "paid watchlist requests must remain compatible");
assert.equal(resolveDropLimit("500", false, 7), 500, "dashboard state analysis must remain compatible");
assert.equal(resolveDropLimit("5000", false, 7), 500, "paid requests still need a defensive ceiling");
assert.equal(resolveDropLimit("500", true, 7), 7, "free previews remain capped by entitlement");

for (const filter of [
  { state: "NC" },
  { area: "Dunn" },
  { store: "Dunn ABC Board" },
  { bottle: "Buffalo Trace" },
]) {
  assert.equal(scopedDropFeedHistoryEnabled(filter), true, "scoped filters must retain matching historical signals");
}
assert.equal(scopedDropFeedHistoryEnabled({}), false, "unfiltered feeds must retain normal freshness filtering");
assert.equal(scopedDropFeedHistoryEnabled({ store: "ALL" }), false, "an all-areas sentinel is not a scoped filter");

const firstSeen = "2026-07-09T05:58:31.808Z";
const lastConfirmed = "2026-07-10T03:58:33.566Z";
assert.equal(dropFreshnessTime({
  event_type: "cityhive_store_inventory_result",
  timestamp: firstSeen,
  first_seen_at: firstSeen,
  last_confirmed_at: lastConfirmed,
}), Date.parse(lastConfirmed), "inventory freshness must use last confirmation without changing display time");
assert.equal(dropFreshnessTime({
  event_type: "release_watch",
  timestamp: firstSeen,
  last_confirmed_at: lastConfirmed,
}), Date.parse(firstSeen), "context events stay anchored to their public event timestamp");
assert.equal(dropDisplayTime({
  event_type: "cityhive_store_inventory_result",
  timestamp_basis: "first_seen_at",
  timestamp: firstSeen,
  first_seen_at: firstSeen,
  last_confirmed_at: lastConfirmed,
}), lastConfirmed, "live inventory cards must display their latest confirmation instead of looking days old");
assert.equal(dropDisplayTime({
  event_type: "release_watch",
  timestamp_basis: "first_seen_at",
  timestamp: firstSeen,
  first_seen_at: firstSeen,
  last_confirmed_at: lastConfirmed,
}), firstSeen, "context events must preserve their public first-seen basis");
assert.equal(dropDisplayTime({
  event_type: "release_watch",
  timestampBasis: "source_event_at",
  eventAt: firstSeen,
  firstSeenAt: "",
  lastConfirmedAt: lastConfirmed,
}), firstSeen, "camel-case context events preserve their source-event basis");
assert.equal(dropDisplayTime({
  event_type: "release_watch",
  timestamp_basis: "first_seen_at",
  first_seen_at: "",
  last_confirmed_at: lastConfirmed,
}), lastConfirmed, "empty preferred timestamps must fall through to the next populated value");
assert.equal(dropDisplayTime({
  event_type: "cityhive_store_inventory_result",
  timestamp_basis: "first_seen_at",
  first_seen_at: firstSeen,
  last_confirmed_at: "not-a-date",
}), firstSeen, "an invalid inventory confirmation must not replace a valid first-seen display time");
assert.equal(dropDisplayTime({
  event_type: "release_watch",
  timestamp_basis: "source_event_at",
  event_at: "not-a-date",
  eventAt: firstSeen,
  first_seen_at: lastConfirmed,
}), firstSeen, "an invalid snake-case event time must fall through to a valid camel-case alias");
assert.equal(dropDisplayTime({
  event_type: "cityhive_store_inventory_result",
  timestampBasis: "first_seen_at",
  last_confirmed_at: "",
  lastConfirmedAt: lastConfirmed,
  firstSeenAt: firstSeen,
}), lastConfirmed, "inventory confirmation must use a valid camel-case alias when the snake-case field is empty");

const chronologicalFeed = [
  { id: "equal-b", timestamp: "2026-08-08T15:00:00.000Z" },
  { id: "invalid-z", timestamp: "not-a-date" },
  { id: "older-exact-store", timestamp: "2026-08-08T16:00:00.000Z", exact_store: true },
  {
    id: "scheduled-release",
    event_type: "alabc_limited_release_store_drop",
    location_precision: "store_level",
    releaseDate: "2026-08-08T16:30:00.000Z",
    timestamp: "2026-08-01T12:00:00.000Z",
    last_confirmed_at: "2026-08-08T19:00:00.000Z",
  },
  {
    id: "scheduled-undated",
    event_type: "alabc_limited_release_store_drop",
    location_precision: "store_level",
    timestamp: "2026-08-01T12:00:00.000Z",
    last_confirmed_at: "2026-08-08T20:00:00.000Z",
  },
  { id: "newer-board", timestamp: "2026-08-08T17:00:00.000Z", exact_store: false },
  {
    id: "newest-confirmed-inventory",
    event_type: "cityhive_store_inventory_result",
    timestamp_basis: "first_seen_at",
    timestamp: "2026-08-01T12:00:00.000Z",
    first_seen_at: "2026-08-01T12:00:00.000Z",
    last_confirmed_at: "2026-08-08T18:00:00.000Z",
  },
  { id: "invalid-a", timestamp: "also-not-a-date" },
  { id: "equal-a", timestamp: "2026-08-08T15:00:00.000Z" },
].sort(compareDropFeedNewestFirst);
assert.deepEqual(
  chronologicalFeed.map((drop) => drop.id),
  [
    "newest-confirmed-inventory",
    "newer-board",
    "scheduled-release",
    "older-exact-store",
    "equal-a",
    "equal-b",
    "invalid-a",
    "invalid-z",
    "scheduled-undated",
  ],
  "Drop Feed order must follow the customer-visible signal time with stable ties and invalid dates last",
);

const singleStoreShipment = resolveDropQuantitySemantics({
  type: "nc_board_shipment_snapshot",
  quantity: null,
  boardShipmentQuantity: 6,
});
assert.equal(singleStoreShipment.inventoryQuantity, 0, "store-equivalent shipment rows must never expose shelf quantity");
assert.equal(singleStoreShipment.shipmentQuantity, 6, "store-equivalent shipment rows must preserve official shipped units");
assert.equal(singleStoreShipment.visibilityQuantity, 6, "store-equivalent shipment units must keep the informational row visible");
const siteContractSource = readFileSync(new URL("../src/lib/site-engine-contract.ts", import.meta.url), "utf8");
assert.match(siteContractSource, /resolveDropQuantitySemantics\(drop\)/, "site normalization must apply shipment quantity semantics");
assert.match(siteContractSource, /quantity_shipped:\s*shipmentQuantity\s*\|\|\s*undefined/, "site normalization must export shipped units separately");
assert.match(siteContractSource, /store_equivalent_shipment"\)\s*\?\s*"board"/, "store-equivalent shipment availability must remain board-scoped");
assert.match(siteContractSource, /isUserFacingDropSignal\(\{\s*\.\.\.drop,/s, "site normalization must preserve Mississippi feed-proof fields when recomputing visibility");
const dropDomainSource = readFileSync(new URL("../src/lib/drops.ts", import.meta.url), "utf8");
assert.match(dropDomainSource, /dropDisplayTime\(drop as Record<string, unknown>\)/, "customer card time must use the shared inventory-confirmation display policy");
assert.match(dropDomainSource, /event\.quantity_in_stock\s*\?\?\s*event\.quantity_shipped\s*\?\?\s*event\.quantity/, "drop-domain filtering must retain normalized shipment rows");

assert.deepEqual(getCoveredAreaOptionsForState(null), [], "all-state feed should not preload every configured area");
assert.ok(getCoveredAreaOptionsForState("SC").includes("Myrtle Beach"), "South Carolina feed must keep Myrtle Beach selectable even between signal refreshes");
assert.equal(coveredAreaLabelsMatch("Myrtle Beach", "Myrtle Beach"), true);
assert.equal(coveredAreaLabelsMatch("North Myrtle Beach", "Myrtle Beach"), false, "Myrtle Beach must not absorb North Myrtle Beach");
assert.equal(coveredAreaLabelsMatch("North Charleston", "Charleston"), false, "Charleston must not absorb North Charleston");
assert.equal(coveredAreaLabelsMatch("Mecklenburg ABC Board", "Mecklenburg"), true, "board suffix normalization must remain supported");
const dropFeedSource = readFileSync(new URL("../src/components/sections/DropFeed.tsx", import.meta.url), "utf8");
assert.match(dropFeedSource, /getCoveredAreaOptionsForState\(selectedState\)/, "DropFeed must merge configured covered areas for the selected state");
assert.match(dropFeedSource, /compareDropFeedNewestFirst/, "the client must preserve the shared customer-visible chronology policy");
assert.doesNotMatch(dropFeedSource, /type DropSortMode|viewMenuOptions|Use my location/, "the Drop Feed must not expose nonchronological sort modes");
const dropsRouteSource = readFileSync(new URL("../src/app/api/drops/route.ts", import.meta.url), "utf8");
assert.match(dropsRouteSource, /compareDropFeedNewestFirst/, "the API must sort with the shared customer-visible chronology policy");
assert.doesNotMatch(dropsRouteSource, /diversifyDrops/, "bottle variety must not reorder the chronological feed");
assert.match(dropsRouteSource, /scopedDropFeedHistoryEnabled\(\{[\s\S]*state,[\s\S]*area: appliedAreaFilter \? areaQuery : undefined,[\s\S]*store,[\s\S]*bottle/,
  "history must activate only for state, applied area, entitled store, or entitled bottle filters");
assert.match(dropsRouteSource, /isPublicDropFeedEligible\(drop,\s*\{\s*degradedStateCodes:/,
  "the default API feed must use the shared Coverage eligibility gate");
assert.doesNotMatch(dropsRouteSource, /filterDegradedStates:\s*false/,
  "a degraded state cannot retry around the shared Feed/Coverage eligibility gate");

const defaultFeedCandidate = {
  state: "AZ",
  type: "retailer_store_inventory_result",
  source: "reviewed_retailer",
  tier: "limited",
  locationPrecision: "store_level",
  storeId: "az-shared-gate",
  storeName: "Shared Gate Spirits",
  storeAddress: "1 Main Street",
  city: "Phoenix",
  quantity: 1,
  canAlertAsInventory: true,
};
assert.equal(isPublicDropFeedEligible(defaultFeedCandidate), true, "a limited customer-feed store row is eligible for both surfaces");
assert.equal(isPublicDropFeedEligible({ ...defaultFeedCandidate, tier: "standard" }), false, "a row hidden by the default Drop Feed cannot establish Coverage evidence");
assert.equal(isPublicDropFeedEligible({
  ...defaultFeedCandidate,
  state: "NC",
  type: "nc_statewide_warehouse_stock",
  locationPrecision: "board_warehouse",
}), false, "blocked NC warehouse stock cannot establish feed or Coverage evidence");
assert.equal(isPublicDropFeedEligible(defaultFeedCandidate, { degradedStateCodes: new Set(["AZ"]) }), false,
  "a degraded state cannot establish feed or Coverage evidence");
const rawAliasCandidate = normalizePublicDropEvidenceInput({
  state_code: "AZ",
  event_type: "retailer_store_inventory_result",
  source_name: "Alias retailer inventory",
  tier: "limited",
  location_precision: "store_level",
  store_id: "az-alias-1",
  store_name: "Alias Spirits",
  store_address: "1 Alias Road, Phoenix, AZ, 85001",
  quantity_in_stock: 1,
  observed_at: "2026-08-02T13:00:00.000Z",
});
assert.equal(rawAliasCandidate.state, "AZ", "the pure evidence normalizer accepts raw engine state aliases");
assert.equal(rawAliasCandidate.quantity, undefined, "a missing primary quantity remains absent so quantity_in_stock remains usable");
assert.equal(isPublicDropFeedEligible(rawAliasCandidate), true, "raw engine aliases normalize to the same eligible public-evidence shape");

const mississippiRegistry = JSON.parse(readFileSync(new URL("../engine/data/mississippi-retailer-registry.json", import.meta.url), "utf8")) as { stores: Array<Record<string, unknown>> };
const expectedMississippiSources = new Map(
  mississippiRegistry.stores
    .filter((store) => store.autonomousFetchAllowed === true && store.sourcePolicyStatus === "allowed" && /_orderability$/u.test(String(store.fulfillmentSemantics ?? "")))
    .map((store) => [String(store.sourceRuntimeId), String(store.permitNumber)]),
);
assert.deepEqual(MISSISSIPPI_ONSITE_SOURCE_PERMITS, expectedMississippiSources, "the app feed allowlist must exactly match reviewed Mississippi orderability sources");

const mississippiSparseInventory = {
  type: "retailer_store_inventory_result",
  state: "MS",
  quantity: 0,
  quantityIsExact: false,
  locationPrecision: "store_level",
  canAlertAsInventory: false,
  canAlertAsWatch: false,
  sourceRuntimeId: "retailer:ms:tupelo2go:1187",
  permitNumber: "055298",
  storeId: "ms-permit-055298",
  sourceAvailabilityVerified: true,
  premisesVerified: true,
  pickupOfferVerified: false,
  orderabilityOfferVerified: true,
  eligibleForOnSite: true,
  eligibleForDropFeed: true,
  eligibleForWatch: false,
  eligibleForDelivery: false,
  eligibleForEmail: false,
  eligibleForSms: false,
  inventorySemantics: "binary_retailer_orderable_no_exact_count",
};
assert.equal(isUserFacingDropSignal(mississippiSparseInventory), true, "identity-bound Mississippi binary orderability must survive the API feed filter without becoming alertable");
for (const [label, mutation] of [
  ["wrong state", { state: "TN" }],
  ["wrong runtime namespace", { sourceRuntimeId: "retailer:tn:tupelo2go:1187" }],
  ["unreviewed Mississippi runtime", { sourceRuntimeId: "retailer:ms:fake:999", permitNumber: "999999", storeId: "ms-permit-999999" }],
  ["missing exact permit", { permitNumber: "" }],
  ["store/permit mismatch", { storeId: "ms-permit-041251" }],
  ["exact quantity claim", { quantityIsExact: true }],
  ["unverified availability", { sourceAvailabilityVerified: false }],
  ["unverified premises", { premisesVerified: false }],
  ["stale row", { stale: true }],
  ["stale source", { sourceStale: true }],
  ["no order control", { pickupOfferVerified: false, orderabilityOfferVerified: false }],
  ["not approved on site", { eligibleForOnSite: false }],
  ["not approved for feed", { eligibleForDropFeed: false }],
  ["watch alert mutation", { eligibleForWatch: true }],
  ["watch policy mutation", { canAlertAsWatch: true }],
  ["email alert mutation", { eligibleForEmail: true }],
  ["wrong inventory semantics", { inventorySemantics: "exact_quantity" }],
  ["alert mutation", { canAlertAsInventory: true }],
] as const) {
  assert.equal(isUserFacingDropSignal({ ...mississippiSparseInventory, ...mutation }), false, `Mississippi feed visibility must fail closed for ${label}`);
}

console.log("Drop feed policy tests passed.");
