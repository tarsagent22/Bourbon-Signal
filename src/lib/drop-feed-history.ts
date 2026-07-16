export function historicalDropFeedEnabled(input: {
  requested: boolean;
  isSignedIn: boolean;
  canUseAdvancedFilters: boolean;
  tierCount: number;
}) {
  return input.requested && input.isSignedIn && input.canUseAdvancedFilters && input.tierCount > 0;
}

export function selectDropFeedHistory<T extends Record<string, unknown>>(
  rows: T[],
  historicalMode: boolean,
  isFresh: (row: T) => boolean,
  isHistoricalEligible: (row: T) => boolean = () => true,
): Array<T & { historical?: boolean }> {
  if (!historicalMode) return rows.filter(isFresh);
  return rows
    .map((row) => ({ row, fresh: isFresh(row) }))
    .filter(({ row, fresh }) => fresh || isHistoricalEligible(row))
    .map(({ row, fresh }) => ({ ...row, historical: !fresh }));
}
