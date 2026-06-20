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
  signalCount?: number;
  locationType?: string;
  inventoryCapability?: string;
  source?: string;
  sourceUrl?: string;
  collectorAttached?: boolean;
  hasSignals?: boolean;
  searchable?: boolean;
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
  const locationType = typeof raw.locationType === "string" ? raw.locationType : typeof raw.type === "string" ? raw.type : undefined;
  const rawPrecision = typeof raw.precision === "string" ? raw.precision : typeof raw.locationPrecision === "string" ? raw.locationPrecision : undefined;
  const sourceStoreId = typeof raw.sourceStoreId === "string" && raw.sourceStoreId.trim() ? raw.sourceStoreId.trim() : undefined;
  const source = typeof raw.source === "string" ? raw.source : undefined;
  const sourceUrl = typeof raw.sourceUrl === "string" ? raw.sourceUrl : undefined;
  const inventoryCapability = typeof raw.inventoryCapability === "string" ? raw.inventoryCapability : undefined;
  const signalCount =
    typeof raw.signalCount === "number"
      ? raw.signalCount
      : typeof raw.bottle_count === "number"
        ? raw.bottle_count
        : undefined;

  const hasExactStoreAddress = Boolean(address);
  const hasExactStoreIdentity = Boolean(sourceStoreId || locationType === "store" || hasExactStoreAddress);
  const isMappable = Boolean(address && lat != null && lng != null);
  const isExplicitBoardType = locationType === "state_board" || locationType === "county_board" || locationType === "area";
  const isStoreLevelPrecision = Boolean(rawPrecision && /store_level|store-level|store_aggregate|store-aggregate|\bstore\b/.test(rawPrecision));
  const looksLikeBoard = Boolean(
    isExplicitBoardType ||
      (!hasExactStoreIdentity && rawName && /\babc\b|\bboard\b|\babs\b|\bolcc\b|\bohlq\b|\bdabs\b|\bplcb\b/i.test(rawName)) ||
      (!hasExactStoreIdentity && district && /\babc\b|\bboard\b/i.test(district))
  );
  const precision = locationType === "store" || Boolean(sourceStoreId) || isStoreLevelPrecision || (hasExactStoreAddress && !isExplicitBoardType) || (isMappable && !looksLikeBoard) ? "store" : "board";
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
    bottle_count: signalCount,
    signalCount,
    locationType,
    inventoryCapability,
    source,
    sourceUrl,
    collectorAttached: raw.collectorAttached === true,
    hasSignals: raw.hasSignals === true || Boolean(signalCount && signalCount > 0),
    searchable: raw.searchable !== false,
    isMappable,
    precision,
    displayLabel,
  };
}
