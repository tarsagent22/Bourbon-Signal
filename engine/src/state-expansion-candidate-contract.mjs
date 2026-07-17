import { ALL_STATE_IDS, getStateName } from './discovery/state-name-registry.mjs';

export const ALL_US_STATE_IDS = ALL_STATE_IDS;

const LIFECYCLE_STAGES = new Set(['discovery', 'probeable', 'shadow', 'canary', 'active', 'alert_grade']);
const MARKET_CLASSIFICATIONS = new Set(['control', 'private', 'mixed']);
const REQUIRED_RECORD_FIELDS = [
  'state',
  'customerLabel',
  'marketClassification',
  'targetScopes',
  'lifecycleStage',
  'sourceClassesSought',
  'currentBlockers',
  'rankingInputs',
  'lastDiscoveryAt',
  'lastProbeAt',
  'nextEligibleAt',
  'requestBudget',
  'promotionEvidenceRefs',
];

function isOptionalTimestamp(value) {
  return value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));
}

function validateRecord(record, { expectedState, activeIds, errors, prefix }) {
  for (const field of REQUIRED_RECORD_FIELDS) {
    if (!(field in record)) errors.push(`${prefix} missing ${field}`);
  }
  if (expectedState && record.state !== expectedState) errors.push(`${prefix} has unexpected state id ${record.state || 'missing'}`);
  if (!getStateName(record.state)) errors.push(`${prefix} has an unknown state id`);
  if (typeof record.customerLabel !== 'string' || !record.customerLabel.trim()) errors.push(`${prefix} customerLabel must be a non-empty string`);
  if (!MARKET_CLASSIFICATIONS.has(record.marketClassification)) errors.push(`${prefix} marketClassification must be control, private, or mixed`);
  if (!Array.isArray(record.targetScopes) || !record.targetScopes.length) errors.push(`${prefix} targetScopes must be non-empty`);
  if (!LIFECYCLE_STAGES.has(record.lifecycleStage)) errors.push(`${prefix} lifecycleStage is invalid`);
  if (!Array.isArray(record.sourceClassesSought) || !record.sourceClassesSought.length) errors.push(`${prefix} sourceClassesSought must be non-empty`);
  if (!Array.isArray(record.currentBlockers)) errors.push(`${prefix} currentBlockers must be an array`);
  if (!record.rankingInputs || typeof record.rankingInputs !== 'object' || Array.isArray(record.rankingInputs)) errors.push(`${prefix} rankingInputs must be an object`);
  for (const field of ['lastDiscoveryAt', 'lastProbeAt', 'nextEligibleAt']) {
    if (!isOptionalTimestamp(record[field])) errors.push(`${prefix} ${field} must be an ISO timestamp or null`);
  }
  if (!record.requestBudget || !Number.isInteger(record.requestBudget.maxQueriesPerRun) || record.requestBudget.maxQueriesPerRun < 0 || !Number.isInteger(record.requestBudget.maxProbesPerRun) || record.requestBudget.maxProbesPerRun < 0) {
    errors.push(`${prefix} requestBudget must declare non-negative query and probe bounds`);
  }
  if (!Array.isArray(record.promotionEvidenceRefs)) errors.push(`${prefix} promotionEvidenceRefs must be an array`);
  if (activeIds.has(record.state) && record.lifecycleStage === 'discovery') errors.push(`${prefix} discovery record cannot be customer-active`);
}

export function validateStateExpansionCandidates(registry, { activeStateIds = [] } = {}) {
  const errors = [];
  const states = Array.isArray(registry?.states) ? registry.states : [];
  const scopedControlMarkets = Array.isArray(registry?.scopedControlMarkets) ? registry.scopedControlMarkets : [];
  const activeIds = new Set(activeStateIds);
  const ids = states.map((record) => record?.state).filter(Boolean);
  const missing = ALL_US_STATE_IDS.filter((id) => !ids.includes(id));
  const extras = ids.filter((id) => !ALL_US_STATE_IDS.includes(id));
  if (states.length !== ALL_US_STATE_IDS.length || missing.length || extras.length || new Set(ids).size !== ids.length) {
    errors.push(`registry must contain exactly all 50 states; missing=${missing.join(',') || 'none'} extras=${extras.join(',') || 'none'}`);
  }
  for (const record of states) validateRecord(record || {}, { expectedState: record?.state, activeIds, errors, prefix: `state ${record?.state || 'unknown'}` });
  for (const market of scopedControlMarkets) {
    validateRecord({ ...market, state: market?.state || 'MD' }, { activeIds, errors, prefix: `scoped market ${market?.id || 'unknown'}` });
    if (!market?.id || !/^[A-Z]{2}-[A-Z0-9-]+$/.test(market.id)) errors.push('scoped market id must be a stable STATE-SCOPE identifier');
    if (activeIds.has(market?.id) && market.lifecycleStage === 'discovery') errors.push(`scoped market ${market.id} discovery record cannot be customer-active`);
  }
  for (const activeId of activeIds) {
    const exists = states.some((record) => record.state === activeId) || scopedControlMarkets.some((market) => market.id === activeId);
    if (!exists) errors.push(`customer-active id ${activeId} is missing from the candidate registry`);
  }
  return { ok: errors.length === 0, errors };
}
