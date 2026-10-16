export interface CollectionValuation {
  currency: 'USD'; reviewedAt: string;
  ownedCount: number; sealedCount: number; openedCount: number;
  msrp: { total: number | null; pricedCount: number };
  secondary: { low: number | null; high: number | null; pricedCount: number };
}
export interface CollectionHistoryPoint {
  id: string;
  observedAt: string;
  collectionVersion: number;
  kind: 'inventory' | 'valuation';
  value: CollectionValuation;
}
export interface CollectionHistory {
  points: CollectionHistoryPoint[];
  firstRecordedAt: string | null;
  hasMore: boolean;
}
export function summarizeCollectionValue(value: CollectionValuation | null | undefined): CollectionValuation | null {
  if (!value) return null;
  return { currency: 'USD', reviewedAt: value.reviewedAt, ownedCount: value.ownedCount, sealedCount: value.sealedCount, openedCount: value.openedCount,
    msrp: { ...value.msrp }, secondary: { ...value.secondary } };
}
