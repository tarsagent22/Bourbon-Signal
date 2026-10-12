const RESULT_SCHEMA = 'bourbon-signal/coverage-expansion-result@2';
const LEGACY_RESULT_SCHEMA = 'bourbon-signal/coverage-expansion-result@1';
const DIRECTIVE = /MEDIA\s*:|\[\[|\]\]|(?:ignore|override|disregard).{0,32}(?:instruction|prompt|rule)/i;

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

export function terminalResultForDelivery(rawResult, normalizedResult) {
  if (rawResult?.schemaVersion === LEGACY_RESULT_SCHEMA && normalizedResult.outcome === 'blocked') return rawResult;
  return normalizedResult;
}

export function normalizeTaskTerminalResult(value) {
  const candidate = value?.refresh && typeof value.refresh.artifactDigest === 'string' && /^[a-f0-9]{64}$/.test(value.refresh.artifactDigest)
    ? { ...value, refresh: { ...value.refresh, artifactDigest: `sha256:${value.refresh.artifactDigest}` } }
    : value;
  if (candidate?.schemaVersion !== LEGACY_RESULT_SCHEMA) return normalizeTerminalResult(candidate);
  const legacy = normalizeLegacyTerminalResult(candidate);
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
    taskId: job.taskId === null ? null : cleanText(job.taskId, 'taskId', 82, /^(?:t_|cx_)[a-zA-Z0-9]+$/),
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

