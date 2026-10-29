import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {decodeBoundedShadowArchive} from './download-grocery-shadow.mjs';

export function validateLaAkShadowOrigin({state,run,artifact,currentHead}){
  const repository='tarsagent22/Bourbon-Signal';
  if(!['LA','AK'].includes(state)||run?.conclusion!=='success'||run.status!=='completed'
    ||run.repository?.full_name!==repository||run.path!=='.github/workflows/state-expansion-shadow.yml'
    ||!/^\d+$/.test(String(run.id))||!/^[a-f0-9]{40}$/.test(currentHead||'')||run.head_sha!==currentHead)
    throw Error('LA/AK candidate source or workflow changed; collect three fresh candidate-only shadows on the exact head');
  if(artifact?.name!==`state-expansion-shadow-${run.id}`||artifact.expired===true||!/^\d+$/.test(String(artifact.id))
    ||!/^sha256:[a-f0-9]{64}$/.test(artifact.digest||'')||!(artifact.size_in_bytes>0&&artifact.size_in_bytes<=128*1024*1024))throw Error('Unbound LA/AK artifact');
  return{status:'verified_github_shadow_artifact',state,repository,workflowRunId:String(run.id),headSha:run.head_sha,currentHead,
    artifactId:String(artifact.id),artifactName:artifact.name,artifactDigest:artifact.digest.slice(7),workflowRunUrl:run.html_url,verifiedAt:new Date().toISOString()};
}
const argument=flag=>process.argv.find(value=>value.startsWith(flag+'='))?.slice(flag.length+1);
async function main(){
  const state=argument('--state'),runId=argument('--run'),output=argument('--out-dir');
  if(!['LA','AK'].includes(state)||!/^\d+$/.test(runId||'')||!output)throw Error('Use --state=LA|AK --run=<successful run> --out-dir=<new directory>');
  const repository='tarsagent22/Bourbon-Signal',gh=process.platform==='win32'?'gh.exe':'gh',out=path.resolve(output);
  const api=route=>JSON.parse(execFileSync(gh,['api',`repos/${repository}/${route}`],{encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true}));
  const run=api(`actions/runs/${runId}`),artifact=api(`actions/runs/${runId}/artifacts?per_page=100`).artifacts?.find(row=>row.name===`state-expansion-shadow-${runId}`);
  const proof=validateLaAkShadowOrigin({state,run,artifact,currentHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()});
  const bytes=execFileSync(gh,['api',`repos/${repository}/actions/artifacts/${artifact.id}/zip`],{maxBuffer:128*1024*1024,windowsHide:true});
  const files=decodeBoundedShadowArchive(bytes,proof.artifactDigest);
  await mkdir(path.dirname(out),{recursive:true});await mkdir(out,{recursive:false});await writeFile(path.join(out,'artifact.zip'),bytes);
  for(const[name,body]of Object.entries(files)){const file=path.resolve(out,'extracted',name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,body);}
  await writeFile(path.join(out,'provenance.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}
if(import.meta.url===(process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:''))main().catch(error=>{console.error(error.message);process.exit(1);});
