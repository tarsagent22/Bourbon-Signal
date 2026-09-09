import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolveCellarBottleArtwork } from "./cellar-bottle-artwork";

// Load the real server implementation at runtime without pulling server-only
// types/dependencies into the mobile TypeScript project.
const serverIdentity = import(new URL("../../../../src/lib/bottleIdentity.ts", import.meta.url).href);
import catalog from "../cellar/bottle-catalog-seed.json";

const cases = [
  { id: "henry-mckenna-10", name: "Henry McKenna 10 Year", variants: ["Henry McKenna", "Henry McKenna 80 Proof"] },
  { id: "eh-taylor-small-batch", name: "E.H. Taylor Small Batch", variants: ["E.H. Taylor Single Barrel", "E.H. Taylor Barrel Proof", "E.H. Taylor Straight Rye"] },
  { id: "1792-small-batch", name: "1792 Small Batch", variants: ["1792 Full Proof", "1792 Single Barrel", "1792 12 Year", "1792 Bottled in Bond"] },
  { id: "penelope-riviera", name: "Penelope Riviera Cask Finish", variants: ["Penelope Rio", "Penelope Rose Cask Finish", "Penelope Architect"] },
  { id: "buffalo-trace", name: "Buffalo Trace Bourbon", variants: ["Buffalo Trace White Dog", "Buffalo Trace Experimental Collection"] },
  { id: "russells-reserve-10", name: "Russell's Reserve 10 Year", variants: ["Russell's Reserve 13 Year", "Russell's Reserve 6 Year Rye", "Russell's Reserve Single Barrel", "RR13"] },
] as const;

for (const { id, name, variants } of cases) {
  test(`saved server identity resolves photo: ${name}`, async () => {
    const { canonicalBottleKey } = await serverIdentity;
    const entry = catalog.find((row) => row.name === name);
    assert.ok(entry, name);
    const canonicalKey = canonicalBottleKey(name);
    for (const bottleId of [entry.id, "custom-entry", undefined]) {
      assert.equal(resolveCellarBottleArtwork({ bottleId, bottleName: name, canonicalKey }), id);
    }
    // Server keys discard ages and cannot identify an exact edition alone.
    assert.equal(resolveCellarBottleArtwork({ canonicalKey }), undefined);
    for (const bottleName of variants) {
      assert.equal(resolveCellarBottleArtwork({ bottleId: entry.id, bottleName, canonicalKey: canonicalBottleKey(bottleName) }), undefined);
      const conflictingKey = canonicalBottleKey(bottleName);
      // 1792 12 Year also collapses to the legacy brand-only key. That
      // ambiguous key is not an edition conflict when the display name is
      // exactly Small Batch; the actual variant name above remains rejected.
      if (id === "1792-small-batch" && conflictingKey === "1792") {
        assert.equal(resolveCellarBottleArtwork({ bottleId: entry.id, bottleName: name, canonicalKey: conflictingKey }), id);
      } else if (conflictingKey !== canonicalKey) {
        assert.equal(resolveCellarBottleArtwork({ bottleId: entry.id, bottleName: name, canonicalKey: conflictingKey }), undefined);
      }
    }
  });
  test(`exact product photo: ${name}`, () => {
    assert.equal(resolveCellarBottleArtwork({ bottleId: id, bottleName: name }), id);
    assert.equal(resolveCellarBottleArtwork({ bottleName: name }), id);
    assert.equal(resolveCellarBottleArtwork({ bottleId: "custom-entry", bottleName: name }), id);
    assert.equal(resolveCellarBottleArtwork({ bottleId: id }), id);
    for (const bottleName of variants) assert.equal(resolveCellarBottleArtwork({ bottleId: id, bottleName }), undefined, bottleName);
    for (const canonicalKey of variants) {
      assert.equal(resolveCellarBottleArtwork({ bottleId: id, canonicalKey }), undefined, canonicalKey);
      assert.equal(resolveCellarBottleArtwork({ bottleId: id, bottleName: name, canonicalKey }), undefined, canonicalKey);
    }
    assert.equal(resolveCellarBottleArtwork({ bottleId: id, bottleName: name, canonicalKey: name }), id);
    for (const other of cases.filter((row) => row.id !== id)) {
      assert.notEqual(resolveCellarBottleArtwork({ bottleId: id, bottleName: other.name }), id);
    }
  });
}

test("actual legacy 1792 Small Batch saved record resolves its photo", () => {
  // Exact identity fields supplied by the parent production collection read.
  // Compatibility belongs in presentation; never rewrite the saved collection.
  const record = Object.freeze({
    bottle_id: "bb_9b3f8371a44671f4",
    bottle_name: "1792 Small Batch",
    canonical_key: "1792",
  });
  assert.equal(resolveCellarBottleArtwork({
    bottleId: record.bottle_id,
    bottleName: record.bottle_name,
    canonicalKey: record.canonical_key,
  }), "1792-small-batch");
});

test("legacy 1792 key requires the exact Small Batch display name", () => {
  for (const bottleId of ["bb_9b3f8371a44671f4", "1792-small-batch", undefined]) {
    for (const bottleName of [undefined, "", "1792", "1792 Full Proof", "1792 Single Barrel",
      "1792 12 Year", "1792 Bottled in Bond", "1792 Sweet Wheat", "1792 High Rye",
      "1792 Port Finish", "1792 Small Batch Full Proof", "1792 Small Batch 12 Year",
      "1792 Small Batch Bourbon", "Barton 1792 Small Batch", "Buffalo Trace Bourbon"]) {
      assert.equal(resolveCellarBottleArtwork({ bottleId, bottleName, canonicalKey: "1792" }), undefined,
        `${bottleId}: ${bottleName}`);
    }
  }
  assert.equal(resolveCellarBottleArtwork({ bottleName: "1792 Small Batch", canonicalKey: "1792 full proof" }), undefined);
  assert.equal(resolveCellarBottleArtwork({ bottleId: "1792-full-proof", bottleName: "1792 Small Batch", canonicalKey: "1792" }), undefined);
});

test("exact catalog aliases and punctuation without broad brand matches", () => {
  for (const bottleName of ["Henry McKenna 10 Year Single Barrel", "Henry McKenna Single Barrel 10 Year"])
    assert.equal(resolveCellarBottleArtwork({ bottleName }), "henry-mckenna-10");
  for (const bottleName of ["Colonel E.H. Taylor Small Batch", "E.H. Taylor, Jr. Small Batch", "Colonel E.H. Taylor Small Batch Bottled in Bond Bourbon"])
    assert.equal(resolveCellarBottleArtwork({ bottleName }), "eh-taylor-small-batch");
  for (const bottleName of ["Russells Reserve 10", "Russell’s Reserve 10 Year", "Russell's Reserve 10 Year Bourbon"])
    assert.equal(resolveCellarBottleArtwork({ bottleName }), "russells-reserve-10");
  assert.equal(resolveCellarBottleArtwork({ bottleName: "Penelope Cooper Series Riviera" }), "penelope-riviera");
  assert.equal(resolveCellarBottleArtwork({ bottleName: "Buffalo Trace" }), "buffalo-trace");
  assert.equal(resolveCellarBottleArtwork({ bottleName: "E.H. Taylor Small Batch", canonicalKey: "e h taylor single barrel" }), undefined);
  for (const bottleName of ["Old Forester 1910", "Penelope", "1792", "E.H. Taylor", "Unrelated whiskey", ""])
    assert.equal(resolveCellarBottleArtwork({ bottleName }), undefined);
});

test("exactly six locally bundled, source-tracked transparent product images", () => {
  const dir = new URL("../../assets/bottles/photos/", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("sources.json", dir), "utf8"));
  assert.equal(manifest.images.length, cases.length);
  assert.deepEqual(readdirSync(dir).filter((name) => name.endsWith(".png")).sort(), cases.map(({ id }) => `${id}.png`).sort());
  const component = readFileSync(new URL("./CellarBottleArtwork.tsx", import.meta.url), "utf8");
  for (const { id } of cases) {
    const entry = manifest.images.find((item: { id: string }) => item.id === id);
    assert.ok(entry?.sourcePage.startsWith("https://") && entry?.assetUrl.startsWith("https://"), id);
    const bytes = readFileSync(new URL(`${id}.png`, dir));
    assert.equal(bytes.subarray(1, 4).toString(), "PNG", id);
    assert.equal(bytes.readUInt32BE(16), 400, id);
    assert.equal(bytes.readUInt32BE(20), 600, id);
    assert.equal(bytes[25], 6, `${id}: RGBA`);
    assert.ok(bytes.length < 500_000, id);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256, id);
    assert.ok(component.includes(`require("../../assets/bottles/photos/${id}.png")`), id);
  }
  assert.ok(component.includes('resizeMode="contain"'));
  assert.ok(component.includes("if (!artworkId) return <CellarBottleSilhouette />"));
});
