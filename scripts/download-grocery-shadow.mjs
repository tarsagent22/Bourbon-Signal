import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {unzipSync} from 'fflate';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const allowedPreparationChange=file=>[
  '.github/workflows/state-expansion-canary.yml','.github/workflows/state-promotion-provenance.yml',
  'engine/src/prepare-grocery-canary.mjs','engine/src/grocery-research-fixtures.mjs',
  'engine/src/verify-state-fixtures.mjs','engine/src/build-state-canary-preview.mjs','scripts/download-grocery-shadow.mjs',
  'scripts/build-promotion-provenance.mjs','scripts/test-grocery-canary-preview.mjs',
  'docs/operations/grocery-state-promotion.md',
].includes(file)||/^engine\/data\/(?:state-fixtures|state-integration)\/(?:WA|NM)\.json$/.test(file)
  ||/^engine\/test\/(?:prepare-grocery-canary|research-grocery-runtime|grocery-research-fixtures|state-canary-preview)\.test\.mjs$/.test(file)
  ||file==='scripts/test-grocery-shadow-download.mjs';

export function validateShadowWorkflowOrigin({state,repository,run,artifact,currentHead,comparison}){
  if(!['WA','NM'].includes(state)||repository!=='tarsagent22/Bourbon-Signal')throw new Error('Unreviewed grocery research state or repository');
  if(run?.conclusion!=='success'||run.status!=='completed'||run.repository?.full_name!==repository
    ||run.path!=='.github/workflows/state-expansion-shadow.yml'||!/^\d+$/.test(String(run.id))
    ||!/^[a-f0-9]{40}$/.test(run.head_sha||''))throw new Error('Shadow run is not a successful repository-issued shadow workflow');
  if(artifact?.name!==`state-expansion-shadow-${run.id}`||artifact.expired===true
    ||!/^\d+$/.test(String(artifact.id))||!/^sha256:[a-f0-9]{64}$/.test(artifact.digest||'')
    ||!(artifact.size_in_bytes>0&&artifact.size_in_bytes<=128*1024*1024))throw new Error('Missing, expired, oversized or unbound shadow artifact');
  const changes=run.head_sha===currentHead?[]:comparison?.files;
  if(run.head_sha!==currentHead&&(!['ahead','identical'].includes(comparison?.status)||!Array.isArray(changes)
    ||changes.length>=300||changes.some(file=>!allowedPreparationChange(file.filename)))){
    throw new Error('Shadow collector source changed; issue new shadow runs before canary');
  }
  return {status:'verified_github_shadow_artifact',state,repository,workflowRunId:String(run.id),
    workflowRunUrl:run.html_url,headSha:run.head_sha,currentHead,sourceEquivalentPreparationChanges:changes.map(file=>file.filename),
    artifactId:String(artifact.id),artifactName:artifact.name,artifactDigest:artifact.digest.slice(7),
    verifiedAt:new Date().toISOString()};
}

export function decodeBoundedShadowArchive(bytes,digest){
  if(bytes.length>128*1024*1024||sha(bytes)!==digest)throw new Error('Downloaded shadow ZIP does not match its GitHub artifact digest');
  let expanded=0,count=0;
  return unzipSync(bytes,{filter:file=>{
    if(file.name.endsWith('/'))return false;
    if(++count>512||file.name.includes('\\')||file.name.includes('\0')||file.name.startsWith('/')
      ||/^[A-Za-z]:/.test(file.name)||file.name.split('/').some(part=>part==='..'||part==='.'))throw new Error('Unsafe shadow archive path');
    if(!Number.isSafeInteger(file.originalSize)||file.originalSize>8*1024*1024||(expanded+=file.originalSize)>256*1024*1024)throw new Error('Shadow archive exceeds decompression budget');
    return true;
  }});
}

function argument(flag){return process.argv.find(value=>value.startsWith(flag+'='))?.slice(flag.length+1);}
async function main(){
  const state=argument('--state'),runId=argument('--run'),out=path.resolve(argument('--out-dir')||'');
  if(!['WA','NM'].includes(state)||!/^\d+$/.test(runId||'')||!argument('--out-dir'))throw new Error('Use --state=WA|NM --run=<actual GitHub run ID> --out-dir=<new directory>');
  const repository='tarsagent22/Bourbon-Signal',gh=process.platform==='win32'?'gh.exe':'gh';
  const api=endpoint=>JSON.parse(execFileSync(gh,['api',`repos/${repository}/${endpoint}`],{encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true}));
  const run=api(`actions/runs/${runId}`),artifacts=api(`actions/runs/${runId}/artifacts?per_page=100`);
  const currentHead=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const artifact=artifacts.artifacts?.find(row=>row.name===`state-expansion-shadow-${runId}`);
  const comparison=run.head_sha===currentHead?null:api(`compare/${run.head_sha}...${currentHead}`);
  const provenance=validateShadowWorkflowOrigin({state,repository,run,artifact,currentHead,comparison});
  const bytes=execFileSync(gh,['api',`repos/${repository}/actions/artifacts/${artifact.id}/zip`],{maxBuffer:128*1024*1024,windowsHide:true});
  const files=decodeBoundedShadowArchive(bytes,provenance.artifactDigest);
  await mkdir(path.dirname(out),{recursive:true});await mkdir(out,{recursive:false});
  await writeFile(path.join(out,'artifact.zip'),bytes);
  for(const[name,body]of Object.entries(files)){const file=path.resolve(out,'extracted',name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,body);}
  await writeFile(path.join(out,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
  console.log(JSON.stringify({state,workflowRunId:runId,artifactId:provenance.artifactId,artifactDigest:provenance.artifactDigest,out}));
}
if(import.meta.url===(process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:''))main().catch(error=>{console.error(error.message);process.exit(1);});
