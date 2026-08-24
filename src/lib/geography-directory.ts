import directory from "../data/us-geography-2025.generated.json" with { type: "json" };

export type GeographyLevel = "state" | "county" | "city";
export interface GeographyEntry {
  id: string;
  level: GeographyLevel;
  state: string;
  name: string;
  code?: string;
}

export const GEOGRAPHY_SOURCE = directory.metadata;

const states: GeographyEntry[] = directory.states.map(([fips, code, name]) => ({ id: `state:${code}`, level: "state", state: code, code: fips, name }));
const counties: GeographyEntry[] = directory.counties.map(([fips, state, name]) => ({ id: `county:${fips}`, level: "county", state, code: fips, name }));
const places: GeographyEntry[] = directory.places.map(([fips, state, name]) => ({ id: `place:${fips}`, level: "city", state, code: fips, name }));
const all = [...states, ...counties, ...places];
const byId = new Map(all.map((entry) => [entry.id, entry]));
const stateByCode = new Map(states.map((entry) => [entry.state, entry]));

export function listMonitoringStates() {
  return states.map((entry) => ({ id: entry.id, code: entry.state, name: entry.name }));
}

export function findGeographyById(id: string) {
  return byId.get(id) || null;
}

export function geographyState(code: string) {
  const normalized = code.trim().toUpperCase() === "MD-MONTGOMERY" ? "MD" : code.trim().toUpperCase();
  return stateByCode.get(normalized) || null;
}

export function listGeographyMatches({ state, levels = ["state", "county", "city"], query = "" }: {
  state?: string;
  levels?: GeographyLevel[];
  query?: string;
}) {
  const stateCode = state?.trim().toUpperCase();
  const allowed = new Set(levels);
  const needle = query.replace(/\s+/g, " ").trim().toLowerCase();
  return all.filter((entry) => allowed.has(entry.level)
    && (!stateCode || entry.state === stateCode)
    && (!needle || entry.name.toLowerCase().includes(needle) || entry.state.toLowerCase() === needle));
}

export function searchGeography({ state, levels = ["state", "county", "city"], query = "", limit = 25, offset = 0 }: {
  state?: string;
  levels?: GeographyLevel[];
  query?: string;
  limit?: number;
  offset?: number;
}) {
  const boundedLimit = Math.max(1, Math.min(50, Math.floor(limit) || 25));
  const boundedOffset = Math.max(0, Math.min(10_000, Math.floor(offset) || 0));
  const matches = listGeographyMatches({ state, levels, query });
  const results = matches.slice(boundedOffset, boundedOffset + boundedLimit);
  return { results, offset: boundedOffset, limit: boundedLimit, hasMore: boundedOffset + results.length < matches.length };
}
