import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const arg=flag=>process.argv.find(value=>value.startsWith(flag+'='))?.slice(flag.length+1);

export function createIsolatedMinnesotaCanaryInput({manifest,authoritativeLifecycle,sourceProvenance}={}){
  if(manifest?.state!=='MN'||!manifest.lifecycle||!authoritativeLifecycle?.states?.MN)throw new Error('MN canary input requires the reviewed state manifest and authoritative lifecycle.');
  const authoritative=authoritativeLifecycle.states.MN,active=authoritativeLifecycle.activeStates?.includes('MN')===true;
  if(!active&&authoritative.publicStatus!=='active')return structuredClone(manifest);
  const lifecycleKeys=['customerLabel','publicStatus','coverageTier','refinementLevel'];
  const manifestMatchesAuthority=lifecycleKeys.every(key=>manifest.lifecycle[key]===authoritative[key]);
  if(!active||authoritative.publicStatus!=='active'||authoritative.lifecycle!=='retailer_store_inventory'
    ||authoritative.coverageTier!=='sparse_live_store_inventory'||authoritative.refinementLevel!=='store'
    ||authoritative.inventoryAlertable!==false||authoritative.watchAlertable!==false||!manifestMatchesAuthority
    ||sourceProvenance?.state!=='MN'||sourceProvenance?.inactiveMinnesotaShadowLifecycleTransition!==true){
    throw new Error('Active MN canary input requires an exact immutable active lifecycle and verified inactive-shadow transition.');
  }
  const isolated=structuredClone(manifest);
  isolated.lifecycle.publicStatus='research_only';
  return isolated;
}

export function buildMinnesotaCityHiveCanaryManifest({manifest,previewConfig,previewPolicy,sourceProvenance,canaryRunUrl}={}){
  const state='MN',preview=previewConfig?.states?.[state];
  if(manifest?.state!==state||manifest.lifecycle?.publicStatus!=='research_only'
    ||previewConfig?.activeStates?.includes(state)!==true||preview?.publicStatus!=='active'
    ||preview?.promotionStage!=='canary'||preview?.inventoryAlertable!==false||preview?.watchAlertable!==false
    ||previewPolicy?.state!==state||previewPolicy?.mode!=='canary_preview'
    ||previewPolicy?.alertDeliveryEnabled!==false||previewPolicy?.productionSnapshotPublicationEnabled!==false
    ||previewPolicy?.productionDeploymentEnabled!==false
    ||sourceProvenance?.status!=='verified_github_shadow_artifact'||sourceProvenance?.state!==state
    ||!/^[0-9]+$/.test(String(sourceProvenance.workflowRunId||''))
    ||!/^[0-9]+$/.test(String(sourceProvenance.artifactId||''))
    ||!/^[a-f0-9]{64}$/.test(sourceProvenance.artifactDigest||'')
    ||typeof canaryRunUrl!=='string'||!/^https:\/\/github\.com\/tarsagent22\/Bourbon-Signal\/actions\/runs\/[0-9]+$/.test(canaryRunUrl)){
    throw new Error('MN canary manifest requires a dormant production manifest, isolated preview lifecycle, closed preview policy and verified shadow artifact.');
  }
  const result=structuredClone(manifest);
  result.lifecycle=structuredClone(preview);
  const notExercised=reason=>({status:'not_applicable',reason:`Isolated MN canary scope: ${reason}`});
  result.customerPaths={
    stateFilter:{status:'verified',assertion:'The isolated MN Coverage route returns current status for the requested Minnesota cohort.'},
    areaFilter:notExercised('This cohort is registered by exact store premise, with no regional or board-level source.'),
    preferences:notExercised('User preference mutation and persistence are outside this source canary.'),
    dashboard:notExercised('The isolated source canary does not assert dashboard release readiness.'),
    dropFeedApi:notExercised('The verifier checks the candidate feed policy and state export, not the authenticated production Drop Feed API.'),
    finder:{status:'verified',assertion:'The isolated MN Finder returns the exact current Top Ten Liquors premise and reviewed address.'},
    alerts:{status:'verified',assertion:'Preview policy disables every delivery channel; source and candidate rows remain inventory and watch alert-ineligible.'},
    monitoring:{status:'verified',assertion:'Private preview Coverage exposes only the current sparse exact-premise cohort.'},
    export:{status:'verified',assertion:'The canary state partition and source-bound candidate rows pass export-integrity checks.'},
  };
  result.evidence={
    shadow:{status:'verified',runs:1,artifact:`${sourceProvenance.workflowRunUrl}#artifact-${sourceProvenance.artifactId}`,
      artifactDigest:sourceProvenance.artifactDigest,originalSourceClocksPreserved:true},
    canary:{status:'verified',runs:1,artifact:canaryRunUrl,allDeliveryChannelsDisabled:true},
    production:{status:'not_deployed',url:null,assertion:'The isolated canary is not a production publication or deployment.',
      reason:'The reviewed candidate lifecycle is read unchanged; this workflow writes only an isolated artifact with delivery and deployment disabled.'},
  };
  return result;
}

async function main(){
  const cwd=process.cwd(),engineRoot=path.basename(cwd)==='engine'?cwd:path.resolve(cwd,'engine');
  const state=arg('--state'),previewConfigFile=arg('--preview-config'),previewPolicyFile=arg('--preview-policy');
  const provenanceFile=arg('--source-provenance'),runUrl=arg('--canary-run-url');
  const outDir=arg('--out-dir');
  if(state!=='MN'||!previewConfigFile||!previewPolicyFile||!provenanceFile||!runUrl||outDir!=='out/canary-preparation/MN/state-integration')
    throw new Error('Use MN with reviewed canary lifecycle, preview policy, verified source provenance and fixed isolated output directory.');
  const read=async file=>JSON.parse(await readFile(path.resolve(engineRoot,file),'utf8'));
  const manifest=await read('data/state-integration/MN.json');
  const previewConfig=await read(previewConfigFile),previewPolicy=await read(previewPolicyFile),sourceProvenance=await read(provenanceFile);
  const authoritative=JSON.parse(await readFile(path.join(engineRoot,'..','src','config','state-lifecycle.json'),'utf8'));
  const isolatedManifest=createIsolatedMinnesotaCanaryInput({manifest,authoritativeLifecycle:authoritative,sourceProvenance});
  const result=buildMinnesotaCityHiveCanaryManifest({manifest:isolatedManifest,previewConfig,previewPolicy,sourceProvenance,canaryRunUrl:runUrl});
  const out=path.resolve(engineRoot,outDir),fixtures=path.join(out,'..','state-fixtures');
  await mkdir(out,{recursive:true});await mkdir(fixtures,{recursive:true});
  await writeFile(path.join(out,'MN.json'),JSON.stringify(result,null,2)+'\n');
  await writeFile(path.join(fixtures,'MN.json'),await readFile(path.join(engineRoot,'data','state-fixtures','MN.json')));
  console.log(JSON.stringify({state,manifest:'canary_only',isolatedResearchLifecycle:true,productionLifecycleModified:false,sourceRun:sourceProvenance.workflowRunId,out:path.join(out,'MN.json')}));
}

if(import.meta.url===(process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:''))main().catch(error=>{console.error(error.message);process.exit(1);});
