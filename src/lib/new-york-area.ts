export const SUPPORTED_NEW_YORK_AREAS = ["New York City", "Nassau County", "Buffalo"] as const;
export type NewYorkArea = (typeof SUPPORTED_NEW_YORK_AREAS)[number];

const CANONICAL_AREA_BY_TOKEN = new Map<string, NewYorkArea>([
  ["new york city", "New York City"],
  ["new york", "New York City"],
  ["nyc", "New York City"],
  ["nassau", "Nassau County"],
  ["nassau county", "Nassau County"],
  ["buffalo", "Buffalo"],
  ["buffalo ny", "Buffalo"],
]);

const NEW_YORK_CITY_LOCALITIES = [
  "new york city",
  "new york",
  "manhattan",
  "brooklyn",
  "queens",
  "bronx",
  "staten island",
] as const;

const NASSAU_COUNTY_LOCALITIES = [
  "garden city",
  "wantagh",
  "westbury",
] as const;

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function canonicalArea(value: string): NewYorkArea | null {
  return CANONICAL_AREA_BY_TOKEN.get(normalize(value)) ?? null;
}

export function normalizeNewYorkAreas(values: unknown): NewYorkArea[] {
  if (!Array.isArray(values)) return [];
  const selected = new Set<NewYorkArea>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const area = canonicalArea(value);
    if (area) selected.add(area);
  }
  return SUPPORTED_NEW_YORK_AREAS.filter((area) => selected.has(area));
}

export function parseNewYorkAreaQuery(raw: unknown): { requested: boolean; valid: boolean; areas: NewYorkArea[] } {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { requested: false, valid: true, areas: [] };
  }
  const values = raw.split(",").map((value) => value.trim()).filter(Boolean);
  const areas = normalizeNewYorkAreas(values);
  return {
    requested: true,
    valid: values.length > 0 && values.every((value) => canonicalArea(value) !== null),
    areas,
  };
}

function fieldMatchesNewYorkCity(field: string): boolean {
  const token = normalize(field);
  if (!token) return false;

  return NEW_YORK_CITY_LOCALITIES.some((locality) => {
    if (token === locality) return true;
    if (token === `${locality} ny` || token === `${locality} new york`) return true;
    return new RegExp(`\\b${locality} (?:ny|new york)(?: \\d{5}(?: \\d{4})?)?$`).test(token);
  });
}

function fieldMatchesNassauCounty(field: string): boolean {
  const token = normalize(field);
  if (!token) return false;
  if (token === "nassau" || token === "nassau county" || token === "nassau county ny" || token === "nassau county new york") return true;

  return NASSAU_COUNTY_LOCALITIES.some((locality) => {
    if (token === locality) return true;
    if (token === `${locality} ny` || token === `${locality} new york`) return true;
    return new RegExp(`\\b${locality} (?:ny|new york)(?: \\d{5}(?: \\d{4})?)?(?: usa)?$`).test(token);
  });
}

function fieldMatchesBuffalo(field: string): boolean {
  const token = normalize(field);
  return token === "buffalo"
    || token === "buffalo ny"
    || token === "buffalo new york"
    || /\bbuffalo (?:ny|new york)(?: \d{5}(?: \d{4})?)?(?: usa)?$/.test(token);
}

export function matchedNewYorkArea(fields: readonly unknown[], selectedAreas: readonly string[]): NewYorkArea | null {
  const areas = normalizeNewYorkAreas([...selectedAreas]);
  for (const area of areas) {
    const matches = area === "New York City"
      ? fieldMatchesNewYorkCity
      : area === "Nassau County"
        ? fieldMatchesNassauCounty
        : fieldMatchesBuffalo;
    if (fields.some((field) => typeof field === "string" && matches(field))) return area;
  }
  return null;
}

export function newYorkAreaMatchesFields(fields: readonly unknown[], selectedAreas: readonly string[]): boolean {
  const areas = normalizeNewYorkAreas([...selectedAreas]);
  if (!areas.length) return true;
  return matchedNewYorkArea(fields, areas) !== null;
}
