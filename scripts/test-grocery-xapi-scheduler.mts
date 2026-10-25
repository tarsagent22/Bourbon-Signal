import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { GROCERY_XAPI_SOURCES } from '../engine/src/sources/grocery-xapi-policy.mjs';
import { mergePollProjection, recoveryPolicy } from '../engine/src/sources/poll-policy.mjs';
const importedScheduler = await import('../src/lib/source-scheduler');
const { classifyPollError, pollSourceRegistry } = (importedScheduler as any).default || importedScheduler;

const source = { id: 'xapi:nv:albertsons:4024', state: 'NV', kind: 'grocery-xapi',
  chain: 'xapi:nv:albertsons:4024', cadence: 1800, expiryHours: 1, failClosedOnError: true,
  noImmediateRetry: true, accessDeniedPauseSeconds: 86400, rateLimitedPauseSeconds: 14400,
  definition: { premise: { storeId: 'albertsons:4024' }, bindings: [{ productId: '960051942', variantId: '960051942' }] } };

test('actual scheduler registry is empty for XAPI; typed source failures select durable pause without retry', () => {
  assert.deepEqual(GROCERY_XAPI_SOURCES, []);
  assert.equal(pollSourceRegistry().filter(row => row.kind === 'grocery-xapi').length, 0);
  for (const [input, expected] of [
    [{ status: 403 }, 'source_access_denied'], [{ status: 401 }, 'source_access_denied'],
    [{ status: 429 }, 'rate_limited'], [{ status: 503 }, 'http_5xx'],
    [{ kind: 'timeout' }, 'timeout'], [{ kind: 'malformed' }, 'source_identity_or_schema_failure'],
  ] as const) {
    const reason = classifyPollError(Object.assign(new Error('Grocery XAPI request failed'), input));
    assert.equal(reason, expected);
    const recovery = recoveryPolicy(reason, 0, 900, source);
    assert.equal(recovery.retry, false);
    if (reason === 'source_access_denied') assert.equal(recovery.pause, 86400);
    if (reason === 'rate_limited') assert.equal(recovery.pause, 14400);
    assert(recovery.backoff >= 900);
  }
});

test('real SQL lease retains failure history, due times and sibling stock while stale writers are fenced', async () => {
  // Isolated in-memory database. No production connection, observation ledger,
  // scheduler due time or release state is touched by this simulation.
  const db = new PGlite();
  try {
    await db.exec(await readFile('src/lib/source-scheduler-schema.sql', 'utf8'));
    const acquire = async (id: string, owner: string) => (await db.query<any>('SELECT * FROM source_poll_acquire($1,$2,$3)', [id, owner, 1800])).rows[0];
    const finish = async (owner: string, generation: number, projection: unknown, reason: string, backoff = 0, pause = 0) =>
      (await db.query<any>('SELECT source_poll_finish($1,$2,$3,$4::jsonb,$5,$6,$7,$8::jsonb) AS committed',
        [source.id, owner, generation, projection === null ? null : JSON.stringify(projection), reason, backoff, pause, JSON.stringify({ requestCount: 1, bytes: 123, manualDueReset: false })])).rows[0].committed;
    const first = await acquire(source.id, 'initial');
    assert.equal(await acquire(source.id, 'overlapping'), undefined);
    const at = new Date().toISOString();
    const row = { id: 'accepted', state: 'NV', sourceChain: source.chain, sourceRuntimeId: source.id,
      storeId: 'albertsons:4024', productId: '960051942', variantId: '960051942', observedAt: at,
      signalAt: at, lastConfirmedAt: at, canAlertAsInventory: true, canAlertAsWatch: false };
    const projection = { drops: [row], candidates: [row] };
    assert.equal(await finish('initial', first.generation, projection, 'accepted'), true);
    const sibling={...source,id:'xapi:ca:albertsons:745',chain:'xapi:ca:albertsons:745',state:'CA',
      definition:{premise:{storeId:'albertsons:745'},bindings:source.definition.bindings}};
    const siblingLease=await acquire(sibling.id,'healthy-sibling');
    const siblingRow={...row,id:'sibling',state:'CA',sourceChain:sibling.chain,sourceRuntimeId:sibling.id,storeId:'albertsons:745'};
    await db.query('SELECT source_poll_finish($1,$2,$3,$4::jsonb,$5,0,0,$6::jsonb)',
      [sibling.id,'healthy-sibling',siblingLease.generation,JSON.stringify({drops:[siblingRow],candidates:[siblingRow]}),'accepted','{}']);
    assert.equal(await acquire(source.id, 'not-due'), undefined);
    // Advance only this test database's clock fixture to simulate the next due run.
    await db.query("UPDATE source_poll_jobs SET next_due_at=now()-interval '1 minute' WHERE source_id=$1", [source.id]);
    const next = await acquire(source.id, 'next-due');
    assert(Number(next.generation) > Number(first.generation));
    const recovery = recoveryPolicy('source_access_denied', 0, 900, source);
    assert.equal(await finish('next-due', next.generation, null, 'source_access_denied', recovery.backoff, recovery.pause), true);
    assert.equal(await finish('initial', first.generation, { drops: [], candidates: [] }, 'accepted'), false);
    assert.equal(await acquire(source.id, 'denied-before-due'), undefined);
    const job = (await db.query<any>('SELECT * FROM source_poll_jobs WHERE source_id=$1', [source.id])).rows[0];
    assert.equal(job.last_reason, 'source_access_denied');
    assert(Date.parse(job.paused_until) > Date.now() + 23 * 3600_000);
    assert.deepEqual(job.projection, projection, 'last accepted evidence is retained as history');
    assert.deepEqual(mergePollProjection([], [job], [source], 'candidates'), []);
    const stale = mergePollProjection([], [job], [source], 'drops');
    assert.equal(stale[0].stale, true); assert.equal(stale[0].canAlertAsInventory, false);
    const jobs=(await db.query<any>('SELECT * FROM source_poll_jobs')).rows;
    assert.deepEqual(mergePollProjection([],jobs,[source,sibling],'candidates').map(row=>row.id),['sibling']);
    const runs = (await db.query<any>('SELECT status,accounting FROM source_poll_runs WHERE source_id=$1 ORDER BY generation',[source.id])).rows;
    assert.deepEqual(runs.map(row => row.status), ['accepted', 'source_access_denied']);
    assert.equal(runs[1].accounting.requestCount, 1);
    assert.equal(runs[1].accounting.manualDueReset, false);
  } finally { await db.close(); }
});
