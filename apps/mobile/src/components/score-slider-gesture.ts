export type ScoreSliderGestureIntent = "pending" | "horizontal" | "vertical";

const GESTURE_INTENT_THRESHOLD = 6;

export function classifyScoreSliderGesture(
  dx: number,
  dy: number,
  threshold = GESTURE_INTENT_THRESHOLD,
): ScoreSliderGestureIntent {
  const horizontalDistance = Math.abs(dx);
  const verticalDistance = Math.abs(dy);
  if (Math.max(horizontalDistance, verticalDistance) <= threshold) return "pending";
  return horizontalDistance > verticalDistance ? "horizontal" : "vertical";
}
