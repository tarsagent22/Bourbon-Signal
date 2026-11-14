import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {mkdirSync,writeFileSync,renameSync,rmSync} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {collectGroceryExpansion} from './collectors/grocery-xapi-expansion.mjs';
import {WESTERN_GROCERY_EXPANSION_SOURCES} from './collectors/western-grocery-premises.mjs';
import {MAINE_SHAWS_RESEARCH_SOURCES} from './collectors/maine-shaws-research.mjs';
import {fetchWithMeta} from './core/fetcher.mjs';

export const GROCERY_RESEARCH_STATE_IDS=new Set(['WA','NM','ME']);
const names={WA:'Washington',NM:'New Mexico'};
const lifecycleNames={...names,ME:"Maine Shaw's"};
const configs=new Map(Object.entries(names).map(([state,name])=>[state,Object.freeze({
  id:state,label:`${name} exact-store grocery research`,tier:'B',active:false,
  strategy:'retailer_store_inventory',cadence:'shadow-only',
  value:'Isolated current first-party store inventory; production activation is prohibited.',
  sources:Object.freeze([...new Set(WESTERN_GROCERY_EXPANSION_SOURCES.filter(s=>s.stateCode===state).map(s=>s.host))]
    .map(host=>Object.freeze({kind:'api',url:`https://${host}/abs/pub/xapi/search/substitute`,precisionOnly:true}))),
  apiCandidates:Object.freeze([]),
})]));
const MAINE_SHAWS_DROP_IDS=new Set(['960137024','289031989','970889019','970022436']);
const maineShawsConfig=Object.freeze({
  id:'ME',label:"Maine Shaw's exact-store grocery research",tier:'B',active:false,
  strategy:'retailer_store_inventory',cadence:'once-per-day-shadow-only',
  value:"Ten reviewed Shaw's premises with a bounded first-party in-store query cohort; production activation is prohibited.",
  sources:Object.freeze([{kind:'api',url:'https://www.shaws.com/abs/pub/xapi/storeresolver/v2/all',precisionOnly:true},
    {kind:'api',url:'https://www.shaws.com/abs/pub/xapi/search/substitute',precisionOnly:true}]),
  apiCandidates:Object.freeze([]),sourceRegistry:MAINE_SHAWS_RESEARCH_SOURCES,resolverHost:'www.shaws.com',
  resolverZips:Object.freeze(MAINE_SHAWS_RESEARCH_SOURCES.map(source=>source.zip)),
  requestLimit:30,storeLimit:10,searchTerms:Object.freeze(['bourbon','eagle rare']),
  requireExactSearchEcho:true,disableLibrarySearchPlan:true,
  includeProduct:(row,source)=>MAINE_SHAWS_RESEARCH_SOURCES.includes(source)
    &&MAINE_SHAWS_DROP_IDS.has(String(row.productId))&&row.tier==='limited'
    &&Number.isFinite(row.price)&&row.price>0,
});
configs.set('ME',maineShawsConfig);
export const groceryResearchSourceForState=state=>configs.get(state)||null;
export function groceryResearchLifecycleEntries(){
  return Object.fromEntries(Object.entries(lifecycleNames).map(([state,name])=>[state,{
    customerLabel:name,sourceLabel:`${name} exact-store grocery research`,publicStatus:'research_only',
    shadowEligible:true,lifecycle:'retailer_inventory_research',coverageTier:'sparse_live_store_inventory',
    refinementLevel:'store',inventoryAlertable:false,watchAlertable:false,
    customerSummary:'Research-only first-party exact-store observations. Customer activation and delivery remain blocked.',
  }]));
}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function workflowOrigin(env){
  return env.GITHUB_ACTIONS==='true'&&/^\d+$/.test(env.GITHUB_RUN_ID||'')&&/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')
    ?{kind:'github_actions',repository:env.GITHUB_REPOSITORY,workflowRunId:env.GITHUB_RUN_ID,commitSha:env.GITHUB_SHA,runAttempt:env.GITHUB_RUN_ATTEMPT||'1'}
    :{kind:'local_shadow_not_workflow_issued'};
}

export async function collectGroceryResearchReport(config,bible,{fetchText=fetchWithMeta,env=process.env,
  attemptsFile=path.resolve('out','research-source-attempts',`grocery-${config?.id}.json`),
  sourceClockFile=path.resolve('out','source-clocks','grocery-ME.json'),
  reportDirectory=process.env.BOURBON_SIGNAL_STATE_OUT_FILE?path.dirname(process.env.BOURBON_SIGNAL_STATE_OUT_FILE):path.resolve('out','research-grocery',config?.id||'unknown'),
  signal,sleep,cursorDir}={}){
  if(env.BOURBON_SIGNAL_SHADOW_MODE!=='1'||configs.get(config?.id)!==config)throw new Error('Grocery research requires its registered isolated shadow source');
  const sourceClockNow=Date.now(),sourceClockIntervalMs=86_400_000;
  let priorClock=null;
  if(config.id==='ME'){
    try{priorClock=JSON.parse(await readFile(sourceClockFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
    if(priorClock!==null&&(!priorClock||!Number.isFinite(Date.parse(priorClock.startedAt))))throw new Error('Maine grocery source clock is malformed; refusing another source run');
    const nextDueAt=priorClock?Date.parse(priorClock.startedAt)+sourceClockIntervalMs:0;
    if(nextDueAt>sourceClockNow)return {state:'ME',label:config.label,tier:config.tier,strategy:config.strategy,cadence:config.cadence,
      startedAt:new Date(sourceClockNow).toISOString(),finishedAt:new Date(sourceClockNow).toISOString(),lastGoodAt:priorClock.completedAt||null,
      status:'not_due',stale:false,signals:[],sources:[],sourceResults:[],roadblocks:[],
      metadata:{shadowOnly:true,productionActivationAllowed:false,customerDeliveryAllowed:false,sourceClockEnforced:true,
        lastAttemptAt:priorClock.startedAt,nextDueAt:new Date(nextDueAt).toISOString(),requestCount:0}};
    mkdirSync(path.dirname(sourceClockFile),{recursive:true});
    const temporary=sourceClockFile+'.'+randomUUID()+'.tmp';
    try{writeFileSync(temporary,JSON.stringify({startedAt:new Date(sourceClockNow).toISOString(),status:'in_progress'}));renameSync(temporary,sourceClockFile);}
    finally{try{rmSync(temporary,{force:true});}catch{}}
  }
  let attempts={};try{attempts=JSON.parse(await readFile(attemptsFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(!attempts||typeof attempts!=='object'||Array.isArray(attempts))throw new Error('Invalid grocery research denial ledger');
  const persistAttempts=async value=>{
    mkdirSync(path.dirname(attemptsFile),{recursive:true});const temporary=attemptsFile+'.'+randomUUID()+'.tmp';
    writeFileSync(temporary,JSON.stringify(value,null,2));renameSync(temporary,attemptsFile);
  };
  const startedAt=new Date().toISOString(),receipts=[];
  const boundedSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(config.id==='WA'?600_000:180_000)]):AbortSignal.timeout(config.id==='WA'?600_000:180_000);
  const capture=async(url,options)=>{
    const target=new URL(url),allowedHosts=new Set([
      config.resolverHost||'www.safeway.com',...(config.sourceRegistry||WESTERN_GROCERY_EXPANSION_SOURCES)
        .filter(source=>source.stateCode===config.id).map(source=>source.host),
    ]);
    if(target.port||!allowedHosts.has(target.hostname)
      ||!['/abs/pub/xapi/storeresolver/v2/all','/abs/pub/xapi/search/substitute'].includes(target.pathname))
      throw new Error('Grocery research request left the registered first-party route set');
    const result=await fetchText(url,options),observedAt=new Date().toISOString();
    const canonical=value=>{try{const parsed=new URL(value);parsed.searchParams.sort();return parsed.href;}catch{return null;}};
    if(result.ok&&canonical(result.url)!==canonical(url))throw new Error('Grocery research final URL identity differs from its requested first-party route');
    const bytes=Buffer.from(result.text||'');if(bytes.length>4*1024*1024)throw new Error('Grocery research body exceeds the reviewed limit');
    const digest=hash(bytes),artifactPath=`source-captures/${String(receipts.length+1).padStart(3,'0')}-${digest.slice(0,12)}.json`;
    await mkdir(path.join(reportDirectory,'source-captures'),{recursive:true});
    await writeFile(path.join(reportDirectory,artifactPath),bytes);
    receipts.push({url,finalUrl:result.url||null,status:result.status||0,observedAt,bytes:bytes.length,sha256:digest,artifactPath});
    return result;
  };
  const result=await collectGroceryExpansion(config,bible,{fetchText:capture,attempts,persistAttempts,
    observedAt:startedAt,signal:boundedSignal,sleep,cursorDir});
  const finishedAt=new Date().toISOString(),healthy=result.metadata.complete===true;
  if(config.id==='ME'){
    const temporary=sourceClockFile+'.'+randomUUID()+'.tmp';
    try{writeFileSync(temporary,JSON.stringify({startedAt:new Date(sourceClockNow).toISOString(),completedAt:finishedAt,
      status:healthy?'complete':'incomplete',requestCount:result.metadata.requests.length}));renameSync(temporary,sourceClockFile);}
    finally{try{rmSync(temporary,{force:true});}catch{}}
  }
  const sourceId=`research:${config.id.toLowerCase()}:grocery-xapi`;
  const signals=result.signals.map(row=>({...row,sourceRuntimeId:sourceId,researchOnly:true,alertable:false,
    ...(config.id==='ME'?{canAlertAsInventory:false,canAlertAsWatch:false}:{}),
    eligibleForOnSite:false,eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false,
    sourceProductBinding:{...row.sourceProductBinding,shadowOnly:true},raw:{...row.raw,shadowOnly:true}}));
  const sources=[{sourceRuntimeId:sourceId,label:config.label,url:config.sources[0].url,ok:healthy,status:healthy?200:0,
    signalType:'retailer_store_inventory_result',matchedBottleCount:signals.length,error:healthy?null:'Incomplete reviewed grocery cohort'}];
  return {state:config.id,label:config.label,tier:config.tier,strategy:config.strategy,cadence:config.cadence,
    startedAt,finishedAt,lastGoodAt:healthy?finishedAt:null,status:signals.length?healthy?'useful':'partial_useful':'no_trusted_inventory',
    stale:false,signals,sources,sourceResults:sources.map(row=>({...row,sourceId,alertable:false,inventoryAlertable:false,watchAlertable:false})),
    roadblocks:result.roadblocks,metadata:{...result.metadata,receipts,origin:workflowOrigin(env),
      bibleRecordsSha256:hash(JSON.stringify(bible.records)),shadowOnly:true,productionActivationAllowed:false,customerDeliveryAllowed:false}};
}
