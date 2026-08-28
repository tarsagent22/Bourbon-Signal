import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const icon = readFileSync(resolve(process.cwd(), "src/components/CellarGlencairnSilhouette.tsx"), "utf8");

test("tasted-only artwork uses a reference-faithful Glencairn silhouette", () => {
  assert.match(icon, /import \{ Image, StyleSheet, View \} from "react-native"/);
  assert.match(icon, /require\("\.\.\/\.\.\/assets\/icons\/cellar-glencairn\.png"\)/);
  assert.doesNotMatch(icon, /MaterialCommunityIcons|glass-tulip|wine/i);
  assert.doesNotMatch(icon, /styles\.(narrowMouth|shoulders|roundedBowl|solidBase)/);
  assert.match(icon, /width: 44, height: 62/);

  const asset = readFileSync(resolve(process.cwd(), "assets/icons/cellar-glencairn.png"));
  assert.equal(asset.subarray(1, 4).toString(), "PNG");
  assert.equal(asset.readUInt32BE(16), 132);
  assert.equal(asset.readUInt32BE(20), 186);
});
