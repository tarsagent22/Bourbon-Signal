import type { MemberCollectionBottle, SignalRewardItem } from "../api/types";

export type CollectionSort = "rating" | "recent" | "name";

export function canonicalBottleKey(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function filterAndSortCollection(bottles: MemberCollectionBottle[], query: string, sort: CollectionSort) {
  const needle = query.trim().toLowerCase();
  return bottles
    .map((bottle, index) => ({ bottle, index }))
    .filter(({ bottle }) => !needle || [bottle.bottleName, bottle.notes || "", ...(bottle.tasteTags || [])].some((value) => value.toLowerCase().includes(needle)))
    .sort((left, right) => {
      if (sort === "rating") return right.bottle.rating - left.bottle.rating || left.bottle.bottleName.localeCompare(right.bottle.bottleName);
      if (sort === "name") return left.bottle.bottleName.localeCompare(right.bottle.bottleName);
      return Date.parse(right.bottle.addedAt) - Date.parse(left.bottle.addedAt) || left.index - right.index;
    })
    .map(({ bottle }) => bottle);
}

export function updateCollectionBottle(
  bottles: MemberCollectionBottle[],
  canonicalKey: string,
  patch: Pick<MemberCollectionBottle, "rating" | "notes" | "tasteTags" | "wouldBuyAgain">,
  updatedAt: string,
) {
  const key = canonicalBottleKey(canonicalKey);
  return bottles.map((bottle) => {
    if (canonicalBottleKey(bottle.canonicalKey) !== key) return bottle;
    const tasteTags = Array.from(new Set((patch.tasteTags || []).map((tag) => tag.trim()).filter(Boolean))).slice(0, 8);
    return {
      ...bottle,
      rating: Math.max(0, Math.min(100, Math.round(patch.rating))),
      notes: patch.notes?.trim().slice(0, 500) || undefined,
      tasteTags,
      wouldBuyAgain: patch.wouldBuyAgain,
      updatedAt,
    };
  });
}

export function addSignalBottleToCollection(
  bottles: MemberCollectionBottle[],
  signalBottle: { id?: string; name: string },
  now: string,
) {
  const canonicalKey = canonicalBottleKey(signalBottle.name);
  if (bottles.some((bottle) => canonicalBottleKey(bottle.canonicalKey || bottle.bottleName) === canonicalKey)) return bottles;
  return [...bottles, {
    bottleId: signalBottle.id || canonicalKey,
    bottleName: signalBottle.name.trim(),
    canonicalKey,
    rating: 0,
    tasteTags: [],
    wouldBuyAgain: false,
    addedAt: now,
    updatedAt: now,
  }];
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
