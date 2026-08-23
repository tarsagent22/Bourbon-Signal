import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SIGNAL_FILTERS, activeFilterCount, filterSummary, rarityOptionsForView, toggleRarity } from "./feed-filters";

test("rarity chips support multi-select and return to All when the last chip is removed", () => {
  const allocated = toggleRarity(DEFAULT_SIGNAL_FILTERS, "allocated");
  assert.deepEqual(allocated.rarities, ["allocated"]);
  const combined = toggleRarity(allocated, "unicorn");
  assert.deepEqual(combined.rarities, ["allocated", "unicorn"]);
  assert.deepEqual(toggleRarity(toggleRarity(combined, "allocated"), "unicorn").rarities, []);
});

test("Community only exposes rarity tiers its persisted sightings can represent", () => {
  assert.deepEqual(rarityOptionsForView("community").map((option) => option.value), ["limited", "allocated", "unicorn"]);
  assert.deepEqual(rarityOptionsForView("market").map((option) => option.value), ["limited", "allocated", "highly_allocated", "unicorn"]);
});

test("lower-frequency filters have a compact summary and count", () => {
  const filters = { ...DEFAULT_SIGNAL_FILTERS, state: "NC", freshness: "7d" as const, bottle: "Weller" };
  assert.equal(activeFilterCount(filters), 3);
  assert.equal(filterSummary(filters), "NC · Last 7 days · Weller");
});
