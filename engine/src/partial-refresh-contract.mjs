export function mergePartialRefreshDrops({ previousDrops = [], currentDrops = [], partialRefresh = false, attemptedStateIds = [], fallbackStateIds = [] } = {}) {
  const previousRows = Array.isArray(previousDrops) ? previousDrops : Array.isArray(previousDrops?.drops) ? previousDrops.drops : [];
  const currentRows = Array.isArray(currentDrops) ? currentDrops : Array.isArray(currentDrops?.drops) ? currentDrops.drops : [];
  const preserved = new Set(fallbackStateIds.map((state) => String(state).toUpperCase()));
  if (!partialRefresh && !preserved.size) return currentRows;
  const attempted = new Set(attemptedStateIds.map((state) => String(state).toUpperCase()).filter((state) => !preserved.has(state)));
  const stateOf = (drop) => String(drop?.state || drop?.state_code || '').toUpperCase();
  const merged = [
    ...currentRows.filter((drop) => attempted.has(stateOf(drop))),
    ...previousRows.filter((drop) => !attempted.has(stateOf(drop))),
  ];
  const seen = new Set();
  return merged.filter((drop) => {
    const key = drop?.id || [stateOf(drop), drop?.canonicalId, drop?.sourceUrl, drop?.locationName, drop?.quantity, drop?.availabilityStatus, drop?.sourceEventAt].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10000);
}
