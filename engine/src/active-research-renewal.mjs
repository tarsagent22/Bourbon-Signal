import {isGroceryExpansionInventory} from './grocery-xapi-policy.mjs';
import {isCentralCityHiveResearchInventory} from './central-cityhive-policy.mjs';

export const ACTIVE_RESEARCH_RENEWAL_STATES = Object.freeze(['WA', 'NM', 'WI', 'OK']);
export const ACTIVE_RENEWAL_PRODUCTION_STATUSES = Object.freeze(['queued', 'in_progress', 'requested', 'waiting', 'pending']);
export const ACTIVE_RENEWAL_REPOSITORY = 'tarsagent22/Bourbon-Signal';
const channels = Object.freeze(['canAlertAsInventory', 'canAlertAsWatch', 'can_alert_as_inventory',
  'can_alert_as_watch', 'alertable', 'eligibleForOnSite', 'eligibleForDropFeed', 'eligibleForWatch',
  'eligibleForDelivery', 'deliveryEligible', 'eligibleForEmail', 'eligibleForSms']);
const id = value => String(value || '').trim().toUpperCase();

// Root's maintenance procedure supplies the authority: production is disabled
// before research starts and remains disabled until every incident is reviewed.
// This proves the observable preconditions, never cache visibility or approval
// to re-enable production after a research-ref denial.
export function validateActiveRenewalMaintenance({workflow, queues, recent, checkedAt, workflowRunId} = {}) {
  if (!Number.isSafeInteger(workflow?.id) || workflow.id < 1
    || workflow.path !== '.github/workflows/refresh-feed.yml' || workflow.state !== 'disabled_manually'
    || !Number.isFinite(Date.parse(checkedAt)) || !/^\d+$/.test(String(workflowRunId || '')))
    throw Error('Active renewal requires refresh-feed.yml disabled_manually under reviewed maintenance');
  for (const status of ACTIVE_RENEWAL_PRODUCTION_STATUSES) {
    const response = queues?.[status];
    if (response?.total_count !== 0 || !Array.isArray(response.workflow_runs) || response.workflow_runs.length)
      throw Error(`Active renewal requires zero ${status} production runs`);
  }
  if (!Number.isSafeInteger(recent?.total_count) || recent.total_count < 0 || !Array.isArray(recent.workflow_runs)
    || recent.workflow_runs.some(run => run.workflow_id !== workflow.id || run.status !== 'completed'))
    throw Error('Unknown or active production run in maintenance history');
  return {schemaVersion: 1, mode: 'root_mediated_production_maintenance', repository: ACTIVE_RENEWAL_REPOSITORY,
    workflowId: workflow.id, workflowPath: workflow.path, workflowState: workflow.state, workflowRunId: String(workflowRunId),
    checkedAt, checkedStatuses: [...ACTIVE_RENEWAL_PRODUCTION_STATUSES], activeProductionRunCount: 0,
    productionReenableAllowed: false, researchCachesVisibleToMain: false,
    reenableRequirement: 'Root reviews all production/research journals; any new denial or unresolved attempt keeps production disabled until a tested main-scope hold or state quarantine exists'};
}

// This grants only manual research selection. Production authority is checked
// independently by its unchanged collector, manifests and lifecycle.
export function selectActiveResearchRenewals({lifecycle, states = [], renewActiveStates = [],
  eventName, productionAllowed, researchSourceForState} = {}) {
  if (!Array.isArray(renewActiveStates)) throw Error('Active research renewal requires an explicit state list');
  const renewed = renewActiveStates.map(id);
  if (!renewed.length) return [];
  if (eventName !== 'workflow_dispatch') throw Error('Active research renewal is manual workflow_dispatch only');
  if (new Set(renewed).size !== renewed.length) throw Error('Duplicate active research renewal state');
  const requested = new Set(states.map(id));
  for (const state of renewed) {
    if (!ACTIVE_RESEARCH_RENEWAL_STATES.includes(state) || !requested.has(state))
      throw Error(`Unreviewed or non-explicit active research renewal state: ${state}`);
    const entry = lifecycle?.states?.[state];
    const source = researchSourceForState?.(state, {shadowMode: true});
    if (!lifecycle?.activeStates?.includes(state) || entry?.publicStatus !== 'active'
      || entry.promotionStage !== 'active' || entry.inventoryAlertable !== false || entry.watchAlertable !== false
      || source?.id !== state || source.active !== false || source.cadence !== 'shadow-only'
      || !Array.isArray(source.sources) || !source.sources.length
      || productionAllowed?.(state, lifecycle) !== true)
      throw Error(`Active research renewal lacks current reviewed production authority/adapter: ${state}`);
  }
  return renewed.sort();
}

export function suppressActiveRenewalReport(state, report) {
  if (!ACTIVE_RESEARCH_RENEWAL_STATES.includes(state) || report?.state !== state
    || report.metadata?.shadowOnly !== true || report.metadata.productionActivationAllowed !== false
    || report.metadata.customerDeliveryAllowed !== false || !Array.isArray(report.signals)
    || report.signals.some(row => row.state !== state || !String(row.sourceRuntimeId || '').startsWith(`research:${state.toLowerCase()}:`)
      || row.raw?.shadowOnly !== true || row.sourceProductBinding?.shadowOnly !== true))
    throw Error('Active renewal requires the registered research report, never production rows');
  return {...report, signals: report.signals.map(row => ({...row,
    ...Object.fromEntries(channels.map(key => [key, false]))})), metadata: {...report.metadata,
    manualActiveRenewal: {...report.metadata.manualActiveRenewal, schemaVersion: 1, state,
      authority: 'research_only_no_production_activation'}}};
}

export function isActiveRenewalResearchInventory(row, report, {nowMs = Date.now()} = {}) {
  const marker = report?.metadata?.manualActiveRenewal;
  if (!ACTIVE_RESEARCH_RENEWAL_STATES.includes(row?.state) || report?.state !== row.state
    || marker?.schemaVersion !== 1 || marker.state !== row.state
    || marker.authority !== 'research_only_no_production_activation'
    || report.metadata.complete !== true || report.metadata.shadowOnly !== true
    || report.metadata.productionActivationAllowed !== false || report.metadata.customerDeliveryAllowed !== false
    || row.raw?.shadowOnly !== true || row.sourceProductBinding?.shadowOnly !== true
    || row.previewOnly === true || row.quarantined === true || channels.some(key => row[key] !== false)) return false;
  if (['WI', 'OK'].includes(row.state)) return isCentralCityHiveResearchInventory(row, {nowMs});
  return row.sourceRuntimeId === `research:${row.state.toLowerCase()}:grocery-xapi`
    && row.raw?.staleFallback !== true && row.raw?.sourceRuntimeNonAlertable !== true
    && isGroceryExpansionInventory(row);
}
