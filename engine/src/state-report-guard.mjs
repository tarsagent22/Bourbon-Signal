function isActionableStoreSignal(signal) {
  return signal?.locationPrecision === 'store_level'
    && (signal?.canAlertAsInventory === true || signal?.sourceAvailabilityVerified === true);
}

function countActionable(report) {
  return (report?.signals || []).filter(isActionableStoreSignal).length;
}

function countPublicBottleCandidates(report, isPublicBottleCandidate = null) {
  const uniqueRows = new Set();
  for (const signal of report?.signals || []) {
    if (signal?.locationPrecision !== 'store_level') continue;
    const eligible = isPublicBottleCandidate
      ? isPublicBottleCandidate(signal)
      : Boolean(signal?.canonicalId || signal?.canonicalName || signal?.bottleId || signal?.bottleName);
    if (!eligible) continue;
    const bottleKey = String(signal?.canonicalId || signal?.canonicalName || signal?.bottleId || signal?.bottleName || signal?.id || '').toLowerCase();
    const locationKey = String(signal?.storeId || signal?.locationId || signal?.storeAddress || signal?.locationName || signal?.sourceIdentity || signal?.sourceLabel || signal?.id || '').toLowerCase();
    uniqueRows.add(`${bottleKey}|${locationKey}`);
  }
  return uniqueRows.size;
}

function collapseReason(previous, candidate, { minBaseline = 1, minRatio = 0.5, isPublicBottleCandidate = null } = {}) {
  const previousSignals = previous?.signals?.length || 0;
  const candidateSignals = candidate?.signals?.length || 0;
  if (previousSignals >= minBaseline && candidateSignals < Math.ceil(previousSignals * minRatio)) {
    return `signal count collapsed from ${previousSignals} to ${candidateSignals}`;
  }

  const previousActionable = countActionable(previous);
  const candidateActionable = countActionable(candidate);
  if (previousActionable >= 1 && candidateActionable < Math.ceil(previousActionable * minRatio)) {
    return `actionable store signal count collapsed from ${previousActionable} to ${candidateActionable}`;
  }

  const previousPublicCandidates = countPublicBottleCandidates(previous, isPublicBottleCandidate);
  const candidatePublicCandidates = countPublicBottleCandidates(candidate, isPublicBottleCandidate);
  if (previousPublicCandidates >= 1 && candidatePublicCandidates < Math.ceil(previousPublicCandidates * minRatio)) {
    return `public bottle candidate count collapsed from ${previousPublicCandidates} to ${candidatePublicCandidates}`;
  }
  return null;
}

function preservedFallback(previous, reason, now = new Date().toISOString(), candidate = null) {
  const priorStatus = String(previous.status || '').replace(/^(stale_)+/, '') || 'previous_report';
  const lastGoodAt = previous.lastGoodAt || previous.finishedAt || null;
  return {
    ...previous,
    stale: true,
    staleReason: `Quality guard preserved the last good report because ${reason}.`,
    staleFallbackAt: now,
    previousFinishedAt: previous.previousFinishedAt || previous.finishedAt || null,
    lastGoodAt,
    finishedAt: now,
    sourceResults: candidate?.sourceResults || previous.sourceResults || [],
    sourceCircuitState: candidate?.sourceCircuitState || previous.sourceCircuitState || {},
    status: `stale_${priorStatus}_quality_fallback`,
    signals: (previous.signals || []).map((signal) => ({
      ...signal,
      stale: true,
      staleReason: `Quality guard preserved the last good report because ${reason}.`,
      canAlertAsInventory: false,
      canAlertAsWatch: false,
      alertable: false,
      raw: {
        ...(signal.raw || {}),
        staleFallback: true,
        staleFallbackAt: now,
        staleReason: `Quality guard preserved the last good report because ${reason}.`,
      },
    })),
    roadblocks: [
      ...(previous.roadblocks || []).filter((roadblock) => roadblock.status !== 'quality_regression_previous_report'),
      {
        state: previous.state,
        source: `${previous.label || previous.state} state quality guard`,
        url: `out/states/${previous.state}.json`,
        status: 'quality_regression_previous_report',
        error: reason,
        nextRoute: 'Keep the last known good state report while later scheduled runs retry the collector.',
      },
    ],
  };
}

export function guardStateReport({ previous, candidate, now, options } = {}) {
  if (!candidate) {
    if (!previous) return { accepted: false, report: null, reason: 'candidate and previous report are missing' };
    return { accepted: false, report: preservedFallback(previous, 'the candidate report was missing', now), reason: 'candidate report missing' };
  }
  if (!previous) return { accepted: true, report: candidate, reason: null };

  const reason = collapseReason(previous, candidate, options);
  if (!reason) return { accepted: true, report: candidate, reason: null };
  return { accepted: false, report: preservedFallback(previous, reason, now, candidate), reason };
}
