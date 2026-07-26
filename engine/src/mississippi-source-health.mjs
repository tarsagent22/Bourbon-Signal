import { MISSISSIPPI_RETAILER_SOURCES } from './collectors/mississippi-retailer-surfaces.mjs';

export function summarizeMississippiSourceHealth({ atlas, sourceResults = [], generatedAt = new Date().toISOString() } = {}) {
  if (atlas?.state !== 'MS' || !Array.isArray(atlas.stores)) throw new TypeError('Mississippi source health requires the canonical source atlas');
  const runtimeById = new Map(sourceResults.map((result) => [result.sourceId, result]));
  const inventorySourceByPermit = new Map(MISSISSIPPI_RETAILER_SOURCES.map((source) => [source.permitNumber, source]));
  const relevant = atlas.stores.filter((store) => store.healthVisible === true && store.disposition !== 'directory_only');
  const entries = relevant.map((store) => {
    const inventorySource = inventorySourceByPermit.get(store.permitNumber);
    const sourceRuntimeId = store.sourceRuntimeId
      || inventorySource?.sourceRuntimeId
      || `probe:ms:bottlecapps:${store.platformIds?.siteId || store.permitNumber}`;
    const runtime = runtimeById.get(sourceRuntimeId);
    const probeStatus = store.lastProbeStatus || store.probeStatus || store.disposition;

    return {
      permitNumber: store.permitNumber,
      storeId: store.id,
      name: store.appName || store.name || store.officialIdentity?.dba,
      regionId: store.regionId || store.officialIdentity?.regionId,
      platform: store.platform,
      sourceRuntimeId,
      status: runtime?.status || (store.disposition === 'live_inventory' ? 'baseline_pending_shadow' : probeStatus),
      checkedAt: runtime?.checkedAt || null,
      lastGoodAt: runtime?.lastGoodAt || null,
      stale: runtime?.stale === true,
      quarantined: runtime?.quarantined === true,
      healthVisible: true,
      inventoryAuthoritative: store.inventoryAuthoritative === true,
      alertable: false,
      inventoryAlertable: false,
      watchAlertable: false,
      roadblock: store.roadblockCode || store.roadblock,
    };
  });
  return {
    schemaVersion: 1,
    contractVersion: 'bourbon-signal/ms-source-health@1',
    state: 'MS',
    generatedAt,
    lifecycle: 'research_only',
    directorySourcePolicyStatus: 'source_policy_blocked',
    directoryAutonomousRequestsAllowed: false,
    inventorySources: entries.filter((entry) => entry.inventoryAuthoritative).length,
    blockedBySourcePolicy: entries.filter((entry) => entry.status === 'blocked_by_source_policy').length,
    sourceOffline: entries.filter((entry) => entry.status === 'source_offline').length,
    platformProbeOnly: entries.filter((entry) => entry.status === 'app_only_no_public_inventory').length,
    healthyInventorySources: entries.filter((entry) => entry.inventoryAuthoritative && entry.status === 'success' && !entry.stale && !entry.quarantined).length,
    alertableSources: 0,
    entries,
  };
}
