import type { MemberCollectionBottle, RadarBottleOption, SignalRewardItem } from "../api/types";

export const TASTE_TAG_OPTIONS = ["Caramel", "Vanilla", "Oak", "Cherry", "Spice", "Proof heat", "Sweet", "Dark fruit", "Nutty", "Smoky", "Dessert", "Balanced"] as const;

export type CollectionSort = "recently_updated" | "recently_acquired" | "recently_rated" | "rating" | "name";
export type CollectionStatusFilter = "all" | "sealed" | "open" | "finished" | "just_tasted";
export interface CollectionFilters {
  status: CollectionStatusFilter;
  minRating: number | null;
  buyAgainOnly: boolean;
  tastingContext?: MemberCollectionBottle["tastingContext"];
}

export type CollectionBottlePatch = Pick<MemberCollectionBottle,
  "rating" | "isRated" | "notes" | "tasteTags" | "wouldBuyAgain" |
  "sealedQuantity" | "openedQuantity" | "finishedCount" | "tastedOnly" |
  "pricePaid" | "store" | "purchaseDate" | "tastingContext"
>;

export interface CustomBottleInput { name: string; proof?: number; detail?: string }

function quantity(value: number | undefined) {
  return Math.max(0, Math.min(999, Math.floor(Number.isFinite(value) ? value! : 0)));
}

export function collectionSummary(bottles: MemberCollectionBottle[]) {
  const ratings = bottles.filter((bottle) => bottle.isRated).map((bottle) => bottle.rating);
  return {
    uniqueBourbons: bottles.length,
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
  if (sealed) parts.push(sealed === 1 ? "Sealed" : `${sealed} sealed`);
  if (opened) parts.push(opened === 1 ? "Open" : `${opened} open`);
  return parts.join(" · ");
}

export function shortCollectionDate(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function canonicalBottleKey(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function filterAndSortCollection(bottles: MemberCollectionBottle[], query: string, sort: CollectionSort, filters: CollectionFilters = { status: "all", minRating: null, buyAgainOnly: false }) {
  const needle = query.trim().toLowerCase();
  return bottles
    .map((bottle, index) => ({ bottle, index }))
    .filter(({ bottle }) => !needle || [bottle.bottleName, bottle.notes || "", bottle.store || "", ...(bottle.tasteTags || [])].some((value) => value.toLowerCase().includes(needle)))
    .filter(({ bottle }) => {
      if (filters.status === "all") return true;
      if (filters.status === "sealed") return quantity(bottle.sealedQuantity) > 0;
      if (filters.status === "open") return quantity(bottle.openedQuantity) > 0;
      if (filters.status === "finished") return quantity(bottle.finishedCount) > 0;
      return bottle.tastedOnly === true;
    })
    .filter(({ bottle }) => filters.minRating == null || (bottle.isRated && bottle.rating >= filters.minRating))
    .filter(({ bottle }) => !filters.buyAgainOnly || bottle.wouldBuyAgain === true)
    .filter(({ bottle }) => !filters.tastingContext || bottle.tastingContext === filters.tastingContext)
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

export function projectCollectionBottles(bottles: MemberCollectionBottle[], mode: "owned" | "tastings") {
  return bottles.filter((bottle) => {
    if (mode === "owned") return quantity(bottle.sealedQuantity) + quantity(bottle.openedQuantity) > 0;
    return bottle.tastedOnly === true
      || quantity(bottle.finishedCount) > 0
      || bottle.isRated === true
      || (bottle.tasteTags || []).some((tag) => Boolean(tag.trim()))
      || Boolean(bottle.notes?.trim());
  });
}

export function activeCollectionRefinementCount(filters: CollectionFilters, sort: CollectionSort) {
  return Number(filters.status !== "all")
    + Number(filters.minRating !== null)
    + Number(filters.buyAgainOnly)
    + Number(Boolean(filters.tastingContext))
    + Number(sort !== "recently_rated");
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
    const tastedOnly = patch.tastedOnly === true && sealedQuantity + openedQuantity + finishedCount === 0;
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
      pricePaid: tastedOnly ? undefined : patch.pricePaid,
      store: tastedOnly ? undefined : patch.store?.trim() || undefined,
      purchaseDate: tastedOnly ? undefined : Object.hasOwn(patch, "purchaseDate") ? patch.purchaseDate : bottle.purchaseDate,
      tastingContext: tastedOnly ? patch.tastingContext : undefined,
      updatedAt,
    };
  });
}

export function finishCollectionBottle(bottles: MemberCollectionBottle[], canonicalKey: string, updatedAt: string) {
  const key = canonicalBottleKey(canonicalKey);
  return bottles.map((bottle) => {
    if (canonicalBottleKey(bottle.canonicalKey) !== key || bottle.tastedOnly) return bottle;
    const openedQuantity = quantity(bottle.openedQuantity);
    const sealedQuantity = quantity(bottle.sealedQuantity);
    if (openedQuantity === 0) return bottle;
    return {
      ...bottle,
      openedQuantity: Math.max(0, openedQuantity - 1),
      sealedQuantity,
      finishedCount: quantity(bottle.finishedCount) + 1,
      opened: openedQuantity > 1,
      updatedAt,
    };
  });
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
