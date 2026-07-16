import { MAX_FINDINGS_PER_REPORT, rankFindings, validateFinding } from './operator-findings.mjs';

const DAILY_SECTION_NAMES = ['Company', 'Product', 'Data', 'Shipping', 'Decision', 'Today'];

function canonicalFindings(findings) {
  return (findings || []).map((finding) => {
    const canonical = { ...finding };
    delete canonical.rankScore;
    const validation = validateFinding(canonical);
    if (!validation.ok) throw new Error(`Invalid brief finding ${canonical.id || 'unknown'}: ${validation.errors.join('; ')}`);
    return canonical;
  });
}

function metricsBullets(section) {
  return Object.entries(section?.metrics || {}).slice(0, 8).map(([key, value]) => `${key}: ${value ?? 'unavailable'}`);
}

function objectiveFrom(ranked) {
  const active = ranked.filter((finding) => ['selected', 'in-progress'].includes(finding.status));
  if (active.length > 1) throw new Error('Multiple active objectives violate the single-objective policy.');
  return active[0] || ranked.find((finding) => finding.status === 'backlog') || null;
}

function boundedWithObjective(ranked, objective) {
  const bounded = ranked.slice(0, MAX_FINDINGS_PER_REPORT);
  if (objective && !bounded.some((finding) => finding.id === objective.id)) {
    bounded[bounded.length - 1] = objective;
    bounded.sort((left, right) => right.rankScore - left.rankScore || left.id.localeCompare(right.id));
  }
  return bounded;
}

export function buildDailyCompanyBrief({ scorecard, findings = [], generatedAt }) {
  if (scorecard?.contractVersion !== 'bourbon-signal/company-scorecard@1') throw new Error('A canonical company scorecard is required.');
  const allRanked = rankFindings(canonicalFindings(findings));
  const top = objectiveFrom(allRanked);
  const ranked = boundedWithObjective(allRanked, top);
  const sectionFor = (name) => scorecard.sections[name.toLowerCase()] || { status: 'unknown', headline: 'Unavailable', metrics: {} };
  const sections = DAILY_SECTION_NAMES.slice(0, 5).map((name) => {
    const section = sectionFor(name);
    return { name, status: section.status, bullets: [section.headline, ...metricsBullets(section)].slice(0, 9) };
  });
  sections.push({
    name: 'Today',
    status: top ? 'focus' : 'clear',
    bullets: top
      ? [`Single objective: ${top.title}`, `Action: ${top.recommendedAction}`, `Finding: ${top.id}`, `Rank score: ${top.rankScore}`]
      : ['No eligible finding is available. Preserve the current system and collect another scorecard.'],
  });
  return {
    contractVersion: 'bourbon-signal/daily-company-brief@1',
    generatedAt,
    scorecardGeneratedAt: scorecard.generatedAt,
    sections,
    findingIds: ranked.map((finding) => finding.id),
  };
}

export function renderDailyCompanyBrief(brief) {
  const lines = [`# Bourbon Signal Daily Company Brief — ${String(brief.generatedAt).slice(0, 10)}`, ''];
  for (const section of brief.sections) {
    lines.push(`## ${section.name}`, '');
    for (const bullet of section.bullets) lines.push(`- ${bullet}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function buildWeeklyStrategyReview({ scorecard, findings = [], generatedAt }) {
  if (scorecard?.contractVersion !== 'bourbon-signal/company-scorecard@1') throw new Error('A canonical company scorecard is required.');
  const allRanked = rankFindings(canonicalFindings(findings));
  const top = objectiveFrom(allRanked);
  const ranked = boundedWithObjective(allRanked, top);
  return {
    contractVersion: 'bourbon-signal/weekly-strategy-review@1',
    generatedAt,
    scorecardGeneratedAt: scorecard.generatedAt,
    scorecardStatus: Object.fromEntries(Object.entries(scorecard.sections).map(([name, section]) => [name, section.status])),
    objective: top ? { findingId: top.id, title: top.title, action: top.recommendedAction, rankScore: top.rankScore } : null,
    findings: ranked.map((finding) => ({ id: finding.id, title: finding.title, area: finding.area, severity: finding.severity, rankScore: finding.rankScore })),
    decisions: scorecard.sections.decision?.attention || [],
  };
}

export function renderWeeklyStrategyReview(review) {
  const lines = [
    `# Bourbon Signal Weekly Strategy Review — ${String(review.generatedAt).slice(0, 10)}`,
    '',
    '## Company scorecard',
    '',
  ];
  for (const [name, status] of Object.entries(review.scorecardStatus)) lines.push(`- ${name}: ${status}`);
  lines.push('', '## Ranked findings', '');
  if (review.findings.length) for (const item of review.findings) lines.push(`- ${item.rankScore} — ${item.title} (${item.id})`);
  else lines.push('- No eligible findings.');
  lines.push('', '## Single objective', '');
  if (review.objective) lines.push(`- ${review.objective.title}`, `- Action: ${review.objective.action}`, `- Finding: ${review.objective.findingId}`);
  else lines.push('- No objective selected.');
  lines.push('', '## Decisions', '');
  if (review.decisions.length) for (const decision of review.decisions) lines.push(`- ${decision}`);
  else lines.push('- No decision flags.');
  lines.push('', '## Next week', '', review.objective ? `Complete or explicitly release ${review.objective.findingId} before selecting another objective.` : 'Collect the next scorecard and rank new findings.', '');
  return lines.join('\n');
}
