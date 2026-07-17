import type { MapStoreRecord } from "@/lib/store-map";

export type SightingStoreSearchOrigin = { lat: number; lng: number };
export type SightingStoreSearchIndexEntry = {
  store: MapStoreRecord;
  fields: string[];
  joined: string;
  normalizedId: string;
};

const STORE_QUERY_ALIASES: Record<string, string[]> = {
  abc: ["abc", "alcoholic beverage control"],
  costco: ["costco", "costco wholesale"],
  totalwine: ["total wine", "total wine spirits"],
  binnys: ["binny", "binnys"],
  kroger: ["kroger", "kroger liquor"],
};

function normalize(value: unknown) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function distanceMiles(origin: SightingStoreSearchOrigin, store: MapStoreRecord) {
  if (store.lat == null || store.lng == null) return Number.POSITIVE_INFINITY;
  const radius = 3958.8;
  const dLat = ((store.lat - origin.lat) * Math.PI) / 180;
  const dLng = ((store.lng - origin.lng) * Math.PI) / 180;
  const lat1 = (origin.lat * Math.PI) / 180;
  const lat2 = (store.lat * Math.PI) / 180;
  const arc = 2 * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2));
  return radius * arc;
}

export function buildSightingStoreSearchIndex(stores: MapStoreRecord[]): SightingStoreSearchIndexEntry[] {
  return stores
    .filter((store) => store.precision === "store" && store.searchable !== false)
    .map((store) => {
      const fields = [store.id, store.name, store.displayLabel, store.address, store.city, store.county, store.zip, store.state]
        .map(normalize)
        .filter(Boolean);
      return { store, fields, joined: fields.join(" "), normalizedId: normalize(store.id) };
    });
}

function storeSearchScore(entry: SightingStoreSearchIndexEntry, query: string, origin?: SightingStoreSearchOrigin | null) {
  const { store, fields, joined, normalizedId } = entry;
  let score = 0;

  if (query) {
    const queryTokens = query.split(" ").filter(Boolean);
    const expandedTokens = queryTokens.flatMap((token) => STORE_QUERY_ALIASES[token] || [token]);
    const tokenMatches = queryTokens.map((token) => fields.some((field) => field.split(" ").some((word) => word.startsWith(token)) || field.includes(token)));
    if (tokenMatches.some((matched) => !matched)) return 0;

    if (normalizedId === query) score += 220;
    if (fields.some((field) => field === query)) score += 150;
    if (fields.some((field) => field.startsWith(query))) score += 110;
    if (joined.includes(query)) score += 80;

    for (const token of expandedTokens) {
      if (fields.some((field) => field.split(" ").some((word) => word.startsWith(token)))) score += 24;
      else if (fields.some((field) => field.includes(token))) score += 14;
    }
  }

  if (origin) {
    const distance = distanceMiles(origin, store);
    if (Number.isFinite(distance)) score += Math.max(0, 70 - Math.min(distance, 70));
  }
  return score;
}

export function searchSightingStoreIndex(
  index: SightingStoreSearchIndexEntry[],
  query: string,
  options: { origin?: SightingStoreSearchOrigin | null; limit?: number } = {},
) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery && !options.origin) return [];
  const limit = Math.max(1, Math.min(options.limit ?? 8, 30));

  return index
    .map((entry) => ({ store: entry.store, score: storeSearchScore(entry, normalizedQuery, options.origin) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.store.displayLabel.localeCompare(b.store.displayLabel))
    .slice(0, limit)
    .map(({ store }) => store);
}

export function searchSightingStores(
  stores: MapStoreRecord[],
  query: string,
  options: { origin?: SightingStoreSearchOrigin | null; limit?: number } = {},
) {
  return searchSightingStoreIndex(buildSightingStoreSearchIndex(stores), query, options);
}
