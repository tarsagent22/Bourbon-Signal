import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,rename,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fetchReviewedFirstPartyText} from './central-cityhive-transport.mjs';
import {PEARSONS_DC_SOURCE,PEARSONS_DC_BUDGETS,parsePearsonsDcCapture} from './pearsons-dc-research.mjs';
import {centralCityHiveProductionCohortKey} from '../central-cityhive-production-config.mjs';
import {isPearsonsDcProductionOnSiteSignal} from '../pearsons-dc-production-policy.mjs';
export {isPearsonsDcProductionOnSiteSignal};

const DENIALS=new Set([401,403,429,435]),SHA256=/^[a-f0-9]{64}$/u;
const productionSignal=row=>({...row,sourceRuntimeId:'dc:pearsons-shopify',researchOnly:false,
  quantity:null,storeQty:null,quantityIsExact:false,quantitySemantics:'no_exact_shelf_count',
  inventorySemantics:'Orderable first-party pickup offer at the exact reviewed store; no exact shelf quantity is published.',
  canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,eligibleForOnSite:true,eligibleForDropFeed:true,
  eligibleForWatch:false,eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false,
  sourceProductBinding:{...row.sourceProductBinding,productionOnSiteOnly:true}});
function validRecord(value,{nowMs,cohortSha256,requireFresh=true}={}){
  const age=nowMs-Date.parse(value?.observedAt||''),binding=value?.sourceProductBinding;
  return value?.state==='DC'&&value?.stateCode==='DC'&&value?.eventType==='retailer_store_inventory_result'
    &&value?.sourceRuntimeId==='dc:pearsons-shopify'&&value?.storeId===PEARSONS_DC_SOURCE.storeId
    &&value?.storeName===PEARSONS_DC_SOURCE.storeName&&value?.storeAddress===PEARSONS_DC_SOURCE.storeAddress
    &&value?.merchantId===PEARSONS_DC_SOURCE.merchantId&&value?.productId===PEARSONS_DC_SOURCE.productId
    &&value?.sourceUrl===PEARSONS_DC_SOURCE.productUrl&&value?.locationPrecision==='store_level'
    &&value?.city===PEARSONS_DC_SOURCE.city&&value?.zip===PEARSONS_DC_SOURCE.zip
    &&value?.variantId===PEARSONS_DC_SOURCE.variantId&&value?.canonicalName===PEARSONS_DC_SOURCE.canonicalName
    &&value?.rawName==="Blanton's Single Barrel Bourbon"&&value?.price===99.99
    &&value?.tier==='allocated'&&value?.availabilityStatus==='in_stock'&&value?.sourceAvailabilityVerified===true
    &&value?.pickupOfferVerified===true&&value?.quantity==null&&value?.quantityIsExact===false
    &&value?.quantitySemantics==='no_exact_shelf_count'
    &&value?.canAlertAsInventory===false&&value?.canAlertAsWatch===false&&value?.eligibleForOnSite===true
    &&value?.eligibleForDropFeed===true&&value?.eligibleForWatch===false&&value?.eligibleForDelivery===false
    &&value?.eligibleForEmail===false&&value?.eligibleForSms===false
    &&binding?.source==='pearsons-shopify-retained-page'&&SHA256.test(binding.sourcePageSha256||'')
    &&binding?.storeGraphId===PEARSONS_DC_SOURCE.merchantId&&binding?.productGraphId===PEARSONS_DC_SOURCE.productId
    &&binding?.sku===PEARSONS_DC_SOURCE.sku&&binding?.variantId===PEARSONS_DC_SOURCE.variantId
    &&binding?.storeLat===PEARSONS_DC_SOURCE.lat&&binding?.storeLng===PEARSONS_DC_SOURCE.lng
    &&binding?.offerPrice===99.99&&binding?.currency==='USD'&&binding?.offerAvailability==='InStock'
    &&binding?.pickupMethod==='DeliveryModePickUp'&&binding?.pickupLocation==='Wisconsin Ave NW'
    &&binding?.pickupReadyText==='Ready within 30 minutes'
    &&binding?.httpStatus===200&&binding?.productionOnSiteOnly===true&&binding?.productionCohortSha256===cohortSha256
    &&Number.isFinite(age)&&age>=0&&(!requireFresh||age<=PEARSONS_DC_BUDGETS.maxAgeMs);
}
function validateJournal(value,nowMs,cohortSha256){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.schemaVersion!==1||value.state!=='DC'
    ||Object.keys(value).some(key=>!['schemaVersion','state','lastAttemptAt','lastGoodAt','nextAllowedAt','lastStatus','lastOutcome','inFlight','lastSignal'].includes(key)))
    throw new Error('Pearson DC production incident journal is malformed');
  for(const key of ['lastAttemptAt','lastGoodAt','nextAllowedAt'])if(value[key]!=null&&!Number.isFinite(Date.parse(value[key])))throw new Error('Pearson DC production journal clock is invalid');
  if(value.lastOutcome!=null&&!['in_flight','success','denied','failed'].includes(value.lastOutcome))throw new Error('Pearson DC production journal outcome is invalid');
  if(value.inFlight&&(!/^[a-f0-9-]{36}$/u.test(value.inFlight.attemptId||'')||!Number.isFinite(Date.parse(value.inFlight.startedAt||''))))throw new Error('Pearson DC production journal has an unresolved source attempt');
  if(value.lastSignal&&!validRecord(value.lastSignal,{nowMs:Math.max(nowMs,Date.parse(value.lastSignal.observedAt)+1),cohortSha256,requireFresh:false}))throw new Error('Pearson DC production cached row does not match the reviewed source');
  return value;
}
async function readJournal(file,nowMs,cohortSha256){
  try{return validateJournal(JSON.parse(await readFile(file,'utf8')),nowMs,cohortSha256);}
  catch(error){if(error.code==='ENOENT')return{schemaVersion:1,state:'DC',inFlight:null};throw error;}
}
async function writeJournal(file,value,nowMs,cohortSha256){
  const next=validateJournal(value,nowMs,cohortSha256),temporary=`${file}.${randomUUID()}.tmp`;
  await mkdir(path.dirname(file),{recursive:true});
  try{await writeFile(temporary,`${JSON.stringify(next,null,2)}\n`);await rename(temporary,file);}
  finally{await rm(temporary,{force:true});}
}

/** One exact Pearson product-page request, governed by the DC admission gate.
 * A source denial is persisted before the transport is allowed to stop. */
export async function collectPearsonsDcProductionSource({cohortSha256,bible,fetchText=fetchReviewedFirstPartyText,
  journalFile=path.resolve('out/source-incidents/pearsons-dc/DC.json'),nowMs=Date.now(),signal,onRequest=()=>{},
  persistJournal=writeJournal,readSourceJournal=readJournal,admissionPassed=false}={}){
  if(admissionPassed!==true)throw new Error('Pearson DC production fetch requires the shared DC immutable admission gate');
  if(!SHA256.test(cohortSha256||''))throw new Error('Pearson DC production requires the immutable DC cohort digest');
  const journal=await readSourceJournal(journalFile,nowMs,cohortSha256);
  if(journal.inFlight)throw Object.assign(new Error('Unresolved Pearson DC source attempt; review the durable incident journal'),{code:'PEARSONS_UNRESOLVED_ATTEMPT'});
  const dueAt=Date.parse(journal.nextAllowedAt||'');
  if(Number.isFinite(dueAt)&&dueAt>nowMs){
    if(journal.lastOutcome!=='success')throw Object.assign(new Error(`Pearson DC source remains blocked until ${journal.nextAllowedAt}`),{status:Number(journal.lastStatus)||0,code:'PEARSONS_COOLDOWN'});
    if(!journal.lastSignal||!validRecord(journal.lastSignal,{nowMs,cohortSha256}))throw new Error('Pearson DC source is not due and its previous pickup offer is stale');
    return{signals:[journal.lastSignal],metadata:{complete:true,cacheReused:true,requestCount:0,sourceObservedAt:journal.lastGoodAt,
      nextDueAt:journal.nextAllowedAt,receipts:[],allDeliveryDisabled:true}};
  }
  const startedAt=new Date(nowMs).toISOString(),attemptId=randomUUID();
  const inflight={schemaVersion:1,state:'DC',lastAttemptAt:startedAt,nextAllowedAt:new Date(nowMs+PEARSONS_DC_BUDGETS.sourceCadenceMs).toISOString(),
    lastStatus:0,lastOutcome:'in_flight',inFlight:{attemptId,startedAt},...(journal.lastSignal?{lastSignal:journal.lastSignal}:{})};
  await persistJournal(journalFile,inflight,nowMs,cohortSha256);
  let requestCount=0,denialPersisted=false,responseMetadata=null,record=null;
  const observe=async response=>{
    responseMetadata=response;
    if(!DENIALS.has(Number(response.status)))return;
    const at=Math.max(nowMs,Date.now()),retry=Math.max(0,Number(response.retryAfterSeconds)||0);
    const denied={...inflight,lastAttemptAt:new Date(at).toISOString(),nextAllowedAt:new Date(Math.max(at+PEARSONS_DC_BUDGETS.denialCooldownMs,at+retry*1000,Date.parse(journal.nextAllowedAt||'')||0)).toISOString(),
      lastStatus:Number(response.status),lastOutcome:'denied',inFlight:null};
    try{await persistJournal(journalFile,denied,at,cohortSha256);denialPersisted=true;}
    catch(error){throw Object.assign(new Error('Pearson DC denial journal failed to persist; the unresolved attempt blocks further requests'),{cause:error,code:'PEARSONS_JOURNAL_WRITE_FAILED'});}
    const error=Object.assign(new Error(`Pearson DC denied with HTTP ${response.status}; durable cooldown is active`),{status:Number(response.status),code:'PEARSONS_DENIED'});
    throw error;
  };
  try{
    requestCount++;onRequest();
    const response=await fetchText(PEARSONS_DC_SOURCE.productUrl,{timeoutMs:PEARSONS_DC_BUDGETS.requestTimeoutMs,
      maxTimeoutMs:PEARSONS_DC_BUDGETS.requestTimeoutMs,maxBytes:PEARSONS_DC_BUDGETS.maxBodyBytes,maxRedirects:0,signal,
      isAllowedUrl:candidate=>candidate.origin===PEARSONS_DC_SOURCE.baseUrl&&candidate.pathname==='/products/blantons-single-barrel-bourbon-750ml'&&!candidate.search&&!candidate.hash,
      onResponse:observe});
    signal?.throwIfAborted();
    if(response.url!==PEARSONS_DC_SOURCE.productUrl||Number(response.status)!==200||response.ok!==true||typeof response.text!=='string')throw Object.assign(new Error('Pearson DC did not return the exact reviewed product page'),{status:Number(response.status)||0});
    const body=Buffer.from(response.text,'utf8');if(body.length>PEARSONS_DC_BUDGETS.maxBodyBytes)throw new Error('Pearson DC product page exceeded its response size bound');
    const sha256=createHash('sha256').update(body).digest('hex');
    const sourceDate=typeof response.date==='string'?response.date:response.headers?.date;
    if(!sourceDate)throw new Error('Pearson DC response omitted its authoritative Date header');
    const parsed=parsePearsonsDcCapture(body,{url:response.url,headers:`HTTP/1.1 200 OK\r\nDate: ${sourceDate}\r\n`,bible,expectedSha256:sha256});
    if(!parsed)throw new Error('Pearson DC page failed exact retailer, product, variant, pickup, or library validation');
    record=productionSignal({...parsed,sourceProductBinding:{...parsed.sourceProductBinding,productionCohortSha256:cohortSha256}});
    if(!validRecord(record,{nowMs:Date.parse(record.observedAt)+1000,cohortSha256,requireFresh:false}))throw new Error('Pearson DC production row failed its own exact source proof');
    const capturedAt=new Date(Date.parse(sourceDate)).toISOString(),nextAllowedAt=new Date(Math.max(Date.parse(capturedAt)+PEARSONS_DC_BUDGETS.sourceCadenceMs,nowMs)).toISOString();
    const complete={...inflight,lastAttemptAt:capturedAt,lastGoodAt:capturedAt,nextAllowedAt,lastStatus:200,lastOutcome:'success',inFlight:null,lastSignal:record};
    await persistJournal(journalFile,complete,Date.parse(capturedAt),cohortSha256);
    return{signals:[record],metadata:{complete:true,requestCount,sourceObservedAt:capturedAt,nextDueAt:nextAllowedAt,
      receipts:[{url:PEARSONS_DC_SOURCE.productUrl,finalUrl:response.url,status:200,observedAt:capturedAt,sha256,bytes:body.length}],allDeliveryDisabled:true}};
  }catch(error){
    if(!denialPersisted){const at=Math.max(nowMs,Date.now()),status=Number(error?.status)||Number(responseMetadata?.status)||0;
      const failed={...inflight,lastAttemptAt:new Date(at).toISOString(),nextAllowedAt:new Date(at+PEARSONS_DC_BUDGETS.sourceCadenceMs).toISOString(),lastStatus:status,lastOutcome:'failed',inFlight:null};
      if(journal.lastSignal)failed.lastSignal=journal.lastSignal;
      try{await persistJournal(journalFile,failed,at,cohortSha256);}catch(writeError){throw Object.assign(new Error('Pearson DC failed attempt journal could not be closed; further requests are blocked'),{cause:writeError,code:'PEARSONS_JOURNAL_WRITE_FAILED'});}
    }
    throw error;
  }
}
