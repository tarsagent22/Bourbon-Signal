import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {isCentralCityHiveProductionOnSiteSignal} from './central-cityhive-policy.mjs';
import {isWithinCustomerFreshnessWindow} from './customer-drop-freshness.mjs';
import {CENTRAL_CITYHIVE_PRODUCTION_SOURCES} from './collectors/central-cityhive-premises.mjs';
import {ADDITIONAL_CITYHIVE_EXPANSION_SOURCES} from './collectors/central-cityhive-research-premises.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const identity=row=>JSON.stringify([row.storeId,row.productId,row.optionId||row.variantId,row.sourceProductBinding?.observedAt||row.observedAt,row.canonicalBottleId]);

export function verifyKansasFirstPublication({report,partition,reportBytes,partitionBytes,nowMs=Date.now(),workflowRunId=process.env.GITHUB_RUN_ID}={}){
  const failures=[],sources=CENTRAL_CITYHIVE_PRODUCTION_SOURCES.filter(source=>source.state==='KS');
  const meta=report?.metadata?.cityhive,expected=sources.map(source=>source.storeId);
  if(report?.state!=='KS'||report.status!=='useful'||report.stale!==false)failures.push('KS report must be fresh and useful');
  if(!/^[0-9]+$/.test(String(workflowRunId||'')))failures.push('first-publication receipt requires its hosted refresh workflow run id');
  if(report?.metadata?.allDeliveryDisabled!==true||meta?.productionAlertDeliveryAllowed!==false)failures.push('all inventory, watch and delivery channels must remain disabled');
  if(meta?.complete!==true||meta.cacheReused===true)failures.push('first publication requires a complete fresh bounded observation, not cache reuse');
  const selected=Array.isArray(meta?.selectedStores)?meta.selectedStores:[],verified=Array.isArray(meta?.verifiedPremises)?meta.verifiedPremises:[];
  if(JSON.stringify(selected)!==JSON.stringify(expected)||JSON.stringify(verified)!==JSON.stringify(expected))failures.push('report must select and verify the exact closed three-premise Kansas cohort');
  const requests=Array.isArray(meta?.requests)?meta.requests:[];
  const requestsMatch=selected.length===3&&requests.length===6&&sources.every(source=>{
    const scoped=requests.filter(row=>row.sourceId===source.id);if(scoped.length!==2)return false;
    const reviewed=ADDITIONAL_CITYHIVE_EXPANSION_SOURCES.find(row=>row.storeId===source.storeId);
    const terms=scoped.map(row=>{try{return new URL(row.url).searchParams.get('ch-query');}catch{return null;}});
    const priority=new URL(reviewed.discoveryUrl).searchParams.get('ch-query');
    if(terms.length!==2||terms.some(term=>typeof term!=='string'||!term.trim())||new Set(terms).size!==2||!terms.includes(priority))return false;
    return scoped.every(row=>{if(row.ok!==true||Number(row.status)!==200)return false;try{
      const url=new URL(row.url);return url.origin===source.baseUrl&&url.pathname==='/shop/'&&!url.hash&&!url.username&&!url.password
        &&[...url.searchParams].length===2&&url.searchParams.get('merchant-id')===source.merchantId
        &&Boolean(url.searchParams.get('ch-query')?.trim())&&url.searchParams.get('ch-query').length<=120;
    }catch{return false;}});
  });
  if(!requestsMatch)failures.push('report must contain exactly six successful bounded requests, two scoped to each reviewed merchant');
  const sourceRows=Array.isArray(report?.signals)?report.signals:[];
  if(!sourceRows.length||sourceRows.some(row=>!isCentralCityHiveProductionOnSiteSignal(row,{nowMs})||!isWithinCustomerFreshnessWindow(row,nowMs,{currentInventory:true})
    ||row.canAlertAsInventory!==false||row.canAlertAsWatch!==false||row.eligibleForDelivery!==false))failures.push('source report must contain only current exact pickup rows with delivery disabled');
  const drops=Array.isArray(partition?.drops)?partition.drops:[];
  if(partition?.state!=='KS'||partition.count!==drops.length||!drops.length)failures.push('published KS partition must contain current exact pickup rows');
  const sourceIdentities=new Set(sourceRows.map(identity));
  if(drops.some(row=>!sourceIdentities.has(identity(row))||!isCentralCityHiveProductionOnSiteSignal(row,{nowMs})||!isWithinCustomerFreshnessWindow(row,nowMs,{currentInventory:true})
    ||row.canAlertAsInventory!==false||row.canAlertAsWatch!==false||row.eligibleForDelivery!==false))failures.push('published partition contains an unverified, non-current or alertable row');
  const stores=new Set(drops.map(row=>row.storeId)),cities=new Set(drops.map(row=>row.city));
  if([...stores].some(store=>!expected.includes(store))||stores.size<1||stores.size>3)failures.push('published rows must belong to one or more of the three checked premises');
  if(!drops.some(row=>['allocated','unicorn'].includes(row.tier)))failures.push('published partition must include at least one allocated or unicorn identity');
  const observed=Date.parse(meta?.sourceObservedAt||'');
  if(!Number.isFinite(observed)||observed<Date.parse(report?.startedAt||'')||observed>Date.parse(report?.finishedAt||'')||report?.lastGoodAt!==meta?.sourceObservedAt)failures.push('source clock must fall within the exact successful report window');
  if(failures.length)return{ok:false,failures,receipt:null};
  const receipt={schemaVersion:1,state:'KS',verification:'first_production_publication',workflowRunId:String(workflowRunId),verifiedAt:new Date(nowMs).toISOString(),
    sourceRuntimeId:'ks:central-cityhive',cohortSha256:meta.cohortSha256,selectedPremises:selected,verifiedPremises:verified,
    queriedStoreIds:sources.map(source=>source.storeId),successfulRequests:requests.length,publishedRows:drops.length,publishedStores:stores.size,
    publishedStoreIds:[...stores].sort(),cities:[...cities].sort(),allocatedRows:drops.filter(row=>['allocated','unicorn'].includes(row.tier)).length,
    sourceObservedAt:meta.sourceObservedAt,sourceReportSha256:hash(reportBytes||JSON.stringify(report)),partitionSha256:hash(partitionBytes||JSON.stringify(partition)),allDeliveryChannelsDisabled:true};
  receipt.receiptSha256=hash(JSON.stringify(receipt));return{ok:true,failures:[],receipt};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const reportBytes=await readFile('out/states/KS.json'),partitionBytes=await readFile('out/site/states/KS/drops.json');
  const result=verifyKansasFirstPublication({report:JSON.parse(reportBytes),partition:JSON.parse(partitionBytes),reportBytes,partitionBytes});
  if(!result.ok)throw new Error(`Kansas first publication verification failed: ${result.failures.join('; ')}`);
  const output='out/first-publication/KS.json';await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result.receipt,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({ok:true,state:'KS',receipt:output,receiptSha256:result.receipt.receiptSha256}));
}
