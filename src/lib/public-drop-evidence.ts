import { dropFreshnessTime } from "./drop-feed-policy.ts";
import { isUserFacingDropSignal } from "./drop-feed-visibility.ts";
import { resolveDropQuantitySemantics } from "./drop-quantity-semantics.ts";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_INVENTORY_DROP_AGE_MS = 72 * HOUR_MS;
const MAX_OH_STALE_FEED_AGE_MS = 14 * DAY_MS;
const MAX_DELIVERY_DROP_AGE_MS = 14 * DAY_MS;
const MAX_CONTEXT_DROP_AGE_MS = 30 * DAY_MS;
const FUTURE_CLOCK_SKEW_MS = 15 * 60 * 1000;
const DROP_FEED_TIERS = new Set(["unicorn", "highly_allocated", "allocated", "limited"]);

export type PublicDropEvidenceInput = Record<string, unknown>;

/**
 * Eligibility shared by the default customer Drop Feed and the Coverage contract.
 * `include=all` may expose additional paid/history rows, but those rows cannot
 * inflate coverage depth or current-availability claims.
 */
export interface PublicDropEligibilityOptions {
  degradedStateCodes?: ReadonlySet<string>;
}

/** A canonical store identity component derived from public exact-store evidence. */
export interface PublicDropStoreEvidence {
  id: string;
  name: string;
  address: string;
  city: string;
  county: string;
  /** Source-qualified stable ID, when the row provides one. */
  sourceIdKey: string;
  /** Normalized state-qualified address, when present. */
  addressKey: string;
  /** All source-qualified IDs and normalized addresses in this component. */
  keys: string[];
}

export interface StatePublicDropEvidence {
  observedInventoryStores: PublicDropStoreEvidence[];
  currentInventoryStores: PublicDropStoreEvidence[];
  alertableInventoryStores: PublicDropStoreEvidence[];
  observedInventoryCities: number;
  currentInventoryCities: number;
  staleInventoryStoreCount: number;
  /** Eligible public rows fresh enough for the default customer feed. */
  freshPublicSignalCount: number;
  /** Fresh public rows that are useful updates but not exact-store inventory claims. */
  freshPublicUpdateSignalCount: number;
  freshPublicUpdateBoards: number;
  freshPublicUpdateStores: number;
  freshPublicUpdateCities: number;
  freshPublicUpdateAreas: number;
  /** Internal keys used to keep search results aligned with current feed scope. */
  freshPublicUpdateAreaKeys: string[];
  freshStoreEquivalentShipmentBoards: number;
  /** Eligible customer-facing rows retained only as historical/audit evidence. */
  stalePublicSignalCount: number;
}

interface ExactStoreNode {
  store: PublicDropStoreEvidence;
  current: boolean;
  alertable: boolean;
}

interface StateEvidenceBucket {
  nodes: ExactStoreNode[];
  freshPublicSignalCount: number;
  freshPublicUpdateSignalCount: number;
  stalePublicSignalCount: number;
  freshPublicUpdateBoards: Set<string>;
  freshPublicUpdateStores: Set<string>;
  freshPublicUpdateCities: Set<string>;
  freshPublicUpdateAreas: Set<string>;
  freshStoreEquivalentShipmentBoards: Set<string>;
}

function text(value: unknown, maxLength = 240) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function token(value: unknown, maxLength = 180) {
  return text(value, maxLength)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
}

function compactIdentityToken(normalized: string, maxLength: number) {
  if (normalized.length <= maxLength) return normalized;
  let firstHash = 2166136261;
  let secondHash = 0x9e3779b9;
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    firstHash = Math.imul(firstHash ^ code, 16777619);
    secondHash = Math.imul(secondHash ^ code, 0x85ebca6b);
  }
  const suffix = `${(firstHash >>> 0).toString(36)}${(secondHash >>> 0).toString(36)}`;
  return `${normalized.slice(0, Math.max(1, maxLength - suffix.length - 1))}-${suffix}`;
}

function identityToken(value: unknown, maxLength: number) {
  return compactIdentityToken(token(value, 320), maxLength);
}

const IDENTITY_PLACEHOLDERS = new Set([
  "unknown",
  "none",
  "n-a",
  "na",
  "not-available",
  "unavailable",
  "not-applicable",
  "notprovided",
  "not-provided",
  "null",
  "nil",
  "placeholder",
  "tbd",
]);
const IDENTITY_PLACEHOLDER_SEGMENT = /(?:^|-)(?:unknown|none|n-a|na|not-available|unavailable|not-applicable|not-provided|null|nil|placeholder|tbd)(?:-|$)/;

function usableIdentityToken(value: unknown, maxLength: number) {
  const normalized = identityToken(value, maxLength);
  return normalized && !IDENTITY_PLACEHOLDERS.has(normalized) && !IDENTITY_PLACEHOLDER_SEGMENT.test(normalized)
    ? normalized
    : "";
}

function usableCityToken(value: unknown) {
  const normalized = usableIdentityToken(value, 36);
  return /[a-z]/.test(normalized) ? normalized : "";
}

function addressToken(value: unknown, maxLength = 220) {
  return token(value, maxLength)
    .replace(/(^|-)(north|n)(?=-|$)/g, "$1n")
    .replace(/(^|-)(south|s)(?=-|$)/g, "$1s")
    .replace(/(^|-)(east|e)(?=-|$)/g, "$1e")
    .replace(/(^|-)(west|w)(?=-|$)/g, "$1w")
    .replace(/(^|-)(street|st)(?=-|$)/g, "$1st")
    .replace(/(^|-)(road|rd)(?=-|$)/g, "$1rd")
    .replace(/(^|-)(avenue|ave)(?=-|$)/g, "$1ave")
    .replace(/(^|-)(boulevard|blvd)(?=-|$)/g, "$1blvd")
    .replace(/(^|-)(drive|dr)(?=-|$)/g, "$1dr")
    .replace(/(^|-)(lane|ln)(?=-|$)/g, "$1ln")
    .replace(/(^|-)(court|ct)(?=-|$)/g, "$1ct");
}

function streetAddressToken(value: unknown) {
  const withoutTrailingLocality = text(value, 300)
    .replace(/,\s*[^,]+,\s*[A-Z]{2}(?:\s*,?\s*\d{5}(?:-\d{4})?)?\s*$/i, "");
  return addressToken(withoutTrailingLocality, 300);
}

function usableStreetAddressToken(value: unknown) {
  const raw = text(value, 300);
  if (!/^\s*\d{1,6}(?:-\d{1,6})?\b/.test(raw)) return "";
  const normalized = streetAddressToken(raw);
  const streetPart = normalized.replace(/^\d{1,6}(?:-\d{1,6})?-?/, "");
  if (!/[a-z]/.test(streetPart)) return "";
  return normalized && !IDENTITY_PLACEHOLDERS.has(normalized) && !IDENTITY_PLACEHOLDER_SEGMENT.test(normalized)
    ? normalized
    : "";
}

export function publicEvidenceStateCode(value: unknown) {
  const raw = text(value, 64).toUpperCase();
  const match = /^([A-Z]{2})(?:[-_].*)?$/.exec(raw);
  return match?.[1] || "";
}

export function publicEvidenceSourceStoreIdKey(stateValue: unknown, sourceValue: unknown, storeIdValue: unknown) {
  const state = publicEvidenceStateCode(stateValue);
  const source = usableIdentityToken(sourceValue, 56);
  const storeId = usableIdentityToken(storeIdValue, 76);
  return state && source && storeId ? `${state}:source:${source}:id:${storeId}` : "";
}

export function publicEvidenceAddressKey(stateValue: unknown, addressValue: unknown, cityValue?: unknown) {
  const state = publicEvidenceStateCode(stateValue);
  const normalizedAddress = usableStreetAddressToken(addressValue);
  const address = compactIdentityToken(normalizedAddress, 86);
  const city = usableCityToken(cityValue);
  return state && address && city ? `${state}:address:${address}:city:${city}` : "";
}

/**
 * A Next-free projection of the fields that affect public evidence. The full
 * site normalizer may add display/copy fields, but Coverage, its audit, and the
 * default Feed eligibility gate must agree on this smaller factual shape.
 */
export function normalizePublicDropEvidenceInput(input: PublicDropEvidenceInput): PublicDropEvidenceInput {
  const state = publicEvidenceStateCode(input.state ?? input.state_code ?? input.stateCode);
  const type = text(input.type ?? input.event_type, 160);
  const source = text(input.source ?? input.sourceName ?? input.source_name, 180);
  const locationPrecision = text(input.locationPrecision ?? input.location_precision, 120);
  const storeId = text(input.storeId ?? input.store_id, 180);
  const storeName = text(input.storeName ?? input.store_name, 180);
  const storeAddress = text(input.storeAddress ?? input.store_address, 240);
  const storeCity = text(input.city ?? input.store_city, 120) || cityFromAddress(storeAddress);
  const storeCounty = text(input.county ?? input.store_county, 120);
  const tier = text(input.rarity_tier ?? input.tier, 80).toLowerCase();
  const sourceIsStale = input.sourceStale === true || input.source_stale === true || input.stale === true;
  const canAlertAsInventory = input.canAlertAsInventory === true || input.can_alert_as_inventory === true;
  const quantitySemantics = resolveDropQuantitySemantics({
    type,
    event_type: type,
    quantity: input.quantity,
    boardShipmentQuantity: input.boardShipmentQuantity,
    quantity_shipped: input.quantity_shipped,
  });
  const isBoardShipment = type.toLowerCase() === "nc_board_shipment_snapshot";
  const rawQuantity = Number(input.quantity);
  const hasPrimaryQuantity = Number.isFinite(rawQuantity);
  const inventoryQuantity = hasPrimaryQuantity ? rawQuantity : quantitySemantics.inventoryQuantity;
  const observedAt = text(input.observedAt ?? input.observed_at, 80);
  const lastConfirmedAt = text(input.lastConfirmedAt ?? input.last_confirmed_at, 80) || observedAt;
  const eventAt = text(input.eventAt ?? input.event_at, 80);
  const firstSeenAt = text(input.firstSeenAt ?? input.first_seen_at, 80);

  return {
    ...input,
    state,
    stateCode: state,
    state_code: state,
    type,
    event_type: type,
    source,
    sourceName: source,
    locationPrecision,
    location_precision: locationPrecision,
    storeId: storeId || undefined,
    store_id: storeId || undefined,
    storeName: storeName || undefined,
    store_name: storeName || undefined,
    storeAddress: storeAddress || undefined,
    store_address: storeAddress || undefined,
    city: storeCity || undefined,
    store_city: storeCity || undefined,
    county: storeCounty || undefined,
    store_county: storeCounty || undefined,
    tier: tier || undefined,
    rarity_tier: tier || undefined,
    sourceStale: sourceIsStale,
    source_stale: sourceIsStale,
    stale: sourceIsStale,
    canAlertAsInventory,
    can_alert_as_inventory: canAlertAsInventory,
    // Preserve a missing primary quantity so existing visibility code can use
    // valid quantity_in_stock/storeQty fallbacks instead of seeing a false 0.
    quantity: isBoardShipment || !hasPrimaryQuantity ? undefined : inventoryQuantity,
    quantity_shipped: isBoardShipment ? quantitySemantics.shipmentQuantity || undefined : input.quantity_shipped,
    boardShipmentQuantity: isBoardShipment ? quantitySemantics.shipmentQuantity || undefined : input.boardShipmentQuantity,
    observedAt: observedAt || undefined,
    observed_at: observedAt || undefined,
    lastConfirmedAt: lastConfirmedAt || undefined,
    last_confirmed_at: lastConfirmedAt || undefined,
    eventAt: eventAt || undefined,
    event_at: eventAt || undefined,
    firstSeenAt: firstSeenAt || undefined,
    first_seen_at: firstSeenAt || undefined,
  };
}

function stateCode(drop: PublicDropEvidenceInput) {
  return publicEvidenceStateCode(drop.state ?? drop.state_code ?? drop.stateCode);
}

function sourceStale(drop: PublicDropEvidenceInput) {
  return drop.sourceStale === true || drop.source_stale === true || drop.stale === true;
}

function isVerifiedRetailerDrop(drop: PublicDropEvidenceInput) {
  return drop.source === "verified-retailer" && drop.retailerReported === true;
}

export function publicDropRarityTier(drop: PublicDropEvidenceInput) {
  return text(drop.rarity_tier ?? drop.tier, 80).toLowerCase();
}

function normalizedDropText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isKnownFalseRareMatch(drop: PublicDropEvidenceInput) {
  const raw = normalizedDropText(drop.rawName ?? drop.raw_name ?? drop.bottleName ?? drop.brand_name ?? drop.canonicalName);
  if (/\bfour roses\b/.test(raw) && /\b(small batch|small batch select|single barrel)\b/.test(raw)) {
    const hasRareModifier = /\b(limited edition|limited release|le|barrel strength|cask strength|private selection|private barrel|single barrel select|oes[foqkv]|obs[foqkv])\b/.test(raw);
    return !hasRareModifier;
  }
  return false;
}

function isBlockedWarehouseDrop(drop: PublicDropEvidenceInput) {
  const state = stateCode(drop);
  const type = text(drop.event_type ?? drop.type, 160).toLowerCase();
  const scope = text(drop.availability_scope ?? drop.availabilityScope, 120).toLowerCase();
  return state === "NC" && (type === "nc_statewide_warehouse_stock" || scope === "warehouse");
}

/**
 * The default Drop Feed's visibility contract. This intentionally does not
 * perform freshness filtering so historical rows remain measurable, but a row
 * outside this gate can never establish Coverage depth/currentness.
 */
export function isPublicDropFeedEligible(
  input: PublicDropEvidenceInput,
  options: PublicDropEligibilityOptions = {},
) {
  const drop = normalizePublicDropEvidenceInput(input);
  const state = stateCode(drop);
  if (!state || options.degradedStateCodes?.has(state)) return false;
  const retailer = isVerifiedRetailerDrop(drop);
  if (!retailer && !isUserFacingDropSignal(drop)) return false;
  if (isBlockedWarehouseDrop(drop)) return false;
  return retailer || (DROP_FEED_TIERS.has(publicDropRarityTier(drop)) && !isKnownFalseRareMatch(drop));
}

function inventoryLike(drop: PublicDropEvidenceInput) {
  const type = text(drop.event_type ?? drop.type, 120).toLowerCase();
  const category = text(drop.signal_category ?? drop.signalCategory, 120).toLowerCase();
  const scope = text(drop.availability_scope ?? drop.availabilityScope, 120).toLowerCase();
  const isNonInventoryLead = /shipment|delivery|allocation|release|scheduled|drawing|lottery/.test(type)
    || /delivery|shipment|allocation|release|scheduled|drawing|lottery/.test(category);
  if (isNonInventoryLead) return false;
  return drop.can_alert_as_inventory === true
    || drop.canAlertAsInventory === true
    || category === "inventory"
    || scope === "store_reported"
    || type.includes("in_stock")
    || type.includes("inventory_result");
}

function cityFromAddress(address: string) {
  const match = /,\s*([^,]+),\s*[A-Z]{2}(?:\s*,?\s*\d{5}(?:-\d{4})?)?\s*$/i.exec(address);
  return text(match?.[1], 120);
}

function exactStoreInventoryCandidate(drop: PublicDropEvidenceInput) {
  const type = text(drop.event_type ?? drop.type, 120).toLowerCase();
  const precision = text(drop.location_precision ?? drop.locationPrecision, 120).toLowerCase();
  const source = text(drop.source ?? drop.sourceName ?? drop.source_name, 160);
  const storeId = text(drop.store_id ?? drop.storeId, 180);
  const address = text(drop.store_address ?? drop.storeAddress, 240);
  const city = text(drop.store_city ?? drop.city, 120) || cityFromAddress(address);
  const state = stateCode(drop);
  const hasStoreIdentity = Boolean(
    publicEvidenceSourceStoreIdKey(state, source, storeId)
    || publicEvidenceAddressKey(state, address, city),
  );
  if (precision !== "store_level" || !hasStoreIdentity || !inventoryLike(drop)) return false;
  if (type.includes("out_of_stock") || type.includes("out-of-stock")) return false;
  return isVerifiedRetailerDrop(drop) || isUserFacingDropSignal(drop);
}

function dropStoreEvidence(drop: PublicDropEvidenceInput): PublicDropStoreEvidence | null {
  const state = stateCode(drop);
  if (!state) return null;
  const sourceId = text(drop.store_id ?? drop.storeId, 180);
  const name = text(drop.store_name ?? drop.storeName, 180);
  const address = text(drop.store_address ?? drop.storeAddress, 240);
  const city = text(drop.store_city ?? drop.city, 120) || cityFromAddress(address);
  const county = text(drop.store_county ?? drop.county, 120);
  const sourceIdKey = publicEvidenceSourceStoreIdKey(state, drop.source ?? drop.sourceName ?? drop.source_name, sourceId);
  const addressKey = publicEvidenceAddressKey(state, address, city);
  const keys = [sourceIdKey, addressKey].filter(Boolean);
  if (!keys.length) return null;
  return {
    id: sourceId || addressKey,
    name,
    address,
    city,
    county,
    sourceIdKey,
    addressKey,
    keys,
  };
}

function mergeStoreEvidence(existing: PublicDropStoreEvidence, incoming: PublicDropStoreEvidence): PublicDropStoreEvidence {
  const prefersIncomingId = !existing.sourceIdKey && Boolean(incoming.sourceIdKey);
  return {
    id: prefersIncomingId ? incoming.id : existing.id || incoming.id,
    name: existing.name || incoming.name,
    address: existing.address || incoming.address,
    city: existing.city || incoming.city,
    county: existing.county || incoming.county,
    sourceIdKey: existing.sourceIdKey || incoming.sourceIdKey,
    addressKey: existing.addressKey || incoming.addressKey,
    keys: Array.from(new Set([...existing.keys, ...incoming.keys])),
  };
}

function identityKeys(store: PublicDropStoreEvidence) {
  return [store.sourceIdKey, store.addressKey].filter(Boolean);
}

/**
 * A shared source ID is strong only when it does not disagree with another
 * usable address. A shared city-scoped street address is itself strong across
 * sources. Rejecting a conflicting direct edge prevents a stale/malformed row
 * from becoming a transitive bridge between two different premises.
 */
function ambiguousSourceIdKeys(nodes: readonly ExactStoreNode[]) {
  const addressesBySource = new Map<string, Set<string>>();
  for (const node of nodes) {
    if (!node.store.sourceIdKey || !node.store.addressKey) continue;
    const addresses = addressesBySource.get(node.store.sourceIdKey) || new Set<string>();
    addresses.add(node.store.addressKey);
    addressesBySource.set(node.store.sourceIdKey, addresses);
  }
  return new Set(
    Array.from(addressesBySource, ([sourceIdKey, addresses]) => addresses.size > 1 ? sourceIdKey : null)
      .filter((sourceIdKey): sourceIdKey is string => Boolean(sourceIdKey)),
  );
}

function shouldMergeStoreEvidence(
  left: PublicDropStoreEvidence,
  right: PublicDropStoreEvidence,
  ambiguousSourceIds: ReadonlySet<string>,
) {
  const sameAddress = Boolean(left.addressKey && left.addressKey === right.addressKey);
  if (sameAddress) return true;
  const sameSourceId = Boolean(left.sourceIdKey && left.sourceIdKey === right.sourceIdKey);
  if (!sameSourceId) return false;
  // Once a source ID maps to more than one validated premise, an address-less
  // row is not enough to bridge those premises or transfer currentness.
  if (left.sourceIdKey && ambiguousSourceIds.has(left.sourceIdKey)) return false;
  return !(left.addressKey && right.addressKey && left.addressKey !== right.addressKey);
}

function componentize(nodes: readonly ExactStoreNode[]) {
  const ambiguousSourceIds = ambiguousSourceIdKeys(nodes);
  // Fail closed: after source-ID ambiguity is detected, an address-less row
  // cannot be attributed safely to either physical premise.
  const safeNodes = nodes.filter((node) => !(
    node.store.sourceIdKey
    && ambiguousSourceIds.has(node.store.sourceIdKey)
    && !node.store.addressKey
  ));
  const parent = safeNodes.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const join = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };
  const indexByIdentity = new Map<string, number[]>();

  safeNodes.forEach((node, index) => {
    const candidates = new Set<number>();
    for (const key of identityKeys(node.store)) {
      for (const candidate of indexByIdentity.get(key) || []) candidates.add(candidate);
    }
    for (const candidate of candidates) {
      if (shouldMergeStoreEvidence(node.store, safeNodes[candidate].store, ambiguousSourceIds)) join(index, candidate);
    }
    for (const key of identityKeys(node.store)) {
      const entries = indexByIdentity.get(key) || [];
      entries.push(index);
      indexByIdentity.set(key, entries);
    }
  });

  const components = new Map<number, { store: PublicDropStoreEvidence; current: boolean; alertable: boolean }>();
  safeNodes.forEach((node, index) => {
    const root = find(index);
    const existing = components.get(root);
    if (!existing) {
      components.set(root, { store: node.store, current: node.current, alertable: node.alertable });
      return;
    }
    components.set(root, {
      store: mergeStoreEvidence(existing.store, node.store),
      current: existing.current || node.current,
      alertable: existing.alertable || node.alertable,
    });
  });
  return Array.from(components.values());
}

function maxAgeForPublicDrop(drop: PublicDropEvidenceInput) {
  const type = text(drop.event_type ?? drop.type, 120).toLowerCase();
  const category = text(drop.signal_category ?? drop.signalCategory, 120).toLowerCase();
  const scope = text(drop.availability_scope ?? drop.availabilityScope, 120).toLowerCase();
  const precision = text(drop.location_precision ?? drop.locationPrecision, 120).toLowerCase();
  const canAlert = drop.can_alert_as_inventory === true || drop.canAlertAsInventory === true;

  if (stateCode(drop) === "OH" && sourceStale(drop)) return MAX_OH_STALE_FEED_AGE_MS;
  if (category === "delivery" || /shipment|delivery|allocation_snapshot/.test(type)) return MAX_DELIVERY_DROP_AGE_MS;
  if (canAlert || category === "inventory" || scope === "store_reported" || precision === "store_level" || type.includes("in_stock") || type.includes("inventory_result")) {
    return MAX_INVENTORY_DROP_AGE_MS;
  }
  return MAX_CONTEXT_DROP_AGE_MS;
}

function asTimestamp(value: string | number | Date | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : Date.now();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

/** Uses the exact age window shared by the customer drop feed. */
export function isFreshPublicDrop(input: PublicDropEvidenceInput, asOf?: string | number | Date) {
  const drop = normalizePublicDropEvidenceInput(input);
  const now = asTimestamp(asOf);
  if (isVerifiedRetailerDrop(drop)) {
    const expiresAt = Date.parse(String(drop.expiresAt ?? ""));
    if (drop.retailerSignalState === "upcoming") {
      const eventAt = Date.parse(String(drop.eventDate ?? drop.startsAt ?? drop.expiresAt ?? ""));
      return Number.isFinite(eventAt) && eventAt > now;
    }
    return Number.isFinite(expiresAt) && expiresAt > now;
  }
  const timestamp = dropFreshnessTime(drop);
  if (!Number.isFinite(timestamp)) return false;
  if (timestamp > now + FUTURE_CLOCK_SKEW_MS) return false;
  return now - timestamp <= maxAgeForPublicDrop(drop);
}

function publicUpdateBoardKey(drop: PublicDropEvidenceInput) {
  const type = text(drop.event_type ?? drop.type, 160).toLowerCase();
  const precision = text(drop.location_precision ?? drop.locationPrecision, 120).toLowerCase();
  const scope = text(drop.availability_scope ?? drop.availabilityScope, 120).toLowerCase();
  if (!/board/.test(`${type} ${precision} ${scope}`)) return "";
  const label = text(drop.board_name ?? drop.boardName ?? drop.locationName ?? drop.location_name ?? drop.store_name ?? drop.storeName, 180);
  return label ? `board:${token(label, 160)}` : "";
}

function isSingleStoreShipmentBoard(drop: PublicDropEvidenceInput) {
  const precision = text(drop.location_precision ?? drop.locationPrecision, 120).toLowerCase();
  const scope = text(drop.availability_scope ?? drop.availabilityScope, 120).toLowerCase();
  return precision === "store_equivalent_shipment" || scope === "store_equivalent_shipment";
}

function addFreshPublicUpdateScope(bucket: StateEvidenceBucket, drop: PublicDropEvidenceInput) {
  bucket.freshPublicUpdateSignalCount += 1;
  const board = publicUpdateBoardKey(drop);
  if (board) {
    bucket.freshPublicUpdateBoards.add(board);
    bucket.freshPublicUpdateAreas.add(board);
    if (isSingleStoreShipmentBoard(drop)) bucket.freshStoreEquivalentShipmentBoards.add(board);
  }

  const store = dropStoreEvidence(drop);
  if (store) bucket.freshPublicUpdateStores.add(store.addressKey || store.sourceIdKey);
  const city = usableCityToken(text(drop.store_city ?? drop.city, 120) || cityFromAddress(text(drop.store_address ?? drop.storeAddress, 240)));
  if (city) {
    bucket.freshPublicUpdateCities.add(city);
    bucket.freshPublicUpdateAreas.add(`city:${city}`);
  }
  const county = usableIdentityToken(drop.store_county ?? drop.county, 80);
  if (county) bucket.freshPublicUpdateAreas.add(`county:${county}`);
  const precision = text(drop.location_precision ?? drop.locationPrecision, 120).toLowerCase();
  const scope = text(drop.availability_scope ?? drop.availabilityScope, 120).toLowerCase();
  if (/statewide/.test(`${precision} ${scope}`)) bucket.freshPublicUpdateAreas.add("statewide");
}

export function derivePublicDropEvidence(
  drops: readonly PublicDropEvidenceInput[],
  asOf?: string | number | Date,
  options: PublicDropEligibilityOptions = {},
) {
  const byState = new Map<string, StateEvidenceBucket>();

  for (const input of drops) {
    const drop = normalizePublicDropEvidenceInput(input);
    const state = stateCode(drop);
    if (!state || !isPublicDropFeedEligible(drop, options)) continue;
    const bucket = byState.get(state) || {
      nodes: [],
      freshPublicSignalCount: 0,
      freshPublicUpdateSignalCount: 0,
      stalePublicSignalCount: 0,
      freshPublicUpdateBoards: new Set<string>(),
      freshPublicUpdateStores: new Set<string>(),
      freshPublicUpdateCities: new Set<string>(),
      freshPublicUpdateAreas: new Set<string>(),
      freshStoreEquivalentShipmentBoards: new Set<string>(),
    };
    byState.set(state, bucket);

    const fresh = isFreshPublicDrop(drop, asOf);
    const current = fresh && !sourceStale(drop);
    if (current) bucket.freshPublicSignalCount += 1;
    else bucket.stalePublicSignalCount += 1;

    const exactInventory = exactStoreInventoryCandidate(drop);
    if (current && !exactInventory) addFreshPublicUpdateScope(bucket, drop);
    if (!exactInventory) continue;

    const store = dropStoreEvidence(drop);
    if (!store) continue;
    bucket.nodes.push({
      store,
      current,
      alertable: current && (drop.can_alert_as_inventory === true || drop.canAlertAsInventory === true),
    });
  }

  return new Map(Array.from(byState.entries()).map(([state, bucket]) => {
    const components = componentize(bucket.nodes).sort((left, right) => {
      const leftKey = `${left.store.name}|${left.store.address}|${left.store.id}`;
      const rightKey = `${right.store.name}|${right.store.address}|${right.store.id}`;
      return leftKey.localeCompare(rightKey);
    });
    const observedInventoryStores = components.map((component) => component.store);
    const currentInventoryStores = components.filter((component) => component.current).map((component) => component.store);
    const alertableInventoryStores = components.filter((component) => component.alertable).map((component) => component.store);
    return [state, {
      observedInventoryStores,
      currentInventoryStores,
      alertableInventoryStores,
      observedInventoryCities: new Set(observedInventoryStores.map((store) => token(store.city)).filter(Boolean)).size,
      currentInventoryCities: new Set(currentInventoryStores.map((store) => token(store.city)).filter(Boolean)).size,
      staleInventoryStoreCount: components.filter((component) => !component.current).length,
      freshPublicSignalCount: bucket.freshPublicSignalCount,
      freshPublicUpdateSignalCount: bucket.freshPublicUpdateSignalCount,
      freshPublicUpdateBoards: bucket.freshPublicUpdateBoards.size,
      freshPublicUpdateStores: bucket.freshPublicUpdateStores.size,
      freshPublicUpdateCities: bucket.freshPublicUpdateCities.size,
      freshPublicUpdateAreas: bucket.freshPublicUpdateAreas.size,
      freshPublicUpdateAreaKeys: Array.from(bucket.freshPublicUpdateAreas).sort(),
      freshStoreEquivalentShipmentBoards: bucket.freshStoreEquivalentShipmentBoards.size,
      stalePublicSignalCount: bucket.stalePublicSignalCount,
    } satisfies StatePublicDropEvidence];
  }));
}
