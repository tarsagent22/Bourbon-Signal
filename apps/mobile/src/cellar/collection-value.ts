export interface CollectionPrice { date: string; source: string; label: string; confidence?: 'low'|'medium'|'high'; evidenceKind?: 'completed_sales'|'market_reference'; observations?:Array<{amount:number;date:string;source:string}> }
export interface CollectionValue {
  currency: 'USD'; reviewedAt: string;
  ownedCount: number; sealedCount: number; openedCount: number;
  msrp: { total: number | null; pricedCount: number };
  secondary: { low: number | null; high: number | null; pricedCount: number };
  entries: Array<{ bottleId: string; name: string; sealedQuantity: number; openedQuantity: number;
    msrp: (CollectionPrice & { amount: number }) | null;
    secondary: (CollectionPrice & { low: number; high: number }) | null }>;
}
export const collectionMoney = (value: number | null) => value === null ? 'Not priced yet' : '$' + value.toLocaleString('en-US', { maximumFractionDigits: 0 });
export const secondaryMoney = (value: CollectionValue) => value.secondary.low === null || value.secondary.high === null ? 'Not priced yet' : value.secondary.low === value.secondary.high ? collectionMoney(value.secondary.low) : `${collectionMoney(value.secondary.low)} – ${collectionMoney(value.secondary.high)}`;
