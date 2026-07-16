import { rankFindings, validateFinding } from './operator-findings.mjs';

export const OBJECTIVE_LOCK_CONTRACT_VERSION = 'bourbon-signal/operator-lock@1';

function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

export function selectObjective(findings) {
  const active = findings.filter((finding) => ['selected', 'in-progress'].includes(finding.status));
  if (active.length > 1) throw new Error('Multiple active objectives violate the single-objective policy.');
  if (active.length === 1) return rankFindings(active)[0];
  const eligible = findings.filter((finding) => !['resolved', 'dismissed', 'blocked'].includes(finding.status));
  if (!eligible.length) throw new Error('No eligible finding is available for selection.');
  return rankFindings(eligible)[0];
}

export function buildObjectiveLock({ finding, issueNumber = null, selectedAt, existingLock = null, baseBranch = 'main' }) {
  if (existingLock) throw new Error(`Objective ${existingLock.objectiveId || 'unknown'} is already locked.`);
  const canonical = { ...finding };
  delete canonical.rankScore;
  const validation = validateFinding(canonical);
  if (!validation.ok) throw new Error(`Cannot lock invalid finding: ${validation.errors.join('; ')}`);
  if (!['backlog', 'selected', 'in-progress'].includes(finding.status)) throw new Error(`Finding ${finding.id} is not eligible for an objective lock.`);
  const branch = `operator/${finding.id}-${slug(finding.title)}`;
  const lock = {
    contractVersion: OBJECTIVE_LOCK_CONTRACT_VERSION,
    objectiveId: finding.id,
    issueNumber: Number.isInteger(issueNumber) ? issueNumber : null,
    title: finding.title,
    branch,
    baseBranch,
    selectedAt: String(selectedAt || ''),
    status: 'locked',
  };
  const result = validateObjectiveLock(lock);
  if (!result.ok) throw new Error(`Invalid objective lock: ${result.errors.join('; ')}`);
  return lock;
}

export function validateObjectiveLock(lock) {
  const errors = [];
  const fields = new Set(['contractVersion', 'objectiveId', 'issueNumber', 'title', 'branch', 'baseBranch', 'selectedAt', 'status']);
  if (!lock || typeof lock !== 'object' || Array.isArray(lock)) return { ok: false, errors: ['lock must be an object'] };
  for (const field of Object.keys(lock)) if (!fields.has(field)) errors.push(`unknown field: ${field}`);
  if (lock.contractVersion !== OBJECTIVE_LOCK_CONTRACT_VERSION) errors.push(`contractVersion must be ${OBJECTIVE_LOCK_CONTRACT_VERSION}`);
  if (!/^bsf-[a-f0-9]{16}$/.test(String(lock.objectiveId || ''))) errors.push('objectiveId is invalid');
  if (lock.issueNumber !== null && (!Number.isInteger(lock.issueNumber) || lock.issueNumber <= 0)) errors.push('issueNumber must be null or a positive integer');
  if (!String(lock.title || '').trim() || String(lock.title).length > 120) errors.push('title must be 1-120 characters');
  if (!new RegExp(`^operator/${lock.objectiveId}-[a-z0-9-]{1,48}$`).test(String(lock.branch || ''))) errors.push('branch does not match the single-objective branch policy');
  if (!/^(main|release\/[a-z0-9._/-]+)$/.test(String(lock.baseBranch || ''))) errors.push('baseBranch must be main or an explicit release branch');
  if (Number.isNaN(Date.parse(lock.selectedAt))) errors.push('selectedAt must be an ISO timestamp');
  if (lock.status !== 'locked') errors.push('status must be locked');
  return { ok: errors.length === 0, errors };
}
