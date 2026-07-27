import demandMetroConfig from "../config/demand-metro-areas.json" with { type: "json" };

type DemandMetroState = "NC" | "GA" | "TN";
type DemandMetroDefinition = {
  id: string;
  label: string;
  preferenceField: string;
  stateCode: string;
  stateName: string;
  aliases: string[];
  localities: string[];
  counties: string[];
  boardNames: string[];
};

export const DEMAND_METRO_AREAS = demandMetroConfig as Record<DemandMetroState, DemandMetroDefinition>;
export const CHARLOTTE_METRO_BOARD_GROUP = DEMAND_METRO_AREAS.NC.label;

function normalize(value: unknown) {
  return typeof value === "string"
    ? value
      .normalize("NFKD")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ")
    : "";
}

function metroDefinition(state: unknown): DemandMetroDefinition | null {
  const code = String(state || "").trim().toUpperCase() as DemandMetroState;
  return DEMAND_METRO_AREAS[code] || null;
}

function canonicalMetroArea(state: unknown, value: unknown) {
  const definition = metroDefinition(state);
  const token = normalize(value);
  if (!definition || !token) return null;
  return definition.aliases.some((alias) => normalize(alias) === token) ? definition.label : null;
}

export function normalizeDemandMetroAreas(state: unknown, values: unknown): string[] {
  const definition = metroDefinition(state);
  if (!definition || !Array.isArray(values)) return [];
  return values.some((value) => canonicalMetroArea(state, value) === definition.label) ? [definition.label] : [];
}

export function normalizeNcBoardPreferences(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(
    values
      .filter((value): value is string => typeof value === "string")
      .map((value) => normalizeDemandMetroAreas("NC", [value])[0] || value.trim())
      .filter(Boolean),
  ));
}

export function parseDemandMetroAreaQuery(state: unknown, raw: unknown): { requested: boolean; valid: boolean; areas: string[] } {
  if (typeof raw !== "string" || raw.trim() === "") return { requested: false, valid: true, areas: [] };
  const values = raw.split(",").map((value) => value.trim()).filter(Boolean);
  const areas = normalizeDemandMetroAreas(state, values);
  return {
    requested: true,
    valid: values.length > 0 && values.every((value) => canonicalMetroArea(state, value) !== null),
    areas,
  };
}

function localityMatchesField(field: string, locality: string, definition: DemandMetroDefinition) {
  const token = normalize(field);
  const place = normalize(locality);
  const stateCode = normalize(definition.stateCode);
  const stateName = normalize(definition.stateName);
  if (!token || !place) return false;
  if (token === place) return true;
  if (token === `${place} ${stateCode}` || token === `${place} ${stateName}`) return true;
  const escapedPlace = place.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^| )${escapedPlace} (?:${stateCode}|${stateName})(?: \\d{5}(?: \\d{4})?)?$`).test(token);
}

function countyMatchesField(field: string, county: string, definition: DemandMetroDefinition) {
  const token = normalize(field);
  const countyToken = normalize(county);
  const stateCode = normalize(definition.stateCode);
  const stateName = normalize(definition.stateName);
  if (!token || !countyToken) return false;
  const labels = [countyToken, `${countyToken} county`];
  if (labels.includes(token)) return true;
  return labels.some((label) => token === `${label} ${stateCode}` || token === `${label} ${stateName}`);
}

function fieldMatchesMetro(field: string, definition: DemandMetroDefinition) {
  const token = normalize(field);
  if (!token) return false;
  if (definition.aliases.some((alias) => normalize(alias) === token)) return true;
  if (definition.boardNames.some((board) => normalize(board) === token)) return true;
  if (definition.localities.some((locality) => localityMatchesField(field, locality, definition))) return true;
  return definition.counties.some((county) => countyMatchesField(field, county, definition));
}

export function demandMetroAreaMatchesFields(state: unknown, fields: readonly unknown[], selectedAreas: readonly string[]): boolean {
  const definition = metroDefinition(state);
  if (!definition) return false;
  const areas = normalizeDemandMetroAreas(state, [...selectedAreas]);
  if (!areas.length) return true;
  return fields.some((field) => typeof field === "string" && fieldMatchesMetro(field, definition));
}

export function demandMetroBoardGroupMatchesFields(fields: readonly unknown[], selectedBoards: readonly string[]): boolean {
  const definition = DEMAND_METRO_AREAS.NC;
  const hasGroup = selectedBoards.some((board) => canonicalMetroArea("NC", board) === definition.label);
  if (!hasGroup) return false;
  const exactBoards = new Set(definition.boardNames.map(normalize));
  return fields.some((field) => typeof field === "string" && exactBoards.has(normalize(field)));
}

export function demandMetroAreaLabel(state: unknown) {
  return metroDefinition(state)?.label || null;
}
