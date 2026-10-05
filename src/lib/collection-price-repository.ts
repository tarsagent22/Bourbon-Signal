import { COLLECTION_PRICE_REFERENCES } from '../data/collection-price-references';
import { collectionValueForMember, type CollectionPriceReference } from './collection-value';
import { coverageDatabase } from './owner-workspace';
import { validatePriceReview } from './collection-price-review';
export async function readReviewedPrices() {
  const rows = await coverageDatabase().query('SELECT DISTINCT ON (bottle_id) bottle_id, reference, reviewed_at FROM collection_price_history ORDER BY bottle_id,id DESC') as Array<{bottle_id:string;reference:CollectionPriceReference;reviewed_at:string}>;
  const prices = new Map(COLLECTION_PRICE_REFERENCES.map(r=>[r.bottleId,r]));
  for (const row of rows) {
    try { prices.set(row.bottle_id,{...validatePriceReview(row.reference,new Date(row.reviewed_at)),reviewedAt:new Date(row.reviewed_at).toISOString().slice(0,10)}); }
    catch { prices.delete(row.bottle_id); }
  }
  return [...prices.values()];
}
export async function reviewedCollectionValue(advancedAccess: boolean, bottles: Parameters<typeof collectionValueForMember>[1]) {
  if (!advancedAccess) return null;
  try { return collectionValueForMember(true,bottles,new Date(),await readReviewedPrices()); }
  catch { return null; }
}
