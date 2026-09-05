import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createSourceAdapter } from '../src/sources/source-adapter.mjs';
import { runSourceAdapters } from '../src/sources/source-runner.mjs';
import { SourceCircuitBreaker } from '../src/sources/circuit-breaker.mjs';
import { SourceCheckpointStore } from '../src/sources/source-checkpoint.mjs';

const at = '2026-09-05T10:00:00.000Z';
const signal = { id: 'fixture', observedAt: at, canAlertAsInventory: true };
const adapter = (id, execute, extra = {}) => createSourceAdapter({ id, url: `https://${id}.invalid/inventory`, metadata: { stateId: 'VA' }, execute, ...extra });
async function directory(t) { const dir = await mkdtemp(join(tmpdir(), 'bs-source-checkpoint-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; }
const opts = (dir, extra = {}) => ({ checkpointDirectory: dir, now: () => at, maxAttempts: 1, ...extra });
async function checkpoints(dir) { return Promise.all((await readdir(dir)).filter(x => x.endsWith('.json')).map(async name => JSON.parse(await readFile(join(dir, name), 'utf8')))); }

test('healthy result commits durably before blocked sibling completes, without provider calls', async t => {
  const dir = await directory(t);
  let release;
  let siblingDone = false;
  const blocked = new Promise(resolve => { release = resolve; });
  const running = runSourceAdapters([
    adapter('healthy', async () => ({ signals: [signal] })),
    adapter('blocked', async () => { await blocked; siblingDone = true; throw new Error('blocked fixture'); }),
  ], {}, opts(dir, { concurrency: 2 }));
  try {
    // Bounded filesystem observation, not a fabricated callback assertion.
    let saved = [];
    for (let n = 0; n < 50 && !saved.length; n++) { saved = await checkpoints(dir); if (!saved.length) await new Promise(r => setTimeout(r, 10)); }
    assert.equal(saved.length, 1, 'healthy source should already be durable');
    assert.equal(siblingDone, false);
    assert.equal(saved[0].result.sourceId, 'healthy');
    assert.equal(saved[0].result.value.signals[0].observedAt, at);
  } finally { release(); await running; }
  assert.equal((await checkpoints(dir)).length, 2);
});

test('new runner restores result and cadence from disk without reexecuting not-due source', async t => {
  const dir = await directory(t); let executions = 0;
  const source = adapter('healthy', async () => { executions++; return { signals: [signal], usefulChanges: 0, consecutiveUnchanged: 8 }; });
  await runSourceAdapters([source], {}, opts(dir));
  const result = await runSourceAdapters([source], {}, opts(dir, { now: () => '2026-09-05T10:01:00.000Z' }));
  assert.equal(executions, 1);
  assert.equal(result.results[0].status, 'not_due');
  assert.equal(result.results[0].value.signals[0].observedAt, at);
  assert.equal(result.results[0].lastGoodAt, at);
});

test('a separate Node process consumes committed checkpoint without running the producer', async t => {
  const dir = await directory(t), source = adapter('healthy', async () => ({ signals: [signal] }));
  await runSourceAdapters([source], {}, opts(dir));
  const program = `
    import { runSourceAdapters } from ${JSON.stringify(new URL('../src/sources/source-runner.mjs', import.meta.url).href)};
    import { createSourceAdapter } from ${JSON.stringify(new URL('../src/sources/source-adapter.mjs', import.meta.url).href)};
    const adapter = createSourceAdapter({id:'healthy',url:'https://healthy.invalid/inventory',metadata:{stateId:'VA'},execute:async()=>{throw new Error('must not execute');}});
    const result = await runSourceAdapters([adapter],{}, {checkpointDirectory:${JSON.stringify(dir)},now:()=> '2026-09-05T10:01:00.000Z'});
    console.log(JSON.stringify({status:result.results[0].status,observedAt:result.results[0].value?.signals[0].observedAt}));
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', program], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), { status: 'not_due', observedAt: at });
});

test('expired checkpoint retains context but cannot become alertable or re-age evidence', async t => {
  const dir = await directory(t);
  const source = adapter('healthy', async () => ({ signals: [signal] }));
  await runSourceAdapters([source], {}, opts(dir));
  const result = await runSourceAdapters([source], {}, opts(dir, { now: () => '2026-09-05T13:00:00.000Z', baseCadenceMs: 86_400_000 }));
  assert.equal(result.results[0].status, 'not_due');
  assert.equal(result.results[0].alertable, false);
  assert.equal(result.results[0].value.signals[0].canAlertAsInventory, false);
  assert.equal(result.results[0].value.signals[0].observedAt, at);
});

test('source failure and open circuit survive restart independently of healthy sibling', async t => {
  const dir = await directory(t); let fail = false; let executions = 0;
  const source = adapter('sometimes', async () => { executions++; if (fail) throw new Error('failure'); return { signals: [signal] }; });
  await runSourceAdapters([source], {}, opts(dir)); fail = true;
  const circuitBreakerOptions = { failureThreshold: 1, cooldownMs: 3_600_000, now: () => Date.parse(at) };
  await runSourceAdapters([source], {}, opts(dir, { schedule: false, circuitBreakerOptions, now: () => '2026-09-05T10:01:00.000Z' }));
  const restarted = await runSourceAdapters([source, adapter('healthy', async () => ({ signals: [signal] }))], {}, opts(dir, { schedule: false, circuitBreakerOptions, now: () => '2026-09-05T10:02:00.000Z' }));
  assert.equal(executions, 2);
  assert.equal(restarted.results[0].status, 'circuit_open');
  assert.equal(restarted.results[0].alertable, false);
  assert.equal(restarted.results[0].value.signals[0].canAlertAsInventory, false);
  assert.equal(restarted.results[1].status, 'success');
});

test('changed URL binding never restores prior source payload', async t => {
  const dir = await directory(t); let executions = 0;
  await runSourceAdapters([adapter('same', async () => ({ signals: [signal] }))], {}, opts(dir));
  const result = await runSourceAdapters([adapter('same', async () => { executions++; return { signals: [{ ...signal, id: 'new' }] }; }, { url: 'https://other.invalid/inventory' })], {}, opts(dir, { now: () => '2026-09-05T10:01:00.000Z' }));
  assert.equal(executions, 1);
  assert.equal(result.results[0].value.signals[0].id, 'new');
  assert.equal((await checkpoints(dir)).length, 2, 'bindings have separate durable identities');
});

test('disabled checkpoint mode performs no writes', async t => {
  const dir = await directory(t);
  await runSourceAdapters([adapter('healthy', async () => ({ signals: [signal] }))], {}, { now: () => at, env: {} });
  assert.deepEqual(await readdir(dir), []);
});

test('checkpoint write failure is explicit, sanitized, and never retries the source', async t => {
  const dir = await directory(t); let executions = 0;
  const notDirectory = join(dir, 'file'); await writeFile(notDirectory, 'fixture');
  const result = await runSourceAdapters([adapter('healthy', async () => { executions++; return { signals: [signal] }; })], {}, opts(notDirectory));
  assert.equal(executions, 1);
  assert.equal(result.results[0].status, 'success');
  assert.equal(result.checkpointErrors.length, 1);
  assert.equal(result.checkpointErrors[0].code, 'checkpoint_unavailable');
  assert.equal(JSON.stringify(result.checkpointErrors).includes(notDirectory), false);
  assert.equal(result.results[0].checkpointError, 'checkpoint_unavailable', 'diagnostic survives summarizeSourceResult in real collectors');
});

test('checkpoint cannot weaken a caller-owned open circuit or mutate caller prior map', async t => {
  const dir = await directory(t); let executions = 0;
  const source = adapter('healthy', async () => { executions++; return { signals: [signal] }; });
  await runSourceAdapters([source], {}, opts(dir));
  const circuit = new SourceCircuitBreaker({ failureThreshold: 1, cooldownMs: 3_600_000, now: () => Date.parse(at) });
  circuit.recordFailure(source.id);
  const previousResults = new Map();
  const result = await runSourceAdapters([source], {}, opts(dir, { schedule: false, circuitBreaker: circuit, previousResults, now: () => '2026-09-05T10:01:00.000Z' }));
  assert.equal(executions, 1, 'live caller gate outranks stored closed circuit');
  assert.equal(result.results[0].alertable, false);
  assert.equal(previousResults.size, 0, 'caller state is not mutated');
});

test('newer checkpoint probe clock wins over older artifact metrics without weakening policy', async t => {
  const dir = await directory(t); let executions = 0;
  const source = adapter('healthy', async () => { executions++; return { signals: [signal] }; });
  await runSourceAdapters([source], {}, opts(dir));
  const options = opts(dir, { now: () => '2026-09-05T10:01:00.000Z', sourceMetrics: { healthy: { lastProbeAt: '2026-09-04T00:00:00.000Z', probes: 2 } } });
  await runSourceAdapters([source], {}, options);
  assert.equal(executions, 1);
  assert.equal(options.sourceMetrics.healthy.lastProbeAt, '2026-09-04T00:00:00.000Z');
});

test('restored source circuit preserves custom caller cooldown rather than defaulting to five minutes', async t => {
  const dir = await directory(t); let executions = 0;
  const source = adapter('blocked', async () => { executions++; throw new Error('synthetic'); });
  const breaker = now => new SourceCircuitBreaker({ failureThreshold: 1, cooldownMs: 3_600_000, now: () => now });
  const start = new Date(Date.now() - 10 * 60_000).toISOString();
  await runSourceAdapters([source], {}, opts(dir, { now: () => start, circuitBreaker: breaker(Date.parse(start)), schedule: false }));
  const later = new Date().toISOString();
  const result = await runSourceAdapters([source], {}, opts(dir, { circuitBreaker: breaker(Date.parse(later)), schedule: false, now: () => later }));
  assert.equal(executions, 1);
  assert.equal(result.results[0].status, 'circuit_open');
});

test('read-only inspection does not create directory, tampering and oversized files fail closed', async t => {
  const dir = await directory(t), source = adapter('healthy', async () => ({ signals: [signal] }));
  const missing = new SourceCheckpointStore(join(dir, 'missing'));
  assert.equal(await missing.read(source), null);
  assert.deepEqual(await readdir(dir), []);
  await runSourceAdapters([source], {}, opts(dir));
  const store = new SourceCheckpointStore(dir), saved = await store.read(source);
  saved.result.value.signals[0].observedAt = '2099-01-01T00:00:00.000Z';
  await writeFile(store.path(source), JSON.stringify(saved));
  await assert.rejects(store.read(source), { code: 'checkpoint_invalid' });
  await writeFile(store.path(source), 'x'.repeat(8 * 1024 * 1024 + 1));
  await assert.rejects(store.read(source), { code: 'checkpoint_oversized' });
});

test('exclusive writer lock and monotonic checkpoints prevent overwrite or duplicate replay', async t => {
  const dir = await directory(t), source = adapter('healthy', async () => ({ signals: [signal] }));
  await runSourceAdapters([source], {}, opts(dir));
  const store = new SourceCheckpointStore(dir), saved = await store.read(source);
  await store.write(source, saved.result, saved.circuit);
  await assert.rejects(store.write(source, { ...saved.result, status: 'failed' }, saved.circuit), { code: 'checkpoint_conflict' });
  await assert.rejects(store.write(source, { ...saved.result, finishedAt: '2026-09-05T09:00:00.000Z' }, saved.circuit), { code: 'checkpoint_superseded' });
  await writeFile(`${store.path(source)}.lock`, '');
  await assert.rejects(store.write(source, saved.result, saved.circuit), { code: 'checkpoint_writer_busy' });
  assert.deepEqual(await store.read(source), saved);
});
