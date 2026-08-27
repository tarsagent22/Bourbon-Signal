import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const icon = readFileSync(resolve(process.cwd(), "src/components/CellarGlencairnSilhouette.tsx"), "utf8");

test("tasted-only artwork is a custom stemless Glencairn rather than a wine-glass glyph", () => {
  assert.doesNotMatch(icon, /MaterialCommunityIcons|glass-tulip|wine|stem/i);
  assert.match(icon, /style={styles\.rim}/);
  assert.match(icon, /style={styles\.narrowMouth}/);
  assert.match(icon, /style={styles\.roundedBowl}/);
  assert.match(icon, /style={styles\.solidBase}/);
  assert.match(icon, /amberPour/);
});
