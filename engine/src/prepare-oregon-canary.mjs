#!/usr/bin/env node
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {BourbonBible} from './core/bible.mjs';
import {stableId} from './core/text.mjs';
import {resolveOregonBourbonIdentity,isOregonDailyInventoryObservation,OREGON_DAILY_INVENTORY_URL} from './or-daily-inventory.mjs';
import {OREGON_DAILY_PRODUCTION_COHORT_SHA256,OREGON_DAILY_PRODUCTION_RUNTIME_ID} from './oregon-daily-production-policy.mjs';
import {canonicalizeSignal} from './operational-report.mjs';
import {buildDrops,bibleLookup} from './export-site-contract.mjs';
import {withResearchLifecycle} from './research-state-registry.mjs';

function dateParts(value){const m=String(value||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(!m)return null;const [,mm,dd,yy]=m.map(Number);const t=Date.UTC(yy,mm-1,dd);const d=new Date(t);return d.getUTCMonth()===mm-1&&d.getUTCDate()===dd?{year:yy,month:mm,day:dd,time:t}:null;}
function reportAgeDays(reportDate,generatedAt){const report=dateParts(reportDate),generated=new Date(generatedAt);if(!report||!Number.isFinite(generated.getTime()))return Infinity;const day=Date.UTC(generated.getUTCFullYear(),generated.getUTCMonth(),generated.getUTCDate());return Math.round((day-report.time)/86400000);}

export function prepareOregonCanary({sourceReport,shadowSummary,shadowReport,provenance,bible,nowMs=Date.now()}={}){
  if(provenance?.status!=='verified_github_oregon_report_artifacts'||provenance.state!=='OR'||provenance.repository!=='tarsagent22/Bourbon-Signal'
    ||!/^[0-9]+$/.test(String(provenance.workflowRunId||''))||!/^[a-f0-9]{40}$/.test(provenance.headSha||'')
    ||!/^[a-f0-9]{64}$/.test(provenance.sourceArtifactDigest||'')||!/^[a-f0-9]{64}$/.test(provenance.shadowArtifactDigest||''))throw Error('Oregon canary requires verified workflow-issued report artifacts');
  const result=shadowSummary?.results?.find(row=>row.state==='OR');
  if(shadowSummary?.mode!=='shadow'||shadowSummary.complete!==true||!result?.complete||result.outcome!=='complete'
    ||result.publication?.allowed!==false||result.publication?.productionSnapshotTouched!==false
    ||result.alerts?.disabled!==true||result.alerts?.deliveryAttempted!==false)throw Error('Hosted shadow summary does not prove a complete nonpublishing OR observation with alerts disabled');
  if(sourceReport?.schemaVersion!=='bourbon-signal-or-product-availability-v1'||sourceReport.status!=='ready'
    ||sourceReport.sourceUrl!==OREGON_DAILY_INVENTORY_URL||!Array.isArray(sourceReport.products)||sourceReport.products.length===0
    ||!Number.isSafeInteger(sourceReport.sourceBytes)||sourceReport.sourceBytes<1||sourceReport.sourceBytes>150_000_000
    ||!/^[a-f0-9]{64}$/.test(sourceReport.sourceSha256||'')||sourceReport.bible?.mode!=='live')throw Error('Hosted OLCC product report has an invalid source contract');
  if(shadowReport?.state!=='OR'||shadowReport.status!=='useful'||!Array.isArray(shadowReport.signals)||!shadowReport.signals.length
    ||!shadowReport.sources?.some(source=>source.ok===true&&source.url===OREGON_DAILY_INVENTORY_URL)
    ||!shadowReport.signals.every(row=>row.sourceUrl===OREGON_DAILY_INVENTORY_URL&&row.raw?.sourceReportDate===sourceReport.sourceReportDate
      &&row.canAlertAsInventory===false&&row.canAlertAsWatch===false&&row.eligibleForDelivery===false
      &&row.eligibleForEmail===false&&row.eligibleForSms===false))throw Error('Hosted Oregon shadow report does not match the saved official report revision or disabled alert policy');
  const generatedMs=Date.parse(sourceReport.generatedAt),reportAge=reportAgeDays(sourceReport.sourceReportDate,sourceReport.generatedAt);
  if(!Number.isFinite(generatedMs)||generatedMs>nowMs||nowMs-generatedMs>48*60*60_000||reportAge<0||reportAge>2)throw Error('OLCC daily report is stale, future-dated, or outside the same date-level freshness policy as research');
  const shadowSignals=new Map(shadowReport.signals.map(row=>[row.id,row])),observedRows=[],locations=new Map(),seen=new Set();
  for(const product of sourceReport.products){
    if(!product||!Array.isArray(product.stores)||!String(product.itemCode||'').trim()||!String(product.newItemCode||'').trim())throw Error('OLCC report product is missing source keys or store rows');
    const identity=resolveOregonBourbonIdentity(product,bible);
    if(identity.status!=='verified_exact'||identity.match.record.id!==product.canonicalBottleId||identity.match.record.canonical!==product.canonicalName)throw Error(`Current app Bible no longer confirms exact OLCC identity: ${product.name||product.itemCode} (${identity.status})`);
    for(const store of product.stores){
      if(!Number.isSafeInteger(store.quantity)||store.quantity<=0)continue;
      if(!String(store.storeNo||'').trim()||!String(store.address||'').trim()||!String(store.city||'').trim()
        ||!/^\d{5}(?:-\d{4})?$/.test(String(store.zip||'').trim())||!store.inventoryObservedAt)throw Error(`Positive OLCC row is missing exact store identity or inventory date: ${product.itemCode}`);
      const storeId=String(store.storeNo),address=[store.address,store.city,'OR',store.zip].join(', ');
      const signal={id:stableId(['OR','or-daily-store',identity.match.record.id,product.size,product.proof,storeId]),state:'OR',stateCode:'OR',
        sourceRuntimeId:OREGON_DAILY_PRODUCTION_RUNTIME_ID,
        sourceLabel:'Oregon OLCC Daily Store Inventory',sourceUrl:OREGON_DAILY_INVENTORY_URL,rawName:product.name,
        canonicalBottleId:identity.match.record.id,canonicalName:identity.match.record.canonical,tier:identity.match.record.tier||product.rarityTier,
        confidence:1,sourceMatchStatus:'bottle_bible_match',fetchedAt:sourceReport.generatedAt,eventType:'store_inventory_result',
        sourceReportSha256:sourceReport.sourceSha256,sourceReportGeneratedAt:sourceReport.generatedAt,
        sourceStale:false,stale:false,previewOnly:false,
        sourceProductBinding:{source:'olcc-daily-report',cohortSha256:OREGON_DAILY_PRODUCTION_COHORT_SHA256,
          itemCode:String(product.itemCode),newItemCode:String(product.newItemCode),canonicalBottleId:identity.match.record.id,
          size:product.size,proof:product.proof,reportSha256:sourceReport.sourceSha256,reportGeneratedAt:sourceReport.generatedAt,
          sourceQuantity:store.quantity,observedAt:store.inventoryObservedAt},
        locationPrecision:'store_level',locationName:`Oregon Liquor Store ${storeId}`,storeName:`Oregon Liquor Store ${storeId}`,
        storeId,storeAddress:address,city:store.city,postalCode:String(store.zip),zip:String(store.zip),quantity:store.quantity,price:product.bottlePrice??null,
        observedAt:store.inventoryObservedAt,lastConfirmedAt:store.inventoryObservedAt,quantityIsExact:true,
        sourceAvailabilityVerified:true,canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,
        eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,eligibleForDelivery:false,deliveryEligible:false,eligibleForEmail:false,eligibleForSms:false,
        dataLane:'inventory',inventorySemantics:'Official OLCC store-reported bottle quantity in the statewide daily inventory report. Timestamp is the store inventory date, not a restock event; verify with the store before driving.',
        evidence:`The OLCC daily inventory report lists ${store.quantity} bottle(s) of ${product.name} at ${store.storeName||`store ${storeId}`}, ${address}. Store inventory date: ${store.inventoryDate}; verify with the store before driving.`,
        raw:{itemCode:product.itemCode,newItemCode:product.newItemCode,proof:product.proof,size:product.size,inventoryDate:store.inventoryDate,
          sourceReportDate:sourceReport.sourceReportDate,officialReportSha256:sourceReport.sourceSha256}};
      if(!isOregonDailyInventoryObservation(signal,nowMs))continue;
      const original=shadowSignals.get(signal.id);
      if(!original||original.observedAt!==signal.observedAt||original.storeId!==signal.storeId||original.storeAddress!==signal.storeAddress
        ||original.quantity!==signal.quantity||original.canonicalBottleId!==signal.canonicalBottleId||original.rawName!==signal.rawName)throw Error('Reparsed current Oregon row does not match its hosted shadow observation');
      const key=[signal.canonicalBottleId,signal.storeId,signal.rawName,signal.observedAt].join('|');if(seen.has(key))continue;seen.add(key);observedRows.push(signal);
      locations.set(storeId,{id:storeId,storeId,state:'OR',name:signal.storeName,storeName:signal.storeName,address,storeAddress:address,
        city:store.city,zip:String(store.zip),type:'store',locationType:'store',source:signal.sourceLabel,precision:'store_level',searchable:true,collectorAttached:true});
    }
  }
  if(!observedRows.length)throw Error('No exact, fresh, positive Oregon store rows survived current identity and availability checks');
  const operational=observedRows.map(row=>canonicalizeSignal(row,bible));
  const drops=buildDrops(operational,bibleLookup(bible.records),operational).map(row=>({...row,previewOnly:true,
    canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,
    eligibleForDelivery:false,deliveryEligible:false,eligibleForEmail:false,eligibleForSms:false}));
  if(!drops.length)throw Error('No Oregon candidate rows survived current site export policy');
  const candidateLocations=[...locations.values()].filter(location=>drops.some(row=>String(row.storeId)===location.storeId));
  return{schemaVersion:1,state:'OR',generatedAt:sourceReport.generatedAt,sourceReportDate:sourceReport.sourceReportDate,
    sourceReportSha256:sourceReport.sourceSha256,scope:'isolated_canary_input_no_production_activation',originalSourceClockPreserved:true,
    workflowSource:provenance,exactSourceRowCount:observedRows.length,locations:candidateLocations,drops,
    policy:{researchOnly:true,productionActivationAllowed:false,customerDeliveryAllowed:false,inventoryAlertsAllowed:false,watchAlertsAllowed:false}};
}

const argument=flag=>process.argv.find(value=>value.startsWith(flag+'='))?.slice(flag.length+1);
async function readJson(file){return JSON.parse(await readFile(file,'utf8'));}
async function main(){
  const artifact=argument('--artifact-dir'),proofFile=argument('--provenance'),out=argument('--out'),configOut=argument('--config-out');
  if(!artifact||!proofFile||out!=='data/canary-inputs/OR.json'||configOut!=='out/canary-preparation/OR/lifecycle-research.json')throw Error('Use verified Oregon artifacts and fixed OR canary/config paths');
  const directory=path.resolve(artifact),provenance=await readJson(proofFile),sourceReport=await readJson(path.join(directory,'OR-product-availability.json')),
    shadowReport=await readJson(path.join(directory,'OR-shadow-report.json')),shadowSummary=await readJson(path.join(directory,'shadow-run.json'));
  const result=prepareOregonCanary({sourceReport,shadowSummary,shadowReport,provenance,bible:await BourbonBible.load()});
  const lifecycle=withResearchLifecycle(await readJson('../src/config/state-lifecycle.json'));
  for(const[file,value]of [[out,result],[configOut,lifecycle]]){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(value,null,2)+'\n');}
  console.log(JSON.stringify({state:'OR',rows:result.drops.length,stores:result.locations.length,sourceReportDate:result.sourceReportDate,productionActivationAllowed:false}));
}
if(import.meta.url===(process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:''))main().catch(error=>{console.error(error.message);process.exit(1);});
