import { decideSourceSchedule } from './source-scheduler.mjs';

export function selectScheduledStates(configs, metrics = {}, options = {}) {
  const requestedIds = options.requestedIds || new Set();
  if (requestedIds.size) {
    return configs.map((config) => ({
      id: config.id,
      config,
      run: requestedIds.has(config.id),
      decision: requestedIds.has(config.id) ? 'explicit_request' : 'not_requested',
      cadenceMs: 0,
    }));
  }
  return configs.map((config) => {
    const schedule = decideSourceSchedule({ sourceId: config.id, ...(metrics[config.id] || {}) }, options);
    return { id: config.id, config, run: schedule.decision === 'probe_now', ...schedule };
  });
}

export function updateStateRunMetric(metrics = {}, result) {
  const previous = metrics[result.id] || {};
  const changed = Boolean(result.ok) && result.contentHash !== previous.contentHash;
  const failed = !result.ok;
  return {
    ...metrics,
    [result.id]: {
      sourceId: result.id,
      probes: Number(previous.probes || 0) + 1,
      usefulChanges: Number(previous.usefulChanges || 0) + (changed ? 1 : 0),
      failures: Number(previous.failures || 0) + (failed ? 1 : 0),
      consecutiveUnchanged: failed ? Number(previous.consecutiveUnchanged || 0) : changed ? 0 : Number(previous.consecutiveUnchanged || 0) + 1,
      consecutiveFailures: failed ? Number(previous.consecutiveFailures || 0) + 1 : 0,
      contentHash: result.contentHash || previous.contentHash || null,
      lastProbeAt: result.finishedAt || new Date().toISOString(),
      lastSuccessfulProbeAt: failed ? previous.lastSuccessfulProbeAt || null : result.finishedAt || new Date().toISOString(),
    },
  };
}
