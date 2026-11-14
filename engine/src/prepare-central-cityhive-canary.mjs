#!/usr/bin/env node
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {BourbonBible} from './core/bible.mjs';
import {CENTRAL_CITYHIVE_EXPANSION_SOURCES,parseCentralCityHiveInventory} from './collectors/central-cityhive-expansion.mjs';
import {CENTRAL_CITYHIVE_RESEARCH_SOURCES} from './collectors/central-cityhive-research-premises.mjs';
import {MA_JULIOS_PROBE_URLS} from './collectors/massachusetts-retailer-surfaces.mjs';
import {isCentralCityHiveInventory} from './central-cityhive-policy.mjs';
import {parseCityHiveProducts} from './collectors/cityhive-surfaces.mjs';
import {canonicalizeSignal} from './operational-report.mjs';
import {buildDrops,bibleLookup} from './export-site-contract.mjs';
import {withResearchLifecycle} from './research-state-registry.mjs';
import deEcwid from '../data/de-ecwid-research-source.json' with {type:'json'};
import {parseDelawareEcwidCapture,isDelawareEcwidShadowPickup} from './research-delaware-ecwid.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>{const url=new URL(value);url.searchParams.sort();return url.href;};
const replayIdentity=row=>JSON.stringify([row?.storeId,row?.merchantId,row?.productId,row?.optionId||row?.variantId,
  row?.rawName,row?.canonicalName,row?.canonicalBottleId,row?.tier,row?.price,row?.sourceUrl]);
const sameReplayIdentity=(shadowRows,replayedRows)=>Array.isArray(shadowRows)&&shadowRows.length===replayedRows.length
  &&JSON.stringify(shadowRows.map(replayIdentity).sort())===JSON.stringify(replayedRows.map(replayIdentity).sort());
const ALL_CITYHIVE_SOURCES=Object.freeze([...CENTRAL_CITYHIVE_EXPANSION_SOURCES,...CENTRAL_CITYHIVE_RESEARCH_SOURCES]);
const CANARY_STATES=new Set(['WI','OK','MN','MO','MA','RI','KS','AR','MD','DE']);
const PER_STORE_QUERY_STATES=new Set(['MN','MO','MA','RI','KS','AR','MD','DE']);
const sourceRegistryDigest=sources=>sha(Buffer.from(JSON.stringify([...sources].map(source=>({
  id:source.id,state:source.state,storeId:source.storeId,chainId:source.chainId||null,name:source.name,chainName:source.chainName||null,
  platform:source.platform,merchantId:source.merchantId,hostname:source.hostname,
  baseUrl:source.baseUrl,address:source.address,city:source.city,zip:source.zip,lat:source.lat??null,lng:source.lng??null,
  sourceLabel:source.sourceLabel,categoryUrl:source.categoryUrl,
})).sort((a,b)=>a.id.localeCompare(b.id)))));

async function prepareDelawareCanary({report,reportDirectory,bible,provenance,nowMs=Date.now()}={}){
  const state='DE',cityHiveSources=CENTRAL_CITYHIVE_RESEARCH_SOURCES.filter(source=>source.state===state);
  const cityHive=report?.metadata?.cityHive,banks=report?.metadata?.delawareEcwid;
  const origin=cityHive?.origin,reportSources=report?.sources||[];
  const expectedBankUrls=[deEcwid.source.homeUrl,deEcwid.product.url];
  const bankRuntimeId='research:de:ecwid:130511528';
  const cityHiveRows=reportSources.filter(row=>cityHiveSources.some(source=>row.sourceRuntimeId===`research:de:${source.id}`));
  const bankRows=reportSources.filter(row=>row.sourceRuntimeId===bankRuntimeId);
  if(report?.state!==state||report.stale!==false||report.status!=='useful'||report.metadata?.complete!==true
    ||report.metadata?.allDeliveryDisabled!==true||cityHive?.complete!==true||cityHive.cacheReused===true
    ||banks?.complete!==true||banks.shadowOnly!==true||banks.productionActivationAllowed!==false
    ||banks.customerDeliveryAllowed!==false||banks.allDeliveryDisabled!==true
    ||cityHiveRows.length!==cityHiveSources.length||bankRows.length!==2
    ||!cityHiveRows.every(row=>row.ok===true&&Number(row.status)===200)
    ||!bankRows.every((row,index)=>row.ok===true&&Number(row.status)===200&&row.url===expectedBankUrls[index])
    ||reportSources.length!==cityHiveSources.length+2)throw Error('A complete three-premise DE report with CityHive and Banks success is required');
  if(provenance?.status!=='verified_github_shadow_artifact'||provenance.state!==state
    ||provenance.repository!=='tarsagent22/Bourbon-Signal'||!/^[0-9]+$/.test(provenance.artifactId||'')
    ||!/^[a-f0-9]{64}$/.test(provenance.artifactDigest||'')||!/^[a-f0-9]{40}$/.test(provenance.headSha||'')
    ||origin?.kind!=='github_actions'||String(origin.workflowRunId)!==provenance.workflowRunId
    ||origin.repository!==provenance.repository||origin.commitSha!==provenance.headSha)throw Error('DE preview requires verified hosted shadow provenance');
  const finishedMs=Date.parse(report.finishedAt),cityHiveHash=cityHive.bibleRecordsSha256,banksHash=banks.libraryRecordsSha256;
  const currentBibleHash=sha(Buffer.from(JSON.stringify(bible.records||[])));
  if(!Number.isFinite(finishedMs)||finishedMs>nowMs||nowMs-finishedMs>2*60*60_000
    ||!cityHiveHash||cityHiveHash!==banksHash||cityHiveHash!==currentBibleHash)throw Error('DE source clocks or library identity digest is stale or mismatched');
  const cityRequests=cityHive.requests||[],cityReceipts=cityHive.receipts||[],bankRequests=banks.requests||[];
  if(cityRequests.length!==4||cityReceipts.length!==4||bankRequests.length!==2
    ||new Set([...cityRequests,...bankRequests].map(row=>canonical(row.url))).size!==6
    ||[...cityRequests,...bankRequests].some(row=>row.ok!==true||Number(row.status)!==200))throw Error('DE preview requires exactly six distinct successful source requests');
  const allSources=[...cityHiveSources,{id:'banks-wines:130511528',state:'DE',storeId:'ecwid:de:130511528',chainId:'banks-wines',name:deEcwid.source.premise.name,
    chainName:deEcwid.source.retailer,platform:'ecwid',merchantId:deEcwid.source.merchantId,hostname:new URL(deEcwid.source.origin).hostname,
    baseUrl:deEcwid.source.origin,address:deEcwid.source.premise.address,city:deEcwid.source.premise.city,zip:'19967',lat:null,lng:null,
    sourceLabel:'Banks Wines & Spirits Millville first-party pickup',categoryUrl:deEcwid.source.homeUrl}];
  const rows=new Map(),proofs=[],premises=new Set();
  for(const receipt of cityReceipts){
    const age=nowMs-Date.parse(receipt.observedAt),url=new URL(receipt.url),source=cityHiveSources.find(candidate=>candidate.hostname===url.hostname
      &&url.searchParams.get('merchant-id')===candidate.merchantId);
    if(!source||!Number.isFinite(age)||age<0||age>2*60*60_000||receipt.observedAt>report.finishedAt
      ||receipt.status!==200||!Number.isSafeInteger(receipt.bytes)||receipt.bytes<1||receipt.bytes>2*1024*1024
      ||canonical(receipt.finalUrl)!==canonical(receipt.url)||!/^source-captures\/[A-Za-z0-9._-]+\.html$/.test(receipt.artifactPath||''))throw Error('DE CityHive receipt failed source, clock or body bounds');
    const request=cityRequests.find(row=>canonical(row.url)===canonical(receipt.url));
    if(!request||request.ok!==true||Number(request.status)!==200||request.sourceId!==source.id)throw Error('DE CityHive receipt is not bound to one reviewed merchant query');
    const body=await readFile(path.join(reportDirectory,receipt.artifactPath));
    if(body.length!==receipt.bytes||sha(body)!==receipt.sha256)throw Error('DE CityHive raw capture does not match its receipt');
    let premise=false;parseCityHiveProducts(body.toString('utf8'),source,{sources:ALL_CITYHIVE_SOURCES,
      isAllowedMerchantConfiguration:()=>{premise=true;return true;}});
    if(!premise)throw Error('DE CityHive raw capture does not prove its exact merchant address');
    premises.add(source.storeId);
    for(const row of parseCentralCityHiveInventory(body.toString('utf8'),source,bible,{observedAt:receipt.observedAt})){
      if(!isCentralCityHiveInventory(row,{nowMs}))throw Error('DE Kreston replay row no longer passes current pickup policy');
      const prior=rows.get(row.id);if(!prior||Date.parse(prior.observedAt)<Date.parse(row.observedAt))rows.set(row.id,row);
    }
    proofs.push({sourceId:source.id,storeId:source.storeId,url:receipt.url,observedAt:receipt.observedAt,sha256:receipt.sha256,bytes:receipt.bytes,artifactPath:receipt.artifactPath});
  }
  const bankCapture=async receipt=>{
    const age=nowMs-Date.parse(receipt.observedAt);
    if(!Number.isFinite(age)||age<0||age>2*60*60_000||receipt.status!==200||!Number.isSafeInteger(receipt.bytes)
      ||receipt.bytes<1||receipt.bytes>2*1024*1024||!/^source-captures\/(?:premise|product)\.html$/.test(receipt.artifactPath||''))throw Error('DE Banks receipt failed source, clock or body bounds');
    const body=await readFile(path.join(reportDirectory,receipt.artifactPath));
    if(body.length!==receipt.bytes||sha(body)!==receipt.sha256)throw Error('DE Banks raw capture does not match its receipt');
    proofs.push({sourceId:bankRuntimeId,url:receipt.url,observedAt:receipt.observedAt,sha256:receipt.sha256,bytes:receipt.bytes,artifactPath:receipt.artifactPath});
    return body.toString('utf8');
  };
  const premiseReceipt=bankRequests.find(row=>row.url===expectedBankUrls[0]),productReceipt=bankRequests.find(row=>row.url===expectedBankUrls[1]);
  if(!premiseReceipt||!productReceipt||premiseReceipt.ok!==true||productReceipt.ok!==true
    ||premiseReceipt.url!==expectedBankUrls[0]||productReceipt.url!==expectedBankUrls[1])throw Error('DE Banks receipts do not match the exact reviewed home and product URLs');
  const home=await bankCapture(premiseReceipt),product=await bankCapture(productReceipt);
  const banksRow=parseDelawareEcwidCapture(home,product,bible,productReceipt.observedAt);
  if(!banksRow||!isDelawareEcwidShadowPickup(banksRow,{nowMs}))throw Error('DE Banks replay did not produce a current exact allocated pickup row');
  rows.set(banksRow.id,banksRow);premises.add(banksRow.storeId);
  const replayed=[...rows.values()],reported=report.signals||[];
  if(premises.size!==3||replayed.length!==reported.length||!sameReplayIdentity(reported,replayed)
    ||!replayed.some(row=>row.tier==='allocated'||row.tier==='unicorn'))throw Error('DE current source replay changed exact rows, three-store coverage or allocation evidence');
  const operational=replayed.map(row=>canonicalizeSignal(row,bible));
  const drops=buildDrops(operational,bibleLookup(bible.records),operational).map(row=>{
    const ecwid=row.sourceRuntimeId===bankRuntimeId;
    return{...row,previewOnly:true,
      ...(ecwid?{premisesVerified:true,pickupOfferVerified:true,inventorySemantics:'binary_retailer_orderable_no_exact_count',
        sourceInventorySemantics:'binary_retailer_orderable_no_exact_count',availabilityLabel:'Retailer reports pickup available'}:{}),
      canAlertAsInventory:false,canAlertAsWatch:false,eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,
      eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false};
  });
  if(drops.length!==replayed.length||drops.some(row=>row.state!=='DE'||row.previewOnly!==true||row.canAlertAsInventory!==false
    ||row.canAlertAsWatch!==false||row.eligibleForDelivery!==false||row.eligibleForEmail!==false||row.eligibleForSms!==false))throw Error('DE candidate projection lost a verified row or enabled delivery');
  const locations=allSources.map(source=>({id:source.storeId,storeId:source.storeId,state:'DE',name:source.name,storeName:source.name,address:source.address,
    storeAddress:source.address,city:source.city,zip:source.zip,lat:source.lat??null,lng:source.lng??null,type:'store',locationType:'store',
    source:source.sourceLabel,precision:'store_level',searchable:true,collectorAttached:true,hasSignals:drops.some(row=>row.storeId===source.storeId)}));
  return{schemaVersion:1,state:'DE',generatedAt:report.finishedAt,scope:'source_replayed_canary_no_production_activation',sourceFamily:'central_cityhive_and_ecwid',
    sourceRegistrySha256:sourceRegistryDigest(allSources),bibleRecordsSha256:currentBibleHash,originalSourceClockPreserved:true,workflowSource:provenance,
    sourceReceipts:proofs,locations,drops,allDeliveryDisabled:true,productionActivationAllowed:false};
}

// Only workflow-issued portable raw bodies can produce isolated canary input.
// Report signals, prices, tiers and mutable absolute file paths are never read.
export async function prepareCentralCityHiveCanary({state,report,reportDirectory,bible,provenance,nowMs=Date.now()}={}){
  if(state==='DE')return prepareDelawareCanary({report,reportDirectory,bible,provenance,nowMs});
  const researchOnly=PER_STORE_QUERY_STATES.has(state);
  const sources=(researchOnly?CENTRAL_CITYHIVE_RESEARCH_SOURCES:CENTRAL_CITYHIVE_EXPANSION_SOURCES).filter(source=>source.state===state);
  const reportSources=report?.sources||[];
  const cityHiveRuntimeId=source=>`research:${state.toLowerCase()}:${source.id}`;
  const matchingSourceRows=reportSources.filter(row=>sources.some(source=>row.sourceRuntimeId===cityHiveRuntimeId(source)));
  const extraMaRows=state==='MA'?reportSources.filter(row=>row.sourceRuntimeId?.startsWith('precision:ma:julios-westborough:')):[];
  const expectedMaJulios=state==='MA'?MA_JULIOS_PROBE_URLS.map((url,index)=>({sourceRuntimeId:`precision:ma:julios-westborough:${index}`,url})):[];
  if(!CANARY_STATES.has(state)||sources.length===0||report?.state!==state||report.metadata?.complete!==true
    ||report.metadata.shadowOnly!==true||report.metadata.productionActivationAllowed!==false
    ||report.metadata.customerDeliveryAllowed!==false||matchingSourceRows.length!==sources.length
    ||!matchingSourceRows.every(row=>row.ok===true&&Number(row.status)===200&&sources.some(source=>row.sourceRuntimeId===cityHiveRuntimeId(source)
      &&row.label===source.sourceLabel&&row.url===source.categoryUrl))
    ||reportSources.length!==sources.length+expectedMaJulios.length
    ||(state==='MA'&&(!expectedMaJulios.every(expected=>extraMaRows.some(row=>row.sourceRuntimeId===expected.sourceRuntimeId
      &&row.url===expected.url&&row.ok===true&&Number(row.status)===200&&row.label==="Julio's Liquors public pickup"))
      ||extraMaRows.length!==expectedMaJulios.length)))
    throw new Error('A complete matching isolated CityHive shadow report is required');
  const origin=report.metadata.origin;
  if(provenance?.status!=='verified_github_shadow_artifact'||provenance.state!==state
    ||provenance.repository!=='tarsagent22/Bourbon-Signal'||!/^\d+$/.test(provenance.artifactId||'')
    ||!/^[a-f0-9]{64}$/.test(provenance.artifactDigest||'')||!/^[a-f0-9]{40}$/.test(provenance.headSha||'')
    ||origin?.kind!=='github_actions'||String(origin.workflowRunId)!==provenance.workflowRunId
    ||origin.repository!==provenance.repository||origin.commitSha!==provenance.headSha)throw new Error('Canary requires verified workflow-issued shadow provenance and ZIP digest');
  const finishedMs=Date.parse(report.finishedAt),receipts=report.metadata.receipts;
  const currentBibleHash=sha(Buffer.from(JSON.stringify(bible.records||[])));
  const shadowBibleHash=report.metadata.bibleRecordsSha256;
  const libraryChanged=shadowBibleHash!==currentBibleHash;
  if(!Number.isFinite(finishedMs)||finishedMs>nowMs||nowMs-finishedMs>2*60*60_000
    ||!Array.isArray(receipts)||receipts.length<sources.length||receipts.length>sources.length*5
    ||!/^[a-f0-9]{64}$/.test(shadowBibleHash)||libraryChanged&&!['MO','KS'].includes(state))throw new Error('Incomplete, stale or library-mismatched shadow receipt set');
  const categorySources=new Set(),capturedStores=new Set(),seenUrls=new Set(),seenPaths=new Set(),rows=new Map(),proofs=[];
  const requests=report.metadata.requests;
  if(!Array.isArray(requests)||requests.length!==receipts.length)throw new Error('Partial state: CityHive request and raw receipt sets do not link one-to-one');
  const requestUrls=new Set(requests.map(request=>canonical(request.url)));
  if(requestUrls.size!==requests.length)throw new Error('Duplicate CityHive request URLs cannot form a portable manifest');
  for(const receipt of receipts){
    const observedMs=Date.parse(receipt.observedAt),age=nowMs-observedMs;
    if(!Number.isFinite(age)||age<0||age>2*60*60_000||observedMs>finishedMs)throw new Error('Shadow source clock is stale or future-dated; collect again');
    if(receipt.status!==200||!Number.isSafeInteger(receipt.bytes)||receipt.bytes<1||receipt.bytes>2*1024*1024)throw new Error('Incomplete bounded shadow HTTP proof');
    const url=new URL(receipt.url),source=sources.find(source=>source.hostname===url.hostname&&url.searchParams.get('merchant-id')===source.merchantId);
    if(!source||url.protocol!=='https:'||url.username||url.password||url.port||url.hash
      ||url.pathname!=='/shop/'
      ||canonical(receipt.finalUrl)!==canonical(receipt.url)||seenUrls.has(canonical(receipt.url)))throw new Error('Foreign, redirected or duplicate source capture');
    seenUrls.add(canonical(receipt.url));
    if(canonical(receipt.url)===canonical(source.categoryUrl))categorySources.add(source.id);
    else if([...url.searchParams].length!==2||!url.searchParams.has('ch-query')
      ||!url.searchParams.get('ch-query')?.trim()||url.searchParams.get('ch-query').length>120)throw new Error('Unreviewed CityHive search capture');
    if(researchOnly&&canonical(receipt.url)===canonical(source.categoryUrl))throw new Error('Per-store research receipts must use the reviewed merchant-scoped query route');
    const linkedRequest=requests.find(request=>canonical(request.url)===canonical(receipt.url));
    const expectedRequestId=PER_STORE_QUERY_STATES.has(state)?source.id:(source.chainId||source.id);
    if(!linkedRequest||linkedRequest.ok!==true||Number(linkedRequest.status)!==200||receipt.status!==linkedRequest.status
      ||linkedRequest.sourceId!==expectedRequestId)throw new Error('Raw receipt does not link to a successful registered-source request');
    const relative=receipt.artifactPath;
    if(typeof relative!=='string'||!/^source-captures\/[A-Za-z0-9._-]+\.html$/.test(relative)||seenPaths.has(relative))throw new Error('Source capture path must be portable, bounded and unique');
    seenPaths.add(relative);
    const body=await readFile(path.join(reportDirectory,relative));
    if(body.length!==receipt.bytes||sha(body)!==receipt.sha256)throw new Error('Captured body does not match its immutable HTTP receipt');
    let exactPremise=false;
    // The parser invokes this callback only after its exact registered merchant
    // ID and full premise-address checks, including for healthy zero stock.
    parseCityHiveProducts(body.toString('utf8'),source,{sources:ALL_CITYHIVE_SOURCES,
      isAllowedMerchantConfiguration:()=>{exactPremise=true;return true;}});
    if(!exactPremise)throw new Error('Captured merchant configuration no longer proves the exact registered premise');
    capturedStores.add(source.storeId);
    for(const row of parseCentralCityHiveInventory(body.toString('utf8'),source,bible,{observedAt:receipt.observedAt})){
      if(!isCentralCityHiveInventory(row,{nowMs}))throw new Error('Replayed candidate lacks current exact source proof');
      const prior=rows.get(row.id);if(!prior||Date.parse(prior.observedAt)<observedMs)rows.set(row.id,row);
    }
    proofs.push({sourceId:source.id,storeId:source.storeId,merchantId:source.merchantId,url:receipt.url,
      observedAt:receipt.observedAt,sha256:receipt.sha256,bytes:receipt.bytes,artifactPath:relative});
  }
  if([...requestUrls].some(url=>!seenUrls.has(url)))throw new Error('A successful CityHive request is missing its raw receipt');
  if(researchOnly){
    if(capturedStores.size!==sources.length||sources.some(source=>!capturedStores.has(source.storeId)))throw new Error('Partial per-store cohort capture: exact merchant proof is missing');
  }else if(categorySources.size!==sources.length)throw new Error('Partial state source capture: exact merchant category proof is missing');
  if(libraryChanged&&!sameReplayIdentity(report.signals,[...rows.values()]))
    throw new Error(`${state} current-library replay changed the shadow product identity, size-bound option, tier or price`);
  const operational=[...rows.values()].map(row=>canonicalizeSignal(row,bible));
  const drops=buildDrops(operational,bibleLookup(bible.records),operational).map(row=>({...row,previewOnly:true,
    canAlertAsInventory:false,canAlertAsWatch:false,eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,
    eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false}));
  if(!drops.length)throw new Error('No qualified canary candidates survived current library and export policy');
  return{schemaVersion:1,state,generatedAt:report.finishedAt,scope:'isolated_canary_input_no_production_activation',
    sourceFamily:'central_cityhive',sourceRegistrySha256:sourceRegistryDigest(sources),bibleRecordsSha256:currentBibleHash,
    shadowBibleRecordsSha256:shadowBibleHash,libraryReclassifiedFromShadow:libraryChanged,
    ...(state==='MA'?{excludedSourceFamilies:[{id:'julios-westborough',reason:'Separate source collector; excluded from central CityHive replay.'}]}:{}),
    originalSourceClockPreserved:true,workflowSource:provenance,sourceReceipts:proofs,
    locations:sources.map(source=>({id:source.storeId,storeId:source.storeId,state,name:source.name,storeName:source.name,
      address:source.address,storeAddress:source.address,city:source.city,zip:source.zip,type:'store',locationType:'store',
      source:source.sourceLabel,precision:'store_level',searchable:true,collectorAttached:true,
      hasSignals:drops.some(row=>row.storeId===source.storeId)})),drops};
}
async function findReports(directory){const files=[];for(const entry of await readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())files.push(...await findReports(file));else if(entry.name==='report.json')files.push(file);}return files;}
const argument=flag=>process.argv.find(value=>value.startsWith(flag+'='))?.slice(flag.length+1);
async function main(){
  const state=argument('--state'),artifact=argument('--artifact-dir'),proofFile=argument('--provenance'),out=argument('--out'),configOut=argument('--config-out');
  if(!CANARY_STATES.has(state)||!artifact||!proofFile||out!==`data/canary-inputs/${state}.json`
    ||configOut!==`out/canary-preparation/${state}/lifecycle-research.json`)throw new Error('Use reviewed state, verified artifact/provenance and fixed state canary/config output paths');
  const provenance=JSON.parse(await readFile(proofFile,'utf8')),matching=[];
  for(const file of await findReports(path.resolve(artifact))){const report=JSON.parse(await readFile(file,'utf8'));if(report.state===state&&String(report.metadata?.origin?.workflowRunId)===provenance.workflowRunId)matching.push({file,report});}
  if(matching.length!==1)throw new Error('Expected exactly one matching workflow-issued state report');
  const result=await prepareCentralCityHiveCanary({state,report:matching[0].report,reportDirectory:path.dirname(matching[0].file),bible:await BourbonBible.load(),provenance});
  const lifecycle=withResearchLifecycle(JSON.parse(await readFile('../src/config/state-lifecycle.json','utf8')));
  for(const[file,value]of [[out,result],[configOut,lifecycle]]){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(value,null,2)+'\n');}
  console.log(JSON.stringify({state,rows:result.drops.length,stores:result.locations.length,sourceRun:provenance.workflowRunId,productionActivationAllowed:false}));
}
if(import.meta.url===(process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:''))main().catch(error=>{console.error(error.message);process.exit(1);});
