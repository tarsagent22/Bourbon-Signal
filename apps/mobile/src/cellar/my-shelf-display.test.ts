import assert from "node:assert/strict";
import test from "node:test";
import {
  SHELF_BOTTLE_VARIANTS,
  nextShelfPageSize,
  shelfBottleCount,
  shelfBottlePlan,
} from "./my-shelf-display";

test("defines seven visibly distinct bottle silhouettes", () => {
  assert.equal(SHELF_BOTTLE_VARIANTS.length, 7);
  assert.deepEqual(SHELF_BOTTLE_VARIANTS.map((variant) => variant.name), [
    "straight",
    "broad-shoulder",
    "decanter",
    "tall-narrow",
    "rounded-shoulder",
    "square-flask",
    "short-wide",
  ]);
  const signatures = SHELF_BOTTLE_VARIANTS.map((variant) => [
    variant.bodyWidth,
    variant.bodyHeight,
    variant.neckWidth,
    variant.neckHeight,
    variant.shoulderRadius,
  ].join(":"));
  assert.equal(new Set(signatures).size, 7);
});

test("grows the illustrated shelf at nonlinear collection milestones", () => {
  assert.equal(shelfBottleCount(0), 0);
  assert.equal(shelfBottleCount(1), 1);
  assert.equal(shelfBottleCount(3), 2);
  assert.equal(shelfBottleCount(10), 4);
  assert.equal(shelfBottleCount(22), 7);
  assert.equal(shelfBottleCount(67), 12);
  assert.equal(shelfBottleCount(400), 12);
});

test("uses every silhouette deterministically as the shelf fills", () => {
  const keys = Array.from({ length: 67 }, (_, index) => `bottle-${index + 1}`);
  const first = shelfBottlePlan(keys);
  const second = shelfBottlePlan(keys);
  assert.deepEqual(first, second);
  assert.equal(first.length, 12);
  assert.equal(new Set(first.map((entry) => entry.variant.name)).size, 7);
});

test("reveals collection entries in twelve-item pages", () => {
  assert.equal(nextShelfPageSize(9, 12), 9);
  assert.equal(nextShelfPageSize(40, 12), 24);
  assert.equal(nextShelfPageSize(40, 24), 36);
  assert.equal(nextShelfPageSize(40, 36), 40);
});
