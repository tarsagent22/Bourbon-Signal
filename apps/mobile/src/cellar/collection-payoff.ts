import type { MemberCollectionBottle, RadarBottleOption } from '../api/types';

const rated = (bottle: MemberCollectionBottle) => bottle.isRated && Number.isFinite(bottle.rating) && bottle.rating >= 0 && bottle.rating <= 100;
export function collectionPayoff(bottles: readonly MemberCollectionBottle[], catalog: readonly RadarBottleOption[]) {
  const byId = new Map(catalog.map(bottle => [bottle.id, bottle]));
  const owned = bottles.filter(bottle => bottle.sealedQuantity + bottle.openedQuantity > 0);
  const ratings = bottles.filter(rated);
  const highlights = [...(owned.length ? owned : bottles)].sort((a, b) => Number(rated(b)) - Number(rated(a)) || (rated(a) && rated(b) ? b.rating - a.rating : 0) || a.bottleName.localeCompare(b.bottleName)).slice(0, 3);
  const proofBuckets = [{ label: 'Under 100', count: 0 }, { label: '100–114', count: 0 }, { label: '115+', count: 0 }];
  const proofs: number[] = [];
  const tags = new Map<string, { label: string; count: number }>();
  for (const bottle of owned) {
    const proof = !bottle.pendingCanonicalMatch ? byId.get(bottle.bottleId)?.proof : undefined;
    if (!proof || !Number.isFinite(proof)) continue;
    const count = bottle.sealedQuantity + bottle.openedQuantity;
    proofBuckets[proof < 100 ? 0 : proof < 115 ? 1 : 2].count += count;
    proofs.push(proof);
  }
  for (const bottle of ratings.filter(bottle => bottle.rating >= 80)) {
    for (const tag of new Set((bottle.tasteTags || []).map(tag => tag.trim().toLowerCase()).filter(Boolean))) {
      const current = tags.get(tag) || { label: tag.charAt(0).toUpperCase() + tag.slice(1), count: 0 };
      current.count++; tags.set(tag, current);
    }
  }
  const nextMilestone = [1, 3, 5, 10, 25, 50, 100, 250].find(n => n > bottles.length) || Math.ceil((bottles.length + 1) / 100) * 100;
  return { highlights, ownedCount: owned.length, ratedCount: ratings.length,
    averageRating: ratings.length ? ratings.reduce((sum, bottle) => sum + bottle.rating, 0) / ratings.length / 10 : null,
    favoriteCount: ratings.filter(bottle => bottle.rating >= 80).length,
    proofBuckets, proofCount: proofBuckets.reduce((sum, item) => sum + item.count, 0),
    proofRange: proofs.length ? { low: Math.min(...proofs), high: Math.max(...proofs) } : null,
    tasteTags: [...tags.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 5), nextMilestone };
}
