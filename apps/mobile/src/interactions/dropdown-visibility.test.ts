import assert from "node:assert/strict";
import test from "node:test";
import { dropdownRevealOffset } from "./dropdown-visibility";

test("an opening dropdown scrolls just enough to expose its bottom", () => {
  assert.equal(dropdownRevealOffset(100, 400, 240, 60, 540), 152);
});
test("fully visible choices preserve reading position", () => {
  assert.equal(dropdownRevealOffset(100, 150, 240, 60, 540), 100);
});
test("a dropdown taller than the viewport keeps its trigger visible", () => {
  assert.equal(dropdownRevealOffset(100, 200, 600, 60, 300), 228);
});
test("a partially clipped trigger is brought back into view", () => {
  assert.equal(dropdownRevealOffset(100, 40, 240, 60, 540), 68);
  assert.equal(dropdownRevealOffset(0, 40, 240, 60, 540), 0);
});
