export interface CellarHuntSuggestionBottle {
  canonicalKey: string;
  bottleName: string;
  rating?: number;
  isRated?: boolean;
  wouldBuyAgain?: boolean;
  finishedCount?: number;
  tastedOnly?: boolean;
}

export interface CellarHuntSuggestionSignal {
  canonicalKey: string;
  observedAt?: string;
}

export interface CellarHuntSuggestion {
  canonicalKey: string;
  bottleName: string;
  reason: string;
  actionLabel: "Watch for another";
  score: number;
  localSignalCount: number;
}

function key(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function ratingText(rating: number) {
  return (Math.max(0, Math.min(100, rating)) / 10).toFixed(1);
}

function recentSignalCounts(signals: readonly CellarHuntSuggestionSignal[], now: number) {
  const counts = new Map<string, number>();
  const oldest = now - 30 * 24 * 60 * 60 * 1_000;
  for (const signal of signals) {
    const observedAt = signal.observedAt ? Date.parse(signal.observedAt) : now;
    if (!Number.isFinite(observedAt) || observedAt < oldest || observedAt > now) continue;
    const canonicalKey = key(signal.canonicalKey);
    if (canonicalKey) counts.set(canonicalKey, (counts.get(canonicalKey) || 0) + 1);
  }
  return counts;
}

function suggestionReason(bottle: CellarHuntSuggestionBottle, localSignalCount: number) {
  const rating = bottle.isRated && Number.isFinite(bottle.rating) ? Number(bottle.rating) : null;
  if (localSignalCount > 0 && rating !== null) return `You rated this ${ratingText(rating)} and it has appeared locally.`;
  if (localSignalCount > 0 && bottle.wouldBuyAgain) return "You marked this buy again and it has appeared locally.";
  if (bottle.tastedOnly && rating !== null) return `You rated this ${ratingText(rating)} after tasting it.`;
  if ((bottle.finishedCount || 0) > 0) {
    const count = Math.floor(bottle.finishedCount || 0);
    return `You finished ${count} bottle${count === 1 ? "" : "s"}${bottle.wouldBuyAgain ? " and marked it buy again" : ""}.`;
  }
  if (bottle.wouldBuyAgain && rating !== null) return `You rated this ${ratingText(rating)} and marked it buy again.`;
  if (bottle.wouldBuyAgain) return "You marked this bottle buy again.";
  return `You rated this ${ratingText(rating || 0)}.`;
}

export function buildCellarHuntSuggestions({
  collection,
  watchedBottleKeys,
  localSignals = [],
  now = Date.now(),
  limit = 3,
}: {
  collection: readonly CellarHuntSuggestionBottle[];
  watchedBottleKeys: readonly string[];
  localSignals?: readonly CellarHuntSuggestionSignal[];
  now?: number;
  limit?: number;
}): CellarHuntSuggestion[] {
  const watched = new Set(watchedBottleKeys.map(key).filter(Boolean));
  const localCounts = recentSignalCounts(localSignals, now);
  const cappedLimit = Math.max(0, Math.min(3, Math.floor(Number.isFinite(limit) ? limit : 3)));

  return collection.flatMap((bottle) => {
    const canonicalKey = key(bottle.canonicalKey || bottle.bottleName);
    const rating = bottle.isRated && Number.isFinite(bottle.rating) ? Number(bottle.rating) : 0;
    const finishedCount = Math.max(0, Math.floor(bottle.finishedCount || 0));
    const explicitEvidence = bottle.wouldBuyAgain === true || rating >= 80 || finishedCount > 0;
    if (!canonicalKey || watched.has(canonicalKey) || !explicitEvidence) return [];
    const localSignalCount = localCounts.get(canonicalKey) || 0;
    const score = (bottle.wouldBuyAgain ? 50 : 0)
      + rating
      + Math.min(3, finishedCount) * 8
      + (bottle.tastedOnly ? 5 : 0)
      + Math.min(2, localSignalCount) * 6;
    return [{
      canonicalKey: bottle.canonicalKey || canonicalKey,
      bottleName: bottle.bottleName,
      reason: suggestionReason(bottle, localSignalCount),
      actionLabel: "Watch for another" as const,
      score,
      localSignalCount,
    }];
  }).sort((left, right) => right.score - left.score || left.bottleName.localeCompare(right.bottleName)).slice(0, cappedLimit);
}
