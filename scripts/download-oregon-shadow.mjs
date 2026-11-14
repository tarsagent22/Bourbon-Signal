import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {unzipSync} from 'fflate';

const REPOSITORY='tarsagent22/Bourbon-Signal';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const preparationOnly=file=>[
  '.github/workflows/state-expansion-canary.yml','.github/workflows/refresh-feed.yml','scripts/download-oregon-shadow.mjs','scripts/test-oregon-shadow-download.mjs',
  'scripts/test-oregon-public-canary.mjs','engine/src/prepare-oregon-canary.mjs','engine/src/oregon-research-fixtures.mjs',
  'engine/src/oregon-daily-production-policy.mjs','src/lib/public-drop-evidence.ts','src/lib/drop-feed-visibility.ts',
  'engine/src/build-state-canary-preview.mjs',
  'engine/src/central-cityhive-policy.mjs','engine/src/export-site-contract.mjs',
  'engine/src/verify-state-fixtures.mjs','engine/test/oregon-canary.test.mjs','engine/test/or-daily-inventory.test.mjs',
  'engine/data/state-fixtures/OR.json','engine/data/state-integration/OR.json',
].includes(file);

export function validateOregonShadowOrigin({repository=REPOSITORY,run,sourceArtifact,shadowArtifact,currentHead,comparison,shadowSummary,sourceReport,shadowReport}){
  if(repository!==REPOSITORY||run?.conclusion!=='success'||run.status!=='completed'||run.repository?.full_name!==repository
    ||run.path!=='.github/workflows/state-expansion-shadow.yml'||!/^[0-9]+$/.test(String(run.id))
    ||!/^[a-f0-9]{40}$/.test(run.head_sha||'')||!/^[a-f0-9]{40}$/.test(currentHead||''))throw Error('Oregon report was not issued by the successful repository shadow workflow');
  const sourceName=`oregon-inventory-source-${run.id}`,shadowName=`state-expansion-shadow-${run.id}`;
  for(const[artifact,name]of [[sourceArtifact,sourceName],[shadowArtifact,shadowName]])if(artifact?.name!==name||artifact.expired===true
    ||!/^[0-9]+$/.test(String(artifact.id))||!/^sha256:[a-f0-9]{64}$/.test(artifact.digest||'')
    ||!(artifact.size_in_bytes>0&&artifact.size_in_bytes<=128*1024*1024))throw Error(`Missing, expired, oversized, or unbound artifact ${name}`);
  const orResult=shadowSummary?.results?.find(row=>row.state==='OR');
  if(shadowSummary?.mode!=='shadow'||shadowSummary.complete!==true||!orResult?.complete||orResult.outcome!=='complete'
    ||orResult.publication?.allowed!==false||orResult.publication?.productionSnapshotTouched!==false
    ||orResult.alerts?.disabled!==true||orResult.alerts?.deliveryAttempted!==false)throw Error('OR shadow artifact does not show complete evidence with publication and delivery disabled');
  if(sourceReport?.schemaVersion!=='bourbon-signal-or-product-availability-v1'||sourceReport.status!=='ready'
    ||sourceReport.sourceUrl!=='https://www.olcc.state.or.us/pdfs/DailyStoreInventory.csv'||sourceReport.bible?.mode!=='live'
    ||!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(sourceReport.sourceReportDate||'')||!/^[a-f0-9]{64}$/.test(sourceReport.sourceSha256||'')
    ||shadowReport?.state!=='OR'||shadowReport.status!=='useful'||!Array.isArray(shadowReport.signals)||!shadowReport.signals.length
    ||!shadowReport.sources?.some(source=>source.ok===true&&source.url===sourceReport.sourceUrl)
    ||!shadowReport.signals.every(row=>row.sourceUrl===sourceReport.sourceUrl&&row.fetchedAt===sourceReport.generatedAt
      &&row.raw?.sourceReportDate===sourceReport.sourceReportDate&&row.sourceAvailabilityVerified===true
      &&row.canAlertAsInventory===false&&row.canAlertAsWatch===false&&row.eligibleForDelivery===false
      &&row.eligibleForEmail===false&&row.eligibleForSms===false))throw Error('Hosted OR signals do not bind to the official report revision and disabled alert policy');
  const sourceAt=Date.parse(sourceReport.generatedAt),shadowStart=Date.parse(shadowReport.startedAt),shadowEnd=Date.parse(shadowReport.finishedAt),summaryAt=Date.parse(shadowSummary.generatedAt);
  if(![sourceAt,shadowStart,shadowEnd,summaryAt].every(Number.isFinite)||sourceAt>shadowStart||shadowStart>shadowEnd||shadowEnd>summaryAt
    ||shadowStart-sourceAt>10*60_000||shadowEnd-shadowStart>10*60_000||shadowReport.signals.some(row=>row.fetchedAt!==sourceReport.generatedAt))throw Error('Saved source, state, and summary clocks are not one coherent hosted report revision');
  const changes=run.head_sha===currentHead?[]:comparison?.files;
  if(run.head_sha!==currentHead&&(!['ahead','identical'].includes(comparison?.status)||!Array.isArray(changes)||changes.length>=300
    ||changes.some(file=>!preparationOnly(file.filename))))throw Error('Oregon collector/source changed since the saved report; collect a new report before canary');
  return{status:'verified_github_oregon_report_artifacts',state:'OR',repository,workflowRunId:String(run.id),workflowRunUrl:run.html_url,
    headSha:run.head_sha,currentHead,sourceEquivalentPreparationChanges:changes.map(file=>file.filename),
    sourceArtifactId:String(sourceArtifact.id),sourceArtifactName:sourceArtifact.name,sourceArtifactDigest:sourceArtifact.digest.slice(7),
    shadowArtifactId:String(shadowArtifact.id),shadowArtifactName:shadowArtifact.name,shadowArtifactDigest:shadowArtifact.digest.slice(7),
    verifiedAt:new Date().toISOString()};
}

function decodeArtifact(bytes,digest,kind){
  if(bytes.length>128*1024*1024||sha(bytes)!==digest)throw Error(`${kind} artifact ZIP digest or size is invalid`);
  let count=0,total=0;const output=unzipSync(bytes,{filter:file=>{
    if(file.name.endsWith('/'))return false;
    if(++count>512||file.name.includes('\\')||file.name.includes('\0')||file.name.startsWith('/')||/^[A-Za-z]:/.test(file.name)
      ||file.name.split('/').some(part=>part==='..'||part==='.')||!Number.isSafeInteger(file.originalSize)||file.originalSize>16*1024*1024
      ||(total+=file.originalSize)>96*1024*1024)throw Error('Oregon shadow archive contains an unsafe path or exceeds extraction limits');
    return true;
  }});
  return Object.fromEntries(Object.entries(output).map(([name,body])=>[name,Buffer.from(body)]));
}

function argument(flag){return process.argv.find(value=>value.startsWith(flag+'='))?.slice(flag.length+1);}
async function main(){
  const runId=argument('--run'),destination=argument('--out-dir');
  if(!/^[0-9]+$/.test(runId||'')||!destination)throw Error('Use --run=<workflow run ID> --out-dir=<new directory>');
  const gh=process.platform==='win32'?'gh.exe':'gh',out=path.resolve(destination);
  const api=endpoint=>JSON.parse(execFileSync(gh,['api',`repos/${REPOSITORY}/${endpoint}`],{encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true}));
  const run=api(`actions/runs/${runId}`),artifacts=api(`actions/runs/${runId}/artifacts?per_page=100`);
  const sourceArtifact=artifacts.artifacts?.find(row=>row.name===`oregon-inventory-source-${runId}`),shadowArtifact=artifacts.artifacts?.find(row=>row.name===`state-expansion-shadow-${runId}`);
  const currentHead=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const comparison=run.head_sha===currentHead?null:api(`compare/${run.head_sha}...${currentHead}`);
  const sourceBytes=execFileSync(gh,['api',`repos/${REPOSITORY}/actions/artifacts/${sourceArtifact?.id}/zip`],{maxBuffer:128*1024*1024,windowsHide:true});
  const shadowBytes=execFileSync(gh,['api',`repos/${REPOSITORY}/actions/artifacts/${shadowArtifact?.id}/zip`],{maxBuffer:128*1024*1024,windowsHide:true});
  const sourceFiles=decodeArtifact(sourceBytes,sourceArtifact?.digest?.slice(7),'Oregon source'),shadowFiles=decodeArtifact(shadowBytes,shadowArtifact?.digest?.slice(7),'state shadow');
  const sourceMatches=Object.entries(sourceFiles).filter(([name])=>path.posix.basename(name)==='OR-product-availability.json');
  const summaryMatches=Object.entries(shadowFiles).filter(([name])=>/^run-[^/]+\.json$/.test(path.posix.basename(name)));
  const stateReportMatches=Object.entries(shadowFiles).filter(([name])=>name.split('/').includes('OR')&&path.posix.basename(name)==='report.json');
  if(sourceMatches.length!==1||summaryMatches.length!==1||stateReportMatches.length!==1)throw Error('Expected exactly one official Oregon report, state report, and matching shadow summary');
  const sourceReport=JSON.parse(sourceMatches[0][1].toString('utf8'));
  const shadowSummary=JSON.parse(summaryMatches[0][1].toString('utf8'));
  const shadowReport=JSON.parse(stateReportMatches[0][1].toString('utf8'));
  const provenance=validateOregonShadowOrigin({run,sourceArtifact,shadowArtifact,currentHead,comparison,shadowSummary,sourceReport,shadowReport});
  await mkdir(path.dirname(out),{recursive:true});await mkdir(out,{recursive:false});
  await writeFile(path.join(out,'source-artifact.zip'),sourceBytes);await writeFile(path.join(out,'shadow-artifact.zip'),shadowBytes);
  await writeFile(path.join(out,'OR-product-availability.json'),sourceMatches[0][1]);
  await writeFile(path.join(out,'OR-shadow-report.json'),stateReportMatches[0][1]);
  await writeFile(path.join(out,'shadow-run.json'),summaryMatches[0][1]);
  await writeFile(path.join(out,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
  console.log(JSON.stringify({state:'OR',workflowRunId:runId,sourceArtifactId:provenance.sourceArtifactId,shadowArtifactId:provenance.shadowArtifactId,
    sourceReportGeneratedAt:JSON.parse(sourceMatches[0][1].toString('utf8')).generatedAt,out}));
}
if(import.meta.url===(process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:''))main().catch(error=>{console.error(error.message);process.exit(1);});
