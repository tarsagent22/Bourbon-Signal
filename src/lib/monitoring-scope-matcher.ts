import type { MonitoringScope } from "./monitoring-scopes.ts";
import { californiaAreaMatchesFields, normalizeCaliforniaAreas } from "./california-area.ts";
import { coloradoAreaMatchesFields, normalizeColoradoAreas } from "./colorado-area.ts";
import { demandMetroAreaMatchesFields, demandMetroBoardGroupMatchesFields, normalizeDemandMetroAreas } from "./demand-metro-areas.ts";
import { nevadaAreaMatchesFields, normalizeNevadaAreas } from "./nevada-area.ts";
import { newYorkAreaMatchesFields, normalizeNewYorkAreas } from "./new-york-area.ts";
import { ncAbcBoardPreferencesMatch } from "./nc-abc-boards.ts";
import { geographyState } from "./geography-directory.ts";
import { cityIsInMontgomeryCountyMaryland } from "./maryland-montgomery.ts";

type Candidate = Record<string, unknown>;

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function token(value: unknown) { return text(value).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim(); }
function geographyToken(value: unknown, type: "county" | "city") {
  const suffix = type === "county" ? /\b(county|parish|borough|census area|municipality)\b/g : /\b(city|town|village|borough|municipality|cdp)\b/g;
  return token(text(value).toLowerCase().replace(suffix, " "));
}
function values(candidate: Candidate, keys: string[]) { return keys.map((key) => text(candidate[key])).filter(Boolean); }
function labelMatch(candidateValues: string[], label: string, type?: "county" | "city") {
  const wanted = type ? geographyToken(label, type) : token(label);
  return Boolean(wanted && candidateValues.some((value) => (type ? geographyToken(value, type) : token(value)) === wanted));
}

export function candidateMatchesMonitoringScopes(candidate: Candidate, scopes: MonitoringScope[]) {
  const rawState = text(candidate.state || candidate.storeState || candidate.store_state).toUpperCase();
  const state = geographyState(rawState)?.state || "";
  if (!state) return false;
  const inState = scopes.filter((scope) => scope.state === state);
  if (!inState.length) return false;
  if (inState.some((scope) => scope.type === "state")) return true;
  const countyFips = values(candidate, ["countyFips", "county_fips", "countyGeoid", "county_geoid"]);
  const placeFips = values(candidate, ["placeFips", "place_fips", "placeGeoid", "place_geoid"]);
  const countyLabels = values(candidate, ["storeCounty", "store_county", "county", "countyName", "county_name"]);
  const cityLabels = values(candidate, ["storeCity", "store_city", "city", "placeName", "place_name"]);
  const boardLabels = values(candidate, ["boardName", "board_name", "locationName", "location_name", "displayLocation", "display_location", "county"]);
  const storeIds = values(candidate, ["storeId", "store_id", "locationId", "location_id"]);
  const broadLabels = values(candidate, [
    "storeName", "store_name", "storeAddress", "store_address", "storeCity", "store_city", "storeCounty", "store_county",
    "city", "county", "countyName", "county_name", "boardName", "board_name", "locationName", "location_name",
    "displayLocation", "display_location",
  ]);
  return inState.some((scope) => {
    if (scope.type === "county") return (scope.id === "county:24031" && state === "MD" && (rawState === "MD-MONTGOMERY" || cityLabels.some(cityIsInMontgomeryCountyMaryland)))
      || countyFips.includes(scope.id.slice(7))
      || labelMatch(countyLabels, scope.label, "county");
    if (scope.type === "city") {
      if (placeFips.includes(scope.id.slice(6)) || labelMatch(cityLabels, scope.label, "city")) return true;
      if (!scope.id.includes(":legacy:")) return false;
      if ((scope.state === "GA" || scope.state === "TN") && normalizeDemandMetroAreas(scope.state, [scope.label]).length && demandMetroAreaMatchesFields(scope.state, broadLabels, [scope.label])) return true;
      if (scope.state === "CA" && normalizeCaliforniaAreas([scope.label]).length && californiaAreaMatchesFields(broadLabels, [scope.label])) return true;
      if (scope.state === "NV" && normalizeNevadaAreas([scope.label]).length && nevadaAreaMatchesFields(broadLabels, [scope.label])) return true;
      if (scope.state === "NY" && normalizeNewYorkAreas([scope.label]).length && newYorkAreaMatchesFields(broadLabels, [scope.label])) return true;
      if (scope.state === "CO" && normalizeColoradoAreas([scope.label]).length && coloradoAreaMatchesFields(broadLabels, [scope.label])) return true;
      return labelMatch(cityLabels, scope.label, "city");
    }
    if (scope.type === "board") return scope.state === "NC"
      ? demandMetroBoardGroupMatchesFields(boardLabels, [scope.label]) || ncAbcBoardPreferencesMatch(boardLabels, [scope.label])
      : labelMatch(boardLabels, scope.label);
    if (scope.type === "store") return storeIds.includes(scope.id.slice(`store:${scope.state}:`.length));
    return false;
  });
}
