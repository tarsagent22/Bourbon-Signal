import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {decodeBoundedShadowArchive} from './download-grocery-shadow.mjs';
export {decodeBoundedShadowArchive};

const preparationOnly=file=>[
  '.github/workflows/state-expansion-canary.yml','.github/workflows/state-promotion-provenance.yml',
  'engine/src/prepare-central-cityhive-canary.mjs','scripts/download-cityhive-shadow.mjs',
  'engine/test/central-cityhive-canary.test.mjs','scripts/test-cityhive-shadow-download.mjs',
  'scripts/test-central-cityhive-public-canary.mjs','scripts/build-promotion-provenance.mjs',
  'engine/src/build-state-canary-preview.mjs','next.config.ts','src/lib/site-engine-contract.ts',
  'scripts/download-grocery-shadow.mjs','docs/operations/grocery-state-promotion.md',
  'scripts/test-central-cityhive-canary-workflow.mjs',
].includes(file)||/^engine\/data\/(?:state-fixtures|state-integration)\/(?:WI|OK)\.json$/.test(file);

export function validateCityHiveShadowWorkflowOrigin({state,repository,run,artifact,currentHead,comparison}){
  if(!['WI','OK'].includes(state)||repository!=='tarsagent22/Bourbon-Signal')throw new Error('Unreviewed CityHive research state or repository');
  if(run?.conclusion!=='success'||run.status!=='completed'||run.repository?.full_name!==repository
    ||run.path!=='.github/workflows/state-expansion-shadow.yml'||!/^\d+$/.test(String(run.id))
    ||!/^[a-f0-9]{40}$/.test(run.head_sha||'')||!/^[a-f0-9]{40}$/.test(currentHead||''))throw new Error('Shadow run is not a successful repository-issued shadow workflow');
  if(artifact?.name!==`state-expansion-shadow-${run.id}`||artifact.expired===true
    ||!/^\d+$/.test(String(artifact.id))||!/^sha256:[a-f0-9]{64}$/.test(artifact.digest||'')
    ||!(artifact.size_in_bytes>0&&artifact.size_in_bytes<=128*1024*1024))throw new Error('Missing, expired, oversized or unbound shadow artifact');
  const changes=run.head_sha===currentHead?[]:comparison?.files;
  if(run.head_sha!==currentHead&&(!['ahead','identical'].includes(comparison?.status)||!Array.isArray(changes)
    ||changes.length>=300||changes.some(file=>!preparationOnly(file.filename))))throw new Error('Shadow collector source changed; issue new shadow runs before canary');
  return {status:'verified_github_shadow_artifact',state,repository,workflowRunId:String(run.id),workflowRunUrl:run.html_url,
    headSha:run.head_sha,currentHead,sourceEquivalentPreparationChanges:changes.map(file=>file.filename),
    artifactId:String(artifact.id),artifactName:artifact.name,artifactDigest:artifact.digest.slice(7),verifiedAt:new Date().toISOString()};
}
const argument=flag=>process.argv.find(value=>value.startsWith(flag+'='))?.slice(flag.length+1);
async function main(){
  const state=argument('--state'),runId=argument('--run'),output=argument('--out-dir');
  if(!['WI','OK'].includes(state)||!/^\d+$/.test(runId||'')||!output)throw new Error('Use --state=WI|OK --run=<actual successful workflow run> --out-dir=<new directory>');
  const repository='tarsagent22/Bourbon-Signal',gh=process.platform==='win32'?'gh.exe':'gh',out=path.resolve(output);
  const api=endpoint=>JSON.parse(execFileSync(gh,['api',`repos/${repository}/${endpoint}`],{encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true}));
  const run=api(`actions/runs/${runId}`),artifacts=api(`actions/runs/${runId}/artifacts?per_page=100`);
  const artifact=artifacts.artifacts?.find(row=>row.name===`state-expansion-shadow-${runId}`);
  const currentHead=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const comparison=run.head_sha===currentHead?null:api(`compare/${run.head_sha}...${currentHead}`);
  const provenance=validateCityHiveShadowWorkflowOrigin({state,repository,run,artifact,currentHead,comparison});
  const bytes=execFileSync(gh,['api',`repos/${repository}/actions/artifacts/${artifact.id}/zip`],{maxBuffer:128*1024*1024,windowsHide:true});
  const files=decodeBoundedShadowArchive(bytes,provenance.artifactDigest);
  await mkdir(path.dirname(out),{recursive:true});await mkdir(out,{recursive:false});await writeFile(path.join(out,'artifact.zip'),bytes);
  for(const[name,body]of Object.entries(files)){const file=path.resolve(out,'extracted',name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,body);}
  await writeFile(path.join(out,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
  console.log(JSON.stringify({state,workflowRunId:runId,artifactId:provenance.artifactId,artifactDigest:provenance.artifactDigest,out}));
}
if(import.meta.url===(process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:''))main().catch(error=>{console.error(error.message);process.exit(1);});
