import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {unzipSync} from 'fflate';

const REPOSITORY='tarsagent22/Bourbon-Signal';
export const LA_AK_CANARY_SOURCE_FILES=Object.freeze([
 'engine/src/collectors/louisiana-alaska-grocery-expansion.mjs',
 'engine/src/collectors/louisiana-alaska-grocery-premises.mjs',
 'engine/src/collectors/louisiana-alaska-grocery-transport.mjs',
 'engine/src/louisiana-alaska-grocery-policy.mjs',
 'engine/src/louisiana-alaska-grocery-positive-proof.mjs',
 'engine/src/louisiana-alaska-grocery-production-config.mjs',
 'engine/src/research-louisiana-alaska-grocery-runtime.mjs',
 'engine/src/collectors/arizona-xapi.mjs',
 'engine/src/collectors/arizona-xapi-matching.mjs',
 'engine/src/collectors/grocery-xapi-identity.mjs',
 'engine/src/grocery-xapi-policy.mjs',
 'engine/src/library-query-plan.mjs',
 'engine/src/library-search-runtime.mjs',
 'engine/src/core/bible.mjs',
]);
const RECEIPT_COUNTS={AK:53,LA:43};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>{const u=new URL(value);u.searchParams.sort();return u.href;};

export function validateLaakOrigin({repository=REPOSITORY,run,artifact,currentHead,comparison,runSourceBlobs,currentSourceBlobs,summary,reports}){
 if(repository!==REPOSITORY||run?.conclusion!=='success'||run.status!=='completed'||run.repository?.full_name!==repository
   ||run.path!=='.github/workflows/state-expansion-shadow.yml'||!/^[0-9]+$/.test(String(run.id))
   ||!/^[a-f0-9]{40}$/.test(run.head_sha||'')||!/^[a-f0-9]{40}$/.test(currentHead||''))throw Error('LA/AK evidence is not from a successful repository shadow workflow');
 if(artifact?.name!==`state-expansion-shadow-${run.id}`||artifact.expired===true||!/^[0-9]+$/.test(String(artifact.id))
   ||!/^sha256:[a-f0-9]{64}$/.test(artifact.digest||'')||!(artifact.size_in_bytes>0&&artifact.size_in_bytes<=128*1024*1024))throw Error('Missing, expired, oversized, or unbound shadow artifact');
 const changed=LA_AK_CANARY_SOURCE_FILES.filter(file=>runSourceBlobs?.[file]!==currentSourceBlobs?.[file]);
 if(LA_AK_CANARY_SOURCE_FILES.some(file=>!/^[a-f0-9]{40}$/.test(runSourceBlobs?.[file]||'')||!/^[a-f0-9]{40}$/.test(currentSourceBlobs?.[file]||''))
  ||changed.length)throw Error(`LA/AK collector source changed since the saved report: ${changed.join(', ')||'source blob binding unavailable'}`);
 const results=new Map((summary?.results||[]).map(row=>[row.state,row]));
 if(summary?.mode!=='shadow'||summary.complete!==true)throw Error('Saved workflow did not finish a complete shadow run');
 for(const state of ['LA','AK']){
  const result=results.get(state),report=reports?.[state];
  if(!result?.complete||result.outcome!=='complete'||result.publication?.allowed!==false||result.publication?.productionSnapshotTouched!==false
   ||result.alerts?.disabled!==true||result.alerts?.deliveryAttempted!==false||result.metrics?.customerVisibleExportPreviewCount!==0
   ||!report||report.state!==state||!['useful','positive_evidence_only'].includes(report.status)||report.stale!==false
   ||report.metadata?.origin?.kind!=='github_actions'||String(report.metadata.origin.workflowRunId)!==String(run.id)
   ||report.metadata.origin.repository!==repository||report.metadata.origin.commitSha!==run.head_sha
   ||report.metadata.shadowOnly!==true||report.metadata.productionActivationAllowed!==false||report.metadata.customerDeliveryAllowed!==false
   ||!Array.isArray(report.metadata.receipts)||report.metadata.receipts.length!==RECEIPT_COUNTS[state]
   ||!Array.isArray(report.metadata.requests)||report.metadata.requests.length!==RECEIPT_COUNTS[state]
   ||!Array.isArray(report.signals)||!report.signals.length
   ||!report.signals.every(row=>row.state===state&&row.sourceProductBinding?.shadowOnly===true&&row.raw?.shadowOnly===true
    &&row.canAlertAsInventory===false&&row.canAlertAsWatch===false&&row.eligibleForDelivery===false
    &&row.eligibleForOnSite===false&&row.eligibleForDropFeed===false))throw Error(`Saved ${state} report is incomplete, mismatched, or not alert-disabled`);
  const starts=Date.parse(report.startedAt),ends=Date.parse(report.finishedAt);
  if(!Number.isFinite(starts)||!Number.isFinite(ends)||ends<starts||ends>Date.parse(summary.generatedAt)
   ||report.metadata.receipts.length!==report.metadata.requests?.length||report.metadata.receipts.length<1
   ||result.metrics?.signalCount!==report.signals.length)throw Error(`Saved ${state} source clocks or receipt counts are invalid`);
 }
 return {status:'verified_github_laak_shadow_artifact',repository,stateSet:['AK','LA'],workflowRunId:String(run.id),
  workflowRunUrl:run.html_url,headSha:run.head_sha,currentHead,historyComparisonStatus:comparison?.status||'identical',
  historyComparisonFileCount:comparison?.files?.length||0,collectorSourceFilesVerifiedUnchanged:LA_AK_CANARY_SOURCE_FILES,
  artifactId:String(artifact.id),artifactName:artifact.name,artifactDigest:artifact.digest.slice(7),verifiedAt:new Date().toISOString()};
}

export function decodeLaakArchive(bytes,digest){
 if(bytes.length>128*1024*1024||sha(bytes)!==digest)throw Error('Downloaded shadow ZIP does not match its GitHub artifact digest');
 let total=0,count=0;const files=unzipSync(bytes,{filter:file=>{
  if(file.name.endsWith('/'))return false;
  if(++count>512||file.name.includes('\\')||file.name.includes('\0')||file.name.startsWith('/')||/^[A-Za-z]:/.test(file.name)
   ||file.name.split('/').some(part=>part==='..'||part==='.')||!Number.isSafeInteger(file.originalSize)||file.originalSize>8*1024*1024
   ||(total+=file.originalSize)>256*1024*1024)throw Error('Unsafe shadow archive path or extraction size');return true;
 }});
 return Object.fromEntries(Object.entries(files).map(([name,body])=>[name,Buffer.from(body)]));
}
const arg=flag=>process.argv.find(value=>value.startsWith(flag+'='))?.slice(flag.length+1);
async function main(){
 const state=arg('--state'),runId=arg('--run'),destination=arg('--out-dir');
 if(!['AK','LA'].includes(state)||!/^[0-9]+$/.test(runId||'')||!destination)throw Error('Use --state=AK|LA --run=<workflow run ID> --out-dir=<new directory>');
 const gh=process.platform==='win32'?'gh.exe':'gh',out=path.resolve(destination);
 const api=endpoint=>JSON.parse(execFileSync(gh,['api',`repos/${REPOSITORY}/${endpoint}`],{encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true}));
 const run=api(`actions/runs/${runId}`),artifacts=api(`actions/runs/${runId}/artifacts?per_page=100`);
 const artifact=artifacts.artifacts?.find(item=>item.name===`state-expansion-shadow-${runId}`);
 if(!artifact)throw Error('Workflow run has no retained shadow artifact');
 const currentHead=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();
 const comparison=run.head_sha===currentHead?null:api(`compare/${run.head_sha}...${currentHead}`);
 const tree=sha=>api(`git/trees/${sha}?recursive=1`);
 const [runTree,currentTree]=run.head_sha===currentHead?[null,null]:[tree(run.head_sha),tree(currentHead)];
 if(runTree?.truncated||currentTree?.truncated)throw Error('GitHub truncated the source tree needed for exact collector verification');
 const blobMap=treeValue=>Object.fromEntries((treeValue?.tree||[]).filter(row=>row.type==='blob').map(row=>[row.path,row.sha]));
 const runSourceBlobs=run.head_sha===currentHead?Object.fromEntries(LA_AK_CANARY_SOURCE_FILES.map(file=>[file,execFileSync('git',['rev-parse',`${run.head_sha}:${file}`],{encoding:'utf8',windowsHide:true}).trim()])):blobMap(runTree);
 const currentSourceBlobs=run.head_sha===currentHead?runSourceBlobs:blobMap(currentTree);
 const bytes=execFileSync(gh,['api',`repos/${REPOSITORY}/actions/artifacts/${artifact.id}/zip`],{maxBuffer:128*1024*1024,windowsHide:true});
 const files=decodeLaakArchive(bytes,artifact.digest.slice(7));
 const summaries=Object.entries(files).filter(([name])=>/^run-[^/]+\.json$/.test(path.posix.basename(name)));
 if(summaries.length!==1)throw Error('Expected exactly one run summary in saved artifact');
 const summary=JSON.parse(summaries[0][1].toString('utf8')),reports={},directories={};
 for(const code of ['AK','LA']){
  const matches=Object.entries(files).filter(([name])=>name.split('/').includes(code)&&path.posix.basename(name)==='report.json');
  if(matches.length!==1)throw Error(`Expected exactly one ${code} report`);
  reports[code]=JSON.parse(matches[0][1].toString('utf8'));directories[code]=path.posix.dirname(matches[0][0]);
  const evidenceName=Object.keys(files).find(name=>name.split('/').includes(code)&&path.posix.basename(name)==='evidence.json');
  if(!evidenceName)throw Error(`Missing ${code} evidence summary`);
 }
 const provenance=validateLaakOrigin({run,artifact,currentHead,comparison,runSourceBlobs,currentSourceBlobs,summary,reports});
 // Only retrieve the requested state plus its matching captures; provenance remains bound to the full original ZIP.
 await mkdir(path.dirname(out),{recursive:true});await mkdir(out,{recursive:false});
 await writeFile(path.join(out,'artifact.zip'),bytes);
 for(const [name,body] of Object.entries(files)){
  if(name===summaries[0][0]||Object.values(directories).some(dir=>name===`${dir}/report.json`||name===`${dir}/evidence.json`||name.startsWith(`${dir}/source-captures/`))){
   const relative=path.resolve(out,'extracted',name);await mkdir(path.dirname(relative),{recursive:true});await writeFile(relative,body);
  }
 }
 await writeFile(path.join(out,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
 console.log(JSON.stringify({state,runId,artifactId:provenance.artifactId,artifactDigest:provenance.artifactDigest,out}));
}
if(import.meta.url===(process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:''))main().catch(error=>{console.error(error.message);process.exit(1);});
