import {
  derivePublicDropEvidence,
  publicEvidenceAddressKey,
  publicEvidenceSourceStoreIdKey,
  publicEvidenceStateCode,
  type PublicDropEvidenceInput,
  type PublicDropStoreEvidence,
  type StatePublicDropEvidence,
} from "./public-drop-evidence.ts";

export const COVERAGE_CAPABILITIES = ["deep", "active", "focused", "intelligence", "not-active"] as const;
export const COVERAGE_STATUS_VALUES = ["available", "not-available"] as const;
export const COVERAGE_STRENGTH_VALUES = ["strong", "moderate", "sparse", "none"] as const;
export const COVERAGE_HEALTH_LEVELS = ["current", "intermittent", "temporarily-limited", "no-recent-update"] as const;
export const COVERAGE_DEPTH_VALUES = ["active", "moderate", "sparse", "not-available"] as const;

export type CoverageCapability = typeof COVERAGE_CAPABILITIES[number];
export type CoverageStatus = typeof COVERAGE_STATUS_VALUES[number];
/**
 * Durable breadth of verified customer-facing sources. Unlike coverageDepth,
 * this deliberately does not disappear merely because the latest source run is
 * stale or temporarily quiet.
 */
export type CoverageStrength = typeof COVERAGE_STRENGTH_VALUES[number];
export type CoverageHealth = typeof COVERAGE_HEALTH_LEVELS[number];
export type CoverageDepth = typeof COVERAGE_DEPTH_VALUES[number];
export type CoverageUpdateLabel = "Shipments and releases" | "Official updates";

export interface CoverageCapabilities {
  storeInformation: boolean;
  publicUpdates: boolean;
  currentBottleAvailability: boolean;
  restockAlerts: boolean;
}

export interface CoverageLifecycleEntryInput {
  readonly customerLabel?: string;
  readonly sourceLabel?: string;
  readonly customerAreaLabel?: string;
  readonly areaOptions?: readonly string[];
  readonly publicStatus?: string;
  readonly lifecycle?: string;
  readonly coverageTier?: string;
  readonly peakCoverageStrength?: Exclude<CoverageStrength, "none">;
  readonly peakVerifiedSourceTargets?: number;
  readonly peakVerifiedSourceAreas?: number;
  readonly refinementLevel?: string;
  readonly inventoryAlertable?: boolean;
  readonly watchAlertable?: boolean;
  readonly customerSummary?: string;
  readonly coverageLayerCounts?: Partial<CoverageLayerCounts>;
}

export interface CoverageLifecycleInput {
  readonly activeStates?: readonly string[];
  readonly states: Readonly<Record<string, CoverageLifecycleEntryInput>>;
}

export interface CoverageStateRowInput {
  state?: string;
  label?: string;
  sourceLabel?: string;
  status?: string;
  publicStatus?: string;
  lifecycle?: string;
  signalCount?: number;
  roadblockCount?: number;
  targetLocationPrecision?: string | null;
  bestLocationPrecision?: string | null;
  refinementLevel?: string;
  customerAreaLabel?: string | null;
  areaOptions?: string[];
  customerSummary?: string;
  coverageTier?: string;
}

export interface CoverageLocationInput {
  id?: string;
  state?: string;
  type?: string;
  locationType?: string;
  name?: string;
  source?: string;
  address?: string | null;
  city?: string | null;
  county?: string | null;
  precision?: string;
  inventoryCapability?: string;
  searchable?: boolean;
  collectorAttached?: boolean;
  hasSignals?: boolean;
  notes?: string | null;
}

export interface CoverageStoreInput {
  id?: string;
  sourceStoreId?: string;
  state?: string;
  name?: string;
  source?: string;
  signalCount?: number;
  address?: string | null;
  city?: string | null;
  county?: string | null;
}

export type CoverageDropInput = PublicDropEvidenceInput;

export interface CoverageLayerCounts {
  known: number;
  probeable: number;
  catalogWatch: number;
  live: number;
  alertGrade: number;
}

export interface CoverageScopeCounts {
  knownBoards: number;
  /** Official boards with canonical tracked shipment evidence; never a current-shelf claim. */
  trackedShipmentBoards: number;
  /** Distinct identity-bound observed source targets used to determine breadth. */
  verifiedSourceTargets: number;
  /** Distinct cities/areas represented by those verified source targets. */
  verifiedSourceAreas: number;
  shipmentBoards: number;
  searchableStores: number;
  inventoryMonitoredStores: number;
  singleStoreShipmentBoards: number;
}

export interface CoverageFreshnessEvidence {
  observedInventoryStores: number;
  currentInventoryStores: number;
  /** Current exact-store cities after freshness, health, and feed eligibility gates. */
  currentInventoryCities: number;
  alertEligibleStores: number;
  staleInventoryStores: number;
  /** Fresh rows usable in the default customer Drop Feed. */
  freshPublicSignals: number;
  /** Fresh non-inventory/update rows usable in that feed. */
  freshPublicUpdates: number;
  freshPublicUpdateBoards: number;
  freshPublicUpdateStores: number;
  freshPublicUpdateCities: number;
  freshPublicUpdateAreas: number;
  stalePublicSignals: number;
}

export interface CoverageNcBoardIntelligenceInput {
  boardCount?: number;
  officialStoreCount?: number;
  representedAreaCount?: number;
  boardsWithTrackedShipments?: number;
  singleStoreShipmentBoardCount?: number;
  unresolvedShipmentBoardIdentityCount?: number;
}

export interface CoverageState {
  code: string;
  name: string;
  capability: CoverageCapability;
  capabilityLabel: string;
  coverageDepth: CoverageDepth;
  coverageDepthLabel: string;
  coverageStatus: CoverageStatus;
  coverageStatusLabel: string;
  coverageStrength: CoverageStrength;
  coverageStrengthLabel: string;
  capabilities: CoverageCapabilities;
  updateLabel: CoverageUpdateLabel | null;
  health: CoverageHealth;
  healthLabel: string;
  summary: string;
  sourceLabel: string | null;
  precisions: string[];
  areas: string[];
  representedAreaCount: number;
  monitoredStoreCount: number;
  layers: CoverageLayerCounts;
  scope: CoverageScopeCounts;
  freshness: CoverageFreshnessEvidence;
  canSee: string[];
  cannotSee: string[];
  customerSummary?: string;
  customerCanSee?: string[];
  customerCannotSee?: string[];
  fingerprint: string;
}

export interface CoverageContract {
  contractVersion: "bourbon-signal/coverage@3";
  generatedAt: string | null;
  evaluatedAt: string;
  states: CoverageState[];
}

export type CoverageSearchStatus =
  | "covered"
  | "partially-covered"
  | "known-not-active"
  | "actively-monitored"
  | "known-expansion-candidate"
  | "not-found";

export interface CoverageSearchResult {
  kind: "city" | "store" | "unknown";
  label: string;
  stateCode: string;
  status: CoverageSearchStatus;
  canonicalTargetKey: string | null;
  detail: string;
  storeId?: string;
  city?: string;
  address?: string;
}

export interface CoverageStoreMatch {
  id: string;
  name: string;
  city?: string;
  address?: string;
}

const US_STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
  ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"],
  ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"],
  ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"],
  ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"],
  ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"],
  ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"],
  ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"],
  ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"],
  ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
] as const;

export const US_STATE_OPTIONS = US_STATES.map(([code, name]) => ({ code, name }));
export const US_STATE_CODES = US_STATE_OPTIONS.map((state) => state.code);

const CAPABILITY_LABELS: Record<CoverageCapability, string> = {
  deep: "Current bottle availability",
  active: "Official local updates",
  focused: "Store information",
  intelligence: "Shipments and releases",
  "not-active": "Not available yet",
};

const COVERAGE_STATUS_LABELS: Record<CoverageStatus, string> = {
  available: "Coverage available",
  "not-available": "Not available yet",
};

const COVERAGE_STRENGTH_LABELS: Record<CoverageStrength, string> = {
  strong: "Strong coverage",
  moderate: "Moderate coverage",
  sparse: "Sparse coverage",
  none: "No coverage",
};

const COVERAGE_DEPTH_LABELS: Record<CoverageDepth, string> = {
  active: "Active coverage",
  moderate: "Moderate coverage",
  sparse: "Sparse coverage",
  "not-available": "Not available yet",
};

const HEALTH_LABELS: Record<CoverageHealth, string> = {
  current: "Information is current",
  intermittent: "Updates are intermittent",
  "temporarily-limited": "Some information is temporarily limited",
  "no-recent-update": "No recent update",
};

const LIVE_TIERS = new Set(["live_store_inventory", "store_availability_status", "sparse_live_store_inventory"]);
const INTELLIGENCE_TIERS = new Set([
  "store_delivery_leads",
  "shipment_drop_intelligence",
  "aggregate_inventory_watch",
  "distillery_release_watch",
]);
const SHIPMENT_UPDATE_TIERS = new Set([
  "store_delivery_leads",
  "shipment_drop_intelligence",
  "distillery_release_watch",
]);

function publicStateCode(value: unknown) {
  return publicEvidenceStateCode(value);
}

export function coverageInternalStateKey(stateCode: string, lifecycle: CoverageLifecycleInput) {
  const normalized = publicStateCode(stateCode);
  if (normalized === "MD" && lifecycle.states["MD-MONTGOMERY"]) return "MD-MONTGOMERY";
  return normalized;
}

function cleanText(value: unknown, maxLength = 240) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function nonnegativeLayerCount(value: unknown) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
}

export function coverageTargetToken(value: unknown, maxLength = 80) {
  return cleanText(value, maxLength)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
}

function isStoreLocation(location: CoverageLocationInput) {
  return location.type === "store" || location.locationType === "store";
}

interface StoreRecord {
  id: string;
  name: string;
  source: string;
  address: string;
  city: string;
  county: string;
  searchable: boolean;
  monitoringAttached: boolean;
  liveInventory: boolean;
  hasSignals: boolean;
  precision: string;
  inventoryCapability: string;
}

function evidenceMatchesStore(
  stateCode: string,
  evidence: PublicDropStoreEvidence,
  store: Pick<StoreRecord, "id" | "source" | "address" | "city">,
  ambiguousSourceIdKeys: ReadonlySet<string>,
) {
  const storeSourceIdKey = publicEvidenceSourceStoreIdKey(stateCode, store.source, store.id);
  const storeAddressKey = publicEvidenceAddressKey(stateCode, store.address, store.city);
  const sameAddress = Boolean(evidence.addressKey && storeAddressKey) && evidence.addressKey === storeAddressKey;
  if (sameAddress) return true;
  const sameSourceId = Boolean(evidence.sourceIdKey && storeSourceIdKey) && evidence.sourceIdKey === storeSourceIdKey;
  if (!sameSourceId) return false;
  // A source-qualified ID is valid only while it identifies one premise. If
  // the current evidence graph shows that ID at multiple addresses, an
  // address-less directory row cannot safely select any one of them.
  if (!storeAddressKey && ambiguousSourceIdKeys.has(storeSourceIdKey)) return false;
  return !(evidence.addressKey && storeAddressKey && evidence.addressKey !== storeAddressKey);
}

function evidenceTargetId(evidence: PublicDropStoreEvidence) {
  // A source ID is usually stable, but it cannot be the whole request target
  // when the same source ID appears at more than one validated address. Keep
  // both independently proven identities in that case.
  if (evidence.sourceIdKey && evidence.addressKey) return `${evidence.sourceIdKey}|${evidence.addressKey}`;
  return evidence.sourceIdKey || evidence.addressKey || evidence.id;
}

function evidenceRequestId(evidence: PublicDropStoreEvidence) {
  return `evidence:${evidenceTargetId(evidence)}`;
}

function directoryOnlySource(source: string) {
  return /(?:store\s+)?locator|permit|licen[cs]e|arcgis|directory|facility\s+search/i.test(source);
}

function liveInventorySource(source: string) {
  return !directoryOnlySource(source)
    && /inventory|availability|orderability|pickup/i.test(source)
    && !/catalog|event|watch|barrel selection|products? feed|monthly rare/i.test(source);
}

function sourceCapabilities(source: string, collectorAttached: boolean) {
  const monitoringAttached = collectorAttached && !directoryOnlySource(source);
  return {
    monitoringAttached,
    liveInventory: monitoringAttached && liveInventorySource(source),
  };
}

function stateStoreRecords(
  internalStateKey: string,
  locations: readonly CoverageLocationInput[],
  stores: readonly CoverageStoreInput[],
) {
  const records = new Map<string, StoreRecord>();
  const identityKeys = new Map<string, string>();
  const identityFor = (name: unknown, address: unknown, city: unknown) => {
    const addressToken = coverageTargetToken(address, 220);
    if (addressToken) return `address:${addressToken}`;
    return `name:${coverageTargetToken(name, 180)}:city:${coverageTargetToken(city, 120)}`;
  };
  for (const location of locations) {
    if (String(location.state || "").toUpperCase() !== internalStateKey || !isStoreLocation(location)) continue;
    const id = cleanText(location.id, 160);
    const name = cleanText(location.name, 180);
    if (!id && !name) continue;
    const key = id || `${coverageTargetToken(name)}:${coverageTargetToken(location.city)}`;
    const source = cleanText(location.source, 220);
    const hasSignals = location.hasSignals === true;
    const capabilities = sourceCapabilities(source, location.collectorAttached === true);
    records.set(key, {
      id: id || key,
      name,
      source,
      address: cleanText(location.address, 220),
      city: cleanText(location.city, 120),
      county: cleanText(location.county, 120),
      searchable: location.searchable !== false,
      ...capabilities,
      hasSignals,
      precision: cleanText(location.precision, 80),
      inventoryCapability: cleanText(location.inventoryCapability, 80),
    });
    identityKeys.set(identityFor(name, location.address, location.city), key);
  }
  for (const store of stores) {
    if (String(store.state || "").toUpperCase() !== internalStateKey) continue;
    const id = cleanText(store.id || store.sourceStoreId, 160);
    const name = cleanText(store.name, 180);
    if (!id && !name) continue;
    const idKey = id || `${coverageTargetToken(name)}:${coverageTargetToken(store.city)}`;
    const key = identityKeys.get(identityFor(name, store.address, store.city)) || idKey;
    const previous = records.get(key);
    const source = cleanText(store.source, 220) || previous?.source || "";
    const storeHasSignals = (Number(store.signalCount) || 0) > 0;
    const hasSignals = previous
      ? previous.hasSignals || (internalStateKey === 'TN' && storeHasSignals)
      : storeHasSignals;
    const observedCapabilities = sourceCapabilities(source, true);
    const tennesseeSignalCapabilities = internalStateKey === 'TN' && storeHasSignals
      ? {
          ...observedCapabilities,
          liveInventory: observedCapabilities.liveInventory || /Cool Springs Wine & Spirits public catalog API/i.test(source),
        }
      : { monitoringAttached: false, liveInventory: false };
    const capabilities = previous
      ? {
          monitoringAttached: previous.monitoringAttached || tennesseeSignalCapabilities.monitoringAttached,
          liveInventory: previous.liveInventory || tennesseeSignalCapabilities.liveInventory,
        }
      : internalStateKey === 'TN'
        ? tennesseeSignalCapabilities
        : observedCapabilities;
    records.set(key, {
      id: id || previous?.id || key,
      name: name || previous?.name || "",
      source,
      address: cleanText(store.address, 220) || previous?.address || "",
      city: cleanText(store.city, 120) || previous?.city || "",
      county: cleanText(store.county, 120) || previous?.county || "",
      searchable: previous?.searchable !== false,
      ...capabilities,
      hasSignals,
      precision: previous?.precision || "store_level",
      inventoryCapability: previous?.inventoryCapability || "store_level",
    });
  }
  return [...records.values()];
}

function stateLocations(internalStateKey: string, locations: readonly CoverageLocationInput[]) {
  return locations.filter((location) => String(location.state || "").toUpperCase() === internalStateKey);
}

const HARD_SOURCE_BLOCK_STATUSES = new Set([
  "blocked",
  "disabled",
  "inactive",
  "retired",
  "policy_blocked",
  "source_blocked",
  "source_disabled",
  "source_policy_blocked",
  "source_retired",
  "source_unavailable",
]);

function sourceStatusIsBlocked(value: unknown) {
  const status = cleanText(value, 120)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  // Engine status `stale_blocked` means the latest retained evidence is not
  // due for refresh; it does not mean the verified source lane was disabled.
  return HARD_SOURCE_BLOCK_STATUSES.has(status);
}

function rowSourceIsBlocked(row: CoverageStateRowInput | undefined) {
  return cleanText(row?.bestLocationPrecision, 80).toLowerCase() === "blocked"
    || sourceStatusIsBlocked(row?.status);
}

function stateSourceIsBlocked(stateCode: string, degradedStates: readonly Record<string, unknown>[]) {
  const publicCode = publicStateCode(stateCode);
  return degradedStates.some((entry) => publicStateCode(entry.state) === publicCode && sourceStatusIsBlocked(entry.status));
}

function hasVerifiedCoverageSource(
  lifecycleEntry: CoverageLifecycleEntryInput | undefined,
  row: CoverageStateRowInput | undefined,
  stateLocationsList: readonly CoverageLocationInput[],
  stores: readonly StoreRecord[],
) {
  if (!lifecycleEntry || lifecycleEntry.publicStatus !== "active" || !row || row.publicStatus !== "active") return false;
  if (rowSourceIsBlocked(row)) return false;
  const hasAttachedSource = stateLocationsList.some((location) => location.collectorAttached === true && !isStoreLocation(location));
  const hasCurrentStore = stores.some((store) => store.monitoringAttached);
  const hasObservedSourceSignals = Number(row?.signalCount || 0) > 0;
  return hasAttachedSource || hasCurrentStore || hasObservedSourceSignals;
}

interface VerifiedSourceBreadth {
  targetCount: number;
  areaCount: number;
  trackedShipmentBoards: number;
}

function verifiedSourceBreadth(
  stateCode: string,
  observedInventoryStores: readonly PublicDropStoreEvidence[],
  ncBoardIntelligence?: CoverageNcBoardIntelligenceInput | null,
): VerifiedSourceBreadth {
  const targets = new Set<string>();
  const areas = new Set<string>();
  const remember = (key: string, area: unknown) => {
    const target = cleanText(key, 500);
    if (!target) return;
    targets.add(target);
    const normalizedArea = coverageTargetToken(area, 120);
    if (normalizedArea) areas.add(normalizedArea);
  };


  // Only identity-bound observed store evidence contributes to geographic
  // breadth. A source attachment or directory record alone remains Sparse.
  for (const evidence of observedInventoryStores) {
    const key = evidence.addressKey || evidence.sourceIdKey || coverageTargetToken(evidence.id, 220);
    remember(`store:${key}`, evidence.city);
  }

  return {
    targetCount: targets.size,
    areaCount: areas.size,
    trackedShipmentBoards: stateCode === "NC"
      ? nonnegativeLayerCount(ncBoardIntelligence?.boardsWithTrackedShipments)
      : 0,
  };
}

function deriveCoverageStrength(
  coverageStatus: CoverageStatus,
  coverageTier: string,
  scope: Pick<CoverageScopeCounts, "trackedShipmentBoards" | "verifiedSourceTargets" | "verifiedSourceAreas">,
): CoverageStrength {
  if (coverageStatus !== "available") return "none";
  // These source lanes are deliberately reviewed as narrow/specific even when
  // they produce several rows; a count must not erase that boundary.
  if (coverageTier === "sparse_live_store_inventory" || coverageTier === "distillery_release_watch") return "sparse";

  if (scope.trackedShipmentBoards >= 25) return "strong";
  if (scope.verifiedSourceTargets >= 25 && scope.verifiedSourceAreas >= 5) return "strong";
  if (scope.trackedShipmentBoards >= 5) return "moderate";
  if (scope.verifiedSourceTargets >= 5 && scope.verifiedSourceAreas >= 2) return "moderate";
  return "sparse";
}

function publicUpdateLabel(
  coverageTier: string,
  scope: CoverageScopeCounts,
  hasFreshUpdates: boolean,
): CoverageUpdateLabel | null {
  if (!hasFreshUpdates) return null;
  if (scope.shipmentBoards > 0 || SHIPMENT_UPDATE_TIERS.has(coverageTier)) return "Shipments and releases";
  return "Official updates";
}

function publicCapabilities(
  updateLabel: CoverageUpdateLabel | null,
  scope: CoverageScopeCounts,
  layers: CoverageLayerCounts,
  hasFreshPublicOutput: boolean,
): CoverageCapabilities {
  return {
    // A static directory can support a fresh state signal, but it cannot by
    // itself manufacture current customer coverage.
    storeInformation: hasFreshPublicOutput && scope.searchableStores > 0,
    publicUpdates: updateLabel !== null,
    currentBottleAvailability: scope.inventoryMonitoredStores > 0,
    restockAlerts: layers.alertGrade > 0,
  };
}

function deriveCoverageStatus(
  sourceBlocked: boolean,
  hasVerifiedSource: boolean,
  capabilities: CoverageCapabilities,
): CoverageStatus {
  // A source explicitly blocked by its health record cannot surface stale or
  // newly-arrived rows as public coverage until the block clears.
  if (sourceBlocked) return "not-available";
  // "Coverage available" means a verified source lane exists. It does not
  // promise a fresh update, current shelf inventory, or alertability; those
  // remain separately gated by current default-feed evidence.
  return hasVerifiedSource || Object.values(capabilities).some(Boolean)
    ? "available"
    : "not-available";
}

function stateCapability(
  coverageTier: string,
  lifecycle: string,
  currentSource: boolean,
  liveStores: number,
  representedLiveCities: number,
  publicUpdates: boolean,
): CoverageCapability {
  if (!currentSource && !publicUpdates) return "not-active";
  if (coverageTier === "live_store_inventory") {
    if (lifecycle === "store_inventory" && liveStores >= 250 && representedLiveCities >= 25) return "deep";
    if (liveStores >= 25 && representedLiveCities >= 5) return "active";
    if (liveStores >= 5 && representedLiveCities >= 2) return "focused";
    return "intelligence";
  }
  if (coverageTier === "store_availability_status") {

    if (liveStores >= 25 && representedLiveCities >= 5) return "active";
    if (liveStores >= 5 && representedLiveCities >= 2) return "focused";

    return "intelligence";
  }
  if (coverageTier === "sparse_live_store_inventory") {
    if (liveStores >= 4) return "focused";
    return "intelligence";
  }
  if (coverageTier === "retailer_warehouse_inventory") return "intelligence";
  if (INTELLIGENCE_TIERS.has(coverageTier)) return "intelligence";
  return "not-active";
}

function coverageCapabilityLabel(
  capability: CoverageCapability,
  capabilities: CoverageCapabilities,
  updateLabel: CoverageUpdateLabel | null,
  coverageAvailable: boolean,
) {
  if (capability === "not-active") {
    return coverageAvailable ? COVERAGE_STATUS_LABELS.available : CAPABILITY_LABELS[capability];
  }
  if (capabilities.currentBottleAvailability) return CAPABILITY_LABELS.deep;
  if (capabilities.publicUpdates) return updateLabel || CAPABILITY_LABELS.active;
  if (capabilities.storeInformation) return CAPABILITY_LABELS.focused;
  return COVERAGE_STATUS_LABELS.available;
}

function stateHealth(
  internalStateKey: string,
  status: CoverageStatus,
  row: CoverageStateRowInput | undefined,
  degradedStates: readonly Record<string, unknown>[],
  healthLimited: boolean,
  freshnessLimited: boolean,
  sourceBlocked: boolean,
  hasFreshPublicOutput: boolean,
): CoverageHealth {
  const rowStatus = cleanText(row?.status, 100).toLowerCase();
  const publicCode = publicStateCode(internalStateKey);
  const degraded = degradedStates.some((entry) => publicStateCode(entry.state) === publicCode);
  const limited = sourceBlocked || healthLimited || freshnessLimited || degraded || rowStatus.includes("stale") || rowStatus.includes("fallback");
  if (limited) return "temporarily-limited";
  if (!hasFreshPublicOutput) return "no-recent-update";
  if (status === "not-available") return "no-recent-update";
  if (rowStatus.includes("intermittent") || rowStatus.includes("degraded") || rowStatus.includes("partial")) return "intermittent";
  return "current";
}

function precisionLabels(
  lifecycleEntry: CoverageLifecycleEntryInput | undefined,
  row: CoverageStateRowInput | undefined,
  locations: readonly CoverageLocationInput[],
  stores: readonly StoreRecord[],
) {
  const raw = new Set<string>();
  for (const value of [
    lifecycleEntry?.refinementLevel,
    row?.refinementLevel,
    row?.bestLocationPrecision,
    row?.targetLocationPrecision,
    ...locations.map((location) => location.precision || location.inventoryCapability),
  ]) {
    const normalized = cleanText(value, 80).toLowerCase();
    if (normalized) raw.add(normalized);
  }
  const labels: string[] = [];
  if ([...raw].some((value) => value.includes("statewide"))) labels.push("Statewide");
  if ([...raw].some((value) => /area|county|warehouse|aggregate|distillery/.test(value))) labels.push("Area");
  if ([...raw].some((value) => /board/.test(value))) labels.push("Board");
  if ([...raw].some((value) => /city/.test(value)) || stores.some((store) => store.city)) labels.push("City");
  if ([...raw].some((value) => /store/.test(value)) && stores.some((store) => store.searchable)) labels.push("Exact store");
  return labels;
}

function stateAreas(
  lifecycleEntry: CoverageLifecycleEntryInput | undefined,
  row: CoverageStateRowInput | undefined,
  locations: readonly CoverageLocationInput[],
  stores: readonly StoreRecord[],
) {
  const values = new Map<string, string>();
  const configuredAreas = [
    ...(lifecycleEntry?.areaOptions || []),
    ...(row?.areaOptions || []),
  ].map((value) => cleanText(value, 120)).filter((value): value is string => Boolean(value));
  const isNorthCarolina = locations.some((location) => String(location.state || "").toUpperCase() === "NC");
  const ncStoreAreas = locations
    .filter((location) => /NC ABC Commission store locator/i.test(String(location.source || "")))
    .flatMap((location) => [location.city, location.county]);
  const candidateAreas = isNorthCarolina
    ? ncStoreAreas
    : configuredAreas.length
      ? configuredAreas
      : [
          lifecycleEntry?.customerAreaLabel,
          row?.customerAreaLabel,
          ...locations.flatMap((location) => [location.city, location.county]),
          ...stores.flatMap((store) => [store.city, store.county]),
        ];
  for (const value of candidateAreas) {
    const cleaned = cleanText(value, 120);
    if (!cleaned) continue;
    const key = coverageTargetToken(cleaned).replace(/-county$/, "");
    const previous = values.get(key);
    if (!previous || cleaned.length > previous.length) values.set(key, cleaned);
  }
  return [...values.values()].sort((left, right) => left.localeCompare(right));
}

function visibilityCopy(
  stateCode: string,
  coverageTier: string,
  capability: CoverageCapability,
  layers: CoverageLayerCounts,
  scope: CoverageScopeCounts,
  summary: string,
  coverageAvailable: boolean,
  hasFreshPublicOutput: boolean,
) {
  if (!coverageAvailable) {
    return {
      canSee: layers.known > 0 ? ["Known directory locations that can guide expansion work."] : ["No current customer-facing monitoring source."],
      cannotSee: ["No current source-backed monitoring, current bottle availability, or alert-grade coverage is available in this state."],
    };
  }
  if (!hasFreshPublicOutput) {
    return {
      canSee: ["Verified source coverage is available, but no current public update is available right now."],
      cannotSee: ["Current bottle availability and restock alerts are unavailable until current source output returns."],
    };
  }
  if (coverageTier === "live_store_inventory") {
    if (stateCode === "NC") {
      return {
        canSee: [
          `${scope.shipmentBoards} ABC boards represented by official shipment intelligence and ${scope.inventoryMonitoredStores} stores with direct inventory monitoring.`,
          `${scope.singleStoreShipmentBoards} single-store boards provide qualified store-equivalent shipment intelligence because each board has only one official storefront.`,
        ],
        cannotSee: [
          "A board shipment is not a shelf confirmation—even for a single-store board—and never becomes inventory-alert-ready without current store evidence.",
          "Most NC boards do not publish continuous exact-store inventory; verify availability before driving.",
        ],
      };
    }
    if (scope.inventoryMonitoredStores === 0) {
      return {
        canSee: [scope.searchableStores > 0
          ? "Listed store information is available; current bottle availability is temporarily unavailable."
          : "Store monitoring is temporarily unavailable."],
        cannotSee: ["Current bottle availability and alert-grade monitoring are temporarily limited until fresh exact-store evidence returns."],
      };
    }
    return {
      canSee: ["Current source-backed store monitoring at the precision stated above."],
      cannotSee: [
        /does not imply statewide|metro-scoped/i.test(summary)
          ? "Statewide coverage outside the configured metro area is not implied."
          : null,
        /board/i.test(summary)
          ? "Board and warehouse leads are not exact shelf inventory unless an exact store source supports them."
          : "A monitored store is not a shelf guarantee; retailer availability can move quickly, so verify before driving.",
      ].filter((value): value is string => Boolean(value)),
    };
  }
  if (coverageTier === "store_availability_status") {
    return {
      canSee: ["Official store availability status and store identity where the source provides it."],
      cannotSee: ["Bottle counts, reservations, or a guarantee that an item remains on the shelf."],
    };
  }
  if (coverageTier === "sparse_live_store_inventory") {
    return {
      canSee: [scope.inventoryMonitoredStores > 0
        ? "Current identity-bound orderability from a small reviewed set of exact retailer premises."
        : "A small reviewed, identity-bound orderability set is available; current orderability is temporarily unavailable."],
      cannotSee: ["Statewide coverage, exact shelf counts, holds, or outbound inventory alerts; verify directly with the store before driving."],
    };
  }
  if (coverageTier === "store_delivery_leads") {
    return {
      canSee: ["Official store-level delivery and allocation leads."],
      cannotSee: ["Current live shelf inventory or guaranteed availability."],
    };
  }
  if (coverageTier === "shipment_drop_intelligence") {
    return {
      canSee: ["Official release schedules and store or drop leads."],
      cannotSee: ["Continuous live shelf inventory."],
    };
  }
  if (coverageTier === "aggregate_inventory_watch") {
    return {
      canSee: ["Aggregate board, county, warehouse, or program intelligence."],
      cannotSee: ["Exact per-store shelf inventory."],
    };
  }
  if (coverageTier === "distillery_release_watch") {
    return {
      canSee: ["Official distillery release and pickup leads."],
      cannotSee: ["Retailer store inventory outside the watched distilleries."],
    };
  }
  if (coverageTier === "retailer_warehouse_inventory") {
    return {
      canSee: ["Selected warehouse inventory watches where a verified source is available."],
      cannotSee: ["Broad statewide retailer coverage or an exact shelf guarantee."],
    };
  }
  return {
    canSee: ["Scoped source intelligence."],
    cannotSee: ["Broad or exact-store live inventory coverage."],
  };
}

function customerVisibilityCopy(
  updateLabel: CoverageUpdateLabel | null,
  capabilities: CoverageCapabilities,
  scope: CoverageScopeCounts,
  coverageAvailable: boolean,
  sourceLabel: string | null,
) {
  const canSee: string[] = [];
  const cannotSee: string[] = [];
  if (capabilities.storeInformation) {
    canSee.push(scope.searchableStores > 0
      ? `Find ${scope.searchableStores} listed stores.`
      : "Find listed stores in this area.");
  }
  if (capabilities.publicUpdates) {
    canSee.push(updateLabel === "Shipments and releases"
      ? scope.shipmentBoards > 0
        ? `See shipment and release information from ${scope.shipmentBoards} official local pages.`
        : "See shipment and release information from official local sources."
      : "See official updates for this area.");
  }
  if (capabilities.currentBottleAvailability) {
    canSee.push(scope.inventoryMonitoredStores > 0
      ? `See current bottle availability at ${scope.inventoryMonitoredStores} stores.`
      : "See current bottle availability where it is reported.");
  }
  if (capabilities.restockAlerts) {
    canSee.push(scope.inventoryMonitoredStores > 0
      ? "Get restock alerts where eligible."
      : "Get restock alerts where current availability supports them.");
  }
  if (!canSee.length && coverageAvailable) {
    canSee.push(`Coverage is available through ${sourceLabel || "verified sources"}, but no current public update is available right now.`);
  }
  if (!capabilities.currentBottleAvailability) {
    cannotSee.push(capabilities.publicUpdates
      ? "Shipment information does not confirm current bottle availability."
      : "Current bottle availability is not available here yet.");
  } else {
    cannotSee.push("Stock can change quickly, so verify before driving.");
  }
  if (!capabilities.restockAlerts) cannotSee.push("Restock alerts are not available here yet.");
  return {
    canSee: canSee.length ? canSee : ["We do not have reliable coverage here yet."],
    cannotSee,
  };
}

function summaryCopy(
  updateLabel: CoverageUpdateLabel | null,
  capabilities: CoverageCapabilities,
  coverageAvailable: boolean,
  sourceLabel: string | null,
) {
  if (capabilities.currentBottleAvailability) return "Current bottle availability is available at selected stores.";
  if (capabilities.publicUpdates) {
    return updateLabel === "Shipments and releases"
      ? "Shipment and release coverage is active. It does not confirm current bottle availability."
      : "Official updates are available here. Current bottle availability may not be covered yet.";
  }
  if (capabilities.storeInformation) return "Store information is available here. Current bottle availability is not available yet.";
  if (coverageAvailable) {
    return `Coverage is available through ${sourceLabel || "verified sources"}, but no current public update is available right now. Current bottle availability is not shown.`;
  }
  return "We do not have a reliable way to check this area yet.";
}

const EMPTY_DROP_EVIDENCE: StatePublicDropEvidence = {
  observedInventoryStores: [],
  currentInventoryStores: [],
  alertableInventoryStores: [],
  observedInventoryCities: 0,
  currentInventoryCities: 0,
  staleInventoryStoreCount: 0,
  freshPublicSignalCount: 0,
  freshPublicUpdateSignalCount: 0,
  freshPublicUpdateBoards: 0,
  freshPublicUpdateStores: 0,
  freshPublicUpdateCities: 0,
  freshPublicUpdateAreas: 0,
  freshPublicUpdateAreaKeys: [],
  freshStoreEquivalentShipmentBoards: 0,
  stalePublicSignalCount: 0,
};

function isStateFeedDegraded(stateCode: string, degradedStates: readonly Record<string, unknown>[]) {
  const publicCode = publicStateCode(stateCode);
  return degradedStates.some((entry) => {
    if (publicStateCode(entry.state) !== publicCode) return false;
    // Retained useful rows remain visible in the feed, subject to row freshness.
    return !cleanText(entry.status, 120).toLowerCase().startsWith("stale_useful");
  });
}

function feedDegradedStateCodes(degradedStates: readonly Record<string, unknown>[]) {
  return new Set(
    degradedStates
      .filter((entry) => !cleanText(entry.status, 120).toLowerCase().startsWith("stale_useful"))
      .map((entry) => publicStateCode(entry.state))
      .filter(Boolean),
  );
}

function rowHasStaleHealth(row: CoverageStateRowInput | undefined) {
  const status = cleanText(row?.status, 120).toLowerCase();
  return status.includes("stale") || status.includes("fallback") || status.includes("blocked");
}

function deriveCoverageDepth(args: {
  coverageTier: string;
  freshPublicSignals: number;
  currentInventoryStores: number;
  currentInventoryCities: number;
  freshPublicUpdates: number;
  freshUpdateBoards: number;
  freshUpdateStores: number;
  freshUpdateCities: number;
  freshUpdateAreas: number;
}): CoverageDepth {
  // This is intentionally independent of directory size, lifecycle config,
  // source attachment, and historical observed rows. A depth label means
  // current usable customer output exists at evaluation time.
  if (args.freshPublicSignals === 0) return "not-available";

  if (args.currentInventoryStores > 0) {
    if (args.coverageTier === "sparse_live_store_inventory") return "sparse";
    if (args.currentInventoryStores >= 25 && args.currentInventoryCities >= 5) return "active";
    if (args.currentInventoryStores >= 5 && args.currentInventoryCities >= 2) return "moderate";
    return "sparse";
  }

  if (args.freshPublicUpdates > 0) {
    if (args.coverageTier === "distillery_release_watch") return "sparse";
    if (args.freshUpdateBoards >= 20) return "active";
    if (args.freshUpdateStores >= 25 && args.freshUpdateCities >= 5) return "active";
    if (
      args.freshUpdateBoards >= 5
      || (args.freshUpdateStores >= 5 && args.freshUpdateCities >= 2)
      || args.freshUpdateAreas >= 2
    ) return "moderate";
    return "sparse";
  }

  // A current feed row may be informative even when it cannot safely become a
  // direct availability or update claim (for example, a policy-limited row).
  return "sparse";
}

function buildState(args: {
  code: string;
  defaultName: string;
  lifecycle: CoverageLifecycleInput;
  stateRows: readonly CoverageStateRowInput[];
  locations: readonly CoverageLocationInput[];
  stores: readonly CoverageStoreInput[];
  degradedStates: readonly Record<string, unknown>[];
  dropEvidence: StatePublicDropEvidence;
  healthLimited: boolean;
  ncBoardIntelligence?: CoverageNcBoardIntelligenceInput | null;
}) {
  const internalStateKey = coverageInternalStateKey(args.code, args.lifecycle);
  const lifecycleEntry = args.lifecycle.states[internalStateKey];
  const row = args.stateRows.find((entry) => String(entry.state || "").toUpperCase() === internalStateKey);
  const locations = stateLocations(internalStateKey, args.locations);
  const storeRecords = stateStoreRecords(internalStateKey, args.locations, args.stores);
  const tier = cleanText(row?.coverageTier || lifecycleEntry?.coverageTier, 80);
  const configuredLayers = lifecycleEntry?.coverageLayerCounts;
  const supportsDirectStoreAvailability = LIVE_TIERS.has(tier);
  const sourceBlocked = rowSourceIsBlocked(row) || stateSourceIsBlocked(args.code, args.degradedStates);
  const hasVerifiedSource = !sourceBlocked && hasVerifiedCoverageSource(lifecycleEntry, row, locations, storeRecords);
  const feedDegraded = isStateFeedDegraded(args.code, args.degradedStates);
  // Lifecycle/configuration tells us which evidence may be used; only current
  // default-feed output establishes that a customer can use it now.
  const hasFreshPublicOutput = !sourceBlocked
    && !args.healthLimited
    && !feedDegraded
    && args.dropEvidence.freshPublicSignalCount > 0;
  const directCurrentStores = supportsDirectStoreAvailability && hasFreshPublicOutput
    ? args.dropEvidence.currentInventoryStores
    : [];
  const directAlertableStores = supportsDirectStoreAvailability && hasFreshPublicOutput && lifecycleEntry?.inventoryAlertable !== false
    ? args.dropEvidence.alertableInventoryStores
    : [];
  const liveStores = directCurrentStores.length;
  const alertGradeStores = directAlertableStores.length;
  // This is a current-availability metric, not historical evidence. Derive it
  // from the health/policy-gated stores so a limited or degraded state cannot
  // leak current-city coverage through freshness metadata.
  const representedLiveCities = new Set(
    directCurrentStores.map((store) => store.city).filter(Boolean),
  ).size;
  const hasFreshUpdateOutput = hasFreshPublicOutput && (
    args.dropEvidence.freshPublicUpdateSignalCount > 0
    // A policy-limited signal remains a useful feed update, but never turns
    // into current shelf availability merely because a retailer posted it.
    || (!supportsDirectStoreAvailability && args.dropEvidence.freshPublicSignalCount > 0)
  );
  const layers: CoverageLayerCounts = {
    known: Math.max(storeRecords.length, nonnegativeLayerCount(configuredLayers?.known)),
    probeable: Math.max(
      storeRecords.filter((store) => store.searchable && store.monitoringAttached).length,
      nonnegativeLayerCount(configuredLayers?.probeable),
    ),
    catalogWatch: Math.max(
      locations.filter((location) => location.collectorAttached === true && !isStoreLocation(location)).length
        + storeRecords.filter((store) => store.monitoringAttached && !store.liveInventory).length,
      nonnegativeLayerCount(configuredLayers?.catalogWatch),
    ),
    // These are customer-visible current counts, not configured-store estimates.
    live: liveStores,
    alertGrade: alertGradeStores,
  };
  const boardLocations = locations.filter((location) => /county_board/i.test(String(location.type || location.locationType || ""))
    && /NC ABC Commission board list/i.test(String(location.source || "")));
  const officialStoreLocations = locations.filter((location) => isStoreLocation(location)
    && /NC ABC Commission store locator/i.test(String(location.source || ""))
    && location.searchable !== false);
  const shipmentBoards = new Set(locations
    .filter((location) => /NC ABC Stock Shipped Data/i.test(String(location.source || "")))
    .map((location) => cleanText(location.name, 180))
    .filter(Boolean));
  const officialStoresByBoard = new Map<string, Set<string>>();
  for (const location of officialStoreLocations) {
    const boardName = cleanText(location.notes, 600).match(/\bfor (.+? ABC (?:Board|Commission)) \(board id\b/i)?.[1] || "";
    if (!boardName) continue;
    const boardStores = officialStoresByBoard.get(boardName) || new Set<string>();
    boardStores.add(cleanText(location.id, 160) || `${cleanText(location.address, 220)}|${cleanText(location.city, 120)}`);
    officialStoresByBoard.set(boardName, boardStores);
  }
  const hasCanonicalNcStats = args.code === "NC"
    && Number.isFinite(Number(args.ncBoardIntelligence?.officialStoreCount))
    && Number.isFinite(Number(args.ncBoardIntelligence?.singleStoreShipmentBoardCount));
  const sourceBreadth = sourceBlocked
    ? { targetCount: 0, areaCount: 0, trackedShipmentBoards: 0 }
    : verifiedSourceBreadth(
      args.code,
      args.dropEvidence.observedInventoryStores,
      args.ncBoardIntelligence,
    );
  const scope: CoverageScopeCounts = {
    knownBoards: boardLocations.length,
    // Tracked-board breadth is durable evidence for the rating. It never
    // implies that a shipment is current or that a bottle is on a shelf.
    trackedShipmentBoards: sourceBreadth.trackedShipmentBoards,
    verifiedSourceTargets: Math.max(sourceBreadth.targetCount, nonnegativeLayerCount(lifecycleEntry?.peakVerifiedSourceTargets)),
    verifiedSourceAreas: Math.max(sourceBreadth.areaCount, nonnegativeLayerCount(lifecycleEntry?.peakVerifiedSourceAreas)),
    // Board counts used in capability/depth copy must be current public rows,
    // never a historic stats/configuration counter.
    shipmentBoards: hasFreshPublicOutput ? args.dropEvidence.freshPublicUpdateBoards : 0,
    searchableStores: hasCanonicalNcStats ? nonnegativeLayerCount(args.ncBoardIntelligence?.officialStoreCount) : officialStoreLocations.length || storeRecords.filter((store) => store.searchable).length,
    inventoryMonitoredStores: liveStores,
    singleStoreShipmentBoards: hasFreshPublicOutput ? args.dropEvidence.freshStoreEquivalentShipmentBoards : 0,
  };
  const publicUpdate = publicUpdateLabel(tier, scope, hasFreshUpdateOutput);
  const capabilities = publicCapabilities(publicUpdate, scope, layers, hasFreshPublicOutput);
  const capability = stateCapability(
    tier,
    cleanText(row?.lifecycle || lifecycleEntry?.lifecycle, 80),
    hasFreshPublicOutput,
    liveStores,
    representedLiveCities,
    capabilities.publicUpdates,
  );
  const coverageStatusValue = deriveCoverageStatus(sourceBlocked, hasVerifiedSource, capabilities);
  const configuredPeakStrength = lifecycleEntry?.peakCoverageStrength;
  const coverageStrength = configuredPeakStrength && COVERAGE_STRENGTH_VALUES.includes(configuredPeakStrength)
    ? configuredPeakStrength
    : deriveCoverageStrength(coverageStatusValue, tier, scope);
  const areas = stateAreas(lifecycleEntry, row, locations, storeRecords);
  const precisions = coverageStatusValue === "not-available" ? [] : precisionLabels(lifecycleEntry, row, locations, storeRecords);
  const usableFreshPublicSignals = hasFreshPublicOutput ? args.dropEvidence.freshPublicSignalCount : 0;
  const usableFreshPublicUpdates = hasFreshUpdateOutput
    ? Math.max(
      args.dropEvidence.freshPublicUpdateSignalCount,
      supportsDirectStoreAvailability ? 0 : args.dropEvidence.freshPublicSignalCount,
    )
    : 0;
  const coverageDepth = deriveCoverageDepth({
    coverageTier: tier,
    freshPublicSignals: usableFreshPublicSignals,
    currentInventoryStores: liveStores,
    currentInventoryCities: representedLiveCities,
    freshPublicUpdates: usableFreshPublicUpdates,
    freshUpdateBoards: hasFreshPublicOutput ? args.dropEvidence.freshPublicUpdateBoards : 0,
    freshUpdateStores: hasFreshPublicOutput ? args.dropEvidence.freshPublicUpdateStores : 0,
    freshUpdateCities: hasFreshPublicOutput ? args.dropEvidence.freshPublicUpdateCities : 0,
    freshUpdateAreas: hasFreshPublicOutput ? args.dropEvidence.freshPublicUpdateAreas : 0,
  });
  const freshness: CoverageFreshnessEvidence = {
    observedInventoryStores: args.dropEvidence.observedInventoryStores.length,
    currentInventoryStores: liveStores,
    currentInventoryCities: representedLiveCities,
    alertEligibleStores: alertGradeStores,
    staleInventoryStores: supportsDirectStoreAvailability ? args.dropEvidence.staleInventoryStoreCount : 0,
    freshPublicSignals: usableFreshPublicSignals,
    freshPublicUpdates: usableFreshPublicUpdates,
    freshPublicUpdateBoards: hasFreshPublicOutput ? args.dropEvidence.freshPublicUpdateBoards : 0,
    freshPublicUpdateStores: hasFreshPublicOutput ? args.dropEvidence.freshPublicUpdateStores : 0,
    freshPublicUpdateCities: hasFreshPublicOutput ? args.dropEvidence.freshPublicUpdateCities : 0,
    freshPublicUpdateAreas: hasFreshPublicOutput ? args.dropEvidence.freshPublicUpdateAreas : 0,
    stalePublicSignals: args.dropEvidence.stalePublicSignalCount,
  };
  const freshnessLimited = args.dropEvidence.stalePublicSignalCount > 0 && usableFreshPublicSignals === 0;
  const health = stateHealth(
    internalStateKey,
    coverageStatusValue,
    row,
    args.degradedStates,
    args.healthLimited,
    freshnessLimited,
    sourceBlocked,
    hasFreshPublicOutput,
  );
  const hasReviewedKnownLayer = capability === "not-active" && layers.known > 0;
  const summary = coverageStatusValue === "not-available"
    ? hasReviewedKnownLayer
      ? "Known directory locations can guide expansion work, but no fresh customer-facing monitoring source is active."
      : "No current customer-facing monitoring source is active. Request coverage to help prioritize expansion."
    : cleanText(row?.customerSummary || lifecycleEntry?.customerSummary, 600)
      || "Current source-backed coverage is available at the precision shown here.";
  const sourceLabel = cleanText(row?.sourceLabel || lifecycleEntry?.sourceLabel, 180) || null;
  const customerSummary = summaryCopy(publicUpdate, capabilities, coverageStatusValue === "available", sourceLabel);
  const copy = visibilityCopy(
    args.code,
    tier,
    capability,
    layers,
    scope,
    summary,
    coverageStatusValue === "available",
    hasFreshPublicOutput,
  );
  const customerCopy = customerVisibilityCopy(
    publicUpdate,
    capabilities,
    scope,
    coverageStatusValue === "available",
    sourceLabel,
  );
  const state: CoverageState = {
    code: args.code,
    name: cleanText(lifecycleEntry?.customerLabel || row?.label, 120) || args.defaultName,
    capability,
    capabilityLabel: coverageCapabilityLabel(capability, capabilities, publicUpdate, coverageStatusValue === "available"),
    coverageDepth,
    coverageDepthLabel: COVERAGE_DEPTH_LABELS[coverageDepth],
    coverageStatus: coverageStatusValue,
    coverageStatusLabel: COVERAGE_STATUS_LABELS[coverageStatusValue],
    coverageStrength,
    coverageStrengthLabel: COVERAGE_STRENGTH_LABELS[coverageStrength],
    capabilities,
    updateLabel: publicUpdate,

    health,
    healthLabel: HEALTH_LABELS[health],
    summary,
    sourceLabel: coverageStatusValue === "not-available" && !hasReviewedKnownLayer
      ? null
      : sourceLabel,
    precisions,
    areas,
    representedAreaCount: hasFreshPublicOutput
      ? Math.max(args.dropEvidence.freshPublicUpdateAreas, args.dropEvidence.currentInventoryCities)
      : 0,
    monitoredStoreCount: scope.inventoryMonitoredStores,
    layers,
    scope,
    freshness,
    canSee: copy.canSee,
    cannotSee: copy.cannotSee,
    customerSummary,
    customerCanSee: customerCopy.canSee,
    customerCannotSee: customerCopy.cannotSee,
    fingerprint: "",
  };
  // Request automation uses this evidence fingerprint as a baseline. Keep its
  // established v2 shape so adding a customer-display tier cannot manufacture
  // a coverage improvement or notification.
  state.fingerprint = [
    "coverage-v2",
    state.code,
    state.capability,
    state.coverageStatus,
    state.coverageDepth,
    state.precisions.join(","),
    state.layers.known,
    state.layers.probeable,
    state.layers.catalogWatch,
    state.layers.live,
    state.layers.alertGrade,
    state.scope.knownBoards,
    state.scope.shipmentBoards,
    state.scope.searchableStores,
    state.scope.inventoryMonitoredStores,
    state.scope.singleStoreShipmentBoards,
    state.freshness.observedInventoryStores,
    state.freshness.currentInventoryStores,
    state.freshness.alertEligibleStores,
    state.freshness.staleInventoryStores,
    state.freshness.stalePublicSignals,
  ].join("|");
  return state;
}

export function buildCoverageContract(args: {
  lifecycle: CoverageLifecycleInput;
  stateRows?: readonly CoverageStateRowInput[];
  locations?: readonly CoverageLocationInput[];
  stores?: readonly CoverageStoreInput[];
  drops?: readonly CoverageDropInput[];
  degradedStates?: readonly Record<string, unknown>[];
  generatedAt?: string;
  asOf?: string;
  healthLimited?: boolean;
  ncBoardIntelligence?: CoverageNcBoardIntelligenceInput | null;
}): CoverageContract {
  const stateRows = args.stateRows || [];
  const locations = args.locations || [];
  const stores = args.stores || [];
  const drops = args.drops || [];
  const degradedStates = args.degradedStates || [];
  const generatedAt = cleanText(args.generatedAt, 80) || null;
  // Tests may use a captured engine snapshot as their clock; live callers pass a
  // wall-clock value so old retained rows age out without a new deployment.
  const evaluatedAt = cleanText(args.asOf, 80) || generatedAt || new Date().toISOString();
  const evidenceByState = derivePublicDropEvidence(drops, evaluatedAt, {
    degradedStateCodes: feedDegradedStateCodes(degradedStates),
  });
  return {
    contractVersion: "bourbon-signal/coverage@3",
    generatedAt,
    evaluatedAt,
    states: US_STATES.map(([code, defaultName]) => buildState({
      code,
      defaultName,
      lifecycle: args.lifecycle,
      stateRows,
      locations,
      stores,
      degradedStates,
      dropEvidence: evidenceByState.get(code) || EMPTY_DROP_EVIDENCE,
      healthLimited: args.healthLimited === true,
      ncBoardIntelligence: args.ncBoardIntelligence,
    })),
  };
}

function searchStatusDetail(status: CoverageSearchStatus) {
  if (status === "covered") return "Current bottle availability is available for this area.";
  if (status === "partially-covered") return "Some coverage is available; current bottle availability may be limited.";
  if (status === "known-not-active") return "We can list this area, but we do not currently check bottle availability here.";
  if (status === "actively-monitored") return "We check this store for current bottle availability when information is available.";
  if (status === "known-expansion-candidate") return "We can list this store, but we do not currently check bottle availability here.";
  return "We do not currently have this city or store in our list.";
}

export function searchCoverageTargets(args: {
  stateCode: string;
  query: string;
  lifecycle: CoverageLifecycleInput;
  stateRows?: readonly CoverageStateRowInput[];
  locations?: readonly CoverageLocationInput[];
  stores?: readonly CoverageStoreInput[];
  drops?: readonly CoverageDropInput[];
  degradedStates?: readonly Record<string, unknown>[];
  ncBoardIntelligence?: CoverageNcBoardIntelligenceInput | null;
  asOf?: string;
  healthLimited?: boolean;
  limit?: number;
}): CoverageSearchResult[] {
  const stateCode = publicStateCode(args.stateCode);
  if (!US_STATE_CODES.includes(stateCode as typeof US_STATE_CODES[number])) return [];
  const query = cleanText(args.query, 120);
  const queryToken = coverageTargetToken(query, 120);
  if (!queryToken) return [];
  const internalStateKey = coverageInternalStateKey(stateCode, args.lifecycle);
  const records = stateStoreRecords(internalStateKey, args.locations || [], args.stores || []);
  const searchableRecords = records.filter((record) => record.searchable);
  const row = (args.stateRows || []).find((entry) => String(entry.state || "").toUpperCase() === internalStateKey);
  const lifecycleEntry = args.lifecycle.states[internalStateKey];
  const locations = stateLocations(internalStateKey, args.locations || []);
  const stateTier = cleanText(row?.coverageTier || lifecycleEntry?.coverageTier, 80);
  const evaluatedAt = cleanText(args.asOf, 80) || new Date().toISOString();
  const currentEvidence = derivePublicDropEvidence(args.drops || [], evaluatedAt, {
    degradedStateCodes: feedDegradedStateCodes(args.degradedStates || []),
  }).get(stateCode) || EMPTY_DROP_EVIDENCE;
  const coverageState = buildCoverageContract({
    lifecycle: args.lifecycle,
    stateRows: args.stateRows,
    locations: args.locations,
    stores: args.stores,
    drops: args.drops,
    degradedStates: args.degradedStates,
    asOf: evaluatedAt,
    healthLimited: args.healthLimited,
    ncBoardIntelligence: args.ncBoardIntelligence,
  }).states.find((state) => state.code === stateCode);
  const sourceAvailable = coverageState?.capabilities.currentBottleAvailability === true;
  const publicUpdateAvailable = coverageState?.capabilities.publicUpdates === true;
  const currentInventoryEvidence = sourceAvailable ? currentEvidence.currentInventoryStores : [];
  const sourceEvidenceCounts = new Map<string, number>();
  for (const evidence of currentInventoryEvidence) {
    for (const key of evidence.keys) {
      if (!key.includes(":source:")) continue;
      sourceEvidenceCounts.set(key, (sourceEvidenceCounts.get(key) || 0) + 1);
    }
  }
  const ambiguousSourceIdKeys = new Set(
    Array.from(sourceEvidenceCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([key]) => key),
  );
  const storeHasCurrentEvidence = (store: StoreRecord) => {
    if (!sourceAvailable) return false;
    return currentInventoryEvidence.some((evidence) => evidenceMatchesStore(stateCode, evidence, store, ambiguousSourceIdKeys));
  };
  const currentEvidenceCities = new Set(currentInventoryEvidence
    .map((evidence) => coverageTargetToken(evidence.city, 120))
    .filter(Boolean));
  const limit = Math.max(1, Math.min(20, Math.floor(args.limit || 12)));
  const results: CoverageSearchResult[] = [];

  const cityNames = new Set<string>();
  const searchableAreaLocations = locations.filter((location) => location.searchable !== false && !isStoreLocation(location));
  for (const value of [
    ...(lifecycleEntry?.areaOptions || []),
    ...searchableRecords.flatMap((record) => [record.city, record.county]),
    ...currentInventoryEvidence.map((evidence) => evidence.city),
    ...searchableAreaLocations.flatMap((location) => [
      location.city,
      location.county,
      /board/i.test(String(location.type || location.locationType || "")) ? location.name : null,
    ]),
  ]) {
    const label = cleanText(value, 120);
    if (label && coverageTargetToken(label).includes(queryToken)) cityNames.add(label);
  }
  for (const city of [...cityNames].sort((left, right) => left.localeCompare(right))) {
    const cityToken = coverageTargetToken(city);
    const cityStores = searchableRecords.filter((record) => (
      coverageTargetToken(record.city) === cityToken || coverageTargetToken(record.county) === cityToken
    ));
    const monitoredStoreCount = cityStores.filter((record) => storeHasCurrentEvidence(record)).length;
    const monitored = currentEvidenceCities.has(cityToken) ? Math.max(1, monitoredStoreCount) : monitoredStoreCount;
    const currentUpdateAtArea = publicUpdateAvailable && currentEvidence.freshPublicUpdateAreaKeys.some((key) => (
      key === `city:${cityToken}`
      || key === `county:${cityToken}`
      || key === `board:${cityToken}`
      || key === "statewide"
    ));
    const status: CoverageSearchStatus = monitored === 0
      ? currentUpdateAtArea
        ? "partially-covered"
        : "known-not-active"
      : monitored < cityStores.length || INTELLIGENCE_TIERS.has(stateTier) || stateTier === "retailer_warehouse_inventory"
        ? "partially-covered"
        : "covered";
    results.push({
      kind: "city",
      label: city,
      stateCode,
      status,
      canonicalTargetKey: `city:${stateCode}:${cityToken}`,
      detail: searchStatusDetail(status),
      city,
    });
  }

  for (const store of searchableRecords) {
    const haystack = coverageTargetToken([store.name, store.city, store.county, store.address].filter(Boolean).join(" "), 400);
    if (!haystack.includes(queryToken)) continue;
    const status: CoverageSearchStatus = storeHasCurrentEvidence(store)
      ? "actively-monitored"
      : "known-expansion-candidate";
    results.push({
      kind: "store",
      label: store.name || "Known store",
      stateCode,
      status,
      canonicalTargetKey: `store:${stateCode}:${coverageTargetToken(store.id, 120)}`,
      detail: searchStatusDetail(status),
      storeId: store.id,
      city: store.city || undefined,
      address: store.address || undefined,
    });
  }

  if (sourceAvailable) {
    for (const evidence of currentInventoryEvidence) {
      const haystack = coverageTargetToken([evidence.name, evidence.city, evidence.county, evidence.address].filter(Boolean).join(" "), 400);
      if (!haystack.includes(queryToken)) continue;
      if (searchableRecords.some((store) => evidenceMatchesStore(stateCode, evidence, store, ambiguousSourceIdKeys))) continue;
      const dynamicStoreId = evidenceRequestId(evidence);
      results.push({
        kind: "store",
        label: evidence.name || evidence.address || "Current retailer availability",
        stateCode,
        status: "actively-monitored",
        canonicalTargetKey: `store:${stateCode}:${coverageTargetToken(dynamicStoreId, 180)}`,
        detail: searchStatusDetail("actively-monitored"),
        storeId: dynamicStoreId,
        city: evidence.city || undefined,
        address: evidence.address || undefined,
      });
    }
  }

  if (results.length === 0) {
    return [{
      kind: "unknown",
      label: query,
      stateCode,
      status: "not-found",
      canonicalTargetKey: null,
      detail: searchStatusDetail("not-found"),
    }];
  }
  return results
    .sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "city" ? -1 : 1;
      if (left.status !== right.status) return left.status === "actively-monitored" || left.status === "covered" ? -1 : 1;
      return left.label.localeCompare(right.label);
    })
    .slice(0, limit);
}

export function findCoverageStoreTarget(args: {
  stateCode: string;
  storeId: string;
  lifecycle: CoverageLifecycleInput;
  stateRows?: readonly CoverageStateRowInput[];
  locations?: readonly CoverageLocationInput[];
  stores?: readonly CoverageStoreInput[];
  drops?: readonly CoverageDropInput[];
  degradedStates?: readonly Record<string, unknown>[];
  ncBoardIntelligence?: CoverageNcBoardIntelligenceInput | null;
  asOf?: string;
  healthLimited?: boolean;
}): CoverageStoreMatch | null {
  const stateCode = publicStateCode(args.stateCode);
  const internalStateKey = coverageInternalStateKey(stateCode, args.lifecycle);
  const requestedId = cleanText(args.storeId, 400);
  if (!requestedId) return null;
  const evidenceIdentity = requestedId.startsWith("evidence:") ? requestedId.slice("evidence:".length) : "";
  if (evidenceIdentity) {
    const evaluatedAt = cleanText(args.asOf, 80) || new Date().toISOString();
    const coverageState = buildCoverageContract({
      lifecycle: args.lifecycle,
      stateRows: args.stateRows,
      locations: args.locations,
      stores: args.stores,
      drops: args.drops,
      degradedStates: args.degradedStates,
      ncBoardIntelligence: args.ncBoardIntelligence,
      asOf: evaluatedAt,
      healthLimited: args.healthLimited,
    }).states.find((state) => state.code === stateCode);
    if (!coverageState?.capabilities.currentBottleAvailability) return null;
    const evidence = (derivePublicDropEvidence(args.drops || [], evaluatedAt, {
      degradedStateCodes: feedDegradedStateCodes(args.degradedStates || []),
    }).get(stateCode) || EMPTY_DROP_EVIDENCE)
      .currentInventoryStores.find((entry) => evidenceTargetId(entry) === evidenceIdentity);
    if (!evidence) return null;
    return {
      id: evidenceRequestId(evidence),
      name: evidence.name || evidence.address || "Current retailer availability",
      city: evidence.city || undefined,
      address: evidence.address || undefined,
    };
  }

  const store = stateStoreRecords(internalStateKey, args.locations || [], args.stores || [])
    .find((record) => record.searchable && record.id === requestedId);
  if (!store) return null;
  return {
    id: store.id,
    name: store.name,
    city: store.city || undefined,
    address: store.address || undefined,
  };
}
