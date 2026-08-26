import type { MemberCollectionBottle, RadarBottleOption } from "../api/types";
import { collectionOptionMatchIndex } from "../interactions/member-interactions";

type MatchRank = readonly [matchKind: number, sourceKind: number];
type IndexedSource = Readonly<{ value: string; tokens: readonly string[]; sourceKind: number }>;
type IndexedBottle = Readonly<{
  option: RadarBottleOption;
  sources: readonly IndexedSource[];
  tokens: readonly string[];
  normalizedName: string;
}>;

export interface BottleSearchIndex {
  entries: readonly IndexedBottle[];
}

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`´]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\byears\b/g, "year")
    .replace(/\s+/g, " ")
    .trim();
}

function indexedSource(value: string | null | undefined, sourceKind: number): IndexedSource | null {
  const normalized = value ? normalizeSearchValue(value) : "";
  return normalized ? { value: normalized, tokens: normalized.split(" "), sourceKind } : null;
}

export function createBottleSearchIndex(catalog: RadarBottleOption[]): BottleSearchIndex {
  return {
    entries: catalog.map((option) => {
      const sources = [
        indexedSource(option.name, 0),
        ...(option.aliases || []).map((alias) => indexedSource(alias, 1)),
        indexedSource(option.brand, 2),
        indexedSource(option.producer, 2),
        indexedSource(option.proof == null ? undefined : `${option.proof} proof`, 3),
        indexedSource(option.ageStatement, 3),
      ].filter((source): source is IndexedSource => source !== null);
      return {
        option,
        sources,
        tokens: [...new Set(sources.flatMap((source) => source.tokens))],
        normalizedName: normalizeSearchValue(option.name),
      };
    }),
  };
}

function wordPrefixMatch(value: string, query: string) {
  const words = value.split(" ");
  const queryWords = query.split(" ");
  if (queryWords.length > words.length) return false;
  return words.some((_, start) => queryWords.every((word, offset) => words[start + offset]?.startsWith(word)));
}

function matchKind(value: string, query: string) {
  if (value === query) return 0;
  if (value.startsWith(query)) return 1;
  if (wordPrefixMatch(value, query)) return 2;
  if (value.includes(query)) return 3;
  return undefined;
}

function optionRanks(entry: IndexedBottle, query: string, queryTokens: readonly string[]) {
  const ranks: MatchRank[] = [];
  for (const source of entry.sources) {
    const kind = matchKind(source.value, query);
    if (kind !== undefined) ranks.push([kind, source.sourceKind]);
  }
  if (ranks.length === 0 && queryTokens.every((queryToken) => entry.tokens.some((token) => token.startsWith(queryToken)))) {
    const bestSource = Math.min(...queryTokens.map((queryToken) => entry.sources.find((source) => source.tokens.some((token) => token.startsWith(queryToken)))?.sourceKind ?? 3));
    ranks.push([4, bestSource]);
  }
  return ranks.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
}

function compareRanks(left: MatchRank[], right: MatchRank[]) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (!left[index]) return 1;
    if (!right[index]) return -1;
    const difference = left[index][0] - right[index][0] || left[index][1] - right[index][1];
    if (difference) return difference;
  }
  return 0;
}

export function rankBottleCatalog(index: BottleSearchIndex, query: string, limit = 12) {
  const needle = normalizeSearchValue(query);
  if (!needle || limit <= 0) return [];
  const queryTokens = needle.split(" ");
  return index.entries
    .map((entry) => ({ entry, ranks: optionRanks(entry, needle, queryTokens) }))
    .filter(({ ranks }) => ranks.length > 0)
    .sort((left, right) => compareRanks(left.ranks, right.ranks)
      || left.entry.normalizedName.localeCompare(right.entry.normalizedName)
      || left.entry.option.id.localeCompare(right.entry.option.id))
    .slice(0, Math.floor(limit))
    .map(({ entry }) => entry.option);
}

export function collectionMatchForOption(bottles: MemberCollectionBottle[], option: RadarBottleOption) {
  const index = collectionOptionMatchIndex(bottles, option);
  return index >= 0 ? bottles[index] : undefined;
}
