import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ADDITIONAL_CITYHIVE_EXPANSION_SOURCES,parseCentralCityHiveInventory} from './collectors/central-cityhive-expansion.mjs';
import {NJ_MI_RESEARCH_NAMES,MI_WINE_PALACE} from './collectors/nj-mi-research-premises.mjs';
import {centralCityHiveRecordMarketTier} from './collectors/central-cityhive-market-policy.mjs';
import {collectShopifyVariantPickup} from './collectors/shopify-variant-pickup.mjs';
import {fetchWithMeta} from './core/fetcher.mjs';
import {collectionRequestSignal} from './core/collection-context.mjs';
import {readNjMiResearchJournal,writeNjMiResearchIncident,NJ_MI_DENIAL_STATUSES} from './nj-mi-research-journal.mjs';

const configurations=new Map(Object.entries(NJ_MI_RESEARCH_NAMES).map(([id,name])=>[id,Object.freeze({
  id,label:`${name} exact-premises research`,tier:'B',active:false,cadence:'shadow-only',strategy:'retailer_store_inventory',
  value:'Bounded first-party research; production activation and delivery remain blocked.',
  sources:Object.freeze(ADDITIONAL_CITYHIVE_EXPANSION_SOURCES.filter(source=>source.state===id)
    .map(source=>Object.freeze({kind:'html',label:source.sourceLabel,url:source.categoryUrl,precisionOnly:true}))),apiCandidates:[],
})]));
export function njMiResearchSourceForState(state){return configurations.get(state)||null;}
export function njMiResearchLifecycleEntries(){return Object.fromEntries(Object.entries(NJ_MI_RESEARCH_NAMES).map(([state,name])=>[state,{
  customerLabel:name,sourceLabel:`${name} exact-premises research`,publicStatus:'research_only',shadowEligible:true,
  lifecycle:'retailer_inventory_research',coverageTier:'sparse_live_store_inventory',refinementLevel:'store',
  inventoryAlertable:false,watchAlertable:false,customerSummary:'Inactive research at reviewed stores; no customer delivery or whole-state coverage claim.',
}]));}

export async function collectNjMiResearchReport(config,bible,{fetchText=fetchWithMeta,signal,
  journalFile=path.resolve('out/research-source-attempts/nj-mi-incidents.json'),
  reportDirectory=process.env.BOURBON_SIGNAL_STATE_OUT_FILE?path.dirname(process.env.BOURBON_SIGNAL_STATE_OUT_FILE):path.resolve('out/nj-mi-research',config?.id),
  env=process.env}={}){
  if(env.BOURBON_SIGNAL_SHADOW_MODE!=='1'||configurations.get(config?.id)!==config)throw Error('NJ/MI research requires its isolated registered source');
  const startedAt=new Date().toISOString(),receipts=[],signals=[],roadblocks=[],sourceReports=[];
  let journal=await readNjMiResearchJournal(journalFile);
  const request=async url=>{
    const hostname=new URL(url).hostname;
    if(journal.hosts[hostname]){roadblocks.push({state:config.id,source:hostname,status:'research_host_parked',
      attemptCount:0,error:journal.hosts[hostname].reason,incident:journal.hosts[hostname]});return null;}
    const requestedAt=new Date().toISOString();
    const response=await fetchText(url,{signal:collectionRequestSignal(signal),timeoutMs:12000,maxBytes:2*1024*1024,maxRedirects:0});
    const observedAt=new Date().toISOString(),status=Number(response.status)||0;
    // Synchronous incident-only atomic write precedes every post-response abort
    // check and survives source cancellation or later fixture/publication failure.
    if(NJ_MI_DENIAL_STATUSES.has(status))journal=writeNjMiResearchIncident(journalFile,journal,hostname,{
      httpStatus:status,observedAt,retryAfterSeconds:response.retryAfterSeconds});
    const text=String(response.text||''),sha256=createHash('sha256').update(text).digest('hex');
    const artifactPath=`source-captures/${String(receipts.length+1).padStart(3,'0')}-${sha256.slice(0,12)}.txt`;
    await mkdir(path.join(reportDirectory,'source-captures'),{recursive:true});
    await writeFile(path.join(reportDirectory,artifactPath),text);
    const receipt={url,finalUrl:response.url||null,status,requestedAt,observedAt,sha256,bytes:Buffer.byteLength(text),artifactPath};receipts.push(receipt);
    collectionRequestSignal(signal)?.throwIfAborted();
    if(response.url!==url||status!==200||response.ok!==true)return{response,receipt,usable:false};
    return{response,receipt,usable:true};
  };
  const sources=ADDITIONAL_CITYHIVE_EXPANSION_SOURCES.filter(source=>source.state===config.id);
  for(const source of sources){
    const url=new URL(source.categoryUrl);url.searchParams.delete('subtype');url.searchParams.set('ch-query',source.prioritySearchTerm||'barrel proof');
    const captured=await request(url.href);
    if(!captured)continue;
    const rows=captured.usable?parseCentralCityHiveInventory(captured.response.text,source,bible,{observedAt:captured.receipt.observedAt}):[];
    signals.push(...rows);
    sourceReports.push({sourceRuntimeId:`research:${config.id.toLowerCase()}:${source.id}`,label:source.sourceLabel,url:url.href,
      ok:captured.usable,status:captured.receipt.status,matchedBottleCount:rows.length,signalType:'retailer_store_inventory_result'});
    if(captured.usable&&!rows.length){
      journal=writeNjMiResearchIncident(journalFile,journal,source.hostname,{httpStatus:200,observedAt:captured.receipt.observedAt,reason:'zero_qualified_inventory'});
      roadblocks.push({state:config.id,source:source.sourceLabel,status:'zero_qualified_inventory',error:'No current strict scarce bottle qualified; remaining requests on this host were stopped.'});
    }
  }
  // A separately reviewed native pickup source is an independent MI fallback.
  if(config.id==='MI'&&!signals.length&&!journal.hosts[new URL(MI_WINE_PALACE.baseUrl).hostname]){
    try{
      const result=await collectShopifyVariantPickup(bible,MI_WINE_PALACE,{signal,fetchText:async url=>{
        const captured=await request(url);return captured?.response||{ok:false,status:0,url,text:'',error:'Research host is parked'};
      }});
      signals.push(...result.signals.flatMap(row=>{
        const tier=centralCityHiveRecordMarketTier(bible.records.find(record=>record.id===row.canonicalBottleId),'MI');
        if(!['limited','allocated','unicorn'].includes(tier))return[];
        return[{...row,tier,quantitySemantics:'binary_retailer_orderable_no_exact_count',
        sourceProductBinding:{schemaVersion:1,source:'nj-mi-research-shopify',merchantId:row.merchantId,storeId:row.storeId,
          storeAddress:row.storeAddress,productId:row.productId,optionId:row.variantId,canonicalBottleId:row.canonicalBottleId,
          canonicalName:row.canonicalName,rawName:row.rawName,price:row.price,observedAt:row.observedAt,
          premisesVerified:true,pickupOfferVerified:true,pickupUrl:row.sourceProductBinding,collectorVersion:result.metadata.collectorVersion}}];
      }));
      sourceReports.push({sourceRuntimeId:MI_WINE_PALACE.runtimeId,label:MI_WINE_PALACE.sourceLabel,url:MI_WINE_PALACE.baseUrl,
        ok:true,status:200,matchedBottleCount:result.signals.length,signalType:'retailer_store_inventory_result'});
      if(!result.signals.length)journal=writeNjMiResearchIncident(journalFile,journal,new URL(MI_WINE_PALACE.baseUrl).hostname,{
        httpStatus:200,observedAt:new Date().toISOString(),reason:'zero_qualified_inventory'});
    }catch(error){collectionRequestSignal(signal)?.throwIfAborted();roadblocks.push({state:'MI',source:MI_WINE_PALACE.sourceLabel,
      status:error.status||'native_pickup_failed',error:error.message});}
  }
  const finishedAt=new Date().toISOString(),marked=signals.map(row=>({...row,sourceRuntimeId:`research:${config.id.toLowerCase()}:${row.sourceChain}`,
    alertable:false,eligibleForOnSite:false,eligibleForDropFeed:false,eligibleForDelivery:false,deliveryEligible:false,eligibleForEmail:false,eligibleForSms:false,
    sourceProductBinding:{...row.sourceProductBinding,shadowOnly:true},raw:{...row.raw,shadowOnly:true}}));
  return{state:config.id,label:config.label,tier:'B',strategy:config.strategy,cadence:config.cadence,startedAt,finishedAt,
    lastGoodAt:marked.length?finishedAt:null,status:marked.length?'partial_useful':'no_trusted_inventory',stale:false,
    signals:marked,sources:sourceReports,sourceResults:sourceReports.map(row=>({sourceId:row.sourceRuntimeId,sourceLabel:row.label,
      sourceUrl:row.url,ok:row.ok,status:row.ok?'success':'failed',checkedAt:receipts.find(receipt=>receipt.url===row.url)?.observedAt||finishedAt,
      alertable:false,inventoryAlertable:false,watchAlertable:false})),roadblocks,
    metadata:{receipts,productionActivationAllowed:false,customerDeliveryAllowed:false,shadowOnly:true,complete:false,
      bibleRecordsSha256:createHash('sha256').update(JSON.stringify(bible.records)).digest('hex'),
      origin:env.GITHUB_ACTIONS==='true'?{kind:'github_actions',repository:env.GITHUB_REPOSITORY,workflowRunId:env.GITHUB_RUN_ID,
        commitSha:env.GITHUB_SHA,runAttempt:env.GITHUB_RUN_ATTEMPT||'1'}:{kind:'local_research_not_workflow_issued'}}};
}
