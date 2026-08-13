import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

function rows(value, key) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.[key]) ? value[key] : [];
}

function stateId(value) {
  return String(value || '').trim().toUpperCase();
}

function isLabeledDegraded(row = {}) {
  const status = String(row.status || '').toLowerCase();
  return row.stale === true || /^(?:stale_|failed_|blocked|reachable_needs_deeper_parser)/.test(status);
}

export function assessStateFailureIsolation({ stateCoverage = null, refreshHealth = null, alerts = [] } = {}) {
  const coverageRows = rows(stateCoverage, 'states');
  const coverageByState = new Map(coverageRows.map((row) => [stateId(row?.state), row]));
  const operatingRows = rows(refreshHealth?.states, 'states');
  const operatingByState = new Map(operatingRows.map((row) => [stateId(row?.state), row]));
  const reportedDegraded = rows(refreshHealth?.degradedStates, 'states');
  const degradedStateIds = new Set(
    reportedDegraded.map((row) => stateId(row?.state)).filter(Boolean),
  );
  for (const row of coverageRows) {
    if (isLabeledDegraded(row)) degradedStateIds.add(stateId(row.state));
  }

  const alertingStates = new Set(rows(alerts, 'alerts')
    .filter((row) => row?.eligibleForDelivery === true)
    .map((row) => stateId(row?.state))
    .filter(Boolean));
  const issues = [];
  const unsafeStateIds = new Set();
  if (!stateCoverage || typeof stateCoverage !== 'object') {
    issues.push('Published state coverage is missing.');
  } else if (coverageRows.length === 0) {
    issues.push('Published state coverage contains no states.');
  }
  if (!refreshHealth || typeof refreshHealth !== 'object') {
    issues.push('Refresh health is missing.');
  }
  const reportedCountValues = {
    degraded: refreshHealth?.degradedStateCount,
    stale: refreshHealth?.staleStateCount,
    failed: refreshHealth?.failedStateCount,
  };
  const reportedCounts = {
    degraded: Number(reportedCountValues.degraded),
    stale: Number(reportedCountValues.stale),
    failed: Number(reportedCountValues.failed),
  };
  const labeledCounts = {
    degraded: reportedDegraded.length,
    stale: reportedDegraded.filter((row) => row?.stale === true || /^stale_/.test(String(row?.status || '').toLowerCase())).length,
    failed: reportedDegraded.filter((row) => /^(?:failed_|blocked$)/.test(String(row?.status || '').toLowerCase())).length,
  };
  for (const kind of ['degraded', 'stale', 'failed']) {
    if (typeof reportedCountValues[kind] !== 'number' || !Number.isInteger(reportedCounts[kind]) || reportedCounts[kind] < 0) {
      issues.push(`Refresh health ${kind} state count is missing or invalid.`);
    } else if (reportedCounts[kind] !== labeledCounts[kind]) {
      issues.push(`Refresh health ${kind} state count ${reportedCounts[kind]} does not match ${labeledCounts[kind]} labeled state row(s).`);
    }
  }

  for (const state of [...degradedStateIds].sort()) {
    const coverage = coverageByState.get(state);
    if (!coverage) {
      issues.push(`Degraded state ${state} is missing from the published state contract.`);
      unsafeStateIds.add(state);
      continue;
    }
    const operating = operatingByState.get(state);
    if (!isLabeledDegraded(coverage) && !operating?.health?.match(/^(?:stale_useful|degraded|blocked)$/)) {
      issues.push(`Degraded state ${state} is not explicitly labeled degraded in the published state contract.`);
      unsafeStateIds.add(state);
    }
    const requiresAlertSuppression = operating
      ? operating.health === 'blocked'
        || operating.freshness?.status === 'stale'
        || (operating.fallback?.status && operating.fallback.status !== 'none')
      : isLabeledDegraded(coverage);
    if (requiresAlertSuppression && alertingStates.has(state)) {
      issues.push(`Degraded state ${state} still has an eligible alert candidate.`);
      unsafeStateIds.add(state);
    }
  }

  const healthyStateIds = coverageRows
    .map((row) => stateId(row?.state))
    .filter((state) => state && !degradedStateIds.has(state))
    .sort();

  return {
    ok: issues.length === 0,
    stateCount: coverageRows.length,
    degradedStateIds: [...degradedStateIds].sort(),
    healthyStateIds,
    unsafeStateIds: [...unsafeStateIds].sort(),
    issues,
  };
}

async function runCli() {
  const stats = JSON.parse(await readFile('out/site/stats.json', 'utf8'));
  const alerts = JSON.parse(await readFile('out/site/alerts.json', 'utf8'));
  const result = assessStateFailureIsolation({
    stateCoverage: stats.stateCoverage,
    refreshHealth: stats.refreshHealth,
    alerts,
  });
  assert.equal(result.ok, true, result.issues.join(' '));
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
