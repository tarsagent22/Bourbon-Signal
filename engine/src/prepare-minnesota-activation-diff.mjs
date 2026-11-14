import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import lifecycleConfig from '../../src/config/state-lifecycle.json' with {type:'json'};
import promotionManifest from '../data/state-integration/MN.json' with {type:'json'};
import {validateImmutablePromotionEvidence} from './reliability-policy.mjs';
import {MINNESOTA_CITYHIVE_PRODUCTION_COHORT_SHA256 as cohort,
  MINNESOTA_CITYHIVE_PRODUCTION_RUNTIME_ID as runtimeId} from './minnesota-cityhive-production-config.mjs';

const cryptoHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const semanticKeys=['lifecycle','collector','storeIdentity','sourceSemantics','customerPaths'];
const verifiedPaths=['stateFilter','areaFilter','preferences','dashboard','dropFeedApi','finder','alerts','monitoring','export'];
export function buildMinnesotaActivationDiff({lifecycle=lifecycleConfig,manifest=promotionManifest,evidence}={}){
  const blockers=[];
  if(lifecycle.activeStates?.includes('MN')||lifecycle.states?.MN?.publicStatus==='active')blockers.push('authoritative MN lifecycle is already active; preparer only operates on dormant MN');
  if(manifest.state!=='MN'||manifest.lifecycle?.publicStatus!=='research_only')blockers.push('MN promotion manifest must remain research_only before preparing an activation diff');
  if(manifest.collector?.cohortSha256!==cohort||JSON.stringify(manifest.collector?.sourceIds)!==JSON.stringify([runtimeId]))blockers.push('production manifest cohort or runtime id differs from the reviewed MN adapter');
  const packageEvidence=evidence?.promotionEvidence;
  const immutable=packageEvidence?.immutableEvidence;
  const uniqueRuns=(runs,min,label)=>{
    if(!Array.isArray(runs)||runs.length<min){blockers.push(`${label} requires ${min} distinct evidence links`);return;}
    const ids=new Set(),hashes=new Set(),times=new Set();
    for(const row of runs){
      const at=Date.parse(row?.generatedAt||row?.observedAt||'');
      if(!row||row.status!=='success'||!/^\d+$/.test(String(row.runId||''))||!/^https:\/\/github\.com\/tarsagent22\/Bourbon-Signal\/actions\/runs\/\d+$/.test(String(row.runUrl||''))
        ||!/^([a-f0-9]{64})$/i.test(String(row.artifactHash||''))||!Number.isFinite(at)){blockers.push(`${label} contains a missing, malformed or untimed run link`);continue;}
      ids.add(row.runId);hashes.add(row.artifactHash.toLowerCase());times.add(at);
    }
    if(ids.size<min||hashes.size<min||times.size<min)blockers.push(`${label} needs distinct run ids, artifact hashes and observation times`);
  };
  uniqueRuns(packageEvidence?.immutableEvidence?.shadowRuns,3,'MN shadows');
  uniqueRuns(packageEvidence?.immutableEvidence?.canaryRuns,2,'MN canaries');
  if(!evidence?.sourceHistoryReconciled||!Array.isArray(evidence?.sourceHistoryLinks)||evidence.sourceHistoryLinks.length<3
    ||evidence.sourceHistoryLinks.some(link=>typeof link!=='string'||!/^https:\/\//.test(link)))blockers.push('scheduled MN source history reconciliation links are missing');
  const paths=evidence?.customerPaths;
  if(!paths||verifiedPaths.some(key=>paths[key]?.status!=='verified'))blockers.push('all nine customer path proofs must be supplied as verified');
  const targetManifest={...manifest,lifecycle:{...manifest.lifecycle,publicStatus:'active',coverageTier:'sparse_live_store_inventory',refinementLevel:'store'},
    customerPaths:paths||manifest.customerPaths};
  const targetSourceHash=cryptoHash(Object.fromEntries(semanticKeys.map(key=>[key,targetManifest[key]])));
  if(immutable?.state!=='MN'||immutable?.sourceConfigHash!==targetSourceHash)blockers.push('immutable evidence must bind the exact proposed active MN source-config hash');
  if(immutable?.cohortSha256!==cohort||immutable?.sourceRuntimeId!==runtimeId)blockers.push('immutable evidence must bind the reviewed MN cohort SHA and mn:central-cityhive runtime id');
  if(!packageEvidence||packageEvidence.verticalSliceManifest!=='engine/data/state-integration/MN.json'
    ||packageEvidence.fixtureContract!=='engine/data/state-fixtures/MN.json'||!validateImmutablePromotionEvidence('MN',packageEvidence))
    blockers.push('immutable promotion evidence is incomplete or lacks its isolated preview/provenance binding');
  if(blockers.length)return{ready:false,blockers,targetSourceConfigHash:targetSourceHash,diff:null,authoritativeFilesWritten:false};

  const nextLifecycle=structuredClone(lifecycle),current=nextLifecycle.states.MN;
  nextLifecycle.activeStates=[...new Set([...nextLifecycle.activeStates,'MN'])];
  nextLifecycle.states.MN={...current,sourceLabel:'Minnesota reviewed Top Ten Liquors pickup inventory',publicStatus:'active',
    lifecycle:'retailer_store_inventory',coverageTier:'sparse_live_store_inventory',refinementLevel:'store',inventoryAlertable:false,watchAlertable:false,
    promotionStage:'active',promotionEvidence:packageEvidence};
  const nextManifest={...targetManifest,evidence:{...manifest.evidence,immutablePromotionEvidence:immutable,
    shadow:{status:'verified',runs:immutable.shadowRuns.length},canary:{status:'verified',runs:immutable.canaryRuns.length,allDeliveryChannelsDisabled:true},
    production:{status:'prepared_not_published',url:manifest.evidence?.production?.url}}};
  return{ready:true,blockers:[],targetSourceConfigHash:targetSourceHash,diff:{'src/config/state-lifecycle.json':{activeStates:nextLifecycle.activeStates,state:nextLifecycle.states.MN},
    'engine/data/state-integration/MN.json':nextManifest},authoritativeFilesWritten:false};
}

if(import.meta.url===new URL(process.argv[1],`file://${process.cwd()}/`).href){
  const evidenceFile=process.argv.find(value=>value.startsWith('--evidence='))?.slice('--evidence='.length);
  const output=process.argv.find(value=>value.startsWith('--out='))?.slice('--out='.length);
  if(!evidenceFile||!output)throw Error('Use --evidence=<complete reviewed MN evidence package.json> --out=<new candidate diff.json>');
  const evidence=JSON.parse(await readFile(path.resolve(evidenceFile),'utf8'));
  const result=buildMinnesotaActivationDiff({evidence});
  await mkdir(path.dirname(path.resolve(output)),{recursive:true});
  await writeFile(path.resolve(output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({state:'MN',ready:result.ready,blockers:result.blockers,authoritativeFilesWritten:false,out:path.resolve(output)}));
  if(!result.ready)process.exitCode=2;
}
