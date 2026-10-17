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
  const statePrices = scope.area ? regionalPriceEvidence(bottle, reports, { state: scope.state, area: '' }, now) : local;
  const observed = local.median != null ? local : statePrices;
  const priceRegion = local.median != null ? scope.area || scope.state : scope.state;
  const stateFallback = Boolean(scope.area && local.median == null && statePrices.median != null);
  const entry = bottleReputation(bottle);
  const reviews = reputationEvidence(entry, now);
  const release = entry?.release && currentEvidence(entry.release.checkedAt, now) ? entry.release : null;
  const parsed = compareBottlePrice(askingPrice, bottle.msrp);
  const enteredPrice = parsed.kind === 'compared' || parsed.kind === 'unpriced' ? parsed.price : null;
  const msrp = bottle.msrp != null && Number.isFinite(bottle.msrp) && bottle.msrp > 0 ? bottle.msrp : null;
  const reference = msrp ?? observed.median;
  // A catalog reference is a benchmark, never an observed shelf price. Never compare a median to itself.
  const price = enteredPrice ?? observed.median;
  const ratio = price != null && reference != null && (enteredPrice != null || msrp != null) ? price / reference : null;
  const priceBasis = enteredPrice != null ? 'Your shelf price' : observed.median != null ? `Recent ${priceRegion} median` : msrp != null ? 'Catalog reference' : 'Price not verified';
  const region = bottle.marketRarity;
  const localRarity = region && region.state === scope.state && currentEvidence(region.reviewedAt, now) ? region : null;
  const nationalReviewed = !bottle.rarity.pending && bottle.rarity.reviewedAt && currentEvidence(bottle.rarity.reviewedAt, now);
  const tier = localRarity?.tier || (nationalReviewed ? bottle.rarity.tier : null) || (release ? release.kind === 'standard' ? 'regular' : release.kind : null);
  const releaseLabel = localRarity ? `${localRarity.label} in ${scope.state}` : nationalReviewed ? bottle.rarity.label : release?.label || null;
  const findPoints = tier === 'unicorn' || tier === 'highly_allocated' ? 95 : tier === 'allocated' ? 80 : tier === 'limited' ? 65 : tier === 'regular' ? 40 : null;
  const valuePoints = ratio == null ? null : ratio <= 0.9 ? 100 : ratio <= 1.15 ? 90 : ratio <= 1.3 ? 70 : ratio <= 1.6 ? 45 : ratio <= 2 ? 20 : 0;
  const components = [{ value: findPoints, weight: 60 }, { value: valuePoints, weight: 25 }, { value: reviews.score, weight: 15 }].filter(component => component.value != null);
  const raw = findPoints == null ? null : components.reduce((sum, c) => sum + c.value! * c.weight, 0) / components.reduce((sum, c) => sum + c.weight, 0);
  const score = raw == null ? null : Math.round(Math.max(0, Math.min(100, raw)));
  const invalid = parsed.kind === 'invalid';
  const verdict = invalid ? 'Check the shelf price' : ratio != null && ratio > 1.6 ? 'Steep price premium' : score == null ? reviews.score != null ? 'Reviews available' : 'Still researching this release' : score >= 85 ? 'Exceptional find' : score >= 70 ? 'Notable find' : tier === 'regular' ? 'Everyday option' : 'Worth a closer look';
  const confidence = localRarity ? 'State evidence' : score != null ? 'National context' : 'Find context incomplete';
  const evidenceScope = stateFallback ? `${scope.state} prices · ${scope.area} sample unavailable` : observed.median != null ? `${priceRegion} prices` : scope.state ? `National context · local availability unverified` : 'National context';
  const referenceLabel = msrp != null ? 'Catalog reference' : observed.median != null ? `${priceRegion} median` : 'Reference';
  const money = (v: number) => `$${v.toFixed(2)}`;
  const priceSummary = price != null ? `${money(price)} · ${priceBasis}` : reference != null ? `${money(reference)} reference` : 'Price reference unavailable';
  const priceNote = invalid ? 'Enter a price greater than zero, with up to two decimal places.' : ratio === 1 ? `At ${referenceLabel.toLowerCase()} (${money(reference!)}).` : ratio != null ? `${Math.abs((ratio - 1) * 100).toFixed(0)}% ${ratio < 1 ? 'below' : 'above'} ${referenceLabel.toLowerCase()} (${money(reference!)}).` : price != null ? 'No separate price benchmark; value is not scored.' : 'Shelf price unknown · value not scored';
  const reasons = [
    localRarity ? localRarity.reason : nationalReviewed ? `${bottle.rarity.label} nationally; local availability varies.` : release?.reason || 'Release availability is still being researched.',
    ratio != null ? priceNote : reviews.score != null ? reviews.disagreement != null && reviews.disagreement > 15 ? 'Expert and consumer reviews differ.' : reviews.score >= 80 ? 'Well reviewed for drinking.' : 'Drinking reviews are available below.' : reference != null ? `Use the ${money(reference)} reference to compare a shelf price.` : 'Add a shelf price when you have one.',
  ];
  const personal = collection.find(item => !item.pendingCanonicalMatch && item.bottleId === bottle.id && item.isRated && Number.isFinite(item.rating) && item.rating >= 0 && item.rating <= 100);
  const notes = [stateFallback ? `Not enough independent prices in ${scope.area}; using ${scope.state} observations.` : observed.median != null ? `${observed.count} distinct stores in ${priceRegion}, observed within 7 days.` : `No usable local price sample. Missing sightings do not establish scarcity.`, entry?.scopeNote, bottle.proof && bottle.proof > 115 ? `${bottle.proof} proof. Try a pour first if you are new to higher-strength whiskey.` : null, reviews.disagreement != null && reviews.disagreement > 15 ? 'Expert and consumer ratings differ substantially.' : null].filter((v): v is string => Boolean(v));
  return { score, scoreKind: 'SIGNAL SCORE', findScore: score, marketTier: tier, releaseLabel, localClassification: Boolean(localRarity), reviewConfidence: reviews.confidence, verdict, confidence, evidenceScope, preliminary: score == null || invalid || valuePoints == null,
    reasons, notes, local, statePrices, stateFallback, price, reference, priceBasis, priceSummary, priceNote, automatic: enteredPrice == null,
    reputationScore: reviews.score == null ? null : Math.round(reviews.score), reviewPublishers: [...new Set(reviews.ratings.map(rating => rating.publisher))].join(', '), reviewStats: { expert: reviews.expert, consumer: reviews.community == null ? null : reviews.community / 20, count: reviews.ratings.filter(r => r.kind === 'community').reduce((sum, r) => sum + (r.count || 0), 0) },
    findPoints, valuePoints, factors: [{ label: localRarity ? 'State rarity' : 'Release context', points: findPoints, max: 100 }, { label: 'Observed price value', points: valuePoints, max: 100 }, { label: 'Published reviews', points: reviews.score, max: 100 }],
    personalNote: personal ? `Your rating: ${(personal.rating / 10).toFixed(1)}/10` : null,
    adjustment: 'Signal Score weights: release rarity 60%, observed price value 25%, published reviews 15%. Missing components are omitted and remaining weights normalized. A current release classification is required; drinking reviews never replace the Signal Score.',
    sources: [
      ...reviews.ratings.map(r => ({ label: `${r.publisher} ${r.kind}: ${r.value}/${r.scale}${r.count ? ` (${r.count.toLocaleString()} reviews)` : ''}`, url: r.source, checkedAt: r.checkedAt })),
      ...(entry?.producerFacts && currentEvidence(entry.producerFacts.checkedAt, now) ? [{ label: 'Producer facts', url: entry.producerFacts.source, checkedAt: entry.producerFacts.checkedAt }] : []),
      ...(release ? [{ label: 'Release context', url: release.source, checkedAt: release.checkedAt }] : []),
      ...(localRarity?.sources || []).map(source => ({ label: source.label, url: source.url, checkedAt: localRarity!.reviewedAt })),
    ],
    producerFacts: entry?.producerFacts && currentEvidence(entry.producerFacts.checkedAt, now) ? entry.producerFacts : null,
  };
}
