import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const detail = readFileSync(resolve(process.cwd(), "app/(app)/signal/[id].tsx"), "utf8");

test("Signal detail is the unified Bottle Profile route", () => {
  assert.match(detail, /Stack\.Screen options=\{\{ title: "Bottle Profile" \}\}/);
  assert.match(detail, /accessibilityLabel="Bottle Profile"/);
  assert.match(detail, />Bottle Profile<\/Text>/);
  assert.match(detail, />Current Signal<\/Text>/);
  assert.match(detail, /bottleProfileState/);
  assert.match(detail, /label="Radar"/);
  assert.match(detail, /label="Cellar"/);
  assert.match(detail, /label="Rating"/);
  assert.match(detail, /label="Inventory"/);
});

test("Bottle Profile keeps existing Signal actions and does not invent Bourbon DNA", () => {
  assert.match(detail, /Watch in Radar/);
  assert.match(detail, /Add to Cellar/);
  assert.match(detail, /Open in Maps/);
  assert.match(detail, /Hunt Outcome/);
  assert.doesNotMatch(detail, /Bourbon DNA|DNA compatibility|compatibility score/i);
});
