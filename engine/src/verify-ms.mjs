#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildMississippiRunPlan } from './collectors/mississippi-run-plan.mjs';
import { MISSISSIPPI_RETAILER_SOURCES } from './collectors/mississippi-retailer-surfaces.mjs';
import { MISSISSIPPI_TAP_SOURCE_POLICY } from './discovery/mississippi-package-directory.mjs';
import { validateMississippiSourceAtlas } from './discovery/source-atlas.mjs';
import { isMississippiRetailerInventory } from './mississippi-retailer-policy.mjs';
import { getStateLifecycle, STATE_LIFECYCLE_CONFIG } from './state-lifecycle.mjs';
import { verifyMississippiReleasePolicy } from './mississippi-release-policy.mjs';
import { validateStateVerticalSliceManifest } from './state-vertical-slice-contract.mjs';
import { validateStateFixtures } from './verify-state-fixtures.mjs';

function readJson(relative) {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'));
}

function sha256Relative(relative) {
  return createHash('sha256').update(readFileSync(new URL(relative, import.meta.url))).digest('hex');
}

function flag(name, fallback) {
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const MISSISSIPPI_SHADOW_SOURCE_FILES = Object.freeze([
  'engine/data/mississippi-retailer-registry.json',
  'src/config/mississippi-program.json',
  'engine/src/collectors/mississippi-retailer-surfaces.mjs',
  'engine/src/collectors/mississippi-retailer-collector.mjs',
  'engine/src/mississippi-retailer-policy.mjs',
  'engine/src/collectors/mississippi-run-plan.mjs',
  'engine/src/sources/source-adapter.mjs',
  'engine/src/sources/source-runner.mjs',
  '.github/workflows/state-expansion-shadow.yml',
  'engine/src/run-expansion-shadow.mjs',
]);

function currentShadowSourceTree() {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  return Object.fromEntries(MISSISSIPPI_SHADOW_SOURCE_FILES.map((file) => [file, execFileSync(
    'git',
    ['hash-object', `--path=${file}`, path.join(root, file)],
    { encoding: 'utf8', cwd: root },
  ).trim()]));
}

function ghApiJson(endpoint) {
  return JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8' }));
}

function readTrustedArtifactJson(root, relativePath, label) {
  assert.match(String(relativePath || ''), /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._\/-]+$/u, `${label} artifact path is unsafe.`);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  assert.ok(resolved.startsWith(`${resolvedRoot}${path.sep}`), `${label} artifact path escaped the verified artifact.`);
  return JSON.parse(readFileSync(resolved, 'utf8'));
}

function verifyGithubShadowRunProvenance(evidence) {
  const repository = execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], { encoding: 'utf8' }).trim();
  assert.match(String(evidence.sourceRevisionSha || ''), /^[a-f0-9]{40}$/u);
  const sourceRevision = ghApiJson(`repos/${repository}/commits/${evidence.sourceRevisionSha}`);
  assert.equal(sourceRevision.sha, evidence.sourceRevisionSha);
  const verified = new Map();
  for (const run of evidence.runs || []) {
    const github = run.github || {};
    assert.equal(github.repository, repository);
    assert.ok(Number.isInteger(Number(github.workflowRunId)) && Number(github.workflowRunId) > 0);
    assert.ok(Number.isInteger(Number(github.artifactId)) && Number(github.artifactId) > 0);
    assert.match(String(github.headSha || ''), /^[a-f0-9]{40}$/u);
    assert.match(String(github.artifactDigest || ''), /^sha256:[a-f0-9]{64}$/u);
    const workflow = ghApiJson(`repos/${repository}/actions/runs/${github.workflowRunId}`);
    assert.equal(workflow.head_sha, github.headSha, 'Shadow workflow head must match the reviewed run metadata.');
    const ancestry = ghApiJson(`repos/${repository}/compare/${evidence.sourceRevisionSha}...${workflow.head_sha}`);
    assert.ok(['ahead', 'identical'].includes(ancestry.status), 'Shadow workflow head must descend from the reviewed source revision.');
    assert.equal(ancestry.merge_base_commit?.sha, evidence.sourceRevisionSha, 'Shadow workflow source revision is not the run head merge base.');
    assert.equal(workflow.conclusion, 'success');
    assert.ok(['schedule', 'workflow_dispatch'].includes(workflow.event));
    assert.match(String(workflow.path || ''), /^\.github\/workflows\/state-expansion-shadow\.yml(?:@|$)/u);
    assert.equal(Number(workflow.run_attempt), Number(github.runAttempt));
    for (const [file, expectedBlob] of Object.entries(evidence.sourceTree || {})) {
      const remote = ghApiJson(`repos/${repository}/contents/${file}?ref=${workflow.head_sha}`);
      assert.equal(remote.sha, expectedBlob, `Shadow run ${github.workflowRunId} used a different guarded source file: ${file}.`);
    }
    const artifacts = ghApiJson(`repos/${repository}/actions/runs/${github.workflowRunId}/artifacts?per_page=100`).artifacts || [];
    const artifact = artifacts.find((entry) => Number(entry.id) === Number(github.artifactId));
    assert.ok(artifact && artifact.expired !== true, 'Shadow workflow artifact is missing or expired.');
    assert.equal(artifact.name, github.artifactName);
    assert.equal(artifact.digest, github.artifactDigest, 'Shadow artifact digest must match immutable GitHub Actions metadata.');
    const downloadDir = mkdtempSync(path.join(tmpdir(), 'bs-ms-shadow-'));
    try {
      execFileSync('gh', ['run', 'download', String(github.workflowRunId), '--repo', repository, '--name', github.artifactName, '--dir', downloadDir], {
        encoding: 'utf8',
        maxBuffer: 100 * 1024 * 1024,
      });
      const artifactEvidence = readTrustedArtifactJson(downloadDir, github.evidenceRelativePath, 'Shadow evidence');
      const artifactReport = readTrustedArtifactJson(downloadDir, github.reportRelativePath, 'Shadow report');
      assert.equal(artifactEvidence.state, 'MS');
      assert.equal(artifactEvidence.mode, 'shadow');
      assert.equal(artifactEvidence.publication?.productionSnapshotTouched, false);
      assert.equal(artifactEvidence.alerts?.disabled, true);
      assert.equal(artifactEvidence.alerts?.deliveryAttempted, false);
      assert.equal(artifactEvidence.execution?.ok, true, 'Shadow artifact contains a failed inner collector execution.');
      assert.notEqual(artifactEvidence.collector?.status, 'failed_shadow_collection');
      assert.equal(artifactReport.state, 'MS');
      assert.notEqual(artifactReport.status, 'failed_shadow_collection');
      verified.set(String(github.workflowRunId), {
        artifactId: Number(artifact.id),
        artifactDigest: artifact.digest,
        headSha: workflow.head_sha,
        evidence: artifactEvidence,
        report: artifactReport,
      });
    } finally {
      rmSync(downloadDir, { recursive: true, force: true });
    }
  }
  return verified;
}

export function validateMississippiShadowEvidenceArtifact(evidence, {
  expectedSourceTree = currentShadowSourceTree(),
  verifiedGithubRuns = new Map(),
} = {}) {
  assert.equal(evidence?.contractVersion, 'bourbon-signal/ms-shadow-evidence@2');
  assert.equal(evidence?.state, 'MS');
  assert.match(String(evidence?.sourceRevisionSha || ''), /^[a-f0-9]{40}$/u, 'Shadow verification requires a full source revision SHA.');
  assert.deepEqual(evidence.sourceTree, expectedSourceTree, 'Shadow evidence source tree does not match the current guarded Mississippi source implementation.');
  assert.ok(Array.isArray(evidence.runs) && evidence.runs.length >= 3, 'Shadow evidence requires at least three production-runner runs.');
  assert.equal(new Set(evidence.runs.map((run) => run.runId)).size, evidence.runs.length, 'Shadow run IDs must be distinct.');
  assert.equal(verifiedGithubRuns.size, evidence.runs.length, 'Shadow evidence requires verified immutable GitHub workflow provenance for every run.');
  const allowedRuntimeIds = new Set(MISSISSIPPI_RETAILER_SOURCES
    .filter((source) => source.autonomousFetchAllowed !== false)
    .map((source) => source.sourceRuntimeId));
  const registeredRuntimeIds = new Set(MISSISSIPPI_RETAILER_SOURCES.map((source) => source.sourceRuntimeId));
  const starts = [];
  for (const run of evidence.runs) {
    const github = run.github || {};
    const verifiedGithub = verifiedGithubRuns.get(String(github.workflowRunId));
    assert.ok(verifiedGithub, 'Shadow run is missing verified GitHub workflow provenance.');
    assert.equal(verifiedGithub.artifactId, Number(github.artifactId));
    assert.equal(verifiedGithub.artifactDigest, github.artifactDigest);
    assert.equal(verifiedGithub.headSha, github.headSha);
    assert.equal(run.runId, `gha-${github.workflowRunId}-${github.runAttempt}`);
    const trustedEvidence = verifiedGithub.evidence;
    const trustedReport = verifiedGithub.report;
    const startedAt = Date.parse(String(trustedReport.startedAt || trustedEvidence.collector?.startedAt || ''));
    const finishedAt = Date.parse(String(trustedReport.finishedAt || trustedEvidence.collector?.finishedAt || ''));
    assert.ok(Number.isFinite(startedAt) && Number.isFinite(finishedAt) && finishedAt >= startedAt, 'Shadow run timestamps are invalid.');
    starts.push(startedAt);
    assert.equal(trustedEvidence.publication?.productionSnapshotTouched, false);
    assert.equal(trustedEvidence.alerts?.deliveryAttempted, false);
    assert.equal(trustedEvidence.alerts?.candidateRowsExported, false);
    assert.equal(Number(trustedEvidence.metrics?.alertCandidateCount || 0), 0);
    const allSourceResults = trustedReport.sourceResults;
    assert.ok(Array.isArray(allSourceResults));
    const sourceResults = allSourceResults.filter((result) => registeredRuntimeIds.has(result.sourceId));
    assert.equal(sourceResults.length, registeredRuntimeIds.size, 'Shadow source results must contain one result per registered Mississippi source.');
    assert.deepEqual(new Set(sourceResults.map((result) => result.sourceId)), registeredRuntimeIds, 'Shadow source results must cover every registered Mississippi source exactly.');
    for (const result of sourceResults) {
      if (allowedRuntimeIds.has(result.sourceId)) {
        assert.equal(result.status, 'success');
        assert.ok(result.checkedAt && result.lastGoodAt && result.stale !== true && result.quarantined !== true);
      } else {
        assert.equal(result.status, 'source_policy_blocked');
      }
      assert.equal(result.alertable, false);
      assert.equal(result.inventoryAlertable, false);
      assert.equal(result.watchAlertable, false);
    }
    assert.ok(Array.isArray(trustedReport.signals));
    const retailerSignals = trustedReport.signals.filter((signal) => registeredRuntimeIds.has(signal.sourceRuntimeId));
    const liveStoreIds = new Set();
    const liveRegions = new Set();
    for (const signal of retailerSignals) {
      assert.equal(allowedRuntimeIds.has(signal.sourceRuntimeId), true, 'Source-policy-blocked retailers cannot emit shadow inventory rows.');
      assert.equal(isMississippiRetailerInventory(signal), true, 'Shadow retailer signal does not satisfy exact Mississippi inventory identity.');
      assert.equal(signal.canAlertAsInventory, false);
      assert.equal(signal.canAlertAsWatch, false);
      if (signal.storeId) liveStoreIds.add(signal.storeId);
      if (signal.regionId) liveRegions.add(signal.regionId);
    }
    assert.ok(liveStoreIds.size >= 4, 'Sparse Mississippi shadow evidence requires at least four exact stores with current safe inventory rows.');
    assert.ok(liveRegions.size >= 2, 'Sparse Mississippi shadow evidence requires live exact-store rows across at least two reviewed regions.');
    verifyMississippiReleasePolicy({ lifecycle: getStateLifecycle('MS'), signals: trustedReport.signals, alerts: [], phase: 'shadow' });
  }
  const spanMs = Math.max(...starts) - Math.min(...starts);
  assert.ok(spanMs >= 24 * 60 * 60_000 && spanMs <= 72 * 60 * 60_000, 'Shadow evidence must span 24–72 hours.');
  return { runs: evidence.runs.length, spanMs };
}

function verifyMississippiCanaryEvidence() {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const evidence = readJson('../data/canary-evidence/MS.json');
  assert.equal(evidence.contractVersion, 'bourbon-signal/ms-canary-evidence@2');
  assert.equal(evidence.state, 'MS');
  assert.equal(evidence.candidateInput, 'engine/data/canary-inputs/MS.json');
  const inputPath = path.join(root, evidence.candidateInput);
  const inputBytes = readFileSync(inputPath);
  assert.equal(createHash('sha256').update(inputBytes).digest('hex'), evidence.candidateInputSha256);
  const input = JSON.parse(inputBytes.toString('utf8'));
  assert.equal(input.contractVersion, 'bourbon-signal/ms-canary-input@1');
  assert.equal(input.state, 'MS');
  assert.equal(input.generatedAt, evidence.generatedAt);
  const generatedMs = Date.parse(input.generatedAt);
  assert.ok(Number.isFinite(generatedMs));
  assert.equal(input.drops.length, evidence.candidateDropCount);
  assert.equal(new Set(input.drops.map((drop) => drop.storeId)).size, evidence.candidateStoreCount);
  assert.ok(input.drops.length > 0);
  assert.ok(input.drops.every((drop) => {
    const observedMs = Date.parse(String(drop.observedAt || ''));
    return isMississippiRetailerInventory(drop)
      && Number.isFinite(observedMs)
      && observedMs <= generatedMs + 15 * 60_000
      && generatedMs - observedMs <= 4 * 60 * 60_000
      && drop.eligibleForOnSite === true
      && drop.eligibleForDelivery === false
      && drop.canAlertAsInventory === false
      && drop.canAlertAsWatch === false;
  }));

  const outDir = mkdtempSync(path.join(tmpdir(), 'bs-ms-canary-'));
  try {
    execFileSync(process.execPath, [
      path.join(root, 'engine/src/build-state-canary-preview.mjs'),
      '--state=MS',
      `--candidate-drops=${inputPath}`,
      `--site-dir=${path.join(root, 'engine/out/site')}`,
      `--config=${path.join(root, 'src/config/state-lifecycle.json')}`,
      `--out-dir=${outDir}`,
    ], { encoding: 'utf8', cwd: root, maxBuffer: 100 * 1024 * 1024 });
    const policyBytes = readFileSync(path.join(outDir, 'canary-preview-policy.json'));
    assert.equal(createHash('sha256').update(policyBytes).digest('hex'), evidence.previewPolicySha256);
    const policy = JSON.parse(policyBytes.toString('utf8'));
    const stateDrops = JSON.parse(readFileSync(path.join(outDir, 'states/MS/drops.json'), 'utf8'));
    const alerts = JSON.parse(readFileSync(path.join(outDir, 'alerts.json'), 'utf8'));
    const checkedSiteDir = path.join(root, 'engine/data/canary-site/MS');
    const checkedPolicy = JSON.parse(readFileSync(path.join(checkedSiteDir, 'canary-preview-policy.json'), 'utf8'));
    const checkedStateDrops = JSON.parse(readFileSync(path.join(checkedSiteDir, 'states/MS/drops.json'), 'utf8'));
    const checkedDrops = JSON.parse(readFileSync(path.join(checkedSiteDir, 'drops.json'), 'utf8'));
    assert.deepEqual(checkedPolicy, policy);
    assert.deepEqual(checkedStateDrops, stateDrops);
    assert.deepEqual(checkedDrops.drops, stateDrops.drops);
    const stateDeliveryAlerts = (alerts.alerts || []).filter((alert) => String(alert.state || '').toUpperCase() === 'MS' && alert.eligibleForDelivery === true);
    assert.equal(stateDrops.count, evidence.assertions.stateDropCount);
    assert.ok(stateDrops.drops.every((drop) => isMississippiRetailerInventory(drop)));
    assert.equal(stateDeliveryAlerts.length, evidence.assertions.stateDeliveryAlertRows);
    assert.equal(policy.alertDeliveryEnabled, evidence.assertions.alertDeliveryEnabled);
    assert.equal(policy.productionSnapshotPublicationEnabled, evidence.assertions.productionSnapshotPublicationEnabled);
    assert.equal(policy.productionDeploymentEnabled, evidence.assertions.productionDeploymentEnabled);
    assert.equal(evidence.logicalRunsRequired, 2);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
  return evidence;
}

export function verifyMississippiResearchFoundation() {
  const program = readJson('../../src/config/mississippi-program.json');
  const universe = readJson('../data/store-universe/MS.json');
  const atlas = readJson('../data/source-atlas/MS.json');
  const registry = readJson('../data/mississippi-retailer-registry.json');
  const integration = readJson('../data/state-integration/MS.json');
  const fixtures = readJson('../data/state-fixtures/MS.json');
  const candidates = readJson('../data/state-expansion-candidates.json');
  const lifecycle = getStateLifecycle('MS');
  const atlasSummary = validateMississippiSourceAtlas(atlas);

  assert.equal(program.officialDirectory.reviewedCurrentPermitCount, 690);
  assert.equal(program.officialDirectory.reviewedCityCount, 168);
  assert.equal(program.officialDirectory.reviewedCountyCount, 78);
  assert.equal(program.officialDirectory.reviewedPageCount, 7);
  assert.equal(program.officialDirectory.replacementPermitBindings, undefined);
  assert.match(program.officialDirectory.reviewedCaptureRowsSha256, /^[a-f0-9]{64}$/u);
  assert.equal(program.officialDirectory.capturePolicy.status, 'source_policy_blocked');
  assert.equal(program.officialDirectory.capturePolicy.autonomousFetchAllowed, false);
  assert.equal(MISSISSIPPI_TAP_SOURCE_POLICY.autonomousFetchAllowed, false);
  assert.equal(program.regions.length, 9);
  assert.equal(new Set(program.regions.map((region) => region.id)).size, 9);
  assert.equal(program.launchGates.minimumExactLiveInventoryStores, 50);
  assert.equal(program.launchGates.minimumAlertGradeStores, 25);

  assert.equal(universe.reviewedCurrentPermitCount, 690);
  assert.equal(universe.stores.length, 690);
  assert.equal(universe.summary.cityCount, 168);
  assert.equal(universe.summary.countyCount, 78);
  assert.equal(universe.summary.regionCount, 9);
  assert.match(universe.source.responseDigest, /^[a-f0-9]{64}$/u);
  assert.equal(universe.source.pageCount, 7);
  assert.equal(new Set(universe.stores.map((store) => store.id)).size, 690);
  assert.equal(new Set(universe.stores.map((store) => store.permitNumber)).size, 690);
  assert.ok(universe.stores.every((store) => store.id === `ms-permit-${store.permitNumber}`));
  assert.equal(universe.stores.find((store) => store.address.startsWith('605 MIDDLETON RD'))?.permitNumber, '046478');
  assert.equal(universe.stores.find((store) => store.address.startsWith('904 GOODMAN RD W'))?.permitNumber, '029254');
  assert.ok(!universe.stores.some((store) => 'tapPermitNumber' in store || 'permitBindingReason' in store));
  assert.ok(universe.stores.every((store) => program.regions.some((region) => region.id === store.regionId)));
  assert.ok(universe.stores.every((store) => store.inventoryAlertable === false && store.watchAlertable === false));

  assert.deepEqual(atlasSummary, {
    currentStores: 690,
    unresearched: 0,
    finalDispositions: 690,
    inventoryCapable: 6,
    blockedOrOfflineOrProbeOnly: 11,
  });
  assert.equal(atlas.stores.filter((store) => store.disposition === 'directory_only').length, 673);
  assert.equal(atlas.stores.filter((store) => store.disposition === 'blocked_by_source_policy').length, 7);
  assert.equal(atlas.stores.filter((store) => store.disposition === 'source_offline').length, 2);
  assert.equal(atlas.stores.filter((store) => store.disposition === 'platform_probe_only').length, 2);
  assert.ok(atlas.researchMethod.statewideDirectoryReviewed);
  assert.ok(atlas.stores.filter((store) => store.disposition === 'directory_only')
    .every((store) => store.firstPartyDomains.length === 0));

  assert.equal(registry.stores.length, 8);
  assert.deepEqual(new Set(registry.stores.map((store) => store.permitNumber)), new Set(['046478', '040562', '029254', '044692', '044411', '049222', '051851', '007481']));
  assert.deepEqual(registry.stores.filter((store) => store.platform === 'gotoliquorstore').map((store) => ({
    controlStoreId: store.controlStoreId,
    merchantId: store.merchantId,
  })), [
    { controlStoreId: '1031', merchantId: '955132' },
    { controlStoreId: '1069', merchantId: '736142' },
  ]);
  assert.equal(new Set(registry.stores.map((store) => store.sourceRuntimeId)).size, 8);
  assert.deepEqual(new Set(MISSISSIPPI_RETAILER_SOURCES.map((source) => source.sourceRuntimeId)), new Set(registry.stores.map((store) => store.sourceRuntimeId)));

  assert.equal(lifecycle.publicStatus, 'active');
  assert.equal(lifecycle.promotionStage, 'active');
  assert.equal(lifecycle.coverageTier, 'sparse_live_store_inventory');
  assert.equal(lifecycle.shadowEligible, false);
  assert.equal(lifecycle.inventoryAlertable, false);
  assert.equal(lifecycle.watchAlertable, false);
  assert.equal(STATE_LIFECYCLE_CONFIG.activeStates.includes('MS'), true);
  verifyMississippiReleasePolicy({ lifecycle, signals: [], alerts: [], phase: 'sparse' });
  assert.equal(integration.lifecycle.publicStatus, 'active');
  assert.equal(integration.lifecycle.coverageTier, 'sparse_live_store_inventory');
  const immutable = integration.evidence.immutablePromotionEvidence;
  assert.deepEqual(lifecycle.promotionEvidence?.immutableEvidence, immutable);
  assert.equal(immutable.sourceRevisionSha, readJson('../data/shadow-evidence/MS.json').sourceRevisionSha);
  assert.equal(immutable.shadowEvidenceSha256, sha256Relative('../data/shadow-evidence/MS.json'));
  assert.equal(immutable.canaryEvidenceSha256, sha256Relative('../data/canary-evidence/MS.json'));
  assert.equal(immutable.canaryInputSha256, sha256Relative('../data/canary-inputs/MS.json'));
  assert.equal(immutable.verifiedAt, readJson('../data/canary-evidence/MS.json').generatedAt);
  assert.deepEqual(validateStateVerticalSliceManifest(integration), { ok: true, failures: [] });
  assert.equal(integration.evidence.shadow.status, 'reviewed');
  assert.ok(Number(integration.evidence.shadow.runs) >= 3);
  assert.equal(integration.evidence.canary.status, 'reviewed');
  assert.equal(Number(integration.evidence.canary.runs), 2);
  assert.equal(integration.evidence.canary.artifact, 'engine/data/canary-evidence/MS.json');
  assert.equal(integration.evidence.canary.siteArtifact, 'engine/data/canary-site/MS');
  const canary = verifyMississippiCanaryEvidence();
  assert.equal(canary.assertions.stateDropCount, 1);
  assert.equal(fixtures.state, 'MS');
  assert.ok(fixtures.cases.length >= 8);
  assert.deepEqual(validateStateFixtures(fixtures), { ok: true, failures: [] });

  const candidate = candidates.states.find((entry) => entry.state === 'MS');
  assert.equal(candidate.marketClassification, 'mixed');
  assert.equal(candidate.lifecycleStage, 'active');
  assert.equal(candidate.automationPaused, false);
  assert.ok(candidate.sourceClassesSought.includes('exact_store_fulfillment'));
  assert.equal(existsSync(new URL('../data/canary-inputs/MS.json', import.meta.url)), true, 'Mississippi canary input must remain checked in for reproducible verification.');

  return {
    phase: 'research',
    permits: universe.stores.length,
    cities: universe.summary.cityCount,
    counties: universe.summary.countyCount,
    regions: universe.summary.regionCount,
    finalDispositions: atlasSummary.finalDispositions,
    inventorySources: atlasSummary.inventoryCapable,
    blockedOfflineOrProbeOnly: atlasSummary.blockedOrOfflineOrProbeOnly,
  };
}

export function verifyMississippiShadowReadiness() {
  const research = verifyMississippiResearchFoundation();
  const health = readJson('../data/source-health/MS.json');
  const plan = buildMississippiRunPlan();
  assert.equal(plan.partitions.length, 6);
  assert.equal(new Set(plan.partitions.map((partition) => partition.id)).size, 6);
  assert.ok(plan.partitions.every((partition) => partition.sourceScopedLastGood));
  assert.equal(health.lifecycle, 'sparse_live_store_inventory');
  assert.equal(health.inventorySources, 6);
  assert.equal(health.directorySourcePolicyStatus, 'source_policy_blocked');
  assert.equal(health.directoryAutonomousRequestsAllowed, false);
  assert.equal(health.blockedBySourcePolicy, 7);
  assert.equal(health.sourceOffline, 2);
  assert.equal(health.platformProbeOnly, 2);
  assert.equal(health.alertableSources, 0);
  assert.ok(health.entries.every((entry) => entry.healthVisible && entry.alertable === false));
  return {
    ...research,
    phase: 'shadow-readiness',
    shadowReadyPartitions: plan.partitions.length,
    actualShadowRuns: 0,
    productionTouched: false,
    alertsEnabled: false,
  };
}

export function verifyMississippiShadowEvidence() {
  const readiness = verifyMississippiShadowReadiness();
  const integration = readJson('../data/state-integration/MS.json');
  const shadow = integration.evidence?.shadow || {};
  assert.equal(shadow.status, 'reviewed', 'Mississippi shadow verification requires reviewed production-runner evidence.');
  assert.ok(Number(shadow.runs) >= 3, 'Mississippi shadow verification requires at least three distinct production-runner executions.');
  assert.equal(shadow.artifact, 'engine/data/shadow-evidence/MS.json', 'Mississippi shadow evidence must use the canonical guarded artifact path.');
  const artifactUrl = new URL('../data/shadow-evidence/MS.json', import.meta.url);
  assert.equal(existsSync(artifactUrl), true, 'Mississippi shadow evidence artifact is missing.');
  const evidence = JSON.parse(readFileSync(artifactUrl, 'utf8'));
  const verifiedGithubRuns = verifyGithubShadowRunProvenance(evidence);
  const validated = validateMississippiShadowEvidenceArtifact(evidence, { verifiedGithubRuns });
  assert.equal(Number(shadow.runs), validated.runs, 'Mississippi integration manifest run count must match the validated evidence artifact.');
  return {
    ...readiness,
    phase: 'shadow',
    actualShadowRuns: validated.runs,
    shadowSpanMs: validated.spanMs,
    shadowEvidence: shadow.artifact,
  };
}

function runCli() {
  const phase = flag('phase', 'research');
  const result = phase === 'research'
    ? verifyMississippiResearchFoundation()
    : phase === 'shadow-readiness'
      ? verifyMississippiShadowReadiness()
      : phase === 'shadow'
        ? verifyMississippiShadowEvidence()
        : (() => { throw new Error(`Unsupported Mississippi verification phase ${phase}`); })();
  console.log(JSON.stringify({ status: 'ok', ...result }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) runCli();
