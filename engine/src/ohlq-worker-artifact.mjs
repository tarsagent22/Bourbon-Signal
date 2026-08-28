import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { validateOhlqArtifactDownload } from '../../scripts/lib/ohlq-worker-handoff.mjs';

const DEFAULT_BASE_URL = 'https://www.bourbonsignal.com';
const DEFAULT_MAX_AGE_MS = 6 * 60 * 60_000;

async function readJson(file, readFileFn = readFile) {
  try {
    return JSON.parse(await readFileFn(file, 'utf8'));
  } catch {
    return null;
  }
}

export function ohlqWorkerTargetStates(value = process.env.OHLQ_WORKER_TARGET_STATES || '') {
  return String(value)
    .split(/[^A-Za-z]+/)
    .map((state) => state.toUpperCase())
    .filter(Boolean);
}

export function ohlqWorkerArtifactRequired({ env = process.env, argv = process.argv } = {}) {
  return env.OHLQ_WORKER_ARTIFACT_REQUIRED === '1'
    || argv.includes('--required')
    || ohlqWorkerTargetStates(env.OHLQ_WORKER_TARGET_STATES).includes('OH');
}

export function ohlqArtifactFreshEnough(artifact, staleAfterMs, nowMs = Date.now()) {
  const generatedAtMs = Date.parse(artifact?.generatedAt || '');
  const ageMs = nowMs - generatedAtMs;
  return Number.isFinite(generatedAtMs)
    && ageMs >= -5 * 60_000
    && ageMs <= staleAfterMs;
}

export async function hydrateOhlqWorkerArtifact(options = {}) {
  const {
    baseUrl = process.env.OHLQ_WORKER_API_URL || DEFAULT_BASE_URL,
    destination = path.resolve(process.env.OHLQ_WORKER_DESTINATION || 'engine/out/browser/ohlq-availability.json'),
    maximumAgeMs = Number(process.env.OHLQ_WORKER_FETCH_MAX_AGE_MS || DEFAULT_MAX_AGE_MS),
    secret = process.env.OHLQ_WORKER_ARTIFACT_SECRET,
    fetchImpl = globalThis.fetch,
    mkdirFn = mkdir,
    writeFileFn = writeFile,
    renameFn = rename,
    nowMs = Date.now(),
    timeoutMs = 30_000,
  } = options;
  if (!secret || secret.length < 32) throw new Error('OHLQ worker artifact secret is not configured; retained artifact cache remains unchanged.');
  const url = new URL('/api/source/ohlq/artifact', baseUrl);
  const response = await fetchImpl(url, {
    headers: { authorization: `Bearer ${secret}`, accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`OHLQ worker artifact fetch failed with HTTP ${response.status}: ${text.slice(0, 300)}`);
  const envelope = JSON.parse(text);
  const artifact = validateOhlqArtifactDownload(envelope, { now: nowMs, maximumAgeMs });
  await mkdirFn(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFileFn(temporary, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  await renameFn(temporary, destination);
  return {
    artifact,
    destination,
    digest: envelope.digest,
    generatedAt: envelope.generatedAt,
    hydrated: true,
  };
}

export async function loadOhlqBrowserArtifact(options = {}) {
  const {
    artifactPath = 'out/browser/ohlq-availability.json',
    cooldownPath = 'out/browser/ohlq-cooldown.json',
    staleAfterMs = 12 * 60 * 60_000,
    nowMs = Date.now(),
    readFileFn = readFile,
    hydrate = hydrateOhlqWorkerArtifact,
    hydrateOptions = {},
  } = options;

  let browserRun = await readJson(artifactPath, readFileFn);
  let hydrated = false;
  let hydrationError = null;

  if (!ohlqArtifactFreshEnough(browserRun, staleAfterMs, nowMs) && hydrate) {
    try {
      const requestedMaximumAgeMs = Number(hydrateOptions.maximumAgeMs || process.env.OHLQ_WORKER_FETCH_MAX_AGE_MS || DEFAULT_MAX_AGE_MS);
      const downloadMaximumAgeMs = Number.isFinite(requestedMaximumAgeMs) && requestedMaximumAgeMs > 0
        ? Math.min(DEFAULT_MAX_AGE_MS, requestedMaximumAgeMs)
        : DEFAULT_MAX_AGE_MS;
      const result = await hydrate({
        ...hydrateOptions,
        destination: path.resolve(artifactPath),
        maximumAgeMs: downloadMaximumAgeMs,
      });
      if (result?.artifact) {
        browserRun = result.artifact;
        hydrated = true;
      }
    } catch (error) {
      hydrationError = error instanceof Error ? error.message : String(error);
    }
  }

  const freshArtifact = ohlqArtifactFreshEnough(browserRun, staleAfterMs, nowMs);
  const cooldown = await readJson(cooldownPath, readFileFn);
  const until = Date.parse(cooldown?.cooldownUntil || '');
  let stale = false;
  let staleReason = null;
  if (Number.isFinite(until) && until > nowMs && !freshArtifact) {
    stale = true;
    staleReason = `OHLQ cooldown active until ${cooldown.cooldownUntil}`;
  }
  if (browserRun && !freshArtifact) {
    stale = true;
    staleReason = staleReason || `OHLQ browser artifact older than ${Math.round(staleAfterMs / 3600000)}h`;
  }

  return {
    browserRun,
    cooldown,
    freshArtifact,
    hydrated,
    hydrationError,
    stale,
    staleReason,
  };
}
