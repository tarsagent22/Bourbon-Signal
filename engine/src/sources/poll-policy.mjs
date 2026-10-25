import { createShopifyPickupPolicy } from './shopify-pickup-policy.mjs';
import { createGroceryXapiPolicy, isGroceryXapiManagedRow } from './grocery-xapi-policy.mjs';

export function recoveryPolicy(reason, failures = 0, retryAfter = 0, source = {}) {
  const identity = /identity|schema|digest|malformed|extract_datetime|incomplete|fulfillment/.test(reason);
  const dependency = /artifact|dependency|not_configured|access_denied/.test(reason);
  const delay = Math.min(3600, 300 * 2 ** Math.min(failures, 4));
  const sourcePause = reason === 'source_access_denied' ? Number(source.accessDeniedPauseSeconds) || 0
    : reason === 'rate_limited' ? Number(source.rateLimitedPauseSeconds) || 0 : 0;
  const retrySeconds=Number.isFinite(Number(retryAfter))?Math.max(0,Number(retryAfter)):0;
  return { backoff: Math.min(2147483647, Math.max(delay, retrySeconds, sourcePause)),
    pause: Math.max(sourcePause, identity ? 21600 : dependency ? 3600 : failures >= 4 ? 3600 : 0),
    retry: !source.noImmediateRetry && !identity && !dependency && /timeout|transport|http_5\d\d/.test(reason) };
}
export function sourceScopeMatches(source, row) {
  if (source.kind === 'oh-probe' || row.state !== source.state) return false;
  if (source.kind === 'nc-shipments') return (row.type || row.eventType) === 'nc_board_shipment_snapshot';
  if (source.kind === 'grocery-xapi') return row.sourceChain === source.chain
    && String(row.storeId || row.store_id || '') === source.definition?.premise?.storeId
    && (source.definition?.bindings || []).some(binding => String(row.productId || '') === binding.productId && String(row.variantId || '') === binding.variantId);
  if (source.kind === 'shopify-variant-pickup') return row.sourceChain === source.chain && (source.partitionBindings || []).some(binding =>
    String(row.storeId || row.store_id || '') === binding.storeId && String(row.productId || '') === binding.productId && String(row.variantId || '') === binding.variantId);
  return row.sourceChain === source.chain
    && (!source.storeIds || source.storeIds.includes(String(row.storeId || row.store_id || '')))
    && (!source.productIds || source.productIds.includes(String(row.productId || '')))
    && (!source.variantIds || source.variantIds.includes(String(row.variantId || '')));
}
export function suppressDisabledPollSources(rows,registry,kind) {
  const owned=row=>registry.some(source=>source.disabled && sourceScopeMatches(source,row));
  return kind==='candidates' ? rows.filter(row=>!owned(row))
    : rows.map(row=>owned(row)?{...row,stale:true,canAlertAsInventory:false,canAlertAsWatch:false}:row);
}
export function mergePollProjection(base, jobs, registry, kind, now = Date.now()) {
  let rows = suppressDisabledPollSources(base,registry,kind);
  for (const source of registry) {
    const job = jobs.find(j => j.source_id === source.id);
    if (!job?.projection) {
      if(source.failClosedOnError && job?.last_reason && job.last_reason!=='accepted') {
        rows=suppressDisabledPollSources(rows,[{...source,disabled:true}],kind);
      }
      continue;
    }
    // Owning a partition also owns its empty result. Never restore stale stock.
    const current = projectionRows(job.projection, kind).filter(row=>sourceScopeMatches(source,row));
    const retained = rows.filter(row => !sourceScopeMatches(source, row) || (kind === 'drops' && !current.some(fresh =>
      fresh.id === row.id || (fresh.availabilityEpisodeId && fresh.availabilityEpisodeId === row.availabilityEpisodeId))))
      .map(row => sourceScopeMatches(source, row) && kind === 'drops' ? {...row,canAlertAsInventory:false,canAlertAsWatch:false,stale:true} : row);
    const projection = job.projection;
    const currentRows = (projection[kind] || []).filter(row=>sourceScopeMatches(source,row)).map(row => {
      const at = Date.parse(row.lastConfirmedAt || row.observedAt || row.signalAt || '');
      const event = Date.parse(row.signalAt || row.observedAt || '');
      const valid = !source.disabled && !(source.failClosedOnError && job.last_reason !== 'accepted')
        && Number.isFinite(at) && at <= now && now - at <= source.expiryHours * 3600000
        && (kind !== 'candidates' || (Number.isFinite(event) && event <= now && now - event <= source.expiryHours * 3600000));
      return valid ? row : kind === 'drops' ? {...row,stale:true,canAlertAsInventory:false,canAlertAsWatch:false} : null;
    }).filter(Boolean);
    rows = [...retained, ...currentRows];
  }
  return rows;
}

function projectionRows(projection, kind) { return Array.isArray(projection?.[kind]) ? projection[kind] : []; }

// Reapply current bottle and state authority at every consumption, including sends.
// Invalid policy removes candidates while retaining non-alertable feed history.
export function validatePollPolicy(jobs,registry,lookup,health,quarantined='',policySnapshotId='') {
  const blocked=new Set(quarantined.split(',').filter(Boolean));
  for(const row of health?.states || []) if(row.health==='blocked')blocked.add(row.state);
  const descriptors=registry.filter(source=>source.kind==='shopify-variant-pickup');
  const shopifyPolicy=descriptors.length?createShopifyPickupPolicy({descriptors,enabledSourceIds:descriptors.filter(source=>!source.disabled).map(source=>source.id),
    collectorSha256:descriptors[0].collectorSha256,catalogSha256:descriptors[0].catalogSha256,lookup,policySnapshotId,blockedStates:[...blocked]}):null;
  const groceryDescriptors=registry.filter(source=>source.kind==='grocery-xapi');
  const groceryPolicy=groceryDescriptors.length?createGroceryXapiPolicy({descriptors:groceryDescriptors,
    enabledSourceIds:groceryDescriptors.filter(source=>!source.disabled).map(source=>source.id),lookup,policySnapshotId,blockedStates:[...blocked]}):null;
  return jobs.map(job=>{
    const source=registry.find(s=>s.id===job.source_id);
    if(!source || !job.projection)return job;
    const allowed=row=> {
      if(blocked.has(source.state))return false;
      if(source.kind==='shopify-variant-pickup')return shopifyPolicy.eligible(row);
      if(source.kind==='grocery-xapi')return groceryPolicy.eligible(row);
      const record=lookup.byId?.get?.(row.canonicalBottleId || row.canonicalId) || lookup.byId?.[row.canonicalBottleId || row.canonicalId];
      return !!record && ['limited','allocated','unicorn'].includes(record.tier);
    };
    return {...job,projection:{...job.projection,candidates:(job.projection.candidates || []).filter(allowed),
      drops:(job.projection.drops || []).map(row=>allowed(row)?row:{...row,stale:true,canAlertAsInventory:false,canAlertAsWatch:false})}};
  });
}

export function failClosedPollRows(rows,registry,kind) {
 const owned=row=>isGroceryXapiManagedRow(row) || registry.some(source=>sourceScopeMatches(source,row));
 return kind==='candidates'?rows.filter(row=>!owned(row) && !row.sourcePollId)
  : rows.map(row=>owned(row)?{...row,stale:true,canAlertAsInventory:false,canAlertAsWatch:false}:row);
}

// Current authority also covers cached base rows after registry removal.
/** @param {any[]} rows @param {any[]} registry @param {any} lookup @param {any} health */
export function validateGroceryXapiRows(rows,registry,lookup,health,quarantined='',policySnapshotId='',kind='drops') {
  const blocked=new Set(quarantined.split(',').filter(Boolean));
  for(const row of health?.states || []) if(row.health==='blocked')blocked.add(row.state);
  const descriptors=registry.filter(source=>source.kind==='grocery-xapi');
  const policy=createGroceryXapiPolicy({descriptors,enabledSourceIds:descriptors.filter(source=>!source.disabled).map(source=>source.id),
    lookup,policySnapshotId,blockedStates:[...blocked]});
  return rows.map(row=>{
    if(!policy.owns(row) || policy.eligible(row))return row;
    return kind==='candidates'?null:{...row,stale:true,canAlertAsInventory:false,canAlertAsWatch:false};
  }).filter(Boolean);
}
