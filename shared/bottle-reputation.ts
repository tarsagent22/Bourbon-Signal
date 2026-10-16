import registry from './bottle-reputation.json';

export interface PublishedRating {
  publisher: string; kind: 'expert' | 'community'; value: number; scale: number;
  count?: number; source: string; checkedAt: string;
}
export interface BottleReputation {
  key: string; names: string[]; ratings: PublishedRating[]; scopeNote?: string;
  producerFacts?: { source: string; checkedAt: string; proof?: number; ageYears?: number; process?: string };
}
const normalize = (value: string) => value.normalize('NFKD').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export const BOTTLE_REPUTATION = registry.records as BottleReputation[];
export const currentEvidence = (date: string, now: Date, days = 365) => {
  const at = Date.parse(date); return Number.isFinite(at) && at <= now.getTime() && now.getTime() - at <= days * 86400000;
};

/** Exact expression names only: never transfer a brand's rating to another age, proof or store pick. */
export function bottleReputation(bottle: { name: string; proof: number | null; age: string | null }) {
  const entry = BOTTLE_REPUTATION.find(record => record.names.some(name => normalize(name) === normalize(bottle.name)));
  if (!entry) return null;
  const facts = entry.producerFacts;
  if (facts?.proof && bottle.proof && Math.abs(facts.proof - bottle.proof) > 0.15) return null;
  const age = Number((bottle.age || bottle.name).match(/\b0*(\d{1,2})\s*(?:y\b|years?\b)/i)?.[1]);
  if (facts?.ageYears && age && age !== facts.ageYears) return null;
  return entry;
}

/** Published scales stay visible; community stars use the explicit value/scale conversion. */
export function reputationEvidence(entry: BottleReputation | null, now = new Date()) {
  const unique = new Map<string, PublishedRating>();
  for (const rating of entry?.ratings || []) {
    if (!['expert', 'community'].includes(rating.kind) || !rating.publisher.trim()) continue;
    if (!currentEvidence(rating.checkedAt, now) || !/^https:\/\//.test(rating.source) || !Number.isFinite(rating.value) || rating.value < 0 || rating.value > rating.scale || ![5, 100].includes(rating.scale)) continue;
    if (rating.kind === 'community' && (!Number.isInteger(rating.count) || rating.count! < 100)) continue;
    const key = `${rating.publisher.toLowerCase()}:${rating.kind}`;
    if (!unique.has(key) || unique.get(key)!.checkedAt < rating.checkedAt) unique.set(key, rating);
  }
  const ratings = [...unique.values()];
  const mean = (kind: PublishedRating['kind']) => {
    const values = ratings.filter(rating => rating.kind === kind).map(rating => rating.value / rating.scale * 100);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const expert = mean('expert'), community = mean('community');
  const score = expert != null && community != null ? (expert + community) / 2 : expert ?? community;
  const disagreement = expert != null && community != null ? Math.abs(expert - community) : null;
  const publishers = new Set(ratings.map(rating => rating.publisher.toLowerCase())).size;
  const communityCount = ratings.filter(rating => rating.kind === 'community').reduce((total, rating) => total + (rating.count || 0), 0);
  return { score, expert, community, ratings, publishers, disagreement,
    confidence: score == null ? 'Research pending' : disagreement != null && disagreement > 15 ? 'Mixed reviews' : expert != null && community != null && communityCount >= 500 ? 'Moderate confidence' : 'Limited confidence' };
}
