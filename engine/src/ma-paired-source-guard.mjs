import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const MA_PAIRED_SOURCE_COOLDOWN_MS = 24 * 60 * 60_000;

async function readAttempt(file) {
  try {
    const value = JSON.parse(await readFile(file, 'utf8'));
    if (!value || value.schemaVersion !== 1 || typeof value !== 'object'
      || !Number.isFinite(Date.parse(value.lastAttemptAt || ''))
      || !Array.isArray(value.blockedHosts)
      || value.blockedHosts.some(host => typeof host !== 'string' || !/^[a-z0-9.-]{1,253}$/i.test(host))) {
      throw new Error('Malformed Massachusetts paired-source attempt ledger.');
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
    if (previous.blockedHosts.length) throw new Error(`Massachusetts paired source is blocked after prior host denial: ${previous.blockedHosts.join(', ')}.`);
    if (ageMs < minimumIntervalMs) throw new Error('Massachusetts paired-source observation is still inside its 24-hour cooldown.');
  }
  const attempt = { schemaVersion: 1, lastAttemptAt: new Date(nowMs).toISOString(), lastRunId: String(runId),
    status: 'started', blockedHosts: previous?.blockedHosts || [], sourceReportSha256: null };
  await writeAttempt(file, attempt);
  return attempt;
}

export async function finishMassachusettsPairedSourceAttempt({
  file = path.resolve('out/research-source-attempts/ma-paired-source.json'),
  attemptAt, report, reportSha256 = null,
} = {}) {
  const current = await readAttempt(file);
  if (!current || current.lastAttemptAt !== attemptAt) throw new Error('Massachusetts paired-source attempt ledger changed during collection.');
  const blocked = new Set(current.blockedHosts);
  for (const source of [...(report?.sources || []), ...(report?.sourceResults || [])]) {
    if (![403, 429].includes(Number(source?.status))) continue;
    try { blocked.add(new URL(source.url || source.sourceUrl || '').hostname.toLowerCase()); } catch { /* no host to persist */ }
  }
  const next = { ...current, status: report?.metadata?.complete === true ? 'complete' : 'partial',
    finishedAt: report?.finishedAt || null, blockedHosts: [...blocked].sort(), sourceReportSha256: reportSha256 };
  await writeAttempt(file, next);
  return next;
}
