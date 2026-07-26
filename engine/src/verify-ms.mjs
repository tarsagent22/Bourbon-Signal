#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildMississippiRunPlan } from './collectors/mississippi-run-plan.mjs';
import { MISSISSIPPI_RETAILER_SOURCES } from './collectors/mississippi-retailer-surfaces.mjs';
import { MISSISSIPPI_TAP_SOURCE_POLICY } from './discovery/mississippi-package-directory.mjs';
import { validateMississippiSourceAtlas } from './discovery/source-atlas.mjs';
import { getStateLifecycle, STATE_LIFECYCLE_CONFIG } from './state-lifecycle.mjs';
import { verifyMississippiReleasePolicy } from './mississippi-release-policy.mjs';
import { validateStateVerticalSliceManifest } from './state-vertical-slice-contract.mjs';
import { validateStateFixtures } from './verify-state-fixtures.mjs';

function readJson(relative) {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'));
}

function flag(name, fallback) {
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function sha256File(relative) {
  return createHash('sha256').update(readFileSync(new URL(relative, import.meta.url))).digest('hex');
}

function currentShadowConfigDigests() {
  return {
    retailerRegistry: sha256File('../data/mississippi-retailer-registry.json'),
    program: sha256File('../../src/config/mississippi-program.json'),
    lifecycle: sha256File('../../src/config/state-lifecycle.json'),
  };
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

function verifyGithubShadowRunProvenance(evidence, expectedCommitSha) {
  const repository = execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], { encoding: 'utf8' }).trim();
  const verified = new Map();
  for (const run of evidence.runs || []) {
    const github = run.github || {};
    assert.equal(github.repository, repository);
    assert.ok(Number.isInteger(Number(github.workflowRunId)) && Number(github.workflowRunId) > 0);
    assert.ok(Number.isInteger(Number(github.artifactId)) && Number(github.artifactId) > 0);
    assert.match(String(github.artifactDigest || ''), /^sha256:[a-f0-9]{64}$/u);
    const workflow = ghApiJson(`repos/${repository}/actions/runs/${github.workflowRunId}`);
    assert.equal(workflow.head_sha, expectedCommitSha, 'Shadow workflow must run against the current commit.');
    assert.equal(workflow.conclusion, 'success');
    assert.ok(['schedule', 'workflow_dispatch'].includes(workflow.event));
    assert.match(String(workflow.path || ''), /^\.github\/workflows\/state-expansion-shadow\.yml@/u);
    assert.equal(Number(workflow.run_attempt), Number(github.runAttempt));
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
      assert.equal(artifactReport.state, 'MS');
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
  expectedCommitSha,
  expectedConfigDigests = currentShadowConfigDigests(),
  verifiedGithubRuns = new Map(),
} = {}) {
  assert.equal(evidence?.contractVersion, 'bourbon-signal/ms-shadow-evidence@1');
  assert.equal(evidence?.state, 'MS');
  assert.match(String(expectedCommitSha || ''), /^[a-f0-9]{40}$/u, 'Shadow verification requires the current full commit SHA.');
  assert.equal(evidence.codeCommitSha, expectedCommitSha, 'Shadow evidence must bind to the current code commit.');
  assert.deepEqual(evidence.configDigests, expectedConfigDigests, 'Shadow evidence config digests do not match the current guarded configuration.');
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
    assert.equal(verifiedGithub.headSha, expectedCommitSha);
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
    const sourceResults = trustedReport.sourceResults;
    assert.ok(Array.isArray(sourceResults));
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
    verifyMississippiReleasePolicy({ lifecycle: getStateLifecycle('MS'), signals: trustedReport.signals, alerts: [], phase: 'shadow' });
  }
  const spanMs = Math.max(...starts) - Math.min(...starts);
  assert.ok(spanMs >= 24 * 60 * 60_000 && spanMs <= 72 * 60 * 60_000, 'Shadow evidence must span 24–72 hours.');
  return { runs: evidence.runs.length, spanMs };
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
    inventoryCapable: 2,
    blockedOrOfflineOrProbeOnly: 12,
  });
  assert.equal(atlas.stores.filter((store) => store.disposition === 'directory_only').length, 676);
  assert.equal(atlas.stores.filter((store) => store.disposition === 'blocked_by_source_policy').length, 8);
  assert.equal(atlas.stores.filter((store) => store.disposition === 'source_offline').length, 2);
  assert.equal(atlas.stores.filter((store) => store.disposition === 'platform_probe_only').length, 2);
  assert.ok(atlas.researchMethod.statewideDirectoryReviewed);
  assert.ok(atlas.stores.filter((store) => store.disposition === 'directory_only')
    .every((store) => store.firstPartyDomains.length === 0));

  assert.equal(registry.stores.length, 4);
  assert.deepEqual(registry.stores.map((store) => store.permitNumber), ['046478', '040562', '029254', '044692']);
  assert.deepEqual(registry.stores.filter((store) => store.platform === 'gotoliquorstore').map((store) => ({
    controlStoreId: store.controlStoreId,
    merchantId: store.merchantId,
  })), [
    { controlStoreId: '1031', merchantId: '955132' },
    { controlStoreId: '1069', merchantId: '736142' },
  ]);
  assert.equal(new Set(registry.stores.map((store) => store.sourceRuntimeId)).size, 4);
  assert.deepEqual(new Set(MISSISSIPPI_RETAILER_SOURCES.map((source) => source.sourceRuntimeId)), new Set(registry.stores.map((store) => store.sourceRuntimeId)));

  assert.equal(lifecycle.publicStatus, 'research_only');
  assert.equal(lifecycle.promotionStage, 'research_only');
  assert.equal(lifecycle.shadowEligible, true);
  assert.equal(lifecycle.inventoryAlertable, false);
  assert.equal(lifecycle.watchAlertable, false);
  assert.equal(STATE_LIFECYCLE_CONFIG.activeStates.includes('MS'), false);
  verifyMississippiReleasePolicy({ lifecycle, signals: [], alerts: [], phase: 'research' });
  assert.equal(integration.lifecycle.publicStatus, 'research_only');
  assert.deepEqual(validateStateVerticalSliceManifest(integration), { ok: true, failures: [] });
  assert.equal(integration.evidence.shadow.status, 'not_run');
  assert.equal(integration.evidence.canary.status, 'not_run');
  assert.equal(fixtures.state, 'MS');
  assert.ok(fixtures.cases.length >= 8);
  assert.deepEqual(validateStateFixtures(fixtures), { ok: true, failures: [] });

  const candidate = candidates.states.find((entry) => entry.state === 'MS');
  assert.equal(candidate.marketClassification, 'mixed');
  assert.equal(candidate.lifecycleStage, 'shadow');
  assert.ok(candidate.sourceClassesSought.includes('exact_store_fulfillment'));
  assert.equal(existsSync(new URL('../data/canary-inputs/MS.json', import.meta.url)), false, 'No untruthful Mississippi canary input may be checked in.');

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
  assert.equal(plan.partitions.length, 2);
  assert.equal(new Set(plan.partitions.map((partition) => partition.id)).size, 2);
  assert.ok(plan.partitions.every((partition) => partition.sourceScopedLastGood));
  assert.equal(health.lifecycle, 'research_only');
  assert.equal(health.inventorySources, 2);
  assert.equal(health.directorySourcePolicyStatus, 'source_policy_blocked');
  assert.equal(health.directoryAutonomousRequestsAllowed, false);
  assert.equal(health.blockedBySourcePolicy, 8);
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
  const expectedCommitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const verifiedGithubRuns = verifyGithubShadowRunProvenance(evidence, expectedCommitSha);
  const validated = validateMississippiShadowEvidenceArtifact(evidence, { expectedCommitSha, verifiedGithubRuns });
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
