#!/usr/bin/env node
// Explicit CI fixture migration only. Production refresh/verification never calls
// this script. No source collection, live canary rows, or new clock is created.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {buildStateDropPartitions,verifyStateDropPartitions} from '../engine/src/site-state-partitions.mjs';
import {buildStateQualityInputs,buildStateQualityScorecard} from '../engine/src/state-quality-scorecard.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const REVIEWED_FOUR=['WA','NM','WI','OK'];
const REVIEWED_NINE=[...REVIEWED_FOUR,'LA','AK','MA','CT','RI'];
const LEGACY_RUN='a7401de0a51cca45';
const readJson=async file=>JSON.parse(await readFile(file,'utf8'));
const serialize=value=>JSON.stringify(value,null,2)+'\n';
const hash=value=>createHash('sha256').update(value).digest('hex');
const summary=states=>({stateCount:states.length,releaseEligibleStates:states.filter(row=>row.releaseEligible).length,
  releaseBlockedStates:states.filter(row=>!row.releaseEligible).length,
  averageScore:Math.round(states.reduce((sum,row)=>sum+row.score,0)/states.length),
  weakestStates:[...states].sort((a,b)=>a.score-b.score||a.state.localeCompare(b.state)).slice(0,5).map(row=>row.state)});

export async function prepareLegacySiteFixtureForCi({root=ROOT,ci=false,workflow=''}={}){
  if(ci!==true||workflow!=='CI')throw Error('Legacy site preparation is CI-only and requires the explicit CI workflow');
  const site=path.join(root,'engine/out/site'),config=await readJson(path.join(root,'src/config/state-lifecycle.json'));
  const [manifest,stats,quality,drops,index]=await Promise.all(['manifest.json','stats.json','state-quality.json','drops.json','states/index.json'].map(file=>readJson(path.join(site,file))));
  if(manifest.runId!==LEGACY_RUN||stats.runId!==LEGACY_RUN||index.runId!==LEGACY_RUN
    ||manifest.generatedAt!==stats.generatedAt||manifest.generatedAt!==index.generatedAt
    ||manifest.generatedAt!==quality.generatedAt||manifest.generatedAt!==drops.generatedAt)
    throw Error('CI preparation only accepts the reviewed historical site fixture and its original clocks');
  const expectedStateCount=config.activeStates.length;
  const ADDITIONS=expectedStateCount===28?REVIEWED_FOUR:expectedStateCount===expectedStateCount?REVIEWED_NINE:null;
  if(!ADDITIONS)throw Error('Unexpected lifecycle scope for this exact CI fixture migration');
  const legacyStates=config.activeStates.filter(state=>!ADDITIONS.includes(state));
  if(legacyStates.length!==24||![28,33].includes(config.activeStates.length)||ADDITIONS.some(state=>!config.activeStates.includes(state)))throw Error('Unexpected lifecycle scope for this exact CI fixture migration');
  for(const state of legacyStates)if(!index.states.some(row=>row.state===state)||!stats.stateCoverage.states.some(row=>row.state===state)||!quality.states.some(row=>row.state===state))throw Error('Missing legacy state '+state);
  if(drops.drops.some(row=>ADDITIONS.includes(row.state)))throw Error('CI preparation cannot accept or replace actual new-state stock');
  const previousPayloads=new Map();
  for(const entry of index.states){
    if(!legacyStates.includes(entry.state)&&!ADDITIONS.includes(entry.state))throw Error('Unexpected partition state');
    const body=await readFile(path.join(site,entry.file),'utf8'),payload=JSON.parse(body);
    if(ADDITIONS.includes(entry.state)&&(payload.ciFixtureOnly!==true||payload.count!==0||payload.drops.length!==0))throw Error('Refusing to overwrite a real new-state partition');
    previousPayloads.set(entry.state,payload);
  }
  const before=verifyStateDropPartitions(drops.drops,{index,payloads:previousPayloads});
  if(!before.ok)throw Error(before.errors.join('; '));
  const built=buildStateDropPartitions(drops.drops,{contractVersion:manifest.contractVersion,generatedAt:manifest.generatedAt,activeStates:config.activeStates});
  const entries=index.states.filter(row=>legacyStates.includes(row.state));
  const payloads=new Map([...previousPayloads].filter(([state])=>legacyStates.includes(state)));
  const writes=[];
  for(const state of ADDITIONS){
    try{
      const prior=await readJson(path.join(site,`states/${state}/drops.json`));
      if(prior.ciFixtureOnly!==true||prior.count!==0||!Array.isArray(prior.drops)||prior.drops.length)throw Error('Refusing to overwrite a real or unindexed new-state partition');
    }catch(error){if(error.code!=='ENOENT')throw error;}
    const payload={...built.payloads.get(state),runId:manifest.runId,engineGeneratedAt:manifest.engineGeneratedAt,ciFixtureOnly:true,collectionStatus:'ci_not_collected'};
    const text=serialize(payload),file=`states/${state}/drops.json`;
    entries.push({state,file,count:0,sha256:hash(text),ciFixtureOnly:true});payloads.set(state,payload);writes.push([file,text]);
  }
  index.states=entries.sort((a,b)=>a.state.localeCompare(b.state));index.stateCount=expectedStateCount;
  const verified=verifyStateDropPartitions(drops.drops,{index,payloads});if(!verified.ok)throw Error(verified.errors.join('; '));
  const emptyCoverage=ADDITIONS.map(state=>({state,label:config.states[state].customerLabel||state,
    status:'ci_not_collected',publicStatus:'active',coverageTier:'ci_not_collected',signalCount:0,dropCount:0,storeCount:0,sourceCount:0,roadblockCount:0,
    freshestObservedAt:null,inventoryAlertable:false,watchAlertable:false,ciFixtureOnly:true,
    customerSummary:'CI fixture only; source not collected. No inventory, freshness or customer coverage is claimed.'}));
  stats.stateCount=expectedStateCount;stats.stateCoverage.states=[...stats.stateCoverage.states.filter(row=>legacyStates.includes(row.state)),...emptyCoverage];
  stats.stateCoverage.stateCount=expectedStateCount;stats.stateCoverage.counts={};
  for(const row of stats.stateCoverage.states)stats.stateCoverage.counts[row.coverageTier]=(stats.stateCoverage.counts[row.coverageTier]||0)+1;
  const emptyQuality=buildStateQualityScorecard(buildStateQualityInputs({stateCoverage:{states:emptyCoverage},drops:[],alerts:[]}),{generatedAt:quality.generatedAt});
  quality.states=[...quality.states.filter(row=>legacyStates.includes(row.state)),...emptyQuality.states.map(row=>({...row,ciFixtureOnly:true,collectionStatus:'ci_not_collected'}))];
  quality.summary=summary(quality.states);stats.stateQuality=quality.summary;
  const notice={schemaVersion:1,scope:'ci_legacy_structure_only_no_source_collection',states:ADDITIONS,sourceRunId:LEGACY_RUN,preservedOriginalClocks:true,inventoryRowsAdded:0};
  stats.ciFixturePreparation=notice;manifest.ciFixturePreparation=notice;manifest.statePartitions=index.states;
  writes.push(['states/index.json',serialize(index)],['state-quality.json',serialize(quality)],['stats.json',serialize(stats)],['manifest.json',serialize(manifest)]);
  for(const[file,text]of writes){await mkdir(path.dirname(path.join(site,file)),{recursive:true});await writeFile(path.join(site,file),text);}
  return notice;
}
const invoked=process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:'';
if(import.meta.url===invoked){
  if(!process.argv.includes('--ci-fixture-only')||!['true','1'].includes(process.env.CI||'')||process.env.GITHUB_WORKFLOW!=='CI'){console.error('Use only in workflow CI with CI=true and --ci-fixture-only; production data is not a fixture');process.exitCode=1;}
  else prepareLegacySiteFixtureForCi({ci:true,workflow:process.env.GITHUB_WORKFLOW}).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
