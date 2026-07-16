import { createSourceAdapter } from './source-adapter.mjs';
import { summarizeSourceResult } from './source-result.mjs';
import { runSourceAdapters } from './source-runner.mjs';

function stampedEntries(entries, sourceRuntimeId) {
  return (entries || []).map((entry) => ({ ...entry, sourceRuntimeId }));
}

function sourceReport({ sourceId, label, url, result, signals }) {
  return {
    sourceRuntimeId: sourceId,
    label,
    url,
    ok: result.ok,
    stale: result.stale,
    sourceRuntimeStatus: result.status,
    status: result.error?.status || result.status,
    contentType: 'source-runtime-precision',
    bytes: 0,
    elapsedMs: 0,
    signalType: `precision_${result.status}`,
    matchedBottleCount: signals.length,
    pdfLinkCount: 0,
    documentLinkCount: 0,
    error: result.error?.message || (result.quarantined ? `Source ${sourceId} is quarantined` : null),
  };
}

function failureRoadblock({ stateId, label, url, result }) {
  if (result.ok) return null;
  return {
    state: stateId,
    source: label,
    url,
    sourceRuntimeId: result.sourceId,
    status: result.error?.status || result.status,
    error: result.error?.message || (result.quarantined ? `Source ${result.sourceId} is quarantined by configuration.` : `Precision source ${result.sourceId} did not return a usable result.`),
    nextRoute: 'Inspect this isolated precision source; retain non-alertable fallback rows while healthy sibling sources continue.',
  };
}

export function legacyPrecisionSourceId(stateId) {
  return `precision:${String(stateId || '').trim().toLowerCase()}`;
}

export async function runLegacyPrecisionSource({
  sourceId,
  stateId = null,
  label = sourceId,
  url = null,
  collect,
  previousResults = null,
  circuitBreaker = null,
  sourceRunnerOptions = {},
} = {}) {
  if (!sourceId) throw new TypeError('Legacy precision source id is required');
  if (typeof collect !== 'function') throw new TypeError(`Legacy precision source ${sourceId} requires a collector`);
  const adapter = createSourceAdapter({
    id: sourceId,
    label,
    url,
    metadata: { lane: 'legacy_precision', ...(stateId ? { stateId } : {}) },
    execute: async (_context, { signal }) => {
      const value = await collect({ signal });
      if (!Array.isArray(value?.signals) || !Array.isArray(value?.roadblocks)) {
        return value;
      }
      return {
        ...value,
        signals: stampedEntries(value.signals, sourceId),
        roadblocks: stampedEntries(value.roadblocks, sourceId),
      };
    },
    validate: (value) => Array.isArray(value?.signals) && Array.isArray(value?.roadblocks)
      ? true
      : 'Legacy precision collector returned a malformed result',
    recordCount: (value) => value.signals.length,
  });
  const isolated = await runSourceAdapters([adapter], {}, {
    ...sourceRunnerOptions,
    previousResults,
    circuitBreaker: circuitBreaker || undefined,
  });
  const result = isolated.results[0];
  const value = result.value || { signals: [], roadblocks: [] };
  const signals = value.signals || [];
  const roadblocks = [...(value.roadblocks || [])];
  const containment = failureRoadblock({ stateId, label, url, result });
  if (containment) roadblocks.push(containment);
  return {
    signals,
    roadblocks,
    sourceReports: [sourceReport({ sourceId, label, url, result, signals })],
    sourceResults: [summarizeSourceResult(result)],
    stale: result.stale,
    staleReason: result.stale ? result.error?.message || result.status : null,
  };
}
