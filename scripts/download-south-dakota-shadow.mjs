import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';

const [runId, output] = process.argv.slice(2);
if (!/^\d+$/.test(runId) || !output) throw Error('Provide the successful South Dakota shadow run and a new output directory.');
const repo = 'tarsagent22/Bourbon-Signal';
const gh = process.platform === 'win32' ? 'gh.exe' : 'gh';
const api = route => JSON.parse(execFileSync(gh, ['api', `repos/${repo}/${route}`], {encoding:'utf8'}));
const run = api(`actions/runs/${runId}`);
if (run.conclusion !== 'success' || run.repository.full_name !== repo || run.path !== '.github/workflows/state-expansion-shadow.yml'
  || run.head_branch !== 'research/south-dakota-sante-20261114' || !/^[a-f\d]{40}$/.test(run.head_sha)) {
  throw Error('South Dakota source did not come from the reviewed GitHub shadow workflow.');
}
if (spawnSync('git', ['cat-file', '-e', `${run.head_sha}^{commit}`]).status !== 0) {
  execFileSync('git', ['fetch', '--no-tags', '--depth=1', 'origin', run.head_sha], { stdio: 'inherit' });
}
for (const name of ['engine/src/research-south-dakota-retailer.mjs', 'engine/src/south-dakota-pickup-policy.mjs', 'engine/src/research-state-registry.mjs']) {
  const reviewed = execFileSync('git',['show',`${run.head_sha}:${name}`]);
  const current = execFileSync('git',['show',`HEAD:${name}`]);
  if (!current.equals(reviewed)) throw Error(`South Dakota source changed after observation: ${name}`);
}
const artifacts = api(`actions/runs/${runId}/artifacts`).artifacts;
const artifact = artifacts.find(entry => entry.name === `state-expansion-shadow-${runId}`);
if (!artifact || artifact.expired || !/^sha256:[a-f\d]{64}$/.test(artifact.digest)
  || artifact.size_in_bytes < 1 || artifact.size_in_bytes > 5*1024*1024) throw Error('Missing reviewed South Dakota source archive.');
const bytes = execFileSync(gh,['api',`repos/${repo}/actions/artifacts/${artifact.id}/zip`],{maxBuffer:5*1024*1024});
if ('sha256:' + createHash('sha256').update(bytes).digest('hex') !== artifact.digest) throw Error('South Dakota source archive digest mismatch.');
const allowed = /^SD\/\d{4}-\d{2}-\d{2}T[\d-]+Z\/(?:report\.json|source-captures\/[1-3]-[a-f\d]{12}\.json)$/;
const files = unzipSync(bytes, {filter:file => allowed.test(file.name) && file.originalSize <= 512*1024});
if (Object.keys(files).length !== 4) throw Error('South Dakota archive did not contain the expected report and three captures.');
const reports = Object.keys(files).filter(name => name.endsWith('/report.json'));
if (reports.length !== 1 || Object.keys(files).some(name => !name.startsWith(path.posix.dirname(reports[0]) + '/'))) {
  throw Error('South Dakota reports and captures were not issued for one observation.');
}
await mkdir(output);
for (const [name, content] of Object.entries(files)) {
  const dest = path.join(output,name);
  await mkdir(path.dirname(dest),{recursive:true});
  await writeFile(dest,content,{flag:'wx'});
}
await writeFile(path.join(output,'provenance.json'), JSON.stringify({state:'SD',runId,head:run.head_sha,
  artifactId:String(artifact.id),artifactDigest:artifact.digest,workflowRunUrl:run.html_url},null,2)+'\n',{flag:'wx'});
