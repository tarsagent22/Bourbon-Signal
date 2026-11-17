import { canonicalBottleId } from './bottle-identity-redirects';
import type { BottleProfile } from './bottle-profile';
import { compareBottlePrice } from './bottle-profile';
import { bottleReputation, reputationEvidence, currentEvidence } from './bottle-reputation';
import { bottlePriceBenchmarks } from './bottle-check-prices';

export interface BuyingScope { state: string; area: string }
export interface BottleCheckPriceSignal {
  kind: string;
  historical?: boolean;
  bottle: { id?: string; catalogId?: string };
  location: { scope: string; state?: string; store?: { id?: string; address?: string; city?: string; state?: string } };
  source: { type: string };
  evidence: { sourceBacked: boolean };
  availability?: { status: string; price?: number; sizeMl?: number; priceObservedAt?: string };
}
const day = 86_400_000;
const clean = (value: string) => value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const money = (amount: number) => '$' + amount.toFixed(2);
const publicLink = (value: string) => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
};
const isPrice = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 999_999;
const clamp = (n: number, low = 0, high = 100) => Math.min(high, Math.max(low, n));

/** Explicitly sized, exact-store retail prices. Store identity and address both deduplicate. */
export function regionalPriceEvidence(bottle: Pick<BottleProfile, 'id'>, reports: readonly BottleCheckPriceSignal[], scope: BuyingScope, now = new Date(), sizeMl = 750) {
  const candidates: { at: number; price: number; keys: string[] }[] = [];
  const id = canonicalBottleId(bottle.id);
  for (const report of reports) {
    const { availability, source, location, evidence } = report;
    if (!scope.state || report.kind !== 'availability' || report.historical || location.scope !== 'exact_store'
      || !evidence.sourceBacked || (source.type !== 'retailer' && source.type !== 'trusted_source')
      || (availability?.status !== 'available_now' && availability?.status !== 'reported')
      || availability.sizeMl !== sizeMl || !isPrice(availability.price)) continue;
    const reportId = report.bottle.catalogId || report.bottle.id;
    if (!id || !reportId || canonicalBottleId(reportId) !== id) continue;
    const store = location.store;
    if (!store || (store.state || location.state)?.toUpperCase() !== scope.state
      || (location.state && location.state.toUpperCase() !== scope.state)
      || (scope.area && (!store.city || clean(store.city) !== clean(scope.area)))) continue;
    const at = Date.parse(availability.priceObservedAt || '');
    if (!Number.isFinite(at) || at > now.getTime() || now.getTime() - at > 7 * day) continue;
    const address = store.address && store.city ? clean(store.address + ' ' + store.city) : '';
    const keys = [store.id?.trim() ? 'id:' + store.id.trim().toLowerCase() : '', address ? 'address:' + address : ''].filter(Boolean);
    if (!keys.length) continue;
    candidates.push({ at, price: availability.price, keys });
  }
  // Merge duplicate IDs/addresses transitively, including older rows that link two keys.
  const parents = new Map<string, string>();
  const find = (key: string): string => {
    let root = key;
    while (parents.has(root)) root = parents.get(root)!;
    while (parents.has(key)) { const next = parents.get(key)!; parents.set(key, root); key = next; }
    return root;
  };
  for (const { keys } of candidates) {
    const root = find(keys[0]);
    for (const key of keys.slice(1)) { const other = find(key); if (other !== root) parents.set(other, root); }
  }
  const stores = new Map<string, { at: number; price: number; conflict: boolean }>();
  for (const row of candidates) {
    const key = find(row.keys[0]);
    const prior = stores.get(key);
    if (!prior || prior.at < row.at) stores.set(key, { ...row, conflict: false });
    else if (prior.at === row.at && prior.price !== row.price) prior.conflict = true;
  }
  const prices = [...stores.values()].filter(row => !row.conflict).map(row => row.price).sort((a, b) => a - b);
  const middle = Math.floor(prices.length / 2);
  const median = prices.length < 3 ? null : prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2;
  const latestAt = [...stores.values()].reduce((latest, row) => row.conflict ? latest : Math.max(latest, row.at), 0);
  return { count: prices.length, median, latestAt: latestAt ? new Date(latestAt).toISOString() : null, low: prices[0] ?? null, high: prices.at(-1) ?? null };
}

const releasePoints = new Map([['regular', 45], ['limited', 65], ['allocated', 78], ['highly_allocated', 90], ['unicorn', 95]]);
const priceCurve = [[0.65, 100], [1, 82], [1.15, 65], [1.3, 50], [1.6, 20], [2, 0]];
function pricePoints(ratio: number) {
  if (ratio <= priceCurve[0][0]) return 100;
  for (let i = 1; i < priceCurve.length; i++) {
    const [high, y2] = priceCurve[i];
    const [low, y1] = priceCurve[i - 1];
    if (ratio <= high) return y1 + (y2 - y1) * (ratio - low) / (high - low);
  }
  return 0;
}

export const SIGNAL_SCORE_VERSION = 2;

/** Fixed weights. Missing dimensions keep a neutral prior, never an invented observation. */
export function buyingScore({ bottle, askingPrice, reports, scope, confirmedSizeMl, now = new Date() }: {
  bottle: BottleProfile; askingPrice: string; reports: readonly BottleCheckPriceSignal[]; scope: BuyingScope; confirmedSizeMl?: number; now?: Date;
}) {
  scope = { state: scope.state.trim().toUpperCase(), area: scope.area.trim() };
  const benchmarks = bottlePriceBenchmarks(bottle, scope.state, now);
  const explicit = bottle.name.match(/(?:^|[^\d.])(\d+(?:\.\d+)?|\.\d+)\s*(ml|l)\b/i);
  const sizeMl = confirmedSizeMl && Number.isSafeInteger(confirmedSizeMl) && confirmedSizeMl >= 50 && confirmedSizeMl <= 6000 ? confirmedSizeMl : explicit ? Math.round(Number(explicit[1]) * (explicit[2].toLowerCase() === 'l' ? 1000 : 1))
    : benchmarks.state?.sizeMl ?? benchmarks.msrp?.sizeMl ?? 750;
  const local = regionalPriceEvidence(bottle, reports, scope, now, sizeMl);
  const statePrices = scope.area ? regionalPriceEvidence(bottle, reports, { ...scope, area: '' }, now, sizeMl) : local;
  const observed = local.median != null ? local : statePrices;
  const priceRegion = (local.median != null && scope.area) || scope.state;
  const stateFallback = Boolean(scope.area && local.median == null && statePrices.median != null);
  const entry = bottleReputation(bottle);
  const reviews = reputationEvidence(entry, now);
  const release = entry?.release && currentEvidence(entry.release.checkedAt, now) ? entry.release : null;
  const region = bottle.marketRarity;
  const localRarity = scope.state && region?.state === scope.state && releasePoints.has(region.tier)
    && region.sources.some(source => publicLink(source.url)) && currentEvidence(region.reviewedAt, now) ? region : null;
  const national = !bottle.rarity.pending && releasePoints.has(bottle.rarity.tier)
    && bottle.rarity.sources?.some(source => publicLink(source.url))
    && bottle.rarity.reviewedAt && currentEvidence(bottle.rarity.reviewedAt, now) ? bottle.rarity : null;
  const tier = localRarity?.tier ?? national?.tier ?? (release?.kind === 'standard' ? 'regular' : release?.kind) ?? null;
  const findPoints = tier == null ? null : releasePoints.get(tier) ?? null;
  const releaseLabel = localRarity ? localRarity.label + ' in ' + scope.state : national?.label ?? release?.label ?? null;
  const qualityPoints = reviews.score == null ? null : 50 + (clamp(50 + 2 * (reviews.score - 75)) - 50)
    * (reviews.disagreement != null && reviews.disagreement > 15 ? 0.5 : reviews.publishers > 1 ? 1 : 0.85);

  const parsed = compareBottlePrice(askingPrice, null);
  const enteredPrice = parsed.kind === 'unpriced' ? parsed.price : null;
  const invalid = parsed.kind === 'invalid' || (enteredPrice != null && !isPrice(enteredPrice));
  const median = observed.median == null ? null : { amount: observed.median, label: priceRegion + ' store median' };
  const statePrice = benchmarks.state?.sizeMl === sizeMl ? benchmarks.state : null;
  const msrp = benchmarks.msrp?.sizeMl === sizeMl ? benchmarks.msrp : null;
  const applied = invalid ? null : enteredPrice != null ? { amount: enteredPrice, label: 'Your shelf price' }
    : median ?? (msrp ? statePrice : null);
  // A list or observed median can be a reference or a candidate price, never both.
  const candidates = enteredPrice != null ? [median, statePrice, msrp] : median ? [statePrice, msrp] : [msrp, statePrice];
  const reference = candidates.find(Boolean) ?? null;
  const ratio = applied && reference ? applied.amount / reference.amount : null;
  const anchor = statePrice && msrp ? (statePrice.amount < msrp.amount ? statePrice : msrp) : statePrice ?? msrp;
  const anchorRatio = anchor && applied ? applied.amount / anchor.amount : null;
  const priceScore = ratio == null ? null : pricePoints(ratio);
  // An inflated local market cannot turn a large manufacturer markup into a great deal.
  const valuePoints = priceScore == null ? null : anchorRatio != null && reference !== anchor
    ? 0.7 * priceScore + 0.3 * Math.min(priceScore, pricePoints(anchorRatio)) : priceScore;
  const raw = 0.30 * (findPoints ?? 50) + 0.30 * (qualityPoints ?? 50) + 0.40 * (valuePoints ?? 50);
  const highMarkup = ratio != null && (ratio > 1.6 || (anchorRatio != null && anchorRatio > 1.6));
  const score = Math.round(clamp(highMarkup ? Math.min(raw, 54) : raw));
  const factorsUsed = Number(findPoints != null) + Number(qualityPoints != null) + Number(valuePoints != null);
  const confidence = factorsUsed < 2 ? 'Limited evidence' : factorsUsed === 3 && reviews.publishers > 1 && enteredPrice != null && (msrp || statePrice)
    ? 'Strong evidence' : 'Moderate evidence';
  const evidenceScope = median && (applied === median || reference === median) ? priceRegion + ' price evidence'
    : statePrice || localRarity ? scope.state + ' context' : 'National context';
  const verdict = invalid ? 'Check the shelf price' : highMarkup ? enteredPrice != null ? 'Pass at this price' : 'High price in this market'
    : valuePoints == null ? factorsUsed === 0 ? 'Verify before buying' : 'Check the shelf price'
    : score >= 75 && valuePoints >= 65 && (qualityPoints != null || findPoints != null)
      ? enteredPrice != null ? 'Good buy at this price' : 'Good value at this reference price'
      : factorsUsed === 1 || (ratio != null && ratio > 1.3) ? 'Compare before buying'
        : score >= 60 ? 'Worth considering' : 'Compare before buying';
  const priceNote = invalid ? 'Enter a valid bottle price in US dollars.' : applied && reference && ratio != null
    ? money(applied.amount) + ' · ' + applied.label + ' vs. ' + money(reference.amount) + ' · ' + reference.label
      + (anchor && reference !== anchor ? '; ' + money(anchor.amount) + ' · ' + anchor.label : '')
    : applied ? money(applied.amount) + ' · ' + applied.label + '. No independent comparison used.'
    : reference ? money(reference.amount) + ' · ' + reference.label : 'No verified price benchmark for this check.';
  const reasons = [
    localRarity?.reason ?? (national ? national.label + ' in the reviewed national catalog.' : release?.reason ?? 'No verified release classification.'),
    reviews.score == null ? 'No verified published reviews for this expression.' : 'Published reviews contribute drinking quality.',
    valuePoints == null ? 'No comparable price pair contributes to the score.' : priceNote,
  ];
  const notes = [
    observed.median != null ? observed.count + ' distinct stores in ' + priceRegion + ', observed within 7 days.' : null,
    stateFallback ? 'Not enough comparable prices in ' + scope.area + '; using ' + scope.state + ' observations.' : null,
    entry?.scopeNote,
    reviews.disagreement != null && reviews.disagreement > 15 ? 'Expert and consumer ratings differ substantially; their effect is reduced.' : null,
  ].filter((note): note is string => Boolean(note));
  return { version: SIGNAL_SCORE_VERSION, score, verdict, confidence, evidenceScope, releaseLabel,
    reasons, notes, local, statePrices, stateFallback, price: applied?.amount ?? null, reference: reference?.amount ?? null,
    referenceDate: reference === median ? observed.latestAt : reference && 'date' in reference && typeof reference.date === 'string' ? reference.date : null,
    referenceLabel: reference?.label ?? null, priceNote, sizeMl, valuePoints, findPoints, qualityPoints, factorsUsed, localClassification: Boolean(localRarity),
    reviewStats: { expert: reviews.expert, consumer: reviews.community == null ? null : reviews.community / 20, count: reviews.ratings.filter(r => r.kind === 'community').reduce((sum, r) => sum + (r.count || 0), 0) },
    adjustment: 'Price 40%, release rarity 30%, published reviews 30%. Missing factors contribute a neutral baseline. This is purchase guidance; it does not confirm stock.',
    sources: [
      ...reviews.ratings.map(r => ({ label: r.publisher + ' ' + r.kind + ': ' + r.value + '/' + r.scale, url: r.source, checkedAt: r.checkedAt })),
      ...(!localRarity && national?.reviewedAt ? (national.sources ?? []).filter(source => publicLink(source.url)).map(source => ({ ...source, checkedAt: national.reviewedAt! })) : []),
      ...(release ? [{ label: 'Release context', url: release.source, checkedAt: release.checkedAt }] : []),
      ...(localRarity ? localRarity.sources.filter(source => publicLink(source.url)).map(source => ({ ...source, checkedAt: localRarity.reviewedAt })) : []),
      ...[statePrice, msrp].flatMap(source => source ? [{ label: source.label, url: source.url, checkedAt: source.date }] : []),
    ],
  };
}
