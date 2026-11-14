import {createHash} from 'node:crypto';
import {CENTRAL_CITYHIVE_PRODUCTION_SOURCES} from './collectors/central-cityhive-premises.mjs';
import {centralCityHiveProductionCohortKey,CENTRAL_CITYHIVE_PRODUCTION_BUDGETS} from './central-cityhive-production-config.mjs';
import {isCentralCityHiveProductionOnSiteSignal} from './central-cityhive-policy.mjs';
import {isDelawareEcwidProductionOnSiteSignal} from './delaware-ecwid-production-policy.mjs';
import {isWithinCustomerFreshnessWindow} from './customer-drop-freshness.mjs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import deEcwid from '../data/de-ecwid-research-source.json' with {type:'json'};

const hash=value=>createHash('sha256').update(value).digest('hex');
const cityhive=CENTRAL_CITYHIVE_PRODUCTION_SOURCES.filter(source=>source.state==='DE');
const expectedStores=[...cityhive.map(source=>source.storeId),'ecwid:de:130511528'];
const identity=row=>JSON.stringify([row.storeId,row.productId,row.optionId||row.variantId,row.observedAt,row.canonicalBottleId]);

function validCityHiveRequest(row,source){
  if(row?.sourceId!==source.id||row.ok!==true||Number(row.status)!==200)return false;
  try{const url=new URL(row.url);return url.origin===source.baseUrl&&url.pathname==='/shop/'&&!url.hash&&!url.username&&!url.password
    &&[...url.searchParams].length===2&&url.searchParams.get('merchant-id')===source.merchantId
    &&Boolean(url.searchParams.get('ch-query')?.trim())&&url.searchParams.get('ch-query').length<=120;}catch{return false;}
}

export function verifyDelawareFirstPublication({report,partition,locations,reportBytes,partitionBytes,nowMs=Date.now(),workflowRunId=process.env.GITHUB_RUN_ID}={}){
  const failures=[],meta=report?.metadata,city=meta?.cityhive,ecwid=meta?.ecwid,cohort=centralCityHiveProductionCohortKey('DE');
  if(report?.state!=='DE'||report.status!=='useful'||report.stale!==false||meta?.allDeliveryDisabled!==true
    ||meta?.requestCount!==CENTRAL_CITYHIVE_PRODUCTION_BUDGETS.DE.maxRequests)failures.push('DE first publication requires a useful current six-request report with delivery disabled');
  if(!/^[0-9]+$/.test(String(workflowRunId||'')))failures.push('first-publication receipt requires its hosted refresh workflow run id');
  if(city?.complete!==true||city.cacheReused===true||city.cohortKey!==cohort||city.productionAlertDeliveryAllowed!==false
    ||JSON.stringify(city.selectedStores)!==JSON.stringify(cityhive.map(source=>source.storeId))
    ||JSON.stringify(city.verifiedPremises)!==JSON.stringify(cityhive.map(source=>source.storeId)))
    failures.push('DE report must include a fresh complete exact two-store CityHive observation');
  if(!Array.isArray(city?.requests)||city.requests.length!==4||!cityhive.every(source=>{
    const rows=city.requests.filter(row=>row.sourceId===source.id),terms=rows.map(row=>{try{return new URL(row.url).searchParams.get('ch-query');}catch{return null;}});
    const priority=source.prioritySearchTerm||source.prioritySearchTerms?.[0]||'barrel proof';
    return rows.length===2&&rows.every(row=>validCityHiveRequest(row,source))&&terms.every(Boolean)&&new Set(terms).size===2&&terms.includes(priority);
  }))failures.push('DE requires two successful merchant-scoped queries per Kreston store, including the fixed allocated priority and one distinct rotating term');
  if(ecwid?.complete!==true||ecwid.cacheReused===true||ecwid.shadowOnly!==true||ecwid.customerDeliveryAllowed!==false
    ||JSON.stringify(ecwid.selectedStores)!==JSON.stringify(['ecwid:de:130511528'])
    ||ecwid.requests?.length!==2||ecwid.requests.some(row=>row.ok!==true||Number(row.status)!==200)
    ||JSON.stringify(ecwid.requests?.map(row=>row.url))!==JSON.stringify([deEcwid.source.homeUrl,deEcwid.product.url]))
    failures.push('DE requires the exact current Banks premise and product pickup capture');
  const sourceObserved=[city?.sourceObservedAt,ecwid?.sourceObservedAt].map(Date.parse);
  const requestClocks=(ecwid?.requests||[]).map(row=>Date.parse(row.observedAt||''));
  if(sourceObserved.some(clock=>!Number.isFinite(clock)||nowMs-clock<0||nowMs-clock>2*60*60_000)
    ||sourceObserved.some(clock=>clock<Date.parse(report?.startedAt||'')||clock>Date.parse(report?.finishedAt||''))
    ||requestClocks.length!==2||requestClocks.some(clock=>!Number.isFinite(clock)||clock<Date.parse(report?.startedAt||'')||clock>Date.parse(report?.finishedAt||'')||nowMs-clock<0||nowMs-clock>2*60*60_000))
    failures.push('DE source clocks must be original, current, and within the report window');
  const signals=report?.signals||[],drops=partition?.drops||[],accepts=row=>row.state==='DE'&&expectedStores.includes(row.storeId)
    &&(row.sourceRuntimeId==='de:ecwid-pickup'?isDelawareEcwidProductionOnSiteSignal(row,{nowMs}):isCentralCityHiveProductionOnSiteSignal(row,{nowMs}))
    &&isWithinCustomerFreshnessWindow(row,nowMs,{currentInventory:true});
  const identities=new Set(signals.map(identity));
  if(!signals.length||signals.some(row=>!accepts(row)||row.canAlertAsInventory!==false||row.canAlertAsWatch!==false||row.eligibleForDelivery!==false))
    failures.push('DE source report rows must be exact, fresh pickup signals with all alert and delivery channels off');
  if(partition?.state!=='DE'||partition.count!==drops.length||!drops.length||drops.some(row=>!accepts(row)||!identities.has(identity(row))))
    failures.push('DE customer partition must contain only exact rows from the matching source report');
  const stores=new Set(drops.map(row=>row.storeId));
  if(stores.size<1||stores.size>3||[...stores].some(id=>!expectedStores.includes(id)))failures.push('first publication requires current positive listings at one or more of the three reviewed premises');
  if(!drops.some(row=>['allocated','unicorn'].includes(row.tier)))failures.push('first publication requires at least one allocated or unicorn identity');
  if(!cityhive.every(source=>locations?.locations?.some(row=>row.state==='DE'&&row.id===source.storeId&&row.address===source.address&&row.city===source.city))
    ||!locations?.locations?.some(row=>row.state==='DE'&&row.id==='ecwid:de:130511528'&&row.address==='38014 Town Center Drive, Millville, DE 19967'&&row.city==='Millville'))
    failures.push('DE Finder must expose the exact three reviewed premises');
  if(failures.length)return{ok:false,failures,receipt:null};
  const receipt={schemaVersion:1,state:'DE',verification:'first_production_publication',workflowRunId:String(workflowRunId),verifiedAt:new Date(nowMs).toISOString(),
    cohortSha256:cohort,selectedPremises:expectedStores,verifiedPremises:expectedStores,successfulRequests:meta.requestCount,
    publishedRows:drops.length,publishedStores:stores.size,publishedStoreIds:[...stores].sort(),allocatedRows:drops.filter(row=>['allocated','unicorn'].includes(row.tier)).length,
    sourceObservedAt:{cityhive:city.sourceObservedAt,ecwid:ecwid.sourceObservedAt},sourceReportSha256:hash(reportBytes||JSON.stringify(report)),
    partitionSha256:hash(partitionBytes||JSON.stringify(partition)),allDeliveryChannelsDisabled:true};
  receipt.receiptSha256=hash(JSON.stringify(receipt));return{ok:true,failures:[],receipt};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const [reportBytes,partitionBytes,locationBytes]=await Promise.all(['out/states/DE.json','out/site/states/DE/drops.json','out/site/locations.json'].map(file=>readFile(file)));
  const result=verifyDelawareFirstPublication({report:JSON.parse(reportBytes),partition:JSON.parse(partitionBytes),locations:JSON.parse(locationBytes),reportBytes,partitionBytes});
  if(!result.ok)throw Error(`Delaware first-publication verification failed: ${result.failures.join('; ')}`);
  const output='out/first-publication/DE.json';await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result.receipt,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({ok:true,state:'DE',receipt:output,receiptSha256:result.receipt.receiptSha256}));
}
