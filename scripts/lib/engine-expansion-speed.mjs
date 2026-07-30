import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir, open, rm } from 'node:fs/promises';
import path from 'node:path';

export const PHASE_ORDER = Object.freeze([
  'baseline',
  'source-atlas',
  'code-inventory',
  'browser-discovery',
  'contract-freeze',
  'implementation',
  'focused-tests',
  'live-probe',
  'diff-freeze',
  'full-validation',
  'review',
  'ci-deployment',
  'production-refresh',
  'production-verification',
]);

const REQUIRED_TRUST_FIELDS = Object.freeze([
  'exactStoreIdentity',
  'productIdentity',
  'quantitySemantics',
  'freshness',
  'staleFallback',
  'schedulerPersistence',
  'alertability',
]);
const REQUIRED_CUSTOMER_FIELDS = Object.freeze(['lifecycle', 'areas', 'feedAndApi', 'preferencesAndAlerts']);
const REQUIRED_ACCEPTANCE_FIELDS = Object.freeze([
  'minKnownStores',
  'minLiveStores',
  'minAlertGradeStores',
  'minRepresentedAreas',
  'minFreshExactStoreDrops',
  'maxAlertableStaleRows',
]);
const REQUIRED_COMMAND_FIELDS = Object.freeze(['contractFreeze', 'implementation', 'focusedTests', 'liveProbe', 'diffFreeze', 'fullValidation', 'review', 'ciDeployment', 'productionRefresh', 'productionVerification']);
export const PHASE_COMMAND_KEYS = Object.freeze({
  'contract-freeze': 'contractFreeze',
  implementation: 'implementation',
  'focused-tests': 'focusedTests',
  'live-probe': 'liveProbe',
  'diff-freeze': 'diffFreeze',
  'full-validation': 'fullValidation',
  review: 'review',
  'ci-deployment': 'ciDeployment',
  'production-refresh': 'productionRefresh',
  'production-verification': 'productionVerification',
});
const REQUIRED_BASELINE_FIELDS = Object.freeze([
  'capturedAt',
  'productionCommit',
  'coverageStatus',
  'knownStores',
  'liveStores',
  'alertGradeStores',
  'representedAreas',
  'freshExactStoreDrops',
  'roadblocks',
]);

function nonEmpty(value) {
  return typeof value === 'string' ? value.trim().length > 0 : Array.isArray(value) ? value.length > 0 : value != null;
}

function validState(value) {
  return /^[A-Z]{2}$/.test(String(value || ''));
}

function requireObjectFields(object, fields, label, errors, predicate = nonEmpty) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) {
    errors.push(`${label} must be an object.`);
    return;
  }
  for (const field of fields) if (!predicate(object[field])) errors.push(`${label}.${field} is required.`);
}

export function createTaskPacket({ state, objective = '' } = {}) {
  const normalizedState = String(state || '').trim().toUpperCase();
  return {
    schemaVersion: 'bourbon-signal-engine-expansion-task-v1',
    state: normalizedState,
    objective: String(objective || '').trim(),
    createdAt: new Date().toISOString(),
    baseline: {},
    demand: { evidence: [], priorityAreas: [] },
    sourceAtlas: [],
    trustContract: {},
    customerPath: {},
    acceptance: {},
    commands: {},
    discoveryCommands: {
      baseline: '',
      sourceAtlas: '',
      codeInventory: '',
      browserDiscovery: '',
    },
    rollback: {},
    repository: {},
    artifacts: { acceptanceEvidence: '' },
    release: {},
    contractFrozenAt: null,
    browserPolicy: {
      escalation: ['first-party-static', 'direct-http', 'headless-cdp-once', 'camofox-if-blocked', 'cloud-browser-if-measured'],
      directHttpFirst: true,
      endpointDiscoveryOnly: true,
      blockHeavyResourcesByType: true,
      adaptiveNetworkSettle: true,
      globalConcurrency: 3,
      perDomainConcurrency: 1,
      reusableFixtureRequired: true,
      fixtureNeverFreshEvidence: true,
    },
    executionPolicy: {
      oneWriter: true,
      freshStateSession: true,
      maxBroadValidationRuns: 1,
      maxFullReviewRuns: 1,
      focusedFollowupOnly: true,
    },
  };
}

export function taskPacketDigest(packet) {
  return createHash('sha256').update(JSON.stringify(packet)).digest('hex');
}

function validCommit(value) {
  return /^[0-9a-f]{40}$/iu.test(String(value || ''));
}

function validRecentTimestamp(value, maxAgeMs = 24 * 60 * 60_000) {
  const parsed = Date.parse(value);
  const age = Date.now() - parsed;
  return Number.isFinite(parsed) && age >= -5 * 60_000 && age <= maxAgeMs;
}

function validateSourceDisposition(source, index, errors) {
  const label = `sourceAtlas[${index}]`;
  requireObjectFields(source, ['sourceId', 'url', 'authority', 'storeBinding', 'status', 'nextRoute'], label, errors);
  try { if (new URL(source?.url).protocol !== 'https:') errors.push(`${label}.url must be HTTPS.`); } catch { errors.push(`${label}.url must be a valid HTTPS URL.`); }
  if (!['first_party', 'official_public', 'official_directory'].includes(source?.authority)) errors.push(`${label}.authority is unsupported.`);
  if (!['exact', 'directory_only', 'none'].includes(source?.storeBinding)) errors.push(`${label}.storeBinding is unsupported.`);
  if (typeof source?.inventoryEligibility !== 'boolean') errors.push(`${label}.inventoryEligibility must be boolean.`);
  if (!['proven', 'blocked', 'watch_only', 'rejected'].includes(source?.status)) errors.push(`${label}.status is unsupported.`);
  if (source?.inventoryEligibility === true && (source.authority !== 'first_party' || source.storeBinding !== 'exact' || source.status !== 'proven')) errors.push(`${label} cannot be inventory eligible without proven first-party exact-store evidence.`);
}

export function validateTaskPacket(packet) {
  const errors = [];
  if (!packet || typeof packet !== 'object') return { ok: false, errors: ['task packet must be an object.'] };
  if (packet.schemaVersion !== 'bourbon-signal-engine-expansion-task-v1') errors.push('schemaVersion is unsupported.');
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/iu.test(String(packet.runId || ''))) errors.push('runId must be the immutable initialization UUID.');
  if (!validState(packet.state)) errors.push('state must be a two-letter uppercase code.');
  if (!nonEmpty(packet.objective)) errors.push('objective is required.');
  requireObjectFields(packet.baseline, REQUIRED_BASELINE_FIELDS, 'baseline', errors, (value) => (
    typeof value === 'number' ? Number.isFinite(value) && value >= 0 : Array.isArray(value) ? true : nonEmpty(value)
  ));
  if (!validRecentTimestamp(packet.baseline?.capturedAt)) errors.push('baseline.capturedAt must be a valid timestamp from the last 24 hours.');
  if (!validCommit(packet.baseline?.productionCommit)) errors.push('baseline.productionCommit must be a full 40-character commit SHA.');
  if (!packet.demand || !Array.isArray(packet.demand.evidence) || !Array.isArray(packet.demand.priorityAreas)) errors.push('demand evidence and priorityAreas arrays are required.');
  if (!Array.isArray(packet.sourceAtlas) || packet.sourceAtlas.length === 0) errors.push('sourceAtlas requires at least one reviewed source disposition.');
  else packet.sourceAtlas.forEach((source, index) => validateSourceDisposition(source, index, errors));
  requireObjectFields(packet.trustContract, REQUIRED_TRUST_FIELDS, 'trustContract', errors);
  requireObjectFields(packet.customerPath, REQUIRED_CUSTOMER_FIELDS, 'customerPath', errors, (value) => Array.isArray(value) ? value.length > 0 : nonEmpty(value));
  requireObjectFields(packet.acceptance, REQUIRED_ACCEPTANCE_FIELDS, 'acceptance', errors, (value) => Number.isFinite(value) && value >= 0);
  requireObjectFields(packet.commands, REQUIRED_COMMAND_FIELDS, 'commands', errors);
  requireObjectFields(packet.discoveryCommands, ['baseline', 'sourceAtlas', 'codeInventory', 'browserDiscovery'], 'discoveryCommands', errors);
  requireObjectFields(packet.rollback, ['boundary', 'owner'], 'rollback', errors);
  requireObjectFields(packet.repository, ['repo', 'baseCommit', 'initializedHeadCommit', 'branch', 'worktreePath'], 'repository', errors);
  if (!validCommit(packet.repository?.baseCommit) || !validCommit(packet.repository?.initializedHeadCommit)) errors.push('repository commits must be full 40-character SHAs.');
  if (packet.baseline?.productionCommit !== packet.repository?.baseCommit || packet.repository?.initializedHeadCommit !== packet.repository?.baseCommit) errors.push('baseline production, initialized HEAD, and current-main base commits must match at freeze.');
  requireObjectFields(packet.artifacts, ['acceptanceEvidence'], 'artifacts', errors);
  requireObjectFields(packet.release, ['objective', 'releaseLaneGuard', 'productionTarget'], 'release', errors);
  if (packet.release?.objective !== packet.objective) errors.push('release.objective must exactly match objective.');
  if (packet.release?.releaseLaneGuard !== 'scripts/verify-release-lane.mjs') errors.push('release.releaseLaneGuard must use the repository release-lane guard.');
  const ciCommand = String(packet.commands?.ciDeployment || '');
  if (!/\bnode(?:\.exe)?\s+scripts[\\/]verify-release-lane\.mjs\b/iu.test(ciCommand)
    || !/--phase=merge\b/iu.test(ciCommand)
    || !/--expected-head=/iu.test(ciCommand)
    || !/--apply\b/iu.test(ciCommand)) errors.push('commands.ciDeployment must execute an applied guarded merge pinned to the expected head.');
  for (const [name, command] of Object.entries({ ...(packet.commands || {}), ...(packet.discoveryCommands || {}) })) {
    if (/\b(?:TOKEN|PASSWORD|SECRET|API_KEY|PRIVATE_KEY)\s*=/iu.test(String(command))) errors.push(`${name} command must not embed secrets.`);
  }
  if (!validRecentTimestamp(packet.contractFrozenAt)) errors.push('contractFrozenAt must be a valid timestamp from the last 24 hours.');
  const browser = packet.browserPolicy || {};
  if (browser.directHttpFirst !== true || browser.endpointDiscoveryOnly !== true || browser.blockHeavyResourcesByType !== true || browser.adaptiveNetworkSettle !== true || browser.reusableFixtureRequired !== true || browser.fixtureNeverFreshEvidence !== true || browser.perDomainConcurrency !== 1 || !Number.isInteger(browser.globalConcurrency) || browser.globalConcurrency < 1 || browser.globalConcurrency > 3) errors.push('browserPolicy must enforce direct-HTTP-first endpoint discovery, typed resource blocking, adaptive settle, safe fixtures, global concurrency <= 3, and per-domain concurrency 1.');
  const execution = packet.executionPolicy || {};
  if (execution.oneWriter !== true || execution.freshStateSession !== true || execution.maxBroadValidationRuns !== 1 || execution.maxFullReviewRuns !== 1 || execution.focusedFollowupOnly !== true) errors.push('executionPolicy must require one writer, a fresh state session, one broad validation/review, and focused follow-up only.');
  return { ok: errors.length === 0, errors };
}

const PHASE_PREREQUISITES = Object.freeze({
  'contract-freeze': ['baseline', 'source-atlas', 'code-inventory', 'browser-discovery'],
  implementation: ['contract-freeze'],
  'focused-tests': ['implementation'],
  'live-probe': ['focused-tests'],
  'diff-freeze': ['live-probe'],
  'full-validation': ['diff-freeze'],
  review: ['full-validation'],
  'ci-deployment': ['review'],
  'production-refresh': ['ci-deployment'],
  'production-verification': ['production-refresh'],
});
const SINGLE_RUN_PHASES = new Set(['full-validation', 'review', 'ci-deployment', 'production-refresh', 'production-verification']);

export function verifyPhaseTransition({ packet, phase, completedPhases = [], attemptedPhases = [] } = {}) {
  if (!PHASE_ORDER.includes(phase)) throw new Error(`Unknown engine expansion phase ${phase}.`);
  const completed = new Set(completedPhases);
  const attempted = new Set(attemptedPhases);
  if (SINGLE_RUN_PHASES.has(phase) && attempted.has(phase)) throw new Error(`${phase} already attempted; use a focused follow-up phase rather than repeating the broad gate.`);
  if (PHASE_ORDER.indexOf(phase) >= PHASE_ORDER.indexOf('contract-freeze')) {
    const validation = validateTaskPacket(packet);
    if (!validation.ok) throw new Error(`Task packet is not frozen and valid: ${validation.errors.join(' ')}`);
  }
  for (const prerequisite of PHASE_PREREQUISITES[phase] || []) {
    if (!completed.has(prerequisite)) throw new Error(`${phase} requires completed ${prerequisite}.`);
  }
  return true;
}

export async function runBoundedTasks(tasks, { concurrency = 3 } = {}) {
  if (!Array.isArray(tasks)) throw new TypeError('tasks must be an array.');
  const limit = Math.max(1, Math.min(3, Number(concurrency) || 1));
  const results = new Array(tasks.length);
  let index = 0;
  async function worker() {
    while (true) {
      const current = index;
      index += 1;
      if (current >= tasks.length) return;
      const task = tasks[current];
      const startedAt = new Date().toISOString();
      const startedMs = Date.now();
      try {
        const value = await task.run();
        results[current] = { name: task.name, value, outcome: 'passed', startedAt, endedAt: new Date().toISOString(), durationMs: Date.now() - startedMs };
      } catch (error) {
        results[current] = { name: task.name, error: error instanceof Error ? error.message : String(error), outcome: 'failed', startedAt, endedAt: new Date().toISOString(), durationMs: Date.now() - startedMs };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
  return results;
}

export function validateAcceptanceEvidence(packet, evidence, {
  requireProductionCommit = false,
  expectedPhase,
  expectedHeadCommit,
  expectedDiffDigest,
  expectedPacketDigest = taskPacketDigest(packet),
  phaseStartedAt,
} = {}) {
  const errors = [];
  if (evidence?.schemaVersion !== 'bourbon-signal-engine-expansion-acceptance-v1') errors.push('acceptance evidence schema is unsupported.');
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/iu.test(String(evidence?.evidenceId || ''))) errors.push('acceptance evidence requires a unique evidenceId.');
  if (evidence?.state !== packet?.state) errors.push('acceptance evidence state does not match the task packet.');
  if (evidence?.runId !== packet?.runId) errors.push('acceptance evidence runId does not match the task packet.');
  if (evidence?.packetDigest !== expectedPacketDigest) errors.push('acceptance evidence packetDigest does not match the frozen packet.');
  if (expectedPhase && evidence?.phase !== expectedPhase) errors.push('acceptance evidence phase does not match the current gate.');
  if (expectedHeadCommit && evidence?.headCommit !== expectedHeadCommit) errors.push('acceptance evidence headCommit does not match the current gate.');
  if (expectedDiffDigest && evidence?.diffDigest !== expectedDiffDigest) errors.push('acceptance evidence diffDigest does not match the current gate.');
  if (!validRecentTimestamp(evidence?.capturedAt, 2 * 60 * 60_000)) errors.push('acceptance evidence must be from the last two hours.');
  if (phaseStartedAt && Date.parse(evidence?.capturedAt) < Date.parse(phaseStartedAt)) errors.push('acceptance evidence predates the current phase.');
  if (requireProductionCommit && !validCommit(evidence?.productionCommit)) errors.push('production acceptance evidence requires a full commit SHA.');
  const checks = [
    ['knownStores', 'minKnownStores', 'minimum'],
    ['liveStores', 'minLiveStores', 'minimum'],
    ['alertGradeStores', 'minAlertGradeStores', 'minimum'],
    ['representedAreas', 'minRepresentedAreas', 'minimum'],
    ['freshExactStoreDrops', 'minFreshExactStoreDrops', 'minimum'],
    ['alertableStaleRows', 'maxAlertableStaleRows', 'maximum'],
  ];
  for (const [actualKey, thresholdKey, direction] of checks) {
    const actual = evidence?.[actualKey];
    const threshold = packet?.acceptance?.[thresholdKey];
    if (!Number.isFinite(actual)) errors.push(`${actualKey} must be numeric.`);
    else if (direction === 'minimum' && actual < threshold) errors.push(`${actualKey} ${actual} is below ${threshold}.`);
    else if (direction === 'maximum' && actual > threshold) errors.push(`${actualKey} ${actual} exceeds ${threshold}.`);
  }
  return { ok: errors.length === 0, errors };
}

export async function acquireWriterLock(lockFile, identity = {}) {
  await mkdir(path.dirname(lockFile), { recursive: true });
  let handle;
  try {
    handle = await open(lockFile, 'wx');
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error(`Engine expansion writer lock already exists: ${lockFile}`);
    throw error;
  }
  await handle.writeFile(`${JSON.stringify({ schemaVersion: 'bourbon-signal-engine-expansion-writer-lock-v1', attemptId: randomUUID(), pid: process.pid, createdAt: new Date().toISOString(), ...identity })}\n`, 'utf8');
  await handle.close();
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await rm(lockFile, { force: true });
  };
}

export async function appendPhaseResult(file, result) {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(result)}\n`, 'utf8');
}

export function summarizeTimings(rows) {
  const validRows = (rows || []).filter((row) => Number.isFinite(row?.durationMs) && nonEmpty(row?.phase));
  if (!validRows.length) return { phaseCount: 0, totalPhaseWorkMs: 0, wallClockMs: 0, slowestPhase: null, outcomes: {} };
  const starts = validRows.map((row) => Date.parse(row.startedAt)).filter(Number.isFinite);
  const ends = validRows.map((row) => Date.parse(row.endedAt)).filter(Number.isFinite);
  const outcomes = {};
  for (const row of validRows) outcomes[row.outcome || 'unknown'] = (outcomes[row.outcome || 'unknown'] || 0) + 1;
  return {
    phaseCount: validRows.length,
    totalPhaseWorkMs: validRows.reduce((sum, row) => sum + row.durationMs, 0),
    wallClockMs: starts.length && ends.length ? Math.max(...ends) - Math.min(...starts) : null,
    slowestPhase: [...validRows].sort((left, right) => right.durationMs - left.durationMs)[0],
    outcomes,
  };
}
