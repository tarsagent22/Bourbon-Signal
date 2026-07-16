import { createHash } from 'node:crypto';

export const FINDING_CONTRACT_VERSION = 'bourbon-signal/finding@1';
export const MAX_FINDINGS_PER_REPORT = 8;
export const FINDING_BODY_MARKER = '<!-- bourbon-signal-finding:v1 -->';

const SOURCES = new Set(['daily-reliability', 'weekly-engine-brief', 'source-roi', 'release-radar', 'company-scorecard']);
const AREAS = new Set(['company', 'product', 'data', 'shipping', 'decision']);
const SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);
const STATUSES = new Set(['backlog', 'selected', 'in-progress', 'blocked', 'resolved', 'dismissed']);
const UPSERT_REFRESH_FIELDS = [
  'area',
  'severity',
  'title',
  'summary',
  'evidence',
  'recommendedAction',
  'impact',
  'urgency',
  'confidence',
  'effort',
  'observedAt',
];
const FIELDS = new Set([
  'contractVersion',
  'id',
  'source',
  'sourceKey',
  'area',
  'severity',
  'title',
  'summary',
  'evidence',
  'recommendedAction',
  'impact',
  'urgency',
  'confidence',
  'effort',
  'status',
  'observedAt',
]);

function clean(value) {
  return String(value ?? '').trim();
}

function stableId(source, sourceKey) {
  const hash = createHash('sha256').update(`${source}\n${sourceKey}`).digest('hex').slice(0, 16);
  return `bsf-${hash}`;
}

function labelsFor(finding) {
  return [
    'operator-finding',
    `area:${finding.area}`,
    `severity:${finding.severity}`,
    `status:${finding.status}`,
  ];
}

function issueTitle(finding) {
  return `[Finding] ${finding.title}`;
}

function parseLabels(labels) {
  return (labels || []).map((label) => typeof label === 'string' ? label : label?.name).filter(Boolean).sort();
}

function managedLabels(labels) {
  return parseLabels(labels).filter((label) => label === 'operator-finding' || /^(area|severity|status):/.test(label));
}

function sameStrings(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function refreshExistingFinding(current, observation) {
  const refreshed = { ...current };
  for (const field of UPSERT_REFRESH_FIELDS) refreshed[field] = observation[field];
  return refreshed;
}

export function buildFinding(input) {
  const source = clean(input.source);
  const sourceKey = clean(input.sourceKey);
  const finding = {
    contractVersion: FINDING_CONTRACT_VERSION,
    id: stableId(source, sourceKey),
    source,
    sourceKey,
    area: clean(input.area),
    severity: clean(input.severity),
    title: clean(input.title),
    summary: clean(input.summary),
    evidence: Array.isArray(input.evidence) ? input.evidence.map(clean).filter(Boolean) : [],
    recommendedAction: clean(input.recommendedAction),
    impact: Number(input.impact),
    urgency: Number(input.urgency),
    confidence: Number(input.confidence),
    effort: Number(input.effort),
    status: clean(input.status || 'backlog'),
    observedAt: clean(input.observedAt),
  };
  const validation = validateFinding(finding);
  if (!validation.ok) throw new Error(`Invalid finding: ${validation.errors.join('; ')}`);
  return finding;
}

export function validateFinding(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, errors: ['finding must be an object'] };
  for (const key of Object.keys(value)) if (!FIELDS.has(key)) errors.push(`unknown field: ${key}`);
  if (value.contractVersion !== FINDING_CONTRACT_VERSION) errors.push(`contractVersion must be ${FINDING_CONTRACT_VERSION}`);
  if (!/^bsf-[a-f0-9]{16}$/.test(clean(value.id))) errors.push('id must be a stable bsf identifier');
  if (!SOURCES.has(value.source)) errors.push('source is invalid');
  if (!clean(value.sourceKey) || clean(value.sourceKey).length > 160) errors.push('sourceKey must be 1-160 characters');
  if (SOURCES.has(value.source) && clean(value.sourceKey) && value.id !== stableId(value.source, clean(value.sourceKey))) errors.push('id does not match source and sourceKey');
  if (!AREAS.has(value.area)) errors.push('area is invalid');
  if (!SEVERITIES.has(value.severity)) errors.push('severity is invalid');
  if (!clean(value.title) || clean(value.title).length > 120) errors.push('title must be 1-120 characters');
  if (!clean(value.summary) || clean(value.summary).length > 500) errors.push('summary must be 1-500 characters');
  if (!Array.isArray(value.evidence)) errors.push('evidence must be an array');
  else {
    if (value.evidence.length > 5) errors.push('evidence must contain at most 5 items');
    for (const item of value.evidence) if (!clean(item) || clean(item).length > 240) errors.push('each evidence item must be 1-240 characters');
  }
  if (!clean(value.recommendedAction) || clean(value.recommendedAction).length > 400) errors.push('recommendedAction must be 1-400 characters');
  for (const field of ['impact', 'urgency', 'effort']) {
    if (!Number.isInteger(value[field]) || value[field] < 1 || value[field] > 5) errors.push(`${field} must be an integer from 1-5`);
  }
  if (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) errors.push('confidence must be from 0-1');
  if (!STATUSES.has(value.status)) errors.push('status is invalid');
  if (!/^\d{4}-\d{2}-\d{2}T/.test(clean(value.observedAt)) || Number.isNaN(Date.parse(value.observedAt))) errors.push('observedAt must be an ISO date-time');
  return { ok: errors.length === 0, errors };
}

export function findingRankScore(finding) {
  const severity = { critical: 40, high: 25, medium: 12, low: 4 }[finding.severity] || 0;
  return Math.round((finding.impact * 40) + (finding.urgency * 30) + (finding.confidence * 20) + severity - (finding.effort * 10));
}

export function rankFindings(findings) {
  return findings
    .map((finding) => {
      const validation = validateFinding(finding);
      if (!validation.ok) throw new Error(`Cannot rank invalid finding ${finding?.id || 'unknown'}: ${validation.errors.join('; ')}`);
      return { ...finding, rankScore: findingRankScore(finding) };
    })
    .sort((left, right) => right.rankScore - left.rankScore || left.id.localeCompare(right.id));
}

export function renderFindingIssueBody(finding) {
  const validation = validateFinding(finding);
  if (!validation.ok) throw new Error(`Cannot render invalid finding: ${validation.errors.join('; ')}`);
  return [
    FINDING_BODY_MARKER,
    '',
    '```json',
    JSON.stringify(finding, null, 2),
    '```',
    '',
    '## Operator view',
    '',
    finding.summary,
    '',
    `**Recommended action:** ${finding.recommendedAction}`,
    '',
    `**Evidence:** ${finding.evidence.length ? finding.evidence.join(' | ') : 'No additional evidence.'}`,
    '',
    '_The JSON block is canonical. Edit it through the operator finding tooling._',
  ].join('\n');
}

export function parseFindingIssueBody(body) {
  const text = clean(body);
  if (!text.includes(FINDING_BODY_MARKER)) return null;
  const match = text.match(/<!-- bourbon-signal-finding:v1 -->[\s\S]*?```json\s*([\s\S]*?)\s*```/);
  if (!match) throw new Error('Finding marker exists without a canonical JSON block.');
  const finding = JSON.parse(match[1]);
  const validation = validateFinding(finding);
  if (!validation.ok) throw new Error(`Invalid finding issue body: ${validation.errors.join('; ')}`);
  return finding;
}

export function createFindingService({ runGh }) {
  if (typeof runGh !== 'function') throw new Error('runGh is required');

  async function read({ repo, state = 'all' }) {
    const args = ['issue', 'list', '--state', state, '--limit', '1000', '--json', 'number,title,body,state,labels,url'];
    if (repo) args.push('--repo', repo);
    const issues = await runGh(args);
    if (!Array.isArray(issues)) throw new Error('gh issue list must return a JSON array');
    return issues
      .map((issue) => {
        const parsed = parseFindingIssueBody(issue.body || '');
        return parsed ? { issue, finding: parsed } : null;
      })
      .filter(Boolean)
      .sort((left, right) => left.issue.number - right.issue.number);
  }

  async function upsert({ findings, repo, apply = false }) {
    if (!Array.isArray(findings) || findings.length > MAX_FINDINGS_PER_REPORT) throw new Error(`upsert accepts at most ${MAX_FINDINGS_PER_REPORT} findings`);
    for (const finding of findings) {
      const validation = validateFinding(finding);
      if (!validation.ok) throw new Error(`Invalid finding ${finding?.id || 'unknown'}: ${validation.errors.join('; ')}`);
    }
    const existing = await read({ repo });
    const byId = new Map(existing.map((entry) => [entry.finding.id, entry]));
    const actions = findings.map((observation) => {
      const current = byId.get(observation.id);
      if (!current) return { action: 'create', finding: observation };
      const finding = refreshExistingFinding(current.finding, observation);
      const title = issueTitle(finding);
      const body = renderFindingIssueBody(finding);
      const labels = labelsFor(finding);
      const currentLabels = managedLabels(current.issue.labels);
      const unchanged = current.issue.title === title
        && current.issue.body === body
        && sameStrings(currentLabels, labels);
      return {
        action: unchanged ? 'noop' : 'update',
        finding,
        issueNumber: current.issue.number,
        removeLabels: currentLabels.filter((label) => !labels.includes(label)),
        issueState: current.issue.state,
      };
    });
    if (apply) {
      for (const action of actions) {
        if (action.action === 'noop') continue;
        const finding = action.finding;
        const args = action.action === 'create'
          ? ['issue', 'create', '--title', issueTitle(finding), '--body', renderFindingIssueBody(finding)]
          : ['issue', 'edit', String(action.issueNumber), '--title', issueTitle(finding), '--body', renderFindingIssueBody(finding)];
        for (const label of labelsFor(finding)) args.push(action.action === 'create' ? '--label' : '--add-label', label);
        for (const label of action.removeLabels || []) args.push('--remove-label', label);
        if (repo) args.push('--repo', repo);
        await runGh(args);
      }
    }
    return { mode: apply ? 'apply' : 'dry-run', actions };
  }

  async function update({ id, status, repo, apply = false, expectedStatuses = null, expectedIssueNumber = null }) {
    if (!STATUSES.has(status)) throw new Error(`Invalid status: ${status}`);
    const existing = await read({ repo });
    const current = existing.find((entry) => entry.finding.id === id);
    if (!current) throw new Error(`Finding not found: ${id}`);
    if (expectedIssueNumber != null && current.issue.number !== expectedIssueNumber) {
      throw new Error(`Finding ${id} is issue #${current.issue.number}, not expected issue #${expectedIssueNumber}.`);
    }
    if (expectedStatuses && !expectedStatuses.includes(current.finding.status)) {
      throw new Error(`Finding ${id} cannot move to ${status}; canonical status is already ${current.finding.status}.`);
    }
    const finding = { ...current.finding, status };
    const validation = validateFinding(finding);
    if (!validation.ok) throw new Error(`Invalid updated finding: ${validation.errors.join('; ')}`);
    const desiredLabels = labelsFor(finding);
    const currentLabels = managedLabels(current.issue.labels);
    const stateMismatch = ['resolved', 'dismissed'].includes(status) !== (current.issue.state === 'CLOSED');
    const action = {
      action: current.finding.status === status && !stateMismatch && sameStrings(currentLabels, desiredLabels) ? 'noop' : 'update',
      finding,
      issueNumber: current.issue.number,
      removeLabels: currentLabels.filter((label) => !desiredLabels.includes(label)),
    };
    if (apply && action.action === 'update') {
      const args = ['issue', 'edit', String(current.issue.number), '--body', renderFindingIssueBody(finding)];
      for (const label of desiredLabels) args.push('--add-label', label);
      for (const label of action.removeLabels) args.push('--remove-label', label);
      if (repo) args.push('--repo', repo);
      await runGh(args);
      if ((status === 'resolved' || status === 'dismissed') && current.issue.state !== 'CLOSED') {
        const closeArgs = ['issue', 'close', String(current.issue.number), '--reason', status === 'resolved' ? 'completed' : 'not planned'];
        if (repo) closeArgs.push('--repo', repo);
        await runGh(closeArgs);
      }
      if (!['resolved', 'dismissed'].includes(status) && current.issue.state === 'CLOSED') {
        const reopenArgs = ['issue', 'reopen', String(current.issue.number)];
        if (repo) reopenArgs.push('--repo', repo);
        await runGh(reopenArgs);
      }
    }
    return { mode: apply ? 'apply' : 'dry-run', action };
  }

  return { read, upsert, update };
}

export const findingEnums = {
  sources: [...SOURCES],
  areas: [...AREAS],
  severities: [...SEVERITIES],
  statuses: [...STATUSES],
};
