import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {decodeBoundedShadowArchive} from './download-grocery-shadow.mjs';
export {decodeBoundedShadowArchive};

const preparationOnly=(state,file)=>[
  '.github/workflows/state-expansion-canary.yml','.github/workflows/state-promotion-provenance.yml',
  'engine/src/prepare-central-cityhive-canary.mjs','engine/src/prepare-central-cityhive-canary-manifest.mjs','engine/src/central-cityhive-fixtures.mjs','engine/src/verify-state-fixtures.mjs','scripts/download-cityhive-shadow.mjs',
  'engine/test/central-cityhive-canary.test.mjs','engine/test/prepare-central-cityhive-canary-manifest.test.mjs','scripts/test-cityhive-shadow-download.mjs',
  'scripts/test-central-cityhive-public-canary.mjs','scripts/build-promotion-provenance.mjs','src/lib/drop-feed-visibility.ts',
  'engine/src/build-state-canary-preview.mjs','next.config.ts','src/lib/site-engine-contract.ts',
].includes(file)||/^engine\/data\/(?:state-fixtures|state-integration)\/(?:WI|OK|RI)\.json$/.test(file)
  ||(state==='CT'&&file==='engine/data/state-integration/CT-canary.json')
  ||(state==='MN'&&/^engine\/data\/(?:state-fixtures|state-integration)\/MN\.json$/.test(file))
  ||/^engine\/test\/fixtures\/ri-cityhive\/[a-z0-9-]+\.json$/.test(file);
const minnesotaAdapterFiles=new Set([
  'engine/data/state-integration/MN.json',
  'engine/src/central-cityhive-policy.mjs',
  'engine/src/collectors/generic-state.mjs',
  'engine/src/collectors/minnesota-cityhive-production.mjs',
  'engine/src/minnesota-cityhive-production-config.mjs',
  'engine/test/minnesota-cityhive-production.test.mjs',
  'engine/test/fixtures/central-cityhive/mn-top-ten-blaine.json',
]);

export function validateInactiveMinnesotaShadowLifecycleTransition({candidateLifecycle,shadowLifecycle,comparison,commit}){
  const lifecyclePath='src/config/state-lifecycle.json';
  if(comparison?.status!=='ahead'||comparison.ahead_by!==1||comparison.behind_by!==0
    ||!Array.isArray(comparison.files)||comparison.files.filter(file=>file.filename===lifecyclePath).length!==1
    ||!Array.isArray(commit?.parents)||commit.parents.length!==1||commit.parents[0].sha!==comparison.base_commit?.sha
    ||!Array.isArray(candidateLifecycle?.activeStates)||!candidateLifecycle.activeStates.includes('MN')
    ||candidateLifecycle.states?.MN?.publicStatus!=='active')return false;
  const expectedShadow=structuredClone(candidateLifecycle);
  expectedShadow.activeStates=expectedShadow.activeStates.filter(id=>id!=='MN');
  expectedShadow.states.MN.publicStatus='research_only';
  return JSON.stringify(expectedShadow)===JSON.stringify(shadowLifecycle);
}

export function validateCityHiveShadowWorkflowOrigin({state,repository,run,artifact,currentHead,comparison}){
  if(!['WI','OK','RI','MN','CT'].includes(state)||repository!=='tarsagent22/Bourbon-Signal')throw new Error('Unreviewed CityHive research state or repository');
  if(run?.conclusion!=='success'||run.status!=='completed'||run.repository?.full_name!==repository
    ||run.path!=='.github/workflows/state-expansion-shadow.yml'||!/^\d+$/.test(String(run.id))
    ||!/^[a-f0-9]{40}$/.test(run.head_sha||'')||!/^[a-f0-9]{40}$/.test(currentHead||''))throw new Error('Shadow run is not a successful repository-issued shadow workflow');
  if(artifact?.name!==`state-expansion-shadow-${run.id}`||artifact.expired===true
    ||!/^\d+$/.test(String(artifact.id))||!/^sha256:[a-f0-9]{64}$/.test(artifact.digest||'')
    ||!(artifact.size_in_bytes>0&&artifact.size_in_bytes<=128*1024*1024))throw new Error('Missing, expired, oversized or unbound shadow artifact');
  const changes=run.head_sha===currentHead?[]:comparison?.files;
  const inactiveMnShadowTransition=state==='MN'&&changes?.filter(file=>file.filename==='src/config/state-lifecycle.json').length===1
    &&comparison?.status==='ahead'&&Number(comparison.ahead_by)===1&&Number(comparison.behind_by)===0
    &&comparison?.mnShadowLifecycleProof===true;
  const unreviewedChanges=Array.isArray(changes)?changes.filter(file=>!(preparationOnly(state,file.filename)
    ||state==='MN'&&minnesotaAdapterFiles.has(file.filename)
    ||state==='MN'&&['src/lib/public-drop-evidence.ts','scripts/test-laak-production-projection.mjs','.github/workflows/refresh-feed.yml','engine/test/engine-continuity.test.mjs'].includes(file.filename)
    ||state==='MN'&&file.filename==='src/config/state-lifecycle.json'&&inactiveMnShadowTransition)):[];
  if(run.head_sha!==currentHead&&(!['ahead','identical'].includes(comparison?.status)||!Array.isArray(changes)
    ||changes.length>=300||unreviewedChanges.length>0))
    throw new Error('Shadow collector source changed; issue new shadow runs before canary');
  return {status:'verified_github_shadow_artifact',state,repository,workflowRunId:String(run.id),workflowRunUrl:run.html_url,
    headSha:run.head_sha,currentHead,sourceEquivalentPreparationChanges:changes.map(file=>file.filename),
    inactiveMinnesotaShadowLifecycleTransition:inactiveMnShadowTransition,
    artifactId:String(artifact.id),artifactName:artifact.name,artifactDigest:artifact.digest.slice(7),verifiedAt:new Date().toISOString()};
}
const argument=flag=>process.argv.find(value=>value.startsWith(flag+'='))?.slice(flag.length+1);
async function main(){
  const state=argument('--state'),runId=argument('--run'),output=argument('--out-dir');
  if(!['WI','OK','RI','MN','CT'].includes(state)||!/^\d+$/.test(runId||'')||!output)throw new Error('Use --state=WI|OK|RI|MN|CT --run=<actual successful workflow run> --out-dir=<new directory>');
  const repository='tarsagent22/Bourbon-Signal',gh=process.platform==='win32'?'gh.exe':'gh',out=path.resolve(output);
  const api=endpoint=>JSON.parse(execFileSync(gh,['api',`repos/${repository}/${endpoint}`],{encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true}));
  const run=api(`actions/runs/${runId}`),artifacts=api(`actions/runs/${runId}/artifacts?per_page=100`);
  const artifact=artifacts.artifacts?.find(row=>row.name===`state-expansion-shadow-${runId}`);
  const currentHead=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  let comparison=null;
  if(run.head_sha!==currentHead){
    comparison=api(`compare/${run.head_sha}...${currentHead}`);
    if(state==='MN'&&comparison.status==='ahead'&&comparison.ahead_by===1&&comparison.behind_by===0){
      const lifecyclePath='src/config/state-lifecycle.json';
      const runLifecycle=api(`contents/${lifecyclePath}?ref=${run.head_sha}`);
      const candidateLifecycle=JSON.parse(execFileSync('git',['show',`${currentHead}:${lifecyclePath}`],{encoding:'utf8',maxBuffer:2*1024*1024}));
      const shadowLifecycle=JSON.parse(Buffer.from(runLifecycle.content,'base64').toString('utf8'));
      const commit=api(`commits/${currentHead}`);
      comparison.mnShadowLifecycleProof=run.head_sha===comparison.base_commit?.sha
        &&validateInactiveMinnesotaShadowLifecycleTransition({candidateLifecycle,shadowLifecycle,comparison,commit});
    }
  }
  const provenance=validateCityHiveShadowWorkflowOrigin({state,repository,run,artifact,currentHead,comparison});
  const bytes=execFileSync(gh,['api',`repos/${repository}/actions/artifacts/${artifact.id}/zip`],{maxBuffer:128*1024*1024,windowsHide:true});
  const files=decodeBoundedShadowArchive(bytes,provenance.artifactDigest);
  await mkdir(path.dirname(out),{recursive:true});await mkdir(out,{recursive:false});await writeFile(path.join(out,'artifact.zip'),bytes);
  for(const[name,body]of Object.entries(files)){const file=path.resolve(out,'extracted',name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,body);}
  await writeFile(path.join(out,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
  console.log(JSON.stringify({state,workflowRunId:runId,artifactId:provenance.artifactId,artifactDigest:provenance.artifactDigest,out}));
}
if(import.meta.url===(process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:''))main().catch(error=>{console.error(error.message);process.exit(1);});
