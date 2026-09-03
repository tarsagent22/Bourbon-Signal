export interface ShelfBottleVariant {
  name: "straight" | "broad-shoulder" | "decanter" | "tall-narrow" | "rounded-shoulder" | "square-flask" | "short-wide";
  bodyWidth: number;
  bodyHeight: number;
  neckWidth: number;
  neckHeight: number;
  shoulderRadius: number;
  capWidth: number;
  labelWidth: number;
  glassColor: string;
  amberColor: string;
}

export const SHELF_BOTTLE_VARIANTS: readonly ShelfBottleVariant[] = [
  { name: "straight", bodyWidth: 24, bodyHeight: 46, neckWidth: 10, neckHeight: 16, shoulderRadius: 5, capWidth: 13, labelWidth: 17, glassColor: "#5A432A", amberColor: "#C47C24" },
  { name: "broad-shoulder", bodyWidth: 31, bodyHeight: 43, neckWidth: 9, neckHeight: 15, shoulderRadius: 11, capWidth: 14, labelWidth: 21, glassColor: "#493928", amberColor: "#A96019" },
  { name: "decanter", bodyWidth: 34, bodyHeight: 35, neckWidth: 12, neckHeight: 11, shoulderRadius: 3, capWidth: 18, labelWidth: 23, glassColor: "#64492A", amberColor: "#D18B2E" },
  { name: "tall-narrow", bodyWidth: 20, bodyHeight: 55, neckWidth: 8, neckHeight: 20, shoulderRadius: 6, capWidth: 10, labelWidth: 14, glassColor: "#423326", amberColor: "#B96A20" },
  { name: "rounded-shoulder", bodyWidth: 28, bodyHeight: 45, neckWidth: 9, neckHeight: 18, shoulderRadius: 14, capWidth: 12, labelWidth: 18, glassColor: "#5D4932", amberColor: "#D3943C" },
  { name: "square-flask", bodyWidth: 27, bodyHeight: 40, neckWidth: 12, neckHeight: 13, shoulderRadius: 1, capWidth: 15, labelWidth: 19, glassColor: "#3E3329", amberColor: "#9F5D20" },
  { name: "short-wide", bodyWidth: 33, bodyHeight: 31, neckWidth: 11, neckHeight: 10, shoulderRadius: 8, capWidth: 16, labelWidth: 22, glassColor: "#684B2C", amberColor: "#C97920" },
] as const;

const SHELF_MILESTONES = [1, 3, 6, 10, 15, 19, 22, 29, 37, 46, 56, 67] as const;

export function shelfBottleCount(ownedCount: number) {
  const safeCount = Math.max(0, Math.floor(ownedCount));
  return SHELF_MILESTONES.filter((milestone) => safeCount >= milestone).length;
}

export function shelfBottlePlan(ownedBottleKeys: readonly string[]) {
  const count = shelfBottleCount(ownedBottleKeys.length);
  return ownedBottleKeys.slice(0, count).map((key, index) => ({
    key,
    variant: SHELF_BOTTLE_VARIANTS[index % SHELF_BOTTLE_VARIANTS.length],
  }));
}

export function nextShelfPageSize(totalCount: number, currentCount: number, pageSize = 12) {
  const safeTotal = Math.max(0, Math.floor(totalCount));
  const safeCurrent = Math.max(0, Math.floor(currentCount));
  return Math.min(safeTotal, Math.max(pageSize, safeCurrent + pageSize));
}
