import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

export function deterministicOhlqUploadId(value) {
  const bytes = createHash('sha256').update(JSON.stringify(value)).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function classifyOhlqBrowserState(state = {}) {
  const text = `${state?.title || ''} ${state?.text || ''}`;
  if (/just a moment|performing security verification|verify you are human|cloudflare/i.test(text)) return 'needs_human';
  if (state?.hasCsrf && state?.hasProduct) return 'ready';
  return 'not_ready';
}

export function resolveOhlqWorkerPaths(env = process.env, home = os.homedir()) {
  const localRoot = path.resolve(env.OHLQ_WORKER_STATE_DIR || path.join(env.LOCALAPPDATA || home, 'BourbonSignal', 'ohlq-worker'));
  return {
    localRoot,
    profileDir: path.resolve(env.OHLQ_WORKER_PROFILE_DIR || path.join(localRoot, 'browser-profile')),
    artifactPath: path.resolve(env.OHLQ_WORKER_LOCAL_ARTIFACT || path.join(localRoot, 'ohlq-availability.json')),
    cooldownPath: path.resolve(env.OHLQ_WORKER_COOLDOWN_FILE || path.join(localRoot, 'ohlq-cooldown.json')),
    statusPath: path.resolve(env.OHLQ_WORKER_STATUS_FILE || path.join(localRoot, 'status.json')),
    lockPath: path.resolve(env.OHLQ_WORKER_LOCK_FILE || path.join(localRoot, 'worker.lock')),
  };
}
