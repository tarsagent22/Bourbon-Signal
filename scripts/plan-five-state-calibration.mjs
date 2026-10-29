import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {evaluateCapacityBudget} from '../engine/src/reliability-policy.mjs';
export const FIVE_STATE_CALIBRATION_STATES=Object.freeze(['LA','AK','MA','CT','RI']);
export function planFiveStateCalibration({config,reports,sourceCommit,workflowRunId}){
 if(!/^[a-f0-9]{40}$/.test(sourceCommit||'')||!/^\d+$/.test(String(workflowRunId||'')))throw Error('Calibration needs the actual immutable source commit and workflow run ID');
 if(!Array.isArray(config?.activeStates)||!config.reliabilityPolicy)throw Error('Actual current lifecycle reliability config required');
 const policy=config.reliabilityPolicy,forecasts={},observations={};
 for(const state of FIVE_STATE_CALIBRATION_STATES){
  if(config.activeStates.includes(state)||config.states?.[state]?.publicStatus==='active')throw Error('Five-state calibration must remain inactive');
  const report=reports[state],origin=report?.metadata?.origin,elapsed=Date.parse(report?.finishedAt)-Date.parse(report?.startedAt);
  if(report?.state!==state||report.metadata?.complete!==true||report.metadata.shadowOnly!==true
    ||report.metadata.productionActivationAllowed!==false||report.metadata.customerDeliveryAllowed!==false
    ||origin?.kind!=='github_actions'||origin.repository!=='tarsagent22/Bourbon-Signal'||origin.commitSha!==sourceCommit||String(origin.workflowRunId)!==String(workflowRunId)
    ||!Array.isArray(report.sources)||!report.sources.length||!report.sources.every(row=>row.ok===true)
    ||!Number.isFinite(elapsed)||elapsed<=0||!report.metadata.receipts?.length||!report.metadata.receipts.every(row=>[200,206].includes(row.status)))throw Error(state+': incomplete or unbound actual calibration report');
  forecasts[state]=Math.ceil(2*elapsed/30000)*30000;
  observations[state]={runtimeMs:elapsed,requestCount:report.metadata.receipts.length,startedAt:report.startedAt,finishedAt:report.finishedAt,
    sourceCommit,workflowRunId:String(workflowRunId),canonicalReportSha256:createHash('sha256').update(JSON.stringify(report)).digest('hex')};
 }
 const states=[...new Set([...config.activeStates,...FIVE_STATE_CALIBRATION_STATES])],durations=states.map(state=>({state,expectedRunMs:forecasts[state]??policy.stateExpectedRunMs?.[state]??policy.defaultExpectedStateRunMs}));
 if(durations.some(row=>!Number.isFinite(row.expectedRunMs)||row.expectedRunMs<=0))throw Error('Capacity model contains an invalid or missing expected runtime');
 return{schemaVersion:1,scope:'single_sample_calibration_planning_only_not_promotion',sampleCountPerState:1,statistic:'single_sample_not_p95',formula:'ceil(2 * measuredStateRuntimeMs / 30000) * 30000',calibrationQualifiesForFinalShadowCounters:false,sourceAndParentHardcapsChanged:false,
  sourceCommit,workflowRunId:String(workflowRunId),existingActiveStateCount:config.activeStates.length,proposedStateCount:FIVE_STATE_CALIBRATION_STATES.length,fullStateCount:states.length,observations,forecasts,durations,
  capacity:evaluateCapacityBudget({stateExpectedRunMs:durations.map(row=>row.expectedRunMs),concurrency:policy.workerConcurrency,intervalMs:policy.refreshIntervalMs,safetyMarginMs:policy.refreshSafetyMarginMs})};
}
async function reportsIn(directory){let result=[];for(const entry of await readdir(directory,{withFileTypes:true})){const name=path.join(directory,entry.name);if(entry.isDirectory())result.push(...await reportsIn(name));else if(entry.name==='report.json')result.push(JSON.parse(await readFile(name,'utf8')));}return result;}
const arg=flag=>process.argv.find(value=>value.startsWith(flag+'='))?.slice(flag.length+1);
async function main(){const input=arg('--artifact-dir'),commit=arg('--source-commit'),run=arg('--run'),out=arg('--out');if(!input||!out)throw Error('Use --artifact-dir=<verified extracted complete batch> --source-commit=<exact SHA> --run=<actual runID> --out=<planning JSON>');
 const rows=await reportsIn(input),reports={};for(const state of FIVE_STATE_CALIBRATION_STATES){const matches=rows.filter(row=>row.state===state);if(matches.length!==1)throw Error('Exactly one original '+state+' report required');reports[state]=matches[0];}
 const config=JSON.parse(await readFile('src/config/state-lifecycle.json','utf8')),result=planFiveStateCalibration({config,reports,sourceCommit:commit,workflowRunId:run});await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));if(!result.capacity.ok)process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
