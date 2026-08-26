import assert from "node:assert/strict";
import test from "node:test";
import { classifyScoreSliderGesture } from "./score-slider-gesture";

test("score slider gesture intent waits through jitter and distinguishes horizontal drags from vertical scrolling", () => {
  assert.equal(classifyScoreSliderGesture(0, 0), "pending");
  assert.equal(classifyScoreSliderGesture(6, -6), "pending");
  assert.equal(classifyScoreSliderGesture(7, 2), "horizontal");
  assert.equal(classifyScoreSliderGesture(-12, 5), "horizontal");
  assert.equal(classifyScoreSliderGesture(2, 7), "vertical");
  assert.equal(classifyScoreSliderGesture(8, 8), "vertical", "ties favor scrolling instead of changing the score");
});
