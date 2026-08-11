import inventoryBottles from "@/data/bourbonBibleInventory.json";
import { searchSeedBourbonBible, type BibleSearchResult } from "@/lib/bourbonBible";
import { normalizeBottleScarcity } from "@/lib/bottle-scarcity";
import { mergeBottleCatalogSources } from "@/lib/bottle-catalog-merge";
import { canonicalBottleId } from "@/data/bottle-identity-redirects";

const QUERY_ALIASES: Record<string, string[]> = {
  "blantons": ["blantons single barrel"],
  "weller green": ["weller special reserve"],
  "weller red": ["weller antique 107", "old weller antique"],
  "weller blue": ["weller full proof"],
  "eht": ["e h taylor", "colonel e h taylor"],
  "ehtbp": ["e h taylor barrel proof", "colonel e h taylor barrel proof"],
  "ofbb": ["old forester birthday bourbon"],
  "rr13": ["russell reserve 13"],
  "rr15": ["russell reserve 15"],
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type InventoryBottle = (typeof inventoryBottles)[number];
type IndexedBottle = {
  bottle: InventoryBottle;
  name: string;
  brand: string;
  aliases: string[];
};

const indexedBottles: IndexedBottle[] = inventoryBottles.map((bottle) => ({
  bottle,
  name: normalize(bottle.canonicalName),
  brand: normalize(bottle.brand),
  aliases: bottle.aliases.map(normalize),
}));

function score(indexed: IndexedBottle, query: string) {
  const terms = [query, ...(QUERY_ALIASES[query] || [])].map(normalize).filter(Boolean);
  let best = { score: 0, reason: "fuzzy" as BibleSearchResult["matchReason"] };

  for (const term of terms) {
    let candidate = { score: 0, reason: "fuzzy" as BibleSearchResult["matchReason"] };
    if (term === indexed.name) candidate = { score: 120, reason: "exact" };
    else if (indexed.aliases.includes(term)) candidate = { score: 115, reason: "alias" };
    else if (indexed.name.startsWith(term)) candidate = { score: 100 - Math.max(0, indexed.name.length - term.length) / 8, reason: "fuzzy" };
    else if (indexed.aliases.some((alias) => alias.startsWith(term))) candidate = { score: 96, reason: "alias" };
    else if (indexed.name.includes(term)) candidate = { score: 92 - Math.max(0, indexed.name.length - term.length) / 6, reason: "fuzzy" };
    else if (indexed.aliases.some((alias) => alias.includes(term))) candidate = { score: 88, reason: "alias" };
    else if (term.includes(indexed.name)) candidate = { score: 84, reason: "fuzzy" };
    else if (indexed.brand && term === indexed.brand) candidate = { score: 70, reason: "fuzzy" };
    else {
      const words = term.split(" ").filter(Boolean);
      const searchable = [indexed.name, ...indexed.aliases].join(" ");
      const matched = words.filter((word) => searchable.includes(word)).length;
      if (words.length > 1 && matched === words.length) candidate = { score: 64, reason: "fuzzy" };
    }
    if (candidate.score > best.score) best = candidate;
  }

  return best;
}

export function searchFastBottleSuggestions(query: string, limit = 8): BibleSearchResult[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];
  const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 25));

  const inventoryResults = indexedBottles
    .map((indexed) => ({ indexed, match: score(indexed, normalizedQuery) }))
    .filter(({ match }) => match.score > 0)
    .map(({ indexed, match }) => ({
      ...indexed.bottle,
      ...normalizeBottleScarcity(indexed.bottle),
      matchScore: match.score,
      matchReason: match.reason,
    } as BibleSearchResult));
  const seedResults = searchSeedBourbonBible(query, 25);
  const scoreByIdentity = new Map<string, { score: number; reason: BibleSearchResult["matchReason"] }>();
  for (const result of [...inventoryResults, ...seedResults]) {
    const key = canonicalBottleId(result.id);
    const existing = scoreByIdentity.get(key);
    if (!existing || result.matchScore > existing.score) {
      scoreByIdentity.set(key, { score: result.matchScore, reason: result.matchReason });
    }
  }
  const merged = mergeBottleCatalogSources([inventoryResults, seedResults]) as BibleSearchResult[];
  return merged
    .map((result) => {
      const match = scoreByIdentity.get(canonicalBottleId(result.id));
      return { ...result, matchScore: match?.score || 0, matchReason: match?.reason || "fuzzy" } as BibleSearchResult;
    })
    .filter((result) => result.matchScore > 0)
    .sort((left, right) => right.matchScore - left.matchScore || left.canonicalName.localeCompare(right.canonicalName))
    .slice(0, boundedLimit);
}
