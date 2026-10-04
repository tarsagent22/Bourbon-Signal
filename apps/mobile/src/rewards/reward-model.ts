import type {
  AchievementSummary,
  SignalPointsSummary,
  SignalRewardItem,
} from "../api/types";

export function rewardGoal(
  catalog: SignalRewardItem[],
  savedKey: string | null,
  balance: number,
) {
  const available = catalog.filter((item) => item.inventoryRemaining !== 0);
  return (
    available.find((item) => item.key === savedKey) ||
    available.find((item) => item.points > balance) ||
    available[0] ||
    null
  );
}
export function rewardCost(item: SignalRewardItem, personal: boolean) {
  return (
    item.points +
    (personal
      ? (item.options?.engravingPointsPerGlass || 0) *
        (item.options?.glassQuantity || 0)
      : 0)
  );
}
export function nextAchievements(summary: AchievementSummary) {
  const families = new Set<string>();
  return summary.badgeProgress
    .filter((badge) => !badge.earned)
    .filter((badge) => {
      const family = badge.id.replace(
        /_(bronze|silver|gold|platinum|diamond)$/,
        "",
      );
      if (families.has(family)) return false;
      families.add(family);
      return true;
    })
    .sort(
      (a, b) =>
        b.current / Math.max(1, b.target) - a.current / Math.max(1, a.target),
    );
}
export function activityLabel(
  entry: NonNullable<SignalPointsSummary["activity"]>[number],
) {
  if (entry.kind === "redemption_debit") return "Reward redeemed";
  if (entry.kind === "cancellation_credit")
    return "Redemption canceled · points returned";
  const reason = entry.reason || "";
  if (reason.includes("badge"))
    return entry.points < 0 ? "Achievement adjustment" : "Achievement earned";
  if (reason.includes("streak")) return "Weekly streak bonus";
  if (reason.includes("sighting"))
    return entry.points < 0
      ? "Sighting removed or adjusted"
      : "Sighting contribution";
  if (reason.includes("outcome"))
    return entry.points < 0
      ? "Availability update adjusted"
      : "Availability update";
  if (entry.sourceType.includes("referral"))
    return entry.points < 0 ? "Referral adjustment" : "Qualified referral";
  return entry.points < 0 ? "Points adjustment" : "Points earned";
}
export function redemptionLabel(status: string) {
  return (
    (
      {
        reserved: "Points reserved",
        details_required: "Details needed",
        submitted: "Order received",
        approved: "Preparing reward",
        packed: "Packed",
        shipped: "Shipped",
        delivered: "Delivered",
        digital_fulfillment: "Preparing digital delivery",
        canceled: "Canceled · points returned",
      } as Record<string, string>
    )[status] || "Processing"
  );
}
