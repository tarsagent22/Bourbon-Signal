import assert from "node:assert/strict";
import test from "node:test";
import { classifyScoreSliderGesture, scoreFromTrackPageX } from "./score-slider-gesture";

test("score slider gesture intent waits through jitter and distinguishes horizontal drags from vertical scrolling", () => {
  assert.equal(classifyScoreSliderGesture(0, 0), "pending");
  assert.equal(classifyScoreSliderGesture(6, -6), "pending");
  assert.equal(classifyScoreSliderGesture(7, 2), "horizontal");
  assert.equal(classifyScoreSliderGesture(-12, 5), "horizontal");
  assert.equal(classifyScoreSliderGesture(2, 7), "vertical");
  assert.equal(classifyScoreSliderGesture(8, 8), "vertical", "ties favor scrolling instead of changing the score");
});

test("score slider maps stable screen coordinates to the same clamped 0-100 range as the website", () => {
  assert.equal(scoreFromTrackPageX(200, 100, 200), 50);
  assert.equal(scoreFromTrackPageX(100, 100, 200), 0);
  assert.equal(scoreFromTrackPageX(300, 100, 200), 100);
  assert.equal(scoreFromTrackPageX(72, 100, 200), 0);
  assert.equal(scoreFromTrackPageX(340, 100, 200), 100);
  assert.equal(scoreFromTrackPageX(200, 100, 0), null);
});
