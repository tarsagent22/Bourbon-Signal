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
  // The number always means the same thing: 80% find rarity, 20% published reviews.
  // Price has its own verdict, so an unknown price never silently reweights the score.
  const raw = findPoints == null || reviews.score == null ? null : findPoints * 0.8 + reviews.score * 0.2;
  const score = raw == null ? null : Math.round(Math.max(0, Math.min(100, raw)));
  const scoreRange = findPoints != null && reviews.score == null ? { low: Math.round(findPoints * 0.8), high: Math.round(findPoints * 0.8 + 20) } : null;
  const invalid = parsed.kind === 'invalid';
  const findVerdict = score == null ? scoreRange ? 'Release assessed' : reviews.score != null ? 'Reviews available' : 'Still researching this release' : score >= 85 ? 'Exceptional find' : score >= 70 ? 'Notable find' : tier === 'regular' ? 'Everyday option' : 'Worth a closer look';
  const priceVerdict = invalid ? 'Check the shelf price' : ratio == null ? enteredPrice != null ? 'Price reference unavailable' : null : ratio > 1.6 ? 'Steep price premium' : ratio > 1.3 ? 'Priced above reference' : ratio > 1.15 ? 'Some price premium' : reviews.score != null && reviews.score >= 75 ? 'Good buy at this price' : ratio < 0.9 ? 'Below reference price' : 'Near reference price';
  const verdict = priceVerdict || findVerdict;
  const confidence = localRarity ? 'State evidence' : score != null ? 'National context' : 'Find context incomplete';
  const evidenceScope = localRarity ? `${scope.state} context` : 'National context';
  const money = (v: number) => `$${v.toFixed(2)}`;
  const priceSummary = price != null ? `${money(price)} · ${priceBasis}` : reference != null ? `${money(reference)} reference` : 'Price reference unavailable';
  const priceNote = invalid ? 'Enter a valid price greater than zero.' : ratio === 1 ? `At the ${money(reference!)} reference` : ratio != null ? `${Math.abs((ratio - 1) * 100).toFixed(0)}% ${ratio < 1 ? 'below' : 'above'} ${money(reference!)} reference` : price != null ? 'No price benchmark yet' : reference != null ? `${money(reference)} reference` : 'No price benchmark yet';
  const reasons = [
    localRarity ? localRarity.reason : nationalReviewed ? `${bottle.rarity.label} nationally; local availability varies.` : release?.reason || 'Release availability is still being researched.',
    ratio != null ? priceNote : reviews.score != null ? reviews.disagreement != null && reviews.disagreement > 15 ? 'Expert and consumer reviews differ.' : reviews.score >= 80 ? 'Well reviewed for drinking.' : 'Drinking reviews are available below.' : reference != null ? `Use the ${money(reference)} reference to compare a shelf price.` : 'Add a shelf price when you have one.',
  ];
  const personal = collection.find(item => !item.pendingCanonicalMatch && item.bottleId === bottle.id && item.isRated && Number.isFinite(item.rating) && item.rating >= 0 && item.rating <= 100);
  const notes = [stateFallback ? `Not enough independent prices in ${scope.area}; using ${scope.state} observations.` : observed.median != null ? `${observed.count} distinct stores in ${priceRegion}, observed within 7 days.` : `No usable local price sample. Missing sightings do not establish scarcity.`, entry?.scopeNote, bottle.proof && bottle.proof > 115 ? `${bottle.proof} proof. Try a pour first if you are new to higher-strength whiskey.` : null, reviews.disagreement != null && reviews.disagreement > 15 ? 'Expert and consumer ratings differ substantially.' : null].filter((v): v is string => Boolean(v));
  return { score, scoreRange, findVerdict, priceVerdict, scoreKind: 'SIGNAL SCORE', findScore: score, marketTier: tier, releaseLabel, localClassification: Boolean(localRarity), reviewConfidence: reviews.confidence, verdict, confidence, evidenceScope, preliminary: score == null || invalid || valuePoints == null,
    reasons, notes, local, statePrices, stateFallback, price, reference, priceBasis, priceSummary, priceNote, automatic: enteredPrice == null,
    reputationScore: reviews.score == null ? null : Math.round(reviews.score), reviewPublishers: [...new Set(reviews.ratings.map(rating => rating.publisher))].join(', '), reviewStats: { expert: reviews.expert, consumer: reviews.community == null ? null : reviews.community / 20, count: reviews.ratings.filter(r => r.kind === 'community').reduce((sum, r) => sum + (r.count || 0), 0) },
    findPoints, valuePoints, factors: [{ label: localRarity ? 'State rarity' : 'Release context', points: findPoints, weight: 80, max: 100 }, { label: 'Published reviews', points: reviews.score, weight: 20, max: 100 }],
    personalNote: personal ? `Your rating: ${(personal.rating / 10).toFixed(1)}/10` : null,
    adjustment: 'Signal Score measures find strength: verified release rarity 80%, published reviews 20%. Weights never change. Price is assessed separately in the buying verdict. Missing reviews produce a score range; missing release evidence leaves the score unavailable. Your personal rating does not change the score.',
    sources: [
      ...reviews.ratings.map(r => ({ label: `${r.publisher} ${r.kind}: ${r.value}/${r.scale}${r.count ? ` (${r.count.toLocaleString()} reviews)` : ''}`, url: r.source, checkedAt: r.checkedAt })),
      ...(entry?.producerFacts && currentEvidence(entry.producerFacts.checkedAt, now) ? [{ label: 'Producer facts', url: entry.producerFacts.source, checkedAt: entry.producerFacts.checkedAt }] : []),
      ...(release ? [{ label: 'Release context', url: release.source, checkedAt: release.checkedAt }] : []),
      ...(localRarity?.sources || []).map(source => ({ label: source.label, url: source.url, checkedAt: localRarity!.reviewedAt })),
    ],
    producerFacts: entry?.producerFacts && currentEvidence(entry.producerFacts.checkedAt, now) ? entry.producerFacts : null,
  };
}
