import { isFreshPublicDrop } from "./public-drop-evidence.ts";
import { isUserFacingDropSignal } from "./drop-feed-visibility.ts";

export type WelcomeLocalPreviewAccess = "eligible" | "active" | "expired" | "ineligible";

export type WelcomeLocalPreviewTargetStatus =
  | "covered"
  | "partially-covered"
  | "known-not-active"
  | "actively-monitored"
  | "known-expansion-candidate"
  | "not-found";

export type WelcomeLocalPreviewTargetScope = "store" | "city" | "board-or-county";

export interface WelcomeLocalPreviewTarget {
  kind: "city" | "store";
  stateCode: string;
  label: string;
  status: WelcomeLocalPreviewTargetStatus;
  city: string | null;
  address: string | null;
  areaLabel: string;
}

export interface WelcomeLocalPreviewCandidateTarget extends WelcomeLocalPreviewTarget {
  canonicalTargetKey: string;
  storeId: string | null;
  targetScope: WelcomeLocalPreviewTargetScope;
}

export interface WelcomeLocalPreviewSignal {
  timestamp?: string;
  last_confirmed_at?: string;
  observed_at?: string;
  event_at?: string;
  historical: boolean;
  signal_label?: string;
  rarity_tier?: string;
  brand_name?: string;
  tracked_brand_name?: string;
  canonical_name?: string;
  raw_name?: string;
  display_location?: string;
  store_name?: string;
  store_id?: string;
  store_address?: string;
  board_name?: string;
  locationName?: string;
  store_city?: string;
  store_county?: string;
  source?: string;
}

export interface WelcomeLocalPreviewRecord {
  userId: string;
  redeemedAt: string;
  expiresAt: string;
  target: WelcomeLocalPreviewTarget;
  recent: WelcomeLocalPreviewSignal[];
  earlier: WelcomeLocalPreviewSignal[];
}

export type WelcomeLocalPreviewPayload = Omit<WelcomeLocalPreviewRecord, "userId">;

const NEW_ACCOUNT_WINDOW_MS = 24 * 60 * 60_000;
const FUTURE_CLOCK_SKEW_MS = 5 * 60_000;
export const WELCOME_LOCAL_PREVIEW_DURATION_MS = 15 * 60_000;

const TARGET_STATUSES = new Set<WelcomeLocalPreviewTargetStatus>([
  "covered",
  "partially-covered",
  "known-not-active",
  "actively-monitored",
  "known-expansion-candidate",
  "not-found",
]);

function timestamp(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function publicText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function publicTimestamp(value: unknown) {
  const text = publicText(value);
  return text && Number.isFinite(Date.parse(text)) ? text : undefined;
}

function publicSource(drop: Record<string, unknown>) {
  const direct = publicText(drop.source);
  const value = direct || publicText(drop.sourceUrl ?? drop.source_url);
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.hostname ? url.hostname.replace(/^www\./, "") : undefined;
  } catch {
    // A plain source name is already the public label rendered by the card.
  }
  return direct;
}

export function toWelcomeLocalPreviewSignal(
  drop: Record<string, unknown> | WelcomeLocalPreviewSignal,
): WelcomeLocalPreviewSignal {
  const input = drop as unknown as Record<string, unknown>;
  const signal: WelcomeLocalPreviewSignal = { historical: input.historical === true };
  const allowedTextFields = [
    "signal_label",
    "rarity_tier",
    "brand_name",
    "tracked_brand_name",
    "canonical_name",
    "raw_name",
    "display_location",
    "store_name",
    "store_id",
    "store_address",
    "board_name",
    "locationName",
    "store_city",
    "store_county",
  ] as const;
  const allowedTimestampFields = ["timestamp", "last_confirmed_at", "observed_at", "event_at"] as const;

  for (const field of allowedTextFields) {
    const value = publicText(input[field]);
    if (value) signal[field] = value;
  }
  for (const field of allowedTimestampFields) {
    const value = publicTimestamp(input[field]);
    if (value) signal[field] = value;
  }
  const source = publicSource(input);
  if (source) signal.source = source;
  return signal;
}

export function toWelcomeLocalPreviewTarget(
  target: WelcomeLocalPreviewTarget | WelcomeLocalPreviewCandidateTarget | Record<string, unknown>,
): WelcomeLocalPreviewTarget {
  const status = TARGET_STATUSES.has(target.status as WelcomeLocalPreviewTargetStatus)
    ? target.status as WelcomeLocalPreviewTargetStatus
    : "not-found";
  return {
    kind: target.kind === "store" ? "store" : "city",
    stateCode: String(target.stateCode || "").trim().toUpperCase(),
    label: publicText(target.label) || "Local area",
    status,
    city: publicText(target.city) || null,
    address: publicText(target.address) || null,
    areaLabel: publicText(target.areaLabel) || publicText(target.city) || publicText(target.label) || "Local area",
  };
}

export function toWelcomeLocalPreviewPayload(
  record: WelcomeLocalPreviewRecord,
  includeSignals: boolean,
): WelcomeLocalPreviewPayload {
  return {
    redeemedAt: record.redeemedAt,
    expiresAt: record.expiresAt,
    target: toWelcomeLocalPreviewTarget(record.target),
    recent: includeSignals ? record.recent.map((drop) => toWelcomeLocalPreviewSignal(drop)) : [],
    earlier: includeSignals ? record.earlier.map((drop) => toWelcomeLocalPreviewSignal(drop)) : [],
  };
}

export function toStoredWelcomeLocalPreviewRecord(record: WelcomeLocalPreviewRecord): WelcomeLocalPreviewRecord {
  return {
    userId: record.userId,
    redeemedAt: record.redeemedAt,
    expiresAt: record.expiresAt,
    target: toWelcomeLocalPreviewTarget(record.target),
    recent: record.recent.map((drop) => toWelcomeLocalPreviewSignal(drop)),
    earlier: record.earlier.map((drop) => toWelcomeLocalPreviewSignal(drop)),
  };
}

export function welcomeLocalPreviewAccess(input: {
  createdAt: unknown;
  record: WelcomeLocalPreviewRecord | null;
  now?: number;
}): WelcomeLocalPreviewAccess {
  const now = input.now ?? Date.now();
  if (input.record) {
    const expiresAt = timestamp(input.record.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt > now ? "active" : "expired";
  }
  const createdAt = timestamp(input.createdAt);
  if (!Number.isFinite(createdAt)) return "ineligible";
  const age = now - createdAt;
  return age >= -FUTURE_CLOCK_SKEW_MS && age <= NEW_ACCOUNT_WINDOW_MS ? "eligible" : "ineligible";
}

export function welcomeLocalPreviewRemainingMs(record: WelcomeLocalPreviewRecord | null, now = Date.now()) {
  if (!record) return 0;
  const expiresAt = timestamp(record.expiresAt);
  if (!Number.isFinite(expiresAt)) return 0;
  return Math.max(0, Math.min(WELCOME_LOCAL_PREVIEW_DURATION_MS, expiresAt - now));
}

function token(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function welcomeLocalPreviewSignalLocation(signal: WelcomeLocalPreviewSignal, stateName: string) {
  const storeName = publicText(signal.store_name);
  if (storeName) return storeName;
  const storeId = publicText(signal.store_id);
  if (storeId) return `${stateName}${stateName === "Virginia" ? " ABC" : ""} Store ${storeId}`;
  return publicText(signal.board_name)
    || publicText(signal.locationName)
    || publicText(signal.display_location)
    || publicText(signal.store_city)
    || publicText(signal.store_county)
    || stateName;
}

export function welcomeLocalPreviewSignalDetails(signal: WelcomeLocalPreviewSignal) {
  const primary = token(welcomeLocalPreviewSignalLocation(signal, ""));
  const values = [signal.store_address, signal.store_city, signal.store_county]
    .map((value) => publicText(value))
    .filter((value): value is string => Boolean(value));
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = token(value);
    if (!key || key === primary || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function welcomeLocalPreviewTargetDetails(target: WelcomeLocalPreviewTarget) {
  const label = token(target.label);
  const candidates = target.address ? [target.address, target.areaLabel] : [target.city, target.areaLabel];
  const seen = new Set<string>();
  return candidates.filter((value): value is string => {
    const key = token(value);
    if (!key || key === label || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dropState(drop: Record<string, unknown>) {
  return String(drop.state || drop.state_code || drop.stateCode || "").trim().toUpperCase();
}

function dropStoreIds(drop: Record<string, unknown>) {
  return [drop.store_id, drop.storeId, drop.source_store_id, drop.sourceStoreId]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
}

export function welcomeLocalPreviewTargetScope(input: {
  kind: "city" | "store";
  label: string;
  canonicalTargetKey: string;
}): WelcomeLocalPreviewTargetScope {
  if (input.kind === "store") return "store";
  const canonicalScope = String(input.canonicalTargetKey || "").split(":", 1)[0].toLowerCase();
  if (canonicalScope === "board" || canonicalScope === "county" || canonicalScope === "control-area") {
    return "board-or-county";
  }
  const label = token(input.label);
  return /\b(?:abc|board|commission|county|control area)\b/.test(label)
    ? "board-or-county"
    : "city";
}

function exactStoreIdentityMatches(target: WelcomeLocalPreviewCandidateTarget, drop: Record<string, unknown>) {
  const storeId = String(target.storeId || "").trim().toLowerCase();
  if (storeId && dropStoreIds(drop).includes(storeId)) return true;

  const city = token(target.city);
  const dropCity = token(drop.store_city || drop.storeCity || drop.city);
  const address = token(target.address);
  const dropAddress = token(drop.store_address || drop.storeAddress || drop.address || drop.source_address);
  if (address && dropAddress && address === dropAddress && city && city === dropCity) return true;

  const label = token(target.label);
  const dropLabel = token(drop.store_name || drop.storeName || drop.store || drop.location_name);
  return Boolean(label && city && label === dropLabel && city === dropCity);
}

function validStoreMonitoringEvidence(drop: Record<string, unknown>, now: number) {
  const precision = token(drop.location_precision || drop.locationPrecision);
  const type = token(drop.event_type || drop.type);
  const category = token(drop.signal_category || drop.signalCategory);
  const scope = token(drop.availability_scope || drop.availabilityScope);
  const stale = drop.sourceStale === true || drop.source_stale === true || drop.stale === true;
  const nonInventory = /\b(shipment|delivery|allocation|release|scheduled|drawing|lottery)\b/.test(`${type} ${category}`);
  const inventory = drop.can_alert_as_inventory === true
    || drop.canAlertAsInventory === true
    || category === "inventory"
    || scope === "store reported"
    || type.includes("in stock")
    || type.includes("inventory result");
  return precision === "store level"
    && inventory
    && !nonInventory
    && !stale
    && isUserFacingDropSignal(drop)
    && isFreshPublicDrop(drop, now);
}

function inactiveStoreStatus(status: WelcomeLocalPreviewTargetStatus): WelcomeLocalPreviewTargetStatus {
  if (status === "known-not-active" || status === "not-found") return status;
  return "known-expansion-candidate";
}

export function resolveWelcomeLocalPreviewTarget(
  target: WelcomeLocalPreviewCandidateTarget,
  drops: readonly Record<string, unknown>[],
  now = Date.now(),
): WelcomeLocalPreviewCandidateTarget {
  if (target.kind !== "store") return target;
  const hasExactEvidence = drops.some((drop) => (
    dropState(drop) === target.stateCode.toUpperCase()
    && exactStoreIdentityMatches(target, drop)
    && validStoreMonitoringEvidence(drop, now)
  ));
  return {
    ...target,
    status: hasExactEvidence ? "actively-monitored" : inactiveStoreStatus(target.status),
  };
}

function normalizedFields(drop: Record<string, unknown>, names: readonly string[]) {
  return names.map((name) => token(drop[name])).filter(Boolean);
}

function matchesTarget(
  target: WelcomeLocalPreviewTarget | WelcomeLocalPreviewCandidateTarget,
  drop: Record<string, unknown>,
) {
  if (dropState(drop) !== target.stateCode.toUpperCase()) return false;
  const cityFields = normalizedFields(drop, ["store_city", "storeCity", "city"]);
  const boardCountyFields = normalizedFields(drop, [
    "board_name",
    "boardName",
    "store_county",
    "storeCounty",
    "county",
    "control_area",
    "controlArea",
  ]);
  const city = token(target.city);
  const area = token(target.areaLabel || target.label);

  if (target.kind === "store") return Boolean(city && cityFields.includes(city));
  const targetScope = "targetScope" in target ? target.targetScope : "city";
  if (targetScope === "board-or-county") return Boolean(area && boardCountyFields.includes(area));
  return Boolean(city && cityFields.includes(city));
}

function dropTime(drop: Record<string, unknown>) {
  const values = [drop.last_confirmed_at, drop.observed_at, drop.event_at, drop.timestamp];
  for (const value of values) {
    const parsed = timestamp(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function buildWelcomeLocalPreviewSnapshot(input: {
  target: WelcomeLocalPreviewTarget | WelcomeLocalPreviewCandidateTarget;
  drops: readonly Record<string, unknown>[];
}) {
  const matching = input.drops
    .filter((drop) => matchesTarget(input.target, drop))
    .sort((left, right) => dropTime(right) - dropTime(left));
  const recent = matching.filter((drop) => drop.historical !== true).slice(0, 5);
  const recentSet = new Set(recent);
  const earlier = matching.filter((drop) => !recentSet.has(drop)).slice(0, 10);
  return {
    recent: recent.map((drop) => toWelcomeLocalPreviewSignal(drop)),
    earlier: earlier.map((drop) => toWelcomeLocalPreviewSignal(drop)),
  };
}

export function retargetWelcomeLocalPreviewRecord(
  existing: WelcomeLocalPreviewRecord,
  snapshot: Pick<WelcomeLocalPreviewRecord, "target" | "recent" | "earlier">,
): WelcomeLocalPreviewRecord {
  return {
    userId: existing.userId,
    redeemedAt: existing.redeemedAt,
    expiresAt: existing.expiresAt,
    target: snapshot.target,
    recent: snapshot.recent,
    earlier: snapshot.earlier,
  };
}
