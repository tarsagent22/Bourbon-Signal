import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodeBoundedShadowArchive } from './download-grocery-shadow.mjs';

const allowedPreparationFiles = new Set([
  '.github/workflows/state-expansion-canary.yml', 'engine/src/prepare-massachusetts-canary.mjs',
  'engine/src/prepare-central-cityhive-canary.mjs', 'engine/src/massachusetts-research-policy.mjs', 'engine/src/massachusetts-canary-preview-policy.mjs', 'engine/src/verify-state-fixtures.mjs',
  'engine/test/massachusetts-canary-policy.test.mjs',
  'engine/src/build-state-canary-preview.mjs', 'scripts/download-cityhive-shadow.mjs',
  'scripts/download-ma-esplanda-shadow.mjs', 'scripts/test-massachusetts-public-canary.mjs', 'scripts/test-massachusetts-live-canary.mjs', 'src/lib/drop-feed-visibility.ts',
  'engine/test/massachusetts-canary-provenance.test.mjs',
]);

export function validateMassachusettsEsplandaOrigin({ repository, run, artifact, currentHead, comparison }) {
  if (repository !== 'tarsagent22/Bourbon-Signal' || run?.conclusion !== 'success' || run?.status !== 'completed'
    || run.repository?.full_name !== repository || run.path !== '.github/workflows/state-expansion-shadow.yml'
    || String(run.id) !== '43624193800' || !/^[a-f0-9]{40}$/.test(run.head_sha || '')
    || artifact?.name !== `state-expansion-shadow-${run.id}` || artifact.expired === true
    || !/^\d+$/.test(String(artifact.id)) || !/^sha256:[a-f0-9]{64}$/.test(artifact.digest || '')
    || !(artifact.size_in_bytes > 0 && artifact.size_in_bytes <= 128 * 1024 * 1024)) {
    throw new Error('Esplanda preview requires the successful reviewed hosted artifact.');
  }
  const changes = run.head_sha === currentHead ? [] : comparison?.files;
  if (!/^[a-f0-9]{40}$/.test(currentHead || '') || run.head_sha !== currentHead
    && (!['ahead', 'identical'].includes(comparison?.status) || !Array.isArray(changes) || changes.length >= 100
      || changes.some(file => !allowedPreparationFiles.has(file.filename)
        && !/^engine\/data\/(?:state-fixtures|state-integration)\/MA\.json$/.test(file.filename)))) {
    throw new Error('Esplanda collector source changed after its retained observation.');
  }
  return { status: 'verified_github_shadow_artifact', state: 'MA', repository, workflowRunId: String(run.id),
    workflowRunUrl: run.html_url, headSha: run.head_sha, currentHead, sourceEquivalentPreparationChanges: changes.map(file => file.filename),
    artifactId: String(artifact.id), artifactName: artifact.name, artifactDigest: artifact.digest.slice(7),
    verifiedAt: new Date().toISOString() };
}

const arg = flag => process.argv.find(value => value.startsWith(`${flag}=`))?.slice(flag.length + 1);
async function main() {
  const runId = arg('--run'), output = arg('--out-dir');
  if (runId !== '43624193800' || !output) throw new Error('Use the reviewed Esplanda source run ID and --out-dir=<new directory>.');
  const repository = 'tarsagent22/Bourbon-Signal', gh = process.platform === 'win32' ? 'gh.exe' : 'gh';
  const api = endpoint => JSON.parse(execFileSync(gh, ['api', `repos/${repository}/${endpoint}`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, windowsHide: true }));
  const run = api(`actions/runs/${runId}`), artifacts = api(`actions/runs/${runId}/artifacts?per_page=100`);
  const artifact = artifacts.artifacts?.find(row => row.name === `state-expansion-shadow-${runId}`);
  const currentHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const comparison = run.head_sha === currentHead ? null : api(`compare/${run.head_sha}...${currentHead}`);
  const provenance = validateMassachusettsEsplandaOrigin({ repository, run, artifact, currentHead, comparison });
  const bytes = execFileSync(gh, ['api', `repos/${repository}/actions/artifacts/${artifact.id}/zip`], { maxBuffer: 128 * 1024 * 1024, windowsHide: true });
  const files = decodeBoundedShadowArchive(bytes, provenance.artifactDigest);
  const out = path.resolve(output);
  await mkdir(path.dirname(out), { recursive: true });
  await mkdir(out, { recursive: false });
  await writeFile(path.join(out, 'artifact.zip'), bytes);
  for (const [name, body] of Object.entries(files)) {
    const file = path.resolve(out, 'extracted', name);
    if (!file.startsWith(`${path.resolve(out, 'extracted')}${path.sep}`)) throw new Error('Unsafe archive path.');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }
  await writeFile(path.join(out, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
  console.log(JSON.stringify({ state: 'MA', workflowRunId: runId, artifactId: provenance.artifactId, artifactDigest: provenance.artifactDigest, out }));
}

if (import.meta.url === (process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '')) main().catch(error => { console.error(error.message); process.exit(1); });
