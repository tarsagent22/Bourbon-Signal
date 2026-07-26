import mississippiProgram from "../config/mississippi-program.json" with { type: "json" };

export const MISSISSIPPI_AREAS = mississippiProgram.regions.map((region) => ({
  id: region.id,
  label: region.label,
  aliases: region.aliases,
  counties: region.counties,
  cities: region.cities,
})) as readonly {
  id: string;
  label: string;
  aliases: readonly string[];
  counties: readonly string[];
  cities: readonly string[];
}[];

export type MississippiAreaId = (typeof MISSISSIPPI_AREAS)[number]["id"];

export function normalizeMississippiAreaToken(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/\bcounty\b/gu, " ")
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

const AREA_BY_TOKEN = new Map<string, MississippiAreaId>();
const AREA_BY_COUNTY = new Map<string, MississippiAreaId>();
const AREAS_BY_CITY = new Map<string, Set<MississippiAreaId>>();

for (const area of MISSISSIPPI_AREAS) {
  for (const value of [area.id, area.label, ...area.aliases]) {
    AREA_BY_TOKEN.set(normalizeMississippiAreaToken(value), area.id);
  }
  for (const county of area.counties) {
    AREA_BY_COUNTY.set(normalizeMississippiAreaToken(county), area.id);
  }
  for (const city of area.cities) {
    const token = normalizeMississippiAreaToken(city);
    const matches = AREAS_BY_CITY.get(token) ?? new Set<MississippiAreaId>();
    matches.add(area.id);
    AREAS_BY_CITY.set(token, matches);
  }
}

export function canonicalMississippiArea(value: unknown): MississippiAreaId | null {
  return AREA_BY_TOKEN.get(normalizeMississippiAreaToken(value)) ?? null;
}

export function mississippiAreaForLocation(location: {
  state?: unknown;
  stateCode?: unknown;
  regionId?: unknown;
  region?: unknown;
  area?: unknown;
  county?: unknown;
  city?: unknown;
}): MississippiAreaId | null {
  const state = String(location.state ?? location.stateCode ?? "").toUpperCase();
  if (state && state !== "MS") return null;
  const explicit = canonicalMississippiArea(location.regionId ?? location.region ?? location.area);
  if (explicit) return explicit;
  const county = AREA_BY_COUNTY.get(normalizeMississippiAreaToken(location.county));
  if (county) return county;
  const cities = AREAS_BY_CITY.get(normalizeMississippiAreaToken(location.city));
  return cities?.size === 1 ? [...cities][0] : null;
}

export function normalizeMississippiAreas(values: unknown): MississippiAreaId[] {
  if (!Array.isArray(values)) return [];
  const selected = new Set(values.map(canonicalMississippiArea).filter((value): value is MississippiAreaId => Boolean(value)));
  return MISSISSIPPI_AREAS.map((area) => area.id).filter((id) => selected.has(id));
}

export function parseMississippiAreaQuery(raw: unknown): {
  requested: boolean;
  valid: boolean;
  areas: MississippiAreaId[];
} {
  if (typeof raw !== "string" || !raw.trim()) return { requested: false, valid: true, areas: [] };
  const values = raw.split(",").map((value) => value.trim()).filter(Boolean);
  return {
    requested: true,
    valid: values.length > 0 && values.every((value) => canonicalMississippiArea(value) !== null),
    areas: normalizeMississippiAreas(values),
  };
}

export function mississippiAreaMatchesLocation(
  location: Parameters<typeof mississippiAreaForLocation>[0],
  selectedAreas: readonly unknown[],
): boolean {
  const selected = normalizeMississippiAreas([...selectedAreas]);
  if (!selected.length) return true;
  const region = mississippiAreaForLocation(location);
  return Boolean(region && selected.includes(region));
}
