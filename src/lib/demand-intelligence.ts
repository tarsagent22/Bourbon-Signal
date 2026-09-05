export interface AreaWatchlistDemand {
  complete: boolean;
  generatedAt: string;
  scannedMembers: number;
  minCohortSize: 5;
  cohorts: Array<{ area: string; canonicalBottleId: string; members: number }>;
}

// Joint membership, never the Cartesian product of independently aggregated
// geography and bottle counts. Only explicit watchlists; no inferred ownership.
export function aggregateAreaWatchlistDemand(
  members: readonly { id: string; areas: string[]; watchlist: string[] }[],
  options: { catalog: readonly DemandBottleCatalogItem[]; allowedAreas: readonly string[]; complete: boolean; generatedAt: string },
): AreaWatchlistDemand {
  const complete = options.complete && members.length <= 5000;
  const result: AreaWatchlistDemand = { complete, generatedAt: options.generatedAt, scannedMembers: members.length, minCohortSize: 5, cohorts: [] };
  if (!complete) return result;
  const lookup = buildBottleLookup(options.catalog), allowed = new Set(options.allowedAreas);
  const groups = new Map<string, { area: string; canonicalBottleId: string; members: Set<string> }>();
  for (const member of members) {
    if (!member.id) continue;
    for (const area of new Set(member.areas.filter(a => allowed.has(a)))) {
      for (const raw of member.watchlist.slice(0, 300)) {
        const canonical = lookup.get(bottleLookupKey(raw));
        if (!canonical) continue;
        const key = `${area}|${canonical.canonicalBottleId}`;
        const group = groups.get(key) || { area, canonicalBottleId: canonical.canonicalBottleId, members: new Set<string>() };
        group.members.add(member.id); groups.set(key, group);
      }
    }
  }
  result.cohorts = [...groups.values()].filter(g => g.members.size >= 5).map(g => ({ area: g.area, canonicalBottleId: g.canonicalBottleId, members: g.members.size }));
  return result;
}
export function areaWatchlistPriority(snapshot: AreaWatchlistDemand | null, area: string, bottleIds: readonly string[], now: string) {
  const age = Date.parse(now) - Date.parse(snapshot?.generatedAt || '');
  if (!snapshot?.complete || !Number.isFinite(age) || age < 0 || age > 24 * 3_600_000) return 0;
  return Math.min(100, snapshot.cohorts.filter(c => c.area === area && c.members >= 5 && bottleIds.includes(c.canonicalBottleId)).reduce((n, c) => n + c.members, 0));
}

export const DEFAULT_DEMAND_COHORT_SIZE = 5;

const MAX_DEMAND_INPUT_LENGTH = 180;
const EMAIL_SHAPE = /\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/i;
const URL_SHAPE = /(?:\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|net|org|io|co|us|info|biz)(?:\b|\/))/i;
const PHONE_SHAPE = /(?:\+?\d[\s().-]*){7,}/;

export interface DemandBottleCatalogItem {
  id?: string;
  name?: string;
  canonical_id?: string;
  canonical_name?: string;
  canonical_key?: string;
  aliases?: readonly string[];
  search_aliases?: readonly string[];
}

export interface DemandMemberInput {
  id?: string;
  publicMetadata?: Record<string, unknown>;
}

export interface CanonicalDemandBottle {
  canonicalBottleId: string;
  canonicalBottleName: string;
}

export interface DemandSnapshot {
  privacy: {
    minCohortSize: number;
    containsPii: false;
    containsRawHistory: false;
  };
  eligibleMembers: number;
  contributingMembers: number;
  bottles: Array<CanonicalDemandBottle & { memberCount: number; weightedDemand: number }>;
  geographies: Array<{ state: string; memberCount: number; weightedDemand: number }>;
  suppressed: {
    bottleCohorts: number;
    geographyCohorts: number;
  };
}

export function containsSensitiveDemandInput(value: unknown) {
  if (typeof value !== "string") return false;
  const candidate = value.trim();
  if (!candidate) return false;
  if (candidate.length > MAX_DEMAND_INPUT_LENGTH || /[\u0000-\u001f\u007f]/.test(candidate)) return true;
  if (EMAIL_SHAPE.test(candidate) || URL_SHAPE.test(candidate) || PHONE_SHAPE.test(candidate)) return true;
  return false;
}

function cleanDemandText(value: unknown) {
  if (typeof value !== "string" || containsSensitiveDemandInput(value)) return "";
  const clean = value.trim().replace(/\s+/g, " ");
  return clean.length > 0 && clean.length <= MAX_DEMAND_INPUT_LENGTH ? clean : "";
}

function bottleLookupKey(value: unknown) {
  return cleanDemandText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[\u2019']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalBottleFromCatalog(item: DemandBottleCatalogItem): CanonicalDemandBottle | null {
  const rawId = cleanDemandText(item.canonical_id || item.id).toLowerCase();
  const canonicalBottleId = /^[a-z0-9][a-z0-9_-]{0,159}$/.test(rawId) ? rawId : "";
  const canonicalBottleName = cleanDemandText(item.canonical_name || item.name);
  return canonicalBottleId && canonicalBottleName ? { canonicalBottleId, canonicalBottleName } : null;
}

function buildBottleLookup(catalog: readonly DemandBottleCatalogItem[]) {
  const lookup = new Map<string, CanonicalDemandBottle | null>();
  for (const item of catalog.slice(0, 2_000)) {
    const canonical = canonicalBottleFromCatalog(item);
    if (!canonical) continue;
    const aliases = [
      item.id,
      item.name,
      item.canonical_id,
      item.canonical_name,
      item.canonical_key,
      ...(item.aliases || []),
      ...(item.search_aliases || []),
    ];
    for (const alias of aliases) {
      const key = bottleLookupKey(alias);
      if (!key) continue;
      const existing = lookup.get(key);
      if (existing && existing.canonicalBottleId !== canonical.canonicalBottleId) lookup.set(key, null);
      else if (existing === undefined) lookup.set(key, canonical);
    }
  }
  return lookup;
}

export function resolveCanonicalDemandBottle(value: unknown, catalog: readonly DemandBottleCatalogItem[]) {
  const key = bottleLookupKey(value);
  if (!key) return null;
  return buildBottleLookup(catalog).get(key) || null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, 300)
    : [];
}

function metadataObject(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

interface MutableDemandCount {
  members: Set<string>;
  weightedDemand: number;
}

function collectionForUser(
  collections: ReadonlyMap<string, unknown> | Readonly<Record<string, unknown>> | undefined,
  userId: string | undefined,
) {
  if (!collections || !userId) return { found: false, value: null };
  if (collections instanceof Map) return { found: collections.has(userId), value: collections.get(userId) };
  const record = collections as Readonly<Record<string, unknown>>;
  return { found: Object.prototype.hasOwnProperty.call(record, userId), value: record[userId] };
}

export function aggregateMemberDemand(
  users: readonly DemandMemberInput[],
  options: {
    catalog: readonly DemandBottleCatalogItem[];
    approvedStateCodes: readonly string[];
    minCohortSize?: number;
    collectionsByUserId?: ReadonlyMap<string, unknown> | Readonly<Record<string, unknown>>;
  },
): DemandSnapshot {
  const minCohortSize = Math.max(DEFAULT_DEMAND_COHORT_SIZE, Math.floor(options.minCohortSize || DEFAULT_DEMAND_COHORT_SIZE));
  const approvedStates = new Set(options.approvedStateCodes.map((state) => state.trim().toUpperCase()).filter(Boolean));
  const bottleLookup = buildBottleLookup(options.catalog);
  const bottles = new Map<string, MutableDemandCount & CanonicalDemandBottle>();
  const geographies = new Map<string, MutableDemandCount>();
  const contributors = new Set<string>();

  users.slice(0, 20_000).forEach((user, index) => {
    const cohortKey = typeof user.id === "string" && user.id ? `member:${user.id}` : `row:${index}`;
    const metadata = metadataObject(user.publicMetadata);
    const alertPreferences = metadataObject(metadata.bottleAlertPreferences);
    const durableCollection = collectionForUser(options.collectionsByUserId, user.id);
    const collectionPreferences = metadataObject(durableCollection.found ? durableCollection.value : metadata.collectionPreferences);
    const areaPreferences = metadataObject(metadata.areaPreferences);
    const memberBottleWeights = new Map<string, { canonical: CanonicalDemandBottle; weight: number }>();

    const addBottle = (raw: unknown, weight: number) => {
      const key = bottleLookupKey(raw);
      const canonical = key ? bottleLookup.get(key) : null;
      if (!canonical) return;
      const current = memberBottleWeights.get(canonical.canonicalBottleId);
      if (!current || current.weight < weight) memberBottleWeights.set(canonical.canonicalBottleId, { canonical, weight });
    };

    for (const value of [...stringArray(alertPreferences.bottleNames), ...stringArray(alertPreferences.bottleKeys)]) addBottle(value, 4);
    const collection = Array.isArray(collectionPreferences.bottles) ? collectionPreferences.bottles.slice(0, 300) : [];
    for (const raw of collection) {
      const item = metadataObject(raw);
      addBottle(item.canonicalKey || item.bottleId || item.bottleName, item.wouldBuyAgain === true ? 3 : 1);
    }

    const memberStates = new Set(
      stringArray(areaPreferences.states)
        .map((state) => state.trim().toUpperCase())
        .filter((state) => approvedStates.has(state)),
    );

    for (const { canonical, weight } of memberBottleWeights.values()) {
      const current = bottles.get(canonical.canonicalBottleId) || { ...canonical, members: new Set<string>(), weightedDemand: 0 };
      if (!current.members.has(cohortKey)) {
        current.members.add(cohortKey);
        current.weightedDemand += weight;
      }
      bottles.set(canonical.canonicalBottleId, current);
      contributors.add(cohortKey);
    }
    for (const state of memberStates) {
      const current = geographies.get(state) || { members: new Set<string>(), weightedDemand: 0 };
      if (!current.members.has(cohortKey)) {
        current.members.add(cohortKey);
        current.weightedDemand += 2;
      }
      geographies.set(state, current);
      contributors.add(cohortKey);
    }
  });

  const visibleBottles = [...bottles.values()]
    .filter((item) => item.members.size >= minCohortSize)
    .map((item) => ({
      canonicalBottleId: item.canonicalBottleId,
      canonicalBottleName: item.canonicalBottleName,
      memberCount: item.members.size,
      weightedDemand: item.weightedDemand,
    }))
    .sort((a, b) => b.weightedDemand - a.weightedDemand || b.memberCount - a.memberCount || a.canonicalBottleName.localeCompare(b.canonicalBottleName));
  const visibleGeographies = [...geographies.entries()]
    .filter(([, item]) => item.members.size >= minCohortSize)
    .map(([state, item]) => ({ state, memberCount: item.members.size, weightedDemand: item.weightedDemand }))
    .sort((a, b) => b.weightedDemand - a.weightedDemand || a.state.localeCompare(b.state));

  return {
    privacy: { minCohortSize, containsPii: false, containsRawHistory: false },
    eligibleMembers: users.length,
    contributingMembers: contributors.size,
    bottles: visibleBottles,
    geographies: visibleGeographies,
    suppressed: {
      bottleCohorts: [...bottles.values()].filter((item) => item.members.size < minCohortSize).length,
      geographyCohorts: [...geographies.values()].filter((item) => item.members.size < minCohortSize).length,
    },
  };
}
