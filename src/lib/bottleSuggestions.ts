import type { Bottle } from "@/data/bottles";

export const POPULAR_BOTTLE_PICKS = [
  "Weller Special Reserve",
  "Stagg Bourbon",
  "Blanton's",
  "E.H. Taylor Small Batch",
  "Eagle Rare",
  "Buffalo Trace",
  "Weller Antique 107",
  "Booker's Bourbon",
  "Elijah Craig Barrel Proof",
  "Russell's Reserve 13 Year",
  "Old Forester Birthday Bourbon",
  "George T. Stagg",
  "William Larue Weller",
  "Rock Hill Farms",
  "Elmer T. Lee",
  "Michter's 10 Year Bourbon",
  "King of Kentucky",
  "Four Roses Limited Edition Small Batch",
  "Pappy Van Winkle 15 Year",
  "Old Rip Van Winkle 10 Year",
  "Wild Turkey Master's Keep",
] as const;

function normalize(value?: string | null) {
  return (value || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/\b(single barrel|straight bourbon|bourbon whiskey|whiskey|small batch|literal|liter|750|750ml|1l|1 00l|1\.00l|10 year|10yr|year)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function scoreBottlePopularity(bottle: Bottle) {
  const tierBoost = bottle.tier === "unicorn" ? 120 : bottle.tier === "allocated" ? 65 : 20;
  const signalBoost = (bottle.drop_count_30d ?? 0) * 5;
  const actionableBoost = (bottle.actionable_count_30d ?? 0) * 3;
  const inventoryBoost = bottle.has_inventory ? 10 : 0;
  const curatedBoost = POPULAR_BOTTLE_PICKS.includes(bottle.name as (typeof POPULAR_BOTTLE_PICKS)[number]) ? 150 : 0;
  return tierBoost + signalBoost + actionableBoost + inventoryBoost + curatedBoost;
}

export function getPopularBottlePool(bottles: Bottle[]) {
  const picked = new Map<string, Bottle>();

  for (const preferred of POPULAR_BOTTLE_PICKS) {
    const match = bottles.find((bottle) => normalize(bottle.name) === normalize(preferred));
    if (match) picked.set(match.id, match);
  }

  const scored = [...bottles]
    .sort((a, b) => scoreBottlePopularity(b) - scoreBottlePopularity(a));

  for (const bottle of scored) {
    if (picked.size >= 24) break;
    picked.set(bottle.id, bottle);
  }

  return [...picked.values()].sort((a, b) => scoreBottlePopularity(b) - scoreBottlePopularity(a));
}

export function getRotatingBottleSuggestions(bottles: Bottle[], seed: number, count: number = 5) {
  if (!bottles.length) return [];
  const pool = getPopularBottlePool(bottles);
  if (pool.length <= count) return pool.slice(0, count);

  const start = Math.abs(seed) % pool.length;
  const rotated = [...pool.slice(start), ...pool.slice(0, start)];
  return rotated.slice(0, count);
}
