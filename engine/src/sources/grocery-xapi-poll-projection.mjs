import { buildDrops, buildCurrentInventoryAlertsFromDrops, applyAlertPolicyToCandidate } from '../export-site-contract.mjs';
import { lifecycleAllowsInventoryAlert } from '../state-lifecycle.mjs';

const tuple = row => JSON.stringify([String(row.storeId || ''), String(row.productId || ''), String(row.variantId || '')]);
const fail = reason => { throw new Error(`grocery_xapi_identity_or_schema_failure: ${reason}`); };
const observationAllowed = (policy, row) => {
  const evaluation = policy.evaluateObservation(row);
  return evaluation === true || evaluation?.eligible === true;
};

// Pure assembly for the existing source_poll_jobs fenced lease/finish transaction.
// An accepted empty page replaces owned stock; it never asserts catalog completeness.
export function buildGroceryXapiPollProjection({source, ctx, lease, result, owner, groceryPolicy, now = Date.now()}) {
  if (source.kind !== 'grocery-xapi' || source.disabled || !groceryPolicy?.eligible || !groceryPolicy?.evaluateObservation
    || result?.metadata?.scope !== 'one_store_bourbon_search_first_page'
    || result.metadata.completeSnapshot !== false || result.metadata.absenceIsOutOfStock !== false
    || !Array.isArray(result.observations)) fail('missing current policy or bounded observations');
  const definition = source.definition;
  const bindings = new Map((definition?.bindings || []).map(binding => [tuple({...binding, storeId: definition.premise.storeId}), binding]));
  if (!bindings.size || bindings.size !== definition.bindings.length) fail('empty or duplicate bindings');
  const owns = row => row.state === source.state && row.sourceRuntimeId === source.id && bindings.has(tuple(row));
  const prior = lease.projection;
  const checkpoints = new Map();
  for (const row of [...(prior?.observations || []), ...(prior?.episodeSeeds || prior?.drops || [])]) {
    if (!owns(row)) continue;
    const at = Date.parse(row.lastConfirmedAt || row.observedAt || '');
    if (Number.isFinite(at)) checkpoints.set(tuple(row), Math.max(checkpoints.get(tuple(row)) ?? -Infinity, at));
  }
  const observations = new Map(), positives = new Map();
  for (const row of result.observations) {
    const stamped = {...row, sourcePolicySnapshotId:ctx.snapshotId};
    const key = tuple(stamped), at = Date.parse(stamped.observedAt || '');
    if (!owns(stamped) || observations.has(key) || !Number.isFinite(at) || at > now
      || now - at > source.expiryHours * 3600000 || at <= (checkpoints.get(key) ?? -Infinity)
      || !['in_stock','out_of_stock','unknown','omitted_first_page'].includes(stamped.availabilityStatus)
      || !observationAllowed(groceryPolicy, stamped)) fail('unreviewed, stale, replayed or conflicting observation');
    if (stamped.availabilityStatus !== 'in_stock' && (stamped.canAlertAsInventory || stamped.canAlertAsWatch || stamped.quantity !== 0)) fail('nonpositive inventory claim');
    if (stamped.availabilityStatus === 'out_of_stock' && (!stamped.sourceProductBinding || stamped.sourceAvailabilityVerified !== true)) fail('negative lacks exact binding');
    observations.set(key, stamped);
  }
  if (observations.size !== bindings.size) fail('missing binding observation');
  for (const signal of result.signals || []) {
    const stamped = {...signal, sourcePolicySnapshotId:ctx.snapshotId}, key = tuple(stamped);
    const observation = observations.get(key);
    if (!owns(stamped) || positives.has(key) || !groceryPolicy.eligible(stamped)
      || observation?.availabilityStatus !== 'in_stock' || observation.observedAt !== stamped.observedAt
      || observation.canonicalBottleId !== stamped.canonicalBottleId) fail('unadmitted or conflicting positive');
    positives.set(key, stamped);
  }
  if (positives.size !== [...observations.values()].filter(row => row.availabilityStatus === 'in_stock').length) fail('positive observation missing evidence');
  const signals = [...positives.values()];
  // Only persisted observations/seeds supply episode history. Broad snapshot rows
  // cannot seed a new source's first alert or revive its previously owned stock.
  const previous = (prior?.episodeSeeds || prior?.drops || []).filter(owns);
  const history = [...(prior?.observations || []).filter(owns), ...observations.values()];
  const drops = buildDrops(signals, ctx.lookup, signals, previous, history, {groceryPolicy});
  if (drops.length !== signals.length) fail('accepted evidence missing feed');
  const priorCandidates = new Set((prior?.candidates || []).map(row => row.dedupeKey));
  const stamp = row => ({...row,sourcePollId:source.id,sourcePollRun:owner,sourcePollGeneration:Number(lease.generation),sourcePolicySnapshotId:ctx.snapshotId});
  const candidates = buildCurrentInventoryAlertsFromDrops(drops,{groceryPolicy}).map(applyAlertPolicyToCandidate)
    .filter(row => row.eligibleForDelivery && lifecycleAllowsInventoryAlert(source.state))
    .filter(row => Boolean(prior) && (priorCandidates.has(row.dedupeKey) || !previous.some(drop => drop.availabilityEpisodeId && drop.availabilityEpisodeId === row.availabilityEpisodeId)))
    .slice(0,200).map(stamp);
  const seeds = new Map(previous.map(row => [tuple(row),row]));
  for (const row of drops) seeds.set(tuple(row),row);
  const projection = {schemaVersion:'grocery-xapi-projection@1',drops:drops.map(stamp),candidates,
    observations:[...observations.values()],episodeSeeds:[...seeds.values()],acceptedAt:new Date(now).toISOString(),policyId:ctx.snapshotId};
  return {signals,drops,candidates,observations:projection.observations,projection};
}
