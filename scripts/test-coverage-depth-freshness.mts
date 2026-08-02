import assert from "node:assert/strict";
import { buildCoverageContract, findCoverageStoreTarget, searchCoverageTargets } from "../src/lib/coverage-model.ts";
import { publicEvidenceAddressKey } from "../src/lib/public-drop-evidence.ts";

const AS_OF = "2026-08-02T14:00:00.000Z";

function exactStoreInventory(args: {
  state: string;
  storeId: string;
  city: string;
  alertable?: boolean;
  stale?: boolean;
}) {
  const streetNumber = 100 + Array.from(args.storeId).reduce((total, character) => total + character.charCodeAt(0), 0) % 8000;
  return {
    state: args.state,
    type: "retailer_store_inventory_result",
    locationPrecision: "store_level",
    source: "retailer_inventory",
    tier: "limited",
    rarity_tier: "limited",
    storeId: args.storeId,
    storeName: `Reviewed ${args.storeId}`,
    storeAddress: `${streetNumber} Main Street`,
    city: args.city,
    quantity: 1,
    observedAt: AS_OF,
    lastConfirmedAt: AS_OF,
    canAlertAsInventory: args.alertable === true,
    sourceStale: args.stale === true,
    stale: args.stale === true,
  };
}

const lifecycle = {
  activeStates: ["AZ", "NY", "NC", "PA", "MI"],
  states: {
    AZ: {
      customerLabel: "Arizona",
      sourceLabel: "Arizona retailer inventory",
      publicStatus: "active",
      lifecycle: "retailer_store_inventory",
      coverageTier: "live_store_inventory",
      coverageLayerCounts: { live: 99, alertGrade: 99 },
    },
    NY: {
      customerLabel: "New York",
      sourceLabel: "New York retailer inventory",
      publicStatus: "active",
      lifecycle: "retailer_store_inventory",
      coverageTier: "live_store_inventory",
      coverageLayerCounts: { live: 4, alertGrade: 4 },
    },
    NC: {
      customerLabel: "North Carolina",
      sourceLabel: "North Carolina ABC boards",
      publicStatus: "active",
      lifecycle: "store_inventory_and_board_leads",
      coverageTier: "live_store_inventory",
    },
    PA: {
      customerLabel: "Pennsylvania",
      sourceLabel: "Pennsylvania FWGS",
      publicStatus: "active",
      lifecycle: "store_inventory",
      coverageTier: "live_store_inventory",
      coverageLayerCounts: { live: 50, alertGrade: 50 },
    },
    MI: {
      customerLabel: "Michigan",
      sourceLabel: "Michigan warehouse watch",
      publicStatus: "active",
      lifecycle: "costco_warehouse_inventory_watch",
      coverageTier: "retailer_warehouse_inventory",
    },
  },
} as const;

const contract = buildCoverageContract({
  lifecycle,
  asOf: AS_OF,
  stateRows: [
    { state: "AZ", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 5 },
    { state: "NY", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 4 },
    { state: "NC", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "board", signalCount: 40 },
    { state: "PA", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_aggregate", signalCount: 1 },
    { state: "MI", publicStatus: "active", status: "useful", coverageTier: "retailer_warehouse_inventory", bestLocationPrecision: "blocked", signalCount: 0 },
  ],
  stores: [
    { state: "NY", id: "ny-listed", name: "New York Listed Store", city: "Westbury", source: "New York retailer directory" },
    { state: "PA", id: "pa-listed", name: "Pennsylvania Listed Store", city: "Harrisburg", source: "Pennsylvania store directory" },
  ],
  drops: [
    exactStoreInventory({ state: "AZ", storeId: "az-1", city: "Scottsdale", alertable: true }),
    exactStoreInventory({ state: "AZ", storeId: "az-2", city: "Scottsdale", alertable: true }),
    exactStoreInventory({ state: "AZ", storeId: "az-3", city: "Mesa", alertable: true }),
    exactStoreInventory({ state: "AZ", storeId: "az-4", city: "Tucson", alertable: true }),
    exactStoreInventory({ state: "AZ", storeId: "az-5", city: "Yuma", alertable: true }),
    exactStoreInventory({ state: "NY", storeId: "ny-1", city: "Westbury", alertable: true, stale: true }),
    {
      state: "PA",
      type: "store_inventory_aggregate",
      tier: "limited",
      rarity_tier: "limited",
      locationPrecision: "store_aggregate",
      locationName: "Pennsylvania statewide search",
      quantity: 100,
      observedAt: AS_OF,
      lastConfirmedAt: AS_OF,
      sourceStale: true,
      stale: true,
    },
    ...Array.from({ length: 25 }, (_, index) => ({
      state: "NC",
      type: "nc_board_shipment_snapshot",
      source: "nc_abc",
      tier: "allocated",
      rarity_tier: "allocated",
      locationPrecision: "board_county",
      boardName: `North Carolina Board ${index + 1}`,
      city: `NC Board City ${index + 1}`,
      quantity: 1,
      observedAt: AS_OF,
      lastConfirmedAt: AS_OF,
    })),
  ],
  ncBoardIntelligence: {
    boardCount: 60,
    officialStoreCount: 120,
    boardsWithTrackedShipments: 40,
    singleStoreShipmentBoardCount: 20,
  },
});

const byCode = new Map(contract.states.map((state) => [state.code, state]));
const az = byCode.get("AZ");
const ny = byCode.get("NY");
const nc = byCode.get("NC");
const pa = byCode.get("PA");
const mi = byCode.get("MI");
assert.ok(az && ny && nc && pa && mi);

assert.equal(az.scope.inventoryMonitoredStores, 5, "fresh public exact-store rows—not configured stores—drive current availability scope");
assert.equal(az.capabilities.currentBottleAvailability, true, "fresh exact-store public rows enable current bottle availability");
assert.equal(az.capabilities.restockAlerts, true, "fresh alertable public rows enable alerts");
assert.equal(az.coverageDepth, "moderate", "five exact stores across several cities are moderate coverage");

assert.equal(ny.scope.inventoryMonitoredStores, 0, "stale rows never count as current availability");
assert.equal(ny.capabilities.currentBottleAvailability, false, "stale rows cannot be shown as current bottle availability");
assert.equal(ny.capabilities.restockAlerts, false, "stale rows cannot make alert capability available");
assert.equal(ny.health, "temporarily-limited", "stale direct inventory is surfaced as a freshness limitation");
assert.equal(ny.coverageDepth, "not-available", "a listed store plus stale evidence does not create current customer depth");

assert.equal(nc.coverageStatus, "available", "board shipment coverage remains available without current shelf inventory");
assert.equal(nc.capabilities.publicUpdates, true, "official shipment boards remain a public capability");
assert.equal(nc.capabilities.currentBottleAvailability, false, "board shipment coverage never implies current bottle availability");
assert.equal(nc.coverageDepth, "active", "broad official board coverage is active even without shelf inventory");

assert.equal(pa.capabilities.currentBottleAvailability, false, "a stale statewide aggregate is not current store availability");
assert.equal(pa.capabilities.restockAlerts, false, "a stale statewide aggregate is never alertable");
assert.equal(pa.health, "temporarily-limited", "stale aggregate evidence is visibly limited");
assert.equal(pa.coverageDepth, "not-available", "listed stores plus stale aggregate evidence does not create current customer depth");

assert.equal(mi.coverageStatus, "not-available", "configured-but-empty sources do not create customer coverage");
assert.equal(mi.coverageDepth, "not-available", "configured-but-empty sources have no depth label beyond not available");

const temporarilyQuietNcContract = buildCoverageContract({
  lifecycle,
  asOf: AS_OF,
  // Mirrors the persisted production NC state: stale fallback is blocked from
  // refreshing because the source is not due, not because the source lane was
  // disabled. It must remain covered while all current-data capabilities stay off.
  stateRows: [{
    state: "NC",
    publicStatus: "active",
    status: "stale_blocked",
    coverageTier: "live_store_inventory",
    bestLocationPrecision: "store_level",
    signalCount: 2465,
  }],
  degradedStates: [{
    state: "NC",
    status: "stale_blocked",
    stale: true,
    staleReason: "not_due",
  }],
  locations: [{
    id: "nc-board-source",
    state: "NC",
    type: "county_board",
    name: "Example NC ABC Board",
    source: "NC ABC Commission board list",
    precision: "board_county",
    collectorAttached: true,
  }],
  drops: [{
    state: "NC",
    type: "nc_board_shipment_snapshot",
    source: "nc_abc",
    tier: "allocated",
    rarity_tier: "allocated",
    locationPrecision: "board_county",
    boardName: "Example NC ABC Board",
    city: "Raleigh",
    quantity: 1,
    observedAt: "2026-07-01T14:00:00.000Z",
    lastConfirmedAt: "2026-07-01T14:00:00.000Z",
    sourceStale: true,
    stale: true,
  },
  // A stale-blocked source health state must suppress even an otherwise fresh
  // input row; it changes availability freshness, not source coverage.
  exactStoreInventory({ state: "NC", storeId: "nc-fresh-row-behind-stale-state", city: "Raleigh", alertable: true }),
  ],
});
const temporarilyQuietNc = temporarilyQuietNcContract.states.find((state) => state.code === "NC");
assert.ok(temporarilyQuietNc);
assert.equal(temporarilyQuietNc.coverageStatus, "available", "a verified NC ABC source lane remains coverage even when it has no current output");
assert.equal(temporarilyQuietNc.coverageDepth, "not-available", "a quiet source lane does not retain current depth");
assert.equal(temporarilyQuietNc.capabilities.publicUpdates, false, "stale NC shipment rows do not create a current public-update claim");
assert.equal(temporarilyQuietNc.capabilities.currentBottleAvailability, false, "stale NC shipment rows never imply shelf inventory");
assert.equal(temporarilyQuietNc.freshness.currentInventoryStores, 0, "a stale-blocked NC state suppresses even an otherwise fresh exact-store input");
assert.equal(temporarilyQuietNc.capabilities.restockAlerts, false, "stale NC shipment rows never enable alerts");
assert.equal(temporarilyQuietNc.health, "temporarily-limited");
assert.match(temporarilyQuietNc.customerSummary || "", /Coverage is available through North Carolina ABC boards/i);
assert.match(temporarilyQuietNc.customerCannotSee?.join(" ") || "", /Current bottle availability/i);

const retailerSubmissionContract = buildCoverageContract({
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "AZ", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 1 }],
  drops: [{
    state: "AZ",
    source: "verified-retailer",
    retailerReported: true,
    retailerSignalState: "live",
    type: "verified_retailer_drop",
    storeId: "az-retailer-1",
    storeName: "Verified Arizona Retailer",
    storeAddress: "1 Verified Way",
    city: "Phoenix",
    locationPrecision: "store_level",
    canAlertAsInventory: true,
    expiresAt: "2026-08-03T14:00:00.000Z",
  }],
});
const retailerAz = retailerSubmissionContract.states.find((state) => state.code === "AZ");
assert.ok(retailerAz);
assert.equal(retailerAz.freshness.currentInventoryStores, 1, "a live verified retailer submission participates in the same coverage calculation");
assert.equal(retailerAz.capabilities.restockAlerts, true, "a live verified retailer submission can expose alert capability");

const marylandAliasContract = buildCoverageContract({
  lifecycle: {
    activeStates: ["MD-MONTGOMERY"],
    states: {
      "MD-MONTGOMERY": {
        customerLabel: "Maryland",
        sourceLabel: "Montgomery County retailer inventory",
        publicStatus: "active",
        coverageTier: "live_store_inventory",
      },
    },
  },
  asOf: AS_OF,
  stateRows: [{ state: "MD-MONTGOMERY", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 1 }],
  drops: [exactStoreInventory({ state: "MD-MONTGOMERY", storeId: "md-1", city: "Bethesda", alertable: true })],
});
const maryland = marylandAliasContract.states.find((state) => state.code === "MD");
assert.ok(maryland);
assert.equal(maryland.freshness.currentInventoryStores, 1, "internal Maryland state keys normalize to the customer-facing MD evidence bucket");

const marylandDegradedContract = buildCoverageContract({
  lifecycle: {
    activeStates: ["MD-MONTGOMERY"],
    states: {
      "MD-MONTGOMERY": {
        customerLabel: "Maryland",
        sourceLabel: "Montgomery County retailer inventory",
        publicStatus: "active",
        coverageTier: "live_store_inventory",
      },
    },
  },
  asOf: AS_OF,
  stateRows: [{ state: "MD-MONTGOMERY", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 1 }],
  degradedStates: [{ state: "MD-MONTGOMERY", status: "source_blocked" }],
  drops: [exactStoreInventory({ state: "MD-MONTGOMERY", storeId: "md-1", city: "Bethesda", alertable: true })],
});
const degradedMaryland = marylandDegradedContract.states.find((state) => state.code === "MD");
assert.ok(degradedMaryland);
assert.equal(degradedMaryland.coverageStatus, "not-available", "an explicit source block removes public coverage status");
assert.equal(degradedMaryland.coverageDepth, "not-available", "an explicit source block removes current depth");
assert.equal(degradedMaryland.capabilities.publicUpdates, false, "an explicit source block suppresses public updates");
assert.equal(degradedMaryland.capabilities.currentBottleAvailability, false, "an explicit source block suppresses inventory claims");
assert.equal(degradedMaryland.capabilities.restockAlerts, false, "an explicit source block suppresses alerts");
assert.equal(degradedMaryland.freshness.currentInventoryStores, 0, "an internal Maryland degradation suppresses customer current-availability claims");
assert.equal(degradedMaryland.health, "temporarily-limited", "an internal Maryland degradation remains visible in public health");

const blockedRowNcContract = buildCoverageContract({
  lifecycle,
  asOf: AS_OF,
  stateRows: [{
    state: "NC",
    publicStatus: "active",
    status: "blocked",
    coverageTier: "live_store_inventory",
    bestLocationPrecision: "blocked",
    signalCount: 1,
  }],
  drops: [exactStoreInventory({ state: "NC", storeId: "blocked-nc-1", city: "Raleigh", alertable: true })],
});
const blockedRowNc = blockedRowNcContract.states.find((state) => state.code === "NC");
assert.ok(blockedRowNc);
assert.equal(blockedRowNc.coverageStatus, "not-available", "a blocked NC source cannot be revived by a fresh exact-store row");
assert.equal(blockedRowNc.coverageDepth, "not-available", "a blocked NC source cannot retain current depth");
assert.equal(blockedRowNc.capabilities.publicUpdates, false, "a blocked NC source cannot expose public updates");
assert.equal(blockedRowNc.capabilities.currentBottleAvailability, false, "a blocked NC source cannot expose bottle availability");
assert.equal(blockedRowNc.capabilities.restockAlerts, false, "a blocked NC source cannot expose alerts");
assert.equal(blockedRowNc.freshness.currentInventoryStores, 0, "a blocked NC source cannot retain current stores");
assert.equal(blockedRowNc.health, "temporarily-limited");

const duplicateIdentityContract = buildCoverageContract({
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "AZ", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 2 }],
  drops: [
    { ...exactStoreInventory({ state: "AZ", storeId: "source-a", city: "Phoenix", alertable: true }), storeName: "Shared Store", storeAddress: "5 Shared Road" },
    { ...exactStoreInventory({ state: "AZ", storeId: "source-b", city: "Phoenix", alertable: true }), storeName: "Shared Store", storeAddress: "5 Shared Road" },
  ],
});
const duplicateIdentityArizona = duplicateIdentityContract.states.find((state) => state.code === "AZ");
assert.ok(duplicateIdentityArizona);
assert.equal(duplicateIdentityArizona.freshness.observedInventoryStores, 1, "source-specific IDs for the same exact address deduplicate to one observed store");
assert.equal(duplicateIdentityArizona.freshness.currentInventoryStores, 1, "source-specific IDs for the same exact address deduplicate to one current store");

const transitiveDuplicateContract = buildCoverageContract({
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "AZ", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 3 }],
  drops: [
    { ...exactStoreInventory({ state: "AZ", storeId: "transitive-a", city: "Phoenix", alertable: true }), storeName: "Bridge Alpha", storeAddress: "10 North Main Street" },
    { ...exactStoreInventory({ state: "AZ", storeId: "transitive-b", city: "Phoenix", alertable: true }), source: "Bridge source", storeName: "Bridge Beta", storeAddress: "11 State Street" },
    { ...exactStoreInventory({ state: "AZ", storeId: "transitive-b", city: "Phoenix", alertable: true }), source: "Bridge source", storeName: "Bridge Beta", storeAddress: "10 N Main St" },
  ],
});
const transitiveArizona = transitiveDuplicateContract.states.find((state) => state.code === "AZ");
assert.ok(transitiveArizona);
assert.equal(transitiveArizona.freshness.currentInventoryStores, 2, "a conflicting source/address bridge is quarantined instead of collapsing two current stores");

const staleBridgeContract = buildCoverageContract({
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "AZ", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 3 }],
  drops: [
    { ...exactStoreInventory({ state: "AZ", storeId: "bridge-current-a", city: "Phoenix", alertable: true }), storeName: "Bridge Alpha", storeAddress: "10 North Main Street" },
    { ...exactStoreInventory({ state: "AZ", storeId: "bridge-current-b", city: "Phoenix", alertable: true }), source: "Bridge source", storeName: "Bridge Beta", storeAddress: "11 State Street" },
    { ...exactStoreInventory({ state: "AZ", storeId: "bridge-current-b", city: "Phoenix", stale: true }), source: "Bridge source", storeName: "Bridge Beta", storeAddress: "10 N Main St" },
  ],
});
const staleBridgeArizona = staleBridgeContract.states.find((state) => state.code === "AZ");
assert.ok(staleBridgeArizona);
assert.equal(staleBridgeArizona.freshness.observedInventoryStores, 2, "a stale bridge with conflicting source/address evidence remains quarantined");
assert.equal(staleBridgeArizona.freshness.currentInventoryStores, 2, "a stale bridge cannot transfer currentness across a conflicting physical address");
assert.equal(staleBridgeArizona.freshness.alertEligibleStores, 2, "a stale bridge cannot transfer alertability across a conflicting physical address");

const sameNameSeparateStoresContract = buildCoverageContract({
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "AZ", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 2 }],
  drops: [
    { ...exactStoreInventory({ state: "AZ", storeId: "chain-east", city: "Phoenix", alertable: true }), storeName: "Chain Bottle Shop", storeAddress: "1 East Main Street" },
    { ...exactStoreInventory({ state: "AZ", storeId: "chain-west", city: "Phoenix", alertable: true }), storeName: "Chain Bottle Shop", storeAddress: "2 West Main Street" },
    { ...exactStoreInventory({ state: "AZ", storeId: "chain-ambiguous", city: "Phoenix", stale: true }), storeId: undefined, storeName: "Chain Bottle Shop", storeAddress: undefined },
  ],
});
const sameNameSeparateArizona = sameNameSeparateStoresContract.states.find((state) => state.code === "AZ");
assert.ok(sameNameSeparateArizona);
assert.equal(sameNameSeparateArizona.freshness.observedInventoryStores, 2, "an ambiguous name-only row cannot alter exact-store counts");
assert.equal(sameNameSeparateArizona.freshness.currentInventoryStores, 2, "same-name stores in one city remain distinct when stable IDs and addresses disagree");

const sameStreetDifferentCityContract = buildCoverageContract({
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "AZ", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 2 }],
  drops: [
    { ...exactStoreInventory({ state: "AZ", storeId: "street-phoenix", city: "Phoenix", alertable: true }), storeId: undefined, source: "City source", storeName: "Main Street Shop", storeAddress: "1 Main Street" },
    { ...exactStoreInventory({ state: "AZ", storeId: "street-tucson", city: "Tucson", alertable: true }), storeId: undefined, source: "City source", storeName: "Main Street Shop", storeAddress: "1 Main Street" },
  ],
});
const sameStreetDifferentCityArizona = sameStreetDifferentCityContract.states.find((state) => state.code === "AZ");
assert.ok(sameStreetDifferentCityArizona);
assert.equal(sameStreetDifferentCityArizona.freshness.observedInventoryStores, 2, "the same street address in different cities cannot merge");
assert.equal(sameStreetDifferentCityArizona.freshness.currentInventoryStores, 2);

const sameNameStoreSearch = searchCoverageTargets({
  stateCode: "AZ",
  query: "Chain Bottle Shop",
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "AZ", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 1 }],
  locations: [
    { id: "chain-east", state: "AZ", type: "store", name: "Chain Bottle Shop", address: "1 East Main Street", city: "Phoenix", source: "Arizona inventory", searchable: true, collectorAttached: true, hasSignals: true },
    { id: "chain-west", state: "AZ", type: "store", name: "Chain Bottle Shop", address: "2 West Main Street", city: "Phoenix", source: "Arizona inventory", searchable: true, collectorAttached: true, hasSignals: true },
  ],
  drops: [{ ...exactStoreInventory({ state: "AZ", storeId: "chain-east", city: "Phoenix", alertable: true }), storeName: "Chain Bottle Shop", storeAddress: "1 East Main Street" }],
});
assert.equal(sameNameStoreSearch.find((result) => result.storeId === "chain-east")?.status, "actively-monitored", "the exact matching store remains active in search");
assert.equal(sameNameStoreSearch.find((result) => result.storeId === "chain-west")?.status, "known-expansion-candidate", "a same-name store with a different address cannot inherit another store's live status");

const hiddenDefaultFeedContract = buildCoverageContract({
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "AZ", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 1 }],
  drops: [{ ...exactStoreInventory({ state: "AZ", storeId: "feed-hidden", city: "Phoenix", alertable: true }), tier: "standard", rarity_tier: "standard" }],
});
const hiddenDefaultFeedArizona = hiddenDefaultFeedContract.states.find((state) => state.code === "AZ");
assert.ok(hiddenDefaultFeedArizona);
assert.equal(hiddenDefaultFeedArizona.freshness.currentInventoryStores, 0, "a row hidden by the normal Drop Feed cannot become a current monitored store");
assert.equal(hiddenDefaultFeedArizona.coverageDepth, "not-available", "a row hidden by the normal Drop Feed cannot establish coverage depth");

const unqualifiedIdOnlyContract = buildCoverageContract({
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "AZ", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 1 }],
  drops: [{ ...exactStoreInventory({ state: "AZ", storeId: "unqualified-only", city: "Phoenix", alertable: true }), source: undefined, storeAddress: undefined }],
});
const unqualifiedIdOnlyArizona = unqualifiedIdOnlyContract.states.find((state) => state.code === "AZ");
assert.ok(unqualifiedIdOnlyArizona);
assert.equal(unqualifiedIdOnlyArizona.freshness.observedInventoryStores, 0, "an ID without a source or address is not exact-store evidence");
assert.equal(unqualifiedIdOnlyArizona.freshness.currentInventoryStores, 0);
assert.equal(unqualifiedIdOnlyArizona.freshness.alertEligibleStores, 0);

const malformedAddressContract = buildCoverageContract({
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "AZ", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 1 }],
  drops: [{ ...exactStoreInventory({ state: "AZ", storeId: "malformed-address", city: "Phoenix", alertable: true }), storeId: undefined, source: "Malformed source", storeAddress: "---" }],
});
const malformedAddressArizona = malformedAddressContract.states.find((state) => state.code === "AZ");
assert.ok(malformedAddressArizona);
assert.equal(malformedAddressArizona.freshness.observedInventoryStores, 0, "punctuation-only addresses are not exact-store identities");
assert.equal(malformedAddressArizona.freshness.currentInventoryStores, 0);
assert.equal(malformedAddressArizona.freshness.alertEligibleStores, 0);

const placeholderOrUnscopedAddressContract = buildCoverageContract({
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "AZ", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 3 }],
  drops: [
    { ...exactStoreInventory({ state: "AZ", storeId: "placeholder-unknown", city: "Phoenix", alertable: true }), storeId: undefined, storeAddress: "unknown" },
    { ...exactStoreInventory({ state: "AZ", storeId: "placeholder-na", city: "Phoenix", alertable: true }), storeId: undefined, storeAddress: "N/A" },
    { ...exactStoreInventory({ state: "AZ", storeId: "no-city", city: "", alertable: true }), storeId: undefined, storeAddress: "1 Main Street" },
    { ...exactStoreInventory({ state: "AZ", storeId: "numeric-city", city: "12345", alertable: true }), storeId: undefined, storeAddress: "1 Main Street" },
    { ...exactStoreInventory({ state: "AZ", storeId: "numeric-only-street", city: "Phoenix", alertable: true }), storeId: undefined, storeAddress: "123" },
    { ...exactStoreInventory({ state: "AZ", storeId: "placeholder-street", city: "Phoenix", alertable: true }), storeId: undefined, storeAddress: "123 placeholder" },
    { ...exactStoreInventory({ state: "AZ", storeId: "placeholder-source", city: "Phoenix", alertable: true }), source: "placeholder", storeAddress: undefined },
    { ...exactStoreInventory({ state: "AZ", storeId: "null-id", city: "Phoenix", alertable: true }), source: "Verified source", storeId: "null", storeAddress: undefined },
  ],
});
const placeholderOrUnscopedArizona = placeholderOrUnscopedAddressContract.states.find((state) => state.code === "AZ");
assert.ok(placeholderOrUnscopedArizona);
assert.equal(placeholderOrUnscopedArizona.freshness.observedInventoryStores, 0, "placeholder and city-less addresses cannot become exact-store evidence");
assert.equal(placeholderOrUnscopedArizona.freshness.currentInventoryStores, 0);
assert.equal(placeholderOrUnscopedArizona.freshness.alertEligibleStores, 0);

const conflictingSourceSearch = searchCoverageTargets({
  stateCode: "AZ",
  query: "Source Collision Shop",
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "AZ", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 1 }],
  locations: [{ id: "AZ:source:source-a-inventory:id:shared-store-id", state: "AZ", type: "store", name: "Source Collision Shop", address: "2 West Main Street", city: "Phoenix", source: "Source B Inventory", searchable: true, collectorAttached: true, hasSignals: true }],
  drops: [{ ...exactStoreInventory({ state: "AZ", storeId: "shared-store-id", city: "Phoenix", alertable: true }), source: "Source A Inventory", storeName: "Source Collision Shop", storeAddress: "1 East Main Street" }],
});
const conflictingDynamicStore = conflictingSourceSearch.find((result) => result.address === "1 East Main Street");
assert.equal(conflictingSourceSearch.find((result) => result.address === "2 West Main Street")?.status, "known-expansion-candidate", "a raw ID from another source cannot mark a conflicting address active");
assert.equal(conflictingDynamicStore?.status, "actively-monitored", "the source-qualified current record remains discoverable as its own store");
assert.ok(conflictingDynamicStore?.storeId?.includes(":source:source-a-inventory:id:shared-store-id"), "the dynamic result exposes a source-qualified request identity");
const conflictingDynamicTarget = findCoverageStoreTarget({
  stateCode: "AZ",
  storeId: conflictingDynamicStore?.storeId || "",
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "AZ", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 1 }],
  locations: [{ id: "AZ:source:source-a-inventory:id:shared-store-id", state: "AZ", type: "store", name: "Source Collision Shop", address: "2 West Main Street", city: "Phoenix", source: "Source B Inventory", searchable: true, collectorAttached: true, hasSignals: true }],
  drops: [{ ...exactStoreInventory({ state: "AZ", storeId: "shared-store-id", city: "Phoenix", alertable: true }), source: "Source A Inventory", storeName: "Source Collision Shop", storeAddress: "1 East Main Street" }],
});
assert.equal(conflictingDynamicTarget?.address, "1 East Main Street", "a dynamic request target cannot resolve to a conflicting directory address");

const boardSearch = searchCoverageTargets({
  stateCode: "NC",
  query: "Raleigh",
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "NC", publicStatus: "active", status: "stale_useful_quality_fallback", coverageTier: "live_store_inventory", bestLocationPrecision: "board", signalCount: 0 }],
  locations: [{
    id: "nc-raleigh-board",
    state: "NC",
    type: "county_board",
    name: "Raleigh ABC Board",
    city: "Raleigh",
    source: "NC ABC Commission board list",
    searchable: true,
    collectorAttached: true,
    hasSignals: true,
  }],
  ncBoardIntelligence: {
    boardCount: 60,
    officialStoreCount: 120,
    boardsWithTrackedShipments: 40,
    singleStoreShipmentBoardCount: 20,
  },
  drops: [{
    state: "NC",
    type: "nc_board_shipment_snapshot",
    source: "nc_abc",
    tier: "allocated",
    rarity_tier: "allocated",
    locationPrecision: "board_county",
    boardName: "Raleigh ABC Board",
    city: "Raleigh",
    quantity: 1,
    observedAt: AS_OF,
    lastConfirmedAt: AS_OF,
  }],
});
assert.ok(boardSearch.some((result) => result.kind === "city" && result.status === "partially-covered"), "search exposes a board area only when fresh matching board output exists");

const deliveryOnlyRetailerContract = buildCoverageContract({
  lifecycle: {
    activeStates: ["IA"],
    states: {
      IA: {
        customerLabel: "Iowa",
        sourceLabel: "Iowa delivery leads",
        publicStatus: "active",
        coverageTier: "store_delivery_leads",
      },
    },
  },
  asOf: AS_OF,
  stateRows: [{ state: "IA", publicStatus: "active", status: "useful", coverageTier: "store_delivery_leads", bestLocationPrecision: "store_level", signalCount: 1 }],
  drops: [{
    state: "IA",
    source: "verified-retailer",
    retailerReported: true,
    retailerSignalState: "live",
    type: "verified_retailer_drop",
    storeId: "ia-retailer-1",
    storeName: "Iowa Retailer",
    storeAddress: "1 Delivery Lane, Des Moines, IA 50309",
    locationPrecision: "store_level",
    canAlertAsInventory: true,
    expiresAt: "2026-08-03T14:00:00.000Z",
  }],
});
const iowaRetailerState = deliveryOnlyRetailerContract.states.find((state) => state.code === "IA");
assert.ok(iowaRetailerState);
assert.equal(iowaRetailerState.capabilities.currentBottleAvailability, false, "a retailer post cannot bypass a delivery-only state's inventory policy");
assert.equal(iowaRetailerState.capabilities.restockAlerts, false, "a retailer post cannot bypass a delivery-only state's alert policy");

const retailerSearchDrops = [{
  state: "AZ",
  source: "verified-retailer",
  retailerReported: true,
  retailerSignalState: "live",
  type: "verified_retailer_drop",
  storeId: "az-retailer-search",
  storeName: "Canyon Bottle Shop",
  storeAddress: "99 Canyon Way, Phoenix, AZ 85001",
  locationPrecision: "store_level",
  canAlertAsInventory: true,
  expiresAt: "2026-08-03T14:00:00.000Z",
}];
const retailerSearchInputs = {
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "AZ", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 1 }],
  drops: retailerSearchDrops,
};
const retailerSearch = searchCoverageTargets({ stateCode: "AZ", query: "Canyon", ...retailerSearchInputs });
const retailerSearchResult = retailerSearch.find((result) => result.kind === "store" && result.status === "actively-monitored");
assert.ok(retailerSearchResult?.storeId, "a retailer-only current store is searchable under the canonical evidence contract");
assert.notEqual(retailerSearchResult.storeId, "az-retailer-search", "dynamic retailer targets use a source-qualified identity instead of a raw ID");
const retailerTarget = findCoverageStoreTarget({ stateCode: "AZ", storeId: retailerSearchResult.storeId, ...retailerSearchInputs });
assert.equal(retailerTarget?.id, retailerSearchResult.storeId, "the request lookup resolves the same canonical dynamic store identity");
assert.equal(retailerTarget?.city, "Phoenix", "retailer address evidence supplies a searchable city when no separate city field is present");

const healthLimitedSearch = searchCoverageTargets({
  stateCode: "AZ",
  query: "Phoenix",
  lifecycle,
  asOf: AS_OF,
  healthLimited: true,
  stateRows: [{ state: "AZ", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 1 }],
  locations: [{ id: "health-limited-phoenix", state: "AZ", type: "store", name: "Health Limited Spirits", address: "1 Phoenix Road", city: "Phoenix", source: "Arizona inventory", searchable: true, collectorAttached: true, hasSignals: true }],
  drops: [exactStoreInventory({ state: "AZ", storeId: "health-limited-phoenix", city: "Phoenix", alertable: true })],
});
assert.ok(healthLimitedSearch.some((result) => result.kind === "city" && result.status === "known-not-active"), "health-limited evidence cannot make a city look currently covered");
assert.equal(healthLimitedSearch.some((result) => result.status === "covered" || result.status === "actively-monitored"), false, "health-limited evidence cannot emit current-availability search copy");
const healthLimitedCoverageState = buildCoverageContract({
  lifecycle,
  asOf: AS_OF,
  healthLimited: true,
  stateRows: [{ state: "AZ", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 1 }],
  locations: [{ id: "health-limited-phoenix", state: "AZ", type: "store", name: "Health Limited Spirits", address: "1 Phoenix Road", city: "Phoenix", source: "Arizona inventory", searchable: true, collectorAttached: true, hasSignals: true }],
  drops: [exactStoreInventory({ state: "AZ", storeId: "health-limited-phoenix", city: "Phoenix", alertable: true })],
}).states.find((state) => state.code === "AZ");
assert.equal(healthLimitedCoverageState?.freshness.currentInventoryCities, 0, "health-limited states cannot expose a current-city freshness footprint");

const conflictingPremiseInputs = {
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "AZ", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 2 }],
  drops: [
    { ...exactStoreInventory({ state: "AZ", storeId: "shared-source-id", city: "Phoenix", alertable: true }), source: "Collision source", storeName: "Collision East", storeAddress: "101 East Main Street" },
    { ...exactStoreInventory({ state: "AZ", storeId: "shared-source-id", city: "Phoenix", alertable: true }), source: "Collision source", storeName: "Collision West", storeAddress: "102 West Main Street" },
  ],
  locations: [{ id: "shared-source-id", state: "AZ", type: "store", name: "Collision Directory", city: "Phoenix", source: "Collision source", searchable: true, collectorAttached: true, hasSignals: true }],
};
const conflictingPremiseSearch = searchCoverageTargets({ stateCode: "AZ", query: "Collision", ...conflictingPremiseInputs });
const conflictingPremiseStores = conflictingPremiseSearch.filter((result) => result.kind === "store" && result.status === "actively-monitored");
assert.equal(conflictingPremiseStores.length, 2, "conflicting source-ID premises remain two current stores");
assert.equal(new Set(conflictingPremiseStores.map((result) => result.storeId)).size, 2, "conflicting source-ID premises receive collision-safe request targets");
assert.notEqual(conflictingPremiseSearch.find((result) => result.label === "Collision Directory")?.status, "actively-monitored", "an address-less directory record cannot resolve an ambiguous reused source ID as current");
for (const result of conflictingPremiseStores) {
  assert.ok(result.storeId);
  const resolved = findCoverageStoreTarget({ stateCode: "AZ", storeId: result.storeId, ...conflictingPremiseInputs });
  assert.equal(resolved?.address, result.address, "each collision-safe request target resolves its own physical premise");
}

const addresslessBridgeContract = buildCoverageContract({
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "AZ", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 3 }],
  drops: [
    { ...exactStoreInventory({ state: "AZ", storeId: "ambiguous-bridge", city: "Phoenix", alertable: true }), source: "Bridge source", storeAddress: "10 Main Street" },
    { ...exactStoreInventory({ state: "AZ", storeId: "ambiguous-bridge", city: "Phoenix", alertable: true }), source: "Bridge source", storeAddress: undefined },
    { ...exactStoreInventory({ state: "AZ", storeId: "ambiguous-bridge", city: "Phoenix", alertable: true }), source: "Bridge source", storeAddress: "11 Main Street" },
  ],
});
const addresslessBridgeArizona = addresslessBridgeContract.states.find((state) => state.code === "AZ");
assert.ok(addresslessBridgeArizona);
assert.equal(addresslessBridgeArizona.freshness.observedInventoryStores, 2, "an address-less row cannot bridge two conflicting source-ID premises");
assert.equal(addresslessBridgeArizona.freshness.currentInventoryStores, 2, "an address-less bridge cannot transfer currentness across premises");
assert.equal(addresslessBridgeArizona.freshness.alertEligibleStores, 2, "an address-less bridge cannot transfer alert eligibility across premises");

assert.equal(
  publicEvidenceAddressKey("NC", "106 Bantiff Way, Greensboro, NC, 27406", "Greensboro"),
  publicEvidenceAddressKey("NC", "106 Bantiff Way", "Greensboro"),
  "an optional comma before ZIP does not split the same exact-store address identity",
);

console.log("coverage depth and freshness contract tests passed");
