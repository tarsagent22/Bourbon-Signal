import assert from "node:assert/strict";
import { buildCoverageContract, findCoverageStoreTarget, searchCoverageTargets } from "../src/lib/coverage-model.ts";
import { publicEvidenceAddressKey, isCurrentInventoryEvidence, isFreshPublicDrop, projectInventoryEvidenceFreshness } from "../src/lib/public-drop-evidence.ts";

const AS_OF = "2026-08-02T14:00:00.000Z";

// Generic model fixtures use Tennessee; actual Arizona acceptance is covered by
// the captured engine-to-public regression in arizona-xapi-matching.test.mjs.

const retainedInventory = { state: 'PA', type: 'store_inventory_result', tier: 'allocated', locationPrecision: 'store_level', lastConfirmedAt: '2026-08-02T10:00:00.000Z', timestamp: AS_OF };
assert.equal(isFreshPublicDrop(retainedInventory, AS_OF), true, 'history remains visible');
assert.equal(isCurrentInventoryEvidence(retainedInventory, AS_OF), false, 'publication cannot renew confirmation');
assert.equal(isCurrentInventoryEvidence({ ...retainedInventory, lastConfirmedAt: 'invalid', observedAt: AS_OF }, AS_OF), false);
assert.equal(isCurrentInventoryEvidence({ ...retainedInventory, lastConfirmedAt: AS_OF, sourceStale: true }, AS_OF), false);
assert.equal(isCurrentInventoryEvidence({ ...retainedInventory, lastConfirmedAt: AS_OF }, AS_OF), true);

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
  activeStates: ["TN", "NY", "NC", "PA", "MI"],
  states: {
    TN: {
      customerLabel: "Tennessee",
      sourceLabel: "Tennessee retailer inventory",
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
    { state: "TN", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 5 },
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
    exactStoreInventory({ state: "TN", storeId: "tn-1", city: "Nashville", alertable: true }),
    exactStoreInventory({ state: "TN", storeId: "tn-2", city: "Nashville", alertable: true }),
    exactStoreInventory({ state: "TN", storeId: "tn-3", city: "Knoxville", alertable: true }),
    exactStoreInventory({ state: "TN", storeId: "tn-4", city: "Memphis", alertable: true }),
    exactStoreInventory({ state: "TN", storeId: "tn-5", city: "Chattanooga", alertable: true }),
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
const tn = byCode.get("TN");
const ny = byCode.get("NY");
const nc = byCode.get("NC");
const pa = byCode.get("PA");
const mi = byCode.get("MI");
assert.ok(tn && ny && nc && pa && mi);

assert.equal(tn.scope.inventoryMonitoredStores, 5, "fresh public exact-store rows—not configured stores—drive current availability scope");
assert.equal(tn.capabilities.currentBottleAvailability, true, "fresh exact-store public rows enable current bottle availability");
assert.equal(tn.capabilities.restockAlerts, true, "fresh alertable public rows enable alerts");
assert.equal(tn.coverageDepth, "moderate", "five exact stores across several cities are moderate coverage");

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
  stateRows: [{ state: "TN", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 1 }],
  drops: [{
    state: "TN",
    source: "verified-retailer",
    retailerReported: true,
    retailerSignalState: "live",
    type: "verified_retailer_drop",
    storeId: "tn-retailer-1",
    storeName: "Verified Tennessee Retailer",
    storeAddress: "1 Verified Way",
    city: "Nashville",
    locationPrecision: "store_level",
    canAlertAsInventory: true,
    expiresAt: "2026-08-03T14:00:00.000Z",
  }],
});
const retailerTn = retailerSubmissionContract.states.find((state) => state.code === "TN");
assert.ok(retailerTn);
assert.equal(retailerTn.freshness.currentInventoryStores, 1, "a live verified retailer submission participates in the same coverage calculation");
assert.equal(retailerTn.capabilities.restockAlerts, true, "a live verified retailer submission can expose alert capability");

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
  stateRows: [{ state: "TN", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 2 }],
  drops: [
    { ...exactStoreInventory({ state: "TN", storeId: "source-a", city: "Nashville", alertable: true }), storeName: "Shared Store", storeAddress: "5 Shared Road" },
    { ...exactStoreInventory({ state: "TN", storeId: "source-b", city: "Nashville", alertable: true }), storeName: "Shared Store", storeAddress: "5 Shared Road" },
  ],
});
const duplicateIdentityTennessee = duplicateIdentityContract.states.find((state) => state.code === "TN");
assert.ok(duplicateIdentityTennessee);
assert.equal(duplicateIdentityTennessee.freshness.observedInventoryStores, 1, "source-specific IDs for the same exact address deduplicate to one observed store");
assert.equal(duplicateIdentityTennessee.freshness.currentInventoryStores, 1, "source-specific IDs for the same exact address deduplicate to one current store");

const transitiveDuplicateContract = buildCoverageContract({
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "TN", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 3 }],
  drops: [
    { ...exactStoreInventory({ state: "TN", storeId: "transitive-a", city: "Nashville", alertable: true }), storeName: "Bridge Alpha", storeAddress: "10 North Main Street" },
    { ...exactStoreInventory({ state: "TN", storeId: "transitive-b", city: "Nashville", alertable: true }), source: "Bridge source", storeName: "Bridge Beta", storeAddress: "11 State Street" },
    { ...exactStoreInventory({ state: "TN", storeId: "transitive-b", city: "Nashville", alertable: true }), source: "Bridge source", storeName: "Bridge Beta", storeAddress: "10 N Main St" },
  ],
});
const transitiveTennessee = transitiveDuplicateContract.states.find((state) => state.code === "TN");
assert.ok(transitiveTennessee);
assert.equal(transitiveTennessee.freshness.currentInventoryStores, 2, "a conflicting source/address bridge is quarantined instead of collapsing two current stores");

const staleBridgeContract = buildCoverageContract({
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "TN", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 3 }],
  drops: [
    { ...exactStoreInventory({ state: "TN", storeId: "bridge-current-a", city: "Nashville", alertable: true }), storeName: "Bridge Alpha", storeAddress: "10 North Main Street" },
    { ...exactStoreInventory({ state: "TN", storeId: "bridge-current-b", city: "Nashville", alertable: true }), source: "Bridge source", storeName: "Bridge Beta", storeAddress: "11 State Street" },
    { ...exactStoreInventory({ state: "TN", storeId: "bridge-current-b", city: "Nashville", stale: true }), source: "Bridge source", storeName: "Bridge Beta", storeAddress: "10 N Main St" },
  ],
});
const staleBridgeTennessee = staleBridgeContract.states.find((state) => state.code === "TN");
assert.ok(staleBridgeTennessee);
assert.equal(staleBridgeTennessee.freshness.observedInventoryStores, 2, "a stale bridge with conflicting source/address evidence remains quarantined");
assert.equal(staleBridgeTennessee.freshness.currentInventoryStores, 2, "a stale bridge cannot transfer currentness across a conflicting physical address");
assert.equal(staleBridgeTennessee.freshness.alertEligibleStores, 2, "a stale bridge cannot transfer alertability across a conflicting physical address");

const sameNameSeparateStoresContract = buildCoverageContract({
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "TN", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 2 }],
  drops: [
    { ...exactStoreInventory({ state: "TN", storeId: "chain-east", city: "Nashville", alertable: true }), storeName: "Chain Bottle Shop", storeAddress: "1 East Main Street" },
    { ...exactStoreInventory({ state: "TN", storeId: "chain-west", city: "Nashville", alertable: true }), storeName: "Chain Bottle Shop", storeAddress: "2 West Main Street" },
    { ...exactStoreInventory({ state: "TN", storeId: "chain-ambiguous", city: "Nashville", stale: true }), storeId: undefined, storeName: "Chain Bottle Shop", storeAddress: undefined },
  ],
});
const sameNameSeparateTennessee = sameNameSeparateStoresContract.states.find((state) => state.code === "TN");
assert.ok(sameNameSeparateTennessee);
assert.equal(sameNameSeparateTennessee.freshness.observedInventoryStores, 2, "an ambiguous name-only row cannot alter exact-store counts");
assert.equal(sameNameSeparateTennessee.freshness.currentInventoryStores, 2, "same-name stores in one city remain distinct when stable IDs and addresses disagree");

const sameStreetDifferentCityContract = buildCoverageContract({
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "TN", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 2 }],
  drops: [
    { ...exactStoreInventory({ state: "TN", storeId: "street-nashville", city: "Nashville", alertable: true }), storeId: undefined, source: "City source", storeName: "Main Street Shop", storeAddress: "1 Main Street" },
    { ...exactStoreInventory({ state: "TN", storeId: "street-tucson", city: "Memphis", alertable: true }), storeId: undefined, source: "City source", storeName: "Main Street Shop", storeAddress: "1 Main Street" },
  ],
});
const sameStreetDifferentCityTennessee = sameStreetDifferentCityContract.states.find((state) => state.code === "TN");
assert.ok(sameStreetDifferentCityTennessee);
assert.equal(sameStreetDifferentCityTennessee.freshness.observedInventoryStores, 2, "the same street address in different cities cannot merge");
assert.equal(sameStreetDifferentCityTennessee.freshness.currentInventoryStores, 2);

const sameNameStoreSearch = searchCoverageTargets({
  stateCode: "TN",
  query: "Chain Bottle Shop",
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "TN", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 1 }],
  locations: [
    { id: "chain-east", state: "TN", type: "store", name: "Chain Bottle Shop", address: "1 East Main Street", city: "Nashville", source: "Tennessee inventory", searchable: true, collectorAttached: true, hasSignals: true },
    { id: "chain-west", state: "TN", type: "store", name: "Chain Bottle Shop", address: "2 West Main Street", city: "Nashville", source: "Tennessee inventory", searchable: true, collectorAttached: true, hasSignals: true },
  ],
  drops: [{ ...exactStoreInventory({ state: "TN", storeId: "chain-east", city: "Nashville", alertable: true }), storeName: "Chain Bottle Shop", storeAddress: "1 East Main Street" }],
});
assert.equal(sameNameStoreSearch.find((result) => result.storeId === "chain-east")?.status, "actively-monitored", "the exact matching store remains active in search");
assert.equal(sameNameStoreSearch.find((result) => result.storeId === "chain-west")?.status, "known-expansion-candidate", "a same-name store with a different address cannot inherit another store's live status");

const hiddenDefaultFeedContract = buildCoverageContract({
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "TN", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 1 }],
  drops: [{ ...exactStoreInventory({ state: "TN", storeId: "feed-hidden", city: "Nashville", alertable: true }), tier: "standard", rarity_tier: "standard" }],
});
const hiddenDefaultFeedTennessee = hiddenDefaultFeedContract.states.find((state) => state.code === "TN");
assert.ok(hiddenDefaultFeedTennessee);
assert.equal(hiddenDefaultFeedTennessee.freshness.currentInventoryStores, 0, "a row hidden by the normal Drop Feed cannot become a current monitored store");
assert.equal(hiddenDefaultFeedTennessee.coverageDepth, "not-available", "a row hidden by the normal Drop Feed cannot establish coverage depth");

const unqualifiedIdOnlyContract = buildCoverageContract({
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "TN", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 1 }],
  drops: [{ ...exactStoreInventory({ state: "TN", storeId: "unqualified-only", city: "Nashville", alertable: true }), source: undefined, storeAddress: undefined }],
});
const unqualifiedIdOnlyTennessee = unqualifiedIdOnlyContract.states.find((state) => state.code === "TN");
assert.ok(unqualifiedIdOnlyTennessee);
assert.equal(unqualifiedIdOnlyTennessee.freshness.observedInventoryStores, 0, "an ID without a source or address is not exact-store evidence");
assert.equal(unqualifiedIdOnlyTennessee.freshness.currentInventoryStores, 0);
assert.equal(unqualifiedIdOnlyTennessee.freshness.alertEligibleStores, 0);

const malformedAddressContract = buildCoverageContract({
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "TN", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 1 }],
  drops: [{ ...exactStoreInventory({ state: "TN", storeId: "malformed-address", city: "Nashville", alertable: true }), storeId: undefined, source: "Malformed source", storeAddress: "---" }],
});
const malformedAddressTennessee = malformedAddressContract.states.find((state) => state.code === "TN");
assert.ok(malformedAddressTennessee);
assert.equal(malformedAddressTennessee.freshness.observedInventoryStores, 0, "punctuation-only addresses are not exact-store identities");
assert.equal(malformedAddressTennessee.freshness.currentInventoryStores, 0);
assert.equal(malformedAddressTennessee.freshness.alertEligibleStores, 0);

const placeholderOrUnscopedAddressContract = buildCoverageContract({
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "TN", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 3 }],
  drops: [
    { ...exactStoreInventory({ state: "TN", storeId: "placeholder-unknown", city: "Nashville", alertable: true }), storeId: undefined, storeAddress: "unknown" },
    { ...exactStoreInventory({ state: "TN", storeId: "placeholder-na", city: "Nashville", alertable: true }), storeId: undefined, storeAddress: "N/A" },
    { ...exactStoreInventory({ state: "TN", storeId: "no-city", city: "", alertable: true }), storeId: undefined, storeAddress: "1 Main Street" },
    { ...exactStoreInventory({ state: "TN", storeId: "numeric-city", city: "12345", alertable: true }), storeId: undefined, storeAddress: "1 Main Street" },
    { ...exactStoreInventory({ state: "TN", storeId: "numeric-only-street", city: "Nashville", alertable: true }), storeId: undefined, storeAddress: "123" },
    { ...exactStoreInventory({ state: "TN", storeId: "placeholder-street", city: "Nashville", alertable: true }), storeId: undefined, storeAddress: "123 placeholder" },
    { ...exactStoreInventory({ state: "TN", storeId: "placeholder-source", city: "Nashville", alertable: true }), source: "placeholder", storeAddress: undefined },
    { ...exactStoreInventory({ state: "TN", storeId: "null-id", city: "Nashville", alertable: true }), source: "Verified source", storeId: "null", storeAddress: undefined },
  ],
});
const placeholderOrUnscopedTennessee = placeholderOrUnscopedAddressContract.states.find((state) => state.code === "TN");
assert.ok(placeholderOrUnscopedTennessee);
assert.equal(placeholderOrUnscopedTennessee.freshness.observedInventoryStores, 0, "placeholder and city-less addresses cannot become exact-store evidence");
assert.equal(placeholderOrUnscopedTennessee.freshness.currentInventoryStores, 0);
assert.equal(placeholderOrUnscopedTennessee.freshness.alertEligibleStores, 0);

const conflictingSourceSearch = searchCoverageTargets({
  stateCode: "TN",
  query: "Source Collision Shop",
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "TN", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 1 }],
  locations: [{ id: "TN:source:source-a-inventory:id:shared-store-id", state: "TN", type: "store", name: "Source Collision Shop", address: "2 West Main Street", city: "Nashville", source: "Source B Inventory", searchable: true, collectorAttached: true, hasSignals: true }],
  drops: [{ ...exactStoreInventory({ state: "TN", storeId: "shared-store-id", city: "Nashville", alertable: true }), source: "Source A Inventory", storeName: "Source Collision Shop", storeAddress: "1 East Main Street" }],
});
const conflictingDynamicStore = conflictingSourceSearch.find((result) => result.address === "1 East Main Street");
assert.equal(conflictingSourceSearch.find((result) => result.address === "2 West Main Street")?.status, "known-expansion-candidate", "a raw ID from another source cannot mark a conflicting address active");
assert.equal(conflictingDynamicStore?.status, "actively-monitored", "the source-qualified current record remains discoverable as its own store");
assert.ok(conflictingDynamicStore?.storeId?.includes(":source:source-a-inventory:id:shared-store-id"), "the dynamic result exposes a source-qualified request identity");
const conflictingDynamicTarget = findCoverageStoreTarget({
  stateCode: "TN",
  storeId: conflictingDynamicStore?.storeId || "",
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "TN", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 1 }],
  locations: [{ id: "TN:source:source-a-inventory:id:shared-store-id", state: "TN", type: "store", name: "Source Collision Shop", address: "2 West Main Street", city: "Nashville", source: "Source B Inventory", searchable: true, collectorAttached: true, hasSignals: true }],
  drops: [{ ...exactStoreInventory({ state: "TN", storeId: "shared-store-id", city: "Nashville", alertable: true }), source: "Source A Inventory", storeName: "Source Collision Shop", storeAddress: "1 East Main Street" }],
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
  state: "TN",
  source: "verified-retailer",
  retailerReported: true,
  retailerSignalState: "live",
  type: "verified_retailer_drop",
  storeId: "tn-retailer-search",
  storeName: "Canyon Bottle Shop",
  storeAddress: "99 Canyon Way, Nashville, TN 37201",
  locationPrecision: "store_level",
  canAlertAsInventory: true,
  expiresAt: "2026-08-03T14:00:00.000Z",
}];
const retailerSearchInputs = {
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "TN", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 1 }],
  drops: retailerSearchDrops,
};
const retailerSearch = searchCoverageTargets({ stateCode: "TN", query: "Canyon", ...retailerSearchInputs });
const retailerSearchResult = retailerSearch.find((result) => result.kind === "store" && result.status === "actively-monitored");
assert.ok(retailerSearchResult?.storeId, "a retailer-only current store is searchable under the canonical evidence contract");
assert.notEqual(retailerSearchResult.storeId, "tn-retailer-search", "dynamic retailer targets use a source-qualified identity instead of a raw ID");
const retailerTarget = findCoverageStoreTarget({ stateCode: "TN", storeId: retailerSearchResult.storeId, ...retailerSearchInputs });
assert.equal(retailerTarget?.id, retailerSearchResult.storeId, "the request lookup resolves the same canonical dynamic store identity");
assert.equal(retailerTarget?.city, "Nashville", "retailer address evidence supplies a searchable city when no separate city field is present");

const healthLimitedSearch = searchCoverageTargets({
  stateCode: "TN",
  query: "Nashville",
  lifecycle,
  asOf: AS_OF,
  healthLimited: true,
  stateRows: [{ state: "TN", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 1 }],
  locations: [{ id: "health-limited-nashville", state: "TN", type: "store", name: "Health Limited Spirits", address: "1 Nashville Road", city: "Nashville", source: "Tennessee inventory", searchable: true, collectorAttached: true, hasSignals: true }],
  drops: [exactStoreInventory({ state: "TN", storeId: "health-limited-nashville", city: "Nashville", alertable: true })],
});
assert.ok(healthLimitedSearch.some((result) => result.kind === "city" && result.status === "known-not-active"), "health-limited evidence cannot make a city look currently covered");
assert.equal(healthLimitedSearch.some((result) => result.status === "covered" || result.status === "actively-monitored"), false, "health-limited evidence cannot emit current-availability search copy");
const healthLimitedCoverageState = buildCoverageContract({
  lifecycle,
  asOf: AS_OF,
  healthLimited: true,
  stateRows: [{ state: "TN", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 1 }],
  locations: [{ id: "health-limited-nashville", state: "TN", type: "store", name: "Health Limited Spirits", address: "1 Nashville Road", city: "Nashville", source: "Tennessee inventory", searchable: true, collectorAttached: true, hasSignals: true }],
  drops: [exactStoreInventory({ state: "TN", storeId: "health-limited-nashville", city: "Nashville", alertable: true })],
}).states.find((state) => state.code === "TN");
assert.equal(healthLimitedCoverageState?.freshness.currentInventoryCities, 0, "health-limited states cannot expose a current-city freshness footprint");

const conflictingPremiseInputs = {
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "TN", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 2 }],
  drops: [
    { ...exactStoreInventory({ state: "TN", storeId: "shared-source-id", city: "Nashville", alertable: true }), source: "Collision source", storeName: "Collision East", storeAddress: "101 East Main Street" },
    { ...exactStoreInventory({ state: "TN", storeId: "shared-source-id", city: "Nashville", alertable: true }), source: "Collision source", storeName: "Collision West", storeAddress: "102 West Main Street" },
  ],
  locations: [{ id: "shared-source-id", state: "TN", type: "store", name: "Collision Directory", city: "Nashville", source: "Collision source", searchable: true, collectorAttached: true, hasSignals: true }],
};
const conflictingPremiseSearch = searchCoverageTargets({ stateCode: "TN", query: "Collision", ...conflictingPremiseInputs });
const conflictingPremiseStores = conflictingPremiseSearch.filter((result) => result.kind === "store" && result.status === "actively-monitored");
assert.equal(conflictingPremiseStores.length, 2, "conflicting source-ID premises remain two current stores");
assert.equal(new Set(conflictingPremiseStores.map((result) => result.storeId)).size, 2, "conflicting source-ID premises receive collision-safe request targets");
assert.notEqual(conflictingPremiseSearch.find((result) => result.label === "Collision Directory")?.status, "actively-monitored", "an address-less directory record cannot resolve an ambiguous reused source ID as current");
for (const result of conflictingPremiseStores) {
  assert.ok(result.storeId);
  const resolved = findCoverageStoreTarget({ stateCode: "TN", storeId: result.storeId, ...conflictingPremiseInputs });
  assert.equal(resolved?.address, result.address, "each collision-safe request target resolves its own physical premise");
}

const addresslessBridgeContract = buildCoverageContract({
  lifecycle,
  asOf: AS_OF,
  stateRows: [{ state: "TN", publicStatus: "active", status: "useful", coverageTier: "live_store_inventory", bestLocationPrecision: "store_level", signalCount: 3 }],
  drops: [
    { ...exactStoreInventory({ state: "TN", storeId: "ambiguous-bridge", city: "Nashville", alertable: true }), source: "Bridge source", storeAddress: "10 Main Street" },
    { ...exactStoreInventory({ state: "TN", storeId: "ambiguous-bridge", city: "Nashville", alertable: true }), source: "Bridge source", storeAddress: undefined },
    { ...exactStoreInventory({ state: "TN", storeId: "ambiguous-bridge", city: "Nashville", alertable: true }), source: "Bridge source", storeAddress: "11 Main Street" },
  ],
});
const addresslessBridgeTennessee = addresslessBridgeContract.states.find((state) => state.code === "TN");
assert.ok(addresslessBridgeTennessee);
assert.equal(addresslessBridgeTennessee.freshness.observedInventoryStores, 2, "an address-less row cannot bridge two conflicting source-ID premises");
assert.equal(addresslessBridgeTennessee.freshness.currentInventoryStores, 2, "an address-less bridge cannot transfer currentness across premises");
assert.equal(addresslessBridgeTennessee.freshness.alertEligibleStores, 2, "an address-less bridge cannot transfer alert eligibility across premises");

assert.equal(
  publicEvidenceAddressKey("NC", "106 Bantiff Way, Greensboro, NC, 27406", "Greensboro"),
  publicEvidenceAddressKey("NC", "106 Bantiff Way", "Greensboro"),
  "an optional comma before ZIP does not split the same exact-store address identity",
);

console.log("coverage depth and freshness contract tests passed");

const originalCard = { ...exactStoreInventory({ state: 'PA', storeId: 'clock-test', city: 'Philadelphia', alertable: true }), lastConfirmedAt: '2026-08-02T10:00:00.000Z', timestamp: AS_OF };
const historicalCard = projectInventoryEvidenceFreshness(originalCard, AS_OF);
assert.equal(historicalCard.canAlertAsInventory, false);
assert.equal(historicalCard.sourceStale, true);
assert.equal(historicalCard.lastConfirmedAt, originalCard.lastConfirmedAt);
assert.equal(historicalCard.timestamp, originalCard.timestamp);
assert.equal(originalCard.canAlertAsInventory, true, 'response projection must not mutate cached data');
assert.equal(projectInventoryEvidenceFreshness({ ...originalCard, state: 'OH' }, AS_OF).canAlertAsInventory, true, 'Ohio remains unchanged');

const runtimeOnly = { ...exactStoreInventory({ state: 'TN', storeId: 'accepted-runtime', city: 'Nashville', alertable: true }), sourcePollId: 'tn:fixture' };
const acceptedRuntimeContract = buildCoverageContract({ lifecycle, asOf: AS_OF, stateRows: [{ state: 'TN', publicStatus: 'active', status: 'partial_useful', coverageTier: 'live_store_inventory', signalCount: 2, bestLocationPrecision: 'store_level' }], degradedStates: [{ state: 'TN', status: 'partial_useful' }], drops: [runtimeOnly, exactStoreInventory({ state: 'TN', storeId: 'unaccepted-sibling', city: 'Nashville', alertable: true })] });
assert.equal(acceptedRuntimeContract.states.find(state => state.code === 'TN')?.freshness.currentInventoryStores, 1, 'only accepted runtime evidence survives a degraded snapshot');
const expiredRuntimeContract = buildCoverageContract({ lifecycle, asOf: AS_OF, stateRows: [{ state: 'TN', publicStatus: 'active', status: 'partial_useful', coverageTier: 'live_store_inventory', signalCount: 1 }], degradedStates: [{ state: 'TN', status: 'partial_useful' }], drops: [{ ...runtimeOnly, stale: true }] });
assert.equal(expiredRuntimeContract.states.find(state => state.code === 'TN')?.freshness.currentInventoryStores, 0);
