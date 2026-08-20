import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const CONTRACT_VERSION = 'bourbon-signal/coverage-expansion-queue@2';
const RESULT_SCHEMA = 'bourbon-signal/coverage-expansion-result@2';
const LEGACY_RESULT_SCHEMA = 'bourbon-signal/coverage-expansion-result@1';
const DEFAULT_BASE_URL = 'https://www.bourbonsignal.com';
const DEFAULT_BOARD = 'bourbon-signal-coverage';
const DEFAULT_PROJECT = 'bourbon-signal';
const DEFAULT_ASSIGNEE = 'default';
const DIRECTIVE = /MEDIA\s*:|\[\[|\]\]|(?:ignore|override|disregard).{0,32}(?:instruction|prompt|rule)/i;

function hermesHome() {
  if (process.env.HERMES_HOME) return process.env.HERMES_HOME;
  return process.platform === 'win32' ? path.join(homedir(), 'AppData', 'Local', 'hermes') : path.join(homedir(), '.hermes');
}

function hostHermesHome() {
  return process.platform === 'win32'
    ? path.join(homedir(), 'AppData', 'Local', 'hermes')
    : path.join(homedir(), '.hermes');
}

function cleanText(value, label, max, pattern) {
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  const normalized = value.replace(/[\u0000-\u001f\u007f\u0085\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > max || DIRECTIVE.test(normalized) || (pattern && !pattern.test(normalized))) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

function strictObject(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} has an invalid shape.`);
  return value;
}

function boundedInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000) throw new Error(`${label} is invalid.`);
  return value;
}

export function normalizeTerminalResult(value) {
  const root = strictObject(value, 'result', [
    'schemaVersion', 'outcome', 'headline', 'productionFingerprint', 'pullRequest', 'ci',
    'refresh', 'metrics', 'canonicalVerification', 'exploration', 'requesterNotification', 'blockerCode', 'limitations',
  ]);
  if (root.schemaVersion !== RESULT_SCHEMA) throw new Error('result schemaVersion is invalid.');
  if (!['improved', 'engine_improved', 'blocked'].includes(root.outcome)) throw new Error('result outcome is invalid.');
  const headline = cleanText(root.headline, 'headline', 240);
  const productionFingerprint = root.productionFingerprint === null ? null : cleanText(root.productionFingerprint, 'productionFingerprint', 240, /^[a-zA-Z0-9:|.,_/@+ -]+$/);
  const pullRequest = root.pullRequest === null ? null : strictObject(root.pullRequest, 'pullRequest', ['number', 'url', 'mergeCommit']);
  if (pullRequest) {
    boundedInteger(pullRequest.number, 'pullRequest.number');
    cleanText(pullRequest.url, 'pullRequest.url', 300, /^https:\/\/github\.com\/tarsagent22\/Bourbon-Signal\/pull\/\d+\/?$/);
    if (new URL(pullRequest.url).pathname.replace(/\/$/, '').split('/').at(-1) !== String(pullRequest.number)) throw new Error('pullRequest URL does not match pullRequest.number.');
    cleanText(pullRequest.mergeCommit, 'pullRequest.mergeCommit', 40, /^[a-f0-9]{40}$/);
  }
  const ci = strictObject(root.ci, 'ci', ['status']);
  if (!['passed', 'not_applicable'].includes(ci.status)) throw new Error('ci.status is invalid.');
  const refresh = root.refresh === null ? null : strictObject(root.refresh, 'refresh', ['runId', 'url', 'artifactDigest']);
  if (refresh) {
    cleanText(refresh.runId, 'refresh.runId', 30, /^\d+$/);
    cleanText(refresh.url, 'refresh.url', 300, /^https:\/\/github\.com\/tarsagent22\/Bourbon-Signal\/actions\/runs\/\d+\/?$/);
    if (new URL(refresh.url).pathname.replace(/\/$/, '').split('/').at(-1) !== refresh.runId) throw new Error('refresh URL does not match refresh.runId.');
    cleanText(refresh.artifactDigest, 'refresh.artifactDigest', 71, /^sha256:[a-f0-9]{64}$/);
  }
  const metricKeys = ['baselineExactStoreRows', 'productionExactStoreRows', 'baselineLiveStores', 'productionLiveStores', 'baselineCustomerCards', 'productionCustomerCards'];
  const metrics = strictObject(root.metrics, 'metrics', metricKeys);
  for (const key of metricKeys) boundedInteger(metrics[key], `metrics.${key}`);
  const canonical = strictObject(root.canonicalVerification, 'canonicalVerification', ['verified', 'url']);
  if (typeof canonical.verified !== 'boolean') throw new Error('canonicalVerification.verified is invalid.');
  if (canonical.url !== null) cleanText(canonical.url, 'canonicalVerification.url', 300, /^https:\/\/www\.bourbonsignal\.com\/(?:api\/(?:drops|stats|coverage)|coverage)(?:\/|\?|$)/);
  if (!Array.isArray(root.limitations) || root.limitations.length > 10) throw new Error('limitations is invalid.');
  const limitations = root.limitations.map((entry, index) => cleanText(entry, `limitations[${index}]`, 240));
  const explorationValue = strictObject(root.exploration, 'exploration', ['sourceCandidates', 'knownSourceUniverseComplete', 'secondPass']);
  if (!Array.isArray(explorationValue.sourceCandidates) || explorationValue.sourceCandidates.length > 50) throw new Error('exploration.sourceCandidates is invalid.');
  const sourceCandidates = explorationValue.sourceCandidates.map((entry, index) => {
    const candidate = strictObject(entry, `exploration.sourceCandidates[${index}]`, ['sourceId', 'sourceClass', 'outcome', 'reasonCode']);
    const sourceClass = cleanText(candidate.sourceClass, `exploration.sourceCandidates[${index}].sourceClass`, 32, /^(first_party|delegated_marketplace|official_directory|other_public)$/);
    const candidateOutcome = cleanText(candidate.outcome, `exploration.sourceCandidates[${index}].outcome`, 32, /^(adopted|viable_not_adopted|rejected|blocked)$/);
    return {
      sourceId: cleanText(candidate.sourceId, `exploration.sourceCandidates[${index}].sourceId`, 80, /^[a-z0-9][a-z0-9:-]*$/),
      sourceClass,
      outcome: candidateOutcome,
      reasonCode: cleanText(candidate.reasonCode, `exploration.sourceCandidates[${index}].reasonCode`, 80, /^[a-z0-9][a-z0-9_-]*$/),
    };
  });
  if (new Set(sourceCandidates.map((candidate) => candidate.sourceId)).size !== sourceCandidates.length) throw new Error('exploration.sourceCandidates contains duplicate source identities.');
  if (typeof explorationValue.knownSourceUniverseComplete !== 'boolean') throw new Error('exploration.knownSourceUniverseComplete is invalid.');
  if (!['not_required', 'completed'].includes(explorationValue.secondPass)) throw new Error('exploration.secondPass is invalid.');
  const exploration = {
    sourceCandidates,
    knownSourceUniverseComplete: explorationValue.knownSourceUniverseComplete,
    secondPass: explorationValue.secondPass,
  };
  const requesterNotificationValue = strictObject(root.requesterNotification, 'requesterNotification', ['ready', 'reasonCode']);
  if (typeof requesterNotificationValue.ready !== 'boolean') throw new Error('requesterNotification.ready is invalid.');
  const requesterNotification = {
    ready: requesterNotificationValue.ready,
    reasonCode: cleanText(requesterNotificationValue.reasonCode, 'requesterNotification.reasonCode', 80, /^[a-z0-9][a-z0-9_-]*$/),
  };
  const blockerCode = root.blockerCode === null ? null : cleanText(root.blockerCode, 'blockerCode', 80, /^[a-z0-9_-]+$/);
  if (root.outcome !== 'blocked' && blockerCode !== null) throw new Error('non-blocked results must not contain blockerCode.');
  if (root.outcome === 'improved') {
    const materialTargetGain = metrics.productionExactStoreRows > metrics.baselineExactStoreRows
      || metrics.productionLiveStores > metrics.baselineLiveStores;
    if (!pullRequest || ci.status !== 'passed' || !refresh || !canonical.verified || !canonical.url || !productionFingerprint || !materialTargetGain) {
      throw new Error('improved result lacks production proof or a material target-level gain in exact-store rows or live stores.');
    }
    if (!exploration.knownSourceUniverseComplete) throw new Error('improved result lacks a complete known-source universe audit.');
    if (!sourceCandidates.some((candidate) => candidate.outcome === 'adopted')) throw new Error('improved result lacks adopted-source evidence.');
    if (metrics.productionLiveStores <= 1 && exploration.secondPass !== 'completed') throw new Error('sparse improved result lacks a second discovery pass.');
  }
  if (root.outcome === 'engine_improved' && (!pullRequest || ci.status !== 'passed' || !refresh || !canonical.verified || !canonical.url)) {
    throw new Error('engine_improved result lacks production proof.');
  }
  const trustedAutomationFailure = blockerCode === 'automation_terminal_contract_failure' || blockerCode === 'automation_task_missing';
  if (root.outcome === 'blocked' && (!blockerCode
    || (!trustedAutomationFailure && (sourceCandidates.length < 1 || !exploration.knownSourceUniverseComplete))
    || ci.status !== 'not_applicable')) {
    throw new Error('blocked result requires a complete applicable source-universe audit.');
  }
  const materialTargetGain = metrics.productionExactStoreRows > metrics.baselineExactStoreRows
    || metrics.productionLiveStores > metrics.baselineLiveStores;
  const customerPathImproved = metrics.productionCustomerCards > metrics.baselineCustomerCards;
  const sparseSecondPassComplete = metrics.productionLiveStores > 1 || exploration.secondPass === 'completed';
  const expectedNotificationReady = Boolean(root.outcome === 'improved'
    && materialTargetGain
    && customerPathImproved
    && exploration.knownSourceUniverseComplete
    && sparseSecondPassComplete
    && canonical.verified
    && canonical.url
    && refresh
    && pullRequest
    && ci.status === 'passed');
  if (requesterNotification.ready !== expectedNotificationReady) throw new Error('requesterNotification.ready does not match production and exploration evidence.');
  const expectedNotificationReason = expectedNotificationReady
    ? 'production_verified_material_gain'
    : trustedAutomationFailure
      ? 'automation_failure'
      : root.outcome === 'blocked'
        ? 'blocked'
        : root.outcome === 'engine_improved'
          ? 'engine_only'
          : !materialTargetGain
            ? 'material_gain_missing'
            : !customerPathImproved
              ? 'customer_path_not_improved'
              : !exploration.knownSourceUniverseComplete
                ? 'source_universe_incomplete'
                : !sparseSecondPassComplete
                  ? 'second_pass_required'
                  : 'production_proof_incomplete';
  if (requesterNotification.reasonCode !== expectedNotificationReason) throw new Error('requesterNotification.reasonCode does not match the terminal evidence.');
  return { ...root, headline, productionFingerprint, limitations, exploration, requesterNotification, blockerCode };
}

function normalizeLegacyTerminalResult(value) {
  const root = strictObject(value, 'legacy result', [
    'schemaVersion', 'outcome', 'headline', 'productionFingerprint', 'pullRequest', 'ci',
    'refresh', 'metrics', 'canonicalVerification', 'sourcesReviewed', 'blockerCode', 'limitations',
  ]);
  if (root.schemaVersion !== LEGACY_RESULT_SCHEMA) throw new Error('legacy result schemaVersion is invalid.');
  if (!['improved', 'engine_improved', 'blocked'].includes(root.outcome)) throw new Error('legacy result outcome is invalid.');
  const headline = cleanText(root.headline, 'legacy headline', 240);
  const productionFingerprint = root.productionFingerprint === null ? null : cleanText(root.productionFingerprint, 'legacy productionFingerprint', 240, /^[a-zA-Z0-9:|.,_/@+ -]+$/);
  const pullRequest = root.pullRequest === null ? null : strictObject(root.pullRequest, 'legacy pullRequest', ['number', 'url', 'mergeCommit']);
  if (pullRequest) {
    boundedInteger(pullRequest.number, 'legacy pullRequest.number');
    cleanText(pullRequest.url, 'legacy pullRequest.url', 300, /^https:\/\/github\.com\/tarsagent22\/Bourbon-Signal\/pull\/\d+\/?$/);
    if (new URL(pullRequest.url).pathname.replace(/\/$/, '').split('/').at(-1) !== String(pullRequest.number)) throw new Error('legacy pullRequest URL does not match its number.');
    cleanText(pullRequest.mergeCommit, 'legacy pullRequest.mergeCommit', 40, /^[a-f0-9]{40}$/);
  }
  const ci = strictObject(root.ci, 'legacy ci', ['status']);
  if (!['passed', 'not_applicable'].includes(ci.status)) throw new Error('legacy ci.status is invalid.');
  const refresh = root.refresh === null ? null : strictObject(root.refresh, 'legacy refresh', ['runId', 'url', 'artifactDigest']);
  if (refresh) {
    cleanText(refresh.runId, 'legacy refresh.runId', 30, /^\d+$/);
    cleanText(refresh.url, 'legacy refresh.url', 300, /^https:\/\/github\.com\/tarsagent22\/Bourbon-Signal\/actions\/runs\/\d+\/?$/);
    if (new URL(refresh.url).pathname.replace(/\/$/, '').split('/').at(-1) !== refresh.runId) throw new Error('legacy refresh URL does not match its run id.');
    cleanText(refresh.artifactDigest, 'legacy refresh.artifactDigest', 71, /^sha256:[a-f0-9]{64}$/);
  }
  const metricKeys = ['baselineExactStoreRows', 'productionExactStoreRows', 'baselineLiveStores', 'productionLiveStores', 'baselineCustomerCards', 'productionCustomerCards'];
  const metrics = strictObject(root.metrics, 'legacy metrics', metricKeys);
  for (const key of metricKeys) boundedInteger(metrics[key], `legacy metrics.${key}`);
  const canonical = strictObject(root.canonicalVerification, 'legacy canonicalVerification', ['verified', 'url']);
  if (typeof canonical.verified !== 'boolean') throw new Error('legacy canonicalVerification.verified is invalid.');
  if (canonical.url !== null) cleanText(canonical.url, 'legacy canonicalVerification.url', 300, /^https:\/\/www\.bourbonsignal\.com\/(?:api\/(?:drops|stats|coverage)|coverage)(?:\/|\?|$)/);
  if (!Array.isArray(root.limitations) || root.limitations.length > 10) throw new Error('legacy limitations is invalid.');
  const limitations = root.limitations.map((entry, index) => cleanText(entry, `legacy limitations[${index}]`, 240));
  const sourcesReviewed = boundedInteger(root.sourcesReviewed, 'legacy sourcesReviewed');
  const blockerCode = root.blockerCode === null ? null : cleanText(root.blockerCode, 'legacy blockerCode', 80, /^[a-z0-9_-]+$/);
  const gain = metrics.productionExactStoreRows > metrics.baselineExactStoreRows
    || metrics.productionLiveStores > metrics.baselineLiveStores
    || metrics.productionCustomerCards > metrics.baselineCustomerCards;
  if (root.outcome === 'improved' && (!pullRequest || ci.status !== 'passed' || !refresh || !canonical.verified || !canonical.url || !productionFingerprint || !gain)) {
    throw new Error('legacy improved result lacks production proof or a measured gain.');
  }
  if (root.outcome === 'engine_improved' && (!pullRequest || ci.status !== 'passed' || !refresh || !canonical.verified || !canonical.url)) {
    throw new Error('legacy engine_improved result lacks production proof.');
  }
  const trustedAutomationFailure = blockerCode === 'automation_terminal_contract_failure' || blockerCode === 'automation_task_missing';
  if (root.outcome === 'blocked' && (!blockerCode || (!trustedAutomationFailure && sourcesReviewed < 1) || ci.status !== 'not_applicable')) {
    throw new Error('legacy blocked result lacks applicable blocker evidence.');
  }
  return { ...root, headline, productionFingerprint, limitations, sourcesReviewed, blockerCode };
}

export function normalizeTaskTerminalResult(value) {
  if (value?.schemaVersion !== LEGACY_RESULT_SCHEMA) return normalizeTerminalResult(value);
  const legacy = normalizeLegacyTerminalResult(value);
  const trustedAutomationFailure = legacy.blockerCode === 'automation_terminal_contract_failure' || legacy.blockerCode === 'automation_task_missing';
  const migrated = {
    schemaVersion: RESULT_SCHEMA,
    outcome: legacy.outcome === 'improved' ? 'engine_improved' : legacy.outcome,
    headline: legacy.headline,
    productionFingerprint: legacy.productionFingerprint,
    pullRequest: legacy.pullRequest,
    ci: legacy.ci,
    refresh: legacy.refresh,
    metrics: legacy.metrics,
    canonicalVerification: legacy.canonicalVerification,
    exploration: {
      sourceCandidates: Array.from({ length: Math.min(legacy.sourcesReviewed, 50) }, (_, index) => ({
        sourceId: `legacy-source-${index + 1}`,
        sourceClass: 'other_public',
        outcome: 'rejected',
        reasonCode: 'legacy_contract_unclassified',
      })),
      knownSourceUniverseComplete: false,
      secondPass: 'not_required',
    },
    requesterNotification: {
      ready: false,
      reasonCode: trustedAutomationFailure ? 'automation_failure' : legacy.outcome === 'blocked' ? 'blocked' : 'engine_only',
    },
    blockerCode: legacy.blockerCode,
    limitations: [...legacy.limitations, 'Legacy task result was conservatively migrated; requester notification remains gated.'].slice(0, 10),
  };
  const normalized = normalizeTerminalResult({
    ...migrated,
    exploration: { ...migrated.exploration, knownSourceUniverseComplete: true },
  });
  return { ...normalized, exploration: migrated.exploration };
}

export function normalizeJob(value, { includeResult = false } = {}) {
  const keys = ['jobKey', 'coverageRequestId', 'requestVersion', 'targetType', 'stateCode', 'areaKey', 'storeId', 'canonicalTargetKey', 'baselineCoverageFingerprint', 'status', 'taskId'];
  if (includeResult) keys.push('terminalResult', 'deliveryUncertain');
  const job = strictObject(value, 'job', keys);
  const normalized = {
    jobKey: cleanText(job.jobKey, 'jobKey', 340, /^[a-zA-Z0-9:|._/@+-]+$/),
    coverageRequestId: cleanText(job.coverageRequestId, 'coverageRequestId', 80, /^[a-f0-9-]+$/),
    requestVersion: cleanText(job.requestVersion, 'requestVersion', 40, /^[0-9T:.-]+Z$/),
    targetType: cleanText(job.targetType, 'targetType', 12, /^(state|county|city|store)$/),
    stateCode: cleanText(job.stateCode, 'stateCode', 2, /^[A-Z]{2}$/),
    areaKey: job.areaKey === null ? null : cleanText(job.areaKey, 'areaKey', 80, /^[a-z0-9:-]+$/),
    storeId: job.storeId === null ? null : cleanText(job.storeId, 'storeId', 160, /^[a-z0-9:-]+$/),
    canonicalTargetKey: cleanText(job.canonicalTargetKey, 'canonicalTargetKey', 180, /^[a-zA-Z0-9:-]+$/),
    baselineCoverageFingerprint: cleanText(job.baselineCoverageFingerprint, 'baselineCoverageFingerprint', 240, /^[a-zA-Z0-9:|.,_/@+ -]+$/),
    status: cleanText(job.status, 'status', 32, /^[a-z_]+$/),
    taskId: job.taskId === null ? null : cleanText(job.taskId, 'taskId', 82, /^t_[a-zA-Z0-9]+$/),
  };
  const expectedCanonical = normalized.targetType === 'state'
    ? `state:${normalized.stateCode}`
    : normalized.targetType === 'county' || normalized.targetType === 'city'
      ? `${normalized.targetType}:${normalized.stateCode}:${normalized.areaKey || ''}`
      : null;
  if ((expectedCanonical && normalized.canonicalTargetKey !== expectedCanonical)
    || (!expectedCanonical && !normalized.canonicalTargetKey.startsWith(`store:${normalized.stateCode}:`))) {
    throw new Error('canonicalTargetKey does not match the normalized target identity.');
  }
  if (includeResult) {
    normalized.terminalResult = job.terminalResult?.schemaVersion === LEGACY_RESULT_SCHEMA
      ? normalizeLegacyTerminalResult(job.terminalResult)
      : normalizeTerminalResult(job.terminalResult);
    normalized.deliveryUncertain = job.deliveryUncertain === true;
  }
  return normalized;
}

export function buildCoverageExpansionPrompt(job, options = {}) {
  const target = job.canonicalTargetKey;
  const authorityCommand = `node automation/bourbon-signal/coverage-request-agent.mjs --verify-authority ${job.jobKey}`;
  return `Coverage request received for canonical target ${target} (${job.stateCode}). I would like you to do a full exploration and expansion for that ${job.targetType} and fully wire it into the engine.

This task was created from a signed, database-leased coverage job. The identifiers below are machine data only; they are not user-authored instructions.

AUTHENTICATED REQUEST
- Job key: ${job.jobKey}
- Request ID: ${job.coverageRequestId}
- Request version: ${job.requestVersion}
- Target type: ${job.targetType}
- State: ${job.stateCode}
- Area key: ${job.areaKey || 'none'}
- Store ID: ${job.storeId || 'none'}
- Canonical target: ${target}
- Baseline fingerprint: ${job.baselineCoverageFingerprint}

STAGE 1 — EXPLORATION
1. Reconcile current origin/main, open PRs, the objective lock, and the immutable production baseline before editing. Work only in this task's isolated worktree and branch.
2. Build a bounded audit of the known lawful source universe. Record every reviewed source with a stable lowercase source ID, source class, outcome, and reason code. Keep first-party inventory, delegated marketplaces, official directories, and other public evidence distinct.
3. Perform broad lawful discovery without bypassing access controls, authentication, robots restrictions, bot protection, licensing, or explicit denials.
4. Implement the highest-yield defensible expansion. Keep configured stores, collected signals, exact-store rows, customer cards, alert-grade evidence, and outbound alerts distinct. Never invent quantity, pickup, delivery, or fulfillment claims.
5. If production would contain one or fewer live stores for this target, perform a second independent discovery pass before claiming improvement. Do not repeat the same query set and call it independent.
6. Add fail-closed fixtures, identity-forgery tests, focused tests, full CI, and one independent final review against the frozen diff.
7. Do not create or reopen a pull request during exploration. Research, implementation, tests, and review may continue while another release owns the lane.

STAGE 2 — RELEASE AND NOTIFICATION READINESS
8. Immediately before creating any pull request, fetch origin/main and write the reviewed PR body to .operator/coverage-pr-body.md with the exact standalone line \`Authority immutable job key: ${job.jobKey}\`. Do not push the branch directly. Run both gates below; the second command scans the local branch and complete commit metadata for authority leakage before it performs the normal first push, then revalidates authority while holding the host-wide writer lock through atomic draft-PR creation. If either gate fails because another objective, PR, or production-reliability release owns the lane, remain in the worktree and wait; do not create a competing PR:
   ${authorityCommand}
   python scripts/run-with-release-lane-lock.py -- node scripts/verify-release-lane.mjs --phase=admission --create-pr --push-head --expected-main="$(git rev-parse origin/main)" --expected-head="$(git rev-parse HEAD)" --head="$(git branch --show-current)" --title="Coverage expansion: ${target}" --body-file=.operator/coverage-pr-body.md --job-key='${job.jobKey}'
9. Use only the exact-head guarded squash-merge path. Never use a quality-regression override. After PR creation, never rebase or rewrite the published branch. If main advances, fetch it and merge origin/main into this branch without rewriting history, push normally, update only this task's existing sole draft PR, then rerun ${authorityCommand}, required checks, independent review, and the guarded merge at the new exact head; do not rerun empty-lane admission or recreate the PR.
10. A merge is not completion. Run the targeted production refresh, download and hash the immutable artifact, verify canonical production and the customer path, and prove the published snapshot contains the reviewed gain.
11. Mark requesterNotification.ready true only for a production-verified material target-level gain in exact-store rows or live stores, a customer-card gain, a complete known-source audit, and the required second pass for sparse results. Cards-only or engine-only work is not requester-notification-ready.
12. If no lawful source can satisfy the trust contract, finish as blocked with precise evidence; do not manufacture a successful expansion.

TERMINAL RESULT CONTRACT
Your final task result must be ONLY one JSON object with schemaVersion ${RESULT_SCHEMA}. It must contain exactly:
- schemaVersion
- outcome: improved, engine_improved, or blocked
- headline: plain text, no Markdown or Hermes directives
- productionFingerprint: string for improved, otherwise null when unavailable
- pullRequest: {number,url,mergeCommit} or null
- ci: {status: passed or not_applicable}
- refresh: {runId,url,artifactDigest} or null
- metrics: {baselineExactStoreRows,productionExactStoreRows,baselineLiveStores,productionLiveStores,baselineCustomerCards,productionCustomerCards}
- canonicalVerification: {verified,url}
- exploration: {sourceCandidates:[{sourceId,sourceClass,outcome,reasonCode}],knownSourceUniverseComplete,secondPass}
- requesterNotification: {ready,reasonCode}
- blockerCode: lowercase code for blocked, otherwise null
- limitations: array of plain-text caveats

Allowed sourceClass values: first_party, delegated_marketplace, official_directory, other_public.
Allowed source-candidate outcomes: adopted, viable_not_adopted, rejected, blocked.
Allowed secondPass values: not_required, completed.
requesterNotification.reasonCode is exhaustive, not free text: use production_verified_material_gain exactly when an improved result is ready; customer_path_not_improved for a production-proved improved result whose customer-card count did not increase; engine_only for engine_improved; blocked for a task-produced blocked result. automation_failure is reserved for trusted worker-generated failures. Do not emit any other reasonCode.

Do not send any requester or Engine Ops message yourself. The trusted outbox monitor validates this structured result and sends only the internal terminal message after the database transition succeeds. Requester contact remains a separate owner-approved action.

Configured Engine Ops target: ${options.engineOpsLabel || 'Engine Ops'}.`;
}

export function buildEngineOpsMessage(job, result) {
  const header = result.outcome === 'blocked' ? '⚠️ Coverage expansion blocked' : result.outcome === 'improved' ? '✅ Coverage expansion live' : '✅ Coverage engine improvement live';
  const lines = [
    `${header}: ${job.canonicalTargetKey} (${job.stateCode})`,
    `Request: ${job.coverageRequestId}`,
    `Task: ${job.taskId}`,
    `Result: ${result.headline}`,
    `Sources reviewed: ${result.exploration ? result.exploration.sourceCandidates.length : result.sourcesReviewed}`,
    ...(result.exploration ? [
      `Known-source audit: ${result.exploration.knownSourceUniverseComplete ? 'complete' : 'incomplete'} · second pass: ${result.exploration.secondPass}`,
      `Requester notification: ${result.requesterNotification.ready ? 'ready' : `not ready (${result.requesterNotification.reasonCode})`}`,
    ] : ['Requester notification: not ready (legacy terminal contract)']),
  ];
  if (result.pullRequest) lines.push(`PR: #${result.pullRequest.number} · ${result.pullRequest.url}`, `Merge: ${result.pullRequest.mergeCommit}`);
  if (result.refresh) lines.push(`Refresh: ${result.refresh.runId} · ${result.refresh.url}`, `Artifact: ${result.refresh.artifactDigest}`);
  lines.push(
    `Exact-store rows: ${result.metrics.baselineExactStoreRows} → ${result.metrics.productionExactStoreRows}`,
    `Live stores: ${result.metrics.baselineLiveStores} → ${result.metrics.productionLiveStores}`,
    `Customer cards: ${result.metrics.baselineCustomerCards} → ${result.metrics.productionCustomerCards}`,
    `Canonical production: ${result.canonicalVerification.verified ? 'verified' : 'not verified'}${result.canonicalVerification.url ? ` · ${result.canonicalVerification.url}` : ''}`,
  );
  if (result.blockerCode) lines.push(`Blocker: ${result.blockerCode}`);
  for (const limitation of result.limitations) lines.push(`• ${limitation}`);
  return lines.join('\n');
}

function runHermes(args, timeout = 90_000) {
  const command = process.env.HERMES_COMMAND || 'hermes';
  const result = spawnSync(command, args, { encoding: 'utf8', timeout, windowsHide: true, shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`hermes ${args.slice(0, 3).join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`);
  return result.stdout.trim();
}

function parseJson(text, label) {
  try { return JSON.parse(text); } catch { throw new Error(`${label} did not return JSON.`); }
}

function runtimeConfigPath() {
  return process.env.BOURBON_SIGNAL_COVERAGE_AUTOMATION_CONFIG
    || path.join(hermesHome(), 'automation', 'coverage-request-agent-config.json');
}

function authorityCapabilityPath(jobKey) {
  const suffix = createHash('sha256').update(jobKey).digest('hex');
  return path.join(hostHermesHome(), 'automation', 'coverage-authority', `${suffix}.json`);
}

async function writeAuthorityRecord(target, record) {
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temporary, target);
  } finally {
    try { await unlink(temporary); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
}

export async function persistAuthorityCapability(jobKey, authorityCapability) {
  const normalizedCapability = cleanText(authorityCapability, 'authorityCapability', 43, /^[a-zA-Z0-9_-]{43}$/);
  const target = authorityCapabilityPath(jobKey);
  await mkdir(path.dirname(target), { recursive: true });
  try {
    const existing = normalizeAuthorityRecord(parseJson(await readFile(target, 'utf8'), 'Authority capability file'));
    if (existing.jobKey !== jobKey || existing.authorityCapability !== normalizedCapability) {
      throw new Error('Existing authority capability conflicts with the claimed job.');
    }
    return existing;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const created = { jobKey, authorityCapability: normalizedCapability, taskId: null };
  await writeAuthorityRecord(target, created);
  return created;
}

function normalizeAuthorityRecord(value) {
  const keys = Object.prototype.hasOwnProperty.call(value || {}, 'taskId')
    ? ['jobKey', 'authorityCapability', 'taskId']
    : ['jobKey', 'authorityCapability'];
  const record = strictObject(value, 'authority capability file', keys);
  const jobKey = cleanText(record.jobKey, 'authority jobKey', 340, /^[a-zA-Z0-9:|._/@+-]+$/);
  const authorityCapability = cleanText(record.authorityCapability, 'authorityCapability', 43, /^[a-zA-Z0-9_-]{43}$/);
  const taskId = record.taskId == null ? null : cleanText(record.taskId, 'authority taskId', 82, /^t_[a-zA-Z0-9]+$/);
  return { jobKey, authorityCapability, taskId };
}

export async function bindAuthorityCapability(jobKey, taskId) {
  const target = authorityCapabilityPath(jobKey);
  const record = normalizeAuthorityRecord(parseJson(await readFile(target, 'utf8'), 'Authority capability file'));
  if (record.jobKey !== jobKey) throw new Error('Authority capability file is bound to the wrong job.');
  const boundTaskId = cleanText(taskId, 'taskId', 82, /^t_[a-zA-Z0-9]+$/);
  if (record.taskId && record.taskId !== boundTaskId) throw new Error('Authority capability file is bound to a different task.');
  await writeAuthorityRecord(target, { ...record, taskId: boundTaskId });
}

async function loadAuthorityCapability(jobKey) {
  const value = parseJson(await readFile(authorityCapabilityPath(jobKey), 'utf8'), 'Authority capability file');
  const record = normalizeAuthorityRecord(value);
  if (record.jobKey !== jobKey) throw new Error('Authority capability file is bound to the wrong job.');
  return record.authorityCapability;
}

export async function persistVerifiedAuthorityCapability(jobKey, taskId, suppliedAuthorityCapability = null) {
  if (suppliedAuthorityCapability !== null) {
    const supplied = cleanText(suppliedAuthorityCapability, 'authorityCapability', 43, /^[a-zA-Z0-9_-]{43}$/);
    try {
      const existing = await loadAuthorityCapability(jobKey);
      if (existing !== supplied) throw new Error('Supplied authority capability conflicts with the protected record.');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      await persistAuthorityCapability(jobKey, supplied);
    }
  }
  await bindAuthorityCapability(jobKey, taskId);
}

async function removeAuthorityCapability(jobKey) {
  try {
    await unlink(authorityCapabilityPath(jobKey));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

export async function assertAuthorityCapabilityAbsent(jobKey, values, { allowMissing = false } = {}) {
  let authorityCapability;
  try {
    authorityCapability = await loadAuthorityCapability(jobKey);
  } catch (error) {
    if (allowMissing && error?.code === 'ENOENT') return;
    throw error;
  }
  const haystack = Array.isArray(values) ? values.map((value) => String(value || '')) : [String(values || '')];
  if (haystack.some((value) => value.includes(authorityCapability))) {
    throw new Error('Authority capability must not appear in public release metadata.');
  }
}

export async function assertAuthorityCapabilityAbsentFromGit(jobKey, { baseSha, headSha, headRef, cwd = process.cwd() }) {
  const base = cleanText(baseSha, 'baseSha', 40, /^[a-f0-9]{40}$/);
  const head = cleanText(headSha, 'headSha', 40, /^[a-f0-9]{40}$/);
  const ref = cleanText(headRef, 'headRef', 160, /^[A-Za-z0-9._/-]+$/);
  const authorityCapability = await loadAuthorityCapability(jobKey);
  if (ref.includes(authorityCapability)) throw new Error('Authority capability must not appear in the public branch name.');
  const messages = spawnSync('git', ['log', '--format=%B%x00%an%x00%ae%x00%cn%x00%ce', `${base}..${head}`], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (messages.status !== 0) throw new Error('Unable to inspect release commit messages for authority leakage.');
  if (String(messages.stdout || '').includes(authorityCapability)) throw new Error('Authority capability must not appear in public commit messages or identities.');
  const revisions = spawnSync('git', ['rev-list', '--reverse', `${base}..${head}`], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (revisions.status !== 0) throw new Error('Unable to enumerate release history for authority leakage.');
  const commits = String(revisions.stdout || '').split(/\r?\n/).filter(Boolean);
  if (commits.length > 200) throw new Error('Release history is too large for bounded authority leakage inspection.');
  for (const commit of commits) {
    const names = spawnSync('git', ['ls-tree', '-r', '--name-only', '-z', commit], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (names.status !== 0) throw new Error('Unable to inspect tracked release paths for authority leakage.');
    if (String(names.stdout || '').includes(authorityCapability)) throw new Error('Authority capability must not appear in tracked release paths.');
    const tracked = spawnSync('git', ['grep', '-F', '--full-name', '-e', authorityCapability, commit, '--', '.'], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (tracked.status === 0) throw new Error('Authority capability must not appear in tracked release content or history.');
    if (tracked.status !== 1) throw new Error('Unable to inspect tracked release history for authority leakage.');
  }
}

async function loadRuntimeConfig() {
  const raw = parseJson(await readFile(runtimeConfigPath(), 'utf8'), 'Coverage automation config');
  const config = strictObject(raw, 'config', ['baseUrl', 'claimSecret', 'outcomeSecret', 'engineOpsTarget', 'board', 'project', 'assignee']);
  const baseUrl = cleanText(config.baseUrl, 'baseUrl', 100, /^https:\/\/www\.bourbonsignal\.com$/);
  return {
    baseUrl,
    claimSecret: cleanText(config.claimSecret, 'claimSecret', 200, /^[a-zA-Z0-9_-]{32,200}$/),
    outcomeSecret: cleanText(config.outcomeSecret, 'outcomeSecret', 200, /^[a-zA-Z0-9_-]{32,200}$/),
    engineOpsTarget: cleanText(config.engineOpsTarget, 'engineOpsTarget', 160, /^(?:telegram|discord|slack):[a-zA-Z0-9:#_-]+$/),
    board: cleanText(config.board, 'board', 80, /^[a-z0-9-]+$/),
    project: cleanText(config.project, 'project', 80, /^[a-z0-9-]+$/),
    assignee: cleanText(config.assignee, 'assignee', 80, /^[a-zA-Z0-9_-]+$/),
  };
}

async function post(config, secret, payload, { allowConflict = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers.Authorization = `Bearer ${secret}`;
  const response = await fetch(`${config.baseUrl}/api/ops/coverage-expansion-queue`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ resultSchemaVersion: RESULT_SCHEMA, ...payload }),
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (Buffer.byteLength(text) > 1_000_000) throw new Error('Coverage automation response is oversized.');
  const parsed = parseJson(text, 'Coverage automation API');
  if (!response.ok && !(allowConflict && response.status === 409)) throw new Error(`Coverage automation API ${payload.action} returned HTTP ${response.status}: ${parsed.error || 'unknown error'}`);
  if (parsed.contractVersion && parsed.contractVersion !== CONTRACT_VERSION) throw new Error('Coverage automation API contract mismatch.');
  return { status: response.status, payload: parsed };
}

async function createTask(config, job, authorityCapability) {
  const suffix = createHash('sha256').update(job.jobKey).digest('hex').slice(0, 12);
  const branch = `coverage/${job.stateCode.toLowerCase()}-${suffix}`;
  await persistAuthorityCapability(job.jobKey, authorityCapability);
  const body = buildCoverageExpansionPrompt(job);
  const output = runHermes([
    'kanban', '--board', config.board, 'create', `Coverage expansion: ${job.canonicalTargetKey}`,
    '--body', body, '--assignee', config.assignee, '--project', config.project,
    '--workspace', 'worktree', '--branch', branch, '--priority', '100',
    '--idempotency-key', job.jobKey, '--max-runtime', '8h', '--max-retries', '3',
    '--created-by', 'coverage-request-automation', '--skill', 'bourbon-signal-product-engineering',
    '--skill', 'vercel-production-release-safety', '--goal', '--goal-max-turns', '50', '--json',
  ]);
  const parsed = parseJson(output, 'Kanban create');
  const taskId = String(parsed.id || parsed.task?.id || '');
  if (!/^t_[a-zA-Z0-9]+$/.test(taskId)) throw new Error('Kanban create did not return a valid task id.');
  await bindAuthorityCapability(job.jobKey, taskId);
  return taskId;
}

function readTask(config, taskId) {
  const parsed = parseJson(runHermes(['kanban', '--board', config.board, 'show', taskId, '--json']), 'Kanban show');
  if (!parsed.task || parsed.task.id !== taskId) throw new Error('Kanban show returned the wrong task.');
  return parsed.task;
}

function platformMessageId(sendPayload) {
  const id = sendPayload.message_id || sendPayload.messageId || sendPayload.result?.message_id;
  if (id === undefined || id === null || !/^[a-zA-Z0-9:_-]{1,120}$/.test(String(id))) throw new Error('Engine Ops delivery succeeded without a verifiable platform message id.');
  return String(id);
}

async function acquireLock() {
  const directory = path.join(hermesHome(), 'automation');
  const lockPath = path.join(directory, 'coverage-request-agent.lock');
  await mkdir(directory, { recursive: true });
  try {
    const handle = await open(lockPath, 'wx', 0o600);
    await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`);
    await handle.close();
    return async () => { try { await unlink(lockPath); } catch {} };
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const details = await stat(lockPath);
    if (Date.now() - details.mtimeMs <= 10 * 60_000) return null;
    await unlink(lockPath);
    return acquireLock();
  }
}

async function deliverPendingNotification(config) {
  const claimed = await post(config, config.outcomeSecret, { action: 'claim_notification' }, { allowConflict: true });
  if (claimed.status === 409) throw new Error('A prior Engine Ops delivery has an uncertain outcome; automatic resend is disabled.');
  if (!claimed.payload.job) return false;
  const job = normalizeJob(claimed.payload.job, { includeResult: true });
  const token = cleanText(claimed.payload.notificationToken, 'notificationToken', 36, /^[a-f0-9-]{36}$/);
  const message = buildEngineOpsMessage(job, job.terminalResult);
  const sent = parseJson(runHermes(['send', '--to', config.engineOpsTarget, '--json', message], 60_000), 'Engine Ops send');
  if (sent.success !== true) throw new Error('Engine Ops delivery was not accepted.');
  const messageId = platformMessageId(sent);
  await post(config, config.outcomeSecret, { action: 'ack_notification', jobKey: job.jobKey, notificationToken: token, platformMessageId: messageId });
  return true;
}

async function processJob(config) {
  const claimed = await post(config, config.claimSecret, { action: 'claim' });
  if (!claimed.payload.job) return false;
  const job = normalizeJob(claimed.payload.job);
  if (job.status === 'claimed') {
    if (!claimed.payload.leaseToken || !claimed.payload.authorityCapability) return false;
    const leaseToken = cleanText(claimed.payload.leaseToken, 'leaseToken', 36, /^[a-f0-9-]{36}$/);
    const authorityCapability = cleanText(claimed.payload.authorityCapability, 'authorityCapability', 43, /^[a-zA-Z0-9_-]{43}$/);
    const taskId = await createTask(config, job, authorityCapability);
    await post(config, config.claimSecret, { action: 'attach', jobKey: job.jobKey, leaseToken, taskId });
    return true;
  }
  if (job.status !== 'running' || !job.taskId) return false;
  await bindAuthorityCapability(job.jobKey, job.taskId);
  let task;
  try {
    task = readTask(config, job.taskId);
  } catch (error) {
    if (/not found|unknown task|wrong task/i.test(error instanceof Error ? error.message : String(error))) {
      await post(config, config.outcomeSecret, { action: 'fail', jobKey: job.jobKey, taskId: job.taskId, failureCode: 'automation_task_missing' });
      await removeAuthorityCapability(job.jobKey);
      return true;
    }
    throw error;
  }
  if (task.status !== 'done' && task.status !== 'blocked') return false;
  let result;
  let rawResult;
  let legacyTerminalResult = false;
  try {
    rawResult = parseJson(String(task.result || ''), 'Kanban terminal result');
    legacyTerminalResult = rawResult?.schemaVersion === LEGACY_RESULT_SCHEMA;
    result = normalizeTaskTerminalResult(rawResult);
    if ((task.status === 'blocked') !== (result.outcome === 'blocked')) throw new Error('Kanban terminal status and structured outcome disagree.');
  } catch {
    await post(config, config.outcomeSecret, { action: 'fail', jobKey: job.jobKey, taskId: job.taskId, failureCode: 'automation_terminal_contract_failure' });
    await removeAuthorityCapability(job.jobKey);
    return true;
  }
  const completionResult = legacyTerminalResult ? rawResult : result;
  try {
    await assertAuthorityCapabilityAbsent(job.jobKey, [JSON.stringify(completionResult)], { allowMissing: legacyTerminalResult });
  } catch {
    await post(config, config.outcomeSecret, { action: 'fail', jobKey: job.jobKey, taskId: job.taskId, failureCode: 'automation_terminal_contract_failure' });
    await removeAuthorityCapability(job.jobKey);
    return true;
  }
  await post(config, config.outcomeSecret, { action: 'complete', jobKey: job.jobKey, taskId: job.taskId, terminalResult: completionResult });
  await removeAuthorityCapability(job.jobKey);
  return true;
}

export async function verifyAuthority(jobKey, taskId = process.env.HERMES_KANBAN_TASK, suppliedAuthorityCapability = null) {
  cleanText(jobKey, 'jobKey', 340, /^[a-zA-Z0-9:|._/@+-]+$/);
  const authorityCapability = suppliedAuthorityCapability === null
    ? await loadAuthorityCapability(jobKey)
    : cleanText(suppliedAuthorityCapability, 'authorityCapability', 43, /^[a-zA-Z0-9_-]{43}$/);
  cleanText(authorityCapability, 'authorityCapability', 43, /^[a-zA-Z0-9_-]{43}$/);
  cleanText(taskId, 'taskId', 82, /^t_[a-zA-Z0-9]+$/);
  const result = await post({ baseUrl: DEFAULT_BASE_URL }, null, { action: 'verify_authority', jobKey, taskId, authorityCapability }, { allowConflict: true });
  if (result.status !== 200 || result.payload.authorized !== true) throw new Error('Coverage automation release authority was not verified.');
  await persistVerifiedAuthorityCapability(jobKey, taskId, suppliedAuthorityCapability);
  return true;
}

export async function runCoverageRequestAgent() {
  const release = await acquireLock();
  if (!release) return;
  try {
    const config = await loadRuntimeConfig();
    await deliverPendingNotification(config);
    await processJob(config);
  } finally {
    await release();
  }
}

const isDirect = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirect) {
  const [mode, jobKey, third, fourth] = process.argv.slice(2);
  const legacyAuthorityCapability = typeof third === 'string' && /^[a-zA-Z0-9_-]{43}$/.test(third) ? third : null;
  const taskId = legacyAuthorityCapability ? (fourth || process.env.HERMES_KANBAN_TASK) : (third || process.env.HERMES_KANBAN_TASK);
  const action = mode === '--verify-authority'
    ? verifyAuthority(jobKey, taskId, legacyAuthorityCapability)
    : runCoverageRequestAgent();
  action.catch((error) => {
    console.error(`Coverage request automation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
