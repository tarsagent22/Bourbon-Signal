import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

const post = read("apps/mobile/app/(app)/(tabs)/post.tsx");
const types = read("apps/mobile/src/api/types.ts");
const geography = read("src/app/api/v1/geography/route.ts");

test("approved store search exposes structured location identity additively", () => {
  assert.match(geography, /storeId:\s*entry\.rawId/);
  assert.match(geography, /address:\s*entry\.address/);
  assert.match(geography, /city:\s*entry\.city/);
  assert.match(types, /storeId\?:\s*string/);
  assert.match(types, /address\?:\s*string/);
  assert.match(types, /city\?:\s*string/);
});

test("Post uses canonical bottle and approved retailer suggestions with manual fallback", () => {
  assert.match(post, /listRadarBottles/);
  assert.match(post, /searchMonitoringGeography\(\{[^}]*levels:\s*\["store"\]/s);
  assert.match(post, /approvedStoreFromGeography/);
  assert.match(post, /if \(!canSubmit \|\| manualStore \|\| selectedStore \|\| activePicker !== "store" \|\| query\.length < 2\) \{\s*storeSearchSequence\.current \+= 1;\s*setStoreResults\(\[\]\);/);
  assert.match(post, /function changeStoreName[\s\S]*storeSearchSequence\.current \+= 1;[\s\S]*setStoreResults\(\[\]\);[\s\S]*setStoreSearching\(false\);/);
  assert.match(post, /<View style=\{styles\.postIntro\}>/);
  assert.match(post, /Choose a bottle/);
  assert.match(post, /Find a retailer/);
  assert.match(post, /Enter store manually/);
});

test("Post gives optional observations lighter structured controls", () => {
  assert.match(post, /Observed \(optional\)/);
  assert.match(post, /POST_QUANTITY_CHOICES\.map/);
  assert.match(post, /accessibilityLabel="Shelf price"/);
  assert.match(post, />\$<\/Text>/);
  assert.match(post, /Notes/);
});

test("Post keeps a persistent, truthfully disabled action footer", () => {
  assert.match(post, /<View style=\{styles\.actionFooter\}>/);
  assert.match(post, /styles\.submitDisabled/);
  assert.match(post, /backgroundColor:\s*colors\.surfaceRaised/);
  assert.match(post, /accessibilityState=\{\{ disabled:/);
});
