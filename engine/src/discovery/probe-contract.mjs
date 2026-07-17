export const PROBE_RESULT_CLASSES = Object.freeze([
  'rejected',
  'directory_only',
  'storefront_probeable',
  'catalog_watch',
  'binary_orderability',
  'store_availability',
  'exact_quantity_candidate',
  'official_release_lottery_event',
  'browser_escalation_required',
  'agent_investigation_required',
  'blocked_terms_identity_ambiguity',
]);

export function createProbeResult({
  source,
  resultClass,
  method,
  status = null,
  platformHints = [],
  browserEscalationEligible = false,
  reason = null,
} = {}) {
  if (!PROBE_RESULT_CLASSES.includes(resultClass)) throw new Error(`Unknown source-probe result class ${resultClass}.`);
  return {
    schemaVersion: 'bourbon-signal-source-probe-v1',
    sourceUrl: source?.url || null,
    state: source?.state || null,
    resultClass,
    method,
    status,
    platformHints,
    browserEscalationEligible: Boolean(browserEscalationEligible),
    reason,
    alertGrade: false,
    promotionEligible: false,
  };
}
