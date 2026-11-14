import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {isCentralCityHiveProductionOnSiteSignal,isPearsonsDcProductionOnSiteSignal} from './central-cityhive-policy.mjs';
import {CENTRAL_CITYHIVE_PRODUCTION_SOURCES} from './collectors/central-cityhive-premises.mjs';
import {PEARSONS_DC_SOURCE} from './collectors/pearsons-dc-research.mjs';
import {isWithinCustomerFreshnessWindow} from './customer-drop-freshness.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const CITY_STORES=CENTRAL_CITYHIVE_PRODUCTION_SOURCES.filter(source=>source.state==='DC').map(source=>source.storeId);
const RUN_ID=/^\d{5,20}$/u;

export function evaluateDcFirstPublication({report,partition,reportSha256,partitionSha256,workflowRunId,nowMs=Date.now()}={}){
  const failures=[];
  if(!RUN_ID.test(String(workflowRunId||'')))failures.push('A GitHub workflow run ID is required.');
  if(!/^[a-f0-9]{64}$/u.test(String(reportSha256||''))||!/^[a-f0-9]{64}$/u.test(String(partitionSha256||'')))failures.push('Report and partition byte hashes are required.');
  if(report?.state!=='DC'||report.stale!==false||report.status!=='useful'||report.metadata?.complete!==true
    ||report.metadata?.allDeliveryDisabled!==true)failures.push('DC must be a fresh complete useful source report with delivery disabled.');
  const city=report?.metadata?.cityhive,pearson=report?.metadata?.pearsons;
  if(city?.complete!==true||city.cacheReused===true||city.recordsInspected!==CITY_STORES.length
    ||JSON.stringify(city.selectedStores)!==JSON.stringify(CITY_STORES)
    ||JSON.stringify([...new Set(city.verifiedPremises||[])].sort())!==JSON.stringify([...CITY_STORES].sort())
    ||city.requests?.length!==4||city.requests.some(row=>row.ok!==true||row.status!==200)) {
    failures.push('Fresh CityHive proof must cover exactly the two registered stores with four successful requests.');
  }
  if(pearson?.complete!==true||pearson.cacheReused===true||pearson.requestCount!==1||pearson.receipts?.length!==1
    ||pearson.receipts[0]?.url!==PEARSONS_DC_SOURCE.productUrl||pearson.receipts[0]?.finalUrl!==PEARSONS_DC_SOURCE.productUrl
    ||pearson.receipts[0]?.status!==200||!/^[a-f0-9]{64}$/u.test(String(pearson.receipts[0]?.sha256||''))
    ||!Number.isFinite(Date.parse(pearson.sourceObservedAt||''))) {
    failures.push('Fresh Pearson proof must bind one successful exact product-page pickup receipt.');
  }
  const current=(partition?.drops||[]).filter(row=>row.state==='DC'
    &&(isCentralCityHiveProductionOnSiteSignal(row,{nowMs})||isPearsonsDcProductionOnSiteSignal(row,{nowMs}))
    &&isWithinCustomerFreshnessWindow(row,nowMs,{currentInventory:true}));
  const cityRows=current.filter(row=>row.sourceRuntimeId==='dc:central-cityhive'),pearsonRows=current.filter(row=>row.sourceRuntimeId==='dc:pearsons-shopify');
  const stores=new Set(current.map(row=>row.storeId)),cities=new Set(current.map(row=>row.city));
  const hasAllocatedOrUnicorn=current.some(row=>row.tier==='allocated'||row.tier==='unicorn');
  if(CITY_STORES.some(id=>!cityRows.some(row=>row.storeId===id))||pearsonRows.length!==1
    ||pearsonRows[0]?.storeId!==PEARSONS_DC_SOURCE.storeId||stores.size!==3||cities.size!==1||!hasAllocatedOrUnicorn) {
    failures.push('The public DC partition must contain current rows at both CityHive premises and Pearson’s, across one city, including an allocated or unicorn listing.');
  }
  if((partition?.drops||[]).some(row=>row.state==='DC'&&(row.canAlertAsInventory!==false||row.canAlertAsWatch!==false
    ||row.eligibleForDelivery!==false||row.eligibleForEmail!==false||row.eligibleForSms!==false))) {
    failures.push('Every emitted DC row must keep alerts and delivery disabled.');
  }
  const sourceClocks=current.map(row=>Date.parse(row.observedAt)).filter(Number.isFinite);
  if(sourceClocks.length!==current.length||!sourceClocks.length)failures.push('Every current DC row must retain a valid source observation clock.');
  if(failures.length)return{ok:false,failures};
  return{ok:true,receipt:{schemaVersion:1,state:'DC',workflowRunId:String(workflowRunId),verifiedAt:new Date(nowMs).toISOString(),
    reportSha256,partitionSha256,sourceObservationClock:new Date(Math.min(...sourceClocks)).toISOString(),
    sourceObservationIds:['dc:central-cityhive','dc:pearsons-shopify'],positiveListings:current.length,
    positiveStores:stores.size,positiveCities:cities.size,hasAllocatedOrUnicorn,allDeliveryDisabled:true,
    storeIds:[...stores].sort(),artifactPaths:['out/states/DC.json','out/site/states/DC/drops.json']}};
}

async function main(){
  const reportBytes=await readFile('out/states/DC.json'),partitionBytes=await readFile('out/site/states/DC/drops.json');
  const result=evaluateDcFirstPublication({report:JSON.parse(reportBytes),partition:JSON.parse(partitionBytes),
    reportSha256:sha(reportBytes),partitionSha256:sha(partitionBytes),workflowRunId:process.env.GITHUB_RUN_ID});
  if(!result.ok)throw new Error(`DC first publication failed: ${result.failures.join('; ')}`);
  const destination='out/first-publication/DC.json';await mkdir('out/first-publication',{recursive:true});
  await writeFile(destination,`${JSON.stringify(result.receipt,null,2)}\n`);
  console.log(JSON.stringify(result.receipt));
}
if(process.argv[1]?.replace(/\\/gu,'/').endsWith('/verify-dc-first-publication.mjs'))await main();
