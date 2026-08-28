import type { MemberSighting } from "../sightings.ts";
import { isScheduledReleaseSignal, scheduledReleaseDateValue, type ScheduledReleaseInput } from "../scheduled-release-signals.ts";
import { dropDisplayTime } from "../drop-feed-policy.ts";
import { normalizeSignalRarityTier, type SignalRarityTier } from "./signal-feed-filters.ts";
import { communityDisplayNameSeparateFromIdentity } from "../community-display-name.ts";

export const SIGNAL_CONTRACT_VERSION = "bourbon-signal/signal@1" as const;

export type SignalSourceType = "member" | "retailer" | "trusted_source" | "release_source";
export type SignalKind = "availability" | "release" | "event";
export type SignalStrength = "best" | "more_activity";
export type SignalLocationScope = "exact_store" | "area" | "board" | "state" | "online" | "unknown";
export type SignalSourceStatus = "ready" | "unauthorized" | "unavailable";

export interface CanonicalSignal {
  contractVersion: typeof SIGNAL_CONTRACT_VERSION;
  id: string;
  kind: SignalKind;
  source: {
    type: SignalSourceType;
    label: string;
    reportMode?: "seen_in_store" | "reported_online";
    actor?: {
      kind: "founder" | "member";
      number: number;
      label: string;
      displayName?: string;
    };
  };
  bottle: {
    id?: string;
    name: string;
    rarity?: SignalRarityTier;
  };
  location: {
    scope: SignalLocationScope;
    label?: string;
    state?: string;
    store?: {
      id?: string;
      name?: string;
      address?: string;
      city?: string;
      state?: string;
      zip?: string;
    };
  };
  timing: {
    observedAt?: string;
    reportedAt?: string;
    displayAt: string;
    scheduledFor?: string;
    expiresAt?: string;
  };
  evidence: {
    summary?: string;
    photo: boolean;
    corroborationCount: number;
    helpfulCount: number;
    retailerReported: boolean;
    sourceBacked: boolean;
  };
  strength: SignalStrength;
  availability?: {
    status: "available_now" | "upcoming" | "reported" | "unknown";
    quantity?: number;
    quantityLabel?: string;
    price?: number;
    label?: string;
    caveat?: string;
  };
  alertEligibility: {
    inventory: boolean;
    watch: boolean;
  };
  actions: Array<"watch_bottle" | "watch_store" | "confirm" | "correct" | "helpful" | "report">;
}

export interface CanonicalSignalFeed {
  contractVersion: typeof SIGNAL_CONTRACT_VERSION;
  signals: CanonicalSignal[];
  total: number;
  sources: {
    drops: SignalSourceStatus;
    members: SignalSourceStatus;
  };
}

function text(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function finiteNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replace(/^\$/, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function boolean(...values: unknown[]) {
  return values.some((value) => value === true);
}


function prefixedId(prefix: SignalSourceType, rawId: string) {
  const existingPrefix = `${prefix}:`;
  return rawId.startsWith(existingPrefix) ? rawId : `${existingPrefix}${rawId}`;
}

function normalizeState(value: unknown) {
  const normalized = text(value)?.toUpperCase();
  return normalized && /^[A-Z]{2}$/.test(normalized) ? normalized : undefined;
}

function signalRarity(...values: unknown[]) {
  for (const value of values) {
    const normalized = normalizeSignalRarityTier(value);
    if (normalized) return normalized;
  }
  return undefined;
}

function scheduledReleaseInput(drop: Record<string, unknown>): ScheduledReleaseInput {
  return {
    event_type: text(drop.event_type),
    eventType: text(drop.eventType),
    type: text(drop.type),
    signal_category: text(drop.signal_category),
    signalCategory: text(drop.signalCategory),
    signal_label: text(drop.signal_label),
    signalLabel: text(drop.signalLabel),
    releaseDate: text(drop.releaseDate),
    eventDate: text(drop.eventDate),
    startsAt: text(drop.startsAt),
    event_at: text(drop.event_at),
    eventAt: text(drop.eventAt),
    availabilityLabel: text(drop.availabilityLabel),
    inventoryCaveat: text(drop.inventoryCaveat),
  };
}

function signalKind(drop: Record<string, unknown>): SignalKind {
  const type = text(drop.event_type, drop.eventType, drop.type)?.toLowerCase() || "";
  const retailerKind = text(drop.retailerSignalKind)?.toLowerCase() || "";
  if (retailerKind === "tasting" || retailerKind === "lottery" || /\b(tasting|lottery)\b/.test(type)) return "event";
  if (isScheduledReleaseSignal(scheduledReleaseInput(drop)) || /^(scheduled_release|release_announcement)$/.test(type)) return "release";
  return "availability";
}

function sourceType(drop: Record<string, unknown>, kind: SignalKind): SignalSourceType {
  if (drop.retailerReported === true || text(drop.source_type, drop.sourceType)?.toLowerCase() === "verified_retailer") return "retailer";
  if (kind === "release") return "release_source";
  return "trusted_source";
}

function locationScope(drop: Record<string, unknown>): SignalLocationScope {
  const scope = text(drop.availability_scope, drop.availabilityScope)?.toLowerCase() || "";
  const precision = text(drop.location_precision, drop.locationPrecision)?.toLowerCase() || "";
  if (scope === "online" || precision.includes("online")) return "online";
  if (["exact", "exact_store", "store_reported"].includes(scope) || precision.includes("store")) return "exact_store";
  if (scope.includes("board") || precision.includes("board")) return "board";
  if (scope.includes("area") || precision.includes("area") || precision.includes("county") || precision.includes("metro")) return "area";
  if (scope.includes("state") || precision.includes("state")) return "state";
  if (text(drop.store_id, drop.storeId, drop.store_name, drop.storeName, drop.store_address, drop.storeAddress)) return "exact_store";
  if (normalizeState(drop.state ?? drop.state_code)) return "state";
  return "unknown";
}

function signalStrength(drop: Record<string, unknown>, type: SignalSourceType, scope: SignalLocationScope): SignalStrength {
  if (type === "retailer") return "best";
  const confidence = text(drop.confidence_tier, drop.confidenceTier)?.toLowerCase() || "";
  if (scope === "exact_store" && (confidence === "exact_store" || boolean(drop.can_alert_as_inventory, drop.canAlertAsInventory))) return "best";
  return "more_activity";
}

function signalAvailability(drop: Record<string, unknown>, kind: SignalKind) {
  if (kind === "release") return undefined;
  const retailerState = text(drop.retailerSignalState)?.toLowerCase();
  const rawStatus = text(drop.signal_status, drop.status)?.toLowerCase();
  const status = retailerState === "upcoming" || rawStatus === "upcoming"
    ? "upcoming" as const
    : boolean(drop.can_alert_as_inventory, drop.canAlertAsInventory) || retailerState === "live" || rawStatus === "confirmed"
      ? "available_now" as const
      : "reported" as const;
  const quantity = finiteNumber(drop.quantity_in_stock, drop.quantityInStock, drop.quantity, drop.quantity_shipped, drop.quantityShipped);
  const price = finiteNumber(drop.retail_price, drop.retailPrice, drop.price);
  return {
    status,
    ...(quantity === undefined ? {} : { quantity }),
    ...(price === undefined || price <= 0 ? {} : { price }),
    ...(text(drop.availabilityLabel, drop.availability) ? { label: text(drop.availabilityLabel, drop.availability) } : {}),
    ...(text(drop.inventoryCaveat) ? { caveat: text(drop.inventoryCaveat) } : {}),
  };
}

export function normalizeDropSignal(input: Record<string, unknown>): CanonicalSignal {
  const kind = signalKind(input);
  const type = sourceType(input, kind);
  const rawId = text(input.id, input.eventId, input.canonical_id, input.canonicalId) || "unknown";
  const bottleId = text(input.bottle_id, input.bottleId, input.canonical_id, input.canonicalId);
  const bottleName = text(
    input.canonical_name,
    input.canonicalName,
    input.bottle_name,
    input.bottleName,
    input.bourbonName,
    input.brand_name,
    input.raw_name,
    input.rawName,
  ) || "Unknown bottle";
  const state = normalizeState(input.state ?? input.state_code ?? input.region);
  const storeId = text(input.store_id, input.storeId);
  const storeName = text(input.store_name, input.storeName);
  const storeAddress = text(input.store_address, input.storeAddress);
  const storeCity = text(input.store_city, input.storeCity, input.city);
  const storeZip = text(input.store_zip, input.storeZip, input.zip);
  const scope = locationScope(input);
  const observedAt = kind === "release"
    ? text(input.observed_at, input.observedAt)
    : text(input.observed_at, input.observedAt, input.event_at, input.eventAt);
  const reportedAt = kind === "release"
    ? text(input.created_at, input.createdAt, input.first_seen_at, input.firstSeenAt)
    : text(input.created_at, input.createdAt, input.first_seen_at, input.firstSeenAt, observedAt);
  const displayAt = (kind === "release" ? text(
    reportedAt,
    observedAt,
    input.timestamp,
    input.displayAt,
    input.display_at,
    input.last_confirmed_at,
    input.lastConfirmedAt,
  ) : text(
    dropDisplayTime(input),
    input.displayAt,
    input.display_at,
    input.last_confirmed_at,
    input.lastConfirmedAt,
    observedAt,
    reportedAt,
    input.timestamp,
  )) || new Date(0).toISOString();
  const inventoryEligible = boolean(input.can_alert_as_inventory, input.canAlertAsInventory);
  const watchEligible = boolean(input.canAlertAsWatch) || kind === "release" || inventoryEligible;
  const retailerReported = type === "retailer";
  const label = type === "retailer"
    ? storeName || "Retailer"
    : type === "release_source"
      ? "Release source"
      : "Trusted source";
  const locationLabel = text(input.display_location, input.displayLocation, input.locationName, storeName, storeCity, state);
  const summary = text(input.evidence, input.summary);
  const scheduledFor = kind === "release" ? scheduledReleaseDateValue(scheduledReleaseInput(input)) : undefined;

  return {
    contractVersion: SIGNAL_CONTRACT_VERSION,
    id: prefixedId(type, rawId),
    kind,
    source: { type, label },
    bottle: {
      ...(bottleId ? { id: bottleId } : {}),
      name: bottleName,
      ...(signalRarity(input.rarity_tier, input.tier, input.national_tier) ? { rarity: signalRarity(input.rarity_tier, input.tier, input.national_tier) } : {}),
    },
    location: {
      scope,
      ...(locationLabel ? { label: locationLabel } : {}),
      ...(state ? { state } : {}),
      ...(scope === "exact_store" ? {
        store: {
          ...(storeId ? { id: storeId } : {}),
          ...(storeName ? { name: storeName } : {}),
          ...(storeAddress ? { address: storeAddress } : {}),
          ...(storeCity ? { city: storeCity } : {}),
          ...(state ? { state } : {}),
          ...(storeZip ? { zip: storeZip } : {}),
        },
      } : {}),
    },
    timing: {
      ...(observedAt ? { observedAt } : {}),
      ...(reportedAt ? { reportedAt } : {}),
      displayAt,
      ...(scheduledFor ? { scheduledFor } : {}),
      ...(text(input.expiresAt, input.expires_at) ? { expiresAt: text(input.expiresAt, input.expires_at)! } : {}),
    },
    evidence: {
      ...(summary ? { summary } : {}),
      photo: false,
      corroborationCount: 0,
      helpfulCount: 0,
      retailerReported,
      sourceBacked: true,
    },
    strength: signalStrength(input, type, scope),
    ...(signalAvailability(input, kind) ? { availability: signalAvailability(input, kind) } : {}),
    alertEligibility: { inventory: inventoryEligible, watch: watchEligible },
    actions: ["watch_bottle", ...(scope === "exact_store" ? ["watch_store" as const] : []), "helpful", "report"],
  };
}

export function normalizeMemberSightingSignal(sighting: MemberSighting): CanonicalSignal {
  const helpfulCount = Math.max(0, Math.floor(finiteNumber(sighting.upCount) || 0));
  const state = normalizeState(sighting.storeState);
  const displayAt = text(sighting.createdAt) || new Date(0).toISOString();
  const quantity = finiteNumber(sighting.quantityEstimate);
  const rawIdentity = sighting.reporterPublicIdentity;
  const identity = rawIdentity
    && (rawIdentity.kind === "founder" || rawIdentity.kind === "member")
    && Number.isSafeInteger(rawIdentity.number)
    && rawIdentity.number > 0
    ? { ...rawIdentity, label: `${rawIdentity.kind === "founder" ? "Founder" : "Member"} #${rawIdentity.number}` }
    : undefined;
  const customDisplayName = communityDisplayNameSeparateFromIdentity(identity?.displayName, identity?.label);
  const actor = identity ? {
    kind: identity.kind,
    number: identity.number,
    label: identity.label,
    ...(customDisplayName ? { displayName: customDisplayName } : {}),
  } : undefined;

  return {
    contractVersion: SIGNAL_CONTRACT_VERSION,
    id: prefixedId("member", sighting.id),
    kind: "availability",
    source: {
      type: "member",
      label: identity?.label || "Member",
      reportMode: sighting.sightingType === "online_social" ? "reported_online" : "seen_in_store",
      ...(actor ? { actor } : {}),
    },
    bottle: {
      ...(sighting.bottleId ? { id: sighting.bottleId } : {}),
      name: sighting.bottleName || "Unknown bottle",
      ...(signalRarity(sighting.rarityTier) ? { rarity: signalRarity(sighting.rarityTier) } : {}),
    },
    location: {
      scope: "exact_store",
      label: sighting.storeName,
      ...(state ? { state } : {}),
      store: {
        ...(sighting.storeId ? { id: sighting.storeId } : {}),
        ...(sighting.storeName ? { name: sighting.storeName } : {}),
        ...(sighting.storeAddress ? { address: sighting.storeAddress } : {}),
        ...(sighting.storeCity ? { city: sighting.storeCity } : {}),
        ...(state ? { state } : {}),
        ...(sighting.storeZip ? { zip: sighting.storeZip } : {}),
      },
    },
    timing: { reportedAt: displayAt, displayAt },
    evidence: {
      ...(sighting.notes ? { summary: sighting.notes } : {}),
      photo: false,
      corroborationCount: 0,
      helpfulCount,
      retailerReported: false,
      sourceBacked: false,
    },
    strength: "more_activity",
    availability: {
      status: "reported",
      ...(quantity === undefined ? {} : { quantity }),
      ...(sighting.quantityEstimate ? { quantityLabel: sighting.quantityEstimate } : {}),
      ...(typeof sighting.price === "number" && Number.isFinite(sighting.price) && sighting.price > 0 ? { price: sighting.price } : {}),
      caveat: sighting.sightingType === "online_social"
        ? "Reported online by a member; availability can change before arrival."
        : "Reported by a member; availability can change before arrival.",
    },
    alertEligibility: { inventory: false, watch: true },
    actions: ["watch_bottle", "watch_store", "confirm", "correct", "helpful", "report"],
  };
}

export function compareCanonicalSignalsNewestFirst(left: CanonicalSignal, right: CanonicalSignal) {
  const difference = Date.parse(right.timing.displayAt) - Date.parse(left.timing.displayAt);
  return Number.isFinite(difference) && difference !== 0 ? difference : left.id.localeCompare(right.id);
}

export function sortDropsByCanonicalSignalOrder<T extends Record<string, unknown>>(drops: T[]) {
  return drops
    .map((drop) => ({ drop, signal: normalizeDropSignal(drop) }))
    .sort((left, right) => compareCanonicalSignalsNewestFirst(left.signal, right.signal))
    .map(({ drop }) => drop);
}

export function buildCanonicalSignalFeed({
  drops,
  memberSightings,
  dropStatus = "ready",
  memberStatus = "ready",
}: {
  drops: CanonicalSignal[];
  memberSightings: CanonicalSignal[];
  dropStatus?: SignalSourceStatus;
  memberStatus?: SignalSourceStatus;
}): CanonicalSignalFeed {
  const byId = new Map<string, CanonicalSignal>();
  for (const signal of [...drops, ...memberSightings]) byId.set(signal.id, signal);
  const signals = [...byId.values()].sort(compareCanonicalSignalsNewestFirst);
  return {
    contractVersion: SIGNAL_CONTRACT_VERSION,
    signals,
    total: signals.length,
    sources: { drops: dropStatus, members: memberStatus },
  };
}
