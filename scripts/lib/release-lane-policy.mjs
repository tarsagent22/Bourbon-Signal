const SHA_RE = /^[a-f0-9]{40}$/i;

function normalizePullRequest(value) {
  return {
    number: Number(value?.number || 0),
    headRefName: String(value?.headRefName || ''),
    baseRefName: String(value?.baseRefName || ''),
    isDraft: value?.isDraft === true,
    headRefOid: String(value?.headRefOid || ''),
  };
}

export function validateSingleReleaseLane(pullRequests, { objective = null } = {}) {
  const open = (Array.isArray(pullRequests) ? pullRequests : []).map(normalizePullRequest);
  if (open.length > 1) {
    return {
      ok: false,
      pullRequest: null,
      reason: `Exactly one active release lane is allowed; found ${open.length} open pull requests.`,
    };
  }
  const pullRequest = open[0] || null;
  if (!pullRequest) return { ok: true, pullRequest: null };
  if (!objective) {
    return {
      ok: false,
      pullRequest,
      reason: `An existing pull request must be reconciled before selecting another objective: #${pullRequest.number} (${pullRequest.headRefName}).`,
    };
  }
  if (pullRequest.headRefName !== String(objective.branch || '')) {
    return {
      ok: false,
      pullRequest,
      reason: `Open pull request #${pullRequest.number} (${pullRequest.headRefName}) does not match the locked objective branch ${objective.branch}.`,
    };
  }
  if (pullRequest.baseRefName !== 'main') {
    return {
      ok: false,
      pullRequest,
      reason: `The active release pull request must target main, not ${pullRequest.baseRefName || 'an unknown base'}.`,
    };
  }
  if (!pullRequest.isDraft) {
    return {
      ok: false,
      pullRequest,
      reason: `The automation-owned pull request must remain draft until Chandler explicitly promotes the release.`,
    };
  }
  return { ok: true, pullRequest };
}

export function validateReleaseAdmission(pullRequests, { expectedMainSha, currentMainSha }) {
  const open = Array.isArray(pullRequests) ? pullRequests : [];
  if (open.length > 0) {
    return { ok: false, reason: `Release admission requires an empty lane; found ${open.length} open pull request${open.length === 1 ? '' : 's'}.` };
  }
  const expected = String(expectedMainSha || '');
  const current = String(currentMainSha || '');
  if (!SHA_RE.test(expected) || !SHA_RE.test(current)) {
    return { ok: false, reason: 'Release admission requires two 40-character commit SHAs.' };
  }
  if (expected.toLowerCase() !== current.toLowerCase()) {
    return { ok: false, reason: `Release admission was prepared against stale main ${expected}; current main is ${current}.` };
  }
  return { ok: true };
}

export function classifyBranchRelationship({ branchIsAncestorOfMain, mainIsAncestorOfBranch }) {
  if (branchIsAncestorOfMain && !mainIsAncestorOfBranch) return { action: 'fast_forward' };
  if (!branchIsAncestorOfMain && !mainIsAncestorOfBranch) return { action: 'stop_diverged' };
  return { action: 'continue' };
}

export function assertCurrentMain({ runSha, currentMainSha }) {
  const run = String(runSha || '');
  const current = String(currentMainSha || '');
  if (!SHA_RE.test(run) || !SHA_RE.test(current)) {
    throw new Error('Release source verification requires two 40-character commit SHAs.');
  }
  if (run.toLowerCase() !== current.toLowerCase()) {
    throw new Error(`Stale workflow refused: run commit ${run} is not current main ${current}.`);
  }
  return true;
}
