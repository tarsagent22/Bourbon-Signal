import assert from "node:assert/strict";
import test from "node:test";
import { scoreFromTrackPageX } from "./score-slider-gesture";

test("score slider maps stable screen coordinates to the same clamped 0-100 range as the website", () => {
  assert.equal(scoreFromTrackPageX(200, 100, 200), 50);
  assert.equal(scoreFromTrackPageX(100, 100, 200), 0);
  assert.equal(scoreFromTrackPageX(300, 100, 200), 100);
  assert.equal(scoreFromTrackPageX(72, 100, 200), 0);
  assert.equal(scoreFromTrackPageX(340, 100, 200), 100);
  assert.equal(scoreFromTrackPageX(200, 100, 0), null);
});
