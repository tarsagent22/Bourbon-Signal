import { isSourceResult } from './source-result.mjs';
import { SOURCE_SLO_HISTORY_CONTRACT_VERSION } from './slo-report.mjs';

const SUCCESS_OUTCOMES = new Set(['success', 'quarantined']);

function validTime(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : null;
}

function previousValue(previousReport, result) {
  const sourceReports = (previousReport?.sources || []).filter((source) => source.sourceRuntimeId === result.sourceId);
  return {
    signals: (previousReport?.signals || []).filter((signal) => signal.sourceRuntimeId === result.sourceId),
    roadblocks: (previousReport?.roadblocks || []).filter((roadblock) => roadblock.sourceRuntimeId === result.sourceId),
    sourceReport: sourceReports[0] || null,
    sourceReports,
    metadata: result.metadata || null,
    recordsInspected: result.recordsInspected ?? result.metadata?.recordsInspected ?? null,
  };
}

function metricsFromObservations(sourceId, observations) {
  const probes = observations
    .filter((observation) => observation?.sourceId === sourceId && Number(observation.attemptCount || 0) > 0 && validTime(observation.observedAt) != null)
    .sort((left, right) => validTime(left.observedAt) - validTime(right.observedAt));
  if (!probes.length) return null;
  let consecutiveFailures = 0;
  for (let index = probes.length - 1; index >= 0 && !SUCCESS_OUTCOMES.has(probes[index].outcome); index -= 1) consecutiveFailures += 1;
  return {
    sourceId,
    probes: probes.length,
    usefulChanges: probes.reduce((sum, observation) => sum + (SUCCESS_OUTCOMES.has(observation.outcome) ? Math.max(0, Number(observation.usefulChanges) || 0) : 0), 0),
    consecutiveUnchanged: Math.max(0, Number(probes.at(-1).consecutiveUnchanged) || 0),
    failures: probes.filter((observation) => !SUCCESS_OUTCOMES.has(observation.outcome)).length,
    consecutiveFailures,
    lastProbeAt: probes.at(-1).observedAt,
  };
}

function metricsFromPrevious(result) {
  if (!isSourceResult(result)) return null;
  const lastProbeAt = validTime(result.checkedAt) != null ? result.checkedAt : null;
  const retainedReliableProbe = result.status === 'not_due' && lastProbeAt;
  if (!lastProbeAt || (Number(result.attemptCount || 0) <= 0 && !retainedReliableProbe)) return null;
  const failed = !SUCCESS_OUTCOMES.has(result.status) && result.status !== 'not_due';
  return {
    sourceId: result.sourceId,
    probes: 1,
    usefulChanges: failed ? 0 : Math.max(0, Number(result.usefulChanges) || 0),
    consecutiveUnchanged: Math.max(0, Number(result.consecutiveUnchanged) || 0),
    failures: failed ? 1 : 0,
    consecutiveFailures: failed ? 1 : 0,
    lastProbeAt,
  };
}

export function sourceRuntimeOptionsFromArtifacts({ previousReport = null, sourceHistory = null } = {}) {
  const previousSourceResults = {};
  for (const result of previousReport?.sourceResults || []) {
    if (!isSourceResult(result)) continue;
    previousSourceResults[result.sourceId] = { ...result, value: previousValue(previousReport, result) };
  }

  const observations = sourceHistory?.contractVersion === SOURCE_SLO_HISTORY_CONTRACT_VERSION
    ? sourceHistory.observations || []
    : [];
  const sourceIds = new Set([
    ...Object.keys(previousSourceResults),
    ...observations.map((observation) => observation?.sourceId).filter(Boolean),
  ]);
  const sourceMetrics = {};
  for (const sourceId of sourceIds) {
    const metrics = metricsFromObservations(sourceId, observations) || metricsFromPrevious(previousSourceResults[sourceId]);
    if (metrics) sourceMetrics[sourceId] = metrics;
  }

  return {
    previousSourceResults,
    previousSourceCircuitState: previousReport?.sourceCircuitState || {},
    sourceRunnerOptions: {
      sourceMetrics,
      ...(process.env.BOURBON_SIGNAL_FORCE_SOURCE_RUN === '1' ? { schedule: false } : {}),
    },
  };
}
