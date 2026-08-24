import { findGeographyById, geographyState, searchGeography } from "./geography-directory.ts";

export type MonitoringScopeType = "state" | "county" | "city" | "board" | "store";
export interface MonitoringScope {
  type: MonitoringScopeType;
  id: string;
  state: string;
  label: string;
}

export interface LegacyAreaPreferences {
  states: string[];
  ncBoards: string[];
  gaAreas: string[];
  tnAreas: string[];
  vaCities: string[];
  ohCities: string[];
  iaCities: string[];
  idCities: string[];
  scAreas: string[];
  caAreas: string[];
  nvAreas: string[];
  nyAreas: string[];
  coAreas: string[];
  paCounties: string[];
  paStores: string[];
}

export const MAX_MONITORING_SCOPES = 100;
export const EMPTY_LEGACY_AREA_PREFERENCES: LegacyAreaPreferences = {
  states: [], ncBoards: [], gaAreas: [], tnAreas: [], vaCities: [], ohCities: [], iaCities: [], idCities: [],
  scAreas: [], caAreas: [], nvAreas: [], nyAreas: [], coAreas: [], paCounties: [], paStores: [],
};

const LEGACY_LOCAL_KEYS: Record<string, keyof LegacyAreaPreferences> = {
  NC: "ncBoards", GA: "gaAreas", TN: "tnAreas", VA: "vaCities", OH: "ohCities", IA: "iaCities", ID: "idCities",
  SC: "scAreas", CA: "caAreas", NV: "nvAreas", NY: "nyAreas", CO: "coAreas", PA: "paCounties",
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean) : [];
}

function slug(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
}

function censusLocalScope(state: string, label: string, type: "county" | "city"): MonitoringScope {
  const exact = searchGeography({ state, levels: [type], query: label, limit: 50, offset: 0 }).results
    .find((entry) => entry.name.toLowerCase() === label.toLowerCase());
  if (exact) return { type, id: exact.id, state, label: exact.name };
  return { type, id: `${type}:legacy:${state}:${slug(label)}`, state, label };
}

function normalizeOne(value: unknown): MonitoringScope | null {
  const source = record(value);
  const type = source.type;
  const rawState = typeof source.state === "string" ? source.state.trim().toUpperCase() : "";
  const stateEntry = geographyState(rawState);
  const state = stateEntry?.state || "";
  const id = typeof source.id === "string" ? source.id.trim().slice(0, 180) : "";
  const suppliedLabel = typeof source.label === "string" ? source.label.replace(/\s+/g, " ").trim().slice(0, 180) : "";
  if (!(type === "state" || type === "county" || type === "city" || type === "board" || type === "store") || !stateEntry) return null;
  if (type === "state") {
    if (rawState === "MD-MONTGOMERY") return { type: "county", id: "county:24031", state: "MD", label: "Montgomery County" };
    return id === `state:${rawState}` || id === `state:${state}` ? { type, id: `state:${state}`, state, label: stateEntry.name } : null;
  }
  if (type === "county" || type === "city") {
    const entry = findGeographyById(id);
    if (entry && entry.level === type && entry.state === state) return { type, id, state, label: entry.name };
    const legacyPattern = new RegExp(`^${type}:legacy:${state}:[a-z0-9][a-z0-9-]{0,99}$`);
    return legacyPattern.test(id) && suppliedLabel ? { type, id, state, label: suppliedLabel } : null;
  }
  if (type === "board") {
    return new RegExp(`^board:${state}:[a-z0-9][a-z0-9-]{0,99}$`).test(id) && suppliedLabel ? { type, id, state, label: suppliedLabel } : null;
  }
  const statePrefix = `store:${state}:`;
  const rawStoreId = id.startsWith(statePrefix) ? id.slice(statePrefix.length) : id.startsWith("store:") ? id.slice(6) : "";
  return rawStoreId && rawStoreId.length <= 160 && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(rawStoreId)
    ? { type: "store", id: `${statePrefix}${rawStoreId}`, state, label: suppliedLabel || rawStoreId }
    : null;
}

export function normalizeMonitoringScopes(input: unknown, cap = MAX_MONITORING_SCOPES): MonitoringScope[] {
  const rows = Array.isArray(input) ? input : [];
  const unique = new Map<string, MonitoringScope>();
  for (const raw of rows) {
    const scope = normalizeOne(raw);
    if (scope && !unique.has(scope.id)) unique.set(scope.id, scope);
  }
  const statewide = new Set([...unique.values()].filter((scope) => scope.type === "state").map((scope) => scope.state));
  return [...unique.values()].filter((scope) => scope.type === "state" || !statewide.has(scope.state)).slice(0, Math.max(0, Math.min(MAX_MONITORING_SCOPES, cap)));
}

export function monitoringScopesFromPreferences(input: unknown, explicitScopes?: unknown): MonitoringScope[] {
  const source = record(input);
  const supplied = explicitScopes === undefined ? source.monitoringScopes : explicitScopes;
  if (Array.isArray(supplied)) return normalizeMonitoringScopes(supplied);
  const requestedStates = strings(source.states).map((state) => state.toUpperCase());
  const legacyMontgomeryOnly = requestedStates.includes("MD-MONTGOMERY") && !requestedStates.includes("MD");
  const states: string[] = [...new Set<string>(requestedStates.flatMap((state) => {
    const entry = geographyState(state);
    return entry ? [entry.state] : [];
  }))];
  const scopes: MonitoringScope[] = [];
  for (const state of states) {
    const localKey = LEGACY_LOCAL_KEYS[state];
    const locals = localKey ? strings(source[localKey]) : [];
    const stores = state === "PA" ? strings(source.paStores) : [];
    if (!locals.length && !stores.length) {
      if (state === "MD" && legacyMontgomeryOnly) {
        scopes.push({ type: "county", id: "county:24031", state: "MD", label: "Montgomery County" });
        continue;
      }
      const stateEntry = geographyState(state)!;
      scopes.push({ type: "state", id: `state:${state}`, state, label: stateEntry.name });
      continue;
    }
    if (state === "NC") scopes.push(...locals.map((label) => ({ type: "board" as const, id: `board:NC:${slug(label)}`, state, label })));
    else scopes.push(...locals.map((label) => censusLocalScope(state, label, /\b(county|parish|borough|census area|municipality)$/i.test(label) ? "county" : "city")));
    scopes.push(...stores.map((storeId) => ({ type: "store" as const, id: `store:${state}:${storeId}`, state, label: storeId })));
  }
  return normalizeMonitoringScopes(scopes);
}

export function legacyAreaPreferencesFromScopes(input: unknown): LegacyAreaPreferences {
  const scopes = normalizeMonitoringScopes(input);
  const next = Object.fromEntries(Object.keys(EMPTY_LEGACY_AREA_PREFERENCES).map((key) => [key, []])) as unknown as LegacyAreaPreferences;
  for (const scope of scopes) {
    if (!next.states.includes(scope.state)) next.states.push(scope.state);
    if (scope.type === "board" && scope.state === "NC") next.ncBoards.push(scope.label);
    else if (scope.type === "store" && scope.state === "PA") next.paStores.push(scope.id.slice(`store:${scope.state}:`.length));
    else if (scope.type === "county") {
      const key = LEGACY_LOCAL_KEYS[scope.state];
      if (key === "paCounties") next.paCounties.push(scope.label);
      else if (key && key !== "ncBoards" && key !== "paStores" && key !== "states") next[key].push(scope.label);
    }
    else if (scope.type === "city") {
      const key = LEGACY_LOCAL_KEYS[scope.state];
      if (key === "paCounties") next.paCounties.push(scope.label);
      else if (key && key !== "ncBoards" && key !== "paStores" && key !== "states") next[key].push(scope.label);
    }
  }
  return next;
}

export function trimMonitoringScopesToLimit(scopes: MonitoringScope[], limit: number | null) {
  if (limit === null) return scopes.slice(0, MAX_MONITORING_SCOPES);
  return scopes.slice(0, Math.max(0, Math.floor(limit)));
}
