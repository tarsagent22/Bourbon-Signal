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

export function scoreFromTrackPageX(pageX: number, trackLeft: number, trackWidth: number) {
  if (!Number.isFinite(pageX) || !Number.isFinite(trackLeft) || !Number.isFinite(trackWidth) || trackWidth <= 0) return null;
  const relativeX = Math.max(0, Math.min(trackWidth, pageX - trackLeft));
  return Math.round((relativeX / trackWidth) * 100);
}
