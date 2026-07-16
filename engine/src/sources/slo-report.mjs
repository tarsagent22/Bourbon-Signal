export const SEVEN_DAY_WINDOW_MS = 7 * 24 * 60 * 60_000;
export const DEFAULT_SOURCE_SLO_TARGET = 0.98;
export const SOURCE_SLO_HISTORY_CONTRACT_VERSION = 'bourbon-signal-source-slo-history-v1';

const SUCCESS_OUTCOMES = new Set(['success']);
const EXCLUDED_OUTCOMES = new Set(['not_due', 'disabled', 'quarantined']);

function validTime(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : null;
}

function observationFromResult(result, now, attempt = null, attemptIndex = 0) {
  const observedAt = attempt?.finishedAt || result.finishedAt || result.checkedAt || now;
  const sourceId = String(result.sourceId || '').trim();
  if (!sourceId || validTime(observedAt) == null) return null;
  const outcome = result.quarantined ? 'quarantined' : String(attempt?.outcome || result.status || 'failed');
  const attemptNumber = Number(attempt?.attempt || (attempt ? attemptIndex + 1 : 0));
  return {
    id: `${sourceId}|${result.startedAt || observedAt}|${attemptNumber}|${observedAt}|${outcome}`,
    sourceId,
    observedAt,
    outcome,
    attemptCount: attempt ? 1 : Number(result.attemptCount || 0),
    ...(attempt?.error?.kind || result.error?.kind ? { errorKind: attempt?.error?.kind || result.error?.kind } : {}),
    ...(result.sourceMetadata?.stateId ? { stateId: String(result.sourceMetadata.stateId) } : {}),
  };
}

export function appendSourceSloObservations(history, results, options = {}) {
  const now = options.now || new Date().toISOString();
  const prior = history?.contractVersion === SOURCE_SLO_HISTORY_CONTRACT_VERSION ? history : null;
  const combined = new Map((prior?.observations || []).map((item) => [item.id, item]));
  for (const result of results || []) {
    const attempts = Array.isArray(result?.attempts) && result.attempts.length ? result.attempts : [null];
    attempts.forEach((attempt, index) => {
      const observation = observationFromResult(result, now, attempt, index);
      if (observation) combined.set(observation.id, observation);
    });
  }
  const retentionMs = Math.max(SEVEN_DAY_WINDOW_MS, Number(options.retentionMs ?? 8 * 24 * 60 * 60_000));
  const cutoff = Date.parse(now) - retentionMs;
  const observations = [...combined.values()]
    .filter((item) => validTime(item.observedAt) >= cutoff)
    .sort((left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt) || left.id.localeCompare(right.id));
  const firstObservedAt = prior?.firstObservedAt || observations[0]?.observedAt || now;
  return {
    contractVersion: SOURCE_SLO_HISTORY_CONTRACT_VERSION,
    firstObservedAt,
    updatedAt: now,
    observations,
  };
}

export function buildSevenDaySourceSloReport(history, options = {}) {
  const now = options.now || new Date().toISOString();
  const nowMs = validTime(now);
  if (nowMs == null) throw new TypeError('A valid SLO report time is required');
  const targetRatio = Number(options.targetRatio ?? DEFAULT_SOURCE_SLO_TARGET);
  const windowStartMs = nowMs - SEVEN_DAY_WINDOW_MS;
  const allWindow = (history?.observations || []).filter((item) => {
    const time = validTime(item.observedAt);
    return time != null && time >= windowStartMs && time <= nowMs;
  });
  const eligible = allWindow.filter((item) => !EXCLUDED_OUTCOMES.has(item.outcome));
  const successful = eligible.filter((item) => SUCCESS_OUTCOMES.has(item.outcome));
  const availabilityRatio = eligible.length ? successful.length / eligible.length : null;
  const firstObservedMs = validTime(history?.firstObservedAt);
  const observedHistoryMs = firstObservedMs == null ? 0 : Math.max(0, Math.min(SEVEN_DAY_WINDOW_MS, nowMs - firstObservedMs));
  const coveredDays = new Set(eligible.map((item) => Math.min(6, Math.floor((validTime(item.observedAt) - windowStartMs) / (24 * 60 * 60_000)))));
  const coveredDayCount = coveredDays.size;
  const historyComplete = firstObservedMs != null && firstObservedMs <= windowStartMs && coveredDayCount === 7;
  const metTarget = historyComplete && availabilityRatio != null ? availabilityRatio > targetRatio : null;
  const sourceIds = [...new Set(allWindow.map((item) => item.sourceId))].sort();
  const sources = sourceIds.map((sourceId) => {
    const sourceObservations = allWindow.filter((item) => item.sourceId === sourceId && !EXCLUDED_OUTCOMES.has(item.outcome));
    const successes = sourceObservations.filter((item) => SUCCESS_OUTCOMES.has(item.outcome)).length;
    const stateIds = [...new Set(sourceObservations.map((item) => item.stateId).filter(Boolean))];
    return {
      sourceId,
      observedSampleCount: sourceObservations.length,
      successfulSampleCount: successes,
      availabilityRatio: sourceObservations.length ? successes / sourceObservations.length : null,
      ...(stateIds.length === 1 ? { stateId: stateIds[0] } : {}),
    };
  });
  const stateIds = [...new Set(eligible.map((item) => item.stateId).filter(Boolean))].sort();
  const states = stateIds.map((stateId) => {
    const stateObservations = eligible.filter((item) => item.stateId === stateId);
    const successes = stateObservations.filter((item) => SUCCESS_OUTCOMES.has(item.outcome)).length;
    return {
      stateId,
      observedSampleCount: stateObservations.length,
      successfulSampleCount: successes,
      availabilityRatio: stateObservations.length ? successes / stateObservations.length : null,
    };
  });
  return {
    contractVersion: 'bourbon-signal-source-slo-report-v1',
    generatedAt: now,
    window: { days: 7, startedAt: new Date(windowStartMs).toISOString(), endedAt: now },
    target: { operator: '>', ratio: targetRatio, percent: targetRatio * 100 },
    historyComplete,
    observedHistoryMs,
    coveredDayCount,
    observedSampleCount: eligible.length,
    successfulSampleCount: successful.length,
    excludedSampleCount: allWindow.length - eligible.length,
    availabilityRatio,
    availabilityPercent: availabilityRatio == null ? null : availabilityRatio * 100,
    metTarget,
    status: historyComplete ? (metTarget ? 'met' : 'missed') : 'insufficient_history',
    sources,
    states,
  };
}

export function sourceSloMarkdown(report) {
  const availability = report.availabilityPercent == null ? 'not yet measurable' : `${report.availabilityPercent.toFixed(2)}%`;
  return `# Source collection SLO\n\nGenerated: ${report.generatedAt}\n\nTarget: >${report.target.percent}% over a real seven-day observation window.\n\nStatus: ${report.status}\n\nObserved availability: ${availability} (${report.successfulSampleCount}/${report.observedSampleCount} eligible source runs).\n\nHistory complete: ${report.historyComplete ? 'yes' : 'no'}; observed history: ${(report.observedHistoryMs / 3_600_000).toFixed(1)} hours across ${report.coveredDayCount}/7 day buckets.\n\nExcluded not-due, disabled, or quarantined diagnostics: ${report.excludedSampleCount}.\n`;
}
