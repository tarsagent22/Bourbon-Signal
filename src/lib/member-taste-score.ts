import { normalizeBottleKey, type BibleBottle } from "@/lib/bourbonBible";
import { getMemberCollectionRepository } from "@/lib/member-collection-repository";

export interface MemberTasteScore {
  average: number;
  count: number;
  label: string;
}

type CacheEntry = { expiresAt: number; value: MemberTasteScore | null };

const CACHE_TTL_MS = 5 * 60 * 1000;
const scoreCache = new Map<string, CacheEntry>();

function bottleKeys(bottle: BibleBottle) {
  return Array.from(new Set([
    bottle.id,
    bottle.canonicalName,
    bottle.brand,
    bottle.producer,
    ...bottle.aliases,
  ].filter(Boolean).map((value) => normalizeBottleKey(String(value))).filter(Boolean)));
}

function scoreLabel(average: number) {
  if (average >= 90) return "Members love this pour";
  if (average >= 82) return "Strong member favorite";
  if (average >= 74) return "Well-liked by members";
  if (average >= 64) return "Mixed member read";
  return "Lower member taste read";
}

export async function getMemberTasteScore(bottle: BibleBottle): Promise<MemberTasteScore | null> {
  const cacheKey = normalizeBottleKey(bottle.id || bottle.canonicalName);
  const cached = scoreCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const aggregate = await getMemberCollectionRepository().getTasteAggregate(bottleKeys(bottle)).catch(() => null);
  const value = aggregate ? {
    average: aggregate.average,
    count: aggregate.count,
    label: scoreLabel(aggregate.average),
  } : null;

  scoreCache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}
