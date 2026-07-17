export function mergePartialRefreshDrops({ previousDrops = [], currentDrops = [], partialRefresh = false, attemptedStateIds = [] } = {}) {
  if (!partialRefresh) return currentDrops;
  const attempted = new Set(attemptedStateIds.map((state) => String(state).toUpperCase()));
  const stateOf = (drop) => String(drop?.state || drop?.state_code || '').toUpperCase();
  const merged = [
    ...currentDrops.filter((drop) => attempted.has(stateOf(drop))),
    ...previousDrops.filter((drop) => !attempted.has(stateOf(drop))),
  ];
  const seen = new Set();
  return merged.filter((drop) => {
    const key = drop?.id || [stateOf(drop), drop?.canonicalId, drop?.sourceUrl, drop?.locationName, drop?.quantity, drop?.availabilityStatus, drop?.sourceEventAt].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10000);
}
