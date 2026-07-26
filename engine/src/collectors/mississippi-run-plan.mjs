import { MISSISSIPPI_RETAILER_SOURCES } from './mississippi-retailer-surfaces.mjs';

export function buildMississippiRunPlan() {
  return {
    schemaVersion: 1,
    state: 'MS',
    concurrency: 2,
    perDomain: 1,
    timeoutMs: 30_000,
    maxAttempts: 1,
    maxResponseBytes: 8 * 1024 * 1024,
    partitions: MISSISSIPPI_RETAILER_SOURCES
      .filter((source) => source.autonomousFetchAllowed !== false)
      .map((source) => ({
      id: source.sourceRuntimeId,
      platform: source.platform,
      hostname: source.hostname,
      permitNumber: source.permitNumber,
      regionId: source.regionId,
      cadenceTier: source.cadenceTier,
      sourceScopedLastGood: true,
    })),
  };
}
