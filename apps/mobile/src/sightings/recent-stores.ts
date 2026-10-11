import type { PostStoreSelection } from "./post-composer";
export const recentStoresKey = (owner: string) => `bourbon-signal.recent-stores.v1.${owner}`;
export function parseRecentStores(raw: string | null): PostStoreSelection[] {
  try {
    if (!raw || raw.length > 12_000) return [];
    const rows: unknown = JSON.parse(raw);
    if (!Array.isArray(rows)) return [];
    return rows.filter((row): row is PostStoreSelection => Boolean(row && typeof row === "object"
      && [row.name, row.address, row.city, row.state].every(value => typeof value === "string" && value.trim().length > 0 && value.length <= 240)
      && /^[A-Z]{2}$/.test(row.state) && (row.id == null || typeof row.id === "string")
      && (row.zip == null || typeof row.zip === "string"))).slice(0, 3);
  } catch { return []; }
}
export function rememberStore(previous: PostStoreSelection[], store: PostStoreSelection) {
  const signature = (row: PostStoreSelection) => [row.state, row.name, row.address, row.city].join("|").toLowerCase();
  return parseRecentStores(JSON.stringify([store, ...previous.filter(row => signature(row) !== signature(store))]));
}
