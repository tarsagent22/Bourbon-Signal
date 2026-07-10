export function evaluateStatePromotion(previous, candidate, options = {}) {
  const minQualityScore = Number(options.minQualityScore ?? 0.7);
  const collapseRatio = Number(options.collapseRatio ?? 0.5);
  const previousUseful = previous?.status === 'useful' || previous?.status === 'stale_useful';
  const reasons = [];
  if (!candidate) reasons.push('candidate_missing');
  else {
    if (candidate.status !== 'useful') reasons.push('candidate_not_useful');
    if (!Number.isFinite(Number(candidate.qualityScore)) || Number(candidate.qualityScore) < minQualityScore) reasons.push('quality_gate_failed');
    if (previousUseful && Number(previous.signalCount || 0) > 0 && Number(candidate.signalCount || 0) / Number(previous.signalCount) < collapseRatio) reasons.push('signal_count_collapse');
    if (candidate.roadblockCount > Number(options.maxRoadblocks ?? Infinity)) reasons.push('roadblock_gate_failed');
  }
  const retain = reasons.length > 0 && previousUseful;
  if (retain) return { status: 'stale_useful', promoted: false, retainedPrevious: true, promotedData: structuredClone(previous.data), reasons };
  if (reasons.length) return { status: candidate?.status || 'unavailable', promoted: false, retainedPrevious: false, promotedData: null, reasons };
  return { status: 'useful', promoted: true, retainedPrevious: false, promotedData: structuredClone(candidate.data), reasons: [] };
}
