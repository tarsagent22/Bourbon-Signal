export interface CollectionBottlePreference {
  bottleId: string;
  bottleName: string;
  canonicalKey: string;
  rating: number;
  tasteTags?: string[];
  wouldBuyAgain?: boolean;
  opened?: boolean;
  notes?: string;
  pendingCanonicalMatch?: boolean;
  bottleContributionId?: string;
  addedAt: string;
  updatedAt: string;
}

export interface MemberCollection {
  bottles: CollectionBottlePreference[];
  version: number;
}

export function normalizeCollectionKey(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeCollectionBottles(input: unknown): CollectionBottlePreference[] {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const rawBottles = Array.isArray(source.bottles) ? source.bottles : Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const bottles: CollectionBottlePreference[] = [];

  for (const raw of rawBottles) {
    const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const bottleName = typeof item.bottleName === "string" ? item.bottleName.trim().slice(0, 180) : "";
    const bottleId = typeof item.bottleId === "string" ? item.bottleId.trim().slice(0, 180) : normalizeCollectionKey(bottleName);
    const canonicalKey = normalizeCollectionKey(typeof item.canonicalKey === "string" ? item.canonicalKey : bottleName || bottleId);
    if (!bottleName || !canonicalKey || seen.has(canonicalKey)) continue;
    seen.add(canonicalKey);
    const rawRating = typeof item.rating === "number" && Number.isFinite(item.rating) ? item.rating : 0;
    const rating = Math.max(0, Math.min(100, Math.round(rawRating)));
    const now = new Date().toISOString();
    const addedAt = typeof item.addedAt === "string" && Number.isFinite(Date.parse(item.addedAt)) ? item.addedAt : now;
    const updatedAt = typeof item.updatedAt === "string" && Number.isFinite(Date.parse(item.updatedAt)) ? item.updatedAt : addedAt;
    bottles.push({
      bottleId,
      bottleName,
      canonicalKey,
      rating,
      tasteTags: Array.isArray(item.tasteTags)
        ? Array.from(new Set(item.tasteTags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim().slice(0, 60)).filter(Boolean))).slice(0, 12)
        : [],
      wouldBuyAgain: typeof item.wouldBuyAgain === "boolean" ? item.wouldBuyAgain : rating >= 80,
      opened: item.opened === true,
      notes: typeof item.notes === "string" ? item.notes.slice(0, 500) : "",
      pendingCanonicalMatch: item.pendingCanonicalMatch === true,
      bottleContributionId: typeof item.bottleContributionId === "string" ? item.bottleContributionId.slice(0, 180) : undefined,
      addedAt,
      updatedAt,
    });
  }

  return bottles.slice(0, 250).sort((a, b) => b.rating - a.rating || a.bottleName.localeCompare(b.bottleName));
}

export function collectionFingerprint(input: unknown) {
  return JSON.stringify(normalizeCollectionBottles(input)
    .map((bottle) => ({
      canonicalKey: bottle.canonicalKey,
      bottleId: bottle.bottleId,
      bottleName: bottle.bottleName,
      rating: bottle.rating,
      tasteTags: [...(bottle.tasteTags || [])].sort(),
      wouldBuyAgain: Boolean(bottle.wouldBuyAgain),
      opened: bottle.opened === true,
      notes: bottle.notes || "",
      pendingCanonicalMatch: Boolean(bottle.pendingCanonicalMatch),
      bottleContributionId: bottle.bottleContributionId || null,
    }))
    .sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey)));
}
