import { isFreshPublicDrop, isPublicDropFeedEligible } from '../src/lib/public-drop-evidence.ts';

export function parseLiveDropTotal(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function liveDropTotalMeetsRegressionFloor({ localTotal, liveTotal, minRatio }) {
  if (liveTotal === null) return false;
  if (localTotal > 0 && liveTotal < Math.max(1, Math.floor(localTotal * minRatio))) return false;
  return true;
}

export function isDropExpectedInLiveFeed(drop, now = Date.now()) {
  return isPublicDropFeedEligible(drop) && isFreshPublicDrop(drop, now);
}
