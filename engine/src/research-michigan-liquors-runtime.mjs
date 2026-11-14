import {mkdir,readFile,rename,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {collectMichiganLiquorsDC,MICHIGAN_LIQUORS_DC_SOURCE} from './collectors/michigan-liquors.mjs';

const CONFIG=Object.freeze({id:'DC',label:'District of Columbia Michigan Liquors research',tier:'B',active:false,
 strategy:'retailer_store_inventory',cadence:'shadow-only',
 value:'Exact-title allocated bottle research from one first-party DC retailer; customer activation and alerts remain disabled.',
 sources:[{kind:'html',label:MICHIGAN_LIQUORS_DC_SOURCE.sourceLabel,url:MICHIGAN_LIQUORS_DC_SOURCE.inventoryUrl,precisionOnly:true}],
 apiCandidates:[]});
const attemptsPath=()=>path.resolve('out','research-source-attempts','DC-michigan-liquors.json');

export function michiganLiquorsResearchSourceForState(state){return state==='DC'?CONFIG:null;}
export function michiganLiquorsResearchLifecycleEntries(){return{DC:{
 customerLabel:'District of Columbia',sourceLabel:MICHIGAN_LIQUORS_DC_SOURCE.sourceLabel,publicStatus:'research_only',
 shadowEligible:true,lifecycle:'retailer_inventory_research',coverageTier:'single_store_inventory_research',
 refinementLevel:'store',inventoryAlertable:false,watchAlertable:false,
 customerSummary:'Research-only exact product and stock observations; retail site requires calling to reserve. No customer alerts.',
}};}

async function readAttempts(file){return readFile(file,'utf8').then(JSON.parse).then(v=>v?.schemaVersion===1?v.attempts||{}:{}).catch(e=>e.code==='ENOENT'?{}:Promise.reject(e));}
async function writeAttempts(file,attempts){
 await mkdir(path.dirname(file),{recursive:true});const tmp=file+'.'+process.pid+'.'+randomUUID()+'.tmp';
 try{await writeFile(tmp,JSON.stringify({schemaVersion:1,attempts},null,2));await rename(tmp,file);}
 finally{await rm(tmp,{force:true});}
}

export async function collectMichiganLiquorsResearchReport(config,bible,options={}){
 if(process.env.BOURBON_SIGNAL_SHADOW_MODE!=='1'||config!==CONFIG)throw new Error('Michigan Liquors research requires the registered isolated shadow lane.');
 const startedAt=new Date().toISOString(),file=options.attemptsFile||attemptsPath();
 const prior=options.attempts||await readAttempts(file);
 const result=await collectMichiganLiquorsDC({...options,bible,attempts:prior});
 await writeAttempts(file,result.attempts);
 const finishedAt=new Date().toISOString();
 const checkedAt=result.status==='not_due'?result.metadata.lastObservationAt||finishedAt:finishedAt;
 const blocked=result.status==='source_blocked',source={sourceRuntimeId:'research:dc:michigan-liquors',
  label:MICHIGAN_LIQUORS_DC_SOURCE.sourceLabel,url:MICHIGAN_LIQUORS_DC_SOURCE.inventoryUrl,ok:!blocked,
  status:blocked?result.metadata.requests[0]?.status||0:200,signalType:'retailer_store_inventory_result',
  matchedBottleCount:result.signals.length,inventoryAlertable:false,watchAlertable:false,error:blocked?result.metadata.requests[0]?.reason||'source_request_failed':null};
 const roadblocks=blocked?[{state:'DC',source:source.label,status:source.status,error:source.error}]:[];
 return{state:'DC',label:CONFIG.label,tier:CONFIG.tier,strategy:CONFIG.strategy,cadence:CONFIG.cadence,
  startedAt,finishedAt,lastGoodAt:blocked?null:checkedAt,
  status:result.signals.length?'partial_useful':'no_trusted_inventory',stale:false,
  signals:result.signals.map(row=>({...row,alertable:false,canAlertAsInventory:false,canAlertAsWatch:false,
   eligibleForDropFeed:false,eligibleForWatch:false,eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false,
   sourceProductBinding:{...(row.sourceProductBinding||{}),shadowOnly:true},
   raw:{...(row.raw||{}),shadowOnly:true}})),
  sources:[source],sourceResults:[{sourceId:source.sourceRuntimeId,sourceLabel:source.label,sourceUrl:source.url,
   ok:source.ok,status:source.ok?'success':'failed',checkedAt,lastGoodAt:source.ok?checkedAt:null,
   alertable:false,inventoryAlertable:false,watchAlertable:false}],
  roadblocks,metadata:{...result.metadata,shadowOnly:true,productionActivationAllowed:false,
   customerDeliveryAllowed:false,attempts:result.attempts,origin:{kind:'local_shadow_not_workflow_issued'}},
 };
}
