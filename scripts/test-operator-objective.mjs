import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildFinding, parseFindingIssueBody, renderFindingIssueBody } from './lib/operator-findings.mjs';
import { main as objectiveMain } from './operator-objective.mjs';

const observedAt = '2026-07-16T12:00:00.000Z';
const finding = buildFinding({
  source: 'daily-reliability',
  sourceKey: 'release-blocking-objective-test',
  area: 'shipping',
  severity: 'critical',
  title: 'Exercise the canonical objective lifecycle',
  summary: 'The objective lifecycle must be claimed and released centrally.',
  evidence: ['A local lock alone cannot coordinate two operators.'],
  recommendedAction: 'Claim the issue, isolate the worktree, and release it safely.',
  impact: 5,
  urgency: 5,
  confidence: 1,
  effort: 2,
  observedAt,
});

function githubHarness(events = []) {
  let issue = {
    number: 41,
    title: `[Finding] ${finding.title}`,
    body: renderFindingIssueBody(finding),
    state: 'OPEN',
    labels: ['operator-finding', 'area:shipping', 'severity:critical', 'status:backlog'].map((name) => ({ name })),
    url: 'https://github.invalid/issues/41',
  };
  const calls = [];
  return {
    calls,
    status: () => parseFindingIssueBody(issue.body).status,
    runGh: async (args) => {
      calls.push(args);
      if (args[0] === 'issue' && args[1] === 'list') return [structuredClone(issue)];
      if (args[0] === 'issue' && args[1] === 'edit') {
        const bodyIndex = args.indexOf('--body');
        if (bodyIndex >= 0) issue.body = args[bodyIndex + 1];
        const labels = new Set(issue.labels.map((label) => label.name));
        for (let index = 0; index < args.length; index += 1) {
          if (args[index] === '--add-label') labels.add(args[index + 1]);
          if (args[index] === '--remove-label') labels.delete(args[index + 1]);
        }
        issue.labels = [...labels].map((name) => ({ name }));
        events.push(`github:${parseFindingIssueBody(issue.body).status}`);
        return { ok: true };
      }
      if (args[0] === 'issue' && args[1] === 'close') {
        issue.state = 'CLOSED';
        return { ok: true };
      }
      if (args[0] === 'issue' && args[1] === 'reopen') {
        issue.state = 'OPEN';
        return { ok: true };
      }
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    },
  };
}

function gitHarness(events = [], remoteClaims = new Set()) {
  const state = {
    branch: null,
    registeredWorktree: null,
    dirty: false,
    merged: false,
    archived: false,
    failWorktreeAdd: false,
    failBranchDelete: false,
    head: '0123456789abcdef0123456789abcdef01234567',
  };
  const calls = [];
  const failure = (message) => Object.assign(new Error(message), { code: 1 });
  return {
    state,
    calls,
    runGit: async (args, cwd) => {
      calls.push({ args, cwd });
      if (args[0] === 'status') return state.dirty ? ' M changed.txt' : '';
      if (args[0] === 'push' && args.includes('--porcelain')) {
        const branch = args.at(-1).split('refs/heads/').at(-1);
        if (remoteClaims.has(branch)) throw failure('remote objective branch already exists');
        remoteClaims.add(branch);
        events.push('git:remote-claim');
        return '';
      }
      if (args[0] === 'push' && args[2] === '--delete') {
        remoteClaims.delete(args[3]);
        events.push('git:remote-release');
        return '';
      }
      if (args[0] === 'show-ref') {
        if (state.branch && args.at(-1) === `refs/heads/${state.branch}`) return '';
        throw failure('missing ref');
      }
      if (args[0] === 'worktree' && args[1] === 'add') {
        if (state.failWorktreeAdd) throw failure('fixture worktree failure');
        state.branch = args[3];
        state.registeredWorktree = path.resolve(args[4]);
        events.push('git:worktree-add');
        return '';
      }
      if (args[0] === 'worktree' && args[1] === 'list') {
        if (!state.registeredWorktree) return '';
        return `worktree ${state.registeredWorktree}\nHEAD ${state.head}\nbranch refs/heads/${state.branch}\n`;
      }
      if (args[0] === 'rev-parse') return state.head;
      if (args[0] === 'fetch') return '';
      if (args[0] === 'merge-base') {
        if (!state.merged) throw failure('not merged');
        return '';
      }
      if (args[0] === 'ls-remote') {
        const requestedBranch = args.at(-1).replace('refs/heads/', '');
        return (state.archived || state.merged) && remoteClaims.has(requestedBranch)
          ? `${state.head}\trefs/heads/${requestedBranch}`
          : '';
      }
      if (args[0] === 'worktree' && args[1] === 'remove') {
        events.push('git:worktree-remove');
        state.registeredWorktree = null;
        return '';
      }
      if (args[0] === 'branch' && (args[1] === '-d' || args[1] === '-D')) {
        if (state.failBranchDelete) throw failure('fixture branch delete failure');
        events.push('git:branch-remove');
        state.branch = null;
        return '';
      }
      throw new Error(`Unexpected git call: ${args.join(' ')}`);
    },
  };
}

const fixtureDir = mkdtempSync(path.join(tmpdir(), 'operator-objective-'));
await assert.rejects(
  () => objectiveMain(['select', '--apply'], { environment: {}, log: () => {} }),
  /shared release-lane OS lock/i,
);
try {
  const findingsFile = path.join(fixtureDir, 'canonical-findings.json');
  const lockFile = path.join(fixtureDir, 'objective-lock.json');
  const worktree = path.join(fixtureDir, 'objective-worktree');
  writeFileSync(findingsFile, JSON.stringify({ findings: [{ issueNumber: 41, finding }] }));

  const dryGithub = githubHarness();
  const dryGit = gitHarness();
  const dryResult = await objectiveMain([
    'select', `--file=${findingsFile}`, '--repo=owner/repo', `--lock=${lockFile}`, `--worktree=${worktree}`, `--at=${observedAt}`,
  ], { runGh: dryGithub.runGh, runGit: dryGit.runGit, log: () => {}, environment: { BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID: 'test-lease' } });
  assert.equal(dryResult.mode, 'dry-run');
  assert.equal(dryGithub.calls.length, 0, 'selection dry-run must not contact or mutate GitHub');
  assert.equal(dryGit.calls.length, 0, 'selection dry-run must not mutate or inspect git state');
  assert.equal(existsSync(lockFile), false);

  const events = [];
  const remoteClaims = new Set();
  const github = githubHarness(events);
  const git = gitHarness(events, remoteClaims);
  const selected = await objectiveMain([
    'select', `--file=${findingsFile}`, '--repo=owner/repo', `--lock=${lockFile}`, `--worktree=${worktree}`, `--at=${observedAt}`, '--apply',
  ], { runGh: github.runGh, runGit: git.runGit, log: () => {}, environment: { BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID: 'test-lease' } });
  assert.equal(selected.mode, 'apply');
  assert.equal(github.status(), 'in-progress');
  assert.equal(existsSync(lockFile), true);
  assert.equal(JSON.parse(readFileSync(lockFile, 'utf8')).worktree, path.resolve(worktree));
  assert.deepEqual(events.slice(0, 4), ['git:remote-claim', 'github:selected', 'git:worktree-add', 'github:in-progress']);
  const remoteClaimCall = git.calls.find((call) => call.args[0] === 'push' && call.args.includes('--porcelain'));
  assert.ok(remoteClaimCall.args.includes(`--force-with-lease=refs/heads/${selected.lock.branch}:`), 'the remote claim must atomically require a missing objective branch');

  const competingGit = gitHarness([], remoteClaims);
  await assert.rejects(() => objectiveMain([
    'select', `--file=${findingsFile}`, '--repo=owner/repo', `--lock=${path.join(fixtureDir, 'competing-lock.json')}`,
    `--worktree=${path.join(fixtureDir, 'competing-worktree')}`, `--at=${observedAt}`, '--apply',
  ], { runGh: github.runGh, runGit: competingGit.runGit, log: () => {}, environment: { BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID: 'test-lease' } }), /remote objective branch already exists|already (?:selected|in-progress)|cannot be claimed/i);
  assert.equal(competingGit.calls.some((call) => call.args[0] === 'worktree' && call.args[1] === 'add'), false, 'a second operator cannot create independent objective work');

  await assert.rejects(() => objectiveMain([
    'release', `--lock=${lockFile}`, `--worktree=${worktree}`, '--repo=owner/repo', '--apply',
  ], { runGh: github.runGh, runGit: git.runGit, log: () => {}, environment: { BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID: 'test-lease' } }), /--disposition/);
  assert.equal(existsSync(lockFile), true);

  git.state.dirty = true;
  await assert.rejects(() => objectiveMain([
    'release', `--lock=${lockFile}`, `--worktree=${worktree}`, '--repo=owner/repo', '--disposition=resolved', '--apply',
  ], { runGh: github.runGh, runGit: git.runGit, log: () => {}, environment: { BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID: 'test-lease' } }), /dirty objective worktree/i);
  assert.equal(github.status(), 'in-progress');
  git.state.dirty = false;

  await assert.rejects(() => objectiveMain([
    'release', `--lock=${lockFile}`, `--worktree=${worktree}`, '--repo=owner/repo', '--disposition=resolved', '--apply',
  ], { runGh: github.runGh, runGit: git.runGit, log: () => {}, environment: { BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID: 'test-lease' } }), /merged or archived/i);
  assert.equal(github.status(), 'in-progress');

  git.state.archived = true;
  const ghCallsBeforeReleaseDryRun = github.calls.length;
  const gitCallsBeforeReleaseDryRun = git.calls.length;
  const releaseDryRun = await objectiveMain([
    'release', `--lock=${lockFile}`, `--worktree=${worktree}`, '--repo=owner/repo', '--disposition=resolved',
  ], { runGh: github.runGh, runGit: git.runGit, log: () => {}, environment: { BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID: 'test-lease' } });
  assert.equal(releaseDryRun.mode, 'dry-run');
  assert.equal(github.calls.length, ghCallsBeforeReleaseDryRun, 'release dry-run must not contact or mutate GitHub');
  assert.equal(git.calls.slice(gitCallsBeforeReleaseDryRun).some((call) => (
    call.args[0] === 'push'
    || (call.args[0] === 'worktree' && call.args[1] === 'remove')
    || (call.args[0] === 'branch' && ['-d', '-D'].includes(call.args[1]))
  )), false, 'release dry-run may inspect safety but must not mutate git state');

  git.state.failBranchDelete = true;
  await assert.rejects(() => objectiveMain([
    'release', `--lock=${lockFile}`, `--worktree=${worktree}`, '--repo=owner/repo', '--disposition=resolved', '--apply',
  ], { runGh: github.runGh, runGit: git.runGit, log: () => {}, environment: { BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID: 'test-lease' } }), /branch delete failure/);
  assert.equal(github.status(), 'resolved', 'canonical disposition is updated before local cleanup');
  assert.equal(existsSync(lockFile), true, 'the lock survives any cleanup failure');
  assert.ok(events.indexOf('github:resolved') < events.indexOf('git:worktree-remove'));

  git.state.failBranchDelete = false;
  await objectiveMain([
    'release', `--lock=${lockFile}`, `--worktree=${worktree}`, '--repo=owner/repo', '--disposition=resolved', '--apply',
  ], { runGh: github.runGh, runGit: git.runGit, log: () => {}, environment: { BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID: 'test-lease' } });
  assert.equal(existsSync(lockFile), false, 'unlock happens only after canonical update and safe cleanup');
  assert.equal(git.state.registeredWorktree, null);
  assert.equal(git.state.branch, null);
  assert.equal(remoteClaims.size, 1, 'an unmerged remote branch is retained as the verified archive');

  const mergedLock = path.join(fixtureDir, 'merged-lock.json');
  const mergedWorktree = path.join(fixtureDir, 'merged-worktree');
  const mergedGithub = githubHarness();
  const mergedRemoteClaims = new Set();
  const mergedGit = gitHarness([], mergedRemoteClaims);
  await objectiveMain([
    'select', `--file=${findingsFile}`, '--repo=owner/repo', `--lock=${mergedLock}`, `--worktree=${mergedWorktree}`,
    `--at=${observedAt}`, '--apply',
  ], { runGh: mergedGithub.runGh, runGit: mergedGit.runGit, log: () => {}, environment: { BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID: 'test-lease' } });
  mergedGit.state.merged = true;
  await objectiveMain([
    'release', `--lock=${mergedLock}`, '--repo=owner/repo', '--disposition=dismissed', '--apply',
  ], { runGh: mergedGithub.runGh, runGit: mergedGit.runGit, log: () => {}, environment: { BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID: 'test-lease' } });
  assert.equal(mergedGithub.status(), 'dismissed');
  assert.equal(mergedRemoteClaims.size, 0, 'a merged remote claim branch is removed before unlock');
  assert.equal(existsSync(mergedLock), false);

  const rollbackLock = path.join(fixtureDir, 'rollback-lock.json');
  const rollbackWorktree = path.join(fixtureDir, 'rollback-worktree');
  const rollbackGithub = githubHarness();
  const rollbackRemoteClaims = new Set();
  const rollbackGit = gitHarness([], rollbackRemoteClaims);
  rollbackGit.state.failWorktreeAdd = true;
  await assert.rejects(() => objectiveMain([
    'select', `--file=${findingsFile}`, '--repo=owner/repo', `--lock=${rollbackLock}`, `--worktree=${rollbackWorktree}`,
    `--at=${observedAt}`, '--apply',
  ], { runGh: rollbackGithub.runGh, runGit: rollbackGit.runGit, log: () => {}, environment: { BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID: 'test-lease' } }), /fixture worktree failure/);
  assert.equal(rollbackGithub.status(), 'backlog', 'failed lock/worktree creation rolls the canonical claim back');
  assert.equal(existsSync(rollbackLock), false);
  assert.equal(rollbackRemoteClaims.size, 0, 'failed selection also releases the atomic remote claim');

  const remoteOnlyLock = path.join(fixtureDir, 'remote-only-lock.json');
  const remoteOnlyWorktree = path.join(fixtureDir, 'remote-only-worktree');
  const remoteOnlyGithub = githubHarness();
  const remoteOnlyClaims = new Set();
  const remoteOnlyGit = gitHarness([], remoteOnlyClaims);
  await objectiveMain([
    'select', `--file=${findingsFile}`, '--repo=owner/repo', `--lock=${remoteOnlyLock}`, `--worktree=${remoteOnlyWorktree}`,
    `--at=${observedAt}`, '--apply',
  ], { runGh: remoteOnlyGithub.runGh, runGit: remoteOnlyGit.runGit, log: () => {}, environment: { BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID: 'test-lease' } });
  remoteOnlyGit.state.registeredWorktree = null;
  remoteOnlyGit.state.branch = null;
  remoteOnlyGit.state.archived = true;
  await assert.rejects(() => objectiveMain([
    'release', `--lock=${remoteOnlyLock}`, '--repo=owner/repo', '--disposition=blocked', '--apply',
  ], { runGh: remoteOnlyGithub.runGh, runGit: remoteOnlyGit.runGit, log: () => {}, environment: { BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID: 'test-lease' } }), /not merged.*preserving archive/i);
  assert.equal(remoteOnlyClaims.size, 1, 'a remote-only unmerged objective archive cannot be deleted');
  assert.equal(existsSync(remoteOnlyLock), true);

  const rollbackFailureLock = path.join(fixtureDir, 'rollback-failure-lock.json');
  const rollbackFailureWorktree = path.join(fixtureDir, 'rollback-failure-worktree');
  const rollbackFailureGithub = githubHarness();
  const rollbackFailureClaims = new Set();
  const rollbackFailureGit = gitHarness([], rollbackFailureClaims);
  rollbackFailureGit.state.failWorktreeAdd = true;
  const failingRollbackGh = async (args) => {
    const bodyIndex = args.indexOf('--body');
    if (args[0] === 'issue' && args[1] === 'edit' && bodyIndex >= 0 && parseFindingIssueBody(args[bodyIndex + 1]).status === 'backlog') {
      throw new Error('fixture canonical rollback failure');
    }
    return rollbackFailureGithub.runGh(args);
  };
  await assert.rejects(() => objectiveMain([
    'select', `--file=${findingsFile}`, '--repo=owner/repo', `--lock=${rollbackFailureLock}`, `--worktree=${rollbackFailureWorktree}`,
    `--at=${observedAt}`, '--apply',
  ], { runGh: failingRollbackGh, runGit: rollbackFailureGit.runGit, log: () => {}, environment: { BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID: 'test-lease' } }), /objective rollback also failed/i);
  assert.equal(rollbackFailureGithub.status(), 'selected');
  assert.equal(existsSync(rollbackFailureLock), true, 'failed canonical rollback preserves the local recovery lock');
  assert.equal(rollbackFailureClaims.size, 1, 'failed canonical rollback preserves the remote claim');
} finally {
  rmSync(fixtureDir, { recursive: true, force: true });
}

console.log('Operator objective lifecycle contracts passed.');
