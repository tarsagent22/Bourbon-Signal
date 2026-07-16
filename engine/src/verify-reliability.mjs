#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { evaluateCapacityBudget, validateExpansionLifecycle } from './reliability-policy.mjs';

const ROOT = path.resolve('..');
const lifecycle = JSON.parse(await readFile(path.join(ROOT, 'src/config/state-lifecycle.json'), 'utf8'));
const policy = lifecycle.reliabilityPolicy || {};
const failures = [];
const expansion = validateExpansionLifecycle(lifecycle);
failures.push(...expansion.failures);

const durations = (lifecycle.activeStates || []).map((state) => Number(policy.stateExpectedRunMs?.[state] || policy.defaultExpectedStateRunMs));
if (durations.some((value) => !Number.isFinite(value) || value <= 0)) failures.push('Every active state must have a positive expected runtime budget.');
const capacity = evaluateCapacityBudget({
  stateExpectedRunMs: durations,
  concurrency: policy.workerConcurrency,
  intervalMs: policy.refreshIntervalMs,
  safetyMarginMs: policy.refreshSafetyMarginMs,
});
if (!capacity.ok) failures.push(capacity.reason);
if (Number(policy.refreshIntervalMs) !== 30 * 60_000) failures.push('Reliability refresh interval must remain 30 minutes.');
if (Number(policy.refreshSafetyMarginMs) < 5 * 60_000) failures.push('Reliability refresh safety margin must be at least 5 minutes.');
if (Number(policy.promotionPolicy?.minShadowRuns) < 3) failures.push('State promotion policy must require at least three shadow runs.');
if (Number(policy.promotionPolicy?.minCanaryRuns) < 2) failures.push('State promotion policy must require at least two canary runs.');
for (const key of ['requireVerticalSliceManifest', 'requireFixtureContract', 'requireCanaryPreviewUrl']) {
  if (policy.promotionPolicy?.[key] !== true) failures.push(`State promotion policy must keep ${key} enabled.`);
}

const payload = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  activeStateCount: lifecycle.activeStates?.length || 0,
  expansion,
  capacity,
  failures,
};
await mkdir(path.resolve('out'), { recursive: true });
await writeFile(path.resolve('out/reliability-status.json'), JSON.stringify(payload, null, 2));
console.log(`Reliability contract: ${payload.ok ? 'passed' : 'failed'}; ${payload.activeStateCount} active states; projected ${Math.round(capacity.projectedRunMs / 1000)}s/${Math.round(capacity.availableRunMs / 1000)}s budget.`);
for (const failure of failures) console.error(`failure: ${failure}`);
if (!payload.ok) process.exit(1);
