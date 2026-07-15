export const SUPPORTED_CALIFORNIA_AREAS = ["San Diego"] as const;

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

function isSanDiegoField(value: unknown) {
  const normalized = normalizeLocation(value);
  if (!normalized || normalized.includes("san diego county")) return false;
  if (normalized === "san diego" || normalized === "san diego ca") return true;
  return /\bsan diego ca(?:\s+\d{5}(?:\s+\d{4})?)?\b/.test(normalized);
}

export function californiaAreaMatchesFields(fields: unknown[], selectedAreas: unknown): boolean {
  const areas = normalizeCaliforniaAreas(selectedAreas);
  if (!areas.length) return true;
  if (!areas.includes("San Diego")) return false;
  return fields.some(isSanDiegoField);
}
