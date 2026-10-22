import { SOURCE_RESULT_CONTRACT_VERSION } from '../sources/source-result.mjs';

// The successful browser pickup lane is separate from these two direct HTML
// routes. A missing browser artifact must never revive a denied direct route.
export const PA_DIRECT_FWGS_ROUTE_POLICY = Object.freeze({
  id: 'pa-direct-fwgs-routes-retired-20261022',
  decision: 'disabled',
  stateId: 'PA',
  reportPath: '.operator/evidence/baseline-PA.json',
  reportSha256: 'b5eab6207477e09644336606af3ee2b2e9d047af3a488ec7229115bc02adb773',
  reportFinishedAt: '2026-10-22T17:58:10.949Z',
  directRequestsAllowed: false,
  replacementLane: 'validated_fwgs_browser_pickup_artifact',
});

const DENIED_CONFIGURED_ROUTES = Object.freeze([
  Object.freeze({
    url: 'https://www.finewineandgoodspirits.com/search?Ntt=bourbon',
    label: 'FWGS bourbon search',
    sourceId: 'pa:configured:cfea019a97b2f832',
    startedAt: '2026-10-22T17:57:55.467Z',
    finishedAt: '2026-10-22T17:57:55.928Z',
    checkedAt: '2026-10-22T17:57:55.928Z',
    lastGoodAt: '2026-09-02T15:02:37.545Z',
  }),
  Object.freeze({
    url: 'https://www.finewineandgoodspirits.com/faq',
    label: 'FWGS FAQ',
    sourceId: 'pa:configured:f8034efd4ac1d519',
    startedAt: '2026-10-22T17:57:55.928Z',
    finishedAt: '2026-10-22T17:57:56.262Z',
    checkedAt: '2026-10-22T17:57:56.262Z',
    lastGoodAt: '2026-09-02T15:02:38.162Z',
  }),
]);

function denialEvidence(route) {
  return {
    ...route,
    status: 'permanent_error',
    attemptCount: 1,
    httpStatus: 403,
    error: { name: 'PermanentSourceError', kind: 'permanent', message: 'Forbidden', transient: false, code: 'HTTP_403', status: 403, details: null },
  };
}

export function pennsylvaniaDirectFwgsRoadblock({
  url = 'https://www.finewineandgoodspirits.com/search',
  sourceRuntimeId = 'precision:pa',
  source = 'FWGS retired direct search/FAQ routes',
} = {}) {
  return {
    state: 'PA', source, url, sourceRuntimeId,
    status: 'source_policy_disabled',
    policyId: PA_DIRECT_FWGS_ROUTE_POLICY.id,
    attemptCount: 0,
    historicalHttpStatus: 403,
    denialEvidence: DENIED_CONFIGURED_ROUTES.map(denialEvidence),
    error: 'Direct FWGS search/FAQ collection is disabled after captured HTTP 403 responses; no direct request was made in this pass.',
    nextRoute: 'Keep direct routes disabled and use only a validated FWGS browser pickup artifact for exact-store inventory.',
  };
}

export function pennsylvaniaConfiguredSourceSkip(config, source, sourceId, { nowAt = new Date().toISOString() } = {}) {
  if (config?.id !== 'PA' || source?.kind !== 'html' || source.precisionOnly
    || source.sourceRuntimeKind && source.sourceRuntimeKind !== 'configured') return null;
  const route = DENIED_CONFIGURED_ROUTES.find((entry) => entry.url === source.url);
  if (!route) return null;
  const evidence = denialEvidence(route);
  const metadata = { policy: { ...PA_DIRECT_FWGS_ROUTE_POLICY }, historicalFailure: evidence };
  return {
    signals: [],
    roadblocks: [pennsylvaniaDirectFwgsRoadblock({ url: source.url, source: source.label, sourceRuntimeId: sourceId })],
    sourceReport: {
      sourceRuntimeId: sourceId, label: source.label, url: source.url,
      ok: false, stale: true, sourceRuntimeStatus: 'disabled',
      status: 'source_policy_disabled', historicalHttpStatus: 403,
      checkedAt: evidence.checkedAt, lastGoodAt: evidence.lastGoodAt,
      reachabilityEligible: false, signalProducingEligible: false,
      contentType: 'source-runtime-policy-skip', bytes: 0, elapsedMs: 0,
      signalType: 'source_policy_disabled', matchedBottleCount: 0,
      pdfLinkCount: 0, documentLinkCount: 0,
      error: 'Known direct-route HTTP 403 retained as historical evidence; no new request was made.',
    },
    sourceResult: {
      contractVersion: SOURCE_RESULT_CONTRACT_VERSION,
      sourceId, sourceLabel: source.label, sourceUrl: source.url,
      status: 'disabled', ok: false, stale: true, quarantined: false, alertable: false,
      attemptCount: 0, startedAt: nowAt, finishedAt: nowAt,
      checkedAt: evidence.checkedAt, lastGoodAt: evidence.lastGoodAt,
      recordsInspected: null, metadata, error: { ...evidence.error },
      sourceMetadata: { stateId: 'PA', lane: 'configured', policyId: PA_DIRECT_FWGS_ROUTE_POLICY.id },
      attempts: [], schedule: { sourceId, decision: 'policy_disabled' },
    },
  };
}
