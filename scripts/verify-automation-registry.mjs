#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, 'automation', 'bourbon-signal', 'automation-registry.json');
const SCHEMA_PATH = path.join(ROOT, 'automation', 'bourbon-signal', 'automation-registry.schema.json');
const HERMES_JOBS_PATH = path.join(ROOT, 'automation', 'bourbon-signal', 'hermes-jobs.json');
const OWNER_LAYERS = new Set(['deterministic', 'sensor', 'operator', 'brief']);
const EXECUTION_CLASSES = new Set(['script_only', 'script_then_agent', 'agent']);
const MUTATION_CLASSES = new Set(['none', 'internal_state', 'snapshot_activation']);
const PROMOTION_CLASSES = new Set(['none', 'guarded_recovery_dispatch', 'snapshot_activation', 'operator_only']);
const SILENCE_POLICIES = new Set(['quiet_on_success', 'compact_exception_only', 'report_output']);

function fail(failures, message) { failures.push(message); }
function isPlainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function activeWorkflowPaths() {
  const directory = path.join(ROOT, '.github', 'workflows');
  return readdirSync(directory)
    .filter((name) => name.endsWith('.yml'))
    .map((name) => `.github/workflows/${name}`)
    .sort();
}

export function verifyAutomationRegistry(registry, { workflowPaths = activeWorkflowPaths(), hermesJobs = JSON.parse(readFileSync(HERMES_JOBS_PATH, 'utf8')) } = {}) {
  const failures = [];
  if (!isPlainObject(registry) || registry.schemaVersion !== 1 || !Array.isArray(registry.automations)) {
    return { ok: false, failures: ['Registry must be an object with schemaVersion 1 and an automations array.'] };
  }
  const ids = new Set();
  const githubPaths = new Set();
  const hermesIds = new Set();
  const liveHermesJobs = new Map((Array.isArray(hermesJobs?.jobs) ? hermesJobs.jobs : []).map((job) => [job.jobId, job]));
  for (const entry of registry.automations) {
    if (!isPlainObject(entry)) { fail(failures, 'Every registry entry must be an object.'); continue; }
    const prefix = `Registry entry ${String(entry.id || 'unknown')}`;
    for (const key of ['id', 'platform', 'active', 'ownerLayer', 'executionClass', 'frequency', 'agent', 'externalApi', 'customerMutation', 'promotionDeployment', 'silencePolicy', 'killSwitch', 'artifacts']) {
      if (!(key in entry)) fail(failures, `${prefix} is missing ${key}.`);
    }
    if (!/^[a-z0-9][a-z0-9-]{2,100}$/.test(String(entry.id || ''))) fail(failures, `${prefix} has an invalid id.`);
    if (ids.has(entry.id)) fail(failures, `${prefix} duplicates an id.`);
    ids.add(entry.id);
    if (entry.active !== true) fail(failures, `${prefix} must explicitly be active.`);
    if (!OWNER_LAYERS.has(entry.ownerLayer)) fail(failures, `${prefix} has an invalid ownerLayer.`);
    if (!EXECUTION_CLASSES.has(entry.executionClass)) fail(failures, `${prefix} has an invalid executionClass.`);
    if (typeof entry.frequency !== 'string' || !entry.frequency.trim()) fail(failures, `${prefix} needs an expected frequency.`);
    if (!isPlainObject(entry.agent) || !('provider' in entry.agent) || !('model' in entry.agent)) fail(failures, `${prefix} needs agent provider/model fields.`);
    if (entry.executionClass === 'script_only' && (entry.agent?.provider !== null || entry.agent?.model !== null)) fail(failures, `${prefix} script_only jobs cannot declare an agent model.`);
    if (entry.executionClass !== 'script_only' && (!entry.agent?.provider || !entry.agent?.model)) fail(failures, `${prefix} agentic jobs require provider and model.`);
    if (!isPlainObject(entry.externalApi) || !Array.isArray(entry.externalApi.classes) || !Number.isInteger(entry.externalApi.maxRequestsPerRun) || entry.externalApi.maxRequestsPerRun < 0) fail(failures, `${prefix} needs a bounded externalApi declaration.`);
    if (!MUTATION_CLASSES.has(entry.customerMutation)) fail(failures, `${prefix} has invalid customerMutation.`);
    if (!PROMOTION_CLASSES.has(entry.promotionDeployment)) fail(failures, `${prefix} has invalid promotionDeployment.`);
    if (!SILENCE_POLICIES.has(entry.silencePolicy)) fail(failures, `${prefix} has invalid silencePolicy.`);
    if (typeof entry.killSwitch !== 'string' || !entry.killSwitch.trim()) fail(failures, `${prefix} needs a kill switch.`);
    if (!Array.isArray(entry.artifacts)) fail(failures, `${prefix} needs artifact outputs.`);
    if (entry.platform === 'github_workflow') {
      if (typeof entry.workflowPath !== 'string' || !workflowPaths.includes(entry.workflowPath)) fail(failures, `${prefix} points at a missing active GitHub workflow.`);
      githubPaths.add(entry.workflowPath);
    } else if (entry.platform === 'hermes_job') {
      const liveJob = liveHermesJobs.get(entry.hermesJobId);
      if (!liveJob) fail(failures, `${prefix} has an unknown Hermes job id.`);
      else {
        const expectsNoAgent = entry.executionClass === 'script_only';
        if (liveJob.noAgent !== expectsNoAgent) fail(failures, `${prefix} executionClass does not match live no_agent=${liveJob.noAgent}.`);
        if (expectsNoAgent && !liveJob.script) fail(failures, `${prefix} script_only job is missing a live scheduler script.`);
        if (String(liveJob.workdir || '').split(/[\\/]/).filter(Boolean).pop() !== path.basename(ROOT)) fail(failures, `${prefix} live scheduler workdir drifted from the repository root.`);
        if (expectsNoAgent && entry.killSwitch !== `cron_pause:${entry.hermesJobId}`) fail(failures, `${prefix} script_only job must expose its live cron pause kill switch.`);
      }
      hermesIds.add(entry.hermesJobId);
    } else fail(failures, `${prefix} has an invalid platform.`);
    if (/watchdog/i.test(String(entry.id)) && entry.executionClass !== 'script_only') fail(failures, `${prefix} watchdogs must be script_only.`);
  }
  for (const workflowPath of workflowPaths) if (!githubPaths.has(workflowPath)) fail(failures, `Active GitHub workflow is unclassified: ${workflowPath}.`);
  for (const workflowPath of githubPaths) if (!workflowPaths.includes(workflowPath)) fail(failures, `Registry workflow is not active: ${workflowPath}.`);
  for (const hermesJobId of liveHermesJobs.keys()) if (!hermesIds.has(hermesJobId)) fail(failures, `Exported Hermes job is unclassified: ${hermesJobId}.`);
  return { ok: failures.length === 0, failures };
}

function main() {
  const failures = [];
  if (!existsSync(REGISTRY_PATH)) failures.push('Missing automation/bourbon-signal/automation-registry.json.');
  if (!existsSync(SCHEMA_PATH)) failures.push('Missing automation/bourbon-signal/automation-registry.schema.json.');
  if (!existsSync(HERMES_JOBS_PATH)) failures.push('Missing automation/bourbon-signal/hermes-jobs.json scheduler export.');
  if (failures.length) return { ok: false, failures };
  let registry;
  try { registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')); } catch { return { ok: false, failures: ['Automation registry is not valid JSON.'] }; }
  let schema;
  try { schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')); } catch { return { ok: false, failures: ['Automation registry schema is not valid JSON.'] }; }
  if (schema?.$defs?.automation?.additionalProperties !== false) failures.push('Automation registry schema must reject unknown fields.');
  const verified = verifyAutomationRegistry(registry);
  failures.push(...verified.failures);
  return { ok: failures.length === 0, failures };
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] || '')).href) {
  const result = main();
  if (!result.ok) {
    for (const failure of result.failures) process.stderr.write(`${failure}\n`);
    process.exitCode = 1;
  } else process.stdout.write('Automation registry verification passed.\n');
}
