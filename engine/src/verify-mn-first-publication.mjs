import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {isCentralCityHiveProductionOnSiteSignal} from './central-cityhive-policy.mjs';
import {MINNESOTA_CITYHIVE_PRODUCTION_COHORT_SHA256 as cohort,
  MINNESOTA_CITYHIVE_PRODUCTION_RUNTIME_ID as runtimeId,MINNESOTA_CITYHIVE_PRODUCTION_SOURCES as sources,
  MINNESOTA_CITYHIVE_PRODUCTION_BATCH_SIZE as batchSize,selectMinnesotaProductionSources} from './minnesota-cityhive-production-config.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const identity=row=>JSON.stringify([row.storeId,row.productId,row.optionId||row.variantId,row.sourceProductBinding?.observedAt||row.observedAt,row.canonicalBottleId]);

export function verifyMinnesotaFirstPublication({stateReport,partition,reportBytes,partitionBytes,nowMs=Date.now(),workflowRunId=process.env.GITHUB_RUN_ID}={}){
  const failures=[],meta=stateReport?.metadata?.cityhive;
  if(stateReport?.state!=='MN'||stateReport.status!=='useful'||stateReport.stale!==false)failures.push('MN state report must be fresh and useful');
  if(!/^[0-9]+$/.test(String(workflowRunId||'')))failures.push('first-publication receipt requires its hosted refresh workflow run id');
  if(stateReport?.metadata?.allDeliveryDisabled!==true||meta?.productionAlertDeliveryAllowed!==false)failures.push('all inventory, watch and delivery channels must remain disabled');
  if(meta?.complete!==true||meta.cacheReused===true||meta.exhaustiveCatalogVerified!==false)failures.push('first publication requires a complete fresh bounded source observation, not cache reuse or exhaustiveness claims');
  if(meta?.cohortSha256!==cohort||meta?.fullCohortStoreCount!==sources.length||meta?.rotationBatchSize!==batchSize)failures.push('source report must bind the reviewed 16-premise MN cohort and seven-store rotation');
  const selected=Array.isArray(meta?.selectedStores)?meta.selectedStores:[],verified=Array.isArray(meta?.verifiedPremises)?meta.verifiedPremises:[];
  if(!Number.isSafeInteger(meta?.rotationIndex)||meta.rotationIndex<0||meta.rotationIndex>=sources.length
    ||JSON.stringify(selected)!==JSON.stringify(selectMinnesotaProductionSources(meta.rotationIndex).map(row=>row.storeId)))failures.push('source report selected stores do not match its reviewed rotation index');
  if(selected.length!==batchSize||new Set(selected).size!==batchSize||verified.length!==batchSize||new Set(verified).size!==batchSize
    ||selected.some(store=>!verified.includes(store)))failures.push('first source report must verify each of the seven selected premises exactly once');
  const requests=Array.isArray(meta?.requests)?meta.requests:[];
  if(requests.length!==batchSize*2||requests.some(row=>row.ok!==true||Number(row.status)!==200))failures.push('first source report must contain exactly fourteen successful bounded requests');
  const sourceRows=Array.isArray(stateReport?.signals)?stateReport.signals:[];
  if(!sourceRows.length||sourceRows.some(row=>!isCentralCityHiveProductionOnSiteSignal(row,{nowMs})
    ||row.canAlertAsInventory!==false||row.canAlertAsWatch!==false||row.eligibleForDelivery!==false))failures.push('state report must contain current production-bound MN pickup rows with delivery disabled');
  const drops=Array.isArray(partition?.drops)?partition.drops:[];
  if(partition?.state!=='MN'||partition.count!==drops.length||!drops.length)failures.push('published MN partition must exist and contain at least one first-publication row');
  const expected=new Set(sourceRows.map(identity));
  if(drops.some(row=>!expected.has(identity(row))||!isCentralCityHiveProductionOnSiteSignal(row,{nowMs})
    ||row.canAlertAsInventory!==false||row.canAlertAsWatch!==false||row.eligibleForDelivery!==false))failures.push('public MN partition contains an unverified, non-production or alertable row');
  const observed=Date.parse(meta?.sourceObservedAt||'');
  if(!Number.isFinite(observed)||observed<Date.parse(stateReport.startedAt||'')||observed>Date.parse(stateReport.finishedAt||'')
    ||stateReport.lastGoodAt!==meta.sourceObservedAt)failures.push('source observation clock must fall within the exact successful report window');
  if(failures.length)return{ok:false,failures,receipt:null};
  const receipt={schemaVersion:1,state:'MN',verification:'first_production_publication',workflowRunId:String(workflowRunId),
    verifiedAt:new Date(nowMs).toISOString(),sourceRuntimeId:runtimeId,cohortSha256:cohort,rotationIndex:meta.rotationIndex,
    selectedPremises:selected,verifiedPremises:verified,publishedRows:drops.length,publishedStores:new Set(drops.map(row=>row.storeId)).size,
    sourceObservedAt:meta.sourceObservedAt,sourceReportSha256:hash(reportBytes||JSON.stringify(stateReport)),partitionSha256:hash(partitionBytes||JSON.stringify(partition)),
    allDeliveryChannelsDisabled:true};
  receipt.receiptSha256=hash(JSON.stringify(receipt));
  return{ok:true,failures:[],receipt};
}

if(import.meta.url===new URL(process.argv[1],`file://${process.cwd()}/`).href){
  const reportBytes=await readFile('out/states/MN.json'),partitionBytes=await readFile('out/site/states/MN/drops.json');
  const result=verifyMinnesotaFirstPublication({stateReport:JSON.parse(reportBytes),partition:JSON.parse(partitionBytes),reportBytes,partitionBytes});
  if(!result.ok)throw new Error(`Minnesota first publication verification failed: ${result.failures.join('; ')}`);
  const output='out/first-publication/MN.json';await mkdir(path.dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(result.receipt,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({ok:true,state:'MN',receipt:output,receiptSha256:result.receipt.receiptSha256}));
}
