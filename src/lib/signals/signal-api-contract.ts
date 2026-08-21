import type { CanonicalSignal, SignalSourceType } from "./signal-contract.ts";

export const SIGNAL_API_VERSION = "bourbon-signal/mobile-api@1" as const;
export const SIGNAL_API_ERROR_VERSION = "bourbon-signal/api-error@1" as const;

export type SignalApiErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CURSOR"
  | "CURSOR_RESET_REQUIRED"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SIGNAL_NOT_FOUND"
  | "ACTION_NOT_AVAILABLE"
  | "IDEMPOTENCY_CONFLICT"
  | "RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE";

export interface SignalApiErrorBody {
  contractVersion: typeof SIGNAL_API_ERROR_VERSION;
  error: {
    code: SignalApiErrorCode;
    message: string;
    retryable?: boolean;
  };
}

export interface PublicSignalIdentity {
  kind: "founder" | "member";
  number: number;
  label: string;
}

type SignalCreateStoreBase = { name: string; zip?: string };
export type SignalCreateStore = SignalCreateStoreBase & (
  | { id: string; address: string; city?: string; state?: string }
  | { id?: undefined; address?: string; city: string; state: string }
);

export interface SignalCreateInput {
  bottle: { id?: string; name: string };
  store: SignalCreateStore;
  reportMode: "seen_in_store" | "reported_online";
  quantityLabel?: string;
  price?: number;
  note?: string;
}

export type SignalActionInput = {
  action: "helpful" | "confirm" | "correct" | "no_longer_there";
};

export interface SignalCreateResponse {
  contractVersion: typeof SIGNAL_API_VERSION;
  created: boolean;
  duplicate: boolean;
  signal: CanonicalSignal;
}

export interface SignalDetailResponse {
  contractVersion: typeof SIGNAL_API_VERSION;
  signal: CanonicalSignal;
}

export interface SignalMemberProfileResponse {
  contractVersion: typeof SIGNAL_API_VERSION;
  profile: {
    identity: PublicSignalIdentity | null;
    membership: {
      tier: "free" | "standard" | "barrel" | "bottled-in-bond";
      label: string;
      paid: boolean;
      hasBetaAccess: boolean;
    };
    entitlements: {
      fullFeed: boolean;
      canSubmitSignals: boolean;
    };
  };
}

export function buildSignalMemberProfile(
  metadata: unknown,
  access: {
    tier: SignalMemberProfileResponse["profile"]["membership"]["tier"];
    label: string;
    hasBetaAccess: boolean;
    feedPreviewLimit: number | null;
    canSubmitSightings: boolean;
  },
): SignalMemberProfileResponse {
  return {
    contractVersion: SIGNAL_API_VERSION,
    profile: {
      identity: publicSignalIdentityFromMetadata(metadata) || null,
      membership: {
        tier: access.tier,
        label: access.label,
        paid: access.tier !== "free",
        hasBetaAccess: access.hasBetaAccess,
      },
      entitlements: {
        fullFeed: access.feedPreviewLimit === null,
        canSubmitSignals: access.canSubmitSightings,
      },
    },
  };
}

export interface SignalActionResponse {
  contractVersion: typeof SIGNAL_API_VERSION;
  signal: CanonicalSignal;
  action: { type: SignalActionInput["action"]; active: boolean };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function positiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function publicSignalIdentityFromMetadata(metadata: unknown): PublicSignalIdentity | undefined {
  const source = record(metadata);
  const founderNumber = positiveNumber(source.founderNumber);
  if (founderNumber) return { kind: "founder", number: founderNumber, label: `Founder #${founderNumber}` };
  const memberNumber = positiveNumber(source.memberNumber);
  return memberNumber ? { kind: "member", number: memberNumber, label: `Member #${memberNumber}` } : undefined;
}

export function signalIdParts(value: string): { source: SignalSourceType; rawId: string } | null {
  const separator = value.indexOf(":");
  if (separator < 1) return null;
  const source = value.slice(0, separator) as SignalSourceType;
  const rawId = value.slice(separator + 1).trim();
  if (!(["member", "retailer", "trusted_source", "release_source"] as string[]).includes(source) || !rawId || rawId.length > 240) return null;
  return { source, rawId };
}

function invalid(message: string) {
  return { ok: false as const, error: { code: "INVALID_REQUEST" as const, message } };
}

export function normalizeSignalCreateInput(input: unknown): { ok: true; value: SignalCreateInput } | ReturnType<typeof invalid> {
  const source = record(input);
  const bottleInput = record(source.bottle);
  const storeInput = record(source.store);
  const bottle = { id: text(bottleInput.id, 160) || undefined, name: text(bottleInput.name, 140) };
  const store = {
    id: text(storeInput.id, 160) || undefined,
    name: text(storeInput.name, 180),
    address: text(storeInput.address, 220) || undefined,
    city: text(storeInput.city, 120) || undefined,
    state: text(storeInput.state, 2).toUpperCase() || undefined,
    zip: text(storeInput.zip, 20) || undefined,
  };
  if (!bottle.name) return invalid("Bottle name is required.");
  if (!store.name) return invalid("Store name is required.");
  if (store.id && !store.address) return invalid("A matched store requires its street address.");
  if (!store.id && (!store.city || !store.state || !/^[A-Z]{2}$/.test(store.state))) return invalid("City and two-letter state are required for a new store.");
  if (store.state && !/^[A-Z]{2}$/.test(store.state)) return invalid("Store state must use a two-letter code.");
  const reportMode = source.reportMode === "reported_online" ? "reported_online" as const : source.reportMode === "seen_in_store" ? "seen_in_store" as const : null;
  if (!reportMode) return invalid("Report mode must be seen_in_store or reported_online.");
  const price = source.price === undefined || source.price === null || source.price === "" ? undefined : Number(source.price);
  if (price !== undefined && (!Number.isFinite(price) || price < 0 || price > 99999)) return invalid("Price must be between 0 and 99999.");
  return {
    ok: true,
    value: {
      bottle,
      store: store as SignalCreateStore,
      reportMode,
      ...(text(source.quantityLabel, 80) ? { quantityLabel: text(source.quantityLabel, 80) } : {}),
      ...(price === undefined ? {} : { price }),
      ...(text(source.note, 500) ? { note: text(source.note, 500) } : {}),
    },
  };
}

export function legacySightingPayloadFromCreate(input: SignalCreateInput) {
  const manualStore = !input.store.id;
  const manualBottle = !input.bottle.id;
  const storeKey = [input.store.name, input.store.city, input.store.state].filter(Boolean).join(" ").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    bottleName: input.bottle.name,
    ...(input.bottle.id ? { bottleId: input.bottle.id } : {}),
    storeId: input.store.id || `manual-store-${storeKey || "pending"}`,
    storeName: input.store.name,
    storeAddress: input.store.address || "",
    storeCity: input.store.city,
    storeState: input.store.state,
    storeZip: input.store.zip,
    quantityEstimate: input.quantityLabel,
    price: input.price ?? null,
    notes: input.note,
    source: "custom" as const,
    sightingType: input.reportMode === "reported_online" ? "online_social" as const : "seen_in_store" as const,
    reviewState: (manualBottle || manualStore) ? {
      needsBottleReview: manualBottle,
      needsStoreReview: manualStore,
      ...(manualBottle ? { manualBottleName: input.bottle.name } : {}),
      ...(manualStore ? {
        manualStoreName: input.store.name,
        manualStoreAddress: input.store.address,
        manualStoreCity: input.store.city,
        manualStoreState: input.store.state,
        manualStoreZip: input.store.zip,
      } : {}),
    } : undefined,
  };
}
