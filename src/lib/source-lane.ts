import { createHash, randomUUID } from 'node:crypto';
import type { SqlExecutor } from './alert-queue/postgres-repository';
import { LIQUOR_LIBRARY_SOURCE, liquorLibraryLocationUrl, liquorLibraryCatalogUrl, liquorLibrarySkuUrl, parseLiquorLibraryLocation, parseLiquorLibraryCatalogPage, parseLiquorLibraryScopedObservation, buildLiquorLibrarySignal } from '../../engine/src/collectors/south-carolina-square.mjs';
import { availabilityEpisodeIdentity, buildDrops, buildCurrentInventoryAlertsFromDrops, applyAlertPolicyToCandidate } from '../../engine/src/export-site-contract.mjs';
import { stableId } from '../../engine/src/core/text.mjs';
import { requiresStateAlertSuppression } from '../../engine/src/state-failure-isolation.mjs';
import { lifecycleAllowsInventoryAlert } from '../../engine/src/state-lifecycle.mjs';

type Row = Record<string, any>;
export type LanePolicy = { snapshotId: string | null; generatedAt: string | null; source: string; operating?: Row };
type Subject = { productId: string; siteProductId: string; variationId: string; canonicalBottleId: string; canonicalName: string; rawName: string };
export type SourceLane = { id: string; scopeVersion: string; subjects: readonly Subject[] };
// Identity-only admission from accepted SC evidence 2026-09-05. No quantities,
// price, stock or observation timestamps are carried forward from that evidence.
export const SOURCE_LANES: readonly SourceLane[] = Object.freeze([{ id: 'liquor-library:sc', scopeVersion: 'square-watchlist-v1', subjects: Object.freeze([
  { productId: 'FFTOFZZBWGD7FG4GK3RQ44HK', siteProductId: '1653', variationId: 'ECMNDRTE34JSKTX3IOOTRCB7', canonicalBottleId: 'bb_8924180d0cc2d853', canonicalName: 'Blade and Bow', rawName: 'BLADE & BOW KY 750ML' },
  { productId: 'UX7NONHAQSJCYIBDH453XTTS', siteProductId: '2168', variationId: 'SHDI4Y2QG7SWOANPFTWNIRUT', canonicalBottleId: 'bb_8b9546b93a7fbe72', canonicalName: "Booker's Bourbon", rawName: 'BOOKERS BBN' },
]) }]);
const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function sourceLanePolicyAllows(policy: LanePolicy, now: string) {
  const age = Date.parse(now) - Date.parse(policy.generatedAt || '');
  const op = policy.operating;
  return policy.source === 'remote-snapshot' && Boolean(policy.snapshotId) && Number.isFinite(age) && age >= 0 && age <= 45 * 60_000
    && op?.state === 'SC' && ['healthy', 'degraded'].includes(op.health) && op.freshness?.status === 'fresh'
    && op.fallback?.status === 'none' && !requiresStateAlertSuppression(op) && lifecycleAllowsInventoryAlert('SC');
}
export async function invokeSourceProvider<T>(input: { validate: () => Promise<boolean>; send: () => Promise<T>; recordAttempt: (at: string) => Promise<void>; recordFailed?: (at: string) => Promise<void> }): Promise<{ suppressed: true } | { suppressed: false; result: T }> {
  if (!await input.validate()) return { suppressed: true };
  // No preparatory/telemetry await may intervene between the final veto and send.
  const attemptedAt = new Date().toISOString();
  try { return { suppressed: false, result: await input.send() }; }
  catch (error) {
    try { await input.recordFailed?.(new Date().toISOString()); } catch { /* Telemetry is not delivery authority. */ }
    throw error;
  }
  finally { try { await input.recordAttempt(attemptedAt); } catch { /* Never retry/reverse a provider outcome because telemetry failed. */ } }
}

export class SourceLaneRepository {
  constructor(readonly sql: SqlExecutor) {}
  async acquire(source: string, owner: string, now: string) {
    return (await this.sql.query('SELECT * FROM source_lane_acquire($1,$2,$3)', [source, owner, now])).rows[0] as Row | undefined;
  }
  async subjects(source: string) {
    return (await this.sql.query('SELECT payload FROM source_lane_subjects WHERE source_id=$1 ORDER BY subject_id', [source])).rows.map(r => r.payload as Row);
  }
  async commit(source: string, owner: string, lease: Row, run: string, now: string, policy: LanePolicy, subjects: Row[], opportunities: Row[], accounting: Row) {
    const hash = digest({ source, run, now, policy, subjects, opportunities, accounting });
    const result = await this.sql.query('SELECT source_lane_commit($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb) AS revision',
      [source, owner, lease.generation, lease.revision, run, hash, now, policy.snapshotId, JSON.stringify(subjects), JSON.stringify(opportunities), JSON.stringify(accounting)]);
    return Number(result.rows[0].revision);
  }
  async failed(source: string, owner: string, generation: unknown, now: string, reason: string, retrySeconds = 0) {
    await this.sql.query(`UPDATE source_lane_heads SET healthy=false,failures=LEAST(failures+1,10),last_reason=$5,
      next_due_at=$4::timestamptz + make_interval(secs=>GREATEST($6::int,LEAST(3600,300*power(2,LEAST(failures,4)))::int)),
      lease_owner=NULL,lease_until=NULL WHERE source_id=$1 AND lease_owner=$2 AND generation=$3`, [source, owner, generation, now, reason, Math.min(86400, Math.max(0, retrySeconds))]);
  }
  async state() {
    return (await this.sql.query(`SELECT s.payload,h.healthy FROM source_lane_subjects s JOIN source_lane_heads h USING(source_id) ORDER BY source_id,subject_id`)).rows;
  }
  async candidates(now: string) {
    return (await this.sql.query(`SELECT o.payload FROM source_lane_opportunities o JOIN source_lane_heads h USING(source_id)
      WHERE NOT o.closed AND h.healthy AND o.expires_at>$1::timestamptz ORDER BY o.observed_at DESC LIMIT 80`, [now])).rows.map(r => r.payload as Row);
  }
  async trace(candidates: Row[], stage: string, channel = '', now = new Date().toISOString()) {
    // Bounded stage counters, no recipient identity/contact, no raw errors. Telemetry
    // is deliberately best-effort, especially AFTER external acceptance.
    const episodes = [...new Set(candidates.filter(c => c.sourceLaneId).map(c => c.availabilityEpisodeId))].slice(0, 40);
    if (!episodes.length) return;
    try {
      await this.sql.query(`INSERT INTO source_lane_trace(episode_id,stage,channel,first_at,last_at)
        SELECT episode_id,$2,$3,$4::timestamptz,$4::timestamptz FROM source_lane_opportunities WHERE episode_id=ANY($1::text[])
        ON CONFLICT(episode_id,stage,channel) DO UPDATE SET samples=source_lane_trace.samples+1,last_at=EXCLUDED.last_at`, [episodes, stage, channel, now]);
    } catch { /* Provider acceptance must never be undone by telemetry. */ }
  }
  async inspect() {
    const read = async (table: string, order: string) => (await this.sql.query(`SELECT * FROM ${table} ORDER BY ${order}`)).rows;
    return { heads: await read('source_lane_heads', 'source_id'), batches: await read('source_lane_batches', 'source_id,revision'), subjects: await read('source_lane_subjects', 'source_id,subject_id'), opportunities: await read('source_lane_opportunities', 'episode_id') };
  }
}
class SourceTransportError extends Error { constructor(readonly reason: string, readonly retrySeconds = 0) { super(reason); } }
export function boundedSourceFetcher(source: SourceLane, fetcher: typeof fetch = fetch, timeoutMs = 20_000) {
  const allow = new Set([liquorLibraryLocationUrl(), ...Array.from({ length: 7 }, (_, i) => liquorLibraryCatalogUrl(i + 1)), ...source.subjects.map(liquorLibrarySkuUrl)]);
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  let requests = 0, bytes = 0;
  return { close: () => { clearTimeout(timer); controller.abort(); }, get: async (url: string) => {
    if (!allow.has(url) || ++requests > 8 + source.subjects.length) throw new SourceTransportError('request_bound');
    const response = await fetcher(url, { signal: controller.signal, redirect: 'manual', cache: 'no-store' });
    // No redirects are needed for the exact registered API. A changed location
    // requires review rather than broadening a shared-host allowlist.
    if (!response.ok || (response.url && response.url !== url)) {
      const retry = response.headers.get('retry-after');
      const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : retry ? Math.ceil((Date.parse(retry) - Date.now()) / 1000) : 0;
      throw new SourceTransportError(response.status === 429 ? 'rate_limited' : 'http_or_redirect', Number.isFinite(seconds) ? seconds : 0);
    }
    if (Number(response.headers.get('content-length') || 0) > 1_000_000) { await response.body?.cancel(); throw new SourceTransportError('response_bound'); }
    if (!response.body) throw new SourceTransportError('empty_body');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let count = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; count += part.value.length; bytes += part.value.length;
      if (count > 1_000_000 || bytes > 6_000_000) throw new SourceTransportError('response_bound'); chunks.push(part.value); }
    } finally { await reader.cancel().catch(() => {}); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } };
}
export async function pollSourceLane(input: { repository: SourceLaneRepository; source: SourceLane; policy: LanePolicy; bible: { byId: Map<string, Row> }; enabled: boolean; dryRun?: boolean; now?: () => string; fetcher?: typeof fetch }) {
  const { repository, source, policy, bible } = input;
  const clock = input.now || (() => new Date().toISOString()); const startedAt = clock();
  if (input.dryRun || !input.enabled) return { status: 'disabled' };
  if (!SOURCE_LANES.includes(source)) return { status: 'unregistered' };
  if (!sourceLanePolicyAllows(policy, startedAt)) return { status: 'policy_denied' };
  const owner = randomUUID(), run = randomUUID();
  const lease = await repository.acquire(source.id, owner, startedAt);
  if (!lease) return { status: 'not_due' };
  const transport = boundedSourceFetcher(source, input.fetcher);
  try {
    const location = await transport.get(liquorLibraryLocationUrl());
    if (!parseLiquorLibraryLocation(location)) throw new SourceTransportError('identity_mismatch');
    const products = new Map<string, Row>(); let pages = 1, total: number | undefined;
    for (let page = 1; page <= pages; page++) {
      const raw = await transport.get(liquorLibraryCatalogUrl(page));
      const parsed = parseLiquorLibraryCatalogPage(raw, { expectedPage: page });
      if (!parsed || (total !== undefined && (total !== parsed.total || pages !== parsed.totalPages))) throw new SourceTransportError('incomplete_catalog');
      total = parsed.total; pages = parsed.totalPages;
      for (const p of raw.data as Row[]) { if (products.has(p.id)) throw new SourceTransportError('duplicate_product'); products.set(p.id, p); }
    }
    const previous = new Map((await repository.subjects(source.id)).map(s => [s.id, s]));
    const subjects: Row[] = [], opportunities: Row[] = [], inspection: Row[] = []; let unknown = 0;
    for (const definition of source.subjects) {
      const raw = products.get(definition.productId);
      const sku = await transport.get(liquorLibrarySkuUrl(definition)!);
      const proof = parseLiquorLibraryScopedObservation(raw, sku, definition);
      inspection.push({ productId: definition.productId, variationId: definition.variationId, outcome: proof?.state || 'unknown', evidenceDigest: digest({ raw, sku }), observedAt: clock() });
      if (!proof || proof.product.rawName !== definition.rawName) { unknown++; continue; }
      const observedAt = clock();
      const identity = { state: 'SC', sourceRuntimeId: 'precision:sc', canonicalBottleId: definition.canonicalBottleId, storeId: `liquor-library:${LIQUOR_LIBRARY_SOURCE.locationId}` };
      const id = availabilityEpisodeIdentity(identity), prior = previous.get(id);
      // Scope additions are always silent, even after a process restart.
      const opening = proof.state === 'available' && prior?.state === 'unavailable';
      const episodeAt = opening || !prior ? observedAt : prior.episodeAt;
      const episodeId = opening || !prior ? stableId(['availability_episode', id, episodeAt]) : prior.episodeId;
      const baseline = !prior || (prior.baseline && !opening);
      const subject: Row = { ...identity, id, state: proof.state, observedAt, episodeAt, episodeId, baseline,
        lastNegativeAt: proof.state === 'unavailable' ? observedAt : prior?.lastNegativeAt || null, scopeVersion: source.scopeVersion };
      subjects.push(subject);
      if (proof.state !== 'available') continue;
      const record = bible.byId.get(definition.canonicalBottleId);
      if (!record) { unknown++; continue; }
      const signal = buildLiquorLibrarySignal({ id: 'SC' }, proof.product, { record, match: { confidence: .94 } }, observedAt);
      if (!signal) { unknown++; continue; }
      const current = { ...signal, sourceRuntimeId: 'precision:sc' };
      const drops = (buildDrops as (...args: any[]) => Row[])([current], bible, [current], [], [current]);
      // Current inventory is a separately dated projection, including the silent
      // positive baseline. Confirmation must never move the episode in the feed.
      for (const drop of drops) Object.assign(drop, { observedAt: episodeAt, firstSeenAt: episodeAt, displayAt: episodeAt,
        lastConfirmedAt: observedAt, availabilityEpisodeId: episodeId, availabilityEpisodeStartedAt: episodeAt,
        availabilityEpisodeKind: baseline ? 'initial' : 'restock' });
      subject.sourceDrop = drops[0] || null;
      subject.confirmationExpiresAt = new Date(Date.parse(observedAt) + 2 * 3_600_000).toISOString();
      if (baseline) continue;
      for (const candidate of buildCurrentInventoryAlertsFromDrops(drops).map(applyAlertPolicyToCandidate)) {
        if (!candidate.eligibleForDelivery) continue;
        opportunities.push({ ...candidate, lastConfirmedAt: observedAt, sourceDrop: drops.find(d => d.productId === candidate.productId), sourceAreaId: 'SC:north-myrtle-beach', sourceLaneId: source.id, sourceSubjectId: id, sourceRunId: run, sourceRevision: Number(lease.revision) + 1,
          sourcePolicySnapshotId: policy.snapshotId, sourceExpiresAt: new Date(Date.parse(episodeAt) + 2 * 3_600_000).toISOString() });
      }
    }
    const finishedAt = clock();
    if (!sourceLanePolicyAllows(policy, finishedAt)) throw new SourceTransportError('policy_expired');
    const accounting = { expected: source.subjects.length, inspected: source.subjects.length, valid: subjects.length, unknown, inspection, locationDigest: digest(location), startedAt, finishedAt, scopeVersion: source.scopeVersion, scopeDigest: digest(source.subjects) };
    const revision = await repository.commit(source.id, owner, lease, run, finishedAt, policy, subjects, opportunities, accounting);
    return { status: 'accepted', revision, accounting };
  } catch (error) {
    const reason = error instanceof SourceTransportError ? error.reason : 'collection_or_persistence_error';
    await repository.failed(source.id, owner, lease.generation, clock(), reason, error instanceof SourceTransportError ? error.retrySeconds : 0);
    return { status: reason };
  } finally { transport.close(); }
}
function subjectFor(candidate: Row) {
  // The national public SC projection intentionally preserves retailer names and
  // uses a public-name ID. Resolve that alias only through exact reviewed product
  // + source + store identity, never through fuzzy bottle text.
  const definition = SOURCE_LANES.flatMap(s => [...s.subjects]).find(s => s.productId === candidate.productId);
  if (definition && candidate.state === 'SC' && candidate.sourceChain === 'liquor-library'
    && candidate.storeId === `liquor-library:${LIQUOR_LIBRARY_SOURCE.locationId}`
    && (!candidate.sourceRuntimeId || candidate.sourceRuntimeId === 'precision:sc')) {
    return availabilityEpisodeIdentity({ ...candidate, canonicalBottleId: definition.canonicalBottleId, sourceRuntimeId: 'precision:sc' });
  }
  return availabilityEpisodeIdentity({ ...candidate, canonicalBottleId: candidate.canonicalBottleId || candidate.canonicalId, sourceRuntimeId: candidate.sourceRuntimeId || (candidate.sourceChain === 'liquor-library' ? 'precision:sc' : null) });
}
export async function readSourceLaneCandidates(repository: SourceLaneRepository, snapshot: Row[], policy: LanePolicy, enabled: boolean, now = new Date().toISOString()) {
  const state = await repository.state(); const covered = new Set(state.map(r => (r.payload as Row).id));
  // The durable lane owns only its explicitly enrolled subjects. Keep baseline,
  // negative and dedupe authority on rollback; never resurrect snapshot overlap.
  const retained = snapshot.filter(c => !covered.has(subjectFor(c)));
  if (!enabled || !sourceLanePolicyAllows(policy, now)) return retained;
  const opportunities = (await repository.candidates(now)).filter(c => Date.parse(c.observedAt) <= Date.parse(now));
  return [...retained, ...opportunities];
}
export async function readSourceLaneDropOverlay(repository: SourceLaneRepository, drops: Row[], policy: LanePolicy, enabled: boolean, now = new Date().toISOString()) {
  const state = await repository.state();
  const covered = new Set(state.map(r => (r.payload as Row).id));
  const retained = drops.filter(d => !covered.has(subjectFor(d)));
  const overlays = !enabled || !sourceLanePolicyAllows(policy, now) ? [] : state
    .map(r => ({ healthy: r.healthy, payload: r.payload as Row }))
    .filter(r => r.healthy && r.payload.state === 'available'
      && Date.parse(r.payload.observedAt) <= Date.parse(now)
      && Date.parse(r.payload.confirmationExpiresAt) > Date.parse(now))
    .map(r => r.payload.sourceDrop).filter(Boolean) as Row[];
  return { drops: [...retained, ...overlays], version: digest({ state, overlays }).slice(0,24) };
}

export async function sourceCandidatesStillValid(repository: SourceLaneRepository, candidates: Row[], policy: LanePolicy, enabled: boolean, now = new Date().toISOString()) {
  const current = await readSourceLaneCandidates(repository, candidates, policy, enabled, now);
  const keys = new Set(current.map(c => c.availabilityEpisodeId || c.id));
  return candidates.every(c => keys.has(c.availabilityEpisodeId || c.id));
}
