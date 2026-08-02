import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STATE_LIFECYCLE_CONFIG } from "../src/config/stateLifecycle.ts";
import {
  buildCoverageContract,
  findCoverageStoreTarget,
  searchCoverageTargets,
  type CoverageLocationInput,
  type CoverageStateRowInput,
  type CoverageStoreInput,
} from "../src/lib/coverage-model.ts";
import { mergeCoverageStores } from "../src/lib/coverage-known-stores.ts";
import { buildMississippiKnownStoresPayload, verifyReviewedMississippiUniverse } from "./generate-mississippi-known-stores.mjs";
import { buildNcBoardCoverageSummary } from "../engine/src/nc-coverage-summary.mjs";

const statsPayload = JSON.parse(readFileSync(new URL("../engine/out/site/stats.json", import.meta.url), "utf8")) as {
  generatedAt?: string;
  refreshHealth?: { degradedStates?: Array<Record<string, unknown>> };
  stateCoverage?: { states?: CoverageStateRowInput[] };
  ncBoardIntelligence?: {
    boardCount?: number;
    officialStoreCount?: number;
    representedAreaCount?: number;
    boardsWithTrackedShipments?: number;
    singleStoreShipmentBoardCount?: number;
  };
};
const locationsPayload = JSON.parse(readFileSync(new URL("../engine/out/site/locations.json", import.meta.url), "utf8")) as {
  locations?: CoverageLocationInput[];
};
const storesPayload = JSON.parse(readFileSync(new URL("../engine/out/site/stores.json", import.meta.url), "utf8")) as {
  stores?: CoverageStoreInput[];
};
const dropsPayload = JSON.parse(readFileSync(new URL("../engine/out/site/drops.json", import.meta.url), "utf8")) as {
  drops?: Array<Record<string, unknown>>;
};
const mississippiKnownStoresPayload = JSON.parse(readFileSync(new URL("../src/config/mississippi-known-stores.json", import.meta.url), "utf8")) as {
  stores?: CoverageStoreInput[];
};
const mississippiCapture = JSON.parse(readFileSync(new URL("../engine/data/source-captures/MS-package-retailers-2026-07-26.json", import.meta.url), "utf8"));
const mississippiProgram = JSON.parse(readFileSync(new URL("../src/config/mississippi-program.json", import.meta.url), "utf8"));
const mississippiUniverse = JSON.parse(readFileSync(new URL("../engine/data/store-universe/MS.json", import.meta.url), "utf8"));
const publicStores = mergeCoverageStores(
  mississippiKnownStoresPayload.stores || [],
  storesPayload.stores || [],
);
const ncIntelligencePayload = JSON.parse(readFileSync(new URL("../engine/out/site/nc-intelligence.json", import.meta.url), "utf8")) as {
  boards?: Array<{ boardName?: string; trackedShipmentRows?: number }>;
  coverage?: { withTrackedShipments?: number; withWebsite?: number; withReleasePages?: number; withInventoryPages?: number };
  sourcePolicy?: string;
};
const canonicalNcBoardIntelligence = buildNcBoardCoverageSummary(locationsPayload.locations || [], ncIntelligencePayload);
assert.ok(canonicalNcBoardIntelligence, "NC exporter summary must be derived from the canonical directory and board intelligence payload");

const contract = buildCoverageContract({
  lifecycle: STATE_LIFECYCLE_CONFIG,
  stateRows: statsPayload.stateCoverage?.states || [],
  locations: locationsPayload.locations || [],
  stores: publicStores,
  drops: dropsPayload.drops || [],
  degradedStates: statsPayload.refreshHealth?.degradedStates || [],
  generatedAt: statsPayload.generatedAt,
  asOf: statsPayload.generatedAt,
  ncBoardIntelligence: canonicalNcBoardIntelligence,
});
const baselineNcContract = buildCoverageContract({
  lifecycle: STATE_LIFECYCLE_CONFIG,
  stateRows: statsPayload.stateCoverage?.states || [],
  locations: locationsPayload.locations || [],
  stores: publicStores,
  drops: dropsPayload.drops || [],
  degradedStates: statsPayload.refreshHealth?.degradedStates || [],
  generatedAt: statsPayload.generatedAt,
  asOf: statsPayload.generatedAt,
});

assert.equal(contract.contractVersion, "bourbon-signal/coverage@2");
assert.equal(contract.evaluatedAt, statsPayload.generatedAt);
assert.equal(contract.states.length, 51, "all 50 states and DC share one coverage truth");
assert.equal(new Set(contract.states.map((state) => state.code)).size, 51, "state codes are unique");
assert.ok(contract.states.some((state) => state.code === "DC" && state.name === "District of Columbia"));
assert.ok(contract.states.every((state) => ["deep", "active", "focused", "intelligence", "not-active"].includes(state.capability)));
assert.ok(contract.states.every((state) => ["current", "intermittent", "temporarily-limited", "no-recent-update"].includes(state.health)));
assert.ok(contract.states.every((state) => state.layers.known >= state.layers.probeable));
assert.ok(contract.states.every((state) => state.layers.probeable >= state.layers.live));
assert.ok(contract.states.every((state) => state.layers.live >= state.layers.alertGrade));

const tennesseeSignalUpgrade = buildCoverageContract({
  lifecycle: STATE_LIFECYCLE_CONFIG,
  stateRows: [{ state: "TN", publicStatus: "active", status: "useful", signalCount: 5, bestLocationPrecision: "store_level" }],
  locations: [
    { id: "tn-cityhive-test", state: "TN", type: "store", name: "Reviewed CityHive Store", address: "1 Main St", city: "Franklin", source: "Tennessee reviewed exact-store identity", collectorAttached: true, hasSignals: false },
    { id: "tn-cool-springs-test", state: "TN", type: "store", name: "Cool Springs Wine & Spirits", address: "2 Main St", city: "Franklin", source: "Tennessee reviewed exact-store identity", collectorAttached: true, hasSignals: false },
  ],
  stores: [
    { id: "tn-cityhive-test", state: "TN", name: "Reviewed CityHive Store", address: "1 Main St", city: "Franklin", source: "Reviewed CityHive store inventory", signalCount: 3 },
    { id: "tn-cool-springs-test", state: "TN", name: "Cool Springs Wine & Spirits", address: "2 Main St", city: "Franklin", source: "Cool Springs Wine & Spirits public catalog API", signalCount: 2 },
  ],
});
const upgradedTennessee = tennesseeSignalUpgrade.states.find((state) => state.code === "TN");
assert.ok(upgradedTennessee);
assert.equal(upgradedTennessee.layers.live, 0, "configured Tennessee stores alone cannot claim current inventory monitoring");
assert.equal(upgradedTennessee.layers.alertGrade, 0, "configured Tennessee stores alone cannot claim alert eligibility");

const tennesseeFreshSignalUpgrade = buildCoverageContract({
  lifecycle: STATE_LIFECYCLE_CONFIG,
  stateRows: [{ state: "TN", publicStatus: "active", status: "useful", signalCount: 5, bestLocationPrecision: "store_level" }],
  locations: [
    { id: "tn-cityhive-test", state: "TN", type: "store", name: "Reviewed CityHive Store", address: "1 Main St", city: "Franklin", source: "Tennessee reviewed exact-store identity", collectorAttached: true, hasSignals: false },
    { id: "tn-cool-springs-test", state: "TN", type: "store", name: "Cool Springs Wine & Spirits", address: "2 Main St", city: "Franklin", source: "Tennessee reviewed exact-store identity", collectorAttached: true, hasSignals: false },
  ],
  stores: [
    { id: "tn-cityhive-test", state: "TN", name: "Reviewed CityHive Store", address: "1 Main St", city: "Franklin", source: "Reviewed CityHive store inventory", signalCount: 3 },
    { id: "tn-cool-springs-test", state: "TN", name: "Cool Springs Wine & Spirits", address: "2 Main St", city: "Franklin", source: "Cool Springs Wine & Spirits public catalog API", signalCount: 2 },
  ],
  drops: [
    { state: "TN", type: "retailer_store_inventory_result", source: "Reviewed CityHive store inventory", tier: "limited", rarity_tier: "limited", storeId: "tn-cityhive-test", storeName: "Reviewed CityHive Store", storeAddress: "1 Main St", city: "Franklin", locationPrecision: "store_level", signalCategory: "inventory", availabilityScope: "store_reported", canAlertAsInventory: true, quantity: 1, observedAt: "2026-08-02T13:00:00.000Z", lastConfirmedAt: "2026-08-02T13:00:00.000Z" },
    { state: "TN", type: "retailer_store_inventory_result", source: "Cool Springs Wine & Spirits public catalog API", tier: "limited", rarity_tier: "limited", storeId: "tn-cool-springs-test", storeName: "Cool Springs Wine & Spirits", storeAddress: "2 Main St", city: "Franklin", locationPrecision: "store_level", signalCategory: "inventory", availabilityScope: "store_reported", canAlertAsInventory: true, quantity: 1, observedAt: "2026-08-02T13:00:00.000Z", lastConfirmedAt: "2026-08-02T13:00:00.000Z" },
  ],
  asOf: "2026-08-02T14:00:00.000Z",
});
const freshTennessee = tennesseeFreshSignalUpgrade.states.find((state) => state.code === "TN");
assert.ok(freshTennessee);
assert.equal(freshTennessee.layers.live, 2, "fresh Tennessee exact-store signals produce live monitoring");
assert.equal(freshTennessee.layers.alertGrade, 2, "fresh Tennessee exact-store signals produce alert eligibility");

assert.ok(contract.states.every((state) => ["active", "moderate", "sparse", "not-available"].includes(state.coverageDepth)));
assert.ok(contract.states.every((state) => state.layers.live === state.freshness.currentInventoryStores));
assert.ok(contract.states.every((state) => state.layers.alertGrade === state.freshness.alertEligibleStores));
assert.ok(contract.states.every((state) => state.scope.inventoryMonitoredStores === state.freshness.currentInventoryStores));
assert.ok(contract.states.every((state) => state.monitoredStoreCount === state.scope.inventoryMonitoredStores));
assert.ok(contract.states.every((state) => state.freshness.currentInventoryStores <= state.freshness.observedInventoryStores));
assert.ok(contract.states.every((state) => state.freshness.alertEligibleStores <= state.freshness.currentInventoryStores));
assert.ok(contract.states.every((state) => (
  state.capabilities.currentBottleAvailability === (state.freshness.currentInventoryStores > 0)
)));
assert.ok(contract.states.every((state) => (
  state.capabilities.restockAlerts === (state.freshness.alertEligibleStores > 0)
)));
assert.ok(contract.states.every((state) => (
  state.coverageStatus === "not-available" ? state.coverageDepth === "not-available" : state.coverageDepth !== "not-available"
)));
for (const [code, areas, summaryArea] of [["NY", ["Nassau County", "New York City"], "New York City"], ["CO", ["Denver Metro"], "Denver Metro"]] as const) {
  const metro = contract.states.find((state) => state.code === code);
  assert.ok(metro, `${code} must be present in the national coverage contract`);
  assert.equal(metro.coverageDepth, "not-available", `${code} has no fresh customer-feed evidence at the captured snapshot`);
  assert.deepEqual(metro.areas, areas);
  assert.match(metro.summary, /no fresh customer-facing monitoring/i);
  assert.match(metro.cannotSee.join(" "), /no current|statewide|outside|limited|not.*state/i);
}

const maryland = contract.states.find((state) => state.code === "MD");
assert.ok(maryland, "Maryland is customer-facing under its real state code");
assert.equal(contract.states.some((state) => state.code === "MD-MONTGOMERY"), false);
assert.equal(maryland.name, "Maryland");
assert.deepEqual(maryland.areas, ["Montgomery County"]);
assert.equal(maryland.coverageDepth, "sparse");
assert.match(maryland.summary, /Montgomery County/i);
assert.match(maryland.cannotSee.join(" "), /exact (?:per-)?store|shelf/i);

const mississippi = contract.states.find((state) => state.code === "MS");
assert.ok(mississippi, "Mississippi is represented in the public nationwide coverage contract");
assert.equal(mississippi.coverageDepth, "not-available", "reviewed Mississippi directory records do not create current coverage depth without fresh output");
assert.deepEqual(mississippi.layers, {
  known: 690,
  probeable: 11,
  catalogWatch: 1,
  live: 0,
  alertGrade: 0,
});
assert.equal(mississippi.freshness.currentInventoryStores, 0, "no current exact-store output means Mississippi cannot claim current availability");
assert.equal(mississippi.representedAreaCount, 0, "configured Mississippi areas do not inflate the current evidence footprint");
assert.match(mississippi.summary, /Known directory locations.*no fresh customer-facing monitoring/i);
assert.match(mississippi.sourceLabel || "", /exact-store retailer inventory/i);
assert.match(mississippi.canSee.join(" "), /Known directory locations/i);
assert.match(mississippi.cannotSee.join(" "), /No current source-backed monitoring/i);
assert.equal(mississippiKnownStoresPayload.stores?.length, 690);
assert.equal(new Set((mississippiKnownStoresPayload.stores || []).map((store) => store.id)).size, 690);
assert.doesNotThrow(() => verifyReviewedMississippiUniverse(mississippiUniverse, mississippiCapture, mississippiProgram));
assert.deepEqual(mississippiKnownStoresPayload, buildMississippiKnownStoresPayload(mississippiUniverse), "published Mississippi known stores cannot drift from the reviewed universe payload");
const tamperedMississippiUniverse = structuredClone(mississippiUniverse);
tamperedMississippiUniverse.stores[0].address = "999 Tampered Identity Rd";
assert.throws(
  () => verifyReviewedMississippiUniverse(tamperedMississippiUniverse, mississippiCapture, mississippiProgram),
  /byte-equivalent identities/iu,
);
const reviewedMississippiStore = (mississippiKnownStoresPayload.stores || []).find((store) => store.id === "ms-permit-046478");
assert.ok(reviewedMississippiStore);
const collisionProtectedStores = mergeCoverageStores([reviewedMississippiStore], [{
  id: "ms-permit-046478",
  state: "MS",
  name: "Wrong Store",
  address: "999 Attacker Rd",
  city: "Jackson",
  county: "Hinds",
  source: "live inventory",
  signalCount: 99,
}]);
assert.deepEqual(collisionProtectedStores[0], reviewedMississippiStore, "runtime ID collisions cannot replace reviewed Mississippi store identity");

const mississippiStoreSearch = searchCoverageTargets({
  lifecycle: STATE_LIFECYCLE_CONFIG,
  stateCode: "MS",
  query: "A Liquor Warehouse",
  stores: publicStores,
});
assert.ok(mississippiStoreSearch.some((result) => result.kind === "store"
  && result.storeId === "ms-permit-046478"
  && result.status === "known-expansion-candidate"));
const mississippiCitySearch = searchCoverageTargets({
  lifecycle: STATE_LIFECYCLE_CONFIG,
  stateCode: "MS",
  query: "Winona",
  stores: publicStores,
});
assert.ok(mississippiCitySearch.some((result) => result.kind === "city"
  && result.label === "WINONA"
  && result.status === "known-not-active"));

const northCarolina = contract.states.find((state) => state.code === "NC");
assert.ok(northCarolina);
assert.equal(northCarolina.coverageDepth, "active", "broad board leads plus selected exact stores are active coverage without implying statewide shelf inventory");
assert.ok(northCarolina.layers.live < northCarolina.layers.known, "NC store-locator records stay separate from monitored inventory stores");
assert.equal(northCarolina.scope.knownBoards, 173, "NC coverage must expose every current official ABC board separately from stores");
assert.equal(northCarolina.scope.shipmentBoards, 160, "NC coverage must count fresh canonical boards represented by current shipment output");
assert.equal(northCarolina.scope.searchableStores, 465, "NC coverage must expose the official searchable store directory without inflating it with signal records");
assert.equal(northCarolina.scope.inventoryMonitoredStores, 47, "NC coverage must count exact-store inventory sources independently from the official directory");
assert.equal(northCarolina.scope.singleStoreShipmentBoards, 0, "configured one-store board counts cannot stand in for fresh store-equivalent shipment rows");
assert.equal(northCarolina.layers.live, northCarolina.scope.inventoryMonitoredStores, "single-store shipment leads must not inflate direct inventory monitoring");
assert.equal(northCarolina.layers.alertGrade, baselineNcContract.states.find((state) => state.code === "NC")?.layers.alertGrade, "single-store shipment leads must never increase alert-grade shelf inventory");
assert.equal(northCarolina.representedAreaCount, 319, "NC area count must come from fresh current board/store evidence rather than configured directory areas");

const boardOnlyNorthCarolina = buildCoverageContract({
  lifecycle: STATE_LIFECYCLE_CONFIG,
  stateRows: [{
    state: "NC",
    publicStatus: "active",
    status: "stale_blocked",
    coverageTier: "live_store_inventory",
    refinementLevel: "board",
    customerSummary: "Official board shipment information.",
  }],
  ncBoardIntelligence: {
    boardCount: 173,
    officialStoreCount: 465,
    boardsWithTrackedShipments: 115,
    singleStoreShipmentBoardCount: 60,
  },
  asOf: "2026-08-02T14:00:00.000Z",
  drops: Array.from({ length: 25 }, (_, index) => ({
    state: "NC",
    type: "nc_board_shipment_snapshot",
    source: "nc_abc",
    tier: "allocated",
    rarity_tier: "allocated",
    locationPrecision: "board_county",
    boardName: `Fresh NC Board ${index + 1}`,
    city: `Fresh NC City ${index + 1}`,
    quantity: 1,
    observedAt: "2026-08-02T14:00:00.000Z",
    lastConfirmedAt: "2026-08-02T14:00:00.000Z",
  })),
});
const boardOnlyState = boardOnlyNorthCarolina.states.find((state) => state.code === "NC");
assert.ok(boardOnlyState);
assert.equal(boardOnlyState.coverageDepth, "active", "active board shipment coverage retains active depth even with no current shelf inventory");
assert.equal(boardOnlyState.coverageStatusLabel, "Coverage available", "the public status must describe coverage, not inventory depth");
assert.deepEqual(boardOnlyState.capabilities, {
  storeInformation: true,
  publicUpdates: true,
  currentBottleAvailability: false,
  restockAlerts: false,
}, "NC can have active shipment coverage without current availability or alerts");
assert.match(boardOnlyState.customerSummary || "", /shipment and release coverage is active/i, "the visible summary names the active shipment coverage");
assert.match(boardOnlyState.customerSummary || "", /does not confirm current bottle availability/i, "the visible summary states the inventory limitation");
assert.match((boardOnlyState.customerCannotSee || []).join(" "), /current bottle availability/i, "missing live inventory remains an explicit limitation");
assert.match(northCarolina.canSee.join(" "), /single-store board.*shipment/i);
assert.match(northCarolina.cannotSee.join(" "), /shipment.*(?:not|isn.t).*shelf|not.*shelf.*shipment/i);
assert.match(northCarolina.summary, /board/i);
assert.match(northCarolina.cannotSee.join(" "), /board.*(?:not|isn.t).*exact|not.*exact.*board/i);
assert.match(northCarolina.customerSummary || "", /current bottle availability/i);
assert.match((northCarolina.customerCanSee || []).join(" "), /shipment and release information/i);
assert.match((northCarolina.customerCanSee || []).join(" "), /current bottle availability/i);
if (northCarolina.layers.alertGrade === 0) {
  assert.match((northCarolina.customerCannotSee || []).join(" "), /restock alerts are not available/i);
}

const canonicalZeroContract = buildCoverageContract({
  lifecycle: STATE_LIFECYCLE_CONFIG,
  stateRows: statsPayload.stateCoverage?.states || [],
  locations: locationsPayload.locations || [],
  stores: publicStores,
  ncBoardIntelligence: {
    boardCount: 0,
    officialStoreCount: 0,
    representedAreaCount: 0,
    boardsWithTrackedShipments: 0,
    singleStoreShipmentBoardCount: 0,
  },
});
const canonicalZeroNc = canonicalZeroContract.states.find((state) => state.code === "NC");
assert.ok(canonicalZeroNc);
assert.equal(canonicalZeroNc.scope.searchableStores, 0, "a canonical zero searchable-store count must not fall back to broader known rows");
assert.equal(canonicalZeroNc.scope.shipmentBoards, 0, "a canonical zero shipment-board count must remain zero");

const coverageSearchInputs = {
  lifecycle: STATE_LIFECYCLE_CONFIG,
  stateRows: statsPayload.stateCoverage?.states || [],
  locations: locationsPayload.locations || [],
  stores: publicStores,
};
for (const boardName of new Set((ncIntelligencePayload.boards || []).map((board) => board.boardName).filter((name): name is string => Boolean(name)))) {
  const results = searchCoverageTargets({ ...coverageSearchInputs, stateCode: "NC", query: boardName, limit: 20 });
  assert.ok(results.some((result) => result.label === boardName && result.kind === "city"), `${boardName} must be findable as an NC board/area target`);
}
for (const area of northCarolina.areas) {
  const results = searchCoverageTargets({ ...coverageSearchInputs, stateCode: "NC", query: area, limit: 20 });
  assert.ok(results.some((result) => result.kind !== "unknown"), `${area} must be findable as a represented NC area`);
}
for (const location of (locationsPayload.locations || []).filter((entry) => entry.state === "NC" && (entry.type === "store" || entry.locationType === "store") && entry.searchable !== false)) {
  const query = location.address || [location.name, location.city].filter(Boolean).join(" ");
  const results = searchCoverageTargets({ ...coverageSearchInputs, stateCode: "NC", query, limit: 20 });
  assert.ok(results.some((result) => result.kind === "store" && result.storeId === location.id), `${location.name || location.id} must be findable as an NC store target`);
}

const iowa = contract.states.find((state) => state.code === "IA");
assert.ok(iowa);
assert.equal(iowa.coverageDepth, "active", "broad official delivery coverage is active without becoming live shelf inventory");
assert.equal(iowa.layers.live, 0, "delivery rows remain separate from live inventory");
assert.match(iowa.cannotSee.join(" "), /live shelf|current shelf/i);

const kentucky = contract.states.find((state) => state.code === "KY");
assert.ok(kentucky);
assert.equal(kentucky.coverageDepth, "sparse");
assert.match(kentucky.summary, /distillery/i);
assert.match(kentucky.cannotSee.join(" "), /retailer|store/i);

const illinois = contract.states.find((state) => state.code === "IL");
assert.ok(illinois);
assert.equal(illinois.coverageDepth, "active", "a broad selected-retailer network is active without implying statewide shelf guarantees");
assert.match(illinois.summary, /retailer/i);
assert.match(illinois.cannotSee.join(" "), /verify|guarantee|shelf/i);

const indiana = contract.states.find((state) => state.code === "IN");
assert.ok(indiana);
assert.equal(indiana.coverageDepth, "not-available", "stale direct-store evidence cannot retain current customer depth");
assert.ok(indiana.layers.live < indiana.layers.known, "ATC permit-spine stores are known locations, never live inventory");
assert.ok(indiana.layers.probeable < indiana.layers.known, "directory and permit rows are not labeled probeable without a monitoring source");
assert.ok(indiana.layers.live < 200, "only verified retailer inventory sources count as live in Indiana");

const texas = contract.states.find((state) => state.code === "TX");
assert.ok(texas);
assert.ok(texas.freshness.observedInventoryStores > 0, "Texas depth is based on observed exact-store evidence, not locator size");
assert.equal(texas.layers.live, texas.freshness.currentInventoryStores);

const ohio = contract.states.find((state) => state.code === "OH");
assert.ok(ohio);
assert.equal(ohio.coverageDepth, "not-available", "broad historical store evidence cannot retain current depth during a source issue");
assert.equal(ohio.health, "temporarily-limited");
assert.equal(ohio.layers.live, 0, "stale Ohio source evidence cannot claim current shelf availability");
assert.ok(ohio.freshness.observedInventoryStores > 0);
assert.equal(ohio.capabilityLabel, "Not available yet", "legacy capability labels cannot claim store information without fresh customer output");
assert.doesNotMatch(ohio.canSee.join(" "), /Current source-backed store monitoring/i, "legacy visibility copy cannot claim current monitoring after the freshness gate closes");

const warehouseState = contract.states.find((state) => state.code === "AZ");
assert.ok(warehouseState);
assert.equal(warehouseState.coverageDepth, "not-available", "configured warehouse watches do not create coverage depth without fresh output");

for (const stateCode of ["MN", "MO", "WA", "WI"]) {
  const state = contract.states.find((entry) => entry.code === stateCode);
  assert.ok(state);
  assert.equal(state.coverageDepth, "not-available", `${stateCode} cannot claim coverage after its current source evidence is gone`);
}

const lostSourceContract = buildCoverageContract({
  lifecycle: {
    activeStates: ["NC"],
    states: {
      NC: {
        customerLabel: "North Carolina",
        sourceLabel: "North Carolina ABC",
        publicStatus: "active",
        coverageTier: "live_store_inventory",
        refinementLevel: "city_store",
        customerSummary: "Store coverage.",
      },
    },
  },
  stateRows: [{
    state: "NC",
    coverageTier: "live_store_inventory",
    publicStatus: "active",
    status: "blocked",
    bestLocationPrecision: "blocked",
    targetLocationPrecision: "store_level",
    signalCount: 0,
  }],
  locations: [{
    id: "stale-nc-store",
    state: "NC",
    type: "store",
    name: "Stale ABC",
    source: "Stale ABC store inventory",
    city: "Raleigh",
    precision: "store_level",
    inventoryCapability: "store_level",
    searchable: true,
    collectorAttached: true,
    hasSignals: true,
  }],
  stores: [],
});
assert.equal(lostSourceContract.states.find((state) => state.code === "NC")?.capability, "not-active");

const precisionWithoutSourceContract = buildCoverageContract({
  lifecycle: {
    activeStates: ["NC"],
    states: {
      NC: {
        customerLabel: "North Carolina",
        sourceLabel: "Old source label",
        publicStatus: "active",
        coverageTier: "live_store_inventory",
        refinementLevel: "city_store",
        customerSummary: "Old positive source summary.",
      },
    },
  },
  stateRows: [{
    state: "NC",
    coverageTier: "live_store_inventory",
    publicStatus: "active",
    status: "useful",
    bestLocationPrecision: "store_level",
    signalCount: 0,
  }],
});
const precisionWithoutSource = precisionWithoutSourceContract.states.find((state) => state.code === "NC");
assert.equal(precisionWithoutSource?.capability, "not-active", "precision metadata alone cannot keep a lost source active");
assert.equal(precisionWithoutSource?.sourceLabel, null, "inactive states do not retain stale source labels");
assert.match(precisionWithoutSource?.summary || "", /No current customer-facing monitoring source/i, "inactive states use a neutral summary");

const transientHealthContract = buildCoverageContract({
  lifecycle: {
    activeStates: ["NC"],
    states: {
      NC: {
        customerLabel: "North Carolina",
        sourceLabel: "North Carolina ABC",
        publicStatus: "active",
        coverageTier: "live_store_inventory",
        refinementLevel: "city_store",
        customerSummary: "Store coverage.",
      },
    },
  },
  stateRows: [{
    state: "NC",
    coverageTier: "live_store_inventory",
    publicStatus: "active",
    status: "stale_useful_quality_fallback",
    bestLocationPrecision: "store_level",
    signalCount: 3,
  }],
  locations: [{
    id: "nc-store",
    state: "NC",
    type: "store",
    name: "Example ABC",
    source: "Example ABC store inventory",
    city: "Raleigh",
    precision: "store_level",
    inventoryCapability: "store_level",
    searchable: true,
    collectorAttached: true,
    hasSignals: true,
  }],
  stores: [],
});
const transientNorthCarolina = transientHealthContract.states.find((state) => state.code === "NC");
assert.equal(transientNorthCarolina?.capability, "not-active", "configured exact-store metadata cannot establish coverage during a source-health limitation without fresh output");
assert.equal(transientNorthCarolina?.health, "temporarily-limited");

const fallbackHealthContract = buildCoverageContract({
  lifecycle: {
    activeStates: ["AL"],
    states: {
      AL: {
        customerLabel: "Alabama",
        publicStatus: "active",
        coverageTier: "aggregate_inventory_watch",
        refinementLevel: "statewide",
      },
    },
  },
  stateRows: [{
    state: "AL",
    coverageTier: "aggregate_inventory_watch",
    publicStatus: "active",
    status: "useful",

    bestLocationPrecision: "statewide",
    signalCount: 1,
  }],
  healthLimited: true,
});
assert.equal(fallbackHealthContract.states.find((state) => state.code === "AL")?.health, "temporarily-limited", "cache or empty fallbacks cannot claim current source health");

const searchLocations: CoverageLocationInput[] = [
  {
    id: "live-1",
    state: "IL",
    type: "store",
    name: "Signal Spirits",
    source: "Signal Spirits store inventory",
    city: "Springfield",
    address: "1 Main Street",
    precision: "store_level",
    inventoryCapability: "store_level",
    searchable: true,
    collectorAttached: true,
    hasSignals: true,
  },
  {
    id: "quiet-1",
    state: "IL",
    type: "store",
    name: "Quiet Spirits",
    source: "Quiet Spirits store inventory",
    city: "Peoria",
    precision: "store_level",
    inventoryCapability: "store_level",
    searchable: true,
    collectorAttached: true,
    hasSignals: false,
  },
  {
    id: "private-1",
    state: "IL",
    type: "store",
    name: "Internal Candidate",
    source: "Internal source notes",
    address: "1 Private Way",
    city: "Privateville",
    precision: "store_level",
    inventoryCapability: "none",
    searchable: false,
    collectorAttached: false,
    hasSignals: false,
  },
  {
    id: "known-1",
    state: "IL",
    type: "store",
    name: "Known Bottle Shop",
    city: "Springfield",
    address: "2 Main Street",
    precision: "store_level",
    inventoryCapability: "store_level",
    searchable: true,
    collectorAttached: false,
    hasSignals: false,
  },
  {
    id: "known-2",
    state: "IL",
    type: "store",
    name: "Expansion Liquors",
    city: "Decatur",
    precision: "store_level",
    inventoryCapability: "store_level",
    searchable: true,
    collectorAttached: false,
    hasSignals: false,
  },
];
const searchRows: CoverageStateRowInput[] = [{
  state: "IL",
  coverageTier: "live_store_inventory",
  publicStatus: "active",
  status: "useful",
  bestLocationPrecision: "store_level",
  signalCount: 1,
}];
const searchDrops = [{
  state: "IL",
  type: "retailer_store_inventory_result",
  source: "Signal Spirits store inventory",
  tier: "limited",
  rarity_tier: "limited",
  storeId: "live-1",
  storeName: "Signal Spirits",
  storeAddress: "1 Main Street",
  city: "Springfield",
  locationPrecision: "store_level",
  signalCategory: "inventory",
  availabilityScope: "store_reported",
  canAlertAsInventory: true,
  quantity: 1,
  observedAt: "2026-08-02T13:00:00.000Z",
  lastConfirmedAt: "2026-08-02T13:00:00.000Z",
}];
const searchCoverageInputs = {
  lifecycle: STATE_LIFECYCLE_CONFIG,
  stateRows: searchRows,
  locations: searchLocations,
  stores: [],
  drops: searchDrops,
  asOf: "2026-08-02T14:00:00.000Z",
};

const partialCity = searchCoverageTargets({
  stateCode: "IL",
  query: "Springfield",
  ...searchCoverageInputs,
});
assert.ok(partialCity.some((result) => result.kind === "city" && result.status === "partially-covered"));
assert.ok(partialCity.some((result) => result.kind === "store" && result.status === "actively-monitored"));
assert.ok(partialCity.some((result) => result.kind === "store" && result.status === "known-expansion-candidate"));

const quietStore = searchCoverageTargets({
  stateCode: "IL",
  query: "Quiet Spirits",
  ...searchCoverageInputs,
});
assert.equal(quietStore[0]?.status, "known-expansion-candidate", "a configured store without a fresh exact signal cannot be labeled actively monitored");

const knownCity = searchCoverageTargets({
  stateCode: "IL",
  query: "Decatur",
  ...searchCoverageInputs,
});
assert.ok(knownCity.some((result) => result.kind === "city" && result.status === "known-not-active"));

const privateCandidate = searchCoverageTargets({
  stateCode: "IL",
  query: "Internal Candidate",
  ...searchCoverageInputs,
});
assert.equal(privateCandidate[0]?.status, "not-found", "non-searchable internal location candidates stay private");
assert.equal(findCoverageStoreTarget({
  stateCode: "IL",
  storeId: "private-1",
  lifecycle: STATE_LIFECYCLE_CONFIG,
  locations: searchLocations,
  stores: [],
}), null, "non-searchable internal stores cannot be canonicalized through request submission");

const missing = searchCoverageTargets({
  stateCode: "IL",
  query: "Nowhere Market",
  ...searchCoverageInputs,
});
assert.deepEqual(missing, [{
  kind: "unknown",
  label: "Nowhere Market",
  stateCode: "IL",
  status: "not-found",
  canonicalTargetKey: null,
  detail: "We do not currently have this city or store in our list.",
}]);

const serialized = JSON.stringify({ contract, search: partialCity });
assert.doesNotMatch(serialized, /bottleName|quantity|signalCount|canAlertAsInventory/i, "public coverage never leaks bottle or gated signal fields");
assert.doesNotMatch(serialized, /MD-MONTGOMERY/, "internal Maryland engine keys stay out of the customer-facing contract");

console.log("coverage contract tests passed");
