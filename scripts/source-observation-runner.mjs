import { readFile, mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
export const SLOT_MS = 600_000;
export const MAX_SLOTS = 288;
const REPO = 'tarsagent22/Bourbon-Signal';
const WORKFLOW = 'source-scheduler-monitor.yml';
const title = id => `Source observation ${id}`;
const instant = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

export async function readObservationHealth(fetcher = fetch) {
  const response = await fetcher('https://www.bourbonsignal.com/api/ops/health', { signal: AbortSignal.timeout(15_000), headers: { 'cache-control': 'no-cache' } });
  // Engine/cron degradation produces useful observation evidence. The release
  // identity gate below is independent of the aggregate HTTP health verdict.
  if (response.status !== 200 && response.status !== 503) return null;
  const text = await response.text();
  if (Buffer.byteLength(text) > 512 * 1024) throw new Error('Health response too large');
  const payload = JSON.parse(text);
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...payload, httpStatus: response.status } : null;
}

export function observationConfig(input) {
  const { observationId, expectedCommit, startedAt, deadline } = input;
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(observationId || '') || !/^[a-f0-9]{40}$/.test(expectedCommit || '')
    || !instant(startedAt) || !instant(deadline)) throw new Error('Invalid bounded observation configuration');
  const duration = Date.parse(deadline) - Date.parse(startedAt);
  if (duration <= 0 || duration > MAX_SLOTS * SLOT_MS) throw new Error('Observation must end within 48 hours');
  return { observationId, expectedCommit, startedAt: new Date(startedAt).toISOString(), deadline: new Date(deadline).toISOString() };
}
export function validateObservationState(state, config) {
  if (!state || state.version !== 1 || JSON.stringify(state.config) !== JSON.stringify(config) || !Array.isArray(state.reservations)
    || state.reservations.length > MAX_SLOTS) throw new Error('Observation state/config mismatch');
  const slots = new Set();
  for (const row of state.reservations) {
    if (!Number.isInteger(row.slot) || row.slot < 0 || row.slot >= MAX_SLOTS || slots.has(row.slot)
      || row.observationId !== `${config.observationId}-s${row.slot}` || !instant(row.reservedAt)
      || !['reserved', 'submitted', 'unknown', 'completed'].includes(row.status)) throw new Error('Malformed observation reservation');
    slots.add(row.slot);
  }
  return state;
}

// Adapters make the ordering and uncertain-outcome behavior testable without
// production requests, GitHub dispatches, credentials, or infrastructure writes.
export async function observationTick(state, input, io) {
  const config = observationConfig(input);
  validateObservationState(state, config);
  const now = io.now();
  if (!Number.isFinite(now)) throw new Error('Invalid observation clock');
  if (now < Date.parse(config.startedAt)) return { status: 'not_started' };
  if (now >= Date.parse(config.deadline)) return { status: 'expired' };
  const slot = Math.floor((now - Date.parse(config.startedAt)) / SLOT_MS);
  if (slot >= MAX_SLOTS || state.reservations.length >= MAX_SLOTS) return { status: 'cap_reached' };
  if (state.reservations.some(row => row.slot === slot)) return { status: 'slot_already_reserved' };
  const health = await io.health();
  if (health?.release?.status !== 'healthy' || health.release.commit !== config.expectedCommit) return { status: 'release_not_verified' };
  const runs = await io.listRuns();
  if (!Array.isArray(runs)) throw new Error('Malformed workflow metadata');
  if (runs.some(run => run.displayTitle === title(`${config.observationId}-s${slot}`))) return { status: 'slot_metadata_already_exists' };
  // An uncertain request must be reconciled from its exact slot title. Absence
  // does not authorize another request, even on a later slot or process restart.
  for (const row of state.reservations.filter(row => row.status !== 'completed')) {
    const matches = runs.filter(run => run.event === 'workflow_dispatch' && run.displayTitle === title(row.observationId)
      && instant(run.createdAt) && Date.parse(run.createdAt) >= Date.parse(row.reservedAt) - 1000);
    if (matches.length !== 1) return { status: 'prior_outcome_unknown', slot: row.slot };
    if (matches[0].status !== 'completed') return { status: 'capture_in_flight', slot: row.slot };
    row.status = 'completed'; row.runId = matches[0].databaseId; row.conclusion = matches[0].conclusion || null;
    await io.save(state);
  }
  if (runs.some(run => run.status !== 'completed')) return { status: 'workflow_in_flight' };
  // Recheck time after potentially slow health/metadata reads. Never dispatch
  // for an elapsed slot or beyond the fixed deadline.
  const checkedAt = io.now();
  if (checkedAt >= Date.parse(config.deadline) || Math.floor((checkedAt - Date.parse(config.startedAt)) / SLOT_MS) !== slot)
    return { status: 'slot_elapsed' };
  const row = { slot, observationId: `${config.observationId}-s${slot}`, reservedAt: new Date(checkedAt).toISOString(), status: 'reserved', healthHttpStatus: health.httpStatus ?? null };
  state.reservations.push(row);
  await io.save(state); // MUST complete before dispatch; save failure cannot dispatch.
  try {
    await io.dispatch(row.observationId);
    row.status = 'submitted'; await io.save(state);
    return { status: 'submitted', slot, observationId: row.observationId };
  } catch {
    row.status = 'unknown'; await io.save(state);
    return { status: 'dispatch_outcome_unknown', slot, observationId: row.observationId };
  }
}

async function atomic(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx');
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
  try { await rename(temporary, file); } catch (error) { await unlink(temporary).catch(() => {}); throw error; }
}
export async function runObservation({ stateFile, ...input }, adapters = {}) {
  const config = observationConfig(input), file = resolve(stateFile);
  await mkdir(dirname(file), { recursive: true });
  let lock;
  try { lock = await open(`${file}.lock`, 'wx'); }
  catch (error) { if (error.code === 'EEXIST') return { status: 'writer_locked' }; throw error; }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
    let state;
    try { state = JSON.parse(await readFile(file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; state = { version: 1, config, reservations: [] }; }
    const gh = args => execute('gh', args, { timeout: 20_000, maxBuffer: 1024 * 1024, windowsHide: true });
    return await observationTick(state, config, {
      now: () => Date.now(),
      health: () => readObservationHealth(),
      listRuns: async () => JSON.parse((await gh(['run', 'list', '--repo', REPO, '--workflow', WORKFLOW, '--branch', 'main', '--limit', '100', '--json', 'databaseId,event,status,conclusion,createdAt,displayTitle,url'])).stdout),
      dispatch: id => gh(['workflow', 'run', WORKFLOW, '--repo', REPO, '--ref', 'main', '-f', 'capture_only=true', '-f', `observation_id=${id}`]),
      ...adapters,
      save: state => atomic(file, state),
    });
  } finally { await lock.close(); await unlink(`${file}.lock`); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => { const at = arg.indexOf('='); if (!arg.startsWith('--') || at < 3) throw new Error('Expected --name=value'); return [arg.slice(2, at), arg.slice(at + 1)]; }));
  runObservation({ stateFile: args.state, observationId: args['observation-id'], expectedCommit: args['expected-commit'], startedAt: args['started-at'], deadline: args.deadline })
    .then(result => console.log(JSON.stringify(result)))
    .catch(() => { console.error('Source observation failed closed; inspect local state and task result.'); process.exitCode = 1; });
}
