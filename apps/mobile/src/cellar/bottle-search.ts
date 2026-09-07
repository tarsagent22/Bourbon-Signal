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

function withinOneEdit(left: string, right: string) {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  if (left.length === right.length) {
    const mismatches: number[] = [];
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) mismatches.push(index);
      if (mismatches.length > 2) return false;
    }
    if (mismatches.length === 1) return true;
    return mismatches.length === 2
      && mismatches[1] === mismatches[0] + 1
      && left[mismatches[0]] === right[mismatches[1]]
      && left[mismatches[1]] === right[mismatches[0]];
  }
  const [shorter, longer] = left.length < right.length ? [left, right] : [right, left];
  let shortIndex = 0;
  let longIndex = 0;
  let skipped = false;
  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1;
      longIndex += 1;
    } else if (skipped) {
      return false;
    } else {
      skipped = true;
      longIndex += 1;
    }
  }
  return true;
}

function editDistanceAtMost(left: string, right: string, maximum: number) {
  if (Math.abs(left.length - right.length) > maximum) return false;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMinimum = current[0];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + Number(left[leftIndex - 1] !== right[rightIndex - 1]),
      );
      rowMinimum = Math.min(rowMinimum, current[rightIndex]);
    }
    if (rowMinimum > maximum) return false;
    previous = current;
  }
  return previous[right.length] <= maximum;
}

function typoRank(entry: IndexedBottle, queryTokens: readonly string[]) {
  let edits = 0;
  for (const queryToken of queryTokens) {
    if (entry.tokens.some((token) => token === queryToken || token.startsWith(queryToken))) continue;
    if (queryToken.length < 5) return null;
    const maximum = queryToken.length >= 8 ? 2 : 1;
    if (!entry.tokens.some((token) => token.length >= 5 && (withinOneEdit(token, queryToken) || editDistanceAtMost(token, queryToken, maximum)))) return null;
    edits += 1;
  }
  return edits > 0 ? edits : null;
}

export function rankBottleCatalog(index: BottleSearchIndex, query: string, limit = 12) {
  const needle = normalizeSearchValue(query);
  if (!needle || limit <= 0) return [];
  const queryTokens = needle.split(" ");
  const strong = index.entries
    .map((entry) => ({ entry, ranks: optionRanks(entry, needle, queryTokens) }))
    .filter(({ ranks }) => ranks.length > 0)
    .sort((left, right) => compareRanks(left.ranks, right.ranks)
      || left.entry.normalizedName.localeCompare(right.entry.normalizedName)
      || left.entry.option.id.localeCompare(right.entry.option.id));
  if (strong.length > 0) return strong.slice(0, Math.floor(limit)).map(({ entry }) => entry.option);
  if (needle.length < 5) return [];
  return index.entries
    .map((entry) => ({ entry, typo: typoRank(entry, queryTokens) }))
    .filter((match): match is { entry: IndexedBottle; typo: number } => match.typo !== null)
    .sort((left, right) => left.typo - right.typo
      || left.entry.normalizedName.localeCompare(right.entry.normalizedName)
      || left.entry.option.id.localeCompare(right.entry.option.id))
    .slice(0, Math.floor(limit))
    .map(({ entry }) => entry.option);
}

export function collectionMatchForOption(bottles: MemberCollectionBottle[], option: RadarBottleOption) {
  const index = collectionOptionMatchIndex(bottles, option);
  return index >= 0 ? bottles[index] : undefined;
}
