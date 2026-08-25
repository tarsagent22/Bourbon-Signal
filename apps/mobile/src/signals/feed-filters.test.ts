import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SIGNAL_FILTERS, activeFilterCount, areaOptionsForState, areaSelectorLabel, filterSignalsByRarity, filterSummary, normalizedFilters, rarityOptionsForView, serverSignalFilters, shouldBackfillRarity, toggleRarity, type SignalAreaDirectory, type SignalFeedFilters } from "./feed-filters";

const areas: SignalAreaDirectory = {
  states: [
    { code: "NC", label: "North Carolina", areaLabel: "Board", options: [{ value: "Wake County ABC", label: "Wake County ABC" }] },
    { code: "GA", label: "Georgia", areaLabel: "City", options: [{ value: "Atlanta Metro", label: "Atlanta Metro" }] },
  ],
};

test("rarity chips support multi-select and return to All when the last chip is removed", () => {
  const allocated = toggleRarity(DEFAULT_SIGNAL_FILTERS, "allocated");
  assert.deepEqual(allocated.rarities, ["allocated"]);
  const combined = toggleRarity(allocated, "unicorn");
  assert.deepEqual(combined.rarities, ["allocated", "unicorn"]);
  assert.deepEqual(toggleRarity(toggleRarity(combined, "allocated"), "unicorn").rarities, []);
});

test("rarity filters synchronously select loaded Signals without reordering them", () => {
  const signals = [
    { id: "limited-1", bottle: { rarity: "limited" } },
    { id: "allocated-1", bottle: { rarity: "allocated" } },
    { id: "unicorn-1", bottle: { rarity: "unicorn" } },
    { id: "allocated-2", bottle: { rarity: "allocated" } },
  ];

  assert.equal(filterSignalsByRarity(signals, []).length, 4);
  assert.deepEqual(filterSignalsByRarity(signals, ["allocated"]).map((signal) => signal.id), ["allocated-1", "allocated-2"]);
  assert.deepEqual(filterSignalsByRarity(signals, ["limited", "unicorn"]).map((signal) => signal.id), ["limited-1", "unicorn-1"]);
});

test("rarity never enters the server query and sparse local results backfill silently", () => {
  const filters: SignalFeedFilters = { ...DEFAULT_SIGNAL_FILTERS, rarities: ["allocated", "unicorn"], state: "NC", freshness: "7d" };
  assert.deepEqual(serverSignalFilters(filters), { ...filters, rarities: [] });
  assert.equal(shouldBackfillRarity({ rarities: ["unicorn"], visibleCount: 2, hasMore: true, loading: false, error: "" }), true);
  assert.equal(shouldBackfillRarity({ rarities: ["unicorn"], visibleCount: 8, hasMore: true, loading: false, error: "" }), false);
  assert.equal(shouldBackfillRarity({ rarities: [], visibleCount: 0, hasMore: true, loading: false, error: "" }), false);
  assert.equal(shouldBackfillRarity({ rarities: ["unicorn"], visibleCount: 0, hasMore: true, loading: true, error: "" }), false);
  assert.equal(shouldBackfillRarity({ rarities: ["unicorn"], visibleCount: 0, hasMore: true, loading: false, error: "offline" }), false);
  assert.equal(shouldBackfillRarity({ rarities: ["unicorn"], visibleCount: 0, hasMore: true, loading: false, error: "", attempts: 3 }), false);
});

test("both feeds expose the canonical three rarity tiers", () => {
  assert.deepEqual(rarityOptionsForView("community").map((option) => option.value), ["limited", "allocated", "unicorn"]);
  assert.deepEqual(rarityOptionsForView("market").map((option) => option.value), ["limited", "allocated", "unicorn"]);
});

test("lower-frequency filters have a compact summary and count", () => {
  const filters = { ...DEFAULT_SIGNAL_FILTERS, state: "NC", area: "Mecklenburg County ABC", freshness: "7d" as const, bottle: "Weller" };
  assert.equal(activeFilterCount(filters), 4);
  assert.equal(filterSummary(filters, areas), "State: North Carolina · Board: Mecklenburg County ABC · Last 7 days · Weller");
  assert.equal(areaSelectorLabel("NC"), "Board");
  assert.equal(areaSelectorLabel("VA"), "City");
  assert.deepEqual(areaOptionsForState(areas, "NC"), [{ value: "Wake County ABC", label: "Wake County ABC" }]);
});

test("normalization preserves server-loaded cities but rejects unknown NC boards", () => {
  assert.equal(normalizedFilters({ ...DEFAULT_SIGNAL_FILTERS, state: "VA", area: "Richmond" }, areas).area, "Richmond");
  assert.equal(normalizedFilters({ ...DEFAULT_SIGNAL_FILTERS, state: "NC", area: "Made Up Board" }, areas).area, "");
});
