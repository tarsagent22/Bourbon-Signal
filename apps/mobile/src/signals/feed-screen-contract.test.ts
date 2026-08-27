import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const feed = readFileSync(resolve(process.cwd(), "app/(app)/(tabs)/index.tsx"), "utf8");

function position(fragment: string) {
  const index = feed.indexOf(fragment);
  assert.notEqual(index, -1, `missing ${fragment}`);
  return index;
}

test("Signal Feed presents Intel and Community with centered descriptions above the toggle", () => {
  assert.match(feed, />Intel<\/Text>/);
  assert.doesNotMatch(feed, />Market<\/Text>/);
  assert.match(feed, /Intel gathered from Bourbon Signal sources\./);
  assert.match(feed, /Bottle sightings shared by Bourbon Signal members\./);
  assert.match(feed, /contextText: \{[^}]*textAlign: "center"/);
  assert.ok(position("Intel gathered from Bourbon Signal sources.") < position('accessibilityLabel="Signal feed view"'));
});

test("Signal Feed exposes controls inline in the requested top-to-bottom order", () => {
  const toggle = position('accessibilityLabel="Signal feed view"');
  const search = position('placeholder="Search bottle name"');
  const geography = position('accessibilityLabel="Signal geography filters"');
  const rarity = position('accessibilityLabel="Bottle rarity filters"');
  assert.ok(toggle < search && search < geography && geography < rarity);
  assert.doesNotMatch(feed, /Open Signal filters|Filter Signals|filterOpen|filterSheet/);
  assert.match(feed, /filters\.state \? <OptionChooser/);
  assert.match(feed, /label="State"/);
});

test("Signal Feed uses Intel wording in empty and explanatory states", () => {
  assert.doesNotMatch(feed, />Market</);
  assert.doesNotMatch(feed, /Market Signals|market intelligence/);
  assert.match(feed, /No Intel Signals match these tiers right now/);
});

test("inline filters stay mounted and receive the first tap while search is focused", () => {
  const applyFilters = feed.match(/const applyFilters = useCallback\([\s\S]*?\}, \[areaDirectory, view\]\);/)?.[0] || "";
  assert.ok(applyFilters);
  assert.doesNotMatch(applyFilters, /setAccess\(null\)/);
  assert.match(feed, /<FlatList[\s\S]*?keyboardShouldPersistTaps="handled"/);
  assert.ok((feed.match(/keyboardShouldPersistTaps="handled"/g) || []).length >= 3);
});
