import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {collectLouisianaAlaskaGrocery} from './collectors/louisiana-alaska-grocery-expansion.mjs';
import {LOUISIANA_ALASKA_GROCERY_SOURCES} from './collectors/louisiana-alaska-grocery-premises.mjs';
import {LOUISIANA_ALASKA_GROCERY_BUDGETS} from './louisiana-alaska-grocery-production-config.mjs';
import {isLouisianaAlaskaGroceryInventory} from './louisiana-alaska-grocery-policy.mjs';
import {fetchReviewedLouisianaAlaskaText,validateLouisianaAlaskaIncidentJournal,persistLouisianaAlaskaIncidentJournal} from './collectors/louisiana-alaska-grocery-transport.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex'),DENIALS=new Set([401,403,429,435]),DAY=86400000;
const names={LA:'Louisiana',AK:'Alaska'};
const configs=new Map(Object.entries(names).map(([state,name])=>[state,Object.freeze({id:state,label:`${name} exact-store grocery research`,tier:'B',active:false,strategy:'retailer_store_inventory',cadence:'shadow-only',value:'Closed exact-premise research; no customer activation.',sources:Object.freeze([...new Set(LOUISIANA_ALASKA_GROCERY_SOURCES.filter(s=>s.stateCode===state).map(s=>s.host))].map(host=>Object.freeze({kind:'api',url:`https://${host}/abs/pub/xapi/search/substitute`,precisionOnly:true}))),apiCandidates:Object.freeze([])})]));
export const louisianaAlaskaResearchSourceForState=state=>configs.get(state)||null;
export const louisianaAlaskaResearchLifecycleEntries=()=>Object.fromEntries(Object.entries(names).map(([state,name])=>[state,{customerLabel:name,sourceLabel:`${name} exact-store grocery research`,publicStatus:'research_only',shadowEligible:true,lifecycle:'retailer_inventory_research',coverageTier:'sparse_live_store_inventory',refinementLevel:'store',inventoryAlertable:false,watchAlertable:false}]));
const silent=row=>({...row,canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,eligibleForOnSite:false,eligibleForDropFeed:false,eligibleForWatch:false,eligibleForDelivery:false,deliveryEligible:false,eligibleForEmail:false,eligibleForSms:false,sourceProductBinding:{...row.sourceProductBinding,shadowOnly:true},raw:{...row.raw,shadowOnly:true}});
export function isLouisianaAlaskaGroceryShadowInventory(row){return ['LA','AK'].includes(row?.state)&&row.sourceProductBinding?.shadowOnly===true&&row.raw?.shadowOnly===true&&isLouisianaAlaskaGroceryInventory(row)&&['canAlertAsInventory','canAlertAsWatch','alertable','eligibleForOnSite','eligibleForDropFeed','eligibleForWatch','eligibleForDelivery','deliveryEligible','eligibleForEmail','eligibleForSms'].every(key=>row[key]===false);}
export async function collectLouisianaAlaskaResearchReport(config,bible,{env=process.env,fetchText=fetchReviewedLouisianaAlaskaText,incidentDir=path.resolve('out/research-source-attempts/louisiana-alaska-grocery-journals'),reportDirectory=env.BOURBON_SIGNAL_STATE_OUT_FILE?path.dirname(env.BOURBON_SIGNAL_STATE_OUT_FILE):path.resolve('out/research-laak',config?.id||'unknown'),signal,sleep,cursorDir}={}){
 if(env.BOURBON_SIGNAL_SHADOW_MODE!=='1'||configs.get(config?.id)!==config)throw Error('LA/AK research requires its registered isolated shadow source');
 const state=config.id,startedAt=new Date().toISOString(),receipts=[],journals={},files={};
 const deadline=AbortSignal.timeout(LOUISIANA_ALASKA_GROCERY_BUDGETS[state].sourceMs),bounded=signal?AbortSignal.any([signal,deadline]):deadline;
 for(const id of ['LA','AK']){const file=path.join(incidentDir,id+'.json');files[id]=file;let value={};try{value=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}journals[id]=validateLouisianaAlaskaIncidentJournal(value,id);}
 const journal=journals[state];persistLouisianaAlaskaIncidentJournal(files[state],journal);
 const blocked=host=>Object.values(journals).some(value=>value['host:'+host]&&(value['host:'+host].status==='access_denied'||Date.parse(value['host:'+host].nextAllowedAt)>Date.now()));
 const capture=async(url,options)=>{
  bounded.throwIfAborted();const host=new URL(url).hostname;if(blocked(host))throw Error('LA/AK research host has a durable denial or unfinished observation; no HTTP');
  const at=new Date().toISOString();journal['host:'+host]={status:'in_flight',httpStatus:null,lastAttemptAt:at,nextAllowedAt:new Date(Date.parse(at)+DAY).toISOString(),requestId:randomUUID(),urlSha256:hash(url)};persistLouisianaAlaskaIncidentJournal(files[state],journal);
  const verify=result=>{const a=new URL(url),b=new URL(result.url);a.searchParams.sort();b.searchParams.sort();if(a.href!==b.href)throw Error('LA/AK research exact URL changed');return result;};
  const observe=result=>{verify(result);if(DENIALS.has(Number(result.status))){journal['host:'+host]={status:'access_denied',httpStatus:Number(result.status),reviewRequired:true,lastAttemptAt:at,nextAllowedAt:new Date(Math.min(8640000000000000,Date.parse(at)+Math.max(DAY,(Number(result.retryAfterSeconds)||0)*1000))).toISOString()};persistLouisianaAlaskaIncidentJournal(files[state],journal);}};
  const result=verify(await fetchText(url,{...options,signal:bounded,onResponse:observe}));observe(result);
  if(!DENIALS.has(Number(result.status))&&Number(result.status)>=100){delete journal['host:'+host];persistLouisianaAlaskaIncidentJournal(files[state],journal);}
  const bytes=Buffer.from(result.text||'');if(bytes.length>4*1024*1024)throw Error('LA/AK research capture exceeds body budget');
  const digest=hash(bytes),artifactPath=`source-captures/${String(receipts.length+1).padStart(3,'0')}-${digest.slice(0,12)}.json`;
  await mkdir(path.join(reportDirectory,'source-captures'),{recursive:true});await writeFile(path.join(reportDirectory,artifactPath),bytes);
  receipts.push({url,finalUrl:result.url,status:Number(result.status)||0,observedAt:at,bytes:bytes.length,sha256:digest,artifactPath});return result;
 };
 const result=await collectLouisianaAlaskaGrocery(config,bible,{fetchText:capture,observedAt:startedAt,signal:bounded,sleep,cursorDir,persistAttempts:async()=>{}});
 bounded.throwIfAborted();const finishedAt=new Date().toISOString(),healthy=result.metadata.complete===true,sourceId=`research:${state.toLowerCase()}:grocery-xapi`,signals=result.signals.map(row=>silent({...row,sourceRuntimeId:sourceId}));
 const sources=[{sourceRuntimeId:sourceId,label:config.label,url:config.sources[0].url,ok:healthy,status:healthy?200:0,signalType:'retailer_store_inventory_result',matchedBottleCount:signals.length,error:healthy?null:'Incomplete closed LA/AK grocery cohort'}];
 const origin=env.GITHUB_ACTIONS==='true'&&/^\d+$/.test(env.GITHUB_RUN_ID||'')&&/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')?{kind:'github_actions',repository:env.GITHUB_REPOSITORY,workflowRunId:env.GITHUB_RUN_ID,commitSha:env.GITHUB_SHA,runAttempt:env.GITHUB_RUN_ATTEMPT||'1'}:{kind:'local_shadow_not_workflow_issued'};
 return{state,label:config.label,tier:config.tier,strategy:config.strategy,cadence:config.cadence,startedAt,finishedAt,lastGoodAt:healthy?finishedAt:null,status:signals.length?healthy?'useful':'partial_useful':'no_trusted_inventory',stale:false,signals,sources,sourceResults:sources.map(row=>({...row,sourceId,alertable:false,inventoryAlertable:false,watchAlertable:false})),roadblocks:result.roadblocks,metadata:{...result.metadata,receipts,origin,bibleRecordsSha256:hash(JSON.stringify(bible.records)),shadowOnly:true,productionActivationAllowed:false,customerDeliveryAllowed:false}};
}
