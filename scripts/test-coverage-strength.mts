import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildCoverageContract } from "../src/lib/coverage-model.ts";

const AS_OF = "2026-08-02T23:30:00.000Z";
const STALE_OBSERVED_AT = "2026-07-01T12:00:00.000Z";

const lifecycle = {
  activeStates: ["CA", "NC", "VA"],
  states: {
    CA: {
      customerLabel: "California",
      sourceLabel: "California retailer inventory",
      publicStatus: "active",
      lifecycle: "retailer_store_inventory",
      coverageTier: "live_store_inventory",
    },
    NC: {
      customerLabel: "North Carolina",
      sourceLabel: "North Carolina ABC + county boards",
      publicStatus: "active",
      lifecycle: "store_inventory_and_board_leads",
      coverageTier: "live_store_inventory",
    },
    VA: {
      customerLabel: "Virginia",
      sourceLabel: "Virginia ABC",
      publicStatus: "active",
      lifecycle: "store_inventory",
      coverageTier: "live_store_inventory",
    },
  },
} as const;

const stateRows = [
  { state: "CA", publicStatus: "active", status: "useful", signalCount: 2, coverageTier: "live_store_inventory" },
  // Mirrors production NC: a stale fallback is not a disabled source.
  { state: "NC", publicStatus: "active", status: "stale_blocked", signalCount: 2465, coverageTier: "live_store_inventory" },
  { state: "VA", publicStatus: "active", status: "useful", signalCount: 300, coverageTier: "live_store_inventory" },
] as const;

const vaLocations = Array.from({ length: 30 }, (_, index) => ({
  id: `va-${index + 1}`,
  state: "VA",
  type: "store",
  name: `VA ABC ${index + 1}`,
  city: `Virginia City ${index % 6}`,
  source: "Virginia ABC inventory",
  collectorAttached: true,
}));

const locations = [
  { id: "nc-board", state: "NC", type: "county_board", name: "NC ABC Board", source: "NC ABC Commission board list", collectorAttached: true },
  { id: "ca-1", state: "CA", type: "store", name: "CA One", city: "San Diego", source: "California retailer inventory", collectorAttached: true },
  { id: "ca-2", state: "CA", type: "store", name: "CA Two", city: "San Diego", source: "California retailer inventory", collectorAttached: true },
  ...vaLocations,
];

function observedStore(state: string, id: string, storeName: string, city: string, source: string) {
  return {
    state,
    type: "retailer_store_inventory_result",
    source,
    tier: "limited",
    rarity_tier: "limited",
    storeId: id,
    storeName,
    storeAddress: `${id} Main Street`,
    city,
    locationPrecision: "store_level",
    signalCategory: "inventory",
    availabilityScope: "store_reported",
    canAlertAsInventory: true,
    quantity: 1,
    observedAt: STALE_OBSERVED_AT,
    lastConfirmedAt: STALE_OBSERVED_AT,
  };
}

const drops = [
  observedStore("CA", "ca-1", "CA One", "San Diego", "California retailer inventory"),
  observedStore("CA", "ca-2", "CA Two", "San Diego", "California retailer inventory"),
  ...vaLocations.map((store) => observedStore("VA", store.id, store.name, store.city, store.source)),
];

const ncBoardIntelligence = {
  boardCount: 173,
  officialStoreCount: 465,
  representedAreaCount: 283,
  boardsWithTrackedShipments: 115,
  singleStoreShipmentBoardCount: 60,
};

const contract = buildCoverageContract({
  lifecycle,
  asOf: AS_OF,
  stateRows,
  degradedStates: [{ state: "NC", status: "stale_blocked", stale: true, staleReason: "not_due" }],
  locations,
  drops,
  ncBoardIntelligence,
});

const byCode = new Map(contract.states.map((state) => [state.code, state]));
const nc = byCode.get("NC");
const va = byCode.get("VA");
const ca = byCode.get("CA");
const ak = byCode.get("AK");
assert.ok(nc && va && ca && ak);

assert.equal(nc.coverageStatus, "available");
assert.equal(nc.coverageStrength, "strong", "115 tracked NC board shipment sources are strong coverage even while stale");
assert.equal(nc.coverageStrengthLabel, "Strong coverage");
assert.equal(nc.scope.trackedShipmentBoards, 115);
assert.match(nc.fingerprint, /^coverage-v2\|/, "a display-only strength tier must not reset coverage-request baselines");
assert.doesNotMatch(nc.fingerprint, /\|strong\|/, "display strength must not look like a material request-coverage improvement");
assert.equal(nc.capabilities.currentBottleAvailability, false, "strength must not manufacture current shelf inventory");
assert.equal(nc.capabilities.restockAlerts, false, "strength must not manufacture alerts");
assert.notEqual(nc.health, "current", "stale source health stays separate from strength");

assert.equal(va.coverageStrength, "strong", "30 identity-bound observed Virginia stores are strong coverage even while stale");
assert.equal(ca.coverageStrength, "sparse", "two identity-bound California stores are sparse coverage, not map-green strong coverage");
assert.equal(ak.coverageStrength, "none", "no verified source remains no coverage");
assert.equal(ak.coverageStrengthLabel, "No coverage", "the no-coverage tag uses the same direct language as the map legend");

const attachmentOnlyContract = buildCoverageContract({
  lifecycle: { activeStates: ["VA"], states: { VA: lifecycle.states.VA } },
  asOf: AS_OF,
  stateRows: [stateRows[2]],
  locations: vaLocations,
});
const attachmentOnlyVirginia = attachmentOnlyContract.states.find((state) => state.code === "VA");
assert.ok(attachmentOnlyVirginia);
assert.equal(attachmentOnlyVirginia.coverageStatus, "available", "an active attached source may establish basic availability");
assert.equal(attachmentOnlyVirginia.coverageStrength, "sparse", "source attachment without identity-bound observed evidence cannot be Strong");

const mapSource = readFileSync(new URL("../src/components/coverage/CoverageMap.tsx", import.meta.url), "utf8");
const explorerSource = readFileSync(new URL("../src/components/coverage/CoverageExplorer.tsx", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../src/components/coverage/CoverageStatePanel.tsx", import.meta.url), "utf8");
const summarySource = readFileSync(new URL("../src/components/coverage/CoverageSummary.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../src/components/coverage/coverage.module.css", import.meta.url), "utf8");

assert.match(mapSource, /data-coverage-strength/, "map colors must derive from coverage strength, not binary availability");
assert.match(mapSource, /state\.coverageStrengthLabel/, "map accessibility labels must state the coverage tier");
assert.match(mapSource, /aria-label="Strong coverage"/, "legend swatches must expose their text tier to assistive technology");
assert.match(explorerSource, /state\.coverageStrengthLabel/, "mobile selector and browse list must show the strength tier");
assert.match(panelSource, /<CoverageSummary state=\{state\}/, "state panel must render the shared summary");
assert.match(summarySource, /state\.coverageStrengthLabel/, "shared summary must lead with the honest strength tag");
assert.match(cssSource, /data-coverage-strength="strong"/, "CSS must provide a distinct strong color");
assert.match(cssSource, /data-coverage-strength="moderate"/, "CSS must provide a distinct moderate color");
assert.match(cssSource, /data-coverage-strength="sparse"/, "CSS must provide a distinct sparse color");
assert.match(cssSource, /data-coverage-strength="none"/, "CSS must provide a distinct no-coverage color");

console.log("Coverage strength model and map surface contract passed.");
