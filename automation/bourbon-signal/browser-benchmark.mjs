import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const CONTRACT_PATH = fileURLToPath(new URL('./browser-benchmark-contract.json', import.meta.url));
const EXPECTED_CATEGORIES = new Map([
  ['local_visual_qa', 3],
  ['mobile_responsive', 2],
  ['dynamic_endpoint_discovery', 2],
  ['authenticated_owner_navigation', 1],
  ['source_identity_redirect', 1],
  ['difficult_js_investigation', 1],
]);
const METRIC_KEYS = ['completed', 'durationMs', 'modelTokens', 'screenshots', 'toolCalls', 'reproducibility', 'userSessionDependence', 'collectorConvertible'];

function isFiniteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function validateMeasurement(measurement, label, errors) {
  if (!measurement || !['pending', 'completed'].includes(measurement.status)) {
    errors.push(`${label} must be pending or completed`);
    return;
  }
  if (measurement.status === 'pending') {
    if (measurement.metrics !== null) errors.push(`${label} pending measurements must keep metrics null`);
    if (!measurement.reason) errors.push(`${label} pending measurements must explain why they are pending`);
    return;
  }
  const metrics = measurement.metrics;
  if (!metrics || typeof metrics !== 'object') {
    errors.push(`${label} completed measurement must include metrics`);
    return;
  }
  for (const key of METRIC_KEYS) if (!(key in metrics)) errors.push(`${label} completed measurement is missing ${key}`);
  for (const key of ['durationMs', 'screenshots', 'toolCalls']) if (!isFiniteNonNegative(metrics[key])) errors.push(`${label} ${key} must be non-negative`);
  if (!(metrics.modelTokens === null || isFiniteNonNegative(metrics.modelTokens))) errors.push(`${label} modelTokens must be non-negative or null when unavailable`);
  if (typeof metrics.completed !== 'boolean' || typeof metrics.collectorConvertible !== 'boolean') errors.push(`${label} completion and collector conversion must be boolean`);
  if (!Number.isInteger(metrics.reproducibility) || metrics.reproducibility < 1 || metrics.reproducibility > 5) errors.push(`${label} reproducibility must be 1 through 5`);
  if (!['none', 'optional', 'required'].includes(metrics.userSessionDependence)) errors.push(`${label} userSessionDependence must be none, optional, or required`);
}

export function validateBrowserBenchmarkContract(contract) {
  const errors = [];
  const tasks = Array.isArray(contract?.tasks) ? contract.tasks : [];
  if (tasks.length !== 10) errors.push('browser benchmark must have exactly ten tasks');
  const categories = new Map();
  for (const task of tasks) {
    if (!task.id || !task.description) errors.push('each browser benchmark task needs an id and description');
    categories.set(task.category, (categories.get(task.category) || 0) + 1);
    validateMeasurement(task.measurements?.codex_native, `${task.id}:codex_native`, errors);
    validateMeasurement(task.measurements?.hermes_browser, `${task.id}:hermes_browser`, errors);
  }
  for (const [category, expectedCount] of EXPECTED_CATEGORIES) {
    if (categories.get(category) !== expectedCount) errors.push(`browser benchmark needs ${expectedCount} ${category} task(s)`);
  }
  return { ok: errors.length === 0, errors };
}

async function main() {
  const contract = JSON.parse(await readFile(CONTRACT_PATH, 'utf8'));
  const result = validateBrowserBenchmarkContract(contract);
  assert.equal(result.ok, true, result.errors.join('\n'));
  const counts = { pending: 0, completed: 0 };
  for (const task of contract.tasks) {
    for (const tool of ['codex_native', 'hermes_browser']) counts[task.measurements[tool].status] += 1;
  }
  console.log(JSON.stringify({ schemaVersion: contract.schemaVersion, taskCount: contract.tasks.length, measurements: counts }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
