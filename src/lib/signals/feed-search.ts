import { STATE_LIFECYCLE_CONFIG } from "../../config/stateLifecycle.ts";

const stateNames: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_LIFECYCLE_CONFIG.states).map(([code, value]) => [code, value.customerLabel]),
);

export function normalizeFeedSearch(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function feedSearchStateCodes(query: string) {
  const needle = normalizeFeedSearch(query);
  if (!needle) return [];
  if (feedSearchIsStateCode(needle)) return [needle.toUpperCase()];
  return Object.entries(stateNames).filter(([code, name]) => code.toLowerCase() === needle || normalizeFeedSearch(name).includes(needle)).map(([code]) => code);
}

export function feedSearchIsStateCode(query: string) {
  return Object.hasOwn(stateNames, normalizeFeedSearch(query).toUpperCase());
}

export function feedSearchMatches(query: string, fields: readonly unknown[], state?: unknown) {
  const needle = normalizeFeedSearch(query);
  if (!needle) return true;
  const code = String(state || "").trim().toUpperCase().replace(/^MD-MONTGOMERY$/, "MD");
  if (feedSearchIsStateCode(needle)) return code.toLowerCase() === needle;
  return code.toLowerCase() === needle
    || normalizeFeedSearch(stateNames[code]).includes(needle)
    || fields.some((field) => (Array.isArray(field) ? field : [field]).some((value) => normalizeFeedSearch(value).includes(needle)));
}

export function dropFeedSearchMatches(row: Record<string, unknown>, query: string) {
  return feedSearchMatches(query, [
    row.brand_name, row.tracked_brand_name, row.canonical_name, row.raw_name,
    row.bottle_name, row.bottleName, row.canonicalName, row.aliases,
    row.store_name, row.store_address, row.store_city, row.store_county,
    row.board_name, row.display_location, row.locationName, row.county,
    row.store_county ? `${row.store_county} County` : undefined,
    row.county ? `${row.county} County` : undefined,
  ], row.state || row.state_code || row.store_state);
}

export function sightingFeedSearchMatches(row: { bottleName: string; storeName: string; storeAddress: string; storeCity?: string; storeState?: string; storeZip?: string }, query: string) {
  return feedSearchMatches(query, [row.bottleName, row.storeName, row.storeAddress, row.storeCity, row.storeZip], row.storeState);
}
