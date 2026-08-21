export type SightingBottleSearchRecord = {
  id: string;
  name: string;
  canonical_name?: string;
  aliases?: string[];
  search_aliases?: string[];
  distillery?: string;
};

function normalize(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactInitials(value: string) {
  const tokens = value.split(" ").filter(Boolean);
  const compacted: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].length !== 1) {
      compacted.push(tokens[index]);
      continue;
    }
    let initials = tokens[index];
    while (index + 1 < tokens.length && tokens[index + 1].length === 1) {
      initials += tokens[index + 1];
      index += 1;
    }
    compacted.push(initials);
  }
  return compacted.join(" ");
}

function normalizedVariants(values: unknown[]) {
  const normalized = values.map(normalize).filter(Boolean);
  return Array.from(new Set(normalized.flatMap((value) => [value, compactInitials(value)])));
}

function scoreValues(values: string[], query: string) {
  const queryTokens = query.split(" ").filter(Boolean);
  const words = values.flatMap((value) => value.split(" "));
  if (!queryTokens.every((token) => words.some((word) => word.startsWith(token)) || values.some((value) => value.includes(token)))) return 0;

  let score = 30;
  if (values.some((value) => value === query)) score += 180;
  if (values.some((value) => value.startsWith(query))) score += 120;
  if (values.some((value) => value.includes(query))) score += 70;
  for (const token of queryTokens) {
    if (words.some((word) => word === token)) score += 22;
    else if (words.some((word) => word.startsWith(token))) score += 14;
  }
  return score;
}

function scoreBottle(bottle: SightingBottleSearchRecord, normalizedQuery: string) {
  const query = compactInitials(normalizedQuery);
  const identityValues = normalizedVariants([bottle.name, bottle.canonical_name, ...(bottle.aliases || []), ...(bottle.search_aliases || [])]);
  const identityScore = scoreValues(identityValues, query);
  if (identityScore > 0) return 1_000 + identityScore;

  const distilleryScore = scoreValues(normalizedVariants([bottle.distillery]), query);
  return distilleryScore > 0 ? 100 + distilleryScore : 0;
}

function bottlePrimaryIdentity(bottle: SightingBottleSearchRecord) {
  return compactInitials(normalize(bottle.canonical_name || bottle.name))
    .replace(/^wl weller\b/, "weller")
    .replace(/\s+/g, " ")
    .trim();
}

export function dedupeSightingBottles<T extends SightingBottleSearchRecord>(bottles: T[]) {
  const accepted: T[] = [];
  const acceptedKeys = new Set<string>();
  for (const bottle of bottles) {
    const key = bottlePrimaryIdentity(bottle);
    if (acceptedKeys.has(key)) continue;
    accepted.push(bottle);
    acceptedKeys.add(key);
  }
  return accepted;
}

export function mergeSightingBottleSuggestions<T extends SightingBottleSearchRecord>(
  immediate: T[],
  authoritative: T[],
  limit = 4,
) {
  const interleaved: T[] = [];
  const rows = Math.max(immediate.length, authoritative.length);
  for (let index = 0; index < rows; index += 1) {
    if (immediate[index]) interleaved.push(immediate[index]);
    if (authoritative[index]) interleaved.push(authoritative[index]);
  }
  return dedupeSightingBottles(interleaved).slice(0, Math.max(1, limit));
}

export function searchSightingBottles<T extends SightingBottleSearchRecord>(
  bottles: T[],
  query: string,
  options: { limit?: number } = {},
) {
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length < 2) return [];
  const limit = Math.max(1, Math.min(options.limit ?? 6, 20));
  return bottles
    .map((bottle) => ({ bottle, score: scoreBottle(bottle, normalizedQuery) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.bottle.name.localeCompare(b.bottle.name))
    .slice(0, limit)
    .map(({ bottle }) => bottle);
}
