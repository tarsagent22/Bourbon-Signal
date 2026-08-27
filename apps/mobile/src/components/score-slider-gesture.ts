export function scoreFromTrackPageX(pageX: number, trackLeft: number, trackWidth: number) {
  if (!Number.isFinite(pageX) || !Number.isFinite(trackLeft) || !Number.isFinite(trackWidth) || trackWidth <= 0) return null;
  const relativeX = Math.max(0, Math.min(trackWidth, pageX - trackLeft));
  return Math.round((relativeX / trackWidth) * 100);
}
