import { failClosedPollRows } from '../../engine/src/sources/poll-policy.mjs';
import { readPollProjection, preparePollProjection, pollCandidatesValid, POLL_SOURCES, tracePollCandidates } from './source-scheduler';

import { aggregateAreaWatchlistDemand, areaWatchlistPriority, type AreaWatchlistDemand } from './demand-intelligence';
import { buildSourceLaneUsefulness } from '../../engine/src/optimization/source-usefulness-report.mjs';
import { createProductionAlertQueueSqlExecutor, alertQueueDatabaseConfigured } from './alert-queue/runtime';
import { readSiteExportResults, type SiteExportResult } from './site-engine-contract';
import { SOURCE_LANES, SourceLaneRepository, pollSourceLane, readSourceLaneCandidates, applySourceLaneDropOverlay, sourceCandidatesStillValid, type LanePolicy } from './source-lane';
type Row = Record<string, any>;
const storageEnabled = () => process.env.SOURCE_LANE_STORAGE_ENABLED === '1';
const promotionEnabled = () => storageEnabled() && process.env.SOURCE_LANE_POLL_ENABLED === '1';
function repository() { return new SourceLaneRepository(createProductionAlertQueueSqlExecutor()); }
export function lanePolicyFromExports(alerts: SiteExportResult, health: SiteExportResult): LanePolicy {
  const states = health.payload?.states;
  const operating = Array.isArray(states) ? states.find((r: Row) => r.state === 'SC') : undefined;
  const coherent = alerts.snapshotId && health.snapshotId === alerts.snapshotId && health.source === 'remote-snapshot';
  const quarantine = alerts.payload?.bootstrap === true || alerts.payload?.quarantine === true || alerts.payload?.manualRefresh === true;
  return { snapshotId: coherent && !quarantine ? alerts.snapshotId : null, generatedAt: alerts.generatedAt, source: alerts.source, operating };
}
export async function readRuntimeLaneContext() {
  const [alerts, health, bottles] = await readSiteExportResults(['alerts', 'state-health', 'bottles']);
  const rows = Array.isArray(bottles.payload?.bottles) ? bottles.payload.bottles as Row[] : [];
  const coherent = bottles.snapshotId === alerts.snapshotId && bottles.source === 'remote-snapshot';
  return { alerts, policy: lanePolicyFromExports(alerts, health), bible: { byId: new Map<string, Row>(coherent ? rows.map(r => [String(r.canonical_id || r.id), { id: r.canonical_id || r.id, canonical: r.canonical_name || r.name, tier: r.tier, aliases: r.aliases || [] }]) : []) } };
}
export async function pollRuntimeSourceLanes(dryRun: boolean) {
  if (dryRun || !promotionEnabled() || !alertQueueDatabaseConfigured()) return;
  try {
    const context = await readRuntimeLaneContext();
    // One registered lane now. Each lane owns its lease and commits before its
    // promise settles: no nationwide collection barrier, no provider invocation.
    const demand = await readRuntimeSourceDemand();
    const now = new Date().toISOString();
    const ordered = [...SOURCE_LANES].sort((a,b) => areaWatchlistPriority(demand, 'SC:north-myrtle-beach', b.subjects.map(s => s.canonicalBottleId), now) - areaWatchlistPriority(demand, 'SC:north-myrtle-beach', a.subjects.map(s => s.canonicalBottleId), now));
    // Every registered lane is attempted: ordering never suppresses the neutral
    // demand floor. Database acquisition still enforces due time/circuit/backoff.
    await Promise.all(ordered.map(source => pollSourceLane({ repository: repository(), source, ...context, enabled: true })));
  } catch { /* Consumer remains fail-closed for the named scope on storage failure. */ }
}
const inRegisteredScope = (c: Row) => c.state === 'SC' && c.sourceChain === 'liquor-library'
  && c.storeId === 'liquor-library:45SNB155S1XMP' && SOURCE_LANES.some(s => s.subjects.some(d => d.productId === c.productId));
export async function mergeRuntimeSourceCandidates(candidates: Row[], alerts: SiteExportResult) {
  try { candidates=(await readPollProjection(candidates, 'candidates')).rows; } catch { candidates=failClosedPollRows(candidates,POLL_SOURCES,'candidates'); }
  if (!storageEnabled()) return candidates;
  try {
    const context = await readRuntimeLaneContext();
    // Never join a source policy from a different activated snapshot to candidates.
    if (context.alerts.snapshotId !== alerts.snapshotId) return candidates.filter(c => !inRegisteredScope(c));
    return await readSourceLaneCandidates(repository(), candidates, context.policy, promotionEnabled());
  } catch { return candidates.filter(c => !inRegisteredScope(c)); }
}
export async function runtimeSourceCandidatesStillValid(candidates: Row[]) {
  if (!await pollCandidatesValid(candidates)) return false;
  if (!storageEnabled()) return !candidates.some(c => c.sourceLaneId);
  if (!candidates.some(inRegisteredScope)) return true;
  try { const { policy } = await readRuntimeLaneContext(); return await sourceCandidatesStillValid(repository(), candidates, policy, promotionEnabled()); }
  catch { return false; }
}
async function prepareSourceLaneOverlay() {
  if (!storageEnabled()) return (drops: Row[]) => ({ drops, version: 'off' });
  try {
    const [state, context] = await Promise.all([repository().state(), readRuntimeLaneContext()]);
    return (drops: Row[], snapshotId: string | null) => applySourceLaneDropOverlay(
      state, drops, context.policy, context.alerts.snapshotId === snapshotId && promotionEnabled(),
    );
  } catch {
    return (drops: Row[]) => ({ drops: drops.filter(d => !inRegisteredScope(d)), version: 'unavailable' });
  }
}

export type RuntimeDropOverlay = { drops: Row[]; version: string };

export async function prepareRuntimeSourceDropOverlay(deferTrace?: (work: () => Promise<void>) => void) {
  // Read independent live heads while the immutable base loads. Apply them in
  // the same order, retaining partition ownership, policy and expiry checks.
  const [lane, poll] = await Promise.all([
    prepareSourceLaneOverlay(),
    preparePollProjection('drops', deferTrace).catch(() => null),
  ]);
  return async (drops: Row[], snapshotId: string | null) => {
    let original: RuntimeDropOverlay;
    try { original = lane(drops, snapshotId); }
    catch { original = { drops: drops.filter(d => !inRegisteredScope(d)), version: 'unavailable' }; }
    try {
      if (poll) {
        const result = await poll(original.drops);
        return { drops: result.rows, version: original.version + ':' + result.version };
      }
    } catch { /* Fail closed for owned rows. */ }
    return { drops: failClosedPollRows(original.drops, POLL_SOURCES, 'drops'), version: original.version + ':poll-unavailable' };
  };
}

export async function readRuntimeSourceDropOverlay(drops: Row[], snapshotId: string | null) {
  return (await prepareRuntimeSourceDropOverlay())(drops, snapshotId);
}

async function readRuntimeSourceDemand(): Promise<AreaWatchlistDemand | null> {
  if (!storageEnabled()) return null;
  try { return (await repository().sql.query('SELECT payload FROM source_lane_demand WHERE singleton=true')).rows[0]?.payload as AreaWatchlistDemand || null; }
  catch { return null; }
}
export async function persistRuntimeSourceDemand(members: Array<{ id: string; areas: string[]; watchlist: string[] }>, complete: boolean) {
  if (!storageEnabled()) return;
  try {
    const { bible } = await readRuntimeLaneContext();
    const generatedAt = new Date().toISOString();
    const payload = aggregateAreaWatchlistDemand(members, { catalog: [...bible.byId.values()].map(r => ({ id: r.id, name: r.canonical, aliases: r.aliases })), allowedAreas: ['SC:north-myrtle-beach'], complete, generatedAt });
    // Daily coarse snapshots prevent high-frequency small-cohort differencing.
    await repository().sql.query(`INSERT INTO source_lane_demand(singleton,payload,updated_at) VALUES(true,$1::jsonb,$2::timestamptz)
      ON CONFLICT(singleton) DO UPDATE SET payload=EXCLUDED.payload,updated_at=EXCLUDED.updated_at
      WHERE source_lane_demand.updated_at < $2::timestamptz-interval '24 hours' OR source_lane_demand.payload->>'complete'='false'`, [JSON.stringify(payload), generatedAt]);
  } catch { /* Neutral priority if the complete safe aggregate is unavailable. */ }
}
export async function readRuntimeSourceUsefulness() {
  if (!storageEnabled()) return { enabled: false, activationReady: false };
  const sql = repository().sql;
  const [opportunities, traces, heads, batches] = await Promise.all([
    sql.query("SELECT * FROM source_lane_opportunities WHERE accepted_at>=now()-interval '7 days' ORDER BY accepted_at DESC LIMIT 1001"),
    sql.query("SELECT t.* FROM source_lane_trace t JOIN source_lane_opportunities o USING(episode_id) WHERE o.accepted_at>=now()-interval '7 days' ORDER BY t.first_at DESC LIMIT 12001"),
    sql.query('SELECT * FROM source_lane_heads ORDER BY source_id LIMIT 40'),
    sql.query('SELECT source_id,revision,accounting FROM source_lane_batches ORDER BY accepted_at DESC LIMIT 40'),
  ]);
  const result = (buildSourceLaneUsefulness as (input: Row) => Row)({ opportunities: opportunities.rows.slice(0,1000), traces: traces.rows.slice(0,12000), heads: heads.rows, batches: batches.rows,
    complete: opportunities.rows.length <= 1000 && traces.rows.length <= 12000 });
  return { ...result, pollEnabled: promotionEnabled(), windowDays: 7, demand: await readRuntimeSourceDemand() };
}

export async function traceRuntimeSourceCandidates(candidates: Row[], stage: string, channel = '', at = new Date().toISOString()) {
  await tracePollCandidates(candidates,stage,channel,at);
  if (!storageEnabled()) return;
  try { await repository().trace(candidates, stage, channel, at); } catch { /* non-authoritative */ }
}
