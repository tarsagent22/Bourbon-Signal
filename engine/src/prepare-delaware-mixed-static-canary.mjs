#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {BourbonBible} from './core/bible.mjs';
import {ADDITIONAL_CITYHIVE_EXPANSION_SOURCES,parseCentralCityHiveInventory} from './collectors/central-cityhive-expansion.mjs';
import {isCentralCityHiveCanaryOnSiteSignal} from './central-cityhive-policy.mjs';
import {buildDrops,bibleLookup} from './export-site-contract.mjs';
import {buildDelawareBanksStaticCanarySignal,isDelawareBanksStaticCanarySignal} from './delaware-banks-static-canary.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const nowMs=Date.now();
const evidencePath=path.resolve('data/state-expansion-evidence/DE-banks-millville-repeat-20261114.json');
const reportDirectory=process.env.DE_KRESTON_REPORT_DIR;
const outputPath=path.resolve('out/canary-preparation/DE-mixed/combined-input.json');
if(!reportDirectory)throw new Error('Set DE_KRESTON_REPORT_DIR to the retained current local Kreston capture directory.');
const report=JSON.parse(await readFile(path.join(reportDirectory,'report.json'),'utf8'));
const evidence=JSON.parse(await readFile(evidencePath,'utf8'));
const bible=await BourbonBible.load();
const sources=ADDITIONAL_CITYHIVE_EXPANSION_SOURCES.filter(source=>source.state==='DE');
const expectedIds=new Set(sources.map(source=>source.id));
const captures=report.receipts||[];
if(report.state!=='DE'||report.researchOnly!==true||report.alertsDisabled!==true||report.deliveryDisabled!==true
  ||report.complete!==true||report.requests?.length!==4||captures.length!==4)throw new Error('A complete two-store bounded Kreston source capture is required.');
const requests=new Set(report.requests.map(request=>request.url));
const seenStoreQueries=new Map(),candidateRows=new Map(),verifiedPremises=new Set();
for(const receipt of captures){
  const observed=Date.parse(receipt.observedAt);if(!Number.isFinite(observed)||observed>nowMs||nowMs-observed>2*60*60_000)throw new Error('Kreston capture is outside the two-hour preview window.');
  const request=report.requests.find(row=>row.url===receipt.url);
  const url=new URL(receipt.url),source=sources.find(item=>item.hostname===url.hostname&&url.searchParams.get('merchant-id')===item.merchantId);
  const term=url.searchParams.get('ch-query');
  if(!request||request.ok!==true||request.status!==200||receipt.status!==200||!source||!expectedIds.has(source.id)
    ||url.protocol!=='https:'||url.pathname!=='/shop/'||url.username||url.password||url.hash
    ||!['barrel proof',"Blanton's Gold"].includes(term)||!requests.has(receipt.url))throw new Error('Kreston raw receipt is outside the exact reviewed query cohort.');
  const seen=seenStoreQueries.get(source.id)||new Set();seen.add(term);seenStoreQueries.set(source.id,seen);
  const body=await readFile(path.join(reportDirectory,receipt.artifactPath));
  if(body.length!==receipt.bytes||sha(body)!==receipt.sha256)throw new Error('Kreston raw response does not match its stored SHA-256 receipt.');
  const rows=parseCentralCityHiveInventory(body.toString('utf8'),source,bible,{observedAt:receipt.observedAt,onVerifiedPremise:row=>verifiedPremises.add(row.storeId)});
  for(const row of rows){
    const prior=candidateRows.get(row.id);if(!prior||Date.parse(prior.observedAt)<observed)candidateRows.set(row.id,row);
  }
}
if(sources.some(source=>!verifiedPremises.has(source.storeId)||seenStoreQueries.get(source.id)?.size!==2))throw new Error('Kreston merchant-scoped queries did not prove both exact premises.');
const banks=evidence.source.evidence;
for(const [file,key] of [[evidence.source.evidence.premiseCapturePath,'premiseCaptureSha256'],[evidence.source.evidence.productCapturePath,'productCaptureSha256']]){
  const bytes=await readFile(file);if(sha(bytes)!==banks[key])throw new Error(`Banks static capture integrity failed: ${key}`);
}
const premiseHeaders=await readFile(evidence.source.evidence.premiseHeadersPath);
const productResponseReceiptBytes=await readFile(evidence.source.evidence.productResponseReceiptPath);
const productResponseReceipt=JSON.parse(productResponseReceiptBytes.toString('utf8'));
if(sha(premiseHeaders)!==banks.premiseHeadersSha256
  ||!/^HTTP\/1\.1 200\b/m.test(premiseHeaders.toString('utf8'))
  ||sha(productResponseReceiptBytes)!==banks.productResponseReceiptSha256
  ||productResponseReceipt.status!==200
  ||productResponseReceipt.uri!==evidence.source.productUrl
  ||productResponseReceipt.sha256!==banks.productCaptureSha256
  ||productResponseReceipt.responseFinishedAt!==evidence.source.productObservedAt){
  throw new Error('Banks retained public premise/product response receipts are missing or not bound to the captured HTTP 200 product.');
}
const banksSignal=buildDelawareBanksStaticCanarySignal(evidence,bible,{nowMs});
const inventory=[...candidateRows.values(),banksSignal];
const drops=buildDrops(inventory,bibleLookup(bible.records),inventory).map(drop=>({...drop,
  previewOnly:true,canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,eligibleForOnSite:true,
  eligibleForDropFeed:true,eligibleForWatch:false,eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false}));
const publicKreston=drops.filter(row=>row.storeId?.startsWith('kreston-wines:'));
const publicBanks=drops.find(row=>row.storeId===banksSignal.storeId);
if(!publicBanks||!isDelawareBanksStaticCanarySignal(publicBanks,{nowMs}))throw new Error('Banks row did not survive the exact preview-only identity gate.');
if(publicKreston.length<1||!publicKreston.every(row=>isCentralCityHiveCanaryOnSiteSignal(row,{nowMs})))throw new Error('Current Kreston rows failed the existing isolated CityHive canary gate.');
const locations=[...sources.map(source=>({id:source.storeId,storeId:source.storeId,state:'DE',name:source.name,storeName:source.name,
  address:source.address,storeAddress:source.address,city:source.city,zip:source.zip,type:'store',searchable:true,hasSignals:drops.some(row=>row.storeId===source.storeId)})),
  {id:banksSignal.storeId,storeId:banksSignal.storeId,state:'DE',name:banksSignal.storeName,storeName:banksSignal.storeName,
    address:banksSignal.storeAddress,storeAddress:banksSignal.storeAddress,city:banksSignal.city,zip:banksSignal.zip,type:'store',searchable:true,hasSignals:true,
    source:banksSignal.source,collectorAttached:true,precision:'store_level',inventoryCapability:'store_level'}];
const output={schemaVersion:1,state:'DE',generatedAt:new Date(nowMs).toISOString(),scope:'local_research_canary_no_production_activation',
  sourceFamily:'kreston-central-cityhive+static-banks-ecwid',researchOnly:true,alertsDisabled:true,deliveryDisabled:true,
  originalSourceClocksPreserved:true,locations,drops,
  sourceReceipts:captures.map(({url,observedAt,sha256,bytes,artifactPath,sourceId,status})=>({sourceId,url,observedAt,sha256,bytes,artifactPath,status})),
  staticSourceEvidence:{retailer:evidence.source.retailer,platform:evidence.source.platform,storeId:evidence.source.storeId,
    premiseUrl:evidence.source.premise.premiseSourceUrl,premiseObservedAt:evidence.source.premise.premiseObservedAt,
    productUrl:evidence.source.productUrl,productObservedAt:evidence.source.productObservedAt,
    premiseCaptureSha256:banks.premiseCaptureSha256,productCaptureSha256:banks.productCaptureSha256,
    productId:evidence.product.productId,sku:evidence.product.sku,canonicalBottleId:evidence.product.reviewedLibraryMapping.canonicalId,
    tier:evidence.product.reviewedLibraryMapping.tier},
  counts:{krestonPremises:sources.length,krestonCurrentRows:publicKreston.length,banksPremises:1,banksCurrentRows:publicBanks?1:0,
    currentRows:drops.length,distinctPremises:new Set(drops.map(row=>row.storeId)).size,allAlertFlagsDisabled:drops.every(row=>row.canAlertAsInventory===false&&row.canAlertAsWatch===false&&row.alertable===false),
    allDeliveryFlagsDisabled:drops.every(row=>row.eligibleForDelivery===false&&row.eligibleForEmail===false&&row.eligibleForSms===false),quantityIsBinaryOnly:drops.every(row=>row.quantity===0&&row.quantityIsExact===false)}};
await mkdir(path.dirname(outputPath),{recursive:true});
await writeFile(outputPath,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({outputPath,counts:output.counts,stores:locations.map(row=>({storeId:row.storeId,name:row.name,hasSignals:row.hasSignals})),products:drops.map(row=>({storeName:row.storeName,canonicalName:row.canonicalName,tier:row.tier,observedAt:row.observedAt,price:row.price}))},null,2));
