export interface MapStoreRecord {
  id: string;
  name?: string;
  state: string;
  city: string;
  county?: string;
  address?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  district?: string;
  bottle_count?: number;
  isMappable: boolean;
  precision: "store" | "board";
  displayLabel: string;
}

export function titleCase(value?: string): string {
  if (!value) return "";
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function normalizeMapStore(raw: Record<string, unknown>): MapStoreRecord {
  const state = typeof raw.state === "string" ? raw.state : "";
  const city = titleCase(typeof raw.city === "string" ? raw.city : "");
  const district = typeof raw.district === "string" ? raw.district : undefined;
  const county = typeof raw.county === "string" ? raw.county : undefined;
  const address = typeof raw.address === "string" && raw.address.trim() ? raw.address.trim() : undefined;
  const lat = typeof raw.lat === "number" ? raw.lat : undefined;
  const lng = typeof raw.lng === "number" ? raw.lng : undefined;
  const rawName = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : undefined;

  const isMappable = Boolean(address && lat != null && lng != null);
  const precision = isMappable ? "store" : "board";
  const displayLabel = rawName || address || district || county || [city, state].filter(Boolean).join(", ") || String(raw.id ?? "Unknown store");

  return {
    id: String(raw.id ?? ""),
    name: rawName || (isMappable ? [state, city].filter(Boolean).join(" ") : undefined),
    state,
    city: city || state,
    county: county || district,
    address,
    zip: typeof raw.zip === "string" ? raw.zip : undefined,
    lat,
    lng,
    district,
    bottle_count: typeof raw.bottle_count === "number" ? raw.bottle_count : undefined,
    isMappable,
    precision,
    displayLabel,
  };
}
