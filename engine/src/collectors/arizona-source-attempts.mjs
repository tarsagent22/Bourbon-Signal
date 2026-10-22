import { readFile } from 'node:fs/promises';
import { readMetroSourceAttempts, updateMetroSourceAttempts, writeMetroSourceAttempts } from './metro-refresh-state.mjs';

const DENIAL_HTTP = new Set([401, 403, 429]);

// This private exception exits the whole source callback, including optional
// product details, subsequent merchants, category pages, and seed searches.
class ArizonaSourceDenied extends Error {
  constructor(response, url) {
    super(response.error || `HTTP ${response.status}`);
    this.status = Number(response.status);
    this.url = url;
  }
}

class ArizonaAttemptStateUnavailable extends Error {}

async function arizonaBootstrapState() {
  try {
    const bootstrap = JSON.parse(await readFile(new URL('../../data/arizona-source-attempts-bootstrap.json', import.meta.url), 'utf8'));
    return bootstrap?.schemaVersion === 1 && bootstrap.state === 'AZ' ? bootstrap : null;
  } catch { return null; }
}

export async function runArizonaSourcesWithDenialBackoff(sources, collectSource, {
  fetchText,
  signal,
  now = Date.now,
  writeAttempts = writeMetroSourceAttempts,
  registeredSources = sources,
  directRequestCount = 0,
  attemptStateAvailable = true,
} = {}) {
  // metro:az is an internal attempt identity only. Published Arizona runtime
  // results and roadblocks continue to belong to the precision:az collector.
  const attemptSources = registeredSources.map((source) => ({ ...source, stateCode: 'AZ' }));
  let sourceAttempts = await readMetroSourceAttempts('AZ', attemptSources, null, { bootstrapState: await arizonaBootstrapState() });
  const roadblocks = [];
  const attemptLedgerErrors = [];
  const skippedSourceIds = [];
  const stateUnavailableSourceIds = new Set();
  const values = [];
  let requestCount = 0;
  const persist = async (phase, sourceId = null) => {
    try { await writeAttempts('AZ', sourceAttempts, attemptSources); }
    catch (error) {
      attemptStateAvailable = false;
      attemptLedgerErrors.push({ code: error.code || 'arizona_attempt_ledger_write_failed', phase, sourceId });
    }
  };
  const recordResponse = async (source, response) => {
    const httpStatus = Number(response.status) || null;
    const finishedAt = new Date(now()).toISOString();
    if (DENIAL_HTTP.has(httpStatus)) {
      sourceAttempts = updateMetroSourceAttempts({ sourceAttempts }, attemptSources, [{
        sourceId: `metro:az:${source.id}`, attemptCount: 1, ok: false,
        status: 'failed', finishedAt, error: { status: httpStatus },
      }]);
    } else {
      // Track the real latest HTTP outcome without making this ledger a
      // healthy-inventory cache. A later pass is immediately eligible.
      sourceAttempts[source.id] = { lastAttemptAt: finishedAt, status: response.ok ? 'success' : 'failed', httpStatus, nextAllowedAt: finishedAt };
    }
    await persist('response', source.id);
  };
  const unavailableDiagnostic = (source) => {
    if (stateUnavailableSourceIds.has(source.id)) return;
    stateUnavailableSourceIds.add(source.id);
    roadblocks.push({
      state: 'AZ', source: source.sourceLabel, url: source.baseUrl,
      status: 'source_attempt_state_unavailable',
      error: 'Arizona attempt state could not be persisted; remaining requests in this retailer source group were stopped.',
      nextRoute: 'Restore the persistent attempt ledger before probing this source group again; independent retailer lanes can continue.',
    });
  };

  // A seed-only or zero-inventory pass must retain cooldowns independently of
  // later Arizona lanes, inventory artifacts, or nationwide publication gates.
  if (attemptStateAvailable) await persist('initial');
  for (const source of sources) {
    signal?.throwIfAborted();
    if (!attemptStateAvailable) {
      skippedSourceIds.push(source.id);
      unavailableDiagnostic(source);
      continue;
    }
    const attempt = sourceAttempts[source.id];
    if (DENIAL_HTTP.has(Number(attempt?.httpStatus)) && Date.parse(attempt.nextAllowedAt) > now()) {
      skippedSourceIds.push(source.id);
      roadblocks.push({
        state: 'AZ', source: source.sourceLabel, url: source.baseUrl,
        status: 'source_denial_cooldown', httpStatus: attempt.httpStatus,
        lastAttemptAt: attempt.lastAttemptAt, nextAllowedAt: attempt.nextAllowedAt,
        error: `Arizona retailer source remains parked after HTTP ${attempt.httpStatus}; no retailer request was made.`,
        nextRoute: 'Wait until the persisted source cooldown expires; force refresh cannot bypass an access denial or rate limit.',
      });
      continue;
    }
    try {
      const value = await collectSource(source, {
        fetchText: async (url, requestOptions) => {
          signal?.throwIfAborted();
          if (!attemptStateAvailable) throw new ArizonaAttemptStateUnavailable();
          requestCount += 1;
          const response = await fetchText(url, requestOptions);
          await recordResponse(source, response);
          if (DENIAL_HTTP.has(Number(response.status))) {
            throw new ArizonaSourceDenied(response, url);
          }
          return response;
        },
      });
      requestCount += directRequestCount;
      // Retain rows already accepted by a one-request collector even if its
      // ensuing ledger write fails. Their observation clocks remain untouched.
      values.push({ sourceId: source.id, value });
      // Flagstaff has one catalog request and reports failure as a roadblock.
      // Persist that outcome before any later Arizona lane can run.
      const denial = value?.roadblocks?.find((roadblock) => DENIAL_HTTP.has(Number(roadblock?.status)));
      if (directRequestCount) {
        const failure = value?.roadblocks?.find((roadblock) => /^\d{1,3}$/.test(String(roadblock?.status)) && Number(roadblock.status) <= 599);
        await recordResponse(source, { ok: !failure, status: denial?.status ?? failure?.status ?? 200 });
      }
    } catch (error) {
      if (error instanceof ArizonaSourceDenied) {
        roadblocks.push({
          state: 'AZ', source: source.sourceLabel, url: error.url,
          status: error.status, error: error.message,
          nextAllowedAt: sourceAttempts[source.id].nextAllowedAt,
          nextRoute: 'Stop this Arizona retailer source until its persisted cooldown expires; do not bypass retailer protection.',
        });
      } else if (!(error instanceof ArizonaAttemptStateUnavailable)) throw error;
    }
    if (!attemptStateAvailable) unavailableDiagnostic(source);
  }
  return { roadblocks, values, metadata: { sourceAttempts, attemptLedgerErrors, skippedSourceIds, requestCount, attemptStateAvailable } };
}
