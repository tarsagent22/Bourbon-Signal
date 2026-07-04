import { clerkClient } from "@clerk/nextjs/server";
import { normalizeBottleKey, type BibleBottle } from "@/lib/bourbonBible";

export interface MemberTasteScore {
  average: number;
  count: number;
  label: string;
}

type CacheEntry = { expiresAt: number; value: MemberTasteScore | null };

const CACHE_TTL_MS = 5 * 60 * 1000;
const scoreCache = new Map<string, CacheEntry>();

function collectionBottlesFromMetadata(metadata: unknown) {
  const source = metadata && typeof metadata === "object" ? metadata as Record<string, unknown> : {};
  const collection = source.collectionPreferences && typeof source.collectionPreferences === "object" ? source.collectionPreferences as Record<string, unknown> : {};
  return Array.isArray(collection.bottles) ? collection.bottles : [];
}

function bottleKeys(bottle: BibleBottle) {
  return new Set([
    bottle.id,
    bottle.canonicalName,
    bottle.brand,
    bottle.producer,
    ...bottle.aliases,
  ].filter(Boolean).map((value) => normalizeBottleKey(String(value))).filter(Boolean));
}

function matchesBottle(raw: Record<string, unknown>, keys: Set<string>) {
  const candidates = [raw.canonicalKey, raw.bottleId, raw.bottleName]
    .filter(Boolean)
    .map((value) => normalizeBottleKey(String(value)))
    .filter(Boolean);
  return candidates.some((candidate) => keys.has(candidate));
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

  const keys = bottleKeys(bottle);
  const client = await clerkClient();
  let offset = 0;
  const limit = 100;
  let total = 0;
  let count = 0;

  for (let page = 0; page < 10; page += 1) {
    const response = await client.users.getUserList({ limit, offset });
    const users = Array.isArray(response) ? response : response.data;
    if (!users.length) break;

    for (const user of users) {
      const bottles = collectionBottlesFromMetadata(user.publicMetadata);
      for (const rawBottle of bottles) {
        const raw = rawBottle && typeof rawBottle === "object" ? rawBottle as Record<string, unknown> : null;
        if (!raw || !matchesBottle(raw, keys)) continue;
        const rating = typeof raw.rating === "number" && Number.isFinite(raw.rating) ? raw.rating : null;
        if (rating == null || rating <= 0) continue;
        total += Math.max(0, Math.min(100, rating));
        count += 1;
        break;
      }
    }

    if (users.length < limit) break;
    offset += limit;
  }

  const value = count > 0 ? {
    average: Math.round((total / count) * 10) / 10,
    count,
    label: scoreLabel(total / count),
  } : null;

  scoreCache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}
