import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const OHLQ_ACCESS_DENIED_BACKOFF_MS = 6 * 60 * 60_000;

export function deterministicOhlqUploadId(value) {
  const bytes = createHash('sha256').update(JSON.stringify(value)).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function classifyOhlqBrowserState(state = {}) {
  const title = String(state?.title || '');
  const text = `${title} ${state?.text || ''}`.replace(/\s+/g, ' ').trim();
  if (/\b(?:access denied|forbidden)\b/i.test(title) || /\bneed access to this site\b.*\bcontact (?:the )?lesc\b/i.test(text)) return 'access_denied';
  if (/just a moment|performing security verification|verify you are human|cloudflare/i.test(text)) return 'needs_human';
  if (state?.hasCsrf && state?.hasProduct) return 'ready';
  return 'not_ready';
}

export function getActiveOhlqCooldown(payload, { now = Date.now(), ignoreCooldown = false } = {}) {
  if (ignoreCooldown) return null;
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const until = Date.parse(payload?.cooldownUntil || '');
  return Number.isFinite(nowMs) && Number.isFinite(until) && until > nowMs ? payload : null;
}

export async function readActiveOhlqCooldownFile(file, {
  ignoreCooldown = false,
  now = Date.now(),
  readFileFn = readFile,
} = {}) {
  if (ignoreCooldown) return null;
  let raw;
  try {
    raw = await readFileFn(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new Error(`OHLQ cooldown state could not be read (${error?.code || error?.message || String(error)}).`);
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error(`OHLQ cooldown state contains invalid JSON (${error instanceof Error ? error.message : String(error)}).`);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Number.isFinite(Date.parse(payload.cooldownUntil || ''))) {
    throw new Error('OHLQ cooldown state has an invalid cooldownUntil timestamp or payload.');
  }
  return getActiveOhlqCooldown(payload, { now });
}

function safeOhlqUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || !/(^|\.)ohlq\.com$/i.test(url.hostname)) return null;
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function createOhlqAccessDeniedCooldown(state = {}, { now = Date.now() } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(nowMs)) throw new TypeError('OHLQ denial cooldown requires a valid observation time.');
  return {
    generatedAt: new Date(nowMs).toISOString(),
    cooldownUntil: new Date(nowMs + OHLQ_ACCESS_DENIED_BACKOFF_MS).toISOString(),
    backoffHours: OHLQ_ACCESS_DENIED_BACKOFF_MS / (60 * 60_000),
    status: 'source_access_denied',
    reason: 'OHLQ explicitly denied source access and directed the operator to contact LESC.',
    sample: {
      url: safeOhlqUrl(state?.href),
      hasCsrf: Boolean(state?.hasCsrf),
      hasProduct: Boolean(state?.hasProduct),
    },
  };
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
