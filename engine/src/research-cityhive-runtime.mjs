import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { CENTRAL_CITYHIVE_EXPANSION_SOURCES, collectCentralCityHiveExpansion } from './collectors/central-cityhive-expansion.mjs';
import { metroSourceAttempts } from './collectors/metro-refresh-state.mjs';
import { fetchWithMeta } from './core/fetcher.mjs';
import {centralCityHiveProductionAllowed,collectCentralCityHiveProductionSource} from './collectors/central-cityhive-production.mjs';

const names = Object.freeze({ WI:'Wisconsin', OK:'Oklahoma' });
const configurations = new Map(Object.entries(names).map(([state,name]) => [state,Object.freeze({
  id:state,label:`${name} first-party retailer research`,tier:'B',active:false,
  strategy:'retailer_store_inventory',cadence:'shadow-only',
  value:'Isolated exact-premises retailer pickup research; no customer activation.',
  sources:Object.freeze(CENTRAL_CITYHIVE_EXPANSION_SOURCES.filter(source=>source.state===state)
    .map(source=>Object.freeze({kind:'html',label:source.sourceLabel,url:source.categoryUrl,precisionOnly:true}))),
  apiCandidates:Object.freeze([]),
})]));

export function cityHiveResearchSourceForState(state) { return configurations.get(state) || null; }

function attemptFile(state){
  if(!configurations.has(state))throw new Error('Unregistered CityHive research attempt state');
  return path.resolve('out','research-source-attempts',`${state}.json`);
}
async function readResearchAttempts(state,sources){
  try{return metroSourceAttempts(JSON.parse(await readFile(attemptFile(state),'utf8')),sources);}
  catch(error){if(error.code==='ENOENT')return{};throw error;}
}
async function writeResearchAttempts(state,attempts,sources){
  const file=attemptFile(state),temporary=`${file}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(path.dirname(file),{recursive:true});
  try{await writeFile(temporary,JSON.stringify({schemaVersion:1,state,sourceAttempts:metroSourceAttempts({sourceAttempts:attempts},sources)},null,2));await rename(temporary,file);}
  finally{await rm(temporary,{force:true});}
}

export function cityHiveResearchLifecycleEntries() {
  return Object.fromEntries(Object.entries(names).map(([state,name]) => [state,{
    customerLabel:name,sourceLabel:`${name} first-party retailer research`,publicStatus:'research_only',
    shadowEligible:true,lifecycle:'retailer_inventory_research',coverageTier:'sparse_live_store_inventory',
    refinementLevel:'store',inventoryAlertable:false,watchAlertable:false,
    customerSummary:'Research-only exact-store pickup observations; production activation and alerts remain blocked.',
  }]));
}

// This adapter is deliberately reusable across research states. The reviewed
// source list supplies premises; actual HTTP reports supply each run's proof.
// It never edits authoritative lifecycle files, publishes snapshots or sends.
export async function collectCityHiveResearchReport(config,bible,options={}){
  if(process.env.BOURBON_SIGNAL_SHADOW_MODE!=='1'||configurations.get(config?.id)!==config) {
    throw new Error('CityHive research requires the registered isolated shadow source.');
  }
  return collectCityHiveStateReport(config,bible,options,true);
}
export async function collectPromotedCentralCityHiveState(config,bible,options={}){
  const canonical=configurations.get(config?.id);
  if(!canonical||!centralCityHiveProductionAllowed(config.id,options.lifecycleConfig,{manifest:options.promotionManifest,env:options.env}))return{
    signals:[],roadblocks:[{state:config?.id,status:'promotion_required',source:'Reviewed central retailer inventory',error:'Authoritative active lifecycle and registered first-party sources are required.'}],
  };
  return collectCentralCityHiveProductionSource(config,bible,options);
}
async function collectCityHiveStateReport(config,bible,inputOptions={},shadowOnly) {
  const {
  fetchText=fetchWithMeta,readAttempts=readResearchAttempts,writeAttempts=writeResearchAttempts,
  env=process.env,
  reportDirectory=env.BOURBON_SIGNAL_STATE_OUT_FILE?path.dirname(env.BOURBON_SIGNAL_STATE_OUT_FILE):path.resolve('out','research-cityhive',config.id),
  captureRoot=shadowOnly?path.join(reportDirectory,'source-captures'):null,...options
  }=inputOptions;
  const startedAt=new Date().toISOString(),sources=CENTRAL_CITYHIVE_EXPANSION_SOURCES.filter(source=>source.state===config.id);
  // Successful research validation runs make new observations. Persisted
  // permission/rate denials remain authoritative across separate shadow runs.
  const previous=await readAttempts(config.id,sources,null);
  const denied=Object.fromEntries(Object.entries(previous).filter(([,row])=>[401,403,429,435].includes(Number(row.httpStatus))));
  const receipts=[];
  const boundedFetch=async(url,requestOptions)=>{
    const response=await fetchText(url,requestOptions),clock=new Date().toISOString();
    const canonicalUrl=value=>{try{const parsed=new URL(value);parsed.searchParams.sort();return parsed.href;}catch{return null;}};
    if(response.ok&&canonicalUrl(response.url)!==canonicalUrl(url))throw new Error(`Research source redirected or omitted final URL identity: ${url} -> ${response.url}`);
    const source=sources.find(source=>new URL(url).hostname===source.hostname);
    if([401,403,429,435].includes(Number(response.status))&&source){
      denied[source.id]={lastAttemptAt:clock,status:response.status===429?'rate_limited':response.status===435?'permanent_error':'access_denied',httpStatus:response.status,
        nextAllowedAt:new Date(Date.parse(clock)+24*60*60_000).toISOString()};
      await writeAttempts(config.id,denied,sources);
    }
    const text=String(response.text||''),hash=createHash('sha256').update(text).digest('hex');
    const capture={url,finalUrl:response.url||null,status:response.status||0,observedAt:clock,sha256:hash,bytes:Buffer.byteLength(text)};
    if(captureRoot){
      const directory=captureRoot;
      await mkdir(directory,{recursive:true});
      capture.file=path.join(directory,`${String(receipts.length+1).padStart(3,'0')}-${hash.slice(0,12)}.html`);
      capture.artifactPath=path.relative(reportDirectory,capture.file).split(path.sep).join('/');
      if(!/^source-captures\/[A-Za-z0-9._-]+\.html$/.test(capture.artifactPath))throw new Error('CityHive source capture is outside its portable report directory');
      await writeFile(capture.file,text);
    }
    receipts.push(capture);return response;
  };
  const result=await collectCentralCityHiveExpansion(config,bible,{...options,fetchText:boundedFetch,attempts:denied});
  const finishedAt=new Date().toISOString();
  const sourceReports=sources.map(source=>{
    const attempted=result.metadata.requests.filter(request=>request.sourceId===source.id),ok=attempted.length>0&&attempted.every(request=>request.ok);
    return{sourceRuntimeId:`research:${config.id.toLowerCase()}:${source.id}`,label:source.sourceLabel,url:source.categoryUrl,
      ok,status:ok?200:attempted.find(request=>!request.ok)?.status||0,
      signalType:'retailer_store_inventory_result',matchedBottleCount:result.signals.filter(row=>row.sourceChain===source.id).length,
      error:ok?null:attempted.length?'source_request_failed':'source_not_due_or_permission_cooldown'};
  });
  const healthy=sourceReports.length>0&&sourceReports.every(source=>source.ok);
  const signals=result.signals.map(row=>shadowOnly?({...row,sourceRuntimeId:`research:${config.id.toLowerCase()}:${row.sourceChain}`,
    alertable:false,eligibleForOnSite:false,eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false,
    sourceProductBinding:{...row.sourceProductBinding,shadowOnly:true},
    raw:{...row.raw,shadowOnly:true}}):({...row,sourceRuntimeId:`precision:${config.id.toLowerCase()}`,raw:{...row.raw,shadowOnly:false}}));
  return{state:config.id,label:config.label,tier:config.tier,strategy:config.strategy,cadence:config.cadence,
    startedAt,finishedAt,lastGoodAt:healthy?finishedAt:null,status:signals.length?healthy?'useful':'partial_useful':'no_trusted_inventory',
    stale:false,signals,sources:sourceReports,sourceResults:sourceReports.map(row=>({sourceId:row.sourceRuntimeId,sourceLabel:row.label,
      sourceUrl:row.url,ok:row.ok,status:row.ok?'success':'failed',checkedAt:finishedAt,lastGoodAt:row.ok?finishedAt:null,
      alertable:false,inventoryAlertable:false,watchAlertable:false})),roadblocks:result.roadblocks,
    metadata:{...result.metadata,receipts,complete:healthy,
      origin:env.GITHUB_ACTIONS==='true'&&/^\d+$/.test(env.GITHUB_RUN_ID||'')&&/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')
        ?{kind:'github_actions',repository:env.GITHUB_REPOSITORY,workflowRunId:env.GITHUB_RUN_ID,commitSha:env.GITHUB_SHA,runAttempt:env.GITHUB_RUN_ATTEMPT||'1'}
        :{kind:'local_shadow_not_workflow_issued'},
      bibleRecordsSha256:createHash('sha256').update(JSON.stringify(bible.records)).digest('hex'),
      shadowOnly,productionActivationAllowed:!shadowOnly,customerDeliveryAllowed:!shadowOnly}};
}
