import type { Bottle } from "@/data/bottles";
import type { DropEvent } from "@/lib/drops";

const STOPWORDS = new Set([
  "whiskey",
  "whisky",
  "american",
  "bottled",
  "bond",
  "bottledinbond",
  "kentucky",
]);

function baseNormalize(value?: string | null) {
  return (value || "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/\(ncabc btb\)/g, " ")
    .replace(/single barrel america 250 comm ed/g, "single barrel")
    .replace(/\b(750ml|700ml|375ml|50ml|1\.00l|1\.75l|\.75l)\b/g, " ")
    .replace(/\b(7y|8y|9y|10y|11y|12y|13y|14y|15y|16y|17y|18y|21y|23y|25y|30y)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeBottleIdentity(value?: string | null) {
  return baseNormalize(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

export function canonicalBottleKey(value?: string | null) {
  const tokens = Array.from(new Set(tokenizeBottleIdentity(value))).sort();
  return tokens.join(" ");
}

export function aliasBottleKeys(value?: string | null) {
  const base = canonicalBottleKey(value);
  const tokens = tokenizeBottleIdentity(value);
  const out = new Set<string>();
  if (base) out.add(base);
  if (tokens.length >= 3) {
    for (let i = 0; i < tokens.length; i++) {
      const subset = tokens.filter((_, idx) => idx !== i).sort().join(" ");
      if (subset) out.add(subset);
    }
  }
  return Array.from(out);
}

export function candidateBottleKeys(value?: string | null) {
  return aliasBottleKeys(value);
}

export function getBottleIdentityKeys(bottle: Pick<Bottle, "id" | "name">) {
  const keys = new Set<string>([
    canonicalBottleKey(bottle.name),
    ...aliasBottleKeys(bottle.name),
    ...aliasBottleKeys(bottle.id),
  ]);
  return Array.from(keys).filter(Boolean);
}

export function getDropIdentityKeys(drop: Pick<DropEvent, "brand_name" | "tracked_brand_name">) {
  const keys = new Set<string>([
    canonicalBottleKey(drop.brand_name),
    canonicalBottleKey(drop.tracked_brand_name),
    ...aliasBottleKeys(drop.brand_name),
    ...aliasBottleKeys(drop.tracked_brand_name),
  ]);
  return Array.from(keys).filter(Boolean);
}

export function dropMatchesBottle(drop: Pick<DropEvent, "brand_name" | "tracked_brand_name">, bottle: Pick<Bottle, "id" | "name">) {
  const bottleKeys = new Set(getBottleIdentityKeys(bottle));
  const dropKeys = getDropIdentityKeys(drop);
  return dropKeys.some((key) => bottleKeys.has(key));
}
