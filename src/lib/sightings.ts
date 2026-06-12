export type SightingSource = "custom" | "feed" | "finder";
export type SignalReportKind = "seen" | "not_seen";

export interface MemberSighting {
  id: string;
  bottleName: string;
  bottleId?: string;
  storeId: string;
  storeName: string;
  storeAddress: string;
  storeCity?: string;
  storeState?: string;
  storeZip?: string;
  quantityEstimate?: string;
  price?: number | null;
  notes?: string;
  source: SightingSource;
  createdAt: string;
}

export interface SignalReport {
  id: string;
  signalId: string;
  bottleName: string;
  storeName?: string;
  storeAddress?: string;
  state?: string;
  kind: SignalReportKind;
  createdAt: string;
}

export interface SightingsPreferences {
  submittedSightings: MemberSighting[];
  signalReports: SignalReport[];
}

export const EMPTY_SIGHTINGS_PREFERENCES: SightingsPreferences = {
  submittedSightings: [],
  signalReports: [],
};

export function normalizeBottleKey(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function makeSightingId(prefix = "sighting") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function formatStoreAddress(parts: Array<string | undefined | null>) {
  return parts.map((part) => String(part || "").trim()).filter(Boolean).join(", ");
}
