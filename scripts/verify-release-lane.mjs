import { assertCurrentMain } from './lib/release-lane-policy.mjs';

function option(name, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

function fail(message) {
  console.error(`Release lane guard failed: ${message}`);
  process.exit(1);
}

const repository = option('repo', process.env.GITHUB_REPOSITORY || 'tarsagent22/Bourbon-Signal');
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const phase = option('phase', 'ci');

async function github(path, { method = 'GET', body = null } = {}) {
  if (!token) fail('GITHUB_TOKEN or GH_TOKEN is required.');
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'BourbonSignalReleaseLane/1.0',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) fail(`GitHub API ${method} ${path} returned ${response.status}.`);
  return response.status === 204 ? null : response.json();
}

async function openPullRequests() {
  return github(`/repos/${repository}/pulls?state=open&per_page=100`);
}

async function currentMainSha() {
  const ref = await github(`/repos/${repository}/git/ref/heads/main`);
  return String(ref?.object?.sha || '');
}

async function assertProtectedReleaseLane() {
  const protection = await github(`/repos/${repository}/branches/main/protection`);
  const requiredChecks = protection?.required_status_checks?.checks || [];
  const actionsBound = (context) => requiredChecks.some((check) => check.context === context && Number(check.app_id) === 15368);
  const reviews = protection?.required_pull_request_reviews;
  const bypass = reviews?.bypass_pull_request_allowances || {};
  const bypassEmpty = ['users', 'teams', 'apps'].every((key) => !Array.isArray(bypass[key]) || bypass[key].length === 0);
  const valid = protection?.required_status_checks?.strict === true
    && protection?.enforce_admins?.enabled === true
    && reviews?.required_approving_review_count === 0
    && bypassEmpty
    && protection?.required_conversation_resolution?.enabled === true
    && protection?.allow_force_pushes?.enabled === false
    && actionsBound('build-and-verify')
    && actionsBound('single-release-lane');
  if (!valid) fail('main branch protection does not enforce strict, non-bypassable PR checks and the persistent single-release-lane status.');
  return protection;
}

if (phase === 'ci') {
  const currentPr = Number(option('pr', process.env.PR_NUMBER || '0'));
  const pulls = await openPullRequests();
  if (pulls.length > 1) fail(`exactly one active release PR is allowed; found ${pulls.length}: ${pulls.map((pr) => `#${pr.number}`).join(', ')}.`);
  if (pulls.some((pull) => pull.base?.ref !== 'main')) fail('the sole active pull request must target main.');
  if (currentPr && (pulls.length !== 1 || Number(pulls[0].number) !== currentPr)) fail(`PR #${currentPr} is not the sole active release PR.`);
  console.log(JSON.stringify({ ok: true, phase, openPullRequests: pulls.map((pr) => pr.number) }));
} else if (phase === 'reconcile-statuses') {
  const pulls = await openPullRequests();
  const laneValid = pulls.length === 1 && pulls[0].base?.ref === 'main';
  const state = laneValid ? 'success' : 'failure';
  const description = laneValid
    ? `PR #${pulls[0].number} is the sole active release lane.`
    : `Expected one open PR targeting main; found ${pulls.length}.`;
  await Promise.all(pulls.map((pull) => github(`/repos/${repository}/check-runs`, {
    method: 'POST',
    body: {
      name: 'single-release-lane',
      head_sha: pull.head.sha,
      status: 'completed',
      conclusion: state,
      output: { title: laneValid ? 'Single release lane clear' : 'Release lane blocked', summary: description },
    },
  })));
  console.log(JSON.stringify({ ok: laneValid || pulls.length === 0, phase, state, openPullRequests: pulls.map((pull) => pull.number) }));
  if (pulls.length > 1 || (pulls.length === 1 && !laneValid)) process.exit(1);
} else if (phase === 'publish') {
  const runSha = option('sha', process.env.GITHUB_SHA || '');
  const mainSha = await currentMainSha();
  try {
    assertCurrentMain({ runSha, currentMainSha: mainSha });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  if (process.env.GITHUB_REF && process.env.GITHUB_REF !== 'refs/heads/main') fail(`publication requires refs/heads/main, found ${process.env.GITHUB_REF}.`);
  console.log(JSON.stringify({ ok: true, phase, runSha, currentMainSha: mainSha }));
} else if (phase === 'merge') {
  const prNumber = Number(option('pr'));
  const expectedHead = option('expected-head');
  if (!Number.isInteger(prNumber) || prNumber <= 0) fail('--pr=<number> is required for merge validation.');
  const [pulls, pull, mainSha] = await Promise.all([
    openPullRequests(),
    github(`/repos/${repository}/pulls/${prNumber}`),
    currentMainSha(),
    assertProtectedReleaseLane(),
  ]);
  if (pulls.length !== 1 || Number(pulls[0].number) !== prNumber) fail(`PR #${prNumber} is not the sole active release PR.`);
  if (pull.draft) fail(`PR #${prNumber} is still a draft.`);
  if (pull.base?.ref !== 'main' || pull.base?.sha !== mainSha) fail(`PR #${prNumber} was not validated against current main ${mainSha}.`);
  if (!expectedHead || pull.head?.sha !== expectedHead) fail(`PR #${prNumber} head changed; expected ${expectedHead || 'an explicit SHA'}, found ${pull.head?.sha || 'unknown'}.`);
  if (pull.mergeable !== true || String(pull.mergeable_state || '').toLowerCase() !== 'clean') fail(`PR #${prNumber} is not cleanly mergeable (${pull.mergeable_state || 'unknown'}).`);
  if (!hasFlag('apply')) {
    console.log(JSON.stringify({ ok: true, phase, applied: false, prNumber, headSha: pull.head.sha, baseSha: mainSha }));
  } else {
    const result = await github(`/repos/${repository}/pulls/${prNumber}/merge`, {
      method: 'PUT',
      body: { sha: expectedHead, merge_method: 'squash' },
    });
    if (!result?.merged) fail(`GitHub refused the guarded merge for PR #${prNumber}: ${result?.message || 'unknown reason'}.`);
    console.log(JSON.stringify({ ok: true, phase, applied: true, prNumber, headSha: expectedHead, mergeCommitSha: result.sha }));
  }
} else {
  fail(`unsupported phase ${phase}.`);
}
