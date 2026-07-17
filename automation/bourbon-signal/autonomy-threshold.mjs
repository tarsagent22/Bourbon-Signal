import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONTRACT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'autonomy-threshold-contract.json');
export const AUTONOMY_THRESHOLD_CONTRACT = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'));

export function classifyExpansionAutonomy(candidate = {}) {
  const policy = AUTONOMY_THRESHOLD_CONTRACT.safeAutonomous;
  const reasons = [];
  if (!policy.sourceAuthority.includes(candidate.sourceAuthority)) reasons.push('source_not_official_or_first_party');
  if (candidate.termsStatus !== policy.termsStatus) reasons.push('legal_or_terms_uncertainty');
  if (candidate.authentication !== policy.authentication) reasons.push('authenticated_source');
  if (candidate.identity !== policy.identity) reasons.push('identity_ambiguity');
  if (candidate.availabilitySemantics !== policy.availabilitySemantics) reasons.push('availability_semantics_not_honest');
  if (candidate.verticalSlice !== policy.verticalSlice) reasons.push('incomplete_customer_vertical_slice');
  if (Number(candidate.shadowRuns) < policy.minimumShadowRuns || Number(candidate.canaryRuns) < policy.minimumCanaryRuns) reasons.push('insufficient_shadow_or_canary_evidence');
  if (candidate.withinBudget !== true) reasons.push('runtime_or_request_budget_exceeded');
  if (candidate.reversible !== true) reasons.push('non_reversible_change');
  if (candidate.outboundChange === true) reasons.push('outbound_communication_change');
  if (candidate.pricingOrEntitlementChange === true) reasons.push('pricing_or_entitlement_change');
  if (candidate.legalUncertainty === true && !reasons.includes('legal_or_terms_uncertainty')) reasons.push('legal_or_terms_uncertainty');
  return { lane: reasons.length ? 'approval_required' : 'safe_autonomous', reasons };
}
