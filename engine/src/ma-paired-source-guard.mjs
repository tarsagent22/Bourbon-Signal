import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const MA_PAIRED_SOURCE_COOLDOWN_MS = 24 * 60 * 60_000;
const HOST = /^[a-z0-9.-]{1,253}$/i;

async function readAttempt(file) {
  try {
    const value = JSON.parse(await readFile(file, 'utf8'));
    const validHosts = value?.hosts && typeof value.hosts === 'object' && !Array.isArray(value.hosts)
      && Object.entries(value.hosts).every(([host, incident]) => HOST.test(host)
        && incident && Number.isFinite(Date.parse(incident.lastAttemptAt || ''))
        && Number.isFinite(Date.parse(incident.nextAllowedAt || ''))
        && [403, 429].includes(Number(incident.httpStatus)));
    if (!value || ![1, 2].includes(value.schemaVersion) || typeof value !== 'object'
      || !Number.isFinite(Date.parse(value.lastAttemptAt || ''))
      || (value.schemaVersion === 1 && (!Array.isArray(value.blockedHosts)
        || value.blockedHosts.some(host => typeof host !== 'string' || !HOST.test(host))))
      || (value.schemaVersion === 2 && !validHosts)) {
      throw new Error('Malformed Massachusetts paired-source attempt ledger.');
    }
    // Schema 1 permanently blocked hosts; retain those records as a one-day
    // cooldown from the recorded attempt, then let the independent lane retry.
    if (value.schemaVersion === 1) {
      const lastAttemptAt = value.lastAttemptAt;
      value.hosts = Object.fromEntries(value.blockedHosts.map(host => [host.toLowerCase(), {
        httpStatus: 403, lastAttemptAt,
        nextAllowedAt: new Date(Date.parse(lastAttemptAt) + MA_PAIRED_SOURCE_COOLDOWN_MS).toISOString(),
        retryAfterSeconds: 0,
      }]));
    }
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeAttempt(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temp, file);
}

export async function beginMassachusettsPairedSourceAttempt({
  file = path.resolve('out/research-source-attempts/ma-paired-source.json'),
  now = new Date().toISOString(), runId = process.env.GITHUB_RUN_ID || 'local',
  bootstrapAttemptAt = process.env.BOURBON_SIGNAL_MA_PAIRED_SOURCE_BOOTSTRAP_AT || null,
  minimumIntervalMs = MA_PAIRED_SOURCE_COOLDOWN_MS,
} = {}) {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs) || !Number.isFinite(minimumIntervalMs) || minimumIntervalMs < MA_PAIRED_SOURCE_COOLDOWN_MS) {
    throw new Error('Invalid Massachusetts paired-source attempt clock or cooldown.');
  }
  const previous = await readAttempt(file);
  if (!previous && bootstrapAttemptAt) {
    const bootstrapMs = Date.parse(bootstrapAttemptAt);
    if (!Number.isFinite(bootstrapMs) || bootstrapMs > nowMs + 5 * 60_000) {
      throw new Error('Invalid Massachusetts paired-source bootstrap clock.');
    }
    if (nowMs - bootstrapMs < minimumIntervalMs) throw new Error('Massachusetts paired-source observation is still inside its 24-hour cooldown.');
  }
  if (previous) {
    const ageMs = nowMs - Date.parse(previous.lastAttemptAt);
    if (ageMs < -5 * 60_000) throw new Error('Massachusetts paired-source ledger is from the future.');
    if (ageMs < minimumIntervalMs) throw new Error('Massachusetts paired-source observation is still inside its 24-hour cooldown.');
  }
  const attempt = { schemaVersion: 2, lastAttemptAt: new Date(nowMs).toISOString(), lastRunId: String(runId),
    status: 'started', hosts: previous?.hosts || {}, sourceReportSha256: null };
  await writeAttempt(file, attempt);
  return { ...attempt, cooldownHosts: Object.fromEntries(Object.entries(attempt.hosts)
    .filter(([, incident]) => Date.parse(incident.nextAllowedAt) > nowMs)) };
}

export async function recordMassachusettsHostResponse({
  file = path.resolve('out/research-source-attempts/ma-paired-source.json'),
  attemptAt, hostname, status, observedAt = new Date().toISOString(), retryAfterSeconds = 0,
} = {}) {
  const host = String(hostname || '').toLowerCase();
  const at = Date.parse(observedAt), code = Number(status);
  if (!HOST.test(host) || !Number.isFinite(at) || !Number.isInteger(code)) throw new Error('Invalid Massachusetts host response evidence.');
  const current = await readAttempt(file);
  if (!current || current.lastAttemptAt !== attemptAt) throw new Error('Massachusetts paired-source attempt ledger changed during collection.');
  const hosts = { ...(current.hosts || {}) };
  if (code === 403 || code === 429) {
    const delay = Math.max(MA_PAIRED_SOURCE_COOLDOWN_MS, Math.max(0, Number(retryAfterSeconds) || 0) * 1000);
    hosts[host] = { httpStatus: code, lastAttemptAt: new Date(at).toISOString(), retryAfterSeconds: Math.max(0, Number(retryAfterSeconds) || 0),
      nextAllowedAt: new Date(Math.min(8_640_000_000_000_000, at + delay)).toISOString() };
  } else if (code >= 200 && code < 300) {
    delete hosts[host];
  }
  await writeAttempt(file, { ...current, hosts });
  return hosts[host] || null;
}

export async function finishMassachusettsPairedSourceAttempt({
  file = path.resolve('out/research-source-attempts/ma-paired-source.json'),
  attemptAt, report, reportSha256 = null,
} = {}) {
  const current = await readAttempt(file);
  if (!current || current.lastAttemptAt !== attemptAt) throw new Error('Massachusetts paired-source attempt ledger changed during collection.');
  const next = { ...current, schemaVersion: 2, status: report?.metadata?.complete === true ? 'complete' : 'partial',
    finishedAt: report?.finishedAt || null, sourceReportSha256: reportSha256 };
  delete next.blockedHosts;
  await writeAttempt(file, next);
  return next;
}
