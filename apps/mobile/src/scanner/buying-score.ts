import type { BottleProfile } from '../../../../shared/bottle-profile';
import { compareBottlePrice } from '../../../../shared/bottle-profile';
import type { MemberCollectionBottle, Signal } from '../api/types';
import { reportAge } from '../api/presentation';

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
  const parsed = compareBottlePrice(askingPrice, bottle.msrp);
  const price = parsed.kind === 'compared' || parsed.kind === 'unpriced' ? parsed.price : null;
  const msrp = bottle.msrp != null && Number.isFinite(bottle.msrp) && bottle.msrp > 0 ? bottle.msrp : null;
  const reference = msrp ?? local.median;
  const ratio = price && reference ? price / reference : null;
  const pricePoints = ratio == null ? 30 : ratio <= 0.9 ? 60 : ratio <= 1 ? 56 : ratio <= 1.15 ? 48 : ratio <= 1.3 ? 38 : ratio <= 1.6 ? 22 : ratio <= 2 ? 10 : 0;
  const personal = collection.find(entry => !entry.pendingCanonicalMatch && entry.bottleId === bottle.id && entry.isRated && Number.isFinite(entry.rating) && entry.rating >= 0 && entry.rating <= 100);
  const fitPoints = personal ? Math.round(personal.rating * 0.3) : bottle.proof == null ? 15 : bottle.proof <= 100 ? 24 : bottle.proof <= 115 ? 18 : 12;
  const localPoints = price && local.median ? price <= local.median ? 10 : 3 : 5;
  const rawScore = pricePoints + fitPoints + localPoints;
  let score = rawScore;
  if (!price) score = Math.min(score, 65);
  if (!reference) score = Math.min(score, 59);
  if (!msrp) score = Math.min(score, local.median ? 79 : 59);
  if (personal && personal.rating < 50) score = Math.min(score, 45);
  if (parsed.kind === 'invalid') score = Math.min(score, 59);
  const adjustment = score < rawScore ? personal && personal.rating < 50 ? 'Your own rating is below 5/10, so the score is capped at 45.' : !msrp && local.median ? 'Local prices alone cannot establish MSRP; the score is capped at 79.' : 'Missing or invalid price evidence limits this score.' : null;
  const preliminary = !price || !reference || parsed.kind === 'invalid';
  const verdict = parsed.kind === 'invalid' ? 'Check the shelf price' : !price ? 'Check the price first' : !reference ? 'Compare before buying' : score >= 80 ? 'A good buy at this price' : score >= 65 ? 'Worth considering' : score >= 50 ? 'Try a pour first' : 'Pass at this price';
  const confidence = preliminary || !msrp ? 'Limited evidence' : local.count >= 3 ? 'Stronger price evidence' : 'MSRP-based estimate';
  const reasons = [
    parsed.kind === 'invalid' ? 'Enter a price greater than zero, with up to two decimal places.' : !price ? 'Add the shelf price to get a buying recommendation.' : msrp ? `${parsed.kind === 'compared' ? parsed.label : 'Compare with MSRP'} · catalog MSRP $${msrp.toFixed(2)}.` : local.median ? `Compared with a $${local.median.toFixed(2)} median from ${local.count} stores in your selected region.` : 'No MSRP or sufficient recent local prices to judge value yet.',
    personal ? `You rated this bottle ${(personal.rating / 10).toFixed(1)}/10.` : bottle.proof == null ? 'Proof is not verified yet, so beginner suitability is uncertain.' : bottle.proof <= 100 ? `${bottle.proof} proof · a lower-heat starting point than barrel-strength bottles.` : `${bottle.proof} proof · expect more alcohol heat; try a pour if you’re new to this strength.`,
    local.median ? `${local.count} stores reported prices of $${local.low!.toFixed(2)}–$${local.high!.toFixed(2)} in the last 7 days.` : `In available reports, fewer than 3 recent, distinct-store prices in ${scope.area || scope.state || 'a selected state'}; no local price benchmark yet.`,
  ];
  return { score: Math.max(0, Math.min(100, score)), verdict, confidence, preliminary, reasons, local, price, reference, adjustment,
    factors: [{ label: 'Price', points: pricePoints, max: 60 }, { label: personal ? 'Your rating' : 'Beginner fit', points: fitPoints, max: 30 }, { label: 'Local price', points: localPoints, max: 10 }] };
}
