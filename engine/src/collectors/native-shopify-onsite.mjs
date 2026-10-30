import {createHash,randomUUID} from 'node:crypto';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import authorityRegistry from '../../data/research/native-shopify-authority.json' with {type:'json'};
import {STATE_LIFECYCLE_CONFIG} from '../state-lifecycle.mjs';
import {validateImmutablePromotionEvidence,evaluateStateControl} from '../reliability-policy.mjs';
import {collectionSignal,writeCollectionFile} from '../core/collection-context.mjs';
import {sourceErrorForHttp} from '../sources/source-error.mjs';
import {collectShopifyVariantPickup} from './shopify-variant-pickup.mjs';
import {centralCityHiveRecordMarketTier} from './central-cityhive-market-policy.mjs';
import {fetchReviewedFirstPartyText,readCityHiveIncidentJournal,persistCityHiveIncidentJournal,validateCityHiveIncidentJournal,CITYHIVE_DENIAL_STATUSES,CITYHIVE_DENIAL_MINIMUM_MS} from './central-cityhive-transport.mjs';
import {nativeShopifySource,isNativeShopifyIdentity,isNativeShopifyOnSiteSignal} from '../native-shopify-onsite-policy.mjs';
import {nativeShopifySemanticHash,nativeShopifySemanticManifest} from '../native-shopify-contract.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const silence={canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,eligibleForDelivery:false,deliveryEligible:false,eligibleForEmail:false,eligibleForSms:false};
export const nativeShopifyCohortHash=id=>{const source=nativeShopifySource(id);if(!source)throw Error('Unknown closed native source');return sha(JSON.stringify(['closed-native-shopify-onsite-v1',source.definition]));};
const semanticHash=nativeShopifySemanticHash;
export function nativeShopifyProductionAllowed(id,{config=STATE_LIFECYCLE_CONFIG,authority=authorityRegistry.sources.find(row=>row.sourceId===id),env=process.env}={}){
 const source=nativeShopifySource(id),state=source?.definition.state,entry=config.states?.[state],manifest=authority?.manifest,evidence=authority?.promotionEvidence;
 const policy={minShadowRuns:3,minCanaryRuns:2};
 return Boolean(source&&authority?.enabled===true&&authority.sourceId===id&&config.activeStates?.includes(state)&&entry?.publicStatus==='active'
  &&evaluateStateControl(state,env).collect&&evaluateStateControl(state,env).publishCandidate
  &&manifest?.state===state&&manifest.lifecycle?.publicStatus==='active'&&manifest.sourceSemantics?.inventoryAlertable===false&&manifest.sourceSemantics.watchAlertable===false
  &&JSON.stringify(manifest.collector?.sourceIds)===JSON.stringify([id])&&manifest.collector.cohortSha256===nativeShopifyCohortHash(id)
  &&semanticHash(manifest)===semanticHash(nativeShopifySemanticManifest(id))
  &&Number(evidence?.shadowRuns)>=3&&Number(evidence?.canaryRuns)>=2&&validateImmutablePromotionEvidence(state,evidence,policy)
  &&evidence.immutableEvidence.provenance.repository==='tarsagent22/Bourbon-Signal'
  &&evidence.immutableEvidence.sourceConfigHash===semanticHash(manifest)
  &&JSON.stringify(manifest.evidence?.immutablePromotionEvidence)===JSON.stringify(evidence.immutableEvidence)
  &&(state!=='MI'||entry.promotionStage==='active'&&entry.inventoryAlertable===false&&entry.watchAlertable===false
    &&JSON.stringify(entry.promotionEvidence?.immutableEvidence)===JSON.stringify(evidence.immutableEvidence)));
}
export function nativeShopifyLibraryTier(row,bible){
 if(!isNativeShopifyIdentity(row))return null;const matches=bible.records.filter(record=>record.id===row.canonicalBottleId&&record.canonical===row.canonicalName);
 if(matches.length!==1||matches[0].libraryAlertEligible===false)return null;
 const tier=centralCityHiveRecordMarketTier(matches[0],row.state);return['limited','allocated','unicorn'].includes(tier)?tier:null;
}
export async function collectClosedNativePickupObservation(id,bible,{fetchText,observedAt,signal}={}){
 const source=nativeShopifySource(id);if(!source||typeof fetchText!=='function'||!Number.isFinite(Date.parse(observedAt)))throw Error('Explicit closed native transport and observation clock required');
 const result=await collectShopifyVariantPickup(bible,source.definition,{fetchText,observedAt,signal});
 if(result.accounting.requestCount!==2||result.accounting.completeSnapshot!==true||result.observations.length!==1)throw Error('Native cohort incomplete');
 const productReceipt=result.metadata.receipts.find(row=>row.url.endsWith('.json')),pickupReceipt=result.metadata.receipts.find(row=>row.url.includes('section_id='));
 const signals=result.signals.flatMap(row=>{
  const seed=source.definition.products.find(seed=>seed.variantId===row.variantId),store=source.definition.stores.find(store=>store.id===row.storeId);
  const decorated={...row,...silence,county:store.county||null,variantAvailable:true,sourceProductBinding:{schemaVersion:1,source:'closed-native-shopify-pickup',sourceId:id,
   configSha256:source.configSha256,productionOnSiteOnly:true,storeId:store.id,storeAddress:store.address,productId:row.productId,variantId:row.variantId,
   canonicalBottleId:row.canonicalBottleId,canonicalName:row.canonicalName,rawName:row.rawName,sizeMl:seed.sizeMl,price:row.price,observedAt,pickupUrl:row.sourceProductBinding,
   productSha256:productReceipt.sha256,pickupSha256:pickupReceipt.sha256,productHttpStatus:200,pickupHttpStatus:200,premisesVerified:true,pickupOfferVerified:true}};
  const tier=nativeShopifyLibraryTier(decorated,bible);return tier?[{...decorated,tier}]:[];
 });
 return{...result,signals,metadata:{...result.metadata,complete:true,recordsInspected:1,sourceId:id,cohortSha256:nativeShopifyCohortHash(id),allDeliveryDisabled:true}};
}
export async function collectNativeShopifyOnSite(id,bible,options={}){
 const source=nativeShopifySource(id);if(!source)throw Error('Unknown closed native source');
 const blocked={signals:[],roadblocks:[],sourceReports:[],sourceResults:[],status:'source_not_admitted',metadata:{requestCount:0,blockedBySourceAdmission:true}};
 if(!nativeShopifyProductionAllowed(id,options))return blocked;
 const state=source.definition.state,host=new URL(source.definition.baseUrl).hostname,registry=[{state,hostname:host}],nowMs=options.nowMs??Date.now();
 const inherited=collectionSignal(options.signal);inherited?.throwIfAborted();
 const signal=inherited?AbortSignal.any([inherited,AbortSignal.timeout(45_000)]):AbortSignal.timeout(45_000);
 const safe=id.replaceAll(':','-'),dir=options.cacheDir||path.resolve('out/cache/native-shopify-onsite'),incidents=options.incidentDir||path.resolve('out/source-incidents/native-shopify-onsite');
 const incidentFile=path.join(incidents,safe+'.json'),cacheFile=path.join(dir,safe+'.json'),persist=options.persistIncidentJournal||persistCityHiveIncidentJournal;
 let journal=await readCityHiveIncidentJournal(incidentFile,state,registry);
 if(journal.inFlight)throw Error('Native source unresolved durable observation requires review');
 if(journal.hosts[host]&&Date.parse(journal.hosts[host].nextAllowedAt)>nowMs)throw sourceErrorForHttp(journal.hosts[host].httpStatus,'Native host denial remains held',{details:{requestCount:0}});
 await persist(incidentFile,journal); // Durable writable preflight precedes cache and HTTP.
 let cache=null;try{cache=JSON.parse(await readFile(cacheFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(cache&&cache.schemaVersion!==1)throw Error('Malformed native stock cache');
 if(cache?.cohortSha256===nativeShopifyCohortHash(id)&&!options.forceLive&&Number.isFinite(Date.parse(cache.observedAt))&&nowMs>=Date.parse(cache.observedAt)&&nowMs-Date.parse(cache.observedAt)<=30*60_000){
  if(!Array.isArray(cache.signals)||!cache.signals.every(row=>isNativeShopifyOnSiteSignal(row,{nowMs})))throw Error('Invalid native stock cache rows');
  return{...cache.value,signals:cache.signals.filter(row=>nativeShopifyLibraryTier(row,bible)),metadata:{...cache.value.metadata,requestCount:0,cacheHit:true}};
 }
 journal={...journal,inFlight:{attemptId:randomUUID(),startedAt:new Date(nowMs).toISOString()}};await persist(incidentFile,journal);
 let requestCount=0,denial=null;const exactUrls=source.receipts.map(row=>row.url);
 const observe=async response=>{
  if(!CITYHIVE_DENIAL_STATUSES.has(Number(response?.status)))return;
  denial=Number(response.status);const at=Math.max(nowMs,Date.now()),retry=Math.max(0,Number(response.retryAfterSeconds)||0);
  const next={...journal,hosts:{...journal.hosts,[host]:{httpStatus:denial,lastAttemptAt:new Date(at).toISOString(),nextAllowedAt:new Date(Math.max(at+CITYHIVE_DENIAL_MINIMUM_MS,at+retry*1000)).toISOString()}}};
  try{await persist(incidentFile,validateCityHiveIncidentJournal(next,state,registry));journal=next;}catch(error){throw sourceErrorForHttp(denial,'Native denial persistence failed; durable unresolved attempt remains',{cause:error,details:{incidentWriteFailed:true,requestCount}});}
  throw sourceErrorForHttp(denial,'Native host denied collection',{details:{incidentPersisted:true,requestCount}});
 };
 const fetchText=async(url,args)=>{
  if(!exactUrls.includes(url)||++requestCount>2)throw Error('Native collector escaped its two exact URLs');signal.throwIfAborted();
  const response=await(options.fetchText||fetchReviewedFirstPartyText)(url,{...args,signal,onResponse:observe,maxTimeoutMs:12_000,isAllowedUrl:value=>exactUrls.includes(value.href)});
  await observe(response);if(response.url!==url)throw Error('Native source redirected or omitted exact final URL');return response;
 };
 try{
  const result=await collectClosedNativePickupObservation(id,bible,{fetchText,signal,observedAt:new Date(nowMs).toISOString()});signal.throwIfAborted();
  const value={signals:result.signals,roadblocks:[],sourceReports:[],sourceResults:[],status:result.signals.length?'useful':'monitored_no_current_inventory',metadata:{...result.metadata,requestCount}};
  await mkdir(dir,{recursive:true});await writeCollectionFile(cacheFile,JSON.stringify({schemaVersion:1,cohortSha256:nativeShopifyCohortHash(id),observedAt:new Date(nowMs).toISOString(),signals:value.signals,value},null,2),{signal});signal.throwIfAborted();
  journal={...journal,inFlight:null};await persist(incidentFile,journal);return value;
 }catch(error){if(denial&&!error.status)throw sourceErrorForHttp(denial,'Native denial preceded cancellation',{cause:error,details:{requestCount}});throw error;}
}

export async function collectNativeShopifyLeafReport(id,bible,options={}){
 const source=nativeShopifySource(id);if(!source)throw Error('Unknown closed native source');
 try{
  const result=await collectNativeShopifyOnSite(id,bible,options);if(result.metadata.blockedBySourceAdmission)return result;
  return{...result,sourceReports:[{sourceRuntimeId:id,label:source.definition.sourceLabel,url:source.definition.baseUrl,ok:true,status:200,signalType:'retailer_store_inventory_result',matchedBottleCount:result.signals.length}],
   sourceResults:[{sourceId:id,stateId:source.definition.state,status:'success',ok:true,stale:false,alertable:false,recordCount:1,signalCount:result.signals.length}]};
 }catch(error){
  collectionSignal(options.signal)?.throwIfAborted();
  return{signals:[],status:'blocked',metadata:{requestCount:Number(error.details?.requestCount)||0,sourceId:id,incidentWriteFailed:error.details?.incidentWriteFailed===true},
   roadblocks:[{sourceRuntimeId:id,state:source.definition.state,status:error.status||error.code||'source_failed',error:error.message}],
   sourceReports:[{sourceRuntimeId:id,label:source.definition.sourceLabel,url:source.definition.baseUrl,ok:false,status:error.status||'source_failed',matchedBottleCount:0,error:error.message}],
   sourceResults:[{sourceId:id,stateId:source.definition.state,status:'blocked',ok:false,stale:false,alertable:false,recordCount:0,signalCount:0,error:{status:error.status||null,message:error.message}}]};
 }
}
export async function collectMichiganNativeShopifyState(config,bible,options={}){
 if(config.id!=='MI')throw Error('Michigan native state cannot collect another state');
 const startedAt=new Date().toISOString(),value=await collectNativeShopifyLeafReport('mi:wine-palace-livonia',bible,{...options.nativeShopifyOptions,config:options.lifecycleConfig||STATE_LIFECYCLE_CONFIG,signal:options.signal});
 return{state:'MI',label:config.label,startedAt,finishedAt:new Date().toISOString(),lastGoodAt:value.signals[0]?.observedAt||null,
  status:value.metadata.blockedBySourceAdmission?'not_promoted':value.status,stale:false,signals:value.signals,sources:value.sourceReports,sourceResults:value.sourceResults,roadblocks:value.roadblocks,metadata:value.metadata};
}
