export const SUPPORTED_COLORADO_AREAS = ["Denver Metro", "Boulder County", "Colorado Springs"] as const;
export type ColoradoArea = (typeof SUPPORTED_COLORADO_AREAS)[number];

const CANONICAL_AREA_BY_TOKEN = new Map<string, ColoradoArea>([
  ["denver metro", "Denver Metro"],
  ["denver metropolitan area", "Denver Metro"],
  ["greater denver", "Denver Metro"],
  ["denver", "Denver Metro"],
  ["boulder county", "Boulder County"],
  ["boulder", "Boulder County"],
  ["nederland", "Boulder County"],
  ["colorado springs", "Colorado Springs"],
]);

const DENVER_METRO_LOCALITIES = [
  "denver",
  "lakeside",
  "westminster",
  "greenwood village",
  "englewood",
  "centennial",
  "littleton",
] as const;

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function canonicalArea(value: string): ColoradoArea | null {
  return CANONICAL_AREA_BY_TOKEN.get(normalize(value)) ?? null;
}

export function normalizeColoradoAreas(values: unknown): ColoradoArea[] {
  if (!Array.isArray(values)) return [];
  const selected = new Set<ColoradoArea>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const area = canonicalArea(value);
    if (area) selected.add(area);
  }
  return SUPPORTED_COLORADO_AREAS.filter((area) => selected.has(area));
}

export function parseColoradoAreaQuery(raw: unknown): { requested: boolean; valid: boolean; areas: ColoradoArea[] } {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { requested: false, valid: true, areas: [] };
  }
  const values = raw.split(",").map((value) => value.trim()).filter(Boolean);
  const areas = normalizeColoradoAreas(values);
  return {
    requested: true,
    valid: values.length > 0 && values.every((value) => canonicalArea(value) !== null),
    areas,
  };
}

function fieldMatchesDenverMetro(field: string): boolean {
  const token = normalize(field);
  if (!token) return false;
  if (token === "denver metro" || token === "denver metropolitan area" || token === "greater denver") return true;

  return DENVER_METRO_LOCALITIES.some((locality) => {
    if (token === locality) return true;
    if (token === `${locality} co` || token === `${locality} colorado`) return true;
    return new RegExp(`\\b${locality} (?:co|colorado)(?: \\d{5}(?: \\d{4})?)?$`).test(token);
  });
}

export function matchedColoradoArea(fields: readonly unknown[], selectedAreas: readonly string[]): ColoradoArea | null {
  const areas = normalizeColoradoAreas([...selectedAreas]);
  return areas.find((area) => fields.some((field) => {
    if (typeof field !== "string") return false;
    if (area === "Denver Metro") return fieldMatchesDenverMetro(field);
    const token = normalize(field);
    if (token === normalize(area)) return true;
    const localities = area === "Boulder County" ? ["boulder", "nederland"] : ["colorado springs"];
    return localities.some((locality) => token === locality
      || new RegExp(`\\b${locality} (?:co|colorado)(?: \\d{5}(?: \\d{4})?)?(?: usa)?$`).test(token));
  })) ?? null;
}

export function coloradoAreaMatchesFields(fields: readonly unknown[], selectedAreas: readonly string[]): boolean {
  const areas = normalizeColoradoAreas([...selectedAreas]);
  if (!areas.length) return true;
  return matchedColoradoArea(fields, areas) !== null;
}
