import { STATE_LIFECYCLE_CONFIG } from "../config/stateLifecycle.ts";

// City choices share the reviewed lifecycle menu; they are not county or metro
// catchments and do not imply current inventory at every store in that city.
export const SUPPORTED_CALIFORNIA_AREAS = STATE_LIFECYCLE_CONFIG.states.CA.areaOptions;

function normalizeLocation(value: unknown) {
  return typeof value === "string"
    ? value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()
    : "";
}

export function normalizeCaliforniaAreas(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const selected = new Set(values.map(normalizeLocation).filter(Boolean));
  return SUPPORTED_CALIFORNIA_AREAS.filter((area) => selected.has(normalizeLocation(area)));
}

export function parseCaliforniaAreaQuery(value: unknown): { requested: boolean; valid: boolean; areas: string[] } {
  const requested = typeof value === "string" && value.trim().length > 0;
  if (!requested) return { requested: false, valid: true, areas: [] };
  const areas = normalizeCaliforniaAreas([value]);
  return { requested: true, valid: areas.length > 0, areas };
}

function fieldMatchesCity(value: unknown, area: string) {
  const normalized = normalizeLocation(value);
  const city = normalizeLocation(area);
  if (!normalized || !city) return false;
  if (normalized === city) return true;
  // Retain locality boundaries: South San Francisco is not San Francisco,
  // West Sacramento is not Sacramento, and county labels are not cities.
  const locality = normalizeLocation(String(value)
    .replace(/,?\s+(?:USA|United States(?: of America)?)\.?\s*$/i, "")
    .split(",").slice(-2).join(" "));
  return new RegExp(`^${city} (?:ca|california)(?: \\d{5}(?: \\d{4})?)?$`).test(locality);
}

export function matchedCaliforniaArea(fields: unknown[], selectedAreas: unknown): string | null {
  return normalizeCaliforniaAreas(selectedAreas).find((area) => fields.some((field) => fieldMatchesCity(field, area))) || null;
}

export function californiaAreaMatchesFields(fields: unknown[], selectedAreas: unknown): boolean {
  const areas = normalizeCaliforniaAreas(selectedAreas);
  if (!areas.length) return true;
  return matchedCaliforniaArea(fields, areas) !== null;
}
