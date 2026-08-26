import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("Cellar add uses a dedicated canonical native route", () => {
  const layout = read("app/(app)/_layout.tsx");
  const cellar = read("app/(app)/(tabs)/cellar.tsx");
  const add = read("app/(app)/cellar/add.tsx");
  assert.match(layout, /cellar\/add/);
  assert.match(cellar, /router\.push\(["']\/\(app\)\/cellar\/add["']\)/);
  assert.match(add, /listRadarBottles/);
  assert.match(add, /updateMemberPreferences/);
  assert.match(add, /collectionPreferences\.version/);
  assert.doesNotMatch(add, /Signals|\(tabs\).*index/);
});

test("native add offers lifecycle, acquisition, context, and taste toggles", () => {
  const add = read("app/(app)/cellar/add.tsx");
  for (const label of ["Sealed", "Opened", "Just tasted", "Quantity", "Price paid", "Store", "Purchase date", "Bar", "Bottle share", "Friend", "Event", "Other"]) assert.match(add, new RegExp(label));
  assert.match(add, /TASTE_TAG_OPTIONS\.map/);
  assert.match(add, /<ScoreSlider/);
  assert.doesNotMatch(add, /split\(["']\s*,\s*["']\)/, "taste tags are toggles, not comma-separated input");
});

test("Cellar cards use bottle-specific silhouettes and the editor uses the same score slider", () => {
  const cellar = read("app/(app)/(tabs)/cellar.tsx");
  assert.match(cellar, /<CellarBottleSilhouette bottle=\{bottle\}/);
  assert.match(cellar, /<ScoreSlider/);
  assert.match(cellar, /accessibilityRole="button" onPress=\{onPress\}/);
});
