export const COVERAGE_CAPABILITIES = ["deep", "active", "focused", "intelligence", "not-active"] as const;
export const COVERAGE_HEALTH_LEVELS = ["current", "intermittent", "temporarily-limited", "no-recent-update"] as const;

export type CoverageCapability = typeof COVERAGE_CAPABILITIES[number];
export type CoverageHealth = typeof COVERAGE_HEALTH_LEVELS[number];

export interface CoverageLifecycleEntryInput {
  readonly customerLabel?: string;
  readonly sourceLabel?: string;
  readonly customerAreaLabel?: string;
  readonly areaOptions?: readonly string[];
  readonly publicStatus?: string;
  readonly lifecycle?: string;
  readonly coverageTier?: string;
  readonly refinementLevel?: string;
  readonly inventoryAlertable?: boolean;
  readonly watchAlertable?: boolean;
  readonly customerSummary?: string;
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

export interface CoverageLayerCounts {
  known: number;
  probeable: number;
  catalogWatch: number;
  live: number;
  alertGrade: number;
}

export interface CoverageState {
  code: string;
  name: string;
  capability: CoverageCapability;
  capabilityLabel: string;
  health: CoverageHealth;
  healthLabel: string;
  summary: string;
  sourceLabel: string | null;
  precisions: string[];
  areas: string[];
  representedAreaCount: number;
  monitoredStoreCount: number;
  layers: CoverageLayerCounts;
  canSee: string[];
  cannotSee: string[];
  fingerprint: string;
}

export interface CoverageContract {
  contractVersion: "bourbon-signal/coverage@1";
  generatedAt: string | null;
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
  deep: "Deep coverage",
  active: "Active coverage",
  focused: "Focused coverage",
  intelligence: "Sparse coverage",
  "not-active": "Not active yet",
};

const HEALTH_LABELS: Record<CoverageHealth, string> = {
  current: "Current",
  intermittent: "Intermittent",
  "temporarily-limited": "Temporarily limited",
  "no-recent-update": "No recent update",
};

const LIVE_TIERS = new Set(["live_store_inventory", "store_availability_status"]);
const INTELLIGENCE_TIERS = new Set([
  "store_delivery_leads",
  "shipment_drop_intelligence",
  "aggregate_inventory_watch",
  "distillery_release_watch",
]);

function publicStateCode(value: unknown) {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized === "MD-MONTGOMERY" ? "MD" : normalized;
}

export function coverageInternalStateKey(stateCode: string, lifecycle: CoverageLifecycleInput) {
  const normalized = publicStateCode(stateCode);
  if (normalized === "MD" && lifecycle.states["MD-MONTGOMERY"]) return "MD-MONTGOMERY";
  return normalized;
}

function cleanText(value: unknown, maxLength = 240) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
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
    const hasSignals = previous?.hasSignals ?? ((Number(store.signalCount) || 0) > 0);
    const capabilities = previous
      ? { monitoringAttached: previous.monitoringAttached, liveInventory: previous.liveInventory }
      : sourceCapabilities(source, true);
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

function sourceIsCurrentlyAvailable(
  lifecycleEntry: CoverageLifecycleEntryInput | undefined,
  row: CoverageStateRowInput | undefined,
  stateLocationsList: readonly CoverageLocationInput[],
  stores: readonly StoreRecord[],
) {
  if (!lifecycleEntry || lifecycleEntry.publicStatus !== "active" || !row || row.publicStatus !== "active") return false;
  const bestPrecision = cleanText(row.bestLocationPrecision, 80).toLowerCase();
  const rowStatus = cleanText(row.status, 120).toLowerCase();
  if (bestPrecision === "blocked" || /(?:^|[_\s-])(blocked|disabled|retired|source-unavailable|source_unavailable)(?:$|[_\s-])/.test(rowStatus)) {
    return false;
  }
  const hasAttachedSource = stateLocationsList.some((location) => location.collectorAttached === true && !isStoreLocation(location));
  const hasCurrentStore = stores.some((store) => store.monitoringAttached);
  const hasCurrentSignals = Number(row.signalCount || 0) > 0;
  return hasAttachedSource || hasCurrentStore || hasCurrentSignals;
}

function stateCapability(
  coverageTier: string,
  lifecycle: string,
  currentSource: boolean,
  liveStores: number,
  representedLiveCities: number,
): CoverageCapability {
  if (!currentSource) return "not-active";
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
  if (coverageTier === "retailer_warehouse_inventory") return "intelligence";
  if (INTELLIGENCE_TIERS.has(coverageTier)) return "intelligence";
  return "not-active";
}

function stateHealth(
  internalStateKey: string,
  capability: CoverageCapability,
  row: CoverageStateRowInput | undefined,
  degradedStates: readonly Record<string, unknown>[],
  healthLimited: boolean,
): CoverageHealth {
  if (capability === "not-active") return "no-recent-update";
  if (healthLimited) return "temporarily-limited";
  const rowStatus = cleanText(row?.status, 100).toLowerCase();
  const degraded = degradedStates.some((entry) => String(entry.state || "").toUpperCase() === internalStateKey);
  if (degraded || rowStatus.includes("stale") || rowStatus.includes("fallback")) return "temporarily-limited";
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
  const candidateAreas = configuredAreas.length
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
  coverageTier: string,
  capability: CoverageCapability,
  layers: CoverageLayerCounts,
  summary: string,
) {
  if (capability === "not-active") {
    return {
      canSee: layers.known > 0 ? ["Known directory locations that can guide expansion work."] : ["No current customer-facing monitoring source."],
      cannotSee: ["Live shelf or alert-grade monitoring in this state."],
    };
  }
  if (coverageTier === "live_store_inventory") {
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

function buildState(args: {
  code: string;
  defaultName: string;
  lifecycle: CoverageLifecycleInput;
  stateRows: readonly CoverageStateRowInput[];
  locations: readonly CoverageLocationInput[];
  stores: readonly CoverageStoreInput[];
  degradedStates: readonly Record<string, unknown>[];
  healthLimited: boolean;
}) {
  const internalStateKey = coverageInternalStateKey(args.code, args.lifecycle);
  const lifecycleEntry = args.lifecycle.states[internalStateKey];
  const row = args.stateRows.find((entry) => String(entry.state || "").toUpperCase() === internalStateKey);
  const locations = stateLocations(internalStateKey, args.locations);
  const storeRecords = stateStoreRecords(internalStateKey, args.locations, args.stores);
  const tier = cleanText(row?.coverageTier || lifecycleEntry?.coverageTier, 80);
  const currentSource = sourceIsCurrentlyAvailable(lifecycleEntry, row, locations, storeRecords);
  const isLiveTier = LIVE_TIERS.has(tier);
  const liveStores = currentSource && isLiveTier
    ? storeRecords.filter((store) => store.searchable && store.liveInventory).length
    : 0;
  const alertGradeStores = currentSource && tier === "live_store_inventory" && lifecycleEntry?.inventoryAlertable !== false
    ? storeRecords.filter((store) => store.searchable && store.liveInventory && store.hasSignals).length
    : 0;
  const representedLiveCities = new Set(
    storeRecords.filter((store) => store.liveInventory).map((store) => store.city).filter(Boolean),
  ).size;
  const capability = stateCapability(
    tier,
    cleanText(row?.lifecycle || lifecycleEntry?.lifecycle, 80),
    currentSource,
    liveStores,
    representedLiveCities,
  );
  const health = stateHealth(internalStateKey, capability, row, args.degradedStates, args.healthLimited);
  const layers: CoverageLayerCounts = {
    known: storeRecords.length,
    probeable: storeRecords.filter((store) => store.searchable && store.monitoringAttached).length,
    catalogWatch: locations.filter((location) => location.collectorAttached === true && !isStoreLocation(location)).length
      + storeRecords.filter((store) => store.monitoringAttached && !store.liveInventory).length,
    live: liveStores,
    alertGrade: alertGradeStores,
  };
  const summary = capability === "not-active"
    ? "No current customer-facing monitoring source is active. Request coverage to help prioritize expansion."
    : cleanText(row?.customerSummary || lifecycleEntry?.customerSummary, 600)
      || "Current source-backed coverage is available at the precision shown here.";
  const areas = stateAreas(lifecycleEntry, row, locations, storeRecords);
  const copy = visibilityCopy(tier, capability, layers, summary);
  const precisions = capability === "not-active" ? [] : precisionLabels(lifecycleEntry, row, locations, storeRecords);
  const state: CoverageState = {
    code: args.code,
    name: cleanText(lifecycleEntry?.customerLabel || row?.label, 120) || args.defaultName,
    capability,
    capabilityLabel: CAPABILITY_LABELS[capability],
    health,
    healthLabel: HEALTH_LABELS[health],
    summary,
    sourceLabel: capability === "not-active" ? null : cleanText(row?.sourceLabel || lifecycleEntry?.sourceLabel, 180) || null,
    precisions,
    areas,
    representedAreaCount: areas.length,
    monitoredStoreCount: storeRecords.filter((store) => currentSource && store.monitoringAttached).length,
    layers,
    canSee: copy.canSee,
    cannotSee: copy.cannotSee,
    fingerprint: "",
  };
  state.fingerprint = [
    "coverage-v1",
    state.code,
    state.capability,
    state.precisions.join(","),
    state.layers.known,
    state.layers.probeable,
    state.layers.catalogWatch,
    state.layers.live,
    state.layers.alertGrade,
  ].join("|");
  return state;
}

export function buildCoverageContract(args: {
  lifecycle: CoverageLifecycleInput;
  stateRows?: readonly CoverageStateRowInput[];
  locations?: readonly CoverageLocationInput[];
  stores?: readonly CoverageStoreInput[];
  degradedStates?: readonly Record<string, unknown>[];
  generatedAt?: string;
  healthLimited?: boolean;
}): CoverageContract {
  const stateRows = args.stateRows || [];
  const locations = args.locations || [];
  const stores = args.stores || [];
  const degradedStates = args.degradedStates || [];
  return {
    contractVersion: "bourbon-signal/coverage@1",
    generatedAt: cleanText(args.generatedAt, 80) || null,
    states: US_STATES.map(([code, defaultName]) => buildState({
      code,
      defaultName,
      lifecycle: args.lifecycle,
      stateRows,
      locations,
      stores,
      degradedStates,
      healthLimited: args.healthLimited === true,
    })),
  };
}

function searchStatusDetail(status: CoverageSearchStatus) {
  if (status === "covered") return "Meaningful current monitoring supports this city or area.";
  if (status === "partially-covered") return "Selected stores or sources are monitored; citywide coverage is not implied.";
  if (status === "known-not-active") return "This city is in the directory, but no matching store has active monitoring.";
  if (status === "actively-monitored") return "This store is attached to a production monitoring source. Inventory is not implied.";
  if (status === "known-expansion-candidate") return "This store is known, but it is not actively monitored.";
  return "No matching city or store is in the current coverage directory.";
}

export function searchCoverageTargets(args: {
  stateCode: string;
  query: string;
  lifecycle: CoverageLifecycleInput;
  stateRows?: readonly CoverageStateRowInput[];
  locations?: readonly CoverageLocationInput[];
  stores?: readonly CoverageStoreInput[];
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
  const sourceAvailable = sourceIsCurrentlyAvailable(lifecycleEntry, row, locations, records);
  const limit = Math.max(1, Math.min(20, Math.floor(args.limit || 12)));
  const results: CoverageSearchResult[] = [];

  const cityNames = new Set<string>();
  for (const value of [
    ...(lifecycleEntry?.areaOptions || []),
    ...searchableRecords.flatMap((record) => [record.city, record.county]),
  ]) {
    const label = cleanText(value, 120);
    if (label && coverageTargetToken(label).includes(queryToken)) cityNames.add(label);
  }
  for (const city of [...cityNames].sort((left, right) => left.localeCompare(right))) {
    const cityToken = coverageTargetToken(city);
    const cityStores = searchableRecords.filter((record) => (
      coverageTargetToken(record.city) === cityToken || coverageTargetToken(record.county) === cityToken
    ));
    const monitored = sourceAvailable ? cityStores.filter((record) => record.monitoringAttached).length : 0;
    const stateTier = cleanText(row?.coverageTier || lifecycleEntry?.coverageTier, 80);
    const status: CoverageSearchStatus = monitored === 0
      ? sourceAvailable && (lifecycleEntry?.areaOptions || []).some((area) => coverageTargetToken(area) === cityToken)
        ? INTELLIGENCE_TIERS.has(stateTier) || stateTier === "retailer_warehouse_inventory" ? "partially-covered" : "covered"
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
    const status: CoverageSearchStatus = sourceAvailable && store.monitoringAttached
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
  locations?: readonly CoverageLocationInput[];
  stores?: readonly CoverageStoreInput[];
}): CoverageStoreMatch | null {
  const stateCode = publicStateCode(args.stateCode);
  const internalStateKey = coverageInternalStateKey(stateCode, args.lifecycle);
  const requestedId = cleanText(args.storeId, 160);
  if (!requestedId) return null;
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
