export const COLLECTION_TASTING_CONTEXTS = ["bar", "bottle_share", "friend", "event", "other"] as const;
export type CollectionTastingContext = typeof COLLECTION_TASTING_CONTEXTS[number];

export interface CollectionBottlePreference {
  bottleId: string;
  bottleName: string;
  canonicalKey: string;
  /** Durable tenths-of-a-point score. isRated distinguishes unrated from a real zero. */
  rating: number;
  /** Disambiguates new real 0 ratings from legacy records where 0 meant unrated. */
  isRated: boolean;
  /** When the member last set or changed the current numeric rating. */
  ratedAt?: string;
  tasteTags?: string[];
  wouldBuyAgain?: boolean;
  /** Legacy compatibility projection of openedQuantity. */
  opened?: boolean;
  sealedQuantity: number;
  openedQuantity: number;
  finishedCount: number;
  tastedOnly: boolean;
  pricePaid?: number;
  store?: string;
  purchaseDate?: string;
  tastingContext?: CollectionTastingContext;
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

function wholeQuantity(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(999, Math.floor(value)))
    : 0;
}

function optionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const clean = value.trim().slice(0, maxLength);
  return clean || undefined;
}

function normalizeRating(item: Record<string, unknown>) {
  const raw = typeof item.rating === "number" && Number.isFinite(item.rating) ? item.rating : null;
  const explicitlyRated = item.isRated === true;
  const legacyPositiveRating = raw !== null && raw > 0;
  const isRated = explicitlyRated || legacyPositiveRating;
  return {
    rating: isRated && raw !== null ? Math.max(0, Math.min(100, Math.round(raw))) : 0,
    isRated,
  };
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

    const hasLifecycle = ["sealedQuantity", "openedQuantity", "finishedCount", "tastedOnly"].some((key) => Object.hasOwn(item, key));
    let sealedQuantity = wholeQuantity(item.sealedQuantity);
    let openedQuantity = wholeQuantity(item.openedQuantity);
    const finishedCount = wholeQuantity(item.finishedCount);
    if (!hasLifecycle) {
      sealedQuantity = item.opened === true ? 0 : 1;
      openedQuantity = item.opened === true ? 1 : 0;
    }
    const tastedOnly = item.tastedOnly === true && sealedQuantity + openedQuantity === 0 && finishedCount === 0;
    const ownedHistory = sealedQuantity + openedQuantity + finishedCount > 0;
    const { rating, isRated } = normalizeRating(item);
    const now = new Date().toISOString();
    const addedAt = typeof item.addedAt === "string" && Number.isFinite(Date.parse(item.addedAt)) ? item.addedAt : now;
    const updatedAt = typeof item.updatedAt === "string" && Number.isFinite(Date.parse(item.updatedAt)) ? item.updatedAt : addedAt;
    const ratedAt = isRated && typeof item.ratedAt === "string" && Number.isFinite(Date.parse(item.ratedAt))
      ? item.ratedAt
      : undefined;
    const pricePaid = ownedHistory && typeof item.pricePaid === "number" && Number.isFinite(item.pricePaid)
      ? Math.round(Math.max(0, Math.min(99999, item.pricePaid)) * 100) / 100
      : undefined;
    const purchaseDate = ownedHistory && typeof item.purchaseDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.purchaseDate) && Number.isFinite(Date.parse(`${item.purchaseDate}T00:00:00Z`))
      ? item.purchaseDate
      : undefined;
    const tastingContext = tastedOnly && COLLECTION_TASTING_CONTEXTS.includes(item.tastingContext as CollectionTastingContext)
      ? item.tastingContext as CollectionTastingContext
      : undefined;

    bottles.push({
      bottleId,
      bottleName,
      canonicalKey,
      rating,
      isRated,
      ratedAt,
      tasteTags: Array.isArray(item.tasteTags)
        ? Array.from(new Set(item.tasteTags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim().slice(0, 60)).filter(Boolean))).slice(0, 12)
        : [],
      wouldBuyAgain: typeof item.wouldBuyAgain === "boolean" ? item.wouldBuyAgain : undefined,
      opened: openedQuantity > 0,
      sealedQuantity,
      openedQuantity,
      finishedCount,
      tastedOnly,
      pricePaid,
      store: ownedHistory ? optionalText(item.store, 180) : undefined,
      purchaseDate,
      tastingContext,
      notes: typeof item.notes === "string" ? item.notes.slice(0, 500) : "",
      pendingCanonicalMatch: item.pendingCanonicalMatch === true,
      bottleContributionId: typeof item.bottleContributionId === "string" ? item.bottleContributionId.slice(0, 180) : undefined,
      addedAt,
      updatedAt,
    });
  }

  return bottles.slice(0, 250).sort((a, b) => (b.isRated ? b.rating : -1) - (a.isRated ? a.rating : -1) || a.bottleName.localeCompare(b.bottleName));
}

export function collectionFingerprint(input: unknown) {
  return JSON.stringify(normalizeCollectionBottles(input)
    .map((bottle) => ({
      canonicalKey: bottle.canonicalKey,
      bottleId: bottle.bottleId,
      bottleName: bottle.bottleName,
      rating: bottle.rating,
      isRated: bottle.isRated,
      ratedAt: bottle.ratedAt || null,
      tasteTags: [...(bottle.tasteTags || [])].sort(),
      wouldBuyAgain: bottle.wouldBuyAgain ?? null,
      opened: bottle.opened === true,
      sealedQuantity: bottle.sealedQuantity,
      openedQuantity: bottle.openedQuantity,
      finishedCount: bottle.finishedCount,
      tastedOnly: bottle.tastedOnly,
      pricePaid: bottle.pricePaid ?? null,
      store: bottle.store || "",
      purchaseDate: bottle.purchaseDate || null,
      tastingContext: bottle.tastingContext || null,
      notes: bottle.notes || "",
      pendingCanonicalMatch: Boolean(bottle.pendingCanonicalMatch),
      bottleContributionId: bottle.bottleContributionId || null,
    }))
    .sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey)));
}
