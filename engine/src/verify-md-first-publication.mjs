import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isCentralCityHiveProductionOnSiteSignal } from './central-cityhive-policy.mjs';
import { isWithinCustomerFreshnessWindow } from './customer-drop-freshness.mjs';
import { CENTRAL_CITYHIVE_PRODUCTION_SOURCES } from './collectors/central-cityhive-premises.mjs';
import { centralCityHiveProductionCohortKey } from './central-cityhive-production-config.mjs';
import { BourbonBible } from './core/bible.mjs';
import { libraryIdentityKey } from './core/library-catalog.mjs';
import { librarySearchPool } from './library-query-plan.mjs';
import { centralCityHiveAllocatedQueryFilter } from './collectors/central-cityhive-market-policy.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const identity=row=>JSON.stringify([row.storeId,row.productId,row.optionId||row.variantId,
  row.sourceProductBinding?.observedAt||row.observedAt,row.canonicalBottleId]);
const sources=CENTRAL_CITYHIVE_PRODUCTION_SOURCES.filter(source=>source.state==='MD');

function countyPartitionIsSeparate(partition,nowMs){
  if(partition?.state!=='MD-MONTGOMERY'||!Array.isArray(partition.drops)||partition.count!==partition.drops.length)return false;
  const generated=Date.parse(partition.generatedAt||'');
  if(!Number.isFinite(generated)||nowMs-generated<0||nowMs-generated>24*60*60_000)return false;
  return partition.drops.every(row=>{
    const observed=Date.parse(row.observedAt||'');
    return Number.isFinite(observed)&&observed<=nowMs&&nowMs-observed<=24*60*60_000
      &&row.stale!==true&&row.sourceStale!==true&&row.state==='MD-MONTGOMERY'
    &&row.type==='county_inventory_aggregate'&&row.locationPrecision==='store_aggregate'
    &&!row.storeId&&!row.storeAddress&&!row.storeName&&!row.sourceProductBinding
    &&row.canAlertAsInventory===false&&row.canAlertAsWatch===false
    &&row.eligibleForOnSite===false&&row.eligibleForDelivery===false
      &&row.eligibleForEmail!==true&&row.eligibleForSms!==true;
  });
}

export function verifyMarylandFirstPublication({report,partition,countyPartition,bible,reportBytes,partitionBytes,
  countyPartitionBytes,nowMs=Date.now(),workflowRunId=process.env.GITHUB_RUN_ID}={}){
  const failures=[],expected=sources.map(source=>source.storeId),meta=report?.metadata?.cityhive;
  if(report?.state!=='MD'||report.status!=='useful'||report.stale!==false)failures.push('MD report must be fresh and useful');
  if(!/^[0-9]+$/.test(String(workflowRunId||'')))failures.push('first-publication receipt requires its hosted refresh workflow run id');
  if(report?.metadata?.allDeliveryDisabled!==true||meta?.productionAlertDeliveryAllowed!==false)failures.push('all inventory, watch and delivery channels must remain disabled');
  if(meta?.complete!==true||meta.cacheReused===true)failures.push('first publication requires a complete fresh bounded observation, not cache reuse');
  if(meta?.cohortKey!==centralCityHiveProductionCohortKey('MD'))failures.push('report must bind the immutable reviewed Maryland cohort');
  const selected=Array.isArray(meta?.selectedStores)?meta.selectedStores:[];
  const verified=Array.isArray(meta?.verifiedPremises)?meta.verifiedPremises:[];
  if(JSON.stringify(selected)!==JSON.stringify(expected)||JSON.stringify(verified)!==JSON.stringify(expected))
    failures.push('report must select and verify the exact closed four-premise Maryland cohort');
  const requests=Array.isArray(meta?.requests)?meta.requests:[];
  const allocatedQuery=centralCityHiveAllocatedQueryFilter(bible,'MD');
  const allocatedTerms=new Set(librarySearchPool(bible||{records:[]}).filter(allocatedQuery).map(libraryIdentityKey));
  const allocatedSearches=[];
  const requestContract=selected.length===4&&requests.length===8&&sources.every(source=>{
    const scoped=requests.filter(row=>row.sourceId===source.id),priority=source.prioritySearchTerms?.[0];
    if(scoped.length!==2||!priority)return false;
    const terms=scoped.map(row=>{
      if(row.ok!==true||Number(row.status)!==200)return null;
      try{
        const url=new URL(row.url);
        if(url.origin!==source.baseUrl||url.pathname!=='/shop/'||url.hash||url.username||url.password
          ||[...url.searchParams].length!==2||url.searchParams.get('merchant-id')!==source.merchantId
          ||!url.searchParams.get('ch-query')?.trim()||url.searchParams.get('ch-query').length>120)return null;
        return url.searchParams.get('ch-query');
      }catch{return null;}
    });
    if(!terms.every(Boolean)||new Set(terms).size!==2||!terms.includes(priority))return false;
    const rotating=terms.find(term=>term!==priority);
    if(!allocatedTerms.has(libraryIdentityKey(rotating)))return false;
    allocatedSearches.push({storeId:source.storeId,term:rotating});
    return true;
  });
  if(!requestContract)failures.push('report must contain eight successful scoped requests, including one indexed allocated search per Maryland merchant');
  const sourceRows=Array.isArray(report?.signals)?report.signals:[];
  if(!sourceRows.length||sourceRows.some(row=>row.state!=='MD'||!isCentralCityHiveProductionOnSiteSignal(row,{nowMs})
    ||!isWithinCustomerFreshnessWindow(row,nowMs,{currentInventory:true})||row.canAlertAsInventory!==false
    ||row.canAlertAsWatch!==false||row.eligibleForDelivery!==false))
    failures.push('MD source report must contain only current exact pickup rows with alerts and delivery disabled');
  const drops=Array.isArray(partition?.drops)?partition.drops:[];
  if(partition?.state!=='MD'||partition.count!==drops.length||!drops.length)
    failures.push('published MD partition must exist and contain exact pickup rows');
  const sourceIdentities=new Set(sourceRows.map(identity));
  if(drops.some(row=>row.state!=='MD'||!sourceIdentities.has(identity(row))
    ||!isCentralCityHiveProductionOnSiteSignal(row,{nowMs})
    ||!isWithinCustomerFreshnessWindow(row,nowMs,{currentInventory:true})
    ||row.canAlertAsInventory!==false||row.canAlertAsWatch!==false||row.eligibleForDelivery!==false))
    failures.push('MD partition contains a non-source row, stale row, alertable row, or county aggregate');
  const stores=new Set(drops.map(row=>row.storeId)),cities=new Set(drops.map(row=>row.city));
  if([...stores].some(store=>!expected.includes(store))||stores.size<3||cities.size<3)
    failures.push('first publication requires current pickup at three or more Maryland premises across three or more cities');
  if(!countyPartitionIsSeparate(countyPartition,nowMs))failures.push('MD-MONTGOMERY must remain a fresh, separate county aggregate partition with no store identity');
  const observed=Date.parse(meta?.sourceObservedAt||'');
  if(!Number.isFinite(observed)||observed<Date.parse(report?.startedAt||'')||observed>Date.parse(report?.finishedAt||'')
    ||report?.lastGoodAt!==meta?.sourceObservedAt)failures.push('MD source clock must fall within the exact successful report window');
  if(failures.length)return{ok:false,failures,receipt:null};
  const countyDrops=countyPartition.drops;
  const receipt={schemaVersion:1,state:'MD',verification:'first_production_publication',workflowRunId:String(workflowRunId),
    verifiedAt:new Date(nowMs).toISOString(),sourceRuntimeId:'md:central-cityhive',cohortSha256:meta.cohortKey,
    queriedStoreIds:expected,selectedPremises:selected,verifiedPremises:verified,successfulRequests:requests.length,allocatedSearches,
    statewideExactStoreRows:drops.length,publishedRows:drops.length,publishedStores:stores.size,publishedStoreIds:[...stores].sort(),cities:[...cities].sort(),
    allocatedRows:drops.filter(row=>['allocated','unicorn'].includes(row.tier)).length,sourceObservedAt:meta.sourceObservedAt,
    sourceReportSha256:hash(reportBytes||JSON.stringify(report)),partitionSha256:hash(partitionBytes||JSON.stringify(partition)),
    countyPartition:{state:'MD-MONTGOMERY',rows:countyDrops.length,generatedAt:countyPartition.generatedAt,
      countyAggregateOnly:true,sha256:hash(countyPartitionBytes||JSON.stringify(countyPartition))},allDeliveryChannelsDisabled:true};
  receipt.receiptSha256=hash(JSON.stringify(receipt));
  return{ok:true,failures:[],receipt};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const reportBytes=await readFile('out/states/MD.json'),partitionBytes=await readFile('out/site/states/MD/drops.json');
  const countyPartitionBytes=await readFile('out/site/states/MD-MONTGOMERY/drops.json');
  const result=verifyMarylandFirstPublication({report:JSON.parse(reportBytes),partition:JSON.parse(partitionBytes),
    countyPartition:JSON.parse(countyPartitionBytes),bible:await BourbonBible.load(),reportBytes,partitionBytes,countyPartitionBytes});
  if(!result.ok)throw new Error(`Maryland first publication verification failed: ${result.failures.join('; ')}`);
  const output='out/first-publication/MD.json';await mkdir(path.dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(result.receipt,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({ok:true,state:'MD',receipt:output,receiptSha256:result.receipt.receiptSha256}));
}
