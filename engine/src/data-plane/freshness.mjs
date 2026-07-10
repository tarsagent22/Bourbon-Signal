export const PIPELINE_STAGES = Object.freeze(['collect', 'aggregate', 'publish', 'consume']);

const severity = { fresh: 0, stale: 1, missing: 2, failed: 3 };

export function classifyStageFreshness(lastSuccessAt, policy, nowMs = Date.now()) {
  if (!lastSuccessAt || !Number.isFinite(Date.parse(lastSuccessAt))) {
    return { classification: 'missing', lastSuccessAt: lastSuccessAt ?? null, ageMs: null };
  }
  const ageMs = Math.max(0, nowMs - Date.parse(lastSuccessAt));
  let classification = 'fresh';
  if (ageMs > policy.failedAfterMs) classification = 'failed';
  else if (ageMs > policy.staleAfterMs) classification = 'stale';
  return { classification, lastSuccessAt, ageMs };
}

export function classifyPipelineFreshness(timestamps, options) {
  const nowMs = options?.nowMs ?? Date.now();
  const policies = options?.policies;
  if (!policies) throw new Error('Stage freshness policies are required');
  const result = {};
  for (const stage of PIPELINE_STAGES) {
    const policy = policies[stage];
    if (!policy || policy.staleAfterMs < 0 || policy.failedAfterMs < policy.staleAfterMs) {
      throw new Error(`Invalid freshness policy for ${stage}`);
    }
    result[stage] = classifyStageFreshness(timestamps[stage], policy, nowMs);
  }
  result.overall = PIPELINE_STAGES
    .map((stage) => result[stage].classification)
    .reduce((worst, value) => severity[value] > severity[worst] ? value : worst, 'fresh');
  return result;
}
