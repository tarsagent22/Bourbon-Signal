import type { Bottle } from "@/data/bottles";

export interface AvailabilityInfo {
  label: string;
  isAvailable: boolean;
  sortPriority: number; // lower = more available, for sorting
}

export function getAvailabilityInfo(bottle: Bottle): AvailabilityInfo {
  // Check if currently in stock
  if (bottle.has_inventory === true || (bottle.drop_count_30d && bottle.drop_count_30d > 0)) {
    return {
      label: "Available",
      isAvailable: true,
      sortPriority: 0,
    };
  }

  // Check last drop recency
  if (bottle.last_drop) {
    const lastDropDate = new Date(bottle.last_drop);
    const now = new Date();
    const daysSinceLastDrop = Math.floor(
      (now.getTime() - lastDropDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceLastDrop <= 7) {
      return {
        label: "Seen this week",
        isAvailable: false,
        sortPriority: 1,
      };
    }

    if (daysSinceLastDrop <= 30) {
      return {
        label: `Seen recently · ${daysSinceLastDrop}d ago`,
        isAvailable: false,
        sortPriority: 2,
      };
    }

    return {
      label: `Not in stock · ${daysSinceLastDrop}d ago`,
      isAvailable: false,
      sortPriority: 3,
    };
  }

  return {
    label: "Not tracked recently",
    isAvailable: false,
    sortPriority: 4,
  };
}

export function isInStockNow(bottle: Bottle): boolean {
  return bottle.has_inventory === true;
}

export function isSeenThisWeek(bottle: Bottle): boolean {
  if (!bottle.last_drop) return false;
  const lastDropDate = new Date(bottle.last_drop);
  const now = new Date();
  const daysSince = Math.floor(
    (now.getTime() - lastDropDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysSince <= 7;
}
