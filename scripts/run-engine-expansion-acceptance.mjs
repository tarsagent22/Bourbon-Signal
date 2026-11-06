import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {validateAcceptanceWorkflowInputs,validateBaselineWorkflowRun,validateBaselineArtifact,ACCEPTANCE_WORKFLOW_PATH} from './engine-expansion-acceptance-workflow-policy.mjs';
const exec=promisify(execFile),repository='tarsagent22/Bourbon-Signal';
const input={mode:process.env.ACCEPTANCE_MODE,cohort:process.env.ACCEPTANCE_COHORT,minimum:process.env.ACCEPTANCE_MINIMUM,expectedCommit:process.env.ACCEPTANCE_EXPECTED_COMMIT,baselineRunId:process.env.ACCEPTANCE_BASELINE_RUN||'',refreshRunId:process.env.ACCEPTANCE_REFRESH_RUN||''};
const api=async route=>JSON.parse((await exec('gh',['api',`repos/${repository}/${route}`],{maxBuffer:4*1024*1024})).stdout);
const requireValue=(ok,message)=>{if(!ok)throw Error(message);};
async function main(){
 const currentMain=(await api('commits/main')).sha;
 const context={repository:process.env.GITHUB_REPOSITORY,event:process.env.GITHUB_EVENT_NAME,ref:process.env.GITHUB_REF,sha:process.env.GITHUB_SHA,currentMain,runId:process.env.GITHUB_RUN_ID};
 validateAcceptanceWorkflowInputs(input,context);
 requireValue(process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY&&process.env.BLOB_READ_WRITE_TOKEN,'Existing protected production read secrets are required');
 const currentRun=await api(`actions/runs/${context.runId}`);
 requireValue(currentRun.path===ACCEPTANCE_WORKFLOW_PATH&&currentRun.head_sha===context.sha,'Current official workflow identity mismatch');
 const root=process.cwd(),base=path.join(root,'out/engine-expansion-acceptance'),output=path.join(base,input.mode==='baseline'?'baseline':'proof');await mkdir(output,{recursive:true});
 const args=['scripts/verify-engine-expansion-delivery.mjs',`--mode=${input.mode}`,`--repo=${root}`,`--out=${output}`,`--cohort=${input.cohort}`,`--minimum=${input.minimum}`];
 if(input.mode==='verify'){
  const baselineRun=await api(`actions/runs/${input.baselineRunId}`);
  validateBaselineWorkflowRun(baselineRun,{expectedCommit:input.expectedCommit,workflowId:currentRun.workflow_id,baselineRunId:input.baselineRunId});
  const listing=await api(`actions/runs/${input.baselineRunId}/artifacts?per_page=100`);
  requireValue(listing.total_count<=100,'Unexpected baseline artifact listing size');
  const artifact=validateBaselineArtifact(listing.artifacts||[],input.baselineRunId);
  const archive=(await exec('gh',['api',`repos/${repository}/actions/artifacts/${artifact.id}/zip`],{encoding:'buffer',maxBuffer:256*1024*1024})).stdout;
  requireValue('sha256:'+createHash('sha256').update(archive).digest('hex')===artifact.digest,'Official baseline archive digest mismatch');
  const archivePath=path.join(base,'baseline.zip'),directory=path.join(base,'downloaded-baseline');await writeFile(archivePath,archive);
  const python=`import zipfile,sys,pathlib,stat\nz=zipfile.ZipFile(sys.argv[1]); entries=z.infolist(); allowed={'baseline.json','baseline.sha256','stage-receipt.json'}\nassert len(entries)==3 and {x.filename for x in entries}==allowed, 'Unexpected baseline archive paths'\nassert sum(x.file_size for x in entries)<=256*1024*1024, 'Oversized baseline archive'\nassert all(not stat.S_ISLNK(x.external_attr>>16) and not x.is_dir() and not x.flag_bits&1 for x in entries), 'Unsafe archive entries'\nroot=pathlib.Path(sys.argv[2]); root.mkdir(parents=True,exist_ok=False)\nfor item in entries: (root/item.filename).write_bytes(z.read(item))`;
  await exec('python',['-c',python,archivePath,directory],{maxBuffer:1024*1024});
  const receipt=JSON.parse(await readFile(path.join(directory,'stage-receipt.json'),'utf8'));
  requireValue(receipt.repository===repository&&receipt.workflowRunId===input.baselineRunId&&receipt.expectedCommit===input.expectedCommit&&receipt.mode==='baseline'&&receipt.cohort===input.cohort&&receipt.minimum===Number(input.minimum),'Baseline workflow inputs/provenance do not match verify request');
  const refresh=await api(`actions/runs/${input.refreshRunId}`);
  requireValue(refresh.repository?.full_name===repository&&refresh.head_repository?.full_name===repository&&refresh.path==='.github/workflows/refresh-feed.yml'&&refresh.event==='workflow_dispatch'&&refresh.head_sha===input.expectedCommit&&refresh.head_branch==='main'&&refresh.status==='completed'&&refresh.conclusion==='success','Refresh must be an official manually targeted successful exact-head production workflow');
  requireValue(Date.parse(baselineRun.updated_at)<=Date.parse(refresh.created_at),'Baseline workflow must finish before production refresh starts');
  args.push(`--baseline=${directory}`,`--commit=${input.expectedCommit}`,`--run=${input.refreshRunId}`);
  await writeFile(path.join(output,'baseline-artifact-provenance.json'),JSON.stringify({repository,baselineRunId:input.baselineRunId,artifactId:artifact.id,artifactDigest:artifact.digest,baselineHead:baselineRun.head_sha,refreshRunId:input.refreshRunId},null,2));
 }
 requireValue((await api('commits/main')).sha===input.expectedCommit,'Main advanced before read-only acceptance; rerun against current main');
 try{const result=await exec(process.execPath,args,{cwd:root,maxBuffer:8*1024*1024});process.stdout.write(result.stdout);}catch(error){if(error.stdout)process.stdout.write(error.stdout);throw Error('Read-only production acceptance failed; preserved proof artifact contains details');}
 await writeFile(path.join(output,'stage-receipt.json'),JSON.stringify({repository,workflowRunId:context.runId,expectedCommit:input.expectedCommit,mode:input.mode,cohort:input.cohort,minimum:Number(input.minimum),completedAt:new Date().toISOString()},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
