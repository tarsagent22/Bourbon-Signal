import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// All transport and member/provider fixtures are synthetic. Database functions,
// parser, projection, candidate reader and normal reservation are real.
const load = async () => {
  const mod = await import('../src/lib/source-lane.ts').catch(() => null);
  assert.ok(mod, 'trusted runtime source lane must exist');
  return mod.default || mod;
};
test('normal runtime is wired before candidate read and final channel boundaries retain durable veto', async () => {
  const delivery = await readFile(new URL('../src/lib/alert-delivery.ts', import.meta.url), 'utf8');
  assert.match(delivery, /await pollRuntimeSourceLanes\(/);
  assert.ok(delivery.indexOf('await pollRuntimeSourceLanes(dryRun') < delivery.indexOf('const now = new Date().toISOString();', delivery.indexOf('export async function deliverPreferenceAlerts')), 'delivery clock is captured after source observation, never before it');
  assert.match(delivery, /await mergeRuntimeSourceCandidates\(/);
  assert.match(delivery, /await runtimeSourceCandidatesStillValid\(/);
  const route = await readFile(new URL('../src/app/api/alerts/deliver/route.ts', import.meta.url), 'utf8');
  assert.match(route, /heartbeatEligible = scheduledRun && !dryRun && queueMode !== "shadow"/);
  assert.match(delivery, /const sourceValidity = await Promise\.all/);
  assert.match(delivery, /provider_attempt", "push"/);
  assert.match(delivery, /const queueRepository = dryRun \|\|/);
  assert.match(delivery, /if \(memberLeaseRepository && !dryRun\)/);
});

test('source lane: durable bootstrap, restock, replay, negative veto, expiry and fenced takeover', async t => {
  const lane = await load();
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(await readFile(new URL('../src/lib/source-lane-schema.sql', import.meta.url), 'utf8'));
  const repo = new lane.SourceLaneRepository({ query: (s: string, p: unknown[] = []) => db.query(s, p) });
  const now = Date.now();
  let logicalNow = now;
  t.mock.method(Date, 'now', () => logicalNow);
  const at = (n: number) => new Date(now + n * 300_000).toISOString();
  const source = lane.SOURCE_LANES[0];
  const subjects = source.subjects;
  const bible = { byId: new Map(subjects.map((s: any) => [s.canonicalBottleId, { id: s.canonicalBottleId, canonical: s.canonicalName, tier: 'allocated', aliases: [] }])) };
  const policy = (n: number) => ({ snapshotId: 'fixture-policy', generatedAt: at(n), source: 'remote-snapshot', operating: { state: 'SC', health: 'healthy', freshness: { status: 'fresh' }, fallback: { status: 'none' } } });
  const fixture = lane.syntheticInspectionFixture;
  // Test fixture lives outside the runtime implementation.
  const { transport } = await import('./fixtures/source-lane-fixture.mts');
  async function poll(n: number, stock: number, extra = {}) {
    logicalNow = Date.parse(at(n));
    return lane.pollSourceLane({ repository: repo, source, policy: policy(n), bible, now: () => at(n), fetcher: transport(source, stock), enabled: true, ...extra });
  }
  assert.equal((await poll(0, 2)).status, 'accepted');
  assert.equal((await lane.readSourceLaneCandidates(repo, [], policy(0), true, at(0))).length, 0, 'first positives silently baseline');
  await poll(1, 2);
  assert.equal((await repo.inspect()).opportunities.length, 0, 'reconfirmation does not retrigger');
  await poll(2, 0);
  const restock = await poll(3, 3);
  assert.equal(restock.status, 'accepted');
  const candidates = await lane.readSourceLaneCandidates(repo, [], policy(3), true, at(3));
  assert.equal(candidates.length, subjects.length, JSON.stringify(await repo.inspect()));
  assert.ok(candidates[0].sourceDrop, 'alerted opportunity must carry the canonical feed projection');
  assert.equal(candidates[0].sourceDrop.availabilityEpisodeId, candidates[0].availabilityEpisodeId);
  assert.equal(candidates[0].availabilityEpisodeKind, 'restock');
  const overlay = await lane.readSourceLaneDropOverlay(repo, [candidates[0].sourceDrop, { id:'unrelated', state:'NC' }], policy(3), true, at(3));
  assert.equal(overlay.drops.length, subjects.length+1);
  assert.equal(new Set(overlay.drops.map((d:any)=>d.id)).size, overlay.drops.length);
  assert.equal(candidates[0].sourceRuntimeId, 'precision:sc');
  assert.equal(candidates[0].signalAt, at(3));
  assert.equal((await lane.readSourceLaneCandidates(repo, candidates, policy(3), true, at(3))).length, subjects.length, `snapshot overlap does not double: ${JSON.stringify(candidates[0])}`);
  assert.equal((await lane.readSourceLaneCandidates(repo, candidates, policy(3), false, at(3))).length, 0, 'rollback retains scoped suppression');
  assert.equal((await lane.readSourceLaneCandidates(repo, [], policy(3), true, at(30))).length, 0, 'expiry is unknown, not a negative');
  assert.equal((await lane.readSourceLaneCandidates(repo, [], { ...policy(3), operating: { ...policy(3).operating, health: 'blocked' } }, true, at(3))).length, 0);
  // Compose the accepted parser result with the actual member matcher and queue,
  // not a producer-only table assertion.
  await db.exec(await readFile(new URL('../src/lib/alert-queue/schema.sql', import.meta.url), 'utf8'));
  const deliveryImport = await import('../src/lib/alert-delivery.ts');
  const delivery = deliveryImport.default || deliveryImport;
  const queueImport = await import('../src/lib/alert-queue/postgres-repository.ts');
  const gateImport = await import('../src/lib/alert-queue/delivery-gate.ts');
  const dedupeImport = await import('../src/lib/alert-dedupe.ts');
  const { PostgresAlertQueueRepository } = queueImport.default || queueImport;
  const { reserveAlertDeliveryBatch } = gateImport.default || gateImport;
  const { stableUnderlyingAlertKey } = dedupeImport.default || dedupeImport;
  const queue = new PostgresAlertQueueRepository({ query: (s: string, p: unknown[] = []) => db.query(s, p) });
  await queue.registerSnapshot({ snapshotId: 'fixture-policy', appCommit: 'fixture', engineCommit: 'fixture', collectionRunId: 'fixture', generatedAt: at(3), manifest: { synthetic: true } });
  const matching = candidates.filter((c: any) => delivery.candidateMatchesArea(c, delivery.normalizeAreaPrefs({ states: ['SC'] })));
  assert.equal(matching.length, subjects.length);
  assert.equal(candidates.filter((c: any) => delivery.candidateMatchesArea(c, delivery.normalizeAreaPrefs({ states: ['NC'] }))).length, 0);
  assert.equal(delivery.candidatePassesFreshEmailGuardrails({ ...candidates[0], tier: 'standard' }, at(3)), false);
  const input = { snapshotId: 'fixture-policy', userId: 'synthetic-paid-member', channel: 'email', locationKey: 'liquor-library:45SNB155S1XMP', alertWindow: 'stable-v2', createdAt: at(3), children: matching.map((c: any) => ({ stableMatchKey: stableUnderlyingAlertKey(c), payload: c })) };
  const reserved = await reserveAlertDeliveryBatch(queue, input, { mode: 'active', workerId: 'fixture', now: at(3) });
  assert.equal(reserved.claimed.length, subjects.length);
  await repo.trace(matching, 'reserved', 'email', at(3));
  let providerCalls = 0;
  const providerStub = async () => { providerCalls++; return { id: 'synthetic-provider-accepted' }; };
  assert.equal(await lane.sourceCandidatesStillValid(repo, matching, policy(3), true, at(3)), true);
  await repo.trace(matching, 'provider_attempt', 'email', at(3));
  const accepted = await providerStub();
  await repo.trace(matching, 'provider_accepted', 'email', at(3));
  await queue.markBatchDelivered(reserved.claimed.map((r: any) => r.id), accepted.id, at(3));
  assert.equal((await reserveAlertDeliveryBatch(queue, input, { mode: 'active', workerId: 'restarted', now: at(3) })).claimed.length, 0);
  assert.equal(providerCalls, 1);
  assert.equal((await db.query('SELECT * FROM alert_deliveries')).rows.length, subjects.length);
  const firstObserved = (await repo.inspect()).opportunities.map((o:any)=>o.observed_at);
  await poll(4, 3);
  assert.deepEqual((await repo.inspect()).opportunities.map((o:any)=>o.observed_at), firstObserved, 'latency origin remains the first observed episode, not latest reconfirmation');
  assert.deepEqual((await lane.readSourceLaneCandidates(repo, [], policy(4), true, at(4))).map((c:any)=>c.availabilityEpisodeId).sort(), candidates.map((c:any)=>c.availabilityEpisodeId).sort());
  await poll(5, 0);
  assert.equal(await lane.sourceCandidatesStillValid(repo, candidates, policy(5), true, at(5)), false);
  assert.equal((await lane.readSourceLaneCandidates(repo, candidates, policy(5), true, at(5))).length, 0, 'negative vetoes old snapshot');
  const afterNegative = await lane.readSourceLaneDropOverlay(repo, [candidates[0].sourceDrop, { ...candidates[0].sourceDrop, id:'other-store', storeId:'different-store' }], policy(5), false, at(5));
  assert.deepEqual(afterNegative.drops.map((d:any)=>d.id), ['other-store'], 'feed rollback retains exact-store tombstone without suppressing another store');
  let vetoedCalls = 0;
  const vetoed = await lane.invokeSourceProvider({ validate: () => lane.sourceCandidatesStillValid(repo, candidates, policy(5), true, at(5)), send: async () => { vetoedCalls++; }, recordAttempt: async () => { throw new Error('must not record an unattempted send'); } });
  assert.equal(vetoed.suppressed, true); assert.equal(vetoedCalls, 0);
  const acceptedDespiteTelemetry = await lane.invokeSourceProvider({ validate: async () => true, send: async () => 'accepted', recordAttempt: async () => { throw new Error('telemetry unavailable'); } });
  assert.equal(acceptedDespiteTelemetry.result, 'accepted');
  const before = await repo.inspect();
  let fetches = 0;
  await poll(6, 3, { dryRun: true, fetcher: async () => { fetches++; throw new Error('must not fetch'); } });
  assert.equal(fetches, 0); assert.deepEqual(await repo.inspect(), before, 'dry-run no DB writes');
  const a = await repo.acquire(source.id, 'a', at(6));
  const b = await repo.acquire(source.id, 'b', new Date(Date.parse(at(6)) + 60_001).toISOString());
  assert.ok(a && b); assert.ok(Number(b.generation) > Number(a.generation));
  await assert.rejects(repo.commit(source.id, 'a', a, 'stale', at(6), policy(6), [], [], { expected: 2, inspected: 2 }), /fenced/);
});

test('real SQL concurrent claims, same-revision writers, immutable replay and transaction rollback', async t => {
  const lane = await load(), db = new PGlite(); t.after(() => db.close());
  await db.exec(await readFile(new URL('../src/lib/source-lane-schema.sql', import.meta.url), 'utf8'));
  const repo = new lane.SourceLaneRepository({ query: (s: string, p: unknown[] = []) => db.query(s,p) });
  const source = lane.SOURCE_LANES[0].id, now = new Date().toISOString();
  const claims = await Promise.all([repo.acquire(source,'one',now), repo.acquire(source,'two',now)]);
  assert.equal(claims.filter(Boolean).length,1);
  const lease = claims[0] || claims[1], owner = claims[0] ? 'one' : 'two';
  const policy = { snapshotId:'fixture', generatedAt:now, source:'remote-snapshot' };
  const accounting = { expected:0, inspected:0, unknown:0 };
  const writes = await Promise.allSettled(['one','two'].map(run => repo.commit(source,owner,lease,run,now,policy,[],[],accounting)));
  assert.equal(writes.filter(w => w.status==='fulfilled').length,1);
  const acceptedRun = writes[0].status==='fulfilled' ? 'one' : 'two';
  const before = await repo.inspect();
  assert.equal(await repo.commit(source,owner,lease,acceptedRun,now,policy,[],[],accounting),1);
  assert.deepEqual(await repo.inspect(),before,'replay cannot renew freshness');
  await assert.rejects(repo.commit(source,owner,lease,acceptedRun,now,policy,[],[],{...accounting, unknown:1}), /replay_conflict/);
  const later = new Date(Date.parse(now)+300_001).toISOString();
  const next = await repo.acquire(source,'next',later);
  const duplicate = { id:'synthetic-subject',state:'unavailable',observedAt:later,episodeId:'synthetic' };
  await assert.rejects(repo.commit(source,'next',next,'rollback',later,policy,[duplicate,duplicate],[],{ expected:2,inspected:2,unknown:0 }), /observation_not_newer/);
  assert.equal((await repo.inspect()).batches.length,1,'function exception rolls back batch and subject changes');
  assert.equal((await repo.inspect()).subjects.length,0);
});

test('transport rejects arbitrary URLs, redirects, oversized bodies and honors Retry-After', async () => {
  const lane = await load();
  const square = await import('../engine/src/collectors/south-carolina-square.mjs');
  let calls=0;
  const denied = lane.boundedSourceFetcher(lane.SOURCE_LANES[0], async () => { calls++; return new Response('{}'); });
  try { await assert.rejects(denied.get('https://attacker.invalid/'), /request_bound/); assert.equal(calls,0); } finally { denied.close(); }
  for (const response of [new Response('',{status:302,headers:{location:'https://attacker.invalid'}}),new Response('{}',{headers:{'content-length':'1000001'}}),new Response('x'.repeat(1000001))]) {
    const fetcher = lane.boundedSourceFetcher(lane.SOURCE_LANES[0], async()=>response);
    try { await assert.rejects(fetcher.get(square.liquorLibraryLocationUrl()), /http_or_redirect|response_bound/); } finally { fetcher.close(); }
  }
  const limited = lane.boundedSourceFetcher(lane.SOURCE_LANES[0], async()=>new Response('',{status:429,headers:{'retry-after':'1200'}}));
  try { await assert.rejects(limited.get(square.liquorLibraryLocationUrl()), (e:any)=>e.reason==='rate_limited' && e.retrySeconds===1200); } finally { limited.close(); }
});

test('runtime poll fails closed for policy, identity and bounds; independent source commit precedes slow sibling', async t => {
  const lane = await load();
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(await readFile(new URL('../src/lib/source-lane-schema.sql', import.meta.url), 'utf8'));
  const repo = new lane.SourceLaneRepository({ query: (s: string, p: unknown[] = []) => db.query(s, p) });
  const source = lane.SOURCE_LANES[0], now = new Date().toISOString();
  const policy = { snapshotId: 'fixture', source: 'remote-snapshot', generatedAt: now, operating: { state: 'SC', health: 'healthy', freshness: { status: 'fresh' }, fallback: { status: 'none' } } };
  let calls = 0;
  const options = { repository: repo, source, now: () => now, enabled: true, bible: { byId: new Map() }, fetcher: async () => { calls++; throw Error('no'); } };
  assert.equal((await lane.pollSourceLane({ ...options, policy: { ...policy, source: 'cache-fallback' } })).status, 'policy_denied');
  assert.equal(calls, 0);
  const { transport } = await import('./fixtures/source-lane-fixture.mts');
  let release!: () => void;
  const slow = new Promise<void>(r => { release = r; });
  let slowDone = false; void slow.then(() => { slowDone = true; });
  await lane.pollSourceLane({ ...options, policy, fetcher: transport(source, 2) });
  assert.equal(slowDone, false); assert.equal((await repo.inspect()).batches.length, 1); release();
});
