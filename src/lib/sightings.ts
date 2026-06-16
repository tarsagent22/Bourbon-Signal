export type SightingSource = "custom" | "feed" | "finder";
export type SightingType = "seen_in_store" | "online_social";
export type SightingVoteKind = "up" | "down";
export type SignalReportKind = "seen" | "not_seen";

export interface SightingVote {
  sightingId: string;
  kind: SightingVoteKind;
  createdAt: string;
}

export interface MemberSighting {
  id: string;
  bottleName: string;
  bottleId?: string;
  rarityTier?: "unicorn" | "allocated" | "limited";
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
  sightingType?: SightingType;
  reporterUserId?: string;
  createdAt: string;
  upCount?: number;
  downCount?: number;
  myVote?: SightingVoteKind | null;
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
  sightingVotes?: SightingVote[];
}

export const EMPTY_SIGHTINGS_PREFERENCES: SightingsPreferences = {
  submittedSightings: [],
  signalReports: [],
  sightingVotes: [],
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

export function sightingTypeLabel(type?: SightingType) {
  return type === "online_social" ? "Online/Social Media" : "Seen in store";
}
