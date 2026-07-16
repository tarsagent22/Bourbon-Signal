import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildAutomationCostReport, sanitizeAutomationRun } from '../automation/bourbon-signal/automation-cost-report.mjs';
import { classifyBottleQueueItem, processBottleQueue } from '../automation/bourbon-signal/bottle-queue-autoprocess.mjs';
import { buildSourceExpansionCollection } from '../automation/bourbon-signal/source-expansion-collector.mjs';
import { collectReleaseRadarLeads } from '../automation/bourbon-signal/release-radar-lead-collector.mjs';
import { classifyExpansionAutonomy } from '../automation/bourbon-signal/autonomy-threshold.mjs';
import { rankSourceInvestments } from '../automation/bourbon-signal/source-roi-core.mjs';
import { buildDailyCompanyBrief, buildWeeklyStrategyReview } from './lib/operator-briefs.mjs';
import { buildFinding } from './lib/operator-findings.mjs';
import { buildCompanyScorecard } from '../src/lib/company-control-room.ts';

const root = resolve('.');
const registryPath = resolve('automation/bourbon-signal/automation-registry.json');
const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
assert.equal(registry.schemaVersion, 1);
assert.ok(registry.automations.some((entry) => entry.id === 'github-engine-watchdog' && entry.executionClass === 'script_only'));
assert.ok(registry.automations.some((entry) => entry.id === 'hermes-bottle-queue' && entry.executionClass === 'script_only'));
execFileSync(process.execPath, ['scripts/verify-automation-registry.mjs'], { cwd: root, stdio: 'pipe' });

const cost = buildAutomationCostReport({
  generatedAt: '2026-07-16T12:00:00.000Z',
  registry,
  runs: [
    { jobId: 'github-refresh-feed', status: 'success', braveQueries: 2, httpProbes: 9, browserPages: 1, statesDiscovered: 2, sourcesDiscovered: 7, sourcesPromoted: 1, coverageDelta: 1 },
    { jobId: 'hermes-daily-operator', status: 'failed', tokens: 1200, usefulFindings: 3, objectivesCompleted: 1 },
    { jobId: 'hermes-bottle-queue', status: 'success', tokens: 999999, prompt: 'must not survive', memberEmail: 'must not survive' },
  ],
});
assert.equal(cost.contractVersion, 'bourbon-signal/automation-cost@1');
assert.equal(cost.totals.deterministicRuns, 2);
assert.equal(cost.totals.agentRuns, 1);
assert.equal(cost.totals.failedRuns, 1);
assert.equal(cost.totals.braveQueries, 2);
assert.equal(cost.totals.directHttpProbes, 9);
assert.equal(cost.totals.headlessBrowserPages, 1);
assert.equal(cost.totals.sourcesDiscovered, 7);
assert.equal(cost.totals.sourcesPromoted, 1);
assert.equal(cost.totals.tokens, 1200, 'script-only jobs cannot contribute LLM token totals');
assert.equal(cost.totals.averageTokensPerUsefulFinding, 400);
assert.equal(JSON.stringify(cost).includes('must not survive'), false);
assert.equal(Object.keys(cost.byJob).includes('hermes-bottle-queue'), true);
assert.deepEqual(sanitizeAutomationRun({ jobId: 'hermes-daily-operator', status: 'success', tokens: 11, prompt: 'secret prompt', userId: 'private' }, registry), {
  jobId: 'hermes-daily-operator', executionClass: 'agent', failed: false, tokens: 11,
  braveQueries: 0, httpProbes: 0, browserPages: 0, statesDiscovered: 0, sourcesDiscovered: 0, statesPromoted: 0, sourcesPromoted: 0, usefulFindings: 0, objectivesCompleted: 0, coverageDelta: 0,
});

assert.equal(classifyBottleQueueItem({ confidence: 'high', candidateBottleId: 'weller-12', candidateBottleName: 'Weller 12' }).safe, true);
assert.equal(classifyBottleQueueItem({ confidence: 'medium', duplicateCount: 3, candidateBottleId: 'weller-12', candidateBottleName: 'Weller 12' }).safe, false);
const bottleCalls = [];
const bottleResult = await processBottleQueue({
  digest: [
    { id: 'safe', rawName: 'Weller 12', confidence: 'high', candidateBottleId: 'weller-12', candidateBottleName: 'Weller 12' },
    { id: 'ambiguous', rawName: 'Old mystery', duplicateCount: 3 },
  ],
  apply: true,
  update: async (body) => { bottleCalls.push(body); return { ok: true }; },
});
assert.equal(bottleCalls.length, 1, 'only deterministic actions may be applied');
assert.deepEqual(bottleResult.ambiguity, {
  type: 'bottle_queue_ambiguity',
  count: 1,
  items: [{ id: 'ambiguous', action: 'needs_human_priority', reason: 'Repeated unknown bottle request.' }],
});

const sourceCollection = await buildSourceExpansionCollection({
  states: ['CO', 'MA'],
  execute: true,
  run: async ({ stage, states }) => ({ stage, states, ok: true, artifact: `engine/out/${stage}.json`, summary: { candidates: 2, probeable: 1 }, expansionCandidates: stage === 'discovery' ? [{ state: 'CO', source: 'Official CO inventory', aggregateDemand: 8, sourceAuthority: 'official', runnerReachability: 0.9, sourceStability: 0.9, implementationEffort: 2, reversibility: 1 }] : [] }),
  generatedAt: '2026-07-16T12:00:00.000Z',
});
assert.equal(sourceCollection.canPromote, false);
assert.equal(sourceCollection.canPublish, false);
assert.deepEqual(sourceCollection.states, ['CO', 'MA']);
assert.equal(sourceCollection.stages.length, 2);
assert.equal(sourceCollection.summary.candidates, 4);
assert.equal(sourceCollection.expansionCandidates.length, 1);
assert.equal(sourceCollection.expansionCandidates[0].source, 'Official CO inventory');

const leadCollection = await collectReleaseRadarLeads({
  results: [
    { title: 'Official new release', url: 'https://distillery.example/releases?utm_source=brave', description: 'A release announcement.' },
    { title: 'Official new release duplicate', url: 'https://distillery.example/releases', description: 'Duplicate.' },
    { title: 'Unsafe', url: 'http://unsafe.example/release', description: 'Ignore.' },
  ],
  existingLedger: { leads: [] },
  generatedAt: '2026-07-16T12:00:00.000Z',
});
assert.equal(leadCollection.canPublish, false);
assert.equal(leadCollection.leads.length, 1);
assert.equal(leadCollection.leads[0].status, 'new');
assert.equal(leadCollection.leads[0].url, 'https://distillery.example/releases');
assert.equal(leadCollection.leads[0].availabilitySemantics, 'announcement_only');

const safeAutonomy = classifyExpansionAutonomy({
  sourceAuthority: 'official', termsStatus: 'clear', authentication: 'none', identity: 'exact_store', availabilitySemantics: 'honest', verticalSlice: 'complete', shadowRuns: 3, canaryRuns: 2, withinBudget: true, reversible: true, outboundChange: false, pricingOrEntitlementChange: false, legalUncertainty: false,
});
assert.deepEqual(safeAutonomy, { lane: 'safe_autonomous', reasons: [] });
const approvalRequired = classifyExpansionAutonomy({ ...safeAutonomy, sourceAuthority: 'private', termsStatus: 'ambiguous', authentication: 'login', identity: 'ambiguous', availabilitySemantics: 'honest', verticalSlice: 'complete', shadowRuns: 3, canaryRuns: 2, withinBudget: true, reversible: true, outboundChange: true, pricingOrEntitlementChange: false, legalUncertainty: true });
assert.equal(approvalRequired.lane, 'approval_required');
assert.ok(approvalRequired.reasons.includes('authenticated_source'));
assert.ok(approvalRequired.reasons.includes('legal_or_terms_uncertainty'));

const ranked = rankSourceInvestments({
  expansionCandidates: [
    { state: 'SMALL', source: 'Official inventory', aggregateDemand: 24, paidMemberOverlap: 7, canonicalBottleDemand: 9, coverageTier: 'research_only', exactStoreGap: 5, alertGradeGap: 2, sourceAuthority: 'official', runnerReachability: 0.95, expectedRequestBudget: 4, sourceStability: 0.9, implementationEffort: 2, reversibility: 1, strategicAdjacency: 3 },
    { state: 'LARGE', source: 'Unclear catalog', aggregateDemand: 100, paidMemberOverlap: 0, canonicalBottleDemand: 0, coverageTier: 'research_only', exactStoreGap: 0, alertGradeGap: 0, sourceAuthority: 'unknown', runnerReachability: 0.2, expectedRequestBudget: 80, sourceStability: 0.1, implementationEffort: 5, reversibility: 5, strategicAdjacency: 0 },
  ],
  generatedAt: '2026-07-16T12:00:00.000Z',
});
assert.equal(ranked.expansionTop[0].state, 'SMALL', 'high-confidence member value can outrank population-style demand alone');
assert.equal(ranked.expansionTop[0].recommendation, 'expand_state_vertical_slice');

const scorecard = buildCompanyScorecard({
  checkedAt: '2026-07-16T12:00:00.000Z',
  memberships: { counts: {} }, revenue: {}, audience: {}, growth: {}, lifecycle: {}, retailer: {}, engine: {}, alerts: {}, release: {},
  automation: cost,
}, '2026-07-16T12:00:00.000Z');
assert.equal(scorecard.sections.data.metrics.automationDeterministicRuns, 2);
assert.equal(scorecard.sections.data.metrics.automationAgentRuns, 1);
assert.equal(scorecard.sections.data.metrics.automationTokens, 1200);
assert.equal(JSON.stringify(scorecard).includes('must not survive'), false);

const finding = buildFinding({ source: 'source-roi', sourceKey: 'small-official', area: 'data', severity: 'medium', title: 'Expand SMALL', summary: 'Safe value.', evidence: [], recommendedAction: 'Expand it.', impact: 3, urgency: 3, confidence: 0.9, effort: 2, observedAt: '2026-07-16T12:00:00.000Z' });
const daily = buildDailyCompanyBrief({ scorecard, findings: [finding], generatedAt: '2026-07-16T12:00:00.000Z' });
assert.equal(daily.context.maxFindings, 8);
assert.equal(daily.context.objectiveId, finding.id);
assert.equal(JSON.stringify(daily.context).includes('Safe value.'), false, 'brief context is a compact index, not finding bodies');
const weekly = buildWeeklyStrategyReview({ scorecard, findings: [finding], generatedAt: '2026-07-16T12:00:00.000Z' });
assert.equal(weekly.context.objectiveId, finding.id);
assert.equal(weekly.context.autonomyContract, 'bourbon-signal/autonomy-threshold@1');

const temp = mkdtempSync(join(tmpdir(), 'automation-cost-'));
try {
  const runs = join(temp, 'runs.json');
  const output = join(temp, 'cost.json');
  writeFileSync(runs, JSON.stringify({ runs: [{ jobId: 'hermes-bottle-queue', status: 'success' }] }));
  const run = execFileSync(process.execPath, [resolve('automation/bourbon-signal/automation-cost-report.mjs'), `--input=${runs}`, `--output=${output}`, '--apply'], { encoding: 'utf8' });
  assert.equal(run.trim(), '', 'healthy script-only cost aggregation should be quiet unless explicitly printed');
  assert.equal(JSON.parse(readFileSync(output, 'utf8')).totals.deterministicRuns, 1);
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log('Agent-cost automation contracts passed.');
