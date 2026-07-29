function signalObservationIdentity(signal) {
  return JSON.stringify([
    signal?.eventType || signal?.type || '',
    signal?.canonicalId || signal?.canonicalBottleId || signal?.bottleId || signal?.canonicalName || signal?.rawName || signal?.id || '',
    signal?.storeId || signal?.locationId || signal?.storeAddress || signal?.locationName || signal?.county || signal?.city || signal?.id || '',
    signal?.sourceLabel || signal?.source || signal?.sourceChain || '',
    signal?.productId || signal?.productCode || signal?.ncCode || signal?.raw?.ncCode || '',
  ].map((value) => String(value).trim().toLowerCase()));
}

function isActionableStoreSignal(signal) {
  return signal?.locationPrecision === 'store_level'
    && (signal?.canAlertAsInventory === true || signal?.sourceAvailabilityVerified === true);
}

function countUniqueSignals(report, predicate = null) {
  return new Set((report?.signals || [])
    .filter((signal) => !predicate || predicate(signal))
    .map(signalObservationIdentity)).size;
}

function countActionable(report) {
  return countUniqueSignals(report, isActionableStoreSignal);
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

function ncObservationIdentity(signal) {
  return JSON.stringify([
    signal?.eventType || signal?.type || '',
    signal?.canonicalId || signal?.canonicalBottleId || signal?.bottleId || signal?.canonicalName || signal?.rawName || '',
    signal?.sourceChain || signal?.sourceLabel || signal?.source || '',
    signal?.sourceUrl || '',
    signal?.merchantId || '',
    signal?.productId || signal?.productCode || signal?.ncCode || signal?.raw?.ncCode || '',
    signal?.variantId || '',
    signal?.storeId || signal?.locationId || signal?.storeName || signal?.locationName || signal?.storeAddress || signal?.county || signal?.city || '',
  ].map((value) => String(value).trim().toLowerCase()));
}

function ncObservationContent(signal) {
  return JSON.stringify([
    signal?.quantity ?? null,
    signal?.storeQty ?? null,
    signal?.warehouseQty ?? null,
    signal?.reportedQuantity ?? null,
    signal?.availabilityStatus ?? null,
    signal?.availabilityValue ?? null,
    signal?.sourceAvailabilityVerified ?? null,
    signal?.price ?? null,
    signal?.sourceEventAt ?? null,
    signal?.eventDate ?? signal?.releaseDate ?? null,
  ]);
}

function earliestTimestamp(...values) {
  return values
    .filter((value) => Number.isFinite(Date.parse(String(value || ''))))
    .sort((left, right) => Date.parse(left) - Date.parse(right))[0] || null;
}

function latestTimestamp(...values) {
  return values
    .filter((value) => Number.isFinite(Date.parse(String(value || ''))))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] || null;
}

const PARTIAL_SIGNAL_CONTINUITY_STATES = new Set(['NC', 'SC', 'TX']);

export function usesPartialSignalContinuity(state) {
  return PARTIAL_SIGNAL_CONTINUITY_STATES.has(String(state || '').trim().toUpperCase());
}

export function stateReportContinuityStateIds(reports = []) {
  const partialFallbackStateIds = reports
    .filter((report) => report?.partial === true || /^partial_useful_quality_fallback$/i.test(String(report?.status || '')))
    .map((report) => String(report.state || '').toUpperCase())
    .filter(Boolean);
  const partial = new Set(partialFallbackStateIds);
  const fallbackStateIds = reports
    .filter((report) => report?.stale === true || /fallback/i.test(String(report?.status || '')))
    .map((report) => String(report.state || '').toUpperCase())
    .filter((state) => state && !partial.has(state));
  return {
    fallbackStateIds: [...new Set(fallbackStateIds)].sort(),
    partialFallbackStateIds: [...new Set(partialFallbackStateIds)].sort(),
  };
}

function reconcileNcObservationHistory(previous, candidate) {
  if (candidate?.state !== 'NC') return candidate;
  const previousByObservation = new Map();
  for (const signal of previous?.signals || []) {
    const key = `${ncObservationIdentity(signal)}|${ncObservationContent(signal)}`;
    const matches = previousByObservation.get(key) || [];
    matches.push(signal);
    previousByObservation.set(key, matches);
  }

  return {
    ...candidate,
    signals: (candidate.signals || []).map((signal) => {
      const observedAt = signal.observedAt || signal.fetchedAt || null;
      const key = `${ncObservationIdentity(signal)}|${ncObservationContent(signal)}`;
      const matches = previousByObservation.get(key) || [];
      const prior = matches.shift() || null;
      return {
        ...signal,
        firstSeenAt: earliestTimestamp(prior?.firstSeenAt, prior?.observedAt, signal.firstSeenAt, observedAt),
        lastConfirmedAt: latestTimestamp(prior?.lastConfirmedAt, prior?.observedAt, signal.lastConfirmedAt, observedAt),
      };
    }),
  };
}

function collapseReason(previous, candidate, { minBaseline = 1, minRatio = 0.5, isPublicBottleCandidate = null } = {}) {
  const previousSignals = countUniqueSignals(previous);
  const candidateSignals = countUniqueSignals(candidate);
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
  const priorStatus = String(previous.status || '')
    .replace(/^(stale_)+/, '')
    .replace(/(?:_quality_fallback)+$/, '') || 'previous_report';
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

function sanitizeNonAlertingStaleSignal(signal) {
  const stale = signal?.stale === true || signal?.sourceStale === true || signal?.raw?.staleFallback === true;
  if (!stale) return signal;
  return {
    ...signal,
    stale: true,
    sourceStale: true,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    alertable: false,
    sourceAvailabilityVerified: false,
    raw: {
      ...(signal.raw || {}),
      staleFallback: true,
    },
  };
}

function partialFallback(previous, candidate, reason, now = new Date().toISOString()) {
  const currentIdentities = new Set((candidate.signals || []).map(signalObservationIdentity));
  const retainedSignals = (previous.signals || [])
    .filter((signal) => !currentIdentities.has(signalObservationIdentity(signal)))
    .map((signal) => ({
      ...signal,
      stale: true,
      sourceStale: true,
      staleReason: `Latest partial refresh did not reconfirm this identity: ${reason}.`,
      staleSourceCaveat: `Last confirmed by the source before the latest partial refresh; verify with the store before driving.`,
      canAlertAsInventory: false,
      canAlertAsWatch: false,
      alertable: false,
      sourceAvailabilityVerified: false,
      raw: {
        ...(signal.raw || {}),
        staleFallback: true,
        staleFallbackAt: now,
        staleReason: `Latest partial refresh did not reconfirm this identity: ${reason}.`,
      },
    }));
  return {
    ...candidate,
    status: 'partial_useful_quality_fallback',
    stale: false,
    staleReason: null,
    partial: true,
    partialReason: reason,
    previousFinishedAt: previous.finishedAt || previous.lastGoodAt || null,
    lastGoodAt: candidate.finishedAt || candidate.lastGoodAt || now,
    signals: [
      ...(candidate.signals || []).map(sanitizeNonAlertingStaleSignal),
      ...retainedSignals.map(sanitizeNonAlertingStaleSignal),
    ],
    roadblocks: [
      ...(candidate.roadblocks || []).filter((roadblock) => roadblock.status !== 'quality_regression_partial_report'),
      {
        state: candidate.state,
        source: `${candidate.label || candidate.state} state quality guard`,
        url: `out/states/${candidate.state}.json`,
        status: 'quality_regression_partial_report',
        error: reason,
        nextRoute: 'Publish current identities and retain missing identities as non-alerting stale context while later runs repair coverage.',
      },
    ],
  };
}

export function guardStateReport({ previous, candidate, now, options } = {}) {
  if (!candidate) {
    if (!previous) return { accepted: false, report: null, reason: 'candidate and previous report are missing' };
    return { accepted: false, report: preservedFallback(previous, 'the candidate report was missing', now), reason: 'candidate report missing' };
  }
  const reconciledCandidate = reconcileNcObservationHistory(previous, candidate);
  if (!previous) return { accepted: true, report: reconciledCandidate, reason: null };

  const reason = collapseReason(previous, reconciledCandidate, options);
  if (!reason) return { accepted: true, report: reconciledCandidate, reason: null };
  if (options?.mergePartialFallback && (reconciledCandidate.signals || []).length > 0) {
    return { accepted: true, report: partialFallback(previous, reconciledCandidate, reason, now), reason };
  }
  return { accepted: false, report: preservedFallback(previous, reason, now, reconciledCandidate), reason };
}
