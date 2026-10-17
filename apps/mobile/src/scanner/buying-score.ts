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
  const region = bottle.marketRarity;
  const localRarity = region && region.state === scope.state && currentEvidence(region.reviewedAt, now) ? region : null;
  const nationalReviewed = !bottle.rarity.pending && bottle.rarity.reviewedAt && currentEvidence(bottle.rarity.reviewedAt, now);
  const tier = localRarity?.tier || (nationalReviewed ? bottle.rarity.tier : null);
  const findPoints = tier === 'unicorn' || tier === 'highly_allocated' ? 95 : tier === 'allocated' ? 75 : tier === 'limited' ? 50 : tier === 'regular' ? 20 : null;
  const valuePoints = ratio == null ? null : ratio <= 0.9 ? 100 : ratio <= 1.15 ? 90 : ratio <= 1.3 ? 70 : ratio <= 1.6 ? 45 : ratio <= 2 ? 20 : 0;
  // A find score needs an evidenced scarcity classification. Missing components are omitted, never filled with defaults.
  const components = [{ value: findPoints, weight: 60 }, { value: valuePoints, weight: 25 }, { value: reviews.score, weight: 15 }].filter(component => component.value != null);
  const findScore = findPoints == null ? null : components.reduce((sum, component) => sum + component.value! * component.weight, 0) / components.reduce((sum, component) => sum + component.weight, 0);
  const rawScore = findScore ?? reviews.score;
  const score = rawScore == null ? null : Math.round(Math.max(0, Math.min(100, rawScore)));
  const invalid = parsed.kind === 'invalid';
  const scoreKind = findScore != null ? 'FIND SCORE' : 'REVIEW SCORE';
  const verdict = score == null ? 'Research pending' : invalid ? 'Check the shelf price' : ratio != null && ratio > 1.6 ? 'Steep price premium' : findScore == null ? 'Find evidence pending' : !reference ? 'Price unverified' : score >= 85 ? 'Exceptional find' : score >= 70 ? 'Notable find' : score >= 50 ? 'Worth a closer look' : 'Easy to find again';
  const confidence = findScore == null ? reviews.confidence : localRarity ? 'Supported state classification' : 'National evidence; local unverified';
  const personal = collection.find(item => !item.pendingCanonicalMatch && item.bottleId === bottle.id && item.isRated && Number.isFinite(item.rating) && item.rating >= 0 && item.rating <= 100);
  const reasons = [
    reviews.score == null ? 'No current, exact-expression drinking review evidence is verified yet. Any find score reflects verified scarcity and price context, without an invented tasting rating.' : `Published reviews: ${reviews.expert != null ? `experts ${reviews.expert.toFixed(1)}/100` : 'no expert score'}; ${reviews.community != null ? `consumers ${reviews.community.toFixed(1)}/100 after converting the published star scale` : 'no sufficiently sized consumer sample'}.`,
    invalid ? 'Enter a price greater than zero, with up to two decimal places. The automatic assessment remains visible.' : price ? `${priceBasis}: $${price.toFixed(2)}.${msrp ? ` Catalog reference: $${msrp.toFixed(2)}.` : ' No catalog price benchmark is verified.'}${enteredPrice == null && local.median == null ? ' This is a conditional assessment, not the price at the store in front of you.' : ''}` : 'No usable price benchmark is available. Price value is omitted from the score.',
    local.median ? `${local.count} distinct stores reported prices of $${local.low!.toFixed(2)}-$${local.high!.toFixed(2)} in the last 7 days.` : `Fewer than 3 recent distinct-store prices in ${scope.area || scope.state || 'your selected region'}; no local price benchmark. Missing sightings do not establish scarcity.`,
    localRarity ? `${localRarity.label} in ${localRarity.state}. ${localRarity.reason}` : nationalReviewed ? `Reviewed national classification: ${bottle.rarity.label}. A state-specific classification is not established here.` : 'Rarity is not sufficiently verified for a find score.',
  ];
  if (entry?.scopeNote) reasons.push(entry.scopeNote);
  if (bottle.proof && bottle.proof > 115) reasons.push(`${bottle.proof} proof: a higher-strength whiskey. Try a pour first if you are new to barrel-strength bottles; strength does not raise or lower drinking quality points.`);
  if (reviews.disagreement != null && reviews.disagreement > 15) reasons.push('Expert and consumer scores differ substantially; the confidence indicator reflects that disagreement.');
  const factors = [{ label: localRarity ? 'State rarity' : 'National rarity', points: findPoints, max: 100 }, { label: 'Price value', points: valuePoints, max: 100 }, { label: 'Reviews', points: reviews.score, max: 100 }];
  return { score, scoreKind, findScore: findScore == null ? null : Math.round(findScore), marketTier: tier, localClassification: Boolean(localRarity), reviewConfidence: reviews.confidence, verdict, confidence, preliminary: score == null || invalid || !reference, reasons, local, price, reference,
    priceBasis, automatic: enteredPrice == null, reputationScore: reviews.score == null ? null : Math.round(reviews.score),
    findPoints, valuePoints, factors,
    personalNote: personal ? `Your rating: ${(personal.rating / 10).toFixed(1)}/10. The published-evidence score is independent of your rating.` : null,
    adjustment: findScore == null ? 'Find classification is not established; this number is published drinking reputation only.' : 'Find score weights: rarity 60%, price value 25%, published reviews 15%. Missing components are omitted and the remaining weights are normalized.',
    sources: [
      ...reviews.ratings.map(rating => ({ label: `${rating.publisher} ${rating.kind}: ${rating.value}/${rating.scale}${rating.count ? ` (${rating.count.toLocaleString()} reviews)` : ''}`, url: rating.source, checkedAt: rating.checkedAt })),
      ...(entry?.producerFacts && currentEvidence(entry.producerFacts.checkedAt, now) ? [{ label: 'Producer facts', url: entry.producerFacts.source, checkedAt: entry.producerFacts.checkedAt }] : []),
      ...(localRarity?.sources || []).map(source => ({ label: source.label, url: source.url, checkedAt: localRarity!.reviewedAt })),
    ],
    producerFacts: entry?.producerFacts && currentEvidence(entry.producerFacts.checkedAt, now) ? entry.producerFacts : null,
  };
}
