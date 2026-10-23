import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { observationConfig, observationTick, readObservationHealth, runObservation, SLOT_MS, MAX_SLOTS } from './source-observation-runner.mjs';

const start = Date.parse('2026-10-23T03:00:00Z');
const config = observationConfig({ observationId: 'fixture-818', expectedCommit: 'a'.repeat(40), startedAt: new Date(start).toISOString(), deadline: new Date(start + 48 * 3600000).toISOString() });
const fresh = () => ({ version: 1, config, reservations: [] });
function fixture() {
  const state = fresh(), events = [], saved = [];
  const f = { now: start, runs: [], release: { status: 'healthy', commit: config.expectedCommit }, failDispatch: false, failSave: false,
    state, events, saved, dispatches: 0 };
  f.io = { now: () => f.now, health: async () => { events.push('health'); return { release: f.release }; }, listRuns: async () => { events.push('list'); return f.runs; },
    save: async value => { events.push('save'); if (f.failSave) throw new Error('disk failure'); saved.push(structuredClone(value)); },
    dispatch: async id => { events.push('dispatch'); f.dispatches++; assert.equal(saved.at(-1).reservations.at(-1).status, 'reserved'); if (f.failDispatch) throw new Error('timeout after possible dispatch'); } };
  f.tick = () => observationTick(state, config, f.io);
  f.complete = () => { const row = state.reservations.at(-1); f.runs = [{ databaseId: 123, event: 'workflow_dispatch', status: 'completed', conclusion: 'success', createdAt: row.reservedAt, displayTitle: `Source observation ${row.observationId}` }]; };
  return f;
}
test('requires a bounded immutable configuration and valid state before any network work', async () => {
  for (const patch of [{ deadline: new Date(start + 48 * 3600000 + 1).toISOString() }, { expectedCommit: 'main' }, { observationId: '../unsafe' }, { deadline: config.startedAt }]) assert.throws(() => observationConfig({ ...config, ...patch }));
  const f = fixture(); f.state.config = { ...config, expectedCommit: 'b'.repeat(40) }; await assert.rejects(f.tick); assert.deepEqual(f.events, []);
});
test('reserves durably before dispatch and cannot replay the same slot', async () => {
  const f = fixture(); assert.equal((await f.tick()).status, 'submitted'); assert.deepEqual(f.events, ['health', 'list', 'save', 'dispatch', 'save']);
  assert.equal((await f.tick()).status, 'slot_already_reserved'); assert.equal(f.dispatches, 1);
});
test('failure to persist reservation prevents dispatch', async () => {
  const f = fixture(); f.failSave = true; await assert.rejects(f.tick); assert.equal(f.dispatches, 0);
});
test('post-dispatch persistence failure preserves an uncertain reservation without retry', async () => {
  const f = fixture(), save = f.io.save; let calls = 0;
  f.io.save = async state => { if (++calls === 2) throw new Error('disk failure after GitHub accepted request'); return save(state); };
  assert.equal((await f.tick()).status, 'dispatch_outcome_unknown'); assert.equal(f.saved.at(-1).reservations[0].status, 'unknown');
  f.now += SLOT_MS; assert.equal((await f.tick()).status, 'prior_outcome_unknown'); assert.equal(f.dispatches, 1);
});
test('ambiguous timeout remains reserved across restart and later slots without replay', async () => {
  const f = fixture(); f.failDispatch = true; assert.equal((await f.tick()).status, 'dispatch_outcome_unknown');
  const restarted = structuredClone(f.saved.at(-1)); f.now += SLOT_MS;
  assert.equal((await observationTick(restarted, config, f.io)).status, 'prior_outcome_unknown'); assert.equal(f.dispatches, 1);
  const row = restarted.reservations[0]; f.runs = [{ databaseId: 123, event: 'workflow_dispatch', status: 'completed', conclusion: 'failure', createdAt: row.reservedAt, displayTitle: `Source observation ${row.observationId}` }];
  f.failDispatch = false; assert.equal((await observationTick(restarted, config, f.io)).status, 'submitted'); assert.equal(restarted.reservations[0].conclusion, 'failure');
});
test('never catches up missed slots and rejects in-flight capture or workflow', async () => {
  const f = fixture(); f.now += 7 * SLOT_MS; await f.tick(); assert.deepEqual(f.state.reservations.map(r => r.slot), [7]); f.now += SLOT_MS;
  f.complete(); f.runs[0].status = 'in_progress'; assert.equal((await f.tick()).status, 'capture_in_flight');
  f.runs[0].status = 'completed'; f.runs.push({ status: 'queued' }); assert.equal((await f.tick()).status, 'workflow_in_flight'); assert.equal(f.dispatches, 1);
});
test('production release must be healthy and exactly match expected commit', async () => {
  for (const release of [null, {}, { status: 'unhealthy', commit: config.expectedCommit }, { status: 'healthy', commit: 'b'.repeat(40) }]) {
    const f = fixture(); f.release = release; assert.equal((await f.tick()).status, 'release_not_verified'); assert.equal(f.dispatches, 0); assert.deepEqual(f.events, ['health']);
  }
});
test('actual HTTP adapter captures degraded HTTP503 when release identity remains healthy', async () => {
  const f = fixture();
  f.io.health = () => readObservationHealth(async () => Response.json({ ok: false, issues: ['collector_delay'], release: f.release }, { status: 503 }));
  assert.equal((await f.tick()).status, 'submitted'); assert.equal(f.state.reservations[0].healthHttpStatus, 503); assert.equal(f.dispatches, 1);
});
test('actual HTTP adapter rejects unsupported/nonJSON bodies and wrong deployment on503', async () => {
  const f = fixture(); f.io.health = () => readObservationHealth(async () => Response.json({ release: { ...f.release, commit: 'b'.repeat(40) } }, { status: 503 }));
  assert.equal((await f.tick()).status, 'release_not_verified');
  f.io.health = () => readObservationHealth(async () => Response.json({ release: f.release }, { status: 403 })); assert.equal((await f.tick()).status, 'release_not_verified');
  f.io.health = () => readObservationHealth(async () => new Response('<html>unavailable</html>', { status: 503 })); await assert.rejects(f.tick);
  assert.equal(f.dispatches, 0);
});
test('health or metadata failures do not reserve or dispatch', async () => {
  for (const failure of ['health', 'listRuns']) { const f = fixture(); f.io[failure] = async () => { throw new Error('timeout'); }; await assert.rejects(f.tick); assert.equal(f.dispatches, 0); assert.equal(f.state.reservations.length, 0); }
});
test('expiry and pre-start never access the network; elapsed metadata slot never dispatches', async () => {
  const f = fixture(); f.now = start - 1; assert.equal((await f.tick()).status, 'not_started'); f.now = Date.parse(config.deadline); assert.equal((await f.tick()).status, 'expired'); assert.deepEqual(f.events, []);
  f.now = start; f.io.listRuns = async () => { f.now += SLOT_MS; return []; }; assert.equal((await f.tick()).status, 'slot_elapsed'); assert.equal(f.dispatches, 0);
});
test('48 hour window permits at most 288 single-slot reservations', async () => {
  const f = fixture();
  for (let slot = 0; slot < MAX_SLOTS; slot++) { f.now = start + slot * SLOT_MS; if (slot) f.complete(); assert.equal((await f.tick()).status, 'submitted'); }
  f.now = start + MAX_SLOTS * SLOT_MS; assert.equal((await f.tick()).status, 'expired'); assert.equal(f.dispatches, 288);
});
test('reused slot labels, duplicate metadata and malformed reservations fail closed', async () => {
  const f = fixture(); await f.tick(); f.now += SLOT_MS; f.complete(); f.runs[0].createdAt = new Date(start - 2000).toISOString(); assert.equal((await f.tick()).status, 'prior_outcome_unknown');
  f.complete(); f.runs.push({ ...f.runs[0] }); assert.equal((await f.tick()).status, 'prior_outcome_unknown');
  f.state.reservations.push({ ...f.state.reservations[0] }); await assert.rejects(f.tick);
});
test('existing current-slot metadata cannot be redispatched after state loss', async () => {
  const f = fixture(); f.runs = [{ displayTitle: 'Source observation fixture-818-s0', status: 'completed' }];
  assert.equal((await f.tick()).status, 'slot_metadata_already_exists'); assert.equal(f.dispatches, 0);
});
test('real exclusive file lock blocks concurrent writer; restart retains reservations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bs-observation-'));
  try {
    const stateFile = join(directory, 'state.json'), f = fixture(); let releaseHealth, entered;
    const enteredPromise = new Promise(resolve => { entered = resolve; });
    const waitHealth = new Promise(resolve => { releaseHealth = resolve; });
    const options = { stateFile, ...config };
    const dispatch = async () => { f.dispatches++; assert.equal(JSON.parse(await readFile(stateFile, 'utf8')).reservations.at(-1).status, 'reserved'); };
    const running = runObservation(options, { ...f.io, dispatch, health: async () => { entered(); await waitHealth; return { release: f.release }; } });
    await enteredPromise; assert.equal((await runObservation(options, f.io)).status, 'writer_locked');
    releaseHealth(); assert.equal((await running).status, 'submitted');
    assert.equal((await runObservation(options, f.io)).status, 'slot_already_reserved');
    const state = JSON.parse(await readFile(stateFile, 'utf8')); assert.equal(state.reservations.length, 1); assert.equal(state.reservations[0].status, 'submitted');
    await writeFile(stateFile, '{broken'); await assert.rejects(runObservation(options, f.io)); assert.equal(f.dispatches, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('capture-only workflow skips monitor/rescue; runner has no source scheduler or secret access', async () => {
  const workflow = await readFile(new URL('../.github/workflows/source-scheduler-monitor.yml', import.meta.url), 'utf8');
  const monitor = workflow.slice(workflow.indexOf('- name: Check due times'), workflow.indexOf('- name: Capture source generations'));
  assert.match(workflow, /capture_only:\s*[\s\S]*?type: boolean/); assert.match(monitor, /if: \$\{\{ !inputs\.capture_only \}\}/);
  assert.match(workflow, /Capture source generations[\s\S]*?if: always\(\)/);
  const runner = await readFile(new URL('./source-observation-runner.mjs', import.meta.url), 'utf8');
  assert.match(runner, /'--ref', 'main'/); assert.match(runner, /'capture_only=true'/);
  assert.doesNotMatch(runner, /api\/ops\/source-scheduler|SOURCE_SCHEDULER_SECRET|ENGINE_SNAPSHOT_ENCRYPTION_KEY|process\.env|monitor-source-scheduler/);
});
