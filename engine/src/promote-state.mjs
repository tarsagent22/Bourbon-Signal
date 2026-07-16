#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { renderStateLifecycleTypes, verifyStateLifecycleDrift } from '../../scripts/generate-state-lifecycle-types.mjs';
import { evaluateCapacityBudget, validateExpansionLifecycle } from './reliability-policy.mjs';
import { validateStateFixtures } from './verify-state-fixtures.mjs';
import { validateStateVerticalSliceManifest } from './state-vertical-slice-contract.mjs';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve('..');
const DEFAULT_CONFIG_PATH = path.join(ROOT, 'src', 'config', 'state-lifecycle.json');
const DEFAULT_GENERATED_PATH = path.join(ROOT, 'src', 'config', 'stateLifecycle.ts');

function clone(value) { return structuredClone(value); }
function asPositive(value, fallback = 0) { const numeric = Number(value); return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback; }

export function prepareStatePromotion({ state, config, manifest, fixtures, now = new Date().toISOString() } = {}) {
  const normalized = String(state || '').trim().toUpperCase();
  const failures = [];
  if (!normalized) failures.push('A state is required.');
  const current = config?.states?.[normalized];
  if (!current) failures.push(`${normalized}: lifecycle entry does not exist.`);
  if ((config?.activeStates || []).includes(normalized) || current?.publicStatus === 'active') failures.push(`${normalized}: already active states cannot be promoted again.`);
  if (current?.shadowEligible !== true) failures.push(`${normalized}: shadowEligible=true is required before promotion.`);

  const manifestCheck = validateStateVerticalSliceManifest(manifest);
  failures.push(...manifestCheck.failures.map((failure) => `${normalized}: ${failure}`));
  const fixtureCheck = validateStateFixtures(fixtures);
  failures.push(...fixtureCheck.failures.map((failure) => `${normalized}: ${failure}`));
  if (manifest?.state && manifest.state !== normalized) failures.push(`${normalized}: manifest state does not match promotion request.`);
  if (fixtures?.state && fixtures.state !== normalized) failures.push(`${normalized}: fixture state does not match promotion request.`);
  for (const field of ['customerLabel', 'coverageTier', 'refinementLevel']) {
    if (current && manifest?.lifecycle?.[field] !== current[field]) failures.push(`${normalized}: manifest lifecycle.${field} must match authoritative lifecycle.`);
  }

  const policy = config?.reliabilityPolicy || {};
  const promotionPolicy = policy.promotionPolicy || {};
  const minShadowRuns = asPositive(promotionPolicy.minShadowRuns, 1);
  const minCanaryRuns = asPositive(promotionPolicy.minCanaryRuns, 1);
  if (Number(manifest?.evidence?.shadow?.runs || 0) < minShadowRuns) failures.push(`${normalized}: requires at least ${minShadowRuns} successful shadow runs.`);
  if (Number(manifest?.evidence?.canary?.runs || 0) < minCanaryRuns) failures.push(`${normalized}: requires at least ${minCanaryRuns} successful canary runs.`);

  const projectedStates = [...(config?.activeStates || []), normalized];
  const durations = projectedStates.map((id) => Number(policy.stateExpectedRunMs?.[id] || policy.defaultExpectedStateRunMs));
  const capacity = evaluateCapacityBudget({
    stateExpectedRunMs: durations,
    concurrency: policy.workerConcurrency,
    intervalMs: policy.refreshIntervalMs,
    safetyMarginMs: policy.refreshSafetyMarginMs,
  });
  if (!capacity.ok) failures.push(capacity.reason);

  const nextConfig = clone(config || { activeStates: [], reliabilityPolicy: {}, states: {} });
  if (current) {
    nextConfig.activeStates = [...nextConfig.activeStates, normalized];
    nextConfig.states[normalized] = {
      ...nextConfig.states[normalized],
      publicStatus: 'active',
      promotionStage: 'active',
      promotionEvidence: {
        shadowRuns: Number(manifest?.evidence?.shadow?.runs || 0),
        canaryRuns: Number(manifest?.evidence?.canary?.runs || 0),
        verifiedAt: now,
        shadowArtifact: manifest?.evidence?.shadow?.artifact || null,
        canaryArtifact: manifest?.evidence?.canary?.artifact || null,
        canaryPreviewUrl: manifest?.evidence?.production?.url || null,
        verticalSliceManifest: `engine/data/state-integration/${normalized}.json`,
        fixtureContract: `engine/data/state-fixtures/${normalized}.json`,
      },
    };
  }
  const lifecycleCheck = validateExpansionLifecycle(nextConfig);
  failures.push(...lifecycleCheck.failures);
  return {
    ok: failures.length === 0,
    state: normalized,
    failures,
    capacity,
    nextConfig,
    deploy: false,
    rollback: { files: [DEFAULT_CONFIG_PATH, DEFAULT_GENERATED_PATH] },
  };
}

async function atomicWrite(file, contents) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.promotion-${process.pid}-${Date.now()}.tmp`;
  await writeFile(temporary, contents, 'utf8');
  await rename(temporary, file);
}

export async function applyStatePromotion({ prepared, configPath = DEFAULT_CONFIG_PATH, generatedPath = DEFAULT_GENERATED_PATH, transactionDir = path.join(ROOT, '.state-promotion-transactions') } = {}) {
  if (!prepared?.ok) throw new Error(`Refusing to apply an invalid promotion: ${(prepared?.failures || []).join(' ')}`);
  const originals = await Promise.all([readFile(configPath, 'utf8'), readFile(generatedPath, 'utf8')]);
  const transaction = {
    schemaVersion: 1,
    state: prepared.state,
    createdAt: new Date().toISOString(),
    status: 'prepared',
    files: [
      { path: configPath, contents: originals[0] },
      { path: generatedPath, contents: originals[1] },
    ],
  };
  await mkdir(transactionDir, { recursive: true });
  const transactionPath = path.join(transactionDir, `${prepared.state}-${Date.now()}.json`);
  await atomicWrite(transactionPath, JSON.stringify(transaction, null, 2));
  try {
    await atomicWrite(configPath, `${JSON.stringify(prepared.nextConfig, null, 2)}\n`);
    await atomicWrite(generatedPath, renderStateLifecycleTypes(prepared.nextConfig));
    const drift = await verifyStateLifecycleDrift({ config: prepared.nextConfig, actual: await readFile(generatedPath, 'utf8') });
    if (!drift.ok) throw new Error(drift.reason);
    transaction.status = 'applied';
    await atomicWrite(transactionPath, JSON.stringify(transaction, null, 2));
    return { ok: true, transactionPath, deploy: false };
  } catch (error) {
    await rollbackPromotionFiles(transaction);
    transaction.status = 'rolled_back_after_error';
    transaction.error = error.message;
    await atomicWrite(transactionPath, JSON.stringify(transaction, null, 2));
    throw error;
  }
}

export async function rollbackPromotionFiles(transaction) {
  if (!transaction?.files?.length) throw new Error('Promotion transaction has no rollback files.');
  for (const file of transaction.files) await atomicWrite(file.path, file.contents);
  return { ok: true, restored: transaction.files.map((file) => file.path) };
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function runChecks({ state, siteDir }) {
  const commands = [
    [process.execPath, ['--test', 'test/state-vertical-slice-contract.test.mjs', 'test/state-fixture-contract.test.mjs', 'test/state-integration.test.mjs', 'test/promote-state.test.mjs']],
    [process.execPath, ['src/verify-state-fixtures.mjs', `--state=${state}`]],
    [process.execPath, ['src/verify-state-integration.mjs', `--state=${state}`, `--site-dir=${siteDir}`]],
    [process.execPath, ['../scripts/verify-state-lifecycle-drift.mjs']],
  ];
  for (const [command, args] of commands) await execFileAsync(command, args, { cwd: process.cwd(), windowsHide: true });
}

async function main() {
  if (process.argv.includes('--deploy') || process.argv.includes('--publish')) throw new Error('promote-state never deploys or publishes a production snapshot. Use the guarded release path after a committed review.');
  if (process.argv.includes('--rollback')) {
    const transactionFile = argValue('--transaction');
    if (!transactionFile) throw new Error('--rollback requires --transaction=<file>.');
    const transaction = JSON.parse(await readFile(path.resolve(transactionFile), 'utf8'));
    console.log(JSON.stringify(await rollbackPromotionFiles(transaction), null, 2));
    return;
  }
  const state = String(argValue('--state') || '').toUpperCase();
  if (!state) throw new Error('Usage: promote-state --state=<STATE> [--apply --site-dir=<canary-site-dir>]');
  const configPath = path.resolve(argValue('--config') || DEFAULT_CONFIG_PATH);
  const manifestPath = path.resolve(argValue('--manifest') || path.join('data', 'state-integration', `${state}.json`));
  const fixturePath = path.resolve(argValue('--fixtures') || path.join('data', 'state-fixtures', `${state}.json`));
  const [config, manifest, fixtures] = await Promise.all([readFile(configPath, 'utf8').then(JSON.parse), readFile(manifestPath, 'utf8').then(JSON.parse), readFile(fixturePath, 'utf8').then(JSON.parse)]);
  const prepared = prepareStatePromotion({ state, config, manifest, fixtures });
  if (!prepared.ok) throw new Error(prepared.failures.join('\n'));
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ ...prepared, nextConfig: undefined, mode: 'dry_run', productionSnapshotTouched: false, deploymentTriggered: false }, null, 2));
    return;
  }
  const siteDir = argValue('--site-dir');
  if (!siteDir) throw new Error('--apply requires --site-dir=<coherent canary site directory> for integration verification.');
  const applied = await applyStatePromotion({ prepared, configPath, generatedPath: path.resolve(argValue('--generated') || DEFAULT_GENERATED_PATH) });
  try {
    await runChecks({ state, siteDir: path.resolve(siteDir) });
    console.log(JSON.stringify({ ...applied, verified: true, productionSnapshotTouched: false, deploymentTriggered: false }, null, 2));
  } catch (error) {
    const transaction = JSON.parse(await readFile(applied.transactionPath, 'utf8'));
    await rollbackPromotionFiles(transaction);
    throw new Error(`Promotion checks failed and lifecycle files were rolled back: ${error.message}`);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
