import { createSourceSkippedResult, markSourceValueNonAlertable } from '../sources/source-result.mjs';

// The failed production pass did not save its source-denial cache. Do not
// reconstruct a clear ledger from absent data or automatically retry the lane.
// Re-enabling requires a separate reviewed change after denial-evidence review.
export const TEXAS_LEGACY_PRECISION_POLICY = Object.freeze({
  id: 'tx-legacy-precision-suspended-20261029',
  sourceId: 'precision:tx',
  decision: 'disabled',
  directRequestsAllowed: false,
  failedWorkflowRunId: '40804307576',
  reason: 'The failed production pass did not persist its denial ledger; direct legacy Texas collection is suspended pending denial-evidence review.',
});

export function texasLegacyPrecisionPolicyReport({ previousSourceResults = {}, nowAt = new Date().toISOString() } = {}) {
  const policy = TEXAS_LEGACY_PRECISION_POLICY;
  const previous = previousSourceResults[policy.sourceId] || null;
  const value = markSourceValueNonAlertable(previous?.value || { signals: [], roadblocks: [] }, policy.reason, { stale: true });
  const signals = value.signals || [];
  const adapter = { id: policy.sourceId, label: 'Texas legacy precision collection (suspended)', url: previous?.sourceUrl || null,
    metadata: { stateId: 'TX', lane: 'precision', policyId: policy.id } };
  const sourceResult = {
    ...createSourceSkippedResult({ adapter, previous, status: 'disabled', now: nowAt,
      schedule: { sourceId: policy.sourceId, decision: 'policy_disabled' } }),
    value, stale: signals.length > 0,
    metadata: { ...(previous?.metadata || {}), policy },
  };
  const roadblock = { state: 'TX', source: adapter.label, sourceRuntimeId: policy.sourceId, url: adapter.url,
    status: 'source_policy_disabled', policyId: policy.id, attemptCount: 0, error: policy.reason,
    nextRoute: 'Use the independently reviewed HotSpot Shopify pickup leaf; review the missing denial ledger before changing this policy.' };
  return {
    signals, roadblocks: [roadblock], sourceResults: [sourceResult], metadata: { policy },
    stale: signals.length > 0, staleReason: signals.length ? policy.reason : null,
    sourceReports: [{ sourceRuntimeId: policy.sourceId, label: adapter.label, url: adapter.url,
      ok: false, stale: signals.length > 0, status: 'source_policy_disabled', sourceRuntimeStatus: 'disabled',
      reachabilityEligible: false, signalProducingEligible: false, checkedAt: previous?.checkedAt || null,
      lastGoodAt: previous?.lastGoodAt || null, contentType: 'source-runtime-policy-skip', bytes: 0, elapsedMs: 0,
      signalType: 'source_policy_disabled', matchedBottleCount: 0, pdfLinkCount: 0, documentLinkCount: 0, error: policy.reason }],
  };
}
