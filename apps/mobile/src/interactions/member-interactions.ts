import type { MemberCollectionBottle, RadarBottleOption, SignalRewardItem } from "../api/types";

export const TASTE_TAG_OPTIONS = ["Caramel", "Vanilla", "Oak", "Cherry", "Spice", "Proof heat", "Sweet", "Dark fruit", "Nutty", "Smoky", "Dessert", "Balanced"] as const;

export type CollectionSort = "recently_updated" | "recently_acquired" | "recently_rated" | "rating" | "name";
export type CollectionStatusFilter = "all" | "owned" | "tasted" | "sealed" | "open";
export type CollectionRatingFilter = "all" | "rated" | "unrated";
export interface CollectionFilters {
  status: CollectionStatusFilter;
  rating: CollectionRatingFilter;
  minRating: number | null;
  buyAgainOnly: boolean;
}

export const DEFAULT_COLLECTION_FILTERS: CollectionFilters = {
  status: "all",
  rating: "all",
  minRating: null,
  buyAgainOnly: false,
};
export const DEFAULT_COLLECTION_SORT: CollectionSort = "recently_updated";

export type CollectionBottlePatch = Pick<MemberCollectionBottle,
  "rating" | "isRated" | "notes" | "tasteTags" | "wouldBuyAgain" |
  "sealedQuantity" | "openedQuantity" | "finishedCount" | "tastedOnly" |
  "pricePaid" | "store" | "purchaseDate" | "tastingContext"
>;

export interface CustomBottleInput { name: string; proof?: number; detail?: string }

function quantity(value: number | undefined) {
  return Math.max(0, Math.min(999, Math.floor(Number.isFinite(value) ? value! : 0)));
}

export function collectionDisplayKind(bottle: Pick<MemberCollectionBottle, "sealedQuantity" | "openedQuantity">): "owned" | "tasted" {
  return quantity(bottle.sealedQuantity) + quantity(bottle.openedQuantity) > 0 ? "owned" : "tasted";
}

export function collectionSummary(bottles: MemberCollectionBottle[]) {
  const ratings = bottles.filter((bottle) => bottle.isRated).map((bottle) => bottle.rating);
  return {
    uniqueBourbons: bottles.length,
    ownedWhiskeyCount: bottles.filter((bottle) => collectionDisplayKind(bottle) === "owned").length,
    tastedOnlyCount: bottles.filter((bottle) => collectionDisplayKind(bottle) === "tasted").length,
    ownedBottleCount: bottles.reduce((sum, bottle) => sum + quantity(bottle.sealedQuantity) + quantity(bottle.openedQuantity), 0),
    ratedCount: ratings.length,
    averageRating: ratings.length ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10 : null,
  };
}

export function formatCollectionRating(bottle: Pick<MemberCollectionBottle, "rating" | "isRated">) {
  return bottle.isRated ? (bottle.rating / 10).toFixed(1) : "Unrated";
}

export function visibleTasteTags(tags: string[] = []) {
  const clean = tags.filter(Boolean);
  return { visible: clean.slice(0, 2), hiddenCount: Math.max(0, clean.length - 2) };
}

export function collectionInventoryLabel(bottle: Pick<MemberCollectionBottle, "sealedQuantity" | "openedQuantity">) {
  const sealed = quantity(bottle.sealedQuantity);
  const opened = quantity(bottle.openedQuantity);
  const parts: string[] = [];
  if (sealed) parts.push(`${sealed} sealed`);
  if (opened) parts.push(`${opened} open`);
  return parts.join(" · ");
}

export function shortCollectionDate(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function canonicalBottleKey(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function pendingCustomBaseKey(bottle: MemberCollectionBottle) {
  if (!bottle.pendingCanonicalMatch) return "";
  return canonicalBottleKey(bottle.bottleName.split(/\s+·\s+/u, 1)[0] || "");
}

export function collectionOptionMatchIndex(bottles: MemberCollectionBottle[], option: RadarBottleOption) {
  const idMatch = bottles.findIndex((bottle) => bottle.bottleId === option.id);
  if (idMatch >= 0) return idMatch;

  const canonicalKey = canonicalBottleKey(option.name);
  const canonicalMatch = bottles.findIndex((bottle) => canonicalBottleKey(bottle.canonicalKey) === canonicalKey
    || canonicalBottleKey(bottle.bottleName) === canonicalKey);
  if (canonicalMatch >= 0) return canonicalMatch;

  const optionKeys = new Set([option.name, ...(option.aliases || [])].map(canonicalBottleKey).filter(Boolean));
  return bottles.findIndex((bottle) => optionKeys.has(pendingCustomBaseKey(bottle)));
}

export function exactCustomBottleMatchIndex(bottles: MemberCollectionBottle[], candidate: MemberCollectionBottle) {
  const candidateName = canonicalBottleKey(candidate.bottleName);
  return bottles.findIndex((bottle) => bottle.bottleId === candidate.bottleId
    || canonicalBottleKey(bottle.bottleName) === candidateName);
}

export function filterAndSortCollection(
  bottles: MemberCollectionBottle[],
  query: string,
  sort: CollectionSort = DEFAULT_COLLECTION_SORT,
  filters: CollectionFilters = DEFAULT_COLLECTION_FILTERS,
) {
  const needle = query.trim().toLowerCase();
  return bottles
    .map((bottle, index) => ({ bottle, index }))
    .filter(({ bottle }) => !needle || [bottle.bottleName, bottle.notes || "", bottle.store || "", ...(bottle.tasteTags || [])].some((value) => value.toLowerCase().includes(needle)))
    .filter(({ bottle }) => {
      if (filters.status === "all") return true;
      if (filters.status === "owned") return collectionDisplayKind(bottle) === "owned";
      if (filters.status === "tasted") return collectionDisplayKind(bottle) === "tasted";
      if (filters.status === "sealed") return quantity(bottle.sealedQuantity) > 0;
      return quantity(bottle.openedQuantity) > 0;
    })
    .filter(({ bottle }) => filters.rating === "all" || (filters.rating === "rated" ? bottle.isRated : !bottle.isRated))
    .filter(({ bottle }) => filters.minRating == null || (bottle.isRated && bottle.rating >= filters.minRating))
    .filter(({ bottle }) => !filters.buyAgainOnly || bottle.wouldBuyAgain === true)
    .sort((left, right) => {
      if (sort === "rating") return (right.bottle.isRated ? right.bottle.rating : -1) - (left.bottle.isRated ? left.bottle.rating : -1) || left.bottle.bottleName.localeCompare(right.bottle.bottleName);
      if (sort === "name") return left.bottle.bottleName.localeCompare(right.bottle.bottleName);
      if (sort === "recently_acquired") {
        const rightDate = Date.parse(right.bottle.purchaseDate || right.bottle.addedAt);
        const leftDate = Date.parse(left.bottle.purchaseDate || left.bottle.addedAt);
        return rightDate - leftDate || left.index - right.index;
      }
      if (sort === "recently_rated") {
        const rightHasDate = Boolean(right.bottle.ratedAt);
        const leftHasDate = Boolean(left.bottle.ratedAt);
        if (rightHasDate !== leftHasDate) return rightHasDate ? 1 : -1;
        return Date.parse(right.bottle.ratedAt || right.bottle.updatedAt) - Date.parse(left.bottle.ratedAt || left.bottle.updatedAt) || left.index - right.index;
      }
      return Date.parse(right.bottle.updatedAt) - Date.parse(left.bottle.updatedAt) || left.index - right.index;
    })
    .map(({ bottle }) => bottle);
}

export function activeCollectionRefinementCount(filters: CollectionFilters, sort: CollectionSort) {
  return Number(filters.status !== "all")
    + Number(filters.rating !== "all")
    + Number(filters.minRating !== null)
    + Number(filters.buyAgainOnly)
    + Number(sort !== DEFAULT_COLLECTION_SORT);
}

export function updateCollectionBottle(
  bottles: MemberCollectionBottle[],
  canonicalKey: string,
  patch: CollectionBottlePatch,
  updatedAt: string,
) {
  const key = canonicalBottleKey(canonicalKey);
  return bottles.map((bottle) => {
    if (canonicalBottleKey(bottle.canonicalKey) !== key) return bottle;
    const tasteTags = Array.from(new Set((patch.tasteTags || []).map((tag) => tag.trim()).filter(Boolean))).slice(0, 12);
    const sealedQuantity = quantity(patch.sealedQuantity);
    const openedQuantity = quantity(patch.openedQuantity);
    const finishedCount = quantity(patch.finishedCount);
    const tastedOnly = sealedQuantity + openedQuantity === 0;
    const isRated = patch.isRated === true;
    const rating = isRated ? Math.max(0, Math.min(100, Math.round(patch.rating))) : 0;
    const ratingChanged = bottle.isRated !== isRated || (isRated && bottle.rating !== rating);
    return {
      ...bottle,
      rating,
      isRated,
      ratedAt: !isRated ? undefined : ratingChanged ? updatedAt : bottle.ratedAt,
      notes: patch.notes?.trim().slice(0, 500) || undefined,
      tasteTags,
      wouldBuyAgain: patch.wouldBuyAgain,
      opened: openedQuantity > 0,
      sealedQuantity,
      openedQuantity,
      finishedCount,
      tastedOnly,
      pricePaid: Object.hasOwn(patch, "pricePaid") ? patch.pricePaid : bottle.pricePaid,
      store: Object.hasOwn(patch, "store") ? patch.store?.trim() || undefined : bottle.store,
      purchaseDate: Object.hasOwn(patch, "purchaseDate") ? patch.purchaseDate : bottle.purchaseDate,
      tastingContext: Object.hasOwn(patch, "tastingContext") ? patch.tastingContext : bottle.tastingContext,
      updatedAt,
    };
  });
}

export type CollectionInventoryAction = "add_bottle" | "open_bottle" | "finish_bottle" | "keep_tasted_only";

export function applyCollectionInventoryAction(
  bottles: MemberCollectionBottle[],
  canonicalKey: string,
  action: CollectionInventoryAction,
  updatedAt: string,
) {
  const key = canonicalBottleKey(canonicalKey);
  let changed = false;
  const next = bottles.map((bottle) => {
    const matches = bottle.bottleId === canonicalKey
      || canonicalBottleKey(bottle.canonicalKey || bottle.bottleName) === key;
    if (!matches) return bottle;

    const currentSealed = quantity(bottle.sealedQuantity);
    const currentOpened = quantity(bottle.openedQuantity);
    let sealedQuantity = currentSealed;
    let openedQuantity = currentOpened;
    let finishedCount = quantity(bottle.finishedCount);

    if (action === "add_bottle") {
      sealedQuantity = quantity(currentSealed + 1);
    } else if (action === "open_bottle") {
      if (currentSealed === 0) return bottle;
      sealedQuantity -= 1;
      openedQuantity = quantity(currentOpened + 1);
    } else if (action === "finish_bottle") {
      if (currentOpened === 0) return bottle;
      openedQuantity -= 1;
      finishedCount = quantity(finishedCount + 1);
    } else {
      if (currentSealed === 0 && currentOpened === 0 && bottle.tastedOnly) return bottle;
      sealedQuantity = 0;
      openedQuantity = 0;
    }

    changed = true;
    return {
      ...bottle,
      sealedQuantity,
      openedQuantity,
      finishedCount,
      opened: openedQuantity > 0,
      tastedOnly: sealedQuantity + openedQuantity === 0,
      updatedAt,
    };
  });
  return changed ? next : bottles;
}

export function finishCollectionBottle(bottles: MemberCollectionBottle[], canonicalKey: string, updatedAt: string) {
  return applyCollectionInventoryAction(bottles, canonicalKey, "finish_bottle", updatedAt);
}

export function createCollectionBottle(option: RadarBottleOption, input: {
  kind: "sealed" | "opened" | "just_tasted";
  quantity?: number;
  pricePaid?: number;
  store?: string;
  purchaseDate?: string;
  tastingContext?: MemberCollectionBottle["tastingContext"];
  rating?: number;
  isRated?: boolean;
  tasteTags?: string[];
  notes?: string;
}, now: string): MemberCollectionBottle {
  const ownedQuantity = quantity(input.quantity || 1);
  const tastedOnly = input.kind === "just_tasted";
  return {
    bottleId: option.id,
    bottleName: option.name.trim(),
    canonicalKey: canonicalBottleKey(option.name),
    rating: input.isRated && input.rating !== undefined ? Math.max(0, Math.min(100, Math.round(input.rating))) : 0,
    isRated: input.isRated === true,
    ratedAt: input.isRated === true ? now : undefined,
    tasteTags: [...new Set(input.tasteTags || [])].slice(0, 12),
    wouldBuyAgain: undefined,
    opened: input.kind === "opened",
    sealedQuantity: input.kind === "sealed" ? ownedQuantity : 0,
    openedQuantity: input.kind === "opened" ? ownedQuantity : 0,
    finishedCount: 0,
    tastedOnly,
    pricePaid: tastedOnly ? undefined : input.pricePaid,
    store: tastedOnly ? undefined : input.store?.trim() || undefined,
    purchaseDate: tastedOnly ? undefined : input.purchaseDate,
    tastingContext: tastedOnly ? input.tastingContext : undefined,
    notes: input.notes?.trim() || undefined,
    addedAt: now,
    updatedAt: now,
  };
}

export function upsertCollectionBottle(
  bottles: MemberCollectionBottle[],
  option: RadarBottleOption,
  input: Parameters<typeof createCollectionBottle>[1],
  now: string,
  { reconcilePendingCustom = false }: { reconcilePendingCustom?: boolean } = {},
) {
  const canonicalKey = canonicalBottleKey(option.name);
  const existingIndex = collectionOptionMatchIndex(bottles, option);
  if (existingIndex < 0) return [...bottles, createCollectionBottle(option, input, now)];

  const existing = bottles[existingIndex];
  const reconcilesPendingCustom = reconcilePendingCustom && existing.pendingCanonicalMatch === true;
  const increment = quantity(input.quantity ?? 1);
  const sealedQuantity = quantity(quantity(existing.sealedQuantity) + (input.kind === "sealed" ? increment : 0));
  const openedQuantity = quantity(quantity(existing.openedQuantity) + (input.kind === "opened" ? increment : 0));
  const incomingRating = input.isRated === true && input.rating !== undefined && Number.isFinite(input.rating);
  const rating = incomingRating
    ? Math.max(0, Math.min(100, Math.round(input.rating ?? 0)))
    : existing.rating;
  const isRated = incomingRating ? true : existing.isRated;
  const ratingChanged = incomingRating && (!existing.isRated || existing.rating !== rating);
  const incomingTags = Array.from(new Set((input.tasteTags || []).map((tag) => tag.trim()).filter(Boolean))).slice(0, 12);
  const incomingNotes = input.notes?.trim().slice(0, 500);
  const isInventoryEntry = input.kind !== "just_tasted";

  const updated: MemberCollectionBottle = {
    ...existing,
    bottleId: reconcilesPendingCustom ? option.id : existing.bottleId,
    bottleName: reconcilesPendingCustom ? option.name.trim() : existing.bottleName,
    canonicalKey: reconcilesPendingCustom ? canonicalKey : existing.canonicalKey,
    pendingCanonicalMatch: reconcilesPendingCustom ? false : existing.pendingCanonicalMatch,
    rating,
    isRated,
    ratedAt: ratingChanged ? now : existing.ratedAt,
    tasteTags: incomingTags.length ? incomingTags : existing.tasteTags,
    notes: incomingNotes || existing.notes,
    sealedQuantity,
    openedQuantity,
    opened: openedQuantity > 0,
    tastedOnly: sealedQuantity + openedQuantity === 0,
    pricePaid: isInventoryEntry && input.pricePaid !== undefined ? input.pricePaid : existing.pricePaid,
    store: isInventoryEntry && input.store?.trim() ? input.store.trim() : existing.store,
    purchaseDate: isInventoryEntry && input.purchaseDate !== undefined ? input.purchaseDate : existing.purchaseDate,
    tastingContext: input.kind === "just_tasted" && input.tastingContext !== undefined ? input.tastingContext : existing.tastingContext,
    updatedAt: now,
  };
  return bottles.map((bottle, index) => index === existingIndex ? updated : bottle);
}

function stableLocalId(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `local-${(hash >>> 0).toString(36)}`;
}

export function createCustomCollectionBottle(
  custom: CustomBottleInput,
  input: Parameters<typeof createCollectionBottle>[1],
  now: string,
) {
  const name = custom.name.replace(/\s+/g, " ").trim();
  if (!name) throw new Error("Bottle name is required.");
  const proof = typeof custom.proof === "number" && Number.isFinite(custom.proof) && custom.proof > 0
    ? Math.round(custom.proof * 10) / 10
    : undefined;
  const detail = custom.detail?.replace(/\s+/g, " ").trim().slice(0, 120) || undefined;
  const identity = [canonicalBottleKey(name), proof == null ? "" : String(proof), canonicalBottleKey(detail || "")].join("|");
  const displayName = [name, proof == null ? "" : `${proof} proof`, detail || ""].filter(Boolean).join(" · ");
  return {
    ...createCollectionBottle({ id: stableLocalId(identity), name: displayName }, input, now),
    pendingCanonicalMatch: true,
  };
}

export function applyBottleContributionIds(
  bottles: MemberCollectionBottle[],
  contributionIds: ReadonlyMap<string, string>,
) {
  let changed = false;
  const next = bottles.map((bottle) => {
    const contributionId = contributionIds.get(bottle.bottleId)?.trim();
    if (!contributionId || !bottle.pendingCanonicalMatch || bottle.bottleContributionId) return bottle;
    changed = true;
    return { ...bottle, bottleContributionId: contributionId };
  });
  return changed ? next : bottles;
}

export function addSignalBottleToCollection(
  bottles: MemberCollectionBottle[],
  signalBottle: { id?: string; name: string },
  now: string,
) {
  const canonicalKey = canonicalBottleKey(signalBottle.name);
  if (bottles.some((bottle) => canonicalBottleKey(bottle.canonicalKey || bottle.bottleName) === canonicalKey)) return bottles;
  return [...bottles, createCollectionBottle({ id: signalBottle.id || canonicalKey, name: signalBottle.name }, { kind: "sealed" }, now)];
}

export function filterWatchedBottles(names: string[], query: string) {
  const needle = query.trim().toLowerCase();
  return names.filter((name) => !needle || name.toLowerCase().includes(needle));
}

export function rewardAvailability(
  reward: SignalRewardItem,
  member: { balance: number; redemptionEligible: boolean },
) {
  const physicalStock = typeof reward.inventoryRemaining === "number" ? ` · ${reward.inventoryRemaining} remaining` : "";
  if (reward.inventoryRemaining === 0) return { label: "Sold out", claimable: false, soldOut: true };
  if (!member.redemptionEligible) return { label: `Membership required to redeem${physicalStock}`, claimable: false, soldOut: false };
  if (member.balance < reward.points) return { label: `${reward.points - member.balance} more points needed${physicalStock}`, claimable: false, soldOut: false };
  return { label: `Available to redeem${physicalStock}`, claimable: true, soldOut: false };
}

export function rewardCatalogSummary(
  catalog: SignalRewardItem[],
  member: { balance: number; redemptionEligible: boolean },
) {
  const decorated = catalog.map((reward, index) => ({ reward, index, availability: rewardAvailability(reward, member) }));
  const orderedRewards = [...decorated]
    .sort((left, right) => {
      if (left.availability.claimable !== right.availability.claimable) return left.availability.claimable ? -1 : 1;
      if (left.availability.soldOut !== right.availability.soldOut) return left.availability.soldOut ? 1 : -1;
      if (left.reward.points !== right.reward.points) return left.reward.points - right.reward.points;
      return left.index - right.index;
    })
    .map(({ reward }) => reward);
  const featuredReward = orderedRewards.find((reward) => rewardAvailability(reward, member).claimable) || null;
  const nextReward = member.redemptionEligible ? orderedRewards.find((reward) => {
    const availability = rewardAvailability(reward, member);
    return !availability.claimable && !availability.soldOut && reward.points > member.balance;
  }) || null : null;
  const nextRewardProgress = nextReward ? {
    remaining: Math.max(0, nextReward.points - member.balance),
    ratio: Math.min(1, Math.max(0, member.balance / Math.max(1, nextReward.points))),
  } : null;
  return {
    claimableCount: decorated.filter(({ availability }) => availability.claimable).length,
    catalogAvailableCount: catalog.length,
    featuredReward,
    nextReward,
    nextRewardProgress,
    orderedRewards,
  };
}
