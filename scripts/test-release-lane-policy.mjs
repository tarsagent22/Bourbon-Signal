import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assertCurrentMain,
  classifyBranchRelationship,
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

console.log('Release lane policy contract tests passed.');
