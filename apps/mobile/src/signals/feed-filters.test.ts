import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SIGNAL_FILTERS, activeFilterCount, areaOptionsForState, areaSelectorLabel, filterSummary, normalizedFilters, rarityOptionsForView, toggleRarity, type SignalAreaDirectory } from "./feed-filters";

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
