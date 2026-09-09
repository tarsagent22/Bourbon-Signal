import assert from "node:assert/strict";
import test from "node:test";
import { resolveCellarBottleArtwork } from "./cellar-bottle-artwork";

test("resolves only the two approved bottles from exact catalog identities", () => {
  assert.equal(resolveCellarBottleArtwork({
    bottleId: "eh-taylor-small-batch",
    bottleName: "E.H. Taylor Small Batch",
    canonicalKey: "e h taylor small batch",
  }), "eh-taylor-small-batch");
  assert.equal(resolveCellarBottleArtwork({
    bottleId: "russells-reserve-10",
    bottleName: "Russell's Reserve 10 Year",
    canonicalKey: "russell s reserve 10 year",
  }), "russells-reserve-10");
  assert.equal(resolveCellarBottleArtwork({
    bottleId: "custom-entry",
    bottleName: "Colonel E.H. Taylor Small Batch",
    canonicalKey: "colonel e h taylor small batch",
  }), "eh-taylor-small-batch");
  assert.equal(resolveCellarBottleArtwork({
    bottleId: "custom-entry",
    bottleName: "Russells Reserve 10",
    canonicalKey: "russells reserve 10",
  }), "russells-reserve-10");
});

test("rejects catalogue alias collisions and conflicting variants", () => {
  for (const bottle of [
    { bottleId: "eh-taylor-small-batch", bottleName: "E.H. Taylor Single Barrel", canonicalKey: "e h taylor single barrel" },
    { bottleId: "custom-entry", bottleName: "E.H. Taylor Barrel Proof", canonicalKey: "e h taylor barrel proof" },
    { bottleId: "russells-reserve-10", bottleName: "Russell's Reserve 13 Year", canonicalKey: "russell s reserve 13 year" },
    { bottleId: "russells-reserve-10", bottleName: "RR13", canonicalKey: "rr13" },
    { bottleId: "custom-entry", bottleName: "Russell's Reserve Single Barrel", canonicalKey: "russell s reserve single barrel" },
  ]) assert.equal(resolveCellarBottleArtwork(bottle), undefined, bottle.bottleName);
});

test("matches apostrophized names without IDs and refuses mismatched editions", () => {
  assert.equal(resolveCellarBottleArtwork({ bottleName: "Russell's Reserve 10 Year" }), "russells-reserve-10");
  for (const bottleName of ["Russell's Reserve 15 Year", "Russell's Reserve 6 Year Rye", "Unrelated whiskey"]) {
    assert.equal(resolveCellarBottleArtwork({ bottleId: "russells-reserve-10", bottleName }), undefined);
  }
  assert.equal(resolveCellarBottleArtwork({ bottleId: "eh-taylor-small-batch", bottleName: "E.H. Taylor Straight Rye" }), undefined);
});

test("leaves every unapproved bottle on the default silhouette", () => {
  assert.equal(resolveCellarBottleArtwork({
    bottleId: "old-forester-1910",
    bottleName: "Old Forester 1910",
    canonicalKey: "old forester 1910",
  }), undefined);
});
