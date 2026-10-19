import { pathToFileURL } from 'node:url';
import { readCoverageLease, validateParkablePull } from '../automation/bourbon-signal/coverage-release-policy.mjs';
const REPOSITORY = 'tarsagent22/Bourbon-Signal';

export async function parkExpiredCoveragePulls({ api, now = new Date() }) {
  const pulls = await api(`/repos/${REPOSITORY}/pulls?state=open&per_page=100`);
  if (!Array.isArray(pulls) || pulls.length >= 100) throw Error('Cannot safely enumerate release PRs.');
  if (pulls.length > 1) throw Error('Multiple release PRs need reconciliation before automatic parking.');
  const parked = [];
  for (const listed of pulls) {
    const lease = readCoverageLease(listed.body);
    if (!lease || Date.parse(lease.expiresAt) > now.getTime()) continue;
    const pull = await api(`/repos/${REPOSITORY}/pulls/${listed.number}`);
    const currentLease = readCoverageLease(pull.body);
    if (JSON.stringify(currentLease) !== JSON.stringify(lease)) throw Error('Coverage reservation changed during cleanup.');
    if (pull.state !== 'open' || pull.merged || pull.merged_at) continue;
    validateParkablePull(pull, lease, { repository: REPOSITORY, now });
    // Never delete a branch or cancel a workflow. Merged publications are left alone.
    const branch = await api(`/repos/${REPOSITORY}/git/ref/heads/${lease.headRef.split('/').map(encodeURIComponent).join('/')}`);
    if (branch.object?.sha !== pull.head.sha) throw Error('Remote coverage branch changed; preserve it for reconciliation.');
    const runs = await api(`/repos/${REPOSITORY}/actions/runs?head_sha=${pull.head.sha}&per_page=100`);
    if (!Array.isArray(runs.workflow_runs) || runs.total_count >= 100) throw Error('Cannot prove publication state.');
    if (runs.workflow_runs.some(run => /(?:refresh-feed|repack-active-snapshot)\.yml$/.test(run.path || '') && run.status !== 'completed')) throw Error('A production workflow is active for this head; keep its protection.');
    const closed = await api(`/repos/${REPOSITORY}/pulls/${pull.number}`, { method: 'PATCH', body: { state: 'closed' } });
    if (closed.merged || closed.merged_at) continue;
    if (closed.state !== 'closed') throw Error('Coverage PR closure was not confirmed.');
    const saved = await api(`/repos/${REPOSITORY}/git/ref/heads/${lease.headRef.split('/').map(encodeURIComponent).join('/')}`);
    if (saved.object?.sha !== pull.head.sha) throw Error('Coverage branch requires reconciliation after parking.');
    parked.push({ pullRequest: pull.number, branch: lease.headRef, headSha: pull.head.sha, jobKey: lease.jobKey });
  }
  return { parked };
}

async function main() {
  if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY !== REPOSITORY) throw Error('Wrong repository.');
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) throw Error('GitHub authentication required.');
  const api = async (route, { method = 'GET', body } = {}) => {
    const res = await fetch(`https://api.github.com${route}`, { method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000), redirect: 'error' });
    if (!res.ok) throw Error(`Coverage parking API returned ${res.status}.`);
    return res.json();
  };
  console.log(JSON.stringify(await parkExpiredCoveragePulls({ api })));
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
