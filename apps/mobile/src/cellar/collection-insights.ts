import type { MemberCollectionBottle, RadarBottleOption } from '../api/types';
import type { CollectionValue } from './collection-value';

export function collectionInsights(bottles: readonly MemberCollectionBottle[], catalog: readonly RadarBottleOption[], value?: CollectionValue | null) {
  const byId = new Map(catalog.map(item => [item.id, item]));
  const producers = new Map<string, number>();
  const rarity = new Map<string, number>();
  let count = 0, proofTotal = 0, proofCount = 0, buyAgain = 0;
  const tastedRatings: number[] = [], ownedRatings: number[] = [], higherProof: number[] = [], lowerProof: number[] = [];
  for (const bottle of bottles) {
    // Exact identity only: similar names may be different releases or private picks.
    const metadata = !bottle.pendingCanonicalMatch ? byId.get(bottle.bottleId) : undefined;
    const quantity = bottle.sealedQuantity + bottle.openedQuantity;
    count += quantity;
    if (quantity) {
      const producer = metadata?.producer?.trim() || 'Producer not matched';
      producers.set(producer, (producers.get(producer) || 0) + quantity);
      const label = metadata?.rarityPending ? 'Under review' : metadata?.nationalTier === 'regular' ? 'Regular' : metadata?.rarity === 'unicorn' ? 'Unicorn' : metadata?.rarity === 'allocated' ? 'Allocated' : metadata?.rarity === 'limited' ? 'Limited' : 'Not classified';
      rarity.set(label, (rarity.get(label) || 0) + quantity);
      if (metadata?.proof && Number.isFinite(metadata.proof)) { proofTotal += metadata.proof * quantity; proofCount += quantity; }
    }
    if (bottle.wouldBuyAgain === true) buyAgain += 1;
    if (bottle.isRated && Number.isFinite(bottle.rating) && bottle.rating >= 0 && bottle.rating <= 100) {
      (quantity ? ownedRatings : tastedRatings).push(bottle.rating / 10);
      if (metadata?.proof) (metadata.proof >= 100 ? higherProof : lowerProof).push(bottle.rating / 10);
    }
  }
  const average = (scores: number[]) => scores.length ? scores.reduce((sum, n) => sum + n, 0) / scores.length : null;
  const sortedProducers = [...producers].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const pricedEntries = (value?.entries || []).filter(entry => entry.msrp).map(entry => ({ name: entry.name, amount: entry.msrp!.amount * (entry.sealedQuantity + entry.openedQuantity) })).sort((a, b) => b.amount - a.amount);
  const topCount = Math.min(3, pricedEntries.length);
  const topValue = pricedEntries.slice(0, 3).reduce((sum, entry) => sum + entry.amount, 0);
  return {
    ownedCount: count, producers: sortedProducers, rarity: [...rarity].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    averageProof: proofCount ? proofTotal / proofCount : null, proofCount, buyAgain,
    proofComparison: higherProof.length >= 3 && lowerProof.length >= 3 ? { higher: average(higherProof)!, lower: average(lowerProof)!, higherCount: higherProof.length, lowerCount: lowerProof.length } : null,
    ownershipComparison: ownedRatings.length >= 3 && tastedRatings.length >= 3 ? { owned: average(ownedRatings)!, tasted: average(tastedRatings)!, ownedCount: ownedRatings.length, tastedCount: tastedRatings.length } : null,
    concentration: value?.msrp.total && pricedEntries.length > 3 ? { percent: Math.round(topValue / value.msrp.total * 100), topCount, names: pricedEntries.slice(0, 3).map(entry => entry.name) } : null,
  };
}
