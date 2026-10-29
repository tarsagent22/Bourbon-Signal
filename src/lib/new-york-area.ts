export const SUPPORTED_NEW_YORK_AREAS = ["New York City", "Nassau County", "Suffolk County", "Buffalo", "Rochester Metro", "Hudson Valley", "Lake George"] as const;
export type NewYorkArea = (typeof SUPPORTED_NEW_YORK_AREAS)[number];

const CANONICAL_AREA_BY_TOKEN = new Map<string, NewYorkArea>([
  ["new york city", "New York City"],
  ["new york", "New York City"],
  ["nyc", "New York City"],
  ["nassau", "Nassau County"],
  ["nassau county", "Nassau County"],
  ["suffolk", "Suffolk County"],
  ["suffolk county", "Suffolk County"],
  ["east northport", "Suffolk County"],
  ["buffalo", "Buffalo"],
  ["buffalo ny", "Buffalo"],
  ["rochester metro", "Rochester Metro"],
  ["rochester", "Rochester Metro"],
  ["webster", "Rochester Metro"],
  ["hudson valley", "Hudson Valley"],
  ["west hurley", "Hudson Valley"],
  ["lake george", "Lake George"],
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
  "syosset",
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

function fieldMatchesSuffolkCounty(field: string): boolean {
  const token = normalize(field);
  return token === "suffolk" || token === "suffolk county" || token === "suffolk county ny"
    || token === "suffolk county new york" || token === "east northport"
    || /\beast northport (?:ny|new york)(?: 11731(?: \d{4})?)?(?: usa)?$/.test(token);
}

// Older snapshots lack county metadata for these two reviewed premises.
// This supplies geography for preferences only, never inventory admission.
export function reviewedNewYorkStoreCounty(row: Record<string, unknown>): "Suffolk County" | "Nassau County" | null {
  const state = String(row.state || row.storeState || row.store_state || "").toUpperCase();
  const address = row.storeAddress || row.store_address;
  if (state !== "NY" || typeof address !== "string") return null;
  const id = row.storeId || row.store_id, location = normalize(address);
  if (id === "winecity-east-northport:11731" && location === "4000 jericho tpke east northport ny 11731") return "Suffolk County";
  if (id === "grand-wine-cellar:11791" && location === "40 cold spring rd syosset ny 11791") return "Nassau County";
  return null;
}

export function matchedNewYorkArea(fields: readonly unknown[], selectedAreas: readonly string[]): NewYorkArea | null {
  const areas = normalizeNewYorkAreas([...selectedAreas]);
  for (const area of areas) {
    const matches = area === "New York City"
      ? fieldMatchesNewYorkCity
      : area === "Nassau County"
        ? fieldMatchesNassauCounty
        : area === "Suffolk County"
          ? fieldMatchesSuffolkCounty
        : area === "Buffalo"
          ? fieldMatchesBuffalo
          : (field: string) => {
            const token = normalize(field);
            if (token === normalize(area)) return true;
            const localities = area === "Rochester Metro" ? ["rochester", "webster"]
              : area === "Hudson Valley" ? ["west hurley"] : ["lake george"];
            return localities.some((locality) => token === locality
              || new RegExp(`\\b${locality} (?:ny|new york)(?: \\d{5}(?: \\d{4})?)?(?: usa)?$`).test(token));
          };
    if (fields.some((field) => typeof field === "string" && matches(field))) return area;
  }
  return null;
}

export function newYorkAreaMatchesFields(fields: readonly unknown[], selectedAreas: readonly string[]): boolean {
  const areas = normalizeNewYorkAreas([...selectedAreas]);
  if (!areas.length) return true;
  return matchedNewYorkArea(fields, areas) !== null;
}
