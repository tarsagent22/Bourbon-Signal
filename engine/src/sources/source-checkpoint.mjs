import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { isSourceResult, markSourceValueNonAlertable } from './source-result.mjs';

const VERSION = 'source-checkpoint-v1';
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_AGE_MS = 2 * 3_600_000;
const digest = value => createHash('sha256').update(value).digest('hex');
const binding = adapter => ({ sourceId: adapter.id, url: adapter.url, stateId: adapter.metadata?.stateId ?? null });
const bindingKey = adapter => digest(JSON.stringify(binding(adapter)));
const failure = code => Object.assign(new Error(code), { code });

/** Same-host durable checkpoints, not source promotion or an alert queue.
 * Requires a private persistent directory. Never use a public export directory.
 * Every writer honors an exclusive lock; abandoned locks require operator review.
 */
export class SourceCheckpointStore {
  constructor(directory) {
    if (!isAbsolute(directory)) throw failure('checkpoint_directory_invalid');
    this.directory = directory;
  }

  path(adapter) { return join(this.directory, `${bindingKey(adapter)}.json`); }

  async read(adapter) {
    let handle;
    try {
      handle = await open(this.path(adapter), 'r');
      if ((await handle.stat()).size > MAX_BYTES) throw failure('checkpoint_oversized');
      const raw = await handle.readFile('utf8');
      if (Buffer.byteLength(raw) > MAX_BYTES) throw failure('checkpoint_oversized');
      const saved = JSON.parse(raw);
      if (saved.version !== VERSION || JSON.stringify(saved.binding) !== JSON.stringify(binding(adapter))
        || !isSourceResult(saved.result) || saved.result.sourceId !== adapter.id
        || !Number.isFinite(Date.parse(saved.result.finishedAt))
        || saved.checksum !== digest(JSON.stringify({ result: saved.result, circuit: saved.circuit }))) {
        throw failure('checkpoint_invalid');
      }
      return saved;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw failure(['checkpoint_oversized', 'checkpoint_invalid'].includes(error.code) ? error.code : 'checkpoint_unavailable');
    } finally { await handle?.close(); }
  }

  async write(adapter, result, circuit) {
    const body = { result, circuit };
    const content = JSON.stringify({ version: VERSION, binding: binding(adapter), ...body, checksum: digest(JSON.stringify(body)) });
    if (Buffer.byteLength(content) > MAX_BYTES) throw failure('checkpoint_oversized');
    const target = this.path(adapter), lock = `${target}.lock`, temp = `${target}.${randomUUID()}.tmp`;
    let lease, output;
    try {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      try { lease = await open(lock, 'wx', 0o600); }
      catch (error) { if (error.code === 'EEXIST') throw failure('checkpoint_writer_busy'); throw error; }
      const prior = await this.read(adapter);
      if (prior) {
        const previousTime = Date.parse(prior.result.finishedAt), currentTime = Date.parse(result.finishedAt);
        if (previousTime > currentTime) throw failure('checkpoint_superseded');
        if (previousTime === currentTime) {
          if (prior.checksum === digest(JSON.stringify(body))) return;
          throw failure('checkpoint_conflict');
        }
      }
      output = await open(temp, 'wx', 0o600);
      await output.writeFile(content, 'utf8');
      await output.sync();
      await output.close(); output = null;
      await rename(temp, target);
    } catch (error) {
      throw failure(['checkpoint_writer_busy', 'checkpoint_superseded', 'checkpoint_conflict', 'checkpoint_invalid', 'checkpoint_oversized'].includes(error.code) ? error.code : 'checkpoint_unavailable');
    } finally {
      await output?.close();
      await unlink(temp).catch(() => {});
      if (lease) { await lease.close(); await unlink(lock); }
    }
  }
}

export function checkpointPrevious(saved, now) {
  const result = structuredClone(saved.result);
  const age = Date.parse(now) - Date.parse(result.lastGoodAt || '');
  if (!Number.isFinite(age) || age < 0 || age >= MAX_AGE_MS) {
    result.stale = true;
    result.alertable = false;
    result.value = markSourceValueNonAlertable(result.value, 'checkpoint_evidence_expired', { stale: true });
  }
  return result;
}

export function checkpointMetrics(result, circuit = {}) {
  const failed = result.status !== 'success' && result.status !== 'not_due';
  return {
    sourceId: result.sourceId,
    probes: 1,
    usefulChanges: failed ? 0 : result.usefulChanges || 0,
    consecutiveUnchanged: result.consecutiveUnchanged || 0,
    failures: failed ? 1 : 0,
    consecutiveFailures: circuit.consecutiveFailures || 0,
    lastProbeAt: result.checkedAt,
  };
}
