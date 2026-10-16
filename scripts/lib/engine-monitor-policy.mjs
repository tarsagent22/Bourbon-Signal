export const ACTIVE_RUN_STATES = new Set(['queued', 'pending', 'waiting', 'requested', 'in_progress']);
const minute = 60_000;
const timestamp = value => { const n = Date.parse(value || ''); return Number.isFinite(n) ? n : null; };

export function assessEngineObservation(health, { nowMs = Date.now(), httpStatus = 200 } = {}) {
  const issues = [];
  const collected = timestamp(health?.engine?.generatedAt);
  const age = collected === null ? null : (nowMs - collected) / minute;
  if (httpStatus !== 200 || health?.ok !== true) issues.push('ops_health_failed');
  if (health?.release?.status !== 'healthy') issues.push('release_identity_unverified');
  if (health?.cron?.status !== 'healthy') issues.push('alert_cron_unhealthy');
  if (health?.engine?.freshnessStage !== 'healthy') issues.push(health?.engine?.freshnessStage || 'pipeline_unavailable');
  if (age === null || age < -1 || age > 45) issues.push('collection_outside_45_minutes');
  if (health?.engine?.dataSource !== 'remote-snapshot' || !health?.engine?.snapshotId) issues.push('remote_snapshot_unavailable');
  return { ok: issues.length === 0, issues, collectionAgeMinutes: age };
}

// Stable incident lifetime: changing a release, snapshot ID, or diagnostic text
// cannot open another alert or replenish the retry budget.
export function advanceEngineMonitor(previous = {}, observation, { nowMs = Date.now(), confirmChecks = 2 } = {}) {
  const state = structuredClone(previous);
  const events = [];
  const now = new Date(nowMs).toISOString();
  const collected = timestamp(observation.engine?.generatedAt);
  const lastCollected = timestamp(state.acceptedCollectionAt);
  const newAcceptedCollection = observation.ok && collected !== null && (lastCollected === null || collected > lastCollected);
  if (newAcceptedCollection) {
    state.acceptedCollectionAt = observation.engine.generatedAt;
    state.dispatch = { attempts: 0, lastAt: null, nextAt: null };
  }
  state.badChecks = observation.ok ? 0 : (state.badChecks || 0) + 1;
  state.goodChecks = observation.ok ? (state.goodChecks || 0) + 1 : 0;
  if (!observation.ok && !state.incident && state.badChecks >= confirmChecks) {
    const openedAt = state.firstBadAt || now;
    state.incident = { id: `engine-${openedAt}`, openedAt,
      collectionAtOpen: observation.engine?.generatedAt || null, issues: observation.issues };
    events.push({ id: `${state.incident.id}:opened`, type: 'incident_opened', at: now,
      message: 'Bourbon Signal freshness needs attention. Automatic recovery is bounded; see the engine monitor report.' });
  }
  if (state.badChecks === 1) state.firstBadAt = now;
  if (observation.ok) state.firstBadAt = null;
  if (state.incident) {
    state.incident.latestIssues = observation.issues;
    const openedCollection = timestamp(state.incident.collectionAtOpen);
    const newerEvidence = collected !== null && (openedCollection === null || collected > openedCollection);
    if (observation.ok && newerEvidence && state.goodChecks >= confirmChecks) {
      events.push({ id: `${state.incident.id}:recovered`, type: 'incident_recovered', at: now,
        message: 'Bourbon Signal collection is fresh again. Recovery was confirmed by two checks and newer accepted collection.' });
      state.lastClosedIncident = { ...state.incident, recoveredAt: now };
      state.incident = null;
    }
  }
  state.lastCheckedAt = now;
  state.lastObservation = observation;
  state.events = [...(state.events || []), ...events].slice(-100);
  return { state, events };
}

export function planCadenceDispatch(state, observation, runs, { nowMs = Date.now(), enabled = false } = {}) {
  if (!enabled) return { dispatch: false, reason: 'observation_only' };
  const age = observation.collectionAgeMinutes;
  // Check the job state before every dispatch, including pending concurrency jobs.
  const active = runs.find(run => ACTIVE_RUN_STATES.has(run.status));
  if (active) return { dispatch: false, reason: 'refresh_active', runId: active.databaseId || active.id };
  if (age !== null && age >= 0 && age < 20) return { dispatch: false, reason: 'collection_not_due' };
  const dispatch = state.dispatch || { attempts: 0 };
  if (timestamp(dispatch.nextAt) > nowMs) return { dispatch: false, reason: 'dispatch_backoff', nextAt: dispatch.nextAt };
  // Never reset this circuit because a new export/commit merely relabels old data.
  if (dispatch.attempts >= 3) return { dispatch: false, reason: 'dispatch_budget_exhausted' };
  // A workflow accepted just before a process restart may not yet be listed as active.
  const recent = runs.some(run => {
    const time = timestamp(run.createdAt || run.created_at);
    return time !== null && nowMs - time >= 0 && nowMs - time < 5 * minute;
  });
  if (recent) return { dispatch: false, reason: 'recent_refresh' };
  return { dispatch: true, reason: 'collection_due', attempt: dispatch.attempts + 1 };
}

export function reserveCadenceDispatch(state, nowMs = Date.now()) {
  const attempts = (state.dispatch?.attempts || 0) + 1;
  return { ...state, dispatch: { attempts, lastAt: new Date(nowMs).toISOString(),
    nextAt: new Date(nowMs + Math.min(60, 15 * 2 ** (attempts - 1)) * minute).toISOString(), status: 'reserved' } };
}

export function parseObservationRows(text) {
  const rows = []; let invalidRows = 0;
  for (const line of text.split('\n').filter(line => line.trim())) {
    try { const row = JSON.parse(line); if (timestamp(row?.checkedAt) === null) throw Error(); rows.push(row); }
    catch { invalidRows++; }
  }
  return { rows, invalidRows };
}

export function acceptanceSummary(rows, startedAt, nowMs = Date.now(), invalidObservationRows = 0) {
  const observations = rows.filter(row => timestamp(row.checkedAt) >= timestamp(startedAt));
  const gaps = observations.slice(1).some((row, i) => timestamp(row.checkedAt) - timestamp(observations[i].checkedAt) > 90 * minute);
  const hours = (nowMs - timestamp(startedAt)) / (60 * minute);
  const snapshots = new Set(observations.map(row => row.engine?.snapshotId || row.stats?.snapshotId).filter(Boolean));
  const failures = observations.filter(row => !row.ok).length;
  return { startedAt, durationHours: hours, observations: observations.length, snapshots: snapshots.size,
    failedObservations: failures, gapsOver90Minutes: gaps, invalidObservationRows,
    status: hours < 24 ? 'in_progress' : observations.length >= 24 && !failures && !gaps && !invalidObservationRows && snapshots.size >= 2 ? 'public_pipeline_observation_passed' : 'needs_review',
    scope: 'Public pipeline observations only; source acceptance, backup and actual delivery need separate final review.' };
}
