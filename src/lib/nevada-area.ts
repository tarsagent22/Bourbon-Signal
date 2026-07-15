export const SUPPORTED_NEVADA_AREAS = ["Las Vegas Valley", "Reno–Sparks"] as const;
export type NevadaArea = (typeof SUPPORTED_NEVADA_AREAS)[number];

const CANONICAL_BY_TOKEN = new Map<string, NevadaArea>([
  ["las vegas valley", "Las Vegas Valley"],
  ["las vegas", "Las Vegas Valley"],
  ["reno sparks", "Reno–Sparks"],
  ["reno-sparks", "Reno–Sparks"],
]);

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[–—]/g, "-")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function canonicalArea(value: string): NevadaArea | null {
  return CANONICAL_BY_TOKEN.get(normalize(value)) ?? null;
}

export function normalizeNevadaAreas(values: unknown): NevadaArea[] {
  if (!Array.isArray(values)) return [];
  const selected = new Set<NevadaArea>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const area = canonicalArea(value);
    if (area) selected.add(area);
  }
  return SUPPORTED_NEVADA_AREAS.filter((area) => selected.has(area));
}

export function parseNevadaAreaQuery(raw: string | null): { requested: boolean; valid: boolean; areas: NevadaArea[] } {
  if (raw == null || raw.trim() === "") return { requested: false, valid: true, areas: [] };
  const values = raw.split(",").map((value) => value.trim()).filter(Boolean);
  const areas = normalizeNevadaAreas(values);
  return { requested: true, valid: areas.length > 0 && areas.length === values.length, areas };
}

function fieldMatchesArea(field: string, area: NevadaArea): boolean {
  const token = normalize(field);
  if (!token) return false;
  if (area === "Las Vegas Valley") return /\b(?:las vegas|north las vegas|henderson|summerlin|enterprise|paradise|spring valley)\b/.test(token);
  return /\b(?:reno|sparks)\b/.test(token);
}

export function nevadaAreaMatchesFields(fields: readonly unknown[], selectedAreas: readonly string[]): boolean {
  const areas = normalizeNevadaAreas([...selectedAreas]);
  if (!areas.length) return true;
  const textFields = fields.filter((field): field is string => typeof field === "string" && field.trim().length > 0);
  return areas.some((area) => textFields.some((field) => fieldMatchesArea(field, area)));
}
