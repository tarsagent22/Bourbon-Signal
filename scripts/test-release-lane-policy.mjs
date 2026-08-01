import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assertCurrentMain,
  classifyBranchRelationship,
  validateReleaseAdmission,
  validateSingleReleaseLane,
} from './lib/release-lane-policy.mjs';

const objective = { branch: 'operator/bsf-0123456789abcdef-fix-source' };
const operatorPr = {
  number: 201,
  headRefName: objective.branch,
  baseRefName: 'main',
  isDraft: true,
  headRefOid: 'a'.repeat(40),
};

assert.deepEqual(validateSingleReleaseLane([], { objective: null }), { ok: true, pullRequest: null });
assert.equal(validateSingleReleaseLane([operatorPr], { objective }).ok, true);
assert.match(
  validateSingleReleaseLane([
    operatorPr,
    { ...operatorPr, number: 202, headRefName: 'fix/parallel-change' },
  ], { objective }).reason,
  /exactly one active release lane/i,
);
assert.match(
  validateSingleReleaseLane([{ ...operatorPr, headRefName: 'fix/human-work' }], { objective }).reason,
  /does not match the locked objective branch/i,
);
assert.match(
  validateSingleReleaseLane([operatorPr], { objective: null }).reason,
  /existing pull request must be reconciled before selecting another objective/i,
);
assert.match(
  validateSingleReleaseLane([{ ...operatorPr, isDraft: false }], { objective }).reason,
  /automation-owned pull request must remain draft/i,
);

assert.deepEqual(validateReleaseAdmission([], { expectedMainSha: 'a'.repeat(40), currentMainSha: 'A'.repeat(40) }), { ok: true });
assert.match(validateReleaseAdmission([operatorPr], { expectedMainSha: 'a'.repeat(40), currentMainSha: 'a'.repeat(40) }).reason, /empty lane/i);
assert.match(validateReleaseAdmission([], { expectedMainSha: 'a'.repeat(40), currentMainSha: 'b'.repeat(40) }).reason, /stale main/i);

assert.deepEqual(classifyBranchRelationship({ branchIsAncestorOfMain: false, mainIsAncestorOfBranch: true }), { action: 'continue' });
assert.deepEqual(classifyBranchRelationship({ branchIsAncestorOfMain: true, mainIsAncestorOfBranch: false }), { action: 'fast_forward' });
assert.deepEqual(classifyBranchRelationship({ branchIsAncestorOfMain: false, mainIsAncestorOfBranch: false }), { action: 'stop_diverged' });
assert.deepEqual(classifyBranchRelationship({ branchIsAncestorOfMain: true, mainIsAncestorOfBranch: true }), { action: 'continue' });

assert.doesNotThrow(() => assertCurrentMain({ runSha: 'A'.repeat(40), currentMainSha: 'a'.repeat(40) }));
assert.throws(
  () => assertCurrentMain({ runSha: 'a'.repeat(40), currentMainSha: 'b'.repeat(40) }),
  /stale workflow/i,
);
assert.throws(() => assertCurrentMain({ runSha: '', currentMainSha: 'b'.repeat(40) }), /40-character/i);

const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const releaseGuard = readFileSync(new URL('./verify-release-lane.mjs', import.meta.url), 'utf8');
const releaseLockWrapper = readFileSync(new URL('./run-with-release-lane-lock.py', import.meta.url), 'utf8');
const refresh = readFileSync(new URL('../.github/workflows/refresh-feed.yml', import.meta.url), 'utf8');
const repack = readFileSync(new URL('../.github/workflows/repack-active-snapshot.yml', import.meta.url), 'utf8');
const prompt = readFileSync(new URL('../automation/bourbon-signal/autonomous-operator-prompt.md', import.meta.url), 'utf8');
const releaseLaneWorkflow = readFileSync(new URL('../.github/workflows/release-lane.yml', import.meta.url), 'utf8');
const publisher = readFileSync(new URL('../engine/src/data-plane/publish-site-snapshot.mjs', import.meta.url), 'utf8');
assert.match(ci, /\n  single-release-lane:[\s\S]*verify-release-lane\.mjs --phase=ci/, 'the introducing PR must bootstrap an Actions-bound single-release-lane check');
assert.match(releaseLaneWorkflow, /pull_request_target:[\s\S]*checks:\s*write[\s\S]*--phase=reconcile-statuses/, 'PR changes must reconcile an Actions-bound required check on every open PR');
for (const [name, workflow] of [['refresh', refresh], ['repack', repack]]) {
  const guard = workflow.indexOf('verify-release-lane.mjs --phase=publish');
  const activation = Math.min(...['publish-site-snapshot.mjs --site-dir', '--activate-staged'].map((needle) => {
    const index = workflow.indexOf(needle);
    return index < 0 ? Number.POSITIVE_INFINITY : index;
  }));
  const postGuard = workflow.indexOf('verify-release-lane.mjs --phase=publish', guard + 1);
  assert.ok(guard >= 0 && guard < activation, `${name} must reject stale main before snapshot activation`);
  assert.ok(postGuard > activation, `${name} must recheck current main after snapshot activation`);
  assert.match(workflow, /rollback-if-active/, `${name} must roll back only its own superseded snapshot`);
}
assert.match(publisher, /rollbackIfActive[\s\S]*expectedActive/, 'snapshot rollback must compare the active snapshot identity');
assert.match(prompt, /must never mark its PR ready, merge it, deploy it, activate a production snapshot/i);
assert.match(prompt, /force-push is forbidden/i);
assert.match(releaseGuard, /assertInheritedReleaseLaneLease/);
assert.match(releaseGuard, /objective-lock\.json/);
assert.match(releaseGuard, /left open with its pending intent for owner reconciliation/i);
assert.match(releaseGuard, /sharedReleaseLaneDirectory/);
assert.match(releaseGuard, /objective-registry@1/);
assert.match(releaseLockWrapper, /sync_objective_registry/);
assert.match(releaseGuard, /knownObjectiveRoots/);
assert.match(releaseGuard, /BOURBON_SIGNAL_OPERATOR_REPO/);
assert.match(releaseGuard, /assertAuthorityCapabilityAbsent/);
assert.match(releaseGuard, /assertAuthorityCapabilityAbsentFromGit/);
assert.match(releaseGuard, /CANONICAL_REPOSITORY = 'tarsagent22\/Bourbon-Signal'/);
assert.match(releaseGuard, /issues\/\$\{prNumber\}\/comments[\s\S]*pulls\/\$\{prNumber\}\/reviews[\s\S]*pulls\/\$\{prNumber\}\/comments/);
assert.match(releaseGuard, /git\/ref\/heads\/\$\{remoteHeadPath\}/);
assert.ok(releaseGuard.indexOf("await assertAuthorityCapabilityAbsentFromGit(jobKey") < releaseGuard.indexOf("commandOutput('git', ['push'"), 'authority leak scan must precede the guarded first push');
assert.match(releaseGuard, /remoteHead\?\.object\?\.sha !== expectedHead/);
assert.match(releaseGuard, /coverageWorker = process\.env\.HERMES_KANBAN_BOARD === 'bourbon-signal-coverage'/);
assert.match(releaseGuard, /pull\?\.labels[\s\S]*label\?\.name/);
assert.match(releaseGuard, /coverage merge requires the authenticated bound Kanban task ID/);
assert.match(releaseGuard, /coverage-release-binding@1/);
assert.match(releaseGuard, /bodyHasJobKey/);
assert.match(releaseGuard, /assertActiveKanbanTaskProcess/);
assert.equal((releaseGuard.match(/assertActiveKanbanTaskProcess\(taskId\)/g) || []).length, 3, 'the guard declaration plus admission and merge calls must all remain present');
assert.match(releaseGuard, /HERMES_KANBAN_DB/);
assert.match(releaseGuard, /canonicalHermesHome/);
assert.match(releaseGuard, /createConnection[\s\S]*47683[\s\S]*OS-lock broker/);
assert.match(releaseGuard, /binding\.admittedHead[\s\S]*--is-ancestor/);
assert.match(releaseGuard, /worker_pid, claim_expires, last_heartbeat_at/);
assert.match(releaseGuard, /kanban', '--board', 'bourbon-signal-coverage', 'heartbeat'/);
assert.match(releaseGuard, /inheritanceDigest/);
assert.match(releaseGuard, /realpath/);
assert.match(releaseGuard, /verifyAuthority\(jobKey, taskId\)/);
assert.match(releaseGuard, /merge-base[\s\S]*--is-ancestor/);
assert.match(releaseGuard, /status[\s\S]*--porcelain=v1/);
assert.match(releaseGuard, /pull-request creation was uncertain and no matching draft could be recovered/i);
assert.match(releaseGuard, /coverage-release-pending@1/);
assert.match(releaseGuard, /writeCoveragePending[\s\S]*githubRequest\(`\/repos\/\$\{repository\}\/pulls`/);
assert.doesNotMatch(releaseGuard, /closeIfStillUnchangedDraft/);
assert.doesNotMatch(releaseGuard, /body: \{ state: 'closed' \}/);
assert.match(releaseGuard, /worktree[\s\S]*list[\s\S]*--porcelain/);
assert.match(releaseLockWrapper, /shared_release_lane_directory/);
assert.match(releaseLockWrapper, /Path\.home\(\)[\s\S]*kanban[\s\S]*bourbon-signal-coverage[\s\S]*release-lane/);
assert.match(releaseLockWrapper, /start_broker[\s\S]*assert_broker/);

console.log('Release lane policy contract tests passed.');
