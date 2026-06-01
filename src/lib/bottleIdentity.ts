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

type BottleIdentityInput = Pick<Bottle, "id" | "name"> & Partial<Pick<Bottle, "canonical_id" | "canonical_name" | "canonical_key" | "aliases" | "search_aliases" | "state_aliases">>;
type DropIdentityInput = Pick<DropEvent, "brand_name" | "tracked_brand_name"> & Partial<Pick<DropEvent, "bottle_id" | "canonical_id" | "canonical_name" | "canonical_key" | "raw_name" | "aliases">>;

export function getBottleIdentityKeys(bottle: BottleIdentityInput) {
  const keys = new Set<string>([
    bottle.id,
    bottle.canonical_id,
    bottle.canonical_key,
    canonicalBottleKey(bottle.name),
    canonicalBottleKey(bottle.canonical_name),
    ...aliasBottleKeys(bottle.name),
    ...aliasBottleKeys(bottle.canonical_name),
    ...aliasBottleKeys(bottle.id),
    ...(bottle.aliases || []).flatMap(aliasBottleKeys),
    ...(bottle.search_aliases || []).flatMap(aliasBottleKeys),
    ...Object.values(bottle.state_aliases || {}).flat().flatMap(aliasBottleKeys),
  ].filter(Boolean) as string[]);
  return Array.from(keys).filter(Boolean);
}

export function getDropIdentityKeys(drop: DropIdentityInput) {
  const keys = new Set<string>([
    drop.bottle_id,
    drop.canonical_id,
    drop.canonical_key,
    canonicalBottleKey(drop.brand_name),
    canonicalBottleKey(drop.tracked_brand_name),
    canonicalBottleKey(drop.canonical_name),
    canonicalBottleKey(drop.raw_name),
    ...aliasBottleKeys(drop.brand_name),
    ...aliasBottleKeys(drop.tracked_brand_name),
    ...aliasBottleKeys(drop.canonical_name),
    ...aliasBottleKeys(drop.raw_name),
    ...(drop.aliases || []).flatMap(aliasBottleKeys),
  ].filter(Boolean) as string[]);
  return Array.from(keys).filter(Boolean);
}

export function dropMatchesBottle(drop: DropIdentityInput, bottle: BottleIdentityInput) {
  const bottleKeys = new Set(getBottleIdentityKeys(bottle));
  const dropKeys = getDropIdentityKeys(drop);
  return dropKeys.some((key) => bottleKeys.has(key));
}
