import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const tabs = readFileSync(resolve(process.cwd(), "app/(app)/(tabs)/_layout.tsx"), "utf8");

test("Home header uses the Bourbon Signal brand font and a real alert-inbox action", () => {
  assert.match(tabs, /name="index" options=\{\{ title: "Home"/);
  assert.match(tabs, /headerTitleAlign: "left"/);
  assert.match(tabs, /fontFamily: "Fraunces_700Bold"/);
  assert.match(tabs, /Bourbon Signal/);
  assert.match(tabs, /accessibilityLabel="Open alert inbox"/);
  assert.match(tabs, /name="bell-outline"/);
  assert.match(tabs, /router\.push\(\{ pathname: "\/\(app\)\/\(tabs\)\/radar", params: \{ section: "matches", request: Date\.now\(\)\.toString\(\) \} \}\)/);
});

test("Home uses a transparent header over the full portrait shelf backdrop", () => {
  const asset = resolve(process.cwd(), "assets/home-shelf-background.jpg");
  assert.equal(existsSync(asset), true);
  assert.ok(statSync(asset).size < 500_000, "portrait shelf image should remain lightweight");
  assert.match(tabs, /headerTransparent: true/);
  assert.match(tabs, /headerStyle: \{ backgroundColor: "transparent" \}/);
  assert.doesNotMatch(tabs, /HomeHeaderBackground|home-shelf-header\.jpg/);
  assert.doesNotMatch(tabs, /tagline|call.to.action|heroCta/i);
});
