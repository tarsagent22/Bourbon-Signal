import "server-only";

import { STATE_LIFECYCLE_CONFIG } from "@/config/stateLifecycle";
import mississippiKnownStores from "@/config/mississippi-known-stores.json";
import {
  buildCoverageContract,
  findCoverageStoreTarget,
  searchCoverageTargets,
  type CoverageLocationInput,
  type CoverageNcBoardIntelligenceInput,
  type CoverageStateRowInput,
  type CoverageStoreInput,
} from "@/lib/coverage-model";
import { mergeCoverageStores } from "@/lib/coverage-known-stores";
import { readSiteExportResults } from "@/lib/site-engine-contract";

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

async function readCoverageInputs() {
  const [statsResult, locationsResult, storesResult] = await readSiteExportResults(["stats", "locations", "stores"]);
  const stats = (statsResult.payload || {}) as CoverageStatsPayload;
  const locations = (locationsResult.payload || {}) as CoverageLocationsPayload;
  const stores = (storesResult.payload || {}) as CoverageStoresPayload;
  return {
    lifecycle: STATE_LIFECYCLE_CONFIG,
    stateRows: Array.isArray(stats.stateCoverage?.states) ? stats.stateCoverage.states : [],
    locations: Array.isArray(locations.locations) ? locations.locations : [],
    stores: mergeCoverageStores(
      mississippiKnownStores.stores as CoverageStoreInput[],
      Array.isArray(stores.stores) ? stores.stores : [],
    ),
    degradedStates: Array.isArray(stats.refreshHealth?.degradedStates) ? stats.refreshHealth.degradedStates : [],
    generatedAt: stats.generatedAt,
    ncBoardIntelligence: stats.ncBoardIntelligence || null,
    healthLimited: [statsResult, locationsResult, storesResult]
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
