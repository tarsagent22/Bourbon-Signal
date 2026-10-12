import assert from 'node:assert/strict';
import { buildMemberSetupProgress } from '../src/lib/member-setup-progress.ts';
import { buildAutomationCostReport } from '../automation/bourbon-signal/automation-cost-report.mjs';
import { evaluateProductionHealth } from './production-engine-watchdog.mjs';
import { existingCoverageVerified } from '../src/lib/coverage-existing-proof';
import { runCoverageRequestAgent } from '../automation/bourbon-signal/coverage-request-agent.mjs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const now = new Date('2026-10-11T12:00:00Z');
const target = { targetType: 'city', stateCode: 'VA', canonicalTargetKey: 'city:VA:sterling' };
const coverage = { code: 'VA', health: 'current', coverageDepth: 'deep', coverageStatus: 'available', freshness: { currentInventoryStores: 50 } };
const evidence = [{ kind: 'city', stateCode: 'VA', canonicalTargetKey: target.canonicalTargetKey, status: 'covered' }];
assert.equal(existingCoverageVerified(target, coverage, evidence), true);
assert.equal(existingCoverageVerified(target, coverage, [{ ...evidence[0], canonicalTargetKey: 'city:VA:richmond' }]), false);
assert.equal(existingCoverageVerified(target, { ...coverage, health: 'stale' }, evidence), false);
assert.equal(existingCoverageVerified({ ...target, targetType: 'state' }, { ...coverage, coverageDepth: 'focused' }), false);
assert.equal(existingCoverageVerified(target, { ...coverage, freshness: { currentInventoryStores: 0 } }, evidence), false);
const activity = { platform: 'ios' as const, appVersion: '1.1.0', updateId: null,
  firstSeenAt: '2026-10-09T10:00:00Z', lastSeenAt: '2026-10-11T10:00:00Z' };
const paid = { membershipTier: 'standard', membershipStatus: 'active',
  areaPreferences: { states: ['VA'] }, bottleAlertPreferences: { bottleKeys: ['eagle rare'] },
  notificationPreferences: { onSite: true, push: { enabled: false } } };
const users = [
  { id: 'push-missing', createdAt: '2026-10-01', publicMetadata: paid },
  { id: 'ready', createdAt: '2026-10-01', publicMetadata: { ...paid, notificationPreferences: { push: { enabled: true } } } },
  { id: 'free', createdAt: '2026-10-01', unsafeMetadata: paid },
  { id: 'no-app', createdAt: '2026-10-01', publicMetadata: paid },
  { id: 'old', createdAt: '2026-07-01', publicMetadata: paid },
];
const report = buildMemberSetupProgress(users, { 'push-missing': [activity], ready: [activity], free: [activity], old: [activity] }, now);
assert.equal(report.accounts, 4);
assert.equal(report.appOpened, 3);
assert.equal(report.alertMembers, 2);
assert.equal(report.missingPush, 1, 'On-site alerts are not phone alerts.');
assert.equal(report.setupComplete, 1);
assert.equal(report.activityAfter24Hours, 3);
assert.equal(buildMemberSetupProgress(users, {}, now).appOpened, 0, 'Sign-ins do not prove app use.');
assert.doesNotMatch(JSON.stringify(report), /push-missing|eagle rare/);

const registry = { schemaVersion: 1, automations: [{ id: 'research', executionClass: 'agent' }] };
const runs = Array.from({ length: 5 }, (_, index) => ({ jobId: 'research', runId: `run-${index}`, status: 'success', tokens: 30_000 }));
const missing = buildAutomationCostReport({ registry, runs: [...runs, runs[0]] });
assert.equal(missing.totals.agentRuns, 5);
assert.equal(missing.telemetry.duplicateRuns, 1);
assert.deepEqual(missing.recommendations, [], 'Missing outcome data is not zero value.');
const zero = buildAutomationCostReport({ registry, runs: runs.map(run => ({ ...run, usefulFindings: 0, objectivesCompleted: 0, coverageDelta: 0 })) });
assert.deepEqual(zero.recommendations, [{ jobId: 'research', action: 'review_cost_without_results' }]);
assert.doesNotMatch(JSON.stringify(zero), /run-0/);

const health = evaluateProductionHealth({ activeStates: ['NC'], stats: { ok: true, source: 'remote-snapshot', snapshotId: 'test', body: {
  generatedAt: now.toISOString(), stateCount: 1,
  refreshHealth: { retryStateIds: ['NC'], states: [{ state: 'NC', evidenceFreshness: { inventory: { totalCount: 30, freshCount: 0 } } }] },
  ncBoardIntelligence: { sourceHealth: { affectedBoards: [{ boardName: 'Example board', consecutiveFailures: 4, failedKnownRoutes: [{ status: 403 }], parserWarnings: [] }] } },
} }, stateChecks: [{ state: 'NC', ok: true, source: 'remote-snapshot', snapshotId: 'test' }], nowMs: now.getTime() });
assert.deepEqual(health.recoveryPriorityStates, ['NC']);
assert.equal(health.sourceRecoveryActions[0].action, 'review_access');
console.log('Member setup, recovery priority, and automation cost checks passed.');

async function testReviewDispatcher() {
  const directory = await mkdtemp(path.join(tmpdir(), 'bs-review-test-'));
  const previous = { home: process.env.HERMES_HOME, config: process.env.BOURBON_SIGNAL_COVERAGE_AUTOMATION_CONFIG, mode: process.env.BOURBON_SIGNAL_COVERAGE_MODE, fetch: globalThis.fetch };
  const calls: string[] = [];
  try {
    const config = path.join(directory, 'config.json');
    await writeFile(config, JSON.stringify({ mode: 'guarded_release', baseUrl: 'https://www.bourbonsignal.com', claimSecret: 'a'.repeat(32), outcomeSecret: 'b'.repeat(32), engineOpsTarget: 'slack:test', board: 'test', project: 'test', assignee: 'default' }));
    process.env.HERMES_HOME = directory;
    process.env.BOURBON_SIGNAL_COVERAGE_AUTOMATION_CONFIG = config;
    process.env.BOURBON_SIGNAL_COVERAGE_MODE = 'review';
    globalThis.fetch = async (_url, init) => { calls.push(JSON.parse(String(init?.body)).action); return Response.json({ job: null }); };
    await runCoverageRequestAgent();
    assert.deepEqual(calls, ['claim'], 'Research checks never claim or send outbound notifications, even with an old release config.');
  } finally {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of Object.entries({ HERMES_HOME: previous.home, BOURBON_SIGNAL_COVERAGE_AUTOMATION_CONFIG: previous.config, BOURBON_SIGNAL_COVERAGE_MODE: previous.mode })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    if (!path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error('Unexpected temporary test path.');
    await rm(directory, { recursive: true, force: true });
  }
}
testReviewDispatcher().then(() => console.log('Review dispatcher excludes outbound notifications.')).catch(error => { console.error(error); process.exitCode = 1; });
