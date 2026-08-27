import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const tabs = readFileSync(resolve(process.cwd(), "app/(app)/(tabs)/_layout.tsx"), "utf8");

test("Signals header uses the Bourbon Signal brand font and a real alert-inbox action", () => {
  assert.match(tabs, /headerTitleAlign: "left"/);
  assert.match(tabs, /fontFamily: "Fraunces_700Bold"/);
  assert.match(tabs, /Bourbon Signal/);
  assert.match(tabs, /accessibilityLabel="Open alert inbox"/);
  assert.match(tabs, /name="bell-outline"/);
  assert.match(tabs, /router\.push\(\{ pathname: "\/\(app\)\/\(tabs\)\/radar", params: \{ section: "matches", request: Date\.now\(\)\.toString\(\) \} \}\)/);
});
