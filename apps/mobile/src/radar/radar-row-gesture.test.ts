import assert from "node:assert/strict";
import test from "node:test";
import { radarSwipeDestination, radarSwipeShouldStart } from "./radar-row-gesture";
test("vertical scrolling and ordinary taps never reveal alert actions", () => {
  assert.equal(radarSwipeShouldStart(5, 1), false);
  assert.equal(radarSwipeShouldStart(20, 40), false);
  assert.equal(radarSwipeShouldStart(-50, 4), true);
});
test("a deliberate left swipe reveals actions; right swipe closes without archiving", () => {
  assert.equal(radarSwipeDestination(-30), 0);
  assert.equal(radarSwipeDestination(-80), -144);
  assert.equal(radarSwipeDestination(-144 + 110), 0);
});
