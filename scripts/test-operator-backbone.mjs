import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  FINDING_CONTRACT_VERSION,
  MAX_FINDINGS_PER_REPORT,
  buildFinding,
  createFindingService,
  parseFindingIssueBody,
  rankFindings,
  renderFindingIssueBody,
  validateFinding,
} from './lib/operator-findings.mjs';
import {
  findingsFromDailyReliability,
  findingsFromSourceRoi,
  findingsFromWeeklyEngineBrief,
} from './lib/finding-adapters.mjs';
import {
  buildDailyCompanyBrief,
  buildWeeklyStrategyReview,
  renderDailyCompanyBrief,
  renderWeeklyStrategyReview,
} from './lib/operator-briefs.mjs';
import {
  buildObjectiveLock,
  selectObjective,
  validateObjectiveLock,
} from './lib/operator-policy.mjs';
import { buildCompanyScorecard } from '../src/lib/company-control-room.ts';

const observedAt = '2026-07-16T12:00:00.000Z';
const sampleInput = {
  source: 'daily-reliability',
  sourceKey: 'engine-health:failed-states',
  area: 'data',
  severity: 'critical',
  title: 'Restore failed engine states',
  summary: 'Two required states failed the latest refresh.',
  evidence: ['NC and VA are failed', 'Latest export is 22 hours old'],
  recommendedAction: 'Repair the highest-value failed collector and rerun verification.',
  impact: 5,
  urgency: 5,
  confidence: 0.95,
  effort: 3,
  observedAt,
};

const finding = buildFinding(sampleInput);
assert.equal(finding.contractVersion, FINDING_CONTRACT_VERSION);
assert.match(finding.id, /^bsf-[a-f0-9]{16}$/);
assert.deepEqual(buildFinding(sampleInput), finding, 'finding IDs and payloads must be deterministic');
assert.deepEqual(validateFinding(finding), { ok: true, errors: [] });
assert.equal(validateFinding({ ...finding, id: 'bsf-0000000000000000' }).ok, false, 'ID must derive from source and sourceKey');
assert.equal(validateFinding({ ...finding, evidence: Array.from({ length: 6 }, (_, index) => `e${index}`) }).ok, false);
assert.equal(validateFinding({ ...finding, title: 'x'.repeat(121) }).ok, false);
assert.equal(validateFinding({ ...finding, unexpected: true }).ok, false, 'the canonical contract rejects unknown fields');

const lowerRank = buildFinding({
  ...sampleInput,
  sourceKey: 'coverage:watch',
  severity: 'low',
  title: 'Watch partial coverage',
  impact: 2,
  urgency: 1,
  confidence: 0.7,
  effort: 4,
});
const ranked = rankFindings([lowerRank, finding]);
assert.equal(ranked[0].id, finding.id);
assert.ok(ranked[0].rankScore > ranked[1].rankScore);

const body = renderFindingIssueBody(finding);
assert.match(body, /<!-- bourbon-signal-finding:v1 -->/);
assert.deepEqual(parseFindingIssueBody(body), finding);

const ghCalls = [];
const existingIssue = {
  number: 41,
  title: `[Finding] ${finding.title}`,
  body,
  state: 'OPEN',
  labels: ['operator-finding', 'area:data', 'severity:critical', 'status:backlog'].map((name) => ({ name })),
  url: 'https://github.invalid/issues/41',
};
const service = createFindingService({
  runGh: async (args) => {
    ghCalls.push(args);
    if (args[0] === 'issue' && args[1] === 'list') return [existingIssue];
    return { ok: true };
  },
});
assert.deepEqual((await service.read({ repo: 'owner/repo' })).map((entry) => entry.finding.id), [finding.id]);
const dryRun = await service.upsert({ findings: [finding, lowerRank], repo: 'owner/repo', apply: false });
assert.equal(dryRun.mode, 'dry-run');
assert.deepEqual(dryRun.actions.map((action) => action.action), ['noop', 'create']);
assert.equal(ghCalls.some((args) => ['create', 'edit', 'close'].includes(args[1])), false, 'dry-run must never mutate GitHub');
await service.upsert({ findings: [lowerRank], repo: 'owner/repo', apply: true });
assert.equal(ghCalls.some((args) => args[0] === 'issue' && args[1] === 'create'), true);
const createCall = ghCalls.find((args) => args[0] === 'issue' && args[1] === 'create');
assert.equal(createCall.includes('--label'), true);
assert.equal(createCall.includes('--add-label'), false, 'gh issue create uses --label; --add-label is edit-only');
const updateDryRun = await service.update({ id: finding.id, status: 'resolved', repo: 'owner/repo', apply: false });
assert.equal(updateDryRun.mode, 'dry-run');
assert.equal(updateDryRun.action.action, 'update');
assert.equal(ghCalls.some((args) => args[0] === 'issue' && args[1] === 'close'), false);
await service.update({ id: finding.id, status: 'resolved', repo: 'owner/repo', apply: true });
assert.equal(ghCalls.some((args) => args[0] === 'issue' && args[1] === 'close'), true);
const statusEdit = ghCalls.findLast((args) => args[0] === 'issue' && args[1] === 'edit');
assert.deepEqual(statusEdit.slice(statusEdit.indexOf('--remove-label'), statusEdit.indexOf('--remove-label') + 2), ['--remove-label', 'status:backlog']);

const staleIssue = {
  number: 42,
  title: `[Finding] ${lowerRank.title}`,
  body: renderFindingIssueBody(lowerRank),
  state: 'OPEN',
  labels: ['operator-finding', `area:${lowerRank.area}`, `severity:${lowerRank.severity}`, 'status:backlog'].map((name) => ({ name })),
  url: 'https://github.invalid/issues/42',
};
const reconcileCalls = [];
const reconcileService = createFindingService({
  runGh: async (args) => {
    reconcileCalls.push(args);
    if (args[0] === 'issue' && args[1] === 'list') return [existingIssue, staleIssue];
    return { ok: true };
  },
});
const reconcileDryRun = await reconcileService.reconcile({
  findings: [finding],
  resolvedIds: [lowerRank.id],
  source: finding.source,
  repo: 'owner/repo',
  apply: false,
});
assert.deepEqual(reconcileDryRun.actions.map((action) => [action.action, action.finding.id]), [
  ['noop', finding.id],
  ['resolve-explicit', lowerRank.id],
]);
assert.equal(reconcileCalls.some((args) => ['edit', 'close'].includes(args[1])), false, 'reconciliation dry-run must not mutate GitHub');
await assert.rejects(
  reconcileService.reconcile({ findings: [finding], resolvedIds: [lowerRank.id], source: finding.source, repo: 'owner/repo', apply: true }),
  /requires the shared release-lane lease/,
);

const activeStaleIssue = {
  ...staleIssue,
  body: renderFindingIssueBody({ ...lowerRank, status: 'in-progress' }),
  labels: ['operator-finding', `area:${lowerRank.area}`, `severity:${lowerRank.severity}`, 'status:in-progress'].map((name) => ({ name })),
};
const activeReconcileService = createFindingService({
  runGh: async (args) => args[0] === 'issue' && args[1] === 'list' ? [existingIssue, activeStaleIssue] : { ok: true },
});
await assert.rejects(
  activeReconcileService.reconcile({ findings: [finding], resolvedIds: [lowerRank.id], source: finding.source, repo: 'owner/repo' }),
  /cannot be automatically resolved from status in-progress/,
);

const recurringObservation = {
  ...finding,
  area: 'shipping',
  severity: 'high',
  title: 'Restore failed engine states after recurrence',
  summary: 'Three required states failed the latest refresh.',
  evidence: ['NC, VA, and TX are failed', 'Latest export is 23 hours old'],
  recommendedAction: 'Repair the current highest-value failure and rerun verification.',
  impact: 4,
  urgency: 4,
  confidence: 0.9,
  effort: 2,
  status: 'backlog',
  observedAt: '2026-07-16T13:00:00.000Z',
};
for (const lifecycleStatus of ['backlog', 'selected', 'in-progress', 'blocked', 'resolved', 'dismissed']) {
  for (const issueState of ['OPEN', 'CLOSED']) {
    const currentFinding = { ...finding, status: lifecycleStatus };
    const matrixCalls = [];
    const matrixIssue = {
      ...existingIssue,
      body: renderFindingIssueBody(currentFinding),
      state: issueState,
      labels: ['operator-finding', `area:${currentFinding.area}`, `severity:${currentFinding.severity}`, `status:${lifecycleStatus}`].map((name) => ({ name })),
    };
    const matrixService = createFindingService({
      runGh: async (args) => {
        matrixCalls.push(args);
        if (args[0] === 'issue' && args[1] === 'list') return [matrixIssue];
        return { ok: true };
      },
    });
    const matrixResult = await matrixService.upsert({ findings: [recurringObservation], repo: 'owner/repo', apply: true });
    const action = matrixResult.actions[0];
    assert.equal(action.action, 'update', `${lifecycleStatus}/${issueState} refreshes the recurring observation`);
    assert.equal(action.finding.status, lifecycleStatus, `${lifecycleStatus}/${issueState} preserves operator lifecycle`);
    assert.equal(action.finding.observedAt, recurringObservation.observedAt);
    assert.deepEqual(action.finding.evidence, recurringObservation.evidence);
    assert.equal(action.finding.severity, recurringObservation.severity);
    assert.equal(action.finding.impact, recurringObservation.impact);
    assert.equal(action.finding.id, currentFinding.id);
    assert.equal(action.finding.source, currentFinding.source);
    assert.equal(action.finding.sourceKey, currentFinding.sourceKey);
    assert.equal(matrixCalls.some((args) => args[0] === 'issue' && ['close', 'reopen'].includes(args[1])), false, `${lifecycleStatus}/${issueState} preserves issue state during recurrence`);
    const edit = matrixCalls.find((args) => args[0] === 'issue' && args[1] === 'edit');
    assert.ok(edit, `${lifecycleStatus}/${issueState} edits observation fields`);
    assert.equal(edit.includes(`status:${lifecycleStatus}`), true, `${lifecycleStatus}/${issueState} retains its status label`);
    assert.equal(parseFindingIssueBody(edit[edit.indexOf('--body') + 1]).status, lifecycleStatus);
  }
}

const manyIssues = Array.from({ length: 20 }, (_, index) => ({
  severity: index === 0 ? 'critical' : 'warn',
  area: index % 2 ? 'production' : 'timestamp integrity',
  message: `Issue ${index}`,
  detail: `Detail ${index}`,
}));
const adapterOutputs = [
  findingsFromDailyReliability({ generatedAt: observedAt, issues: manyIssues }),
  findingsFromWeeklyEngineBrief({
    generatedAt: observedAt,
    recommendations: manyIssues.map((issue, index) => ({ title: issue.message, score: 100 - index, reason: issue.detail, recommendedAction: `Act ${index}`, evidence: [`E${index}`] })),
  }),
  findingsFromSourceRoi({
    generatedAt: observedAt,
    top: manyIssues.map((_, index) => ({ state: 'NC', source: `source-${index}`, score: 100 - index, recommendation: index % 2 ? 'monitor' : 'repair_high_value_source', alerts: 2, storeLevel: 3, roadblocks: 1, topIssues: ['blocked'] })),
  }),
];
for (const output of adapterOutputs) {
  assert.ok(output.length <= MAX_FINDINGS_PER_REPORT, 'every producer must emit a bounded finding set');
  assert.ok(output.every((item) => validateFinding(item).ok), 'every producer must emit canonical findings');
}
const dailyIdentityA = findingsFromDailyReliability({ generatedAt: observedAt, issues: [{ severity: 'critical', area: 'engine health', message: '2 failed states' }] })[0];
const dailyIdentityB = findingsFromDailyReliability({ generatedAt: observedAt, issues: [{ severity: 'critical', area: 'engine health', message: '3 failed states' }] })[0];
assert.equal(dailyIdentityA.id, dailyIdentityB.id, 'changing counts must update a finding rather than create backlog churn');

const snapshot = {
  checkedAt: observedAt,
  memberships: {
    counts: { total: 25, free: 20, paid: 5, standard: 3, barrel: 1, founder: 1, retailer: 2, owner: 1, pastDue: 1, campaignEligibleFree: 18 },
    estimatedMonthlyRecurringCents: 1297,
    estimatedAnnualRecurringCents: 15564,
    estimatedLifetimeGrossCents: 4999,
  },
  founder: { limit: 100, claimed: 1, remaining: 99 },
  revenue: { source: 'stripe', currency: 'usd', grossCollectedCents: 9000, collectedLast30DaysCents: 4000, refundedCents: 0, activeSubscriptions: 4, pastDueSubscriptions: 1, monthlyRecurringCents: 1297 },
  audience: { source: 'resend', activeContacts: 20, eligibleFreeMembers: 18, reachableFreeMembers: 17 },
  growth: { days7: { accounts: 5, freeValueReached: 4, pricingViewed: 3, checkoutStarted: 2, membershipActivated: 1, paidActivationCompleted: 1, firstAlertCreated: 1, unknownAttribution: 0, bySource: { radar: 5 } }, days30: { accounts: 15, freeValueReached: 12, pricingViewed: 8, checkoutStarted: 5, membershipActivated: 4, paidActivationCompleted: 3, firstAlertCreated: 2, unknownAttribution: 1, bySource: { radar: 10, direct: 5 } } },
  lifecycle: { freeNoValue: 4, freeValueNoPricing: 5, checkoutNotActivated: 1, paidSetupIncomplete: 1, activatedNoFirstAlert: 1 },
  retailer: { source: 'database', partial: false, applications: 4, pendingApplications: 1, verifiedStores: 3, storesWithLiveSignals: 2, liveSignals: 10 },
  engine: { status: 'healthy', ageMinutes: 15, generatedAt: observedAt, activeStates: 24, inventoryStates: 12, stores: 2913, signals: 27014, alertCandidates: 645, failedStates: 0, degradedStates: 1, staleStates: 0 },
  alerts: { status: 'healthy', lastRunAt: observedAt, ageMinutes: 30, emailEnabled: false, smsEnabled: false, onSiteEnabled: true, counts: { matchedUsers: 4 } },
  release: { status: 'healthy', deploymentId: 'dpl_public_aggregate' },
  internalEmail: 'member@example.com',
  userId: 'user_private_123',
};
const scorecard = buildCompanyScorecard(snapshot, observedAt);
assert.equal(scorecard.contractVersion, 'bourbon-signal/company-scorecard@1');
assert.deepEqual(Object.keys(scorecard.sections), ['company', 'product', 'data', 'shipping', 'decision']);
assert.equal(JSON.stringify(scorecard).includes('member@example.com'), false);
assert.equal(JSON.stringify(scorecard).includes('user_private_123'), false);
assert.equal(scorecard.sections.data.metrics.signals, 27014);

const dailyBrief = buildDailyCompanyBrief({ scorecard, findings: ranked, generatedAt: observedAt });
assert.deepEqual(dailyBrief.sections.map((section) => section.name), ['Company', 'Product', 'Data', 'Shipping', 'Decision', 'Today']);
const dailyMarkdown = renderDailyCompanyBrief(dailyBrief);
const dailyHeadings = [...dailyMarkdown.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
assert.deepEqual(dailyHeadings, ['Company', 'Product', 'Data', 'Shipping', 'Decision', 'Today']);

const weeklyReview = buildWeeklyStrategyReview({ scorecard, findings: ranked, generatedAt: observedAt });
assert.equal(weeklyReview.objective.findingId, finding.id);
assert.match(renderWeeklyStrategyReview(weeklyReview), /^# Bourbon Signal Weekly Strategy Review/m);
assert.ok(weeklyReview.findings.length <= MAX_FINDINGS_PER_REPORT);
assert.equal(buildWeeklyStrategyReview({ scorecard, findings: [{ ...lowerRank, status: 'in-progress' }, finding], generatedAt: observedAt }).objective.findingId, lowerRank.id);

const selected = selectObjective([lowerRank, finding]);
assert.equal(selected.id, finding.id);
assert.equal(selectObjective([{ ...finding, status: 'resolved' }, lowerRank]).id, lowerRank.id);
assert.equal(selectObjective([{ ...lowerRank, status: 'in-progress' }, finding]).id, lowerRank.id, 'an active objective cannot be displaced by rank');
assert.throws(() => selectObjective([{ ...lowerRank, status: 'in-progress' }, { ...finding, status: 'selected' }]), /Multiple active objectives/);
const lock = buildObjectiveLock({ finding: selected, issueNumber: 41, selectedAt: observedAt });
assert.equal(lock.objectiveId, finding.id);
assert.match(lock.branch, /^operator\/bsf-[a-f0-9]{16}-restore-failed-engine-states$/);
assert.equal(lock.baseBranch, 'main');
assert.deepEqual(validateObjectiveLock(lock), { ok: true, errors: [] });
assert.throws(() => buildObjectiveLock({ finding: selected, issueNumber: 41, selectedAt: observedAt, existingLock: lock }), /already locked/);

const issueTemplate = readFileSync(new URL('../.github/ISSUE_TEMPLATE/operator-finding.yml', import.meta.url), 'utf8');
assert.match(issueTemplate, /bourbon-signal-finding:v1/);
assert.match(issueTemplate, /operator-finding/);
const findingSchema = JSON.parse(readFileSync(new URL('../.github/operator-finding.schema.json', import.meta.url), 'utf8'));
assert.equal(findingSchema.properties.contractVersion.const, FINDING_CONTRACT_VERSION);
assert.equal(findingSchema.additionalProperties, false);
assert.equal(findingSchema.properties.evidence.maxItems, 5);
const cliSource = readFileSync(new URL('./operator-findings.mjs', import.meta.url), 'utf8');
assert.match(cliSource, /validate|upsert|read|rank|update/);
assert.match(cliSource, /--apply/);
const objectiveCliSource = readFileSync(new URL('./operator-objective.mjs', import.meta.url), 'utf8');
assert.match(objectiveCliSource, /dry-run/);
assert.match(objectiveCliSource, /--apply/);
assert.match(objectiveCliSource, /\['worktree', 'add'/, 'objective application must create an isolated git worktree');
for (const [file, adapter] of [
  ['../automation/bourbon-signal/daily-reliability.mjs', 'findingsFromDailyReliability'],
  ['../automation/bourbon-signal/weekly-engine-brief.mjs', 'findingsFromWeeklyEngineBrief'],
  ['../automation/bourbon-signal/source-roi-ranker.mjs', 'findingsFromSourceRoi'],
]) assert.match(readFileSync(new URL(file, import.meta.url), 'utf8'), new RegExp(adapter));
assert.match(readFileSync(new URL('../src/lib/company-control-room-server.ts', import.meta.url), 'utf8'), /buildCompanyScorecard/);

const fixtureDir = mkdtempSync(resolve(tmpdir(), 'bs-operator-backbone-'));
try {
  const scorecardFile = resolve(fixtureDir, 'scorecard.json');
  const findingsFile = resolve(fixtureDir, 'findings.json');
  const rankedFindingsFile = resolve(fixtureDir, 'ranked-findings.json');
  const snapshotFile = resolve(fixtureDir, 'snapshot.json');
  const githubBacklogFile = resolve(fixtureDir, 'github-backlog.json');
  const lockFile = resolve(fixtureDir, 'objective-lock.json');
  writeFileSync(scorecardFile, JSON.stringify(scorecard));
  writeFileSync(findingsFile, JSON.stringify({ findings: [finding, lowerRank] }));
  writeFileSync(rankedFindingsFile, JSON.stringify({ findings: ranked }));
  writeFileSync(snapshotFile, JSON.stringify(snapshot));
  const activeFinding = { ...lowerRank, status: 'in-progress' };
  const higherRankedBacklog = Array.from({ length: MAX_FINDINGS_PER_REPORT }, (_, index) => buildFinding({
    ...sampleInput,
    sourceKey: `higher-priority-${index}`,
    title: `Higher ranked backlog finding ${index}`,
  }));
  writeFileSync(githubBacklogFile, JSON.stringify({
    count: higherRankedBacklog.length + 1,
    findings: [
      { issueNumber: 77, issueState: 'OPEN', url: 'https://github.invalid/issues/77', finding: activeFinding },
      ...higherRankedBacklog.map((item, index) => ({ issueNumber: 100 + index, issueState: 'OPEN', url: `https://github.invalid/issues/${100 + index}`, finding: item })),
    ],
  }));
  const run = (script, args = []) => execFileSync(process.execPath, ['--no-warnings', '--experimental-strip-types', script, ...args], { encoding: 'utf8' });
  const dailyDryRun = run('automation/bourbon-signal/daily-company-brief.mjs', [`--scorecard=${scorecardFile}`, `--findings=${findingsFile}`, `--at=${observedAt}`]);
  assert.deepEqual([...dailyDryRun.matchAll(/^## (.+)$/gm)].map((match) => match[1]), ['Company', 'Product', 'Data', 'Shipping', 'Decision', 'Today']);
  assert.match(run('automation/bourbon-signal/weekly-strategy-review.mjs', [`--scorecard=${scorecardFile}`, `--findings=${findingsFile}`, `--at=${observedAt}`]), /# Bourbon Signal Weekly Strategy Review/);
  const dailyFromGithub = JSON.parse(run('automation/bourbon-signal/daily-company-brief.mjs', [`--scorecard=${scorecardFile}`, `--github-backlog=${githubBacklogFile}`, `--at=${observedAt}`, '--json']));
  assert.equal(dailyFromGithub.findingIds.includes(activeFinding.id), true, 'daily brief retains the active objective from the canonical GitHub backlog');
  assert.equal(dailyFromGithub.sections.find((section) => section.name === 'Today').bullets.includes(`Finding: ${activeFinding.id}`), true);
  const weeklyFromGithub = JSON.parse(run('automation/bourbon-signal/weekly-strategy-review.mjs', [`--scorecard=${scorecardFile}`, `--github-backlog=${githubBacklogFile}`, `--at=${observedAt}`, '--json']));
  assert.equal(weeklyFromGithub.objective.findingId, activeFinding.id, 'weekly review retains the one active objective from the canonical GitHub backlog');
  assert.equal(weeklyFromGithub.findings.some((item) => item.id === activeFinding.id), true, 'bounded weekly findings retain the active objective');
  assert.match(run('automation/bourbon-signal/company-scorecard.mts', [`--input=${snapshotFile}`, `--at=${observedAt}`]), /"mode": "dry-run"/);
  assert.match(run('scripts/operator-findings.mjs', ['validate', `--file=${findingsFile}`]), /"ok": true/);
  assert.match(run('scripts/operator-objective.mjs', ['select', `--file=${findingsFile}`, `--lock=${lockFile}`, `--at=${observedAt}`]), /"mode": "dry-run"/);
  assert.match(run('scripts/operator-objective.mjs', ['select', `--file=${rankedFindingsFile}`, `--lock=${lockFile}`, `--at=${observedAt}`]), /"mode": "dry-run"/);
  assert.equal(existsSync(lockFile), false, 'objective selection must not write its lock in dry-run mode');
} finally {
  rmSync(fixtureDir, { recursive: true, force: true });
}

console.log('Operator backbone contract passed.');
