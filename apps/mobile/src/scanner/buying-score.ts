import type { BottleProfile } from '../../../../shared/bottle-profile';
import { compareBottlePrice } from '../../../../shared/bottle-profile';
import type { MemberCollectionBottle, Signal } from '../api/types';
import { reportAge } from '../api/presentation';
import { bottleReputation, reputationEvidence, currentEvidence } from '../../../../shared/bottle-reputation';

export interface BuyingScope { state: string; area: string }
const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Price observations are a bounded sample, never a claim of current stock or statewide scarcity. */
export function regionalPriceEvidence(bottle: Pick<BottleProfile, 'id' | 'name'>, reports: readonly Signal[], scope: BuyingScope, now = new Date()) {
  const stores = new Map<string, { price: number; at: number }>();
  for (const report of reports) {
    if (!scope.state || report.kind !== 'availability' || report.historical || report.location.scope !== 'exact_store' || !['reported', 'available_now'].includes(report.availability?.status || '')) continue;
    if ((report.bottle.id ? report.bottle.id !== bottle.id : clean(report.bottle.name) !== clean(bottle.name))) continue;
    if ((report.location.store?.state || report.location.state)?.toUpperCase() !== scope.state) continue;
    if (scope.area && ![report.location.store?.city, report.location.label].some(value => value && clean(value) === clean(scope.area))) continue;
    const price = report.availability?.price;
    const observed = reportAge(report, now).value;
    const at = observed ? Date.parse(observed) : NaN;
    if (!Number.isFinite(at) || at > now.getTime() || now.getTime() - at > 7 * 86400000 || !price || !Number.isFinite(price) || price <= 0) continue;
    const store = report.location.store;
    // Do not let repeated snapshots or reports at the same store skew the median.
    const key = store?.name ? clean([store.name, store.city, scope.state].filter(Boolean).join(' ')) : store?.id || '';
    if (!key) continue;
    if (!stores.has(key) || stores.get(key)!.at < at) stores.set(key, { price, at });
  }
  const prices = [...stores.values()].map(item => item.price).sort((a, b) => a - b);
  const middle = Math.floor(prices.length / 2);
  const median = prices.length >= 3 ? prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2 : null;
  return { count: prices.length, median, low: prices.length ? prices[0] : null, high: prices.length ? prices.at(-1)! : null };
}

export function buyingScore({ bottle, askingPrice, reports, scope, collection = [], now = new Date() }: {
  bottle: BottleProfile; askingPrice: string; reports: readonly Signal[]; scope: BuyingScope;
  collection?: readonly MemberCollectionBottle[]; now?: Date;
}) {
  const local = regionalPriceEvidence(bottle, reports, scope, now);
  const entry = bottleReputation(bottle);
  const reviews = reputationEvidence(entry, now);
  const parsed = compareBottlePrice(askingPrice, bottle.msrp);
  const enteredPrice = parsed.kind === 'compared' || parsed.kind === 'unpriced' ? parsed.price : null;
  const msrp = bottle.msrp != null && Number.isFinite(bottle.msrp) && bottle.msrp > 0 ? bottle.msrp : null;
  const reference = msrp ?? local.median;
  // Automatic context comes from actual observations first; a catalog reference is explicitly conditional.
  const price = enteredPrice ?? local.median ?? msrp;
  const priceBasis = enteredPrice != null ? 'Your shelf price' : local.median != null ? `Recent ${scope.area || scope.state} median` : msrp != null ? 'At catalog reference price' : 'Price not verified';
  const ratio = price && reference ? price / reference : null;
  const priceAdjustment = ratio == null ? 0 : ratio <= 0.9 ? 5 : ratio <= 1.15 ? 0 : ratio <= 1.3 ? -8 : ratio <= 1.6 ? -18 : ratio <= 2 ? -30 : -45;
  const region = bottle.marketRarity;
  const localRarity = region && region.state === scope.state && currentEvidence(region.reviewedAt, now) ? region : null;
  const nationalReviewed = !bottle.rarity.pending && bottle.rarity.reviewedAt && currentEvidence(bottle.rarity.reviewedAt, now);
  const tier = localRarity?.tier || (nationalReviewed ? bottle.rarity.tier : null);
  const rarityAdjustment = tier === 'unicorn' || tier === 'highly_allocated' ? 5 : tier === 'allocated' ? 3 : tier === 'limited' ? 1 : 0;
  const rawScore = reviews.score == null ? null : reviews.score + priceAdjustment + rarityAdjustment;
  let score = rawScore == null ? null : Math.round(Math.max(0, Math.min(100, rawScore)));
  // Hype cannot turn a large price premium into a strong buy.
  if (score != null && ratio != null && ratio > 1.6) score = Math.min(score, ratio > 2 ? 39 : 59);
  const invalid = parsed.kind === 'invalid';
  const verdict = score == null ? 'Research pending' : invalid ? 'Check the shelf price' : !reference ? 'Reputation only; price unverified' : ratio != null && ratio > 1.6 ? 'Pass at this price' : score >= 85 ? 'Strong bottle to consider' : score >= 75 ? 'Worth considering' : score >= 60 ? 'Try a pour first' : 'Compare other options';
  const personal = collection.find(item => !item.pendingCanonicalMatch && item.bottleId === bottle.id && item.isRated && Number.isFinite(item.rating) && item.rating >= 0 && item.rating <= 100);
  const reasons = [
    reviews.score == null ? 'No current, exact-expression review evidence is verified yet. Producer facts and rarity alone cannot establish drinking quality.' : `Published reviews: ${reviews.expert != null ? `experts ${reviews.expert.toFixed(1)}/100` : 'no expert score'}; ${reviews.community != null ? `consumers ${reviews.community.toFixed(1)}/100 after converting the published star scale` : 'no sufficiently sized consumer sample'}.`,
    invalid ? 'Enter a price greater than zero, with up to two decimal places. The automatic assessment remains visible.' : price ? `${priceBasis}: $${price.toFixed(2)}.${msrp ? ` Catalog reference: $${msrp.toFixed(2)}.` : ' No catalog price benchmark is verified.'}${enteredPrice == null && local.median == null ? ' This is a conditional assessment, not the price at the store in front of you.' : ''}` : 'No usable price benchmark is available. The number reflects published reputation only.',
    local.median ? `${local.count} distinct stores reported prices of $${local.low!.toFixed(2)}-$${local.high!.toFixed(2)} in the last 7 days.` : `Fewer than 3 recent distinct-store prices in ${scope.area || scope.state || 'your selected region'}; no local price benchmark. Missing sightings do not establish scarcity.`,
    localRarity ? `${localRarity.label} in ${localRarity.state}. ${localRarity.reason}` : nationalReviewed ? `Reviewed national classification: ${bottle.rarity.label}. A state-specific classification is not established here.` : 'Rarity is not sufficiently verified for a score adjustment.',
  ];
  if (entry?.scopeNote) reasons.push(entry.scopeNote);
  if (bottle.proof && bottle.proof > 115) reasons.push(`${bottle.proof} proof: a higher-strength whiskey. Try a pour first if you are new to barrel-strength bottles; strength does not raise or lower drinking quality points.`);
  if (reviews.disagreement != null && reviews.disagreement > 15) reasons.push('Expert and consumer scores differ substantially; the confidence indicator reflects that disagreement.');
  const factors = [
    { label: 'Experts', points: reviews.expert, max: 100 },
    { label: 'Consumers', points: reviews.community, max: 100 },
  ];
  return { score, verdict, confidence: reviews.confidence, preliminary: score == null || invalid || !reference, reasons, local, price, reference,
    priceBasis, automatic: enteredPrice == null, reputationScore: reviews.score == null ? null : Math.round(reviews.score),
    priceAdjustment, rarityAdjustment, factors,
    personalNote: personal ? `Your rating: ${(personal.rating / 10).toFixed(1)}/10. The published-evidence score is independent of your rating.` : null,
    adjustment: score == null ? null : `Price adjustment ${priceAdjustment > 0 ? '+' : ''}${priceAdjustment}; find value +${rarityAdjustment}.`,
    sources: [
      ...reviews.ratings.map(rating => ({ label: `${rating.publisher} ${rating.kind}: ${rating.value}/${rating.scale}${rating.count ? ` (${rating.count.toLocaleString()} reviews)` : ''}`, url: rating.source, checkedAt: rating.checkedAt })),
      ...(entry?.producerFacts && currentEvidence(entry.producerFacts.checkedAt, now) ? [{ label: 'Producer facts', url: entry.producerFacts.source, checkedAt: entry.producerFacts.checkedAt }] : []),
      ...(localRarity?.sources || []).map(source => ({ label: source.label, url: source.url, checkedAt: localRarity!.reviewedAt })),
    ],
    producerFacts: entry?.producerFacts && currentEvidence(entry.producerFacts.checkedAt, now) ? entry.producerFacts : null,
  };
}
