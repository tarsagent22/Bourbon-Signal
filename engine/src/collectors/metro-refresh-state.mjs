import { sourceErrorForHttp } from '../sources/source-error.mjs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isReviewedNewYorkNativePickupSource, NEW_YORK_NATIVE_PICKUP_REFRESH_CADENCE_MS } from './new-york-variant-pickup.mjs';

export const METRO_REFRESH_CADENCE_MS = 4 * 60 * 60_000;
export const METRO_ACCESS_DENIAL_BACKOFF_MS = 24 * 60 * 60_000;
export const METRO_RATE_LIMIT_BACKOFF_MS = 4 * 60 * 60_000;
export const METRO_ATTEMPT_CLOCK_SKEW_MS = 5 * 60_000;
const DENIAL_HTTP = new Set([401, 403, 429]);
const ATTEMPT_STATUSES = new Set(['success', 'access_denied', 'rate_limited', 'permanent_error', 'transient_error', 'timeout', 'malformed', 'collapsed', 'failed', 'quarantined']);

function validAttempt(attempt) {
  const last = Date.parse(attempt?.lastAttemptAt || '');
  const next = Date.parse(attempt?.nextAllowedAt || '');
  const status = attempt?.httpStatus;
  return ATTEMPT_STATUSES.has(attempt?.status) && Number.isFinite(last) && Number.isFinite(next)
    && last <= Date.now() + METRO_ATTEMPT_CLOCK_SKEW_MS
    && next >= last && next - last <= METRO_ACCESS_DENIAL_BACKOFF_MS
    && new Date(last).toISOString() === attempt.lastAttemptAt && new Date(next).toISOString() === attempt.nextAllowedAt
    && (status === null || Number.isInteger(status) && status >= 100 && status <= 599)
    && (DENIAL_HTTP.has(status) || !['access_denied', 'rate_limited'].includes(attempt.status));
}

function attemptState(source, lastAttemptMs, status, httpStatus, fallbackCadenceMs) {
  const denied = DENIAL_HTTP.has(httpStatus);
  // Only proven native success gets the new healthy cadence. Failed/unknown
  // attempts retain the former unconfigured NY fallback, including force rules.
  const healthyNative = isReviewedNewYorkNativePickupSource(source) && status === 'success' && httpStatus === null;
  const cadenceMs = isReviewedNewYorkNativePickupSource(source) && !healthyNative
    ? metroRefreshCadenceMs(null, fallbackCadenceMs) : metroRefreshCadenceMs(source, fallbackCadenceMs);
  const delayMs = denied
    ? Math.max(cadenceMs, httpStatus === 429 ? METRO_RATE_LIMIT_BACKOFF_MS : METRO_ACCESS_DENIAL_BACKOFF_MS)
    : cadenceMs;
  return {
    lastAttemptAt: new Date(lastAttemptMs).toISOString(),
    status: denied ? (httpStatus === 429 ? 'rate_limited' : 'access_denied') : status,
    httpStatus,
    nextAllowedAt: new Date(lastAttemptMs + delayMs).toISOString(),
  };
}

export function metroRefreshCadenceMs(source, fallback = METRO_REFRESH_CADENCE_MS) {
  const configured = Number(source?.depthDiscovery?.refreshCadenceMs);
  const cadence = Number.isFinite(configured) && configured > 0 ? configured : Number(fallback);
  return Number.isFinite(cadence) && cadence > 0 ? Math.min(cadence, METRO_ACCESS_DENIAL_BACKOFF_MS) : METRO_REFRESH_CADENCE_MS;
}

// A denial ends this source's bounded pass, including the runner's retry loop.
export function metroHttpSourceError(status, message) {
  const error = sourceErrorForHttp(status, message);
  if (DENIAL_HTTP.has(Number(status))) error.transient = false;
  return error;
}

export function metroSourceAttempts(cache, sources) {
  return Object.fromEntries((sources || []).flatMap((source) => {
    const attempt = cache?.sourceAttempts?.[source.id];
    const lastAttemptMs = Date.parse(attempt?.lastAttemptAt || '');
    const nextAllowedMs = Date.parse(attempt?.nextAllowedAt || '');
    if (!validAttempt(attempt)) {
      // Older cache schemas kept source denials only as roadblocks. Respect
      // that evidence when upgrading instead of issuing an unchanged request.
      const priorDenial = (Array.isArray(cache?.roadblocks) ? cache.roadblocks : []).find((roadblock) => {
        if (roadblock?.sourceRuntimeId !== `metro:${source.stateCode.toLowerCase()}:${source.id}` && roadblock?.source !== source.sourceLabel) return false;
        return DENIAL_HTTP.has(Number(roadblock.status)) || /\bHTTP[_ ](401|403|429)\b/iu.test(String(roadblock.error || ''));
      });
      const legacyAttemptMs = Date.parse(cache?.generatedAt || '');
      if (!priorDenial || !Number.isFinite(legacyAttemptMs)
        || legacyAttemptMs > Date.now() + METRO_ATTEMPT_CLOCK_SKEW_MS
        || new Date(legacyAttemptMs).toISOString() !== cache.generatedAt) return [];
      const httpStatus = DENIAL_HTTP.has(Number(priorDenial.status)) ? Number(priorDenial.status) : Number(String(priorDenial.error).match(/\bHTTP[_ ](401|403|429)\b/iu)[1]);
      return [[source.id, attemptState(source, legacyAttemptMs, 'failed', httpStatus)]];
    }
    const httpStatus = Number(attempt.httpStatus) || null;
    const normalized = DENIAL_HTTP.has(httpStatus) ? attemptState(source, lastAttemptMs, attempt.status, httpStatus) : null;
    const reviewedNative = isReviewedNewYorkNativePickupSource(source);
    const sourceRoadblock = reviewedNative && (Array.isArray(cache?.roadblocks) ? cache.roadblocks : []).some(row => row?.sourceRuntimeId === `metro:ny:${source.id}` || row?.source === source.sourceLabel);
    const reviewedLegacySuccess = reviewedNative && attempt.status === 'success' && attempt.httpStatus === null
      && Object.keys(attempt).length === 4 && ['lastAttemptAt','nextAllowedAt','status','httpStatus'].every(key => Object.hasOwn(attempt,key))
      && nextAllowedMs - lastAttemptMs === METRO_REFRESH_CADENCE_MS && !sourceRoadblock;
    const retainedNext = reviewedLegacySuccess ? lastAttemptMs + NEW_YORK_NATIVE_PICKUP_REFRESH_CADENCE_MS : nextAllowedMs;
    return [[source.id, {
      // Preserve an unknown hold marker through ledger read/write roundtrips.
      // A genuine later network result replaces it through attemptState.
      ...(reviewedNative ? attempt : {}),
      ...(sourceRoadblock ? { reviewedNativeLegacyCadenceHeld: true } : {}),
      lastAttemptAt: new Date(lastAttemptMs).toISOString(),
      status: normalized?.status || attempt.status,
      httpStatus,
      nextAllowedAt: new Date(Math.max(retainedNext, Date.parse(normalized?.nextAllowedAt || '') || retainedNext)).toISOString(),
    }]];
  }));
}

export function updateMetroSourceAttempts(cache, sources, results, { fallbackCadenceMs = METRO_REFRESH_CADENCE_MS } = {}) {
  const attempts = metroSourceAttempts(cache, sources);
  const byRuntimeId = new Map((results || []).filter(Boolean).map((result) => [result.sourceId, result]));
  for (const source of sources || []) {
    const result = byRuntimeId.get(`metro:${source.stateCode.toLowerCase()}:${source.id}`);
    // Circuit/checkpoint skips are not a new network attempt or a new clock.
    if (!result || !(result.attemptCount > 0)) continue;
    const lastAttemptMs = Date.parse(result.finishedAt || result.checkedAt || '');
    if (!Number.isFinite(lastAttemptMs)) continue;
    const discovery = !result.error ? result.value?.metadata?.discovery : null;
    const optionalDenial = discovery?.optionalFailures?.find((failure) => DENIAL_HTTP.has(Number(failure.status)));
    const httpStatus = Number(optionalDenial?.status || result.error?.status) || null;
    const previous = attempts[source.id];
    // The adapter can record an optional-page denial before the runner rejects
    // its partial inventory on a collapse gate. That gate is not a new fetch.
    if (!DENIAL_HTTP.has(httpStatus) && !result.ok && ['access_denied', 'rate_limited'].includes(previous?.status)
      && Date.parse(previous.lastAttemptAt) >= Date.parse(result.startedAt || '')) continue;
    attempts[source.id] = attemptState(source, lastAttemptMs, result.status, httpStatus, fallbackCadenceMs);
  }
  return attempts;
}

export function mergeMetroSourceAttempts(sources, ...states) {
  const merged = {};
  for (const state of states) {
    for (const [sourceId, attempt] of Object.entries(metroSourceAttempts(state, sources))) {
      if (!merged[sourceId] || attempt.lastAttemptAt >= merged[sourceId].lastAttemptAt) merged[sourceId] = attempt;
    }
  }
  return merged;
}

export function metroSourceAttemptLedgerPath(stateId) {
  if (!['NY', 'CO', 'AZ'].includes(stateId)) throw new Error('Metro attempt state must be NY, CO, or AZ.');
  return path.join('out', 'optimization', 'metro-source-attempts', `${stateId}.json`);
}

async function optionalJson(file) {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

export async function readMetroSourceAttempts(stateId, sources, cache, { bootstrapState = null } = {}) {
  const bootstrap = await optionalJson(new URL('../../data/metro-source-attempts-bootstrap.json', import.meta.url));
  const ledger = await optionalJson(metroSourceAttemptLedgerPath(stateId));
  return mergeMetroSourceAttempts(sources,
    bootstrap?.schemaVersion === 1 ? bootstrap.states?.[stateId] : null,
    bootstrapState,
    cache,
    ledger?.schemaVersion === 1 && ledger.state === stateId ? ledger : null,
  );
}

export async function writeMetroSourceAttempts(stateId, sourceAttempts, sources) {
  const file = metroSourceAttemptLedgerPath(stateId);
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const payload = { schemaVersion: 1, state: stateId, sourceAttempts: metroSourceAttempts({ sourceAttempts }, sources) };
  await mkdir(path.dirname(file), { recursive: true });
  try {
    await writeFile(temporary, JSON.stringify(payload, null, 2));
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}
