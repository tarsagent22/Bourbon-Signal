import { randomUUID, createHash } from 'node:crypto';
import { sourceAcceptanceHealth } from './source-acceptance-health';
import { createProductionAlertQueueSqlExecutor } from './alert-queue/runtime';
import { readSiteExportResults } from './site-engine-contract';
import { BourbonBible } from '../../engine/src/core/bible.mjs';
import { fingerprintName } from '../../engine/src/core/text.mjs';
import { withCollectionContext } from '../../engine/src/core/collection-context.mjs';
import { collectCaliforniaSource } from '../../engine/src/collectors/california-runtime-source.mjs';
import { collectJensensSource, JENSENS_RUNTIME_SOURCE } from '../../engine/src/collectors/florida-jensens-runtime-source.mjs';
import { collectShopifyVariantPickup } from '../../engine/src/collectors/shopify-variant-pickup.mjs';
import { SHOPIFY_PICKUP_SOURCES } from '../../engine/src/sources/shopify-pickup-policy.mjs';
import { buildShopifyPollProjection } from '../../engine/src/sources/shopify-poll-projection.mjs';
import dropFeedClassification from '../data/drop-feed-classification.generated.json';
import { getDropClassificationIndex, resolveDropClassification, type DropClassificationBottle } from './drop-classification';
import { cityHiveSafeBottleMatch } from '../../engine/src/collectors/safe-bottle-match.mjs';
import { CALIFORNIA_SAN_DIEGO_SHOPIFY_SOURCES } from '../../engine/src/collectors/california-san-diego-surfaces.mjs';
import { collectNorthCarolinaShipments } from '../../engine/src/collectors/north-carolina-intelligence.mjs';
import { collectFloridaAbcExpansion } from '../../engine/src/collectors/florida-15-20-expansion.mjs';
import { fetchWithMeta as fetchText } from '../../engine/src/core/fetcher.mjs';
import { bibleLookup, buildDrops, buildCurrentInventoryAlertsFromDrops, buildRegionalWatchAlertsFromDrops, applyAlertPolicyToCandidate } from '../../engine/src/export-site-contract.mjs';
import { lifecycleAllowsInventoryAlert, lifecycleAllowsWatchAlert } from '../../engine/src/state-lifecycle.mjs';
import { recoveryPolicy, mergePollProjection, suppressDisabledPollSources, sourceScopeMatches, validatePollPolicy } from '../../engine/src/sources/poll-policy.mjs';
import { readLatestOhlqWorkerEnvelope } from './ohlq-worker-artifact-store';

type Row = Record<string, any>;
type PollSource = Row & { id:string;state:string;kind:string;expiryHours:number };
export const POLL_SOURCES: PollSource[] = [
  ...SHOPIFY_PICKUP_SOURCES,
  {id:'nc:board-shipments',state:'NC',kind:'nc-shipments',cadence:1800,expiryHours:168},
  {id:'fl:abc',state:'FL',kind:'fl-abc',chain:'abc-fine-wine-spirits',cadence:1800,expiryHours:1},
  {id:'fl:jensens-miami',state:'FL',kind:'jensens',chain:'jensens-liquors',cadence:1800,expiryHours:1,
    storeIds:[JENSENS_RUNTIME_SOURCE.store.id],productIds:JENSENS_RUNTIME_SOURCE.products.map(p=>p.productId),
    variantIds:JENSENS_RUNTIME_SOURCE.products.map(p=>p.variantId),
    failClosedOnError:true,noImmediateRetry:true,accessDeniedPauseSeconds:86400,rateLimitedPauseSeconds:14400},
  ...CALIFORNIA_SAN_DIEGO_SHOPIFY_SOURCES.map((s: Row) => ({id:`ca:${s.id}`,state:'CA',kind:'ca',chain:s.id,cadence:1800,expiryHours:1,definition:s,
    noImmediateRetry:s.id==='mission-trails-wine-spirits'})),
  {id:'oh:browser-artifact',state:'OH',kind:'oh-probe',cadence:900,expiryHours:1},
];
// Keep disabled sources registered as partition owners so old stock cannot revive.
export const pollSourceRegistry = (): PollSource[] => POLL_SOURCES.map((source): PollSource => ({...source,
  disabled:source.disabled===true || (source.kind==='shopify-variant-pickup' && !schedulerEnabled()) || (source.id==='fl:jensens-miami' && process.env.JENSENS_SOURCE_POLL_ENABLED==='0')}));
export const schedulerEnabled = () => process.env.SOURCE_SCHEDULER_ENABLED === '1';
const sql = () => createProductionAlertQueueSqlExecutor();
export async function pollJobs() { return (await sql().query('SELECT * FROM source_poll_jobs ORDER BY source_id')).rows as Row[]; }
async function context() {
  const [bottles,drops,health,alerts] = await readSiteExportResults(['bottles','drops','state-health','alerts']);
  const age = Date.now()-Date.parse(bottles.generatedAt || '');
  if (!bottles.snapshotId || bottles.snapshotId!==health.snapshotId || bottles.snapshotId!==drops.snapshotId || bottles.snapshotId!==alerts.snapshotId
    || bottles.source!=='remote-snapshot' || !Number.isFinite(age) || age<0 || age>7*86400000
    || health.payload?.quarantine || health.payload?.bootstrap || alerts.payload?.quarantine || alerts.payload?.bootstrap || alerts.payload?.manualRefresh) throw new Error('policy_snapshot_unavailable');
  const records:Row[]=(Array.isArray(bottles.payload?.bottles) ? bottles.payload.bottles as Row[] : []).map((b: Row)=>({ ...b,id:b.canonical_id || b.id,canonical:b.canonical_name || b.name, normalizedKey:fingerprintName(b.canonical_name || b.name),aliases:b.aliases || [] }));
  const bible=new BourbonBible(records); const lookup=bibleLookup(records);
  const classificationIndex=getDropClassificationIndex(dropFeedClassification.records as unknown as DropClassificationBottle[]);
  const byState=Object.fromEntries([...new Set(SHOPIFY_PICKUP_SOURCES.map((source:Row)=>source.state))].map(state=>[state,
    bibleLookup(records.map(record=>({...record,tier:resolveDropClassification({state,canonical_id:record.id,canonical_name:record.canonical,tier:record.tier},classificationIndex).tier})))]));
  return {bible,lookup:{...lookup,byState},drops:Array.isArray(drops.payload?.drops) ? drops.payload.drops as Row[] : [],snapshotId:bottles.snapshotId,health:health.payload};
}
async function collect(source: Row, ctx: Awaited<ReturnType<typeof context>>, signal: AbortSignal) {
  const observedAt=new Date().toISOString();
  if (source.kind==='nc-shipments') return collectNorthCarolinaShipments(ctx.bible,{signal});
  if (source.kind==='ca') return withCollectionContext({signal},()=>collectCaliforniaSource({id:'CA'},ctx.bible,source.definition,observedAt,signal));
  if (source.kind==='jensens') return withCollectionContext({signal},()=>collectJensensSource(ctx.bible,{observedAt,signal}));
  if (source.kind==='shopify-variant-pickup') return withCollectionContext({signal},()=>collectShopifyVariantPickup(ctx.bible,source.definition,{signal}));
  if (source.kind==='fl-abc') {
    const result=await withCollectionContext({signal},()=>collectFloridaAbcExpansion({observedAt,signal,fetchText,
      matchBottle:(name: string)=>cityHiveSafeBottleMatch(name,ctx.bible)}));
    if (!result.inventoryPayload) {
      const diagnostic=result.roadblocks?.[0];
      const status=Number(diagnostic?.status);
      const error=new Error(status ? `HTTP ${status}` : 'source_identity_or_schema_failure') as Error & Row;
      error.status=status;error.details={retryAfterSeconds:diagnostic?.retryAfterSeconds};throw error;
    }
    return result;
  }
  if (source.kind!=='oh-probe') throw new Error('source_identity_or_schema_failure: unsupported collector kind');
  const artifact=await readLatestOhlqWorkerEnvelope();
  if (!artifact || Date.now()-Date.parse(artifact.generatedAt)>3600000) throw new Error('browser_artifact_unavailable');
  // The existing signed artifact ingestion retains ownership of Ohio conversion.
  return {signals:[],accounting:{artifactAt:artifact.generatedAt,dependencyReady:true},probe:true};
}
export async function runSourceScheduler({trigger='unspecified'}:{trigger?:string}={}) {
  if (!schedulerEnabled()) return {enabled:false};
  const executor=sql();
  await executor.query(`INSERT INTO source_scheduler_heartbeat VALUES('scheduler',now(),$1::jsonb)
    ON CONFLICT(name) DO UPDATE SET checked_at=EXCLUDED.checked_at,payload=EXCLUDED.payload`,[JSON.stringify({sources:POLL_SOURCES.length})]);
  const sharedContext=context();
  // Each due source records context/dependency failures in its own incident.
  void sharedContext.catch(()=>undefined);
  const results=await Promise.allSettled(pollSourceRegistry().map(async source=>{
    if(source.disabled) return {source:source.id,status:'disabled'};
    const owner=randomUUID();
    const lease=(await executor.query('SELECT * FROM source_poll_acquire($1,$2,$3)',[source.id,owner,source.cadence])).rows[0] as Row | undefined;
    if (!lease) return {source:source.id,status:'not_due'};
    const runStartedAt=Date.now();
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),50000);
    try {
      const ctx=await sharedContext;
      if (String(process.env.BOURBON_SIGNAL_QUARANTINED_STATES || '').split(',').includes(source.state) || (Array.isArray(ctx.health?.states) ? ctx.health.states as Row[] : []).some((s: Row)=>s.state===source.state && s.health==='blocked')) throw new Error('global_schema_quarantine');
      let result: Row | undefined;
      for(let attempt=0;attempt<2;attempt++) {
        try {result=await collect(source,ctx,controller.signal);break;}
        catch(error) { const reason=classifyPollError(error); if(attempt || !recoveryPolicy(reason,0,0,source).retry || controller.signal.aborted) throw error; }
      }
      if (!result) throw new Error('transport_failure');
      if(result.probe) {
        await executor.query('SELECT source_poll_finish($1,$2,$3,$4::jsonb,$5,$6,$7,$8::jsonb)',[source.id,owner,lease.generation,JSON.stringify({probe:true}),'dependency_ready',0,0,JSON.stringify(result.accounting)]);
        return {source:source.id,status:'dependency_ready'};
      }
      if(source.kind==='shopify-variant-pickup') {
        const built=buildShopifyPollProjection({source,ctx,lease,result,owner});
        const accounting={...result.accounting,collected:result.signals?.length || 0,accepted:built.signals.length,feed:built.drops.length,candidates:built.candidates.length,
          baseline:!lease.projection,elapsedMs:Date.now()-runStartedAt,trigger,manualDueReset:false,collectorSha256:source.collectorSha256,configSha256:source.configSha256,
          observations:built.observations.map((row:Row)=>({state:row.state,storeId:row.storeId,storeAddress:row.storeAddress,sourceUrl:row.sourceUrl,
            canonicalBottleId:row.canonicalBottleId,productId:row.productId,variantId:row.variantId,observedAt:row.observedAt,availability:row.availabilityStatus,
            locationPrecision:'store_level',quantitySemantics:'binary_orderability',quantity:0,quantityIsExact:false,
            fulfillmentEvidenceType:'variant_pickup_offer',pickupVerified:row.availabilityStatus==='in_stock'})),
          projectedCandidateKeys:built.candidates.map((row:Row)=>row.dedupeKey)};
        const committed=(await executor.query('SELECT source_poll_finish($1,$2,$3,$4::jsonb,$5,$6,$7,$8::jsonb) AS committed',
          [source.id,owner,lease.generation,JSON.stringify(built.projection),'accepted',0,0,JSON.stringify(accounting)])).rows[0]?.committed;
        return {source:source.id,status:committed?'accepted':'fenced',...accounting};
      }
      const signals=(result.signals || []).filter((s: Row)=>!s.stale && !s.raw?.cacheFallback && s.canonicalBottleId && sourceScopeMatches(source,s));
      const previous=lease.projection?.drops || ctx.drops.filter((d: Row)=>sourceScopeMatches(source,d));
      const drops=buildDrops(signals,ctx.lookup,signals,previous,signals);
      const priorCandidates=new Map<string,Row>((lease.projection?.candidates || []).map((c: Row)=>[c.dedupeKey,c]));
      const candidates=[...buildCurrentInventoryAlertsFromDrops(drops),...buildRegionalWatchAlertsFromDrops(drops)]
        .map(applyAlertPolicyToCandidate).filter((c: Row)=>c.eligibleForDelivery && (c.actionabilityClass==='store_inventory'?lifecycleAllowsInventoryAlert(source.state):lifecycleAllowsWatchAlert(source.state)))
        .filter((c: Row)=>Boolean(lease.projection) && (priorCandidates.has(c.dedupeKey) || !previous.some((d: Row)=>(d.availabilityEpisodeId && d.availabilityEpisodeId===c.availabilityEpisodeId) || (source.kind==='nc-shipments' && d.bottleName===c.bottle && d.locationName===c.locationName && d.quantity===c.quantity))))
        .sort((a: Row,b: Row)=>Number(b.reliabilityScore)-Number(a.reliabilityScore)).slice(0,200)
        .map((c: Row)=>({...c,sourcePollId:source.id,sourcePollRun:owner,sourcePollGeneration:Number(lease.generation),sourcePolicySnapshotId:ctx.snapshotId}));
      const projection={drops:drops.map((d: Row)=>({...d,sourcePollId:source.id,sourcePollRun:owner,sourcePollGeneration:Number(lease.generation)})),candidates,acceptedAt:new Date().toISOString(),policyId:ctx.snapshotId};
      const pilot=source.id==='fl:jensens-miami' || source.id==='ca:mission-trails-wine-spirits';
      const observations=pilot?signals.filter((s:Row)=>['limited','allocated','unicorn'].includes(s.tier)).map((s:Row)=>{
        const size=String(s.raw?.variant?.size || s.size || s.rawName || '').match(/\b(\d+(?:\.\d+)?)\s*(ml|l)\b/i);
        return {state:s.state,storeId:s.storeId,storeAddress:s.storeAddress,sourceUrl:s.sourceUrl,
          canonicalBottleId:s.canonicalBottleId,productId:String(s.productId),variantId:String(s.variantId),observedAt:s.observedAt,
          availability:s.availabilityStatus,locationPrecision:s.locationPrecision,quantitySemantics:'binary_orderability',
          quantity:0,quantityIsExact:false,sizeMl:s.raw?.sizeMl || (size?Number(size[1])*(size[2].toLowerCase()==='l'?1000:1):null),
          fulfillmentEvidenceType:source.kind==='jensens'?'variant_pickup_offer':'retailer_pickup_policy',
          pickupVerified:s.pickupOfferVerified===true,fulfillmentPolicyVerified:s.raw?.fulfillmentPolicyVerified===true,
          sizeEvidenceType:(s.raw?.sizeMl || size)?'source_metadata':'not_published'};
      }).slice(0,200):undefined;
      const accounting={collected:result.signals?.length || 0,accepted:signals.length,feed:drops.length,candidates:candidates.length,baseline:!lease.projection,roadblocks:result.roadblocks?.length || 0,...result.accounting,
        elapsedMs:Date.now()-runStartedAt,trigger,manualDueReset:false,...(pilot?{observations,projectedCandidateKeys:candidates.map((c:Row)=>c.dedupeKey)}:{})};
      const feedExpected=signals.some((s: Row)=>['limited','allocated','unicorn'].includes(s.tier) && (s.canAlertAsInventory || s.eventType==='nc_board_shipment_snapshot'));
      if(feedExpected && !drops.length) throw new Error('accepted_evidence_missing_feed');
      const committed=(await executor.query('SELECT source_poll_finish($1,$2,$3,$4::jsonb,$5,$6,$7,$8::jsonb) AS committed',
        [source.id,owner,lease.generation,JSON.stringify(projection),'accepted',0,0,JSON.stringify(accounting)])).rows[0]?.committed;
      if(committed && result.roadblocks?.length) {
        for(const diagnostic of result.roadblocks) await executor.query(`INSERT INTO source_poll_incidents(source_id,reason) VALUES($1,$2) ON CONFLICT(source_id,reason) DO UPDATE SET last_at=now(),occurrences=source_poll_incidents.occurrences+1,resolved_at=NULL`,[source.id,diagnostic.status || 'source_diagnostic']);
      }
      return {source:source.id,status:committed?'accepted':'fenced',...accounting};
    } catch(error) {
      const reason=classifyPollError(error);const recovery=recoveryPolicy(reason,Number(lease.failures),(error as Row)?.details?.retryAfterSeconds,source);
      await executor.query('SELECT source_poll_finish($1,$2,$3,NULL,$4,$5,$6,$7::jsonb)',[source.id,owner,lease.generation,reason,recovery.backoff,recovery.pause,JSON.stringify({probe:!!lease.paused_until,trigger,...(error as Row)?.details?.accounting})]);
      return {source:source.id,status:reason,backoffSeconds:recovery.backoff,pauseSeconds:recovery.pause};
    } finally {clearTimeout(timer);controller.abort();}
  }));
  return {enabled:true,results:results.map(r=>r.status==='fulfilled'?r.value:{status:'storage_or_worker_failure'})};
}
export function classifyPollError(error: unknown) {
  const message=error instanceof Error?error.message:String(error);
  if ((error as Row)?.kind==='malformed' || /quarantine/.test(message)) return 'source_identity_or_schema_failure';
  if ((error as Row)?.status===403 || (error as Row)?.status===401) return 'source_access_denied';
  if (/abort|timeout/i.test(message)) return 'timeout';
  if (/429|rate.limit/i.test(message)) return 'rate_limited';
  if (/artifact/i.test(message)) return 'browser_artifact_unavailable';
  if (/identity|schema|malformed|extract_datetime|fulfillment|missing_feed|incomplete/i.test(message)) return message.includes('missing_feed')?'accepted_evidence_missing_feed':'source_identity_or_schema_failure';
  if (/5\d\d/.test(message)) return 'http_5xx';
  return 'transport_failure';
}
export async function readPollProjection(rows: Row[], kind: 'drops'|'candidates') {
  if (!schedulerEnabled()) return {rows:suppressDisabledPollSources(rows,pollSourceRegistry(),kind),version:'off'};
  const [jobs,ctx]=await Promise.all([pollJobs(),context()]);
  const registry=pollSourceRegistry();
  const permitted=validatePollPolicy(jobs,registry,ctx.lookup,ctx.health,process.env.BOURBON_SIGNAL_QUARANTINED_STATES || '',ctx.snapshotId);
  const merged=mergePollProjection(rows,permitted,registry,kind);
  await tracePollCandidates(merged.filter((r: Row)=>r.sourcePollId),kind==='drops'?'feed_read':'candidate_read');
  return {rows:merged,version:createHash('sha256').update(JSON.stringify(jobs.map(j=>[j.source_id,j.generation,j.accepted_at]))).digest('hex').slice(0,24)};
}
export async function pollCandidatesValid(candidates: Row[]) {
  const registry=pollSourceRegistry();
  if(suppressDisabledPollSources(candidates,registry,'candidates').length!==candidates.length) return false;
  const polled=candidates.filter(c=>c.sourcePollId);
  if(!polled.length)return true;
  if(!schedulerEnabled())return false;
  const current=(await readPollProjection([], 'candidates')).rows;
  const proofFields=['state','sourcePollId','sourceRuntimeId','sourceCollectorVersion','sourcePollRun','sourcePollGeneration','sourcePolicySnapshotId',
    'canonicalBottleId','canonicalId','canonicalName','rawName','tier','merchantId','productId','variantId','storeId','storeAddress',
    'sourceUrl','sourceProductBinding','availabilityStatus','quantity','quantityIsExact','sourceAvailabilityVerified','pickupOfferVerified','premisesVerified','inventorySemantics','price'];
  return polled.every(c=>current.some((r: Row)=>r.id===c.id && r.dedupeKey===c.dedupeKey &&
    (registry.find(source=>source.id===c.sourcePollId)?.kind!=='shopify-variant-pickup' || proofFields.every(field=>c[field]===r[field]))));
}
export async function tracePollCandidates(rows: Row[],stage: string,channel='',at=new Date().toISOString()) {
  const sources=new Map<string,number>();
  for(const row of rows) if(row.sourcePollId) sources.set(row.sourcePollId,(sources.get(row.sourcePollId)||0)+1);
  if(!sources.size)return;
  try {await Promise.all([...sources].map(([source,count])=>sql().query(`INSERT INTO source_poll_trace(source_id,stage,channel,last_at,row_count) VALUES($1,$2,$3,$4,$5) ON CONFLICT(source_id,stage,channel) DO UPDATE SET last_at=EXCLUDED.last_at,row_count=EXCLUDED.row_count`,[source,stage,channel,at,count])));} catch { /* Telemetry cannot suppress a valid feed. */ }
}
export async function sourceSchedulerHealth(writeMonitor=false) {
  const executor=sql(); const jobs=await pollJobs();
  const registry=pollSourceRegistry(), enabledSources=registry.filter(source=>!source.disabled), enabledIds=new Set(enabledSources.map(source=>source.id));
  const heartbeat=(await executor.query('SELECT name,checked_at FROM source_scheduler_heartbeat')).rows;
  const late=jobs.filter(j=>enabledIds.has(j.source_id) && Date.now()-Date.parse(j.next_due_at)>10*60000 && (!j.paused_until || Date.parse(j.paused_until)<Date.now()) && (!j.lease_until || Date.parse(j.lease_until)<Date.now()));
  const lanes=process.env.SOURCE_LANE_POLL_ENABLED==='1'?(await executor.query('SELECT source_id,next_due_at,lease_until,accepted_at,last_reason,failures,healthy FROM source_lane_heads')).rows as Row[]:[];
  const laneLate=lanes.filter(j=>Date.now()-Date.parse(j.next_due_at)>10*60000 && (!j.lease_until || Date.parse(j.lease_until)<Date.now()));
  const incidents=(await executor.query('SELECT source_id,reason,first_at,last_at,occurrences FROM source_poll_incidents WHERE resolved_at IS NULL')).rows;
  const traces=(await executor.query("SELECT run_id,source_id,generation,due_at,status,started_at,finished_at,accounting FROM source_poll_runs ORDER BY started_at DESC LIMIT 40")).rows;
  const pipeline=(await executor.query('SELECT * FROM source_poll_trace ORDER BY source_id,stage')).rows;
  const sourceHealth=sourceAcceptanceHealth(jobs.map(j=>({source_id:String(j.source_id),accepted_at:j.accepted_at,last_reason:j.last_reason,failures:j.failures})),registry as Array<{id:string;kind:string;expiryHours:number;disabled?:boolean}>);
  const result={pipeline,lanes,enabled:schedulerEnabled(),healthy:late.length===0 && laneLate.length===0 && enabledSources.every(source=>jobs.some(job=>job.source_id===source.id)) && heartbeat.some(h=>h.name==='scheduler' && Date.now()-Date.parse(String(h.checked_at))<15*60000),lateSources:[...late,...laneLate].map(j=>j.source_id),jobs:jobs.map(({projection,...j})=>({...j,disabled:registry.find(source=>source.id===j.source_id)?.disabled===true,feedRows:projection?.drops?.length || 0,candidates:projection?.candidates?.length || 0})),incidents,heartbeat,traces};
  const schedulingHealthy=result.healthy;
  const collectionHealthy=sourceHealth.filter(row=>!row.dependency && row.status!=='disabled').every(row=>row.status==='healthy')
    && lanes.every(row=>row.healthy===true && Number(row.failures || 0)===0);
  const health={...result,schedulingHealthy,collectionHealthy,sourceHealth,healthy:schedulingHealthy && collectionHealthy};
  if(writeMonitor)await executor.query(`INSERT INTO source_scheduler_heartbeat VALUES('independent-monitor',now(),$1::jsonb) ON CONFLICT(name) DO UPDATE SET checked_at=EXCLUDED.checked_at,payload=EXCLUDED.payload`,[JSON.stringify({healthy:health.healthy,schedulingHealthy,collectionHealthy,late:late.length})]);
  return health;
}
