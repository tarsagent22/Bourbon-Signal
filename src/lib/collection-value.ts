import { COLLECTION_PRICE_REFERENCES } from '../data/collection-price-references';

export interface CollectionPriceReference {
  bottleId: string;
  names: readonly string[];
  reviewedAt?: string;
  msrp?: { amount: number; date: string; source: string; label: string };
  secondary?: { low: number; high: number; date: string; source: string; label: string; evidenceKind?: 'completed_sales' | 'market_reference'; confidence?: 'low'|'medium'|'high'; observations?: Array<{amount:number;date:string;source:string}> };
}
export interface CollectionValue {
  currency: 'USD'; reviewedAt: string;
  ownedCount: number; sealedCount: number; openedCount: number;
  msrp: { total: number | null; pricedCount: number };
  secondary: { low: number | null; high: number | null; pricedCount: number };
  entries: Array<{ bottleId: string; name: string; sealedQuantity: number; openedQuantity: number;
    msrp: CollectionPriceReference['msrp'] | null; secondary: CollectionPriceReference['secondary'] | null }>;
}
type Holding = { bottleId: string; bottleName: string; sealedQuantity: number; openedQuantity: number; pendingCanonicalMatch?: boolean };
const quantity = (n: number) => Number.isFinite(n) ? Math.min(999, Math.max(0, Math.floor(n))) : 0;
const positive = (n: number) => Number.isFinite(n) && n > 0;
const cents = (n: number) => Math.round(n * 100) / 100;
// No fuzzy matching: editions, private picks and bottle sizes have different prices.
const nameKey = (name: string) => name.trim().toLowerCase().replace(/[’]/g, "'");
function validDate(date: string, now: number, maximumAgeDays: number) {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(date + 'T00:00:00Z') : NaN;
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === date
    && parsed <= now && now - parsed <= maximumAgeDays * 86400000;
}

/** Called only with server-resolved entitlements and the durable member collection. */
export function collectionValueForMember(advancedAccess: boolean, bottles: readonly Holding[], now = new Date(), references: readonly CollectionPriceReference[] = COLLECTION_PRICE_REFERENCES): CollectionValue | null {
  if (!advancedAccess) return null;
  let msrpTotal = 0, msrpCount = 0, low = 0, high = 0, secondaryCount = 0;
  const result: CollectionValue = { currency: 'USD', reviewedAt: '2026-10-05', ownedCount: 0, sealedCount: 0, openedCount: 0,
    msrp: { total: null, pricedCount: 0 }, secondary: { low: null, high: null, pricedCount: 0 }, entries: [] };
  for (const reference of references) if (reference.reviewedAt && validDate(reference.reviewedAt,now.getTime(),730) && reference.reviewedAt>result.reviewedAt) result.reviewedAt=reference.reviewedAt;
  for (const bottle of bottles) {
    const sealedQuantity = quantity(bottle.sealedQuantity), openedQuantity = quantity(bottle.openedQuantity);
    if (!sealedQuantity && !openedQuantity) continue;
    result.ownedCount += sealedQuantity + openedQuantity;
    result.sealedCount += sealedQuantity; result.openedCount += openedQuantity;
    const reference = bottle.pendingCanonicalMatch ? undefined : references.find(r => r.bottleId === bottle.bottleId && r.names.some(n => nameKey(n) === nameKey(bottle.bottleName)));
    // Published MSRP is a dated replacement-price reference, never the member's purchase price.
    const msrp = reference?.msrp && positive(reference.msrp.amount) && validDate(reference.msrp.date, now.getTime(), 730) ? reference.msrp : null;
    // Unreviewed/old market prices must not silently become current estimates.
    const secondary = reference?.secondary && positive(reference.secondary.low) && positive(reference.secondary.high)
      && reference.secondary.high >= reference.secondary.low && validDate(reference.secondary.date, now.getTime(), 90)
      && validDate(reference.reviewedAt || '2026-10-05', now.getTime(), 90) ? reference.secondary : null;
    if (msrp) { msrpTotal += msrp.amount * (sealedQuantity + openedQuantity); msrpCount += sealedQuantity + openedQuantity; }
    if (secondary && sealedQuantity) { low += secondary.low * sealedQuantity; high += secondary.high * sealedQuantity; secondaryCount += sealedQuantity; }
    result.entries.push({ bottleId: bottle.bottleId, name: bottle.bottleName, sealedQuantity, openedQuantity, msrp, secondary });
  }
  result.msrp = { total: msrpCount ? cents(msrpTotal) : result.ownedCount === 0 ? 0 : null, pricedCount: msrpCount };
  result.secondary = { low: secondaryCount ? cents(low) : result.sealedCount === 0 ? 0 : null, high: secondaryCount ? cents(high) : result.sealedCount === 0 ? 0 : null, pricedCount: secondaryCount };
  return result;
}
