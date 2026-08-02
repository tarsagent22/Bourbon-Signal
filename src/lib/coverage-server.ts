import "server-only";

import { STATE_LIFECYCLE_CONFIG } from "@/config/stateLifecycle";
import mississippiKnownStores from "@/config/mississippi-known-stores.json";
import {
  buildCoverageContract,
  findCoverageStoreTarget,
  searchCoverageTargets,
  type CoverageDropInput,
  type CoverageLocationInput,
  type CoverageNcBoardIntelligenceInput,
  type CoverageStateRowInput,
  type CoverageStoreInput,
} from "@/lib/coverage-model";
import { mergeCoverageStores } from "@/lib/coverage-known-stores";
import { retailerSubmissionToFeedCard } from "@/lib/retailer-signal-feed";
import { readCachedPublicRetailerSubmissions } from "@/lib/retailer-public-submissions";
import { normalizeDropForSite, readSiteExportResults } from "@/lib/site-engine-contract";
import { normalizePublicDropEvidenceInput } from "@/lib/public-drop-evidence";

interface CoverageStatsPayload {
  generatedAt?: string;
  refreshHealth?: { degradedStates?: Array<Record<string, unknown>> };
  stateCoverage?: { states?: CoverageStateRowInput[] };
  ncBoardIntelligence?: CoverageNcBoardIntelligenceInput | null;
}

interface CoverageLocationsPayload {
  locations?: CoverageLocationInput[];
}

interface CoverageStoresPayload {
  stores?: CoverageStoreInput[];
}

interface CoverageDropsPayload {
  drops?: CoverageDropInput[];
}

async function readVerifiedRetailerCoverageDrops(now: Date): Promise<CoverageDropInput[]> {
  if (!(
    process.env.BOURBON_QUEUE_DATABASE_URL
    || process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED
    || process.env.DATABASE_URL
  )) return [];

  try {
    const submissions = await readCachedPublicRetailerSubmissions();
    return submissions
      .map((submission) => retailerSubmissionToFeedCard(submission, now))
      .filter((drop): drop is NonNullable<typeof drop> => Boolean(drop)) as CoverageDropInput[];
  } catch (error) {
    console.warn("Coverage could not read verified retailer submissions", error instanceof Error ? error.name : "unknown error");
    return [];
  }
}

async function readCoverageInputs() {
  const now = new Date();
  const [statsResult, locationsResult, storesResult, dropsResult] = await readSiteExportResults(["stats", "locations", "stores", "drops"]);
  const retailerDrops = await readVerifiedRetailerCoverageDrops(now);
  const stats = (statsResult.payload || {}) as CoverageStatsPayload;
  const locations = (locationsResult.payload || {}) as CoverageLocationsPayload;
  const stores = (storesResult.payload || {}) as CoverageStoresPayload;
  const drops = (dropsResult.payload || {}) as CoverageDropsPayload;
  return {
    lifecycle: STATE_LIFECYCLE_CONFIG,
    stateRows: Array.isArray(stats.stateCoverage?.states) ? stats.stateCoverage.states : [],
    locations: Array.isArray(locations.locations) ? locations.locations : [],
    stores: mergeCoverageStores(
      mississippiKnownStores.stores as CoverageStoreInput[],
      Array.isArray(stores.stores) ? stores.stores : [],
    ),
    // Coverage must consume the same normalized records as the customer Drop
    // Feed; raw engine aliases cannot create a separate eligibility path.
    drops: [
      ...(Array.isArray(drops.drops) ? drops.drops : []),
      ...retailerDrops,
    ].map((drop) => normalizePublicDropEvidenceInput(normalizeDropForSite(drop as Record<string, unknown>))),
    degradedStates: Array.isArray(stats.refreshHealth?.degradedStates) ? stats.refreshHealth.degradedStates : [],
    generatedAt: stats.generatedAt,
    asOf: now.toISOString(),
    ncBoardIntelligence: stats.ncBoardIntelligence || null,
    healthLimited: [statsResult, locationsResult, storesResult, dropsResult]
      .some((result) => result.source === "cache-fallback" || result.source === "empty-fallback"),
    source: statsResult.source,
    snapshotId: statsResult.snapshotId,
  };
}

export async function readCurrentCoverageContract() {
  const inputs = await readCoverageInputs();
  return buildCoverageContract(inputs);
}

export async function searchCurrentCoverageTargets(stateCode: string, query: string) {
  const inputs = await readCoverageInputs();
  return searchCoverageTargets({ ...inputs, stateCode, query });
}

export async function readCurrentCoverageRequestContext(stateCode: string, storeId?: string) {
  const inputs = await readCoverageInputs();
  const contract = buildCoverageContract(inputs);
  return {
    state: contract.states.find((entry) => entry.code === stateCode.toUpperCase()) || null,
    matchedStore: storeId ? findCoverageStoreTarget({ ...inputs, stateCode, storeId }) : null,
  };
}
