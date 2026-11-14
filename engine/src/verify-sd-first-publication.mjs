import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {isWithinCustomerFreshnessWindow} from './customer-drop-freshness.mjs';
import {fullAddress,sources,storeId,southDakotaRetailerRequest,southDakotaProductionRuntimeId} from './south-dakota-pickup-policy.mjs';
import {SOUTH_DAKOTA_PRODUCTION_COHORT_SHA256} from './collectors/south-dakota-production.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const identity=row=>JSON.stringify([row.storeId,row.productId,row.sourceProductBinding?.observedAt||row.observedAt,row.canonicalBottleId]);

export function verifySouthDakotaFirstPublication({report,partition,reportBytes,partitionBytes,nowMs=Date.now(),workflowRunId=process.env.GITHUB_RUN_ID}={}){
  const failures=[],meta=report?.metadata?.southDakota,expected=sources.map(storeId);
  if(report?.state!=='SD'||report.status!=='useful'||report.stale!==false)failures.push('SD report must be fresh, useful, and not a stale fallback');
  if(!/^\d+$/.test(String(workflowRunId||'')))failures.push('first-publication receipt requires its hosted refresh workflow run ID');
  if(report?.metadata?.allDeliveryDisabled!==true||meta?.productionAlertDeliveryAllowed!==false)failures.push('all SD delivery channels must remain disabled');
  if(meta?.complete!==true||meta.cacheReused===true||meta.cohortSha256!==SOUTH_DAKOTA_PRODUCTION_COHORT_SHA256)failures.push('first publication requires a complete fresh observation of the reviewed cohort');
  if(JSON.stringify(meta?.selectedStores)!==JSON.stringify(expected)||JSON.stringify(meta?.verifiedPremises)!==JSON.stringify(expected))failures.push('report must verify the exact two-premise Rapid City cohort');
  const expectedRequests=sources.flatMap(source=>source.terms.map(query=>({source,query})));
  const requests=Array.isArray(meta?.requests)?meta.requests:[];
  if(requests.length!==expectedRequests.length||expectedRequests.some(({source,query})=>{
    const matches=requests.filter(row=>row.storeId===storeId(source)&&row.query===query);
    return matches.length!==1||matches[0].url!==southDakotaRetailerRequest(query)||matches[0].ok!==true||Number(matches[0].status)!==200
      ||!/^([a-f0-9]{64})$/i.test(String(matches[0].sha256||''))||!Number.isFinite(Date.parse(matches[0].observedAt||''))
      ||Date.parse(matches[0].observedAt)<Date.parse(report.startedAt||'')||Date.parse(matches[0].observedAt)>Date.parse(report.finishedAt||'');
  }))failures.push('report must contain one successful exact first-party query receipt per reviewed store/query');
  const rows=Array.isArray(report?.signals)?report.signals:[];
  if(!rows.length||rows.some(row=>row.sourceRuntimeId!==southDakotaProductionRuntimeId||row.state!=='SD'
    ||!expected.includes(row.storeId)||row.city!=='Rapid City'||row.canAlertAsInventory!==false||row.canAlertAsWatch!==false
    ||row.alertable!==false||row.eligibleForDelivery!==false||row.eligibleForEmail!==false||row.eligibleForSms!==false
    ||row.storeAddress!==fullAddress(sources.find(source=>storeId(source)===row.storeId))
    ||row.sourceProductBinding?.storeId!==row.storeId||row.sourceProductBinding?.storeAddress!==row.storeAddress
    ||row.sourceProductBinding?.productionOnSiteOnly!==true||row.sourceProductBinding?.productionCohortSha256!==SOUTH_DAKOTA_PRODUCTION_COHORT_SHA256
    ||!isWithinCustomerFreshnessWindow(row,nowMs,{currentInventory:true})))failures.push('report rows must be exact current SD pickup evidence with every alert channel disabled');
  const drops=Array.isArray(partition?.drops)?partition.drops:[];
  if(partition?.state!=='SD'||partition.count!==drops.length||!drops.length)failures.push('published SD partition must contain verified on-site rows');
  const identities=new Set(rows.map(identity));
  if(drops.some(row=>!identities.has(identity(row))||row.state!=='SD'||row.city!=='Rapid City'||!expected.includes(row.storeId)
    ||row.canAlertAsInventory!==false||row.canAlertAsWatch!==false||row.eligibleForDelivery!==false
    ||!isWithinCustomerFreshnessWindow(row,nowMs,{currentInventory:true})))failures.push('public SD partition contains unverified, stale, or alertable rows');
  const stores=new Set(drops.map(row=>row.storeId)),cities=new Set(drops.map(row=>row.city));
  if(stores.size<1||[...stores].some(value=>!expected.includes(value))||cities.size!==1||!cities.has('Rapid City'))failures.push('public SD rows must retain truthful one-city scope within the two reviewed premises');
  if(drops.some(row=>!['limited','allocated','unicorn'].includes(row.tier)))failures.push('published SD rows must remain within reviewed indexed limited, allocated, or unicorn identities');
  const observed=Date.parse(meta?.sourceObservedAt||'');
  if(!Number.isFinite(observed)||observed<Date.parse(report?.startedAt||'')||observed>Date.parse(report?.finishedAt||'')
    ||report?.lastGoodAt!==meta?.sourceObservedAt||requests.some(row=>Date.parse(row.observedAt)>Date.parse(report.finishedAt)))failures.push('source observation clock must remain within the exact hosted report window');
  if(failures.length)return{ok:false,failures,receipt:null};
  const receipt={schemaVersion:1,state:'SD',verification:'first_production_publication',workflowRunId:String(workflowRunId),
    verifiedAt:new Date(nowMs).toISOString(),sourceRuntimeId:southDakotaProductionRuntimeId,cohortSha256:SOUTH_DAKOTA_PRODUCTION_COHORT_SHA256,
    selectedPremises:meta.selectedStores,verifiedPremises:meta.verifiedPremises,successfulRequests:requests.length,
    publishedRows:drops.length,publishedStores:stores.size,publishedStoreIds:[...stores].sort(),cities:[...cities],
    indexedRows:drops.filter(row=>['limited','allocated','unicorn'].includes(row.tier)).length,sourceObservedAt:meta.sourceObservedAt,
    sourceReportSha256:hash(reportBytes||JSON.stringify(report)),partitionSha256:hash(partitionBytes||JSON.stringify(partition)),
    allDeliveryChannelsDisabled:true};
  receipt.receiptSha256=hash(JSON.stringify(receipt));return{ok:true,failures:[],receipt};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const reportBytes=await readFile('out/states/SD.json'),partitionBytes=await readFile('out/site/states/SD/drops.json');
  const result=verifySouthDakotaFirstPublication({report:JSON.parse(reportBytes),partition:JSON.parse(partitionBytes),reportBytes,partitionBytes});
  if(!result.ok)throw Error(`South Dakota first publication failed: ${result.failures.join('; ')}`);
  const output='out/first-publication/SD.json';await mkdir(path.dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(result.receipt,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({ok:true,state:'SD',receipt:output,receiptSha256:result.receipt.receiptSha256}));
}
