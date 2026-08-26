export interface SearchableBottle {
  id: string;
  canonicalName: string;
  aliases?: string[];
  brand?: string;
  producer?: string;
  distillery?: string;
  proof?: number | null;
  ageStatement?: string | null;
  expression?: string | null;
}

function editDistance(left: string, right: string) {
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > 1) return 2;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    let rowMinimum = previous[0];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
      rowMinimum = Math.min(rowMinimum, previous[rightIndex]);
    }
    if (rowMinimum > 1) return 2;
  }
  return previous[right.length];
}

export function normalizeBottleSearchText(value: string) {
  let normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  normalized = normalized
    .replace(/\be\s+h\s+taylor\b/g, "eh taylor")
    .replace(/\beht\b/g, "eh taylor")
    .replace(/\bcolonel\s+(?:eh\s+)?taylor\b/g, "eh taylor")
    .replace(/\brussells\b/g, "russell")
    .replace(/\boaked\b/g, "oak")
    .replace(/\s+/g, " ")
    .trim();
  return normalized;
}

function tokenMatches(query: string, candidate: string) {
  if (query === candidate) return 3;
  if (query.length >= 4 && candidate.length >= 4 && (candidate.startsWith(query) || query.startsWith(candidate))) return 2;
  if (query.length >= 5 && candidate.length >= 5 && editDistance(query, candidate) <= 1) return 1;
  return 0;
}

function scoreBottle(bottle: SearchableBottle, query: string) {
  const name = normalizeBottleSearchText(bottle.canonicalName);
  const aliases = (bottle.aliases || []).map(normalizeBottleSearchText).filter(Boolean);
  const primaryFields = [name, ...aliases];
  const supportingFields = [bottle.brand, bottle.producer, bottle.distillery, bottle.ageStatement, bottle.expression, bottle.proof == null ? "" : `${bottle.proof} proof`]
    .filter((value): value is string => typeof value === "string" && Boolean(value))
    .map(normalizeBottleSearchText);
  if (name === query) return 1200;
  if (aliases.includes(query)) return 1160;
  if (name.startsWith(query)) return 1080 - Math.min(80, name.length - query.length);
  if (aliases.some((alias) => alias.startsWith(query))) return 1040;

  const queryTokens = query.split(" ").filter(Boolean);
  const searchableTokens = [...primaryFields, ...supportingFields].flatMap((field) => field.split(" ")).filter(Boolean);
  let exact = 0;
  let prefix = 0;
  let typo = 0;
  for (const queryToken of queryTokens) {
    const best = searchableTokens.reduce((current, candidate) => Math.max(current, tokenMatches(queryToken, candidate)), 0);
    if (!best) return 0;
    if (best === 3) exact += 1;
    else if (best === 2) prefix += 1;
    else typo += 1;
  }
  const nameTokens = new Set(name.split(" "));
  const nameHits = queryTokens.filter((token) => [...nameTokens].some((candidate) => tokenMatches(token, candidate) > 0)).length;
  return 700 + exact * 55 + prefix * 35 + typo * 14 + nameHits * 22 - Math.min(90, Math.max(0, searchableTokens.length - queryTokens.length));
}

export function rankBottleSearch<T extends SearchableBottle>(bottles: readonly T[], rawQuery: string, limit = 12): T[] {
  const query = normalizeBottleSearchText(rawQuery);
  if (!query) return [];
  const boundedLimit = Math.max(1, Math.min(30, Math.floor(limit)));
  return bottles
    .map((bottle, index) => ({ bottle, index, score: scoreBottle(bottle, query) }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.bottle.canonicalName.localeCompare(right.bottle.canonicalName) || left.index - right.index)
    .slice(0, boundedLimit)
    .map(({ bottle }) => bottle);
}
