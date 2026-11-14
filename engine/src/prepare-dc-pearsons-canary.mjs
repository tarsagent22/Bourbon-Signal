#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {BourbonBible} from './core/bible.mjs';
import {prepareCentralCityHiveCanary} from './prepare-central-cityhive-canary.mjs';
import {PEARSONS_DC_SOURCE,parsePearsonsDcCapture} from './collectors/pearsons-dc-research.mjs';
import {CENTRAL_CITYHIVE_RESEARCH_SOURCES} from './collectors/central-cityhive-research-premises.mjs';
import {parseCentralCityHiveInventory} from './collectors/central-cityhive-expansion.mjs';
import {canonicalizeSignal} from './operational-report.mjs';
import {buildDrops,bibleLookup} from './export-site-contract.mjs';
import {withResearchLifecycle} from './research-state-registry.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const currentBibleHash=bible=>sha(Buffer.from(JSON.stringify(bible.records||[])));
const canonical=value=>{const url=new URL(value);url.searchParams.sort();return url.href;};
const semanticRow=row=>[row.storeId,row.merchantId,row.productId,row.optionId,row.rawName,row.canonicalName,
  row.canonicalBottleId,row.tier,row.price,row.sourceUrl];
export function dedupeDcCityHiveReplayRows(rows){
  const unique=new Map();
  for(const row of rows){
    const key=JSON.stringify(semanticRow(row));
    // The research collector uses a run-level observation clock and retains
    // the first matching option. Keep that same first-seen rule on replay;
    // each receipt clock remains independently bound and freshness checked.
    if(!unique.has(key))unique.set(key,row);
  }
  return [...unique.values()];
}
const arg=flag=>process.argv.find(value=>value.startsWith(flag+'='))?.slice(flag.length+1);
async function findReports(directory){const result=[];for(const entry of await readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())result.push(...await findReports(file));else if(entry.name==='report.json')result.push(file);}return result;}

export async function prepareDcPearsonsCanary({report,reportDirectory,bible,provenance,nowMs=Date.now()}={}){
  const cityReceipts=report?.metadata?.receipts||[], pearsonReceipts=report?.metadata?.pearsons?.receipts||[];
  const receipts=[...cityReceipts,...pearsonReceipts], requests=report?.metadata?.requests||[];
  const pearsonSourceId='research:dc:pearsons-shopify';
  const sourceRow=report?.sources?.find(row=>row.sourceRuntimeId===pearsonSourceId);
  const receipt=receipts.find(row=>row.url===PEARSONS_DC_SOURCE.productUrl);
  const pearsonRequest=report?.metadata?.pearsons?.sourceAttempts?.['pearsons-wine-dc'];
  const pearsonSourceCheckedAt=Date.parse(sourceRow?.checkedAt||'');
  const sourceTime=Date.parse(receipt?.observedAt||'');
  if(report?.state!=='DC'||report.metadata?.complete!==true||report.metadata.shadowOnly!==true
    ||report.metadata.productionActivationAllowed!==false||report.metadata.customerDeliveryAllowed!==false
    ||provenance?.status!=='verified_github_shadow_artifact'||provenance.state!=='DC'
    ||provenance.repository!=='tarsagent22/Bourbon-Signal'||String(report.metadata.origin?.workflowRunId)!==provenance.workflowRunId
    ||report.metadata.origin?.commitSha!==provenance.headSha||sourceRow?.ok!==true||Number(sourceRow.status)!==200
    ||!receipt||receipt.status!==200||receipt.finalUrl!==receipt.url||receipt.bytes<1||receipt.bytes>512*1024
    ||!Number.isFinite(sourceTime)||sourceTime>nowMs||nowMs-sourceTime>2*60*60_000
    ||!Number.isFinite(pearsonSourceCheckedAt)||sourceTime>pearsonSourceCheckedAt
    ||pearsonRequest?.status!=='success'||pearsonRequest.httpStatus!==200
    ||!Array.isArray(requests)||requests.length!==4||receipts.length!==5
    ||!/^[a-f0-9]{64}$/.test(report.metadata.bibleRecordsSha256||''))
    throw new Error('Complete fresh DC shadow report with bound Pearson and CityHive receipts is required');
  const body=await readFile(path.join(reportDirectory,receipt.artifactPath));
  if(body.length!==receipt.bytes||sha(body)!==receipt.sha256)throw new Error('Pearson raw page does not match immutable hosted receipt');
  // The hosted report's signed per-source observedAt is authoritative. Recreate
  // only the parser header envelope and then restore the exact millisecond clock.
  const parsed=parsePearsonsDcCapture(body,{url:receipt.url,
    headers:`HTTP/1.1 200 OK\nDate: ${new Date(sourceTime).toUTCString()}\n`,bible,expectedSha256:receipt.sha256});
  if(!parsed)throw new Error('Retained Pearson page no longer satisfies its reviewed exact-store/product/pickup parser');
  parsed.observedAt=receipt.observedAt;parsed.sourceProductBinding.capturedAt=receipt.observedAt;
  parsed.sourceRuntimeId=pearsonSourceId;
  const cityReceiptRows=receipts.filter(row=>row.url!==PEARSONS_DC_SOURCE.productUrl);
  const cityRequests=requests.filter(row=>row.url!==PEARSONS_DC_SOURCE.productUrl);
  const citySources=report.sources.filter(row=>row.sourceRuntimeId!==pearsonSourceId);
  const replayed=[];
  for(const cityReceipt of cityReceiptRows){
    const url=new URL(cityReceipt.url),source=CENTRAL_CITYHIVE_RESEARCH_SOURCES.find(row=>row.state==='DC'
      &&row.hostname===url.hostname&&row.merchantId===url.searchParams.get('merchant-id'));
    if(!source)throw new Error('DC CityHive receipt is outside the reviewed exact merchant roster');
    const cityBody=await readFile(path.join(reportDirectory,cityReceipt.artifactPath));
    if(cityBody.length!==cityReceipt.bytes||sha(cityBody)!==cityReceipt.sha256)throw new Error('DC CityHive raw page differs from immutable receipt');
    replayed.push(...parseCentralCityHiveInventory(cityBody.toString('utf8'),source,bible,{observedAt:cityReceipt.observedAt}));
  }
  const shadowCityRows=(report.signals||[]).filter(row=>row.sourceRuntimeId!==pearsonSourceId);
  const order=rows=>rows.map(semanticRow).map(row=>JSON.stringify(row)).sort();
  const uniqueReplay=dedupeDcCityHiveReplayRows(replayed);
  if(JSON.stringify(order(uniqueReplay))!==JSON.stringify(order(shadowCityRows)))
    throw new Error('Current Bottle Bible replay changed the exact CityHive candidate identity/option/name/tier/price/URL cohort');
  const shadowBibleRecordsSha256=report.metadata.bibleRecordsSha256,currentHash=currentBibleHash(bible);
  const cityReport={...report,sources:citySources,metadata:{...report.metadata,receipts:cityReceiptRows,requests:cityRequests,
    // Only rebase this helper's library guard after exact semantic row agreement
    // between every immutable receipt and the original hosted report.
    bibleRecordsSha256:currentHash}};
  const cityHive=await prepareCentralCityHiveCanary({state:'DC',report:cityReport,reportDirectory,bible,provenance,nowMs,allowDcCityHiveSlice:true});
  const operational=canonicalizeSignal(parsed,bible);
  const pearsonDrops=buildDrops([operational],bibleLookup(bible.records),[operational]).map(row=>({...row,
    previewOnly:true,canAlertAsInventory:false,canAlertAsWatch:false,eligibleForOnSite:true,eligibleForDropFeed:true,
    eligibleForWatch:false,eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false,quantity:0,quantityIsExact:false,
    inventorySemantics:'storefront_orderable_pickup_offer_no_shelf_count',
    caveat:parsed.caveat,
  }));
  if(pearsonDrops.length!==1||pearsonDrops[0].storeId!==PEARSONS_DC_SOURCE.storeId
    ||pearsonDrops[0].storeAddress!==PEARSONS_DC_SOURCE.storeAddress||pearsonDrops[0].observedAt!==receipt.observedAt
    ||pearsonDrops[0].canonicalName!==PEARSONS_DC_SOURCE.canonicalName||pearsonDrops[0].quantity!==0
    ||pearsonDrops[0].quantityIsExact!==false)throw new Error('Pearson preview projection lost exact premise, identity, clock or no-quantity semantics');
  const locations=[...cityHive.locations,{id:PEARSONS_DC_SOURCE.storeId,storeId:PEARSONS_DC_SOURCE.storeId,state:'DC',
    name:PEARSONS_DC_SOURCE.storeName,storeName:PEARSONS_DC_SOURCE.storeName,address:PEARSONS_DC_SOURCE.storeAddress,
    storeAddress:PEARSONS_DC_SOURCE.storeAddress,city:PEARSONS_DC_SOURCE.city,zip:PEARSONS_DC_SOURCE.zip,
    lat:PEARSONS_DC_SOURCE.lat,lng:PEARSONS_DC_SOURCE.lng,type:'store',locationType:'store',
    source:PEARSONS_DC_SOURCE.sourceLabel,precision:'store_level',searchable:true,collectorAttached:true,hasSignals:true}];
  return {...cityHive,scope:'isolated_canary_input_no_production_activation',sourceFamily:'dc_cityhive_plus_pearsons',
    shadowBibleRecordsSha256,bibleRecordsSha256:currentHash,libraryReclassifiedFromShadow:shadowBibleRecordsSha256!==currentHash,
    locations,drops:[...cityHive.drops,...pearsonDrops],sourceReceipts:[...cityHive.sourceReceipts,
      {sourceId:'pearsons-wine-dc',storeId:PEARSONS_DC_SOURCE.storeId,merchantId:PEARSONS_DC_SOURCE.merchantId,
       url:receipt.url,observedAt:receipt.observedAt,sha256:receipt.sha256,bytes:receipt.bytes,artifactPath:receipt.artifactPath,
       offerSemantics:'orderable pickup offer; no exact shelf count'}],
    sourceClocks:{cityHive:cityReceipts.map(row=>({url:row.url,observedAt:row.observedAt,sha256:row.sha256})),
      pearsons:{observedAt:receipt.observedAt,sha256:receipt.sha256}}};
}

async function main(){
  const artifact=arg('--artifact-dir'),proofFile=arg('--provenance'),out=arg('--out'),configOut=arg('--config-out');
  if(!artifact||!proofFile||out!=='data/canary-inputs/DC.json'||configOut!=='out/canary-preparation/DC/lifecycle-research.json')
    throw new Error('Use verified DC artifact/provenance and fixed canary/config paths');
  const provenance=JSON.parse(await readFile(proofFile,'utf8')),matches=[];
  for(const file of await findReports(path.resolve(artifact))){const report=JSON.parse(await readFile(file,'utf8'));if(report.state==='DC'&&String(report.metadata?.origin?.workflowRunId)===provenance.workflowRunId)matches.push({file,report});}
  if(matches.length!==1)throw new Error('Expected exactly one matching workflow-issued DC report');
  const result=await prepareDcPearsonsCanary({report:matches[0].report,reportDirectory:path.dirname(matches[0].file),bible:await BourbonBible.load(),provenance});
  const lifecycle=withResearchLifecycle(JSON.parse(await readFile('../src/config/state-lifecycle.json','utf8')));
  // This generated config is consumed only by the isolated canary builder; the
  // authoritative lifecycle remains absent/inactive in src/config.
  lifecycle.states.DC={...lifecycle.states.DC,coverageTier:'live_store_inventory',
    sourceLabel:'District of Columbia exact-premise pickup canary',inventoryAlertable:false,watchAlertable:false};
  for(const[file,value]of [[out,result],[configOut,lifecycle]]){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(value,null,2)+'\n');}
  console.log(JSON.stringify({state:'DC',rows:result.drops.length,stores:result.locations.length,sourceRun:provenance.workflowRunId,
    productionActivationAllowed:false,deliveryAllowed:false}));
}
if(import.meta.url===(process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:''))main().catch(error=>{console.error(error.message);process.exit(1);});
