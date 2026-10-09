import { randomUUID, createHash } from 'node:crypto';
import { createProductionAlertQueueSqlExecutor } from './alert-queue/runtime';
import { readSiteExportResults } from './site-engine-contract';
import { BourbonBible } from '../../engine/src/core/bible.mjs';
import { fingerprintName } from '../../engine/src/core/text.mjs';
import { withCollectionContext } from '../../engine/src/core/collection-context.mjs';
import { collectCaliforniaSource } from '../../engine/src/collectors/california-runtime-source.mjs';
import { cityHiveSafeBottleMatch } from '../../engine/src/collectors/safe-bottle-match.mjs';
import { CALIFORNIA_SAN_DIEGO_SHOPIFY_SOURCES } from '../../engine/src/collectors/california-san-diego-surfaces.mjs';
import { collectNorthCarolinaShipments } from '../../engine/src/collectors/north-carolina-intelligence.mjs';
import { collectFloridaAbcExpansion } from '../../engine/src/collectors/florida-15-20-expansion.mjs';
import { fetchWithMeta as fetchText } from '../../engine/src/core/fetcher.mjs';
import { bibleLookup, buildDrops, buildCurrentInventoryAlertsFromDrops, buildRegionalWatchAlertsFromDrops, applyAlertPolicyToCandidate } from '../../engine/src/export-site-contract.mjs';
import { lifecycleAllowsInventoryAlert, lifecycleAllowsWatchAlert } from '../../engine/src/state-lifecycle.mjs';
import { recoveryPolicy, mergePollProjection, sourceScopeMatches, validatePollPolicy } from '../../engine/src/sources/poll-policy.mjs';
import { readLatestOhlqWorkerEnvelope } from './ohlq-worker-artifact-store';

type Row = Record<string, any>;
export const POLL_SOURCES: Row[] = [
  {id:'nc:board-shipments',state:'NC',kind:'nc-shipments',cadence:1800,expiryHours:168},
  {id:'fl:abc',state:'FL',kind:'fl-abc',chain:'abc-fine-wine-spirits',cadence:1800,expiryHours:1},
  ...CALIFORNIA_SAN_DIEGO_SHOPIFY_SOURCES.map((s: Row) => ({id:`ca:${s.id}`,state:'CA',kind:'ca',chain:s.id,cadence:1800,expiryHours:1,definition:s})),
  {id:'oh:browser-artifact',state:'OH',kind:'oh-probe',cadence:900,expiryHours:1},
];
export const schedulerEnabled = () => process.env.SOURCE_SCHEDULER_ENABLED === '1';
const sql = () => createProductionAlertQueueSqlExecutor();
export async function pollJobs() { return (await sql().query('SELECT * FROM source_poll_jobs ORDER BY source_id')).rows as Row[]; }
async function context() {
  const [bottles,drops,health] = await readSiteExportResults(['bottles','drops','state-health']);
  const age = Date.now()-Date.parse(bottles.generatedAt || '');
  if (!bottles.snapshotId || bottles.snapshotId!==health.snapshotId || bottles.snapshotId!==drops.snapshotId
    || bottles.source!=='remote-snapshot' || !Number.isFinite(age) || age<0 || age>7*86400000
    || health.payload?.quarantine || health.payload?.bootstrap) throw new Error('policy_snapshot_unavailable');
  const records=(Array.isArray(bottles.payload?.bottles) ? bottles.payload.bottles as Row[] : []).map((b: Row)=>({ ...b,id:b.canonical_id || b.id,canonical:b.canonical_name || b.name, normalizedKey:fingerprintName(b.canonical_name || b.name),aliases:b.aliases || [] }));
  const bible=new BourbonBible(records); const lookup=bibleLookup(records);
  return {bible,lookup,drops:Array.isArray(drops.payload?.drops) ? drops.payload.drops as Row[] : [],snapshotId:bottles.snapshotId,health:health.payload};
}
async function collect(source: Row, ctx: Awaited<ReturnType<typeof context>>, signal: AbortSignal) {
  const observedAt=new Date().toISOString();
  if (source.kind==='nc-shipments') return collectNorthCarolinaShipments(ctx.bible,{signal});
  if (source.kind==='ca') return withCollectionContext({signal},()=>collectCaliforniaSource({id:'CA'},ctx.bible,source.definition,observedAt,signal));
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
  const artifact=await readLatestOhlqWorkerEnvelope();
  if (!artifact || Date.now()-Date.parse(artifact.generatedAt)>3600000) throw new Error('browser_artifact_unavailable');
  // The existing signed artifact ingestion retains ownership of Ohio conversion.
  return {signals:[],accounting:{artifactAt:artifact.generatedAt,dependencyReady:true},probe:true};
}
export async function runSourceScheduler() {
  if (!schedulerEnabled()) return {enabled:false};
  const executor=sql();
  await executor.query(`INSERT INTO source_scheduler_heartbeat VALUES('scheduler',now(),$1::jsonb)
    ON CONFLICT(name) DO UPDATE SET checked_at=EXCLUDED.checked_at,payload=EXCLUDED.payload`,[JSON.stringify({sources:POLL_SOURCES.length})]);
  const sharedContext=context();
  // Each due source records context/dependency failures in its own incident.
  void sharedContext.catch(()=>undefined);
  const results=await Promise.allSettled(POLL_SOURCES.map(async source=>{
    const owner=randomUUID();
    const lease=(await executor.query('SELECT * FROM source_poll_acquire($1,$2,$3)',[source.id,owner,source.cadence])).rows[0] as Row | undefined;
    if (!lease) return {source:source.id,status:'not_due'};
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),50000);
    try {
      const ctx=await sharedContext;
      if (String(process.env.BOURBON_SIGNAL_QUARANTINED_STATES || '').split(',').includes(source.state) || (Array.isArray(ctx.health?.states) ? ctx.health.states as Row[] : []).some((s: Row)=>s.state===source.state && s.health==='blocked')) throw new Error('global_schema_quarantine');
      let result: Row | undefined;
      for(let attempt=0;attempt<2;attempt++) {
        try {result=await collect(source,ctx,controller.signal);break;}
        catch(error) { const reason=classifyPollError(error); if(attempt || !recoveryPolicy(reason).retry || controller.signal.aborted) throw error; }
      }
      if (!result) throw new Error('transport_failure');
      if(result.probe) {
        await executor.query('SELECT source_poll_finish($1,$2,$3,$4::jsonb,$5,$6,$7,$8::jsonb)',[source.id,owner,lease.generation,JSON.stringify({probe:true}),'dependency_ready',0,0,JSON.stringify(result.accounting)]);
        return {source:source.id,status:'dependency_ready'};
      }
      const signals=(result.signals || []).filter((s: Row)=>!s.stale && !s.raw?.cacheFallback && s.canonicalBottleId && sourceScopeMatches(source,s));
      const previous=lease.projection?.drops || ctx.drops.filter((d: Row)=>sourceScopeMatches(source,d));
      const drops=buildDrops(signals,ctx.lookup,signals,previous,signals);
      const priorCandidates=new Map<string,Row>((lease.projection?.candidates || []).map((c: Row)=>[c.dedupeKey,c]));
      const candidates=[...buildCurrentInventoryAlertsFromDrops(drops),...buildRegionalWatchAlertsFromDrops(drops)]
        .map(applyAlertPolicyToCandidate).filter((c: Row)=>c.eligibleForDelivery && (c.actionabilityClass==='store_inventory'?lifecycleAllowsInventoryAlert(source.state):lifecycleAllowsWatchAlert(source.state)))
        .filter((c: Row)=>Boolean(lease.projection) && (priorCandidates.has(c.dedupeKey) || !previous.some((d: Row)=>(d.availabilityEpisodeId && d.availabilityEpisodeId===c.availabilityEpisodeId) || (source.kind==='nc-shipments' && d.bottleName===c.bottle && d.locationName===c.locationName && d.quantity===c.quantity))))
        .sort((a: Row,b: Row)=>Number(b.reliabilityScore)-Number(a.reliabilityScore)).slice(0,200)
        .map((c: Row)=>({...c,sourcePollId:source.id,sourcePollRun:owner,sourcePolicySnapshotId:ctx.snapshotId}));
      const projection={drops:drops.map((d: Row)=>({...d,sourcePollId:source.id,sourcePollRun:owner})),candidates,acceptedAt:new Date().toISOString(),policyId:ctx.snapshotId};
      const accounting={collected:result.signals?.length || 0,accepted:signals.length,feed:drops.length,candidates:candidates.length,baseline:!lease.projection,roadblocks:result.roadblocks?.length || 0,...result.accounting};
      if(signals.length && !drops.length) throw new Error('accepted_evidence_missing_feed');
      const committed=(await executor.query('SELECT source_poll_finish($1,$2,$3,$4::jsonb,$5,$6,$7,$8::jsonb) AS committed',
        [source.id,owner,lease.generation,JSON.stringify(projection),'accepted',0,0,JSON.stringify(accounting)])).rows[0]?.committed;
      if(committed && result.roadblocks?.length) {
        for(const diagnostic of result.roadblocks) await executor.query(`INSERT INTO source_poll_incidents(source_id,reason) VALUES($1,$2) ON CONFLICT(source_id,reason) DO UPDATE SET last_at=now(),occurrences=source_poll_incidents.occurrences+1,resolved_at=NULL`,[source.id,diagnostic.status || 'source_diagnostic']);
      }
      return {source:source.id,status:committed?'accepted':'fenced',...accounting};
    } catch(error) {
      const reason=classifyPollError(error);const recovery=recoveryPolicy(reason,Number(lease.failures),(error as Row)?.details?.retryAfterSeconds);
      await executor.query('SELECT source_poll_finish($1,$2,$3,NULL,$4,$5,$6,$7::jsonb)',[source.id,owner,lease.generation,reason,recovery.backoff,recovery.pause,JSON.stringify({probe:!!lease.paused_until})]);
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
  if (!schedulerEnabled()) return {rows,version:'off'};
  const [jobs,ctx]=await Promise.all([pollJobs(),context()]);
  const permitted=validatePollPolicy(jobs,POLL_SOURCES,ctx.lookup,ctx.health,process.env.BOURBON_SIGNAL_QUARANTINED_STATES || '');
  const merged=mergePollProjection(rows,permitted,POLL_SOURCES,kind);
  await tracePollCandidates(merged.filter((r: Row)=>r.sourcePollId),kind==='drops'?'feed_read':'candidate_read');
  return {rows:merged,version:createHash('sha256').update(JSON.stringify(jobs.map(j=>[j.source_id,j.generation,j.accepted_at]))).digest('hex').slice(0,24)};
}
export async function pollCandidatesValid(candidates: Row[]) {
  const polled=candidates.filter(c=>c.sourcePollId);
  if(!polled.length)return true;
  if(!schedulerEnabled())return false;
  const current=(await readPollProjection([], 'candidates')).rows;
  return polled.every(c=>current.some((r: Row)=>r.id===c.id && r.dedupeKey===c.dedupeKey));
}
export async function tracePollCandidates(rows: Row[],stage: string,channel='',at=new Date().toISOString()) {
  const sources=new Map<string,number>();
  for(const row of rows) if(row.sourcePollId) sources.set(row.sourcePollId,(sources.get(row.sourcePollId)||0)+1);
  if(!sources.size)return;
  try {await Promise.all([...sources].map(([source,count])=>sql().query(`INSERT INTO source_poll_trace(source_id,stage,channel,last_at,row_count) VALUES($1,$2,$3,$4,$5) ON CONFLICT(source_id,stage,channel) DO UPDATE SET last_at=EXCLUDED.last_at,row_count=EXCLUDED.row_count`,[source,stage,channel,at,count])));} catch { /* Telemetry cannot suppress a valid feed. */ }
}
export async function sourceSchedulerHealth(writeMonitor=false) {
  const executor=sql(); const jobs=await pollJobs();
  const heartbeat=(await executor.query('SELECT name,checked_at FROM source_scheduler_heartbeat')).rows;
  const late=jobs.filter(j=>Date.now()-Date.parse(j.next_due_at)>10*60000 && (!j.paused_until || Date.parse(j.paused_until)<Date.now()) && (!j.lease_until || Date.parse(j.lease_until)<Date.now()));
  const lanes=process.env.SOURCE_LANE_POLL_ENABLED==='1'?(await executor.query('SELECT source_id,next_due_at,lease_until,accepted_at,last_reason,failures,healthy FROM source_lane_heads')).rows as Row[]:[];
  const laneLate=lanes.filter(j=>Date.now()-Date.parse(j.next_due_at)>10*60000 && (!j.lease_until || Date.parse(j.lease_until)<Date.now()));
  const incidents=(await executor.query('SELECT source_id,reason,first_at,last_at,occurrences FROM source_poll_incidents WHERE resolved_at IS NULL')).rows;
  const traces=(await executor.query("SELECT source_id,status,started_at,finished_at,accounting FROM source_poll_runs ORDER BY started_at DESC LIMIT 40")).rows;
  const pipeline=(await executor.query('SELECT * FROM source_poll_trace ORDER BY source_id,stage')).rows;
  const result={pipeline,lanes,enabled:schedulerEnabled(),healthy:late.length===0 && laneLate.length===0 && jobs.length===POLL_SOURCES.length && heartbeat.some(h=>h.name==='scheduler' && Date.now()-Date.parse(String(h.checked_at))<15*60000),lateSources:[...late,...laneLate].map(j=>j.source_id),jobs:jobs.map(({projection,...j})=>({...j,feedRows:projection?.drops?.length || 0,candidates:projection?.candidates?.length || 0})),incidents,heartbeat,traces};
  if(writeMonitor)await executor.query(`INSERT INTO source_scheduler_heartbeat VALUES('independent-monitor',now(),$1::jsonb) ON CONFLICT(name) DO UPDATE SET checked_at=EXCLUDED.checked_at,payload=EXCLUDED.payload`,[JSON.stringify({healthy:result.healthy,late:late.length})]);
  return result;
}
