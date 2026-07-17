import { MAX_FINDINGS_PER_REPORT, buildFinding, rankFindings } from './operator-findings.mjs';

function text(value, max) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized.slice(0, max);
}

function key(value) {
  return text(value, 140).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
}

function evidence(items) {
  return (items || []).map((item) => text(item, 240)).filter(Boolean).slice(0, 5);
}

function bounded(findings) {
  const seen = new Set();
  return rankFindings(findings)
    .filter((finding) => {
      if (seen.has(finding.id)) return false;
      seen.add(finding.id);
      return true;
    })
    .slice(0, MAX_FINDINGS_PER_REPORT)
    .map(({ rankScore: _rankScore, ...finding }) => finding);
}

function dailyIdentity(value) {
  return key(String(value || '').replace(/\d+(?:\.\d+)?/g, 'count'));
}

function severityFromDaily(value) {
  return ({ critical: 'critical', warn: 'high', watch: 'medium', info: 'low' })[value] || 'medium';
}

function dailyArea(value) {
  const area = String(value || '').toLowerCase();
  if (/production|signup|legal/.test(area)) return 'shipping';
  if (/alert/.test(area)) return 'shipping';
  if (/engine|source|timestamp|coverage|browser/.test(area)) return 'data';
  return 'product';
}

export function findingsFromDailyReliability(report) {
  return bounded((report?.issues || []).map((issue) => buildFinding({
    source: 'daily-reliability',
    sourceKey: `${key(issue.area)}:${dailyIdentity(issue.message)}`,
    area: dailyArea(issue.area),
    severity: severityFromDaily(issue.severity),
    title: text(issue.message, 120),
    summary: text(issue.detail ? `${issue.message}: ${issue.detail}` : issue.message, 500),
    evidence: evidence([issue.detail].filter(Boolean)),
    recommendedAction: text(`Investigate ${issue.area || 'the affected system'} and verify the finding is cleared before expansion.`, 400),
    impact: issue.severity === 'critical' ? 5 : issue.severity === 'warn' ? 4 : 2,
    urgency: issue.severity === 'critical' ? 5 : issue.severity === 'warn' ? 4 : 2,
    confidence: issue.detail ? 0.95 : 0.85,
    effort: 3,
    observedAt: report.generatedAt,
  })));
}

export function findingsFromWeeklyEngineBrief(report) {
  return bounded((report?.recommendations || []).map((recommendation) => {
    const score = Number(recommendation.score || 0);
    return buildFinding({
      source: 'weekly-engine-brief',
      sourceKey: key(recommendation.title),
      area: 'data',
      severity: score >= 90 ? 'critical' : score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low',
      title: text(recommendation.title, 120),
      summary: text(recommendation.reason, 500),
      evidence: evidence(recommendation.evidence),
      recommendedAction: text(recommendation.recommendedAction, 400),
      impact: score >= 85 ? 5 : score >= 60 ? 4 : score >= 35 ? 3 : 2,
      urgency: score >= 90 ? 5 : score >= 65 ? 4 : score >= 40 ? 3 : 2,
      confidence: recommendation.evidence?.length ? 0.9 : 0.75,
      effort: 3,
      observedAt: report.generatedAt,
    });
  }));
}

export function findingsFromSourceRoi(report) {
  const actionable = (report?.top || []).filter((row) => row.recommendation !== 'monitor');
  const sourceFindings = actionable.map((row) => {
    const repair = row.recommendation === 'repair_high_value_source';
    return buildFinding({
      source: 'source-roi',
      sourceKey: `${key(row.state)}:${key(row.source)}:${key(row.recommendation)}`,
      area: 'data',
      severity: repair ? 'high' : row.recommendation === 'demote_or_tighten_noise' ? 'medium' : 'low',
      title: text(`${row.state} ${row.source}: ${String(row.recommendation).replaceAll('_', ' ')}`, 120),
      summary: text(`${row.source} scored ${row.score} with ${row.alerts || 0} alerts, ${row.storeLevel || 0} store-level rows, and ${row.roadblocks || 0} roadblocks.`, 500),
      evidence: evidence(row.topIssues),
      recommendedAction: text(repair ? 'Repair the high-value source and rerun source health before expanding it.' : `Apply the ${String(row.recommendation).replaceAll('_', ' ')} source policy and verify public signal semantics.`, 400),
      impact: repair ? 4 : 3,
      urgency: repair ? 4 : 2,
      confidence: 0.85,
      effort: repair ? 3 : 2,
      observedAt: report.generatedAt,
    });
  });
  const expansionFindings = (report?.expansionTop || []).map((row) => {
    const expansionReady = row.recommendation === 'expand_state_vertical_slice';
    const inputs = row.rankingInputs || {};
    return buildFinding({
      source: 'source-roi',
      sourceKey: `expansion:${key(row.state)}:${key(row.source)}`,
      area: 'data',
      severity: expansionReady ? 'medium' : 'low',
      title: text(`${row.state} ${row.source}: ${String(row.recommendation).replaceAll('_', ' ')}`, 120),
      summary: text(`${row.source} scored ${row.score} from aggregate demand, source authority, reachability, stability, budget, and reversibility inputs.`, 500),
      evidence: evidence([`authority ${inputs.sourceAuthority || 'unknown'}`, `reachability ${inputs.runnerReachability ?? 0}`, `request budget ${inputs.expectedRequestBudget ?? 0}`]),
      recommendedAction: text(expansionReady ? 'Build one complete state vertical slice, then validate the autonomous activation contract.' : 'Collect deterministic source evidence or harden the source before considering a state vertical slice.', 400),
      impact: expansionReady ? 4 : 2,
      urgency: expansionReady ? 3 : 1,
      confidence: expansionReady ? 0.85 : 0.65,
      effort: Math.min(5, Math.max(1, Number(inputs.implementationEffort) || 3)),
      observedAt: report.generatedAt,
    });
  });
  return bounded([...sourceFindings, ...expansionFindings]);
}

export function findingsFromRadar(report) {
  const pending = (report?.reportedStories || []).filter((story) => story.status === 'reported');
  return bounded(pending.map((story) => buildFinding({
    source: 'release-radar',
    sourceKey: key(story.url || story.title),
    area: 'product',
    severity: 'low',
    title: text(`Review Radar placement: ${story.title}`, 120),
    summary: text(`${story.title} is in the Radar scouting ledger but has no recorded product placement.`, 500),
    evidence: evidence([story.source, story.url]),
    recommendedAction: 'Decide whether to place, defer, or dismiss the story; do not publish from this finding automatically.',
    impact: 2,
    urgency: 2,
    confidence: 0.9,
    effort: 1,
    observedAt: report.updatedAt,
  })));
}
