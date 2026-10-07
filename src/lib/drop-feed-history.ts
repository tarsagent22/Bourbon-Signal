export function historicalDropFeedEnabled(input: {
  requested: boolean;
  isSignedIn: boolean;
  canUseAdvancedFilters: boolean;
  tierCount: number;
}) {
  return input.requested && input.isSignedIn && input.canUseAdvancedFilters && input.tierCount > 0;
}

export function scopedDropFeedHistoryEnabled(input: {
  state?: string | null;
  area?: string | null;
  store?: string | null;
  bottle?: string | null;
}) {
  return [input.state, input.area, input.store, input.bottle].some((value) => {
    const normalized = String(value || "").trim();
    return normalized.length > 0 && normalized.toUpperCase() !== "ALL";
  });
}

export function selectDropFeedHistory<T extends Record<string, unknown>>(
  rows: T[],
  historicalMode: boolean,
  isFresh: (row: T) => boolean,
  isHistoricalEligible: (row: T) => boolean = () => true,
  decorate: boolean = true,
): Array<T & { historical?: boolean }> {
  if (!historicalMode) return rows.filter((row) => row.historical !== true && isFresh(row));
  // Filtering keeps row references; only the returned page needs historical labels.
  if (!decorate) return rows.filter((row) => (row.historical !== true && isFresh(row)) || isHistoricalEligible(row));
  return rows
    .map((row) => ({ row, fresh: row.historical !== true && isFresh(row) }))
    .filter(({ row, fresh }) => fresh || isHistoricalEligible(row))
    .map(({ row, fresh }) => ({ ...row, historical: !fresh }));
}
